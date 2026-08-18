'use client';

import { motion } from 'framer-motion';
import { useMemo } from 'react';

/**
 * Конфетти для тоста «Достижение получено!» (§4.8, §5.3).
 *
 * Своя реализация на Framer Motion вместо библиотеки: нужно двадцать
 * частиц на полсекунды, а любой готовый пакет тянет canvas-рантайм ради
 * этого одного эффекта.
 *
 * Позиции детерминированы от индекса, а не случайны: конфетти рендерится
 * и на сервере, и в браузере, и расхождение сломало бы гидратацию.
 */

const COLORS = ['var(--pf-accent)', 'var(--pf-success)', 'var(--pf-warning)', 'var(--pf-accent-2)'];

export function Confetti({ pieces = 24 }: { pieces?: number }) {
  const particles = useMemo(
    () =>
      Array.from({ length: pieces }, (_, index) => {
        // Простая детерминированная «псевдослучайность» от индекса.
        const spread = ((index * 37) % 100) - 50;
        const delay = ((index * 13) % 20) / 100;
        const rotation = ((index * 53) % 360) - 180;

        return {
          id: index,
          x: spread,
          delay,
          rotation,
          color: COLORS[index % COLORS.length],
        };
      }),
    [pieces],
  );

  return (
    <div aria-hidden className="pointer-events-none absolute inset-0 overflow-hidden">
      {particles.map((particle) => (
        <motion.span
          key={particle.id}
          className="absolute top-1/2 left-1/2 block size-1.5 rounded-[1px]"
          style={{ backgroundColor: particle.color }}
          initial={{ x: 0, y: 0, opacity: 1, rotate: 0 }}
          animate={{
            x: particle.x,
            y: [0, -28, 40],
            opacity: [1, 1, 0],
            rotate: particle.rotation,
          }}
          transition={{ duration: 0.9, delay: particle.delay, ease: 'easeOut' }}
        />
      ))}
    </div>
  );
}
