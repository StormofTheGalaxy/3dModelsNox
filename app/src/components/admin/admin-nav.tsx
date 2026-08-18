'use client';

import {
  BarChart3,
  ClipboardList,
  FileText,
  Flag,
  Gavel,
  Handshake,
  Megaphone,
  Receipt,
  ScrollText,
  Settings2,
  ShieldCheck,
  Ticket,
  Users,
} from 'lucide-react';
import { useTranslations } from 'next-intl';
import { usePathname } from 'next/navigation';

import { Link } from '@/i18n/navigation';
import { cn } from '@/lib/utils';

/**
 * Навигация админки (§4.10).
 *
 * Разделы, доступные только суперадмину (настройки, рассылки, правовые
 * документы), скрыты от модератора и арбитра: это управление платформой,
 * а не разбор жалоб.
 */

const SECTIONS = [
  { href: '/admin', key: 'dashboard', icon: BarChart3, adminOnly: false },
  { href: '/admin/users', key: 'users', icon: Users, adminOnly: false },
  { href: '/admin/orders', key: 'orders', icon: ClipboardList, adminOnly: false },
  { href: '/admin/deals', key: 'deals', icon: Handshake, adminOnly: false },
  { href: '/admin/payments', key: 'payments', icon: Receipt, adminOnly: false },
  { href: '/admin/disputes', key: 'disputes', icon: Gavel, adminOnly: false },
  { href: '/admin/reports', key: 'reports', icon: Flag, adminOnly: false },
  { href: '/admin/verification', key: 'verification', icon: ShieldCheck, adminOnly: false },
  { href: '/admin/invites', key: 'invites', icon: Ticket, adminOnly: true },
  { href: '/admin/content', key: 'content', icon: FileText, adminOnly: true },
  { href: '/admin/broadcasts', key: 'broadcasts', icon: Megaphone, adminOnly: true },
  { href: '/admin/settings', key: 'settings', icon: Settings2, adminOnly: true },
  { href: '/admin/audit', key: 'audit', icon: ScrollText, adminOnly: false },
] as const;

export function AdminNav({ role }: { role: string }) {
  const t = useTranslations('admin.nav');
  const pathname = usePathname();

  const visible = SECTIONS.filter((section) => !section.adminOnly || role === 'admin');

  return (
    <nav
      aria-label={t('label')}
      className="flex gap-1 overflow-x-auto rounded-[var(--radius-card)] bg-surface-2 p-1 lg:w-56 lg:shrink-0 lg:flex-col lg:overflow-visible"
    >
      {visible.map((section) => {
        const Icon = section.icon;
        // Дашборд активен только на точном совпадении: иначе он подсвечен всегда.
        const active =
          section.href === '/admin'
            ? pathname.endsWith('/admin')
            : pathname.includes(section.href);

        return (
          <Link
            key={section.href}
            href={section.href}
            aria-current={active ? 'page' : undefined}
            className={cn(
              'flex items-center gap-2 rounded-[calc(var(--radius-card)-0.25rem)] px-3 py-2 text-sm whitespace-nowrap transition-colors',
              active ? 'bg-surface font-medium text-fg' : 'text-fg-muted hover:text-fg',
            )}
          >
            <Icon aria-hidden className="size-4" />
            {t(section.key)}
          </Link>
        );
      })}
    </nav>
  );
}
