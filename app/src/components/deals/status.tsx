import type { DealStatus, MilestoneStatus } from '@polyforge/shared';

/**
 * Цвета статусов. Вынесены отдельно, потому что одни и те же статусы
 * показываются в списке сделок, в панели и в таймлайне этапов.
 */

type Tone = 'accent' | 'neutral' | 'success' | 'warning' | 'danger' | 'outline';

export const DEAL_STATUS_TONE: Record<DealStatus, Tone> = {
  plan_agreement: 'warning',
  active: 'accent',
  paused: 'neutral',
  in_dispute: 'danger',
  completed: 'success',
  cancelled: 'neutral',
};

export const MILESTONE_STATUS_TONE: Record<MilestoneStatus, Tone> = {
  pending: 'outline',
  in_work: 'accent',
  submitted: 'warning',
  revision: 'warning',
  accepted: 'accent',
  paid_claimed: 'warning',
  paid_confirmed: 'success',
};
