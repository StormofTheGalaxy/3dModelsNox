import type { ReactNode } from 'react';

/** Общая рамка страниц входа/регистрации: узкая колонка по центру. */
export default function AuthLayout({ children }: { children: ReactNode }) {
  return (
    <div className="pf-aurora relative flex min-h-[calc(100vh-4rem)] items-start justify-center overflow-hidden px-4 py-12 sm:items-center sm:py-16">
      <div className="relative w-full max-w-md">{children}</div>
    </div>
  );
}
