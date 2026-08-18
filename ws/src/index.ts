import { createServer } from 'node:http';

import { createAdapter } from '@socket.io/redis-adapter';
import { Redis } from 'ioredis';
import { jwtVerify } from 'jose';
import { Server } from 'socket.io';

import { REALTIME_CHANNELS } from '@polyforge/shared';

/**
 * Реалтайм-сервис (§2.1): чат, уведомления, статусы.
 *
 * Авторизация по JWT от основного приложения, персональные комнаты и
 * ретрансляция событий из Redis pub/sub. С фазы 4 добавлены комнаты сделок:
 * чат, «печатает…» и присутствие собеседника.
 *
 * Право входа в комнату сервис не проверяет сам — у него нет доступа к БД.
 * Событие уходит только тем участникам, которых назвало приложение в поле
 * `userIds`, поэтому попадание в комнату по чужому id ничего не даёт.
 */

const PORT = Number(process.env.WS_PORT ?? 4000);
const REDIS_URL = process.env.REDIS_URL ?? 'redis://localhost:6379';
const APP_ORIGIN = process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000';
const JWT_SECRET = process.env.AUTH_JWT_SECRET;

if (!JWT_SECRET || JWT_SECRET.length < 32) {
  throw new Error('AUTH_JWT_SECRET обязателен и должен быть не короче 32 символов');
}

const secret = new TextEncoder().encode(JWT_SECRET);

const httpServer = createServer((request, response) => {
  if (request.url === '/health') {
    response.writeHead(200, { 'Content-Type': 'application/json' });
    response.end(JSON.stringify({ status: 'ok', connections: io.engine.clientsCount }));
    return;
  }

  response.writeHead(404);
  response.end();
});

const io = new Server(httpServer, {
  cors: { origin: APP_ORIGIN, credentials: true },
  path: '/socket.io',
});

// Отдельные клиенты: adapter требует, чтобы подписчик не использовался для команд.
const pubClient = new Redis(REDIS_URL, { maxRetriesPerRequest: null });
const subClient = pubClient.duplicate();
const eventsClient = pubClient.duplicate();

io.adapter(createAdapter(pubClient, subClient));

/** Handshake: клиент отдаёт токен, полученный от app через /api/auth/ws-token. */
io.use(async (socket, next) => {
  const token = socket.handshake.auth?.token as string | undefined;

  if (!token) {
    next(new Error('unauthorized'));
    return;
  }

  try {
    const { payload } = await jwtVerify(token, secret, {
      issuer: 'polyforge',
      audience: 'polyforge-ws',
    });

    if (!payload.sub) {
      next(new Error('unauthorized'));
      return;
    }

    socket.data.userId = payload.sub;
    socket.data.role = String(payload.role ?? 'user');
    next();
  } catch {
    next(new Error('unauthorized'));
  }
});

io.on('connection', (socket) => {
  const userId = socket.data.userId as string;

  // Персональная комната: приложение шлёт событие по userId, не зная сокетов.
  void socket.join(`user:${userId}`);

  socket.on('deal:join', (dealId: unknown) => {
    if (typeof dealId !== 'string' || !dealId) return;
    void socket.join(`deal:${dealId}`);
    socket.to(`deal:${dealId}`).emit('presence', { userId, online: true });
  });

  socket.on('deal:leave', (dealId: unknown) => {
    if (typeof dealId !== 'string' || !dealId) return;
    void socket.leave(`deal:${dealId}`);
    socket.to(`deal:${dealId}`).emit('presence', { userId, online: false });
  });

  socket.on('deal:typing', (payload: unknown) => {
    const dealId = (payload as { dealId?: unknown } | null)?.dealId;
    if (typeof dealId !== 'string' || !socket.rooms.has(`deal:${dealId}`)) return;
    socket.to(`deal:${dealId}`).emit('typing', { userId });
  });

  socket.on('disconnect', () => {
    for (const room of socket.rooms) {
      if (room.startsWith('deal:')) {
        socket.to(room).emit('presence', { userId, online: false });
      }
    }
  });
});

/**
 * Мост Redis → socket.io. Приложение публикует событие в канал, ws доставляет
 * его в комнату получателя. Так app не держит собственных сокетов.
 */
async function subscribeToAppEvents(): Promise<void> {
  const channels = Object.values(REALTIME_CHANNELS);
  await eventsClient.subscribe(...channels);

  eventsClient.on('message', (channel: string, raw: string) => {
    try {
      const event = JSON.parse(raw) as {
        userId?: string;
        userIds?: string[];
        type?: string;
        payload?: unknown;
      };

      if (!event.type) return;

      // Адресаты всегда персональные: комната сделки нужна только для
      // «печатает…» и присутствия, где утечки содержимого нет.
      const recipients = event.userIds ?? (event.userId ? [event.userId] : []);
      if (recipients.length === 0) return;

      for (const recipient of recipients) {
        io.to(`user:${recipient}`).emit(event.type, event.payload ?? null);
      }
    } catch (error) {
      console.error('[ws] некорректное событие в канале', channel, error);
    }
  });
}

void subscribeToAppEvents();

httpServer.listen(PORT, () => {
  console.info(`[ws] слушает :${PORT}, origin ${APP_ORIGIN}`);
});

async function shutdown(signal: string): Promise<void> {
  console.info(`[ws] ${signal} — останавливаюсь`);
  io.close();
  await Promise.allSettled([pubClient.quit(), subClient.quit(), eventsClient.quit()]);
  httpServer.close(() => process.exit(0));
}

process.on('SIGTERM', () => void shutdown('SIGTERM'));
process.on('SIGINT', () => void shutdown('SIGINT'));
