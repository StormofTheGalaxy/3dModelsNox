/**
 * Действия аудит-лога (§2.4). Список пополняется по мере появления модулей;
 * тип-union не даёт записать в лог произвольную строку.
 */
export const AUDIT_ACTIONS = [
  // аутентификация и аккаунты
  'user.registered',
  'user.email_verified',
  'user.login',
  'user.login_failed',
  'user.logout',
  'user.password_reset_requested',
  'user.password_reset_completed',
  'user.locale_changed',
  'user.theme_changed',
  'user.deleted',

  // инвайты
  'invite.issued',
  'invite.used',
  'invite.granted_by_admin',
  'waitlist.joined',

  // модерация и роли
  'user.banned',
  'user.shadow_banned',
  'user.unbanned',
  'user.role_changed',
  'user.level_changed',
  'strike.issued',
  'report.created',
  'report.resolved',

  // профили и портфолио
  'profile.updated',
  'work.published',
  'work.hidden',
  'work.deleted',

  // ТЗ и сделки (появятся в фазах 2 и 4)
  'brief.frozen',
  'brief.shared',
  'order.published',
  'order.archived',
  'order.cancelled',
  'response.submitted',
  'response.accepted',
  'response.rejected',
  'brief.change_requested',
  'brief.change_resolved',
  'payment.claimed',
  'payment.confirmed',
  'dispute.opened',
  'dispute.resolved',

  // достижения и верификация
  'achievement.granted_manually',
  'verification.approved',
  'verification.rejected',

  // платформа
  'setting.changed',
  'admin.broadcast_sent',
] as const;

export type AuditAction = (typeof AUDIT_ACTIONS)[number];

export const AUDIT_TARGET_TYPES = [
  'user',
  'invite',
  'brief',
  'order',
  'response',
  'message',
  'deal',
  'milestone',
  'payment',
  'delivery',
  'dispute',
  'review',
  'work',
  'report',
  'setting',
  'waitlist',
] as const;

export type AuditTargetType = (typeof AUDIT_TARGET_TYPES)[number];
