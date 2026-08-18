import { notFound } from 'next/navigation';
import type { ReactNode } from 'react';

import { AdminNav } from '@/components/admin/admin-nav';
import { getCurrentUser, isStaff } from '@/server/auth/session';

/**
 * Каркас админки (§4.10).
 *
 * Для постороннего раздела не существует — `notFound`, а не «доступ запрещён»:
 * знание о том, что админка живёт по этому адресу, само по себе лишнее.
 *
 * Проверка здесь не единственная: каждое действие проверяет права ещё раз
 * на сервере (§9 DoD). Layout лишь закрывает раздел целиком.
 */
export default async function AdminLayout({ children }: { children: ReactNode }) {
  const user = await getCurrentUser();
  if (!isStaff(user)) notFound();

  return (
    <div className="mx-auto flex max-w-7xl flex-col gap-6 px-4 py-8 sm:px-6 lg:flex-row">
      <AdminNav role={user!.role} />
      <div className="min-w-0 flex-1">{children}</div>
    </div>
  );
}
