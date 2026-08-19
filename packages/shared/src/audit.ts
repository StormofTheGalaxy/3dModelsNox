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
  'telegram.linked',
  'telegram.unlinked',
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
  'strike.revoked',
  'report.created',
  'report.confirmed',
  'report.rejected',
  'report.resolved',

  // профили и портфолио
  'profile.updated',
  'work.published',
  'work.hidden',
  'work.deleted',
  'comment.hidden',
  'template.published',
  'template.unpublished',
  'template.hidden',
  'organization.created',
  'organization.member_invited',
  'organization.member_joined',
  'organization.member_removed',
  'organization.role_changed',
  'push.subscribed',
  'push.unsubscribed',

  // ТЗ и сделки (появятся в фазах 2 и 4)
  'brief.frozen',
  'brief.clarified',
  'brief.shared',
  'order.published',
  'order.archived',
  'order.cancelled',
  'response.submitted',
  'response.accepted',
  'response.rejected',
  'auction.opened',
  'auction.bid_placed',
  'auction.bid_withdrawn',
  'auction.closed',
  'auction.winner_selected',
  'auction.winner_accepted',
  'auction.winner_declined',
  'brief.change_requested',
  'brief.change_resolved',
  'deal.created',
  'deal.plan_confirmed',
  'deal.paused',
  'deal.completed',
  'deal.cancelled',
  'milestone.submitted',
  'milestone.revision',
  'milestone.accepted',
  'payment.claimed',
  'payment.confirmed',
  'payment.flagged',
  'dispute.opened',
  'dispute.resolved',

  // достижения и верификация
  'review.created',
  'review.hidden',
  'achievement.granted_manually',
  'verification.approved',
  'verification.rejected',

  // платформа
  'setting.changed',
  'admin.broadcast_sent',
  'content.updated',
  'legal.updated',
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
  'comment',
  'template',
  'organization',
  'auction',
  'bid',
] as const;

export type AuditTargetType = (typeof AUDIT_TARGET_TYPES)[number];
