import { createServer } from 'node:http';

import { createAdapter } from '@socket.io/redis-adapter';
import { Redis } from 'ioredis';
import { jwtVerify } from 'jose';
import { Server } from 'socket.io';

import { REALTIME_CHANNELS } from '@polyforge/shared';

/**
 * Реалтайм-сервис (§2.1): чат, уведомления, статусы.
 *
 * В фазе 0 поднят каркас: авторизация по JWT от основного приложения,
 * персональные комнаты и ретрансляция событий из Redis pub/sub.
 * Логика чата и присутствия приходит в фазе 4.
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

  socket.on('disconnect', () => {
    // Присутствие и «печатает…» появятся вместе с чатом в фазе 4.
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
      const event = JSON.parse(raw) as { userId?: string; type?: string; payload?: unknown };
      if (!event.userId || !event.type) return;

      io.to(`user:${event.userId}`).emit(event.type, event.payload ?? null);
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
