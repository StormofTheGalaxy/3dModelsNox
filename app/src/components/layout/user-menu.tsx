'use client';

import * as DropdownMenu from '@radix-ui/react-dropdown-menu';
import {
  ClipboardList,
  FileText,
  Gavel,
  Handshake,
  LayoutDashboard,
  LogOut,
  Send,
  Settings,
  Shield,
  Ticket,
} from 'lucide-react';
import NextLink from 'next/link';
import { useTranslations } from 'next-intl';
import { useRouter } from 'next/navigation';
import { useTransition } from 'react';

import { Link } from '@/i18n/navigation';
import { logoutAction } from '@/server/actions/auth';
import { cn } from '@/lib/utils';

const itemClass = cn(
  'flex cursor-pointer items-center gap-2.5 rounded-lg px-2.5 py-2 text-sm outline-none',
  'data-[highlighted]:bg-surface-2',
);

export function UserMenu({
  nickname,
  isStaff,
  invitesLeft,
}: {
  nickname: string;
  isStaff: boolean;
  invitesLeft: number;
}) {
  const t = useTranslations('nav');
  const router = useRouter();
  const [, startTransition] = useTransition();

  function logout() {
    startTransition(async () => {
      await logoutAction();
      router.push('/');
      router.refresh();
    });
  }

  return (
    <DropdownMenu.Root>
      <DropdownMenu.Trigger
        className={cn(
          'flex h-9 items-center gap-2 rounded-[var(--radius-control)] pl-1 pr-2.5',
          'transition-colors hover:bg-surface-2',
        )}
      >
        <span
          className="flex size-7 items-center justify-center rounded-full pf-gradient text-xs font-bold text-white"
          aria-hidden
        >
          {nickname.slice(0, 1).toUpperCase()}
        </span>
        <span className="hidden max-w-28 truncate text-sm font-medium sm:block">{nickname}</span>
      </DropdownMenu.Trigger>

      <DropdownMenu.Portal>
        <DropdownMenu.Content
          align="end"
          sideOffset={8}
          className={cn(
            'z-50 min-w-52 rounded-[var(--radius-control)] border border-[var(--pf-border)]',
            'bg-surface p-1 shadow-[var(--shadow-soft)]',
            'data-[state=open]:[animation:pf-fade-in_120ms_var(--ease-out-quick)]',
          )}
        >
          <DropdownMenu.Item asChild className={itemClass}>
            <Link href="/dashboard">
              <LayoutDashboard className="size-4 text-fg-muted" aria-hidden />
              {t('dashboard')}
            </Link>
          </DropdownMenu.Item>

          <DropdownMenu.Item asChild className={itemClass}>
            <Link href="/orders/mine">
              <ClipboardList className="size-4 text-fg-muted" aria-hidden />
              {t('myOrders')}
            </Link>
          </DropdownMenu.Item>

          <DropdownMenu.Item asChild className={itemClass}>
            <Link href="/deals">
              <Handshake className="size-4 text-fg-muted" aria-hidden />
              {t('deals')}
            </Link>
          </DropdownMenu.Item>

          <DropdownMenu.Item asChild className={itemClass}>
            <Link href="/responses">
              <Send className="size-4 text-fg-muted" aria-hidden />
              {t('myResponses')}
            </Link>
          </DropdownMenu.Item>

          <DropdownMenu.Item asChild className={itemClass}>
            <Link href="/briefs">
              <FileText className="size-4 text-fg-muted" aria-hidden />
              {t('briefs')}
            </Link>
          </DropdownMenu.Item>

          <DropdownMenu.Item asChild className={itemClass}>
            <Link href="/invites">
              <Ticket className="size-4 text-fg-muted" aria-hidden />
              <span className="flex-1">{t('invites')}</span>
              {invitesLeft > 0 ? (
                <span className="rounded-full bg-accent-soft px-1.5 text-xs font-semibold text-accent">
                  {invitesLeft}
                </span>
              ) : null}
            </Link>
          </DropdownMenu.Item>

          <DropdownMenu.Item asChild className={itemClass}>
            <Link href="/settings">
              <Settings className="size-4 text-fg-muted" aria-hidden />
              {t('settings')}
            </Link>
          </DropdownMenu.Item>

          {isStaff ? (
            <>
              <DropdownMenu.Item asChild className={itemClass}>
                <Link href="/admin/disputes">
                  <Gavel className="size-4 text-fg-muted" aria-hidden />
                  {t('disputes')}
                </Link>
              </DropdownMenu.Item>

              <DropdownMenu.Item asChild className={itemClass}>
                {/* Админка живёт вне языковых префиксов — обычный next/link. */}
                <NextLink href="/admin">
                  <Shield className="size-4 text-fg-muted" aria-hidden />
                  {t('admin')}
                </NextLink>
              </DropdownMenu.Item>
            </>
          ) : null}

          <DropdownMenu.Separator className="my-1 h-px bg-[var(--pf-border)]" />

          <DropdownMenu.Item onSelect={logout} className={itemClass}>
            <LogOut className="size-4 text-fg-muted" aria-hidden />
            {t('logout')}
          </DropdownMenu.Item>
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  );
}
