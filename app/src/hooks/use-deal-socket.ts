'use client';

import { useEffect, useRef, useState } from 'react';
import { io, type Socket } from 'socket.io-client';

/**
 * Подключение к комнате сделки (§4.7).
 *
 * Токен короткоживущий и берётся у приложения перед подключением: сессия
 * остаётся серверной, наружу уходит только пятиминутный JWT.
 *
 * Реалтайм здесь — украшение, а не источник правды: если ws недоступен,
 * сообщения всё равно лежат в БД и появятся после обновления страницы.
 */
export interface DealSocketHandlers {
  onMessage?: (payload: unknown) => void;
  onTyping?: (payload: { userId: string }) => void;
  onPresence?: (payload: { userId: string; online: boolean }) => void;
}

export function useDealSocket(dealId: string, handlers: DealSocketHandlers) {
  const [connected, setConnected] = useState(false);
  const socketRef = useRef<Socket | null>(null);
  // Обработчики меняются на каждый рендер — держим их в ref, чтобы не
  // пересоздавать соединение на каждое изменение колбэков.
  const handlersRef = useRef(handlers);

  useEffect(() => {
    handlersRef.current = handlers;
  }, [handlers]);

  useEffect(() => {
    let socket: Socket | null = null;
    let cancelled = false;

    async function connect() {
      const response = await fetch('/api/auth/ws-token', { method: 'POST' });
      if (!response.ok || cancelled) return;

      const { token } = (await response.json()) as { token: string };
      if (cancelled) return;

      socket = io(process.env.NEXT_PUBLIC_WS_URL ?? 'http://localhost:4000', {
        auth: { token },
        transports: ['websocket'],
      });

      socketRef.current = socket;

      socket.on('connect', () => {
        setConnected(true);
        socket?.emit('deal:join', dealId);
      });

      socket.on('disconnect', () => setConnected(false));
      socket.on('message', (payload: unknown) => handlersRef.current.onMessage?.(payload));
      socket.on('typing', (payload: { userId: string }) => handlersRef.current.onTyping?.(payload));
      socket.on('presence', (payload: { userId: string; online: boolean }) =>
        handlersRef.current.onPresence?.(payload),
      );
    }

    void connect().catch(() => {
      // ws не поднялся — работаем без реалтайма.
    });

    return () => {
      cancelled = true;
      socket?.emit('deal:leave', dealId);
      socket?.disconnect();
      socketRef.current = null;
    };
  }, [dealId]);

  function emitTyping() {
    socketRef.current?.emit('deal:typing', { dealId });
  }

  return { connected, emitTyping };
}
