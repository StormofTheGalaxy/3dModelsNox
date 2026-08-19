import { getTranslations } from 'next-intl/server';

import type { Locale, RoleContext, Theme } from '@polyforge/shared';

import { Link } from '@/i18n/navigation';
import { Button } from '@/components/ui/button';
import { LocaleSwitcher } from '@/components/layout/locale-switcher';
import { RoleSwitcher } from '@/components/layout/role-switcher';
import { UserMenu } from '@/components/layout/user-menu';
import { NotificationBell } from '@/components/notifications/notification-bell';
import { ThemeToggle } from '@/components/theme/theme-toggle';
import { getCurrentUser, isStaff } from '@/server/auth/session';
import { countUnread } from '@/server/notifications';
import { organizationsEnabled } from '@/server/organizations';
import { cn } from '@/lib/utils';

const NAV_LINKS = [
  { href: '/works', key: 'works' },
  { href: '/designers', key: 'designers' },
  { href: '/orders', key: 'orders' },
  { href: '/top', key: 'top' },
] as const;

export async function Header({ locale, theme }: { locale: Locale; theme: Theme }) {
  const [t, user] = await Promise.all([getTranslations('nav'), getCurrentUser()]);

  const roleContext: RoleContext = user?.lastRoleContext ?? 'designer';
  const [unread, organizationsOn] = user
    ? await Promise.all([countUnread(user.id), organizationsEnabled()])
    : [0, false];

  return (
    <header
      className={cn(
        'sticky top-0 z-40 border-b border-[var(--pf-border)]',
        'bg-[color-mix(in_oklab,var(--pf-bg)_82%,transparent)] backdrop-blur-xl',
      )}
    >
      <div className="mx-auto flex h-16 max-w-6xl items-center gap-3 px-4 sm:px-6">
        <Link href="/" className="flex shrink-0 items-center gap-2 font-bold">
          <span className="size-6 rounded-lg pf-gradient" aria-hidden />
          <span className="hidden sm:inline">PolyForge</span>
        </Link>

        <nav className="ml-2 hidden items-center gap-1 md:flex" aria-label={t('openMenu')}>
          {NAV_LINKS.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              className={cn(
                'rounded-[var(--radius-control)] px-3 py-2 text-sm font-medium text-fg-muted',
                'transition-colors hover:bg-surface-2 hover:text-fg',
              )}
            >
              {t(link.key)}
            </Link>
          ))}
        </nav>

        <div className="ml-auto flex items-center gap-1.5">
          {user ? <RoleSwitcher current={roleContext} /> : null}
          {user ? <NotificationBell unread={unread} /> : null}

          <LocaleSwitcher current={locale} />
          <ThemeToggle current={theme} />

          {user ? (
            <UserMenu
              nickname={user.nickname}
              isStaff={isStaff(user)}
              invitesLeft={user.invitesLeft}
              organizationsOn={organizationsOn}
            />
          ) : (
            <div className="flex items-center gap-1.5">
              <Button asChild variant="ghost" size="sm">
                <Link href="/login">{t('login')}</Link>
              </Button>
              <Button asChild size="sm">
                <Link href="/register">{t('register')}</Link>
              </Button>
            </div>
          )}
        </div>
      </div>
    </header>
  );
}
