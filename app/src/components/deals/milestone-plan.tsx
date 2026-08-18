'use client';

import { Check, Plus, Trash2 } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useActionState, useState, useTransition } from 'react';

import { PLAN_TEMPLATES, splitByTemplate, type PlanTemplateKey } from '@polyforge/shared';

import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input, Label } from '@/components/ui/input';
import { toast } from '@/components/ui/toast';
import { useRouter } from '@/i18n/navigation';
import { confirmMilestonePlan, saveMilestonePlan } from '@/server/actions/deals';
import { idleState } from '@/server/actions/types';
import type { MilestoneView } from '@/components/deals/types';

/**
 * Согласование плана этапов (§4.6).
 *
 * Предложить план может любая сторона, работа начинается только после
 * подтверждения обеими: план — это и есть договор о том, за что платят.
 */

interface Row {
  title: string;
  description: string;
  amount: number;
  dueDate: string;
}

export function MilestonePlan({
  dealId,
  role,
  price,
  currency,
  milestones,
  confirmedByCustomer,
  confirmedByDesigner,
}: {
  dealId: string;
  role: 'customer' | 'designer';
  price: number;
  currency: string;
  milestones: MilestoneView[];
  confirmedByCustomer: boolean;
  confirmedByDesigner: boolean;
}) {
  const t = useTranslations('deals.plan');
  const tRoot = useTranslations();
  const router = useRouter();

  const [rows, setRows] = useState<Row[]>(() =>
    milestones.length > 0
      ? milestones.map((milestone) => ({
          title: milestone.title,
          description: milestone.description ?? '',
          amount: milestone.amount,
          dueDate: milestone.dueDate ? milestone.dueDate.slice(0, 10) : '',
        }))
      : [{ title: '', description: '', amount: price, dueDate: '' }],
  );

  const [state, action, pending] = useActionState(saveMilestonePlan, idleState);
  const [confirming, startConfirm] = useTransition();

  const total = rows.reduce((sum, row) => sum + (Number.isFinite(row.amount) ? row.amount : 0), 0);
  const balanced = total === price;

  const mine = role === 'customer' ? confirmedByCustomer : confirmedByDesigner;
  const theirs = role === 'customer' ? confirmedByDesigner : confirmedByCustomer;

  function applyTemplate(template: PlanTemplateKey) {
    const amounts = splitByTemplate(price, template);
    setRows(
      amounts.map((amount, index) => ({
        title: rows[index]?.title ?? '',
        description: rows[index]?.description ?? '',
        amount,
        dueDate: rows[index]?.dueDate ?? '',
      })),
    );
  }

  function update(index: number, patch: Partial<Row>) {
    setRows((current) => current.map((row, i) => (i === index ? { ...row, ...patch } : row)));
  }

  function confirm() {
    startConfirm(async () => {
      const result = await confirmMilestonePlan(dealId);
      if (!result.ok) {
        toast.error(tRoot(result.error ?? 'errors.generic'));
        return;
      }
      router.refresh();
    });
  }

  return (
    <Card>
      <CardContent className="flex flex-col gap-4 p-5">
        <div>
          <h2 className="text-lg font-bold">{t('title')}</h2>
          <p className="mt-1 text-sm text-fg-muted">{t('description')}</p>
        </div>

        {milestones.length > 0 && mine ? (
          <Alert tone="success">{theirs ? t('bothConfirmed') : t('waitingOther')}</Alert>
        ) : null}

        {milestones.length > 0 && !mine && theirs ? (
          <Alert tone="warning">{t('otherConfirmed')}</Alert>
        ) : null}

        <div className="flex flex-wrap gap-2">
          {(Object.keys(PLAN_TEMPLATES) as PlanTemplateKey[]).map((template) => (
            <Button
              key={template}
              type="button"
              size="sm"
              variant="secondary"
              onClick={() => applyTemplate(template)}
            >
              {t(`templates.${template}`)}
            </Button>
          ))}
        </div>

        <form action={action} className="flex flex-col gap-4">
          <input type="hidden" name="dealId" value={dealId} />
          <input
            type="hidden"
            name="milestones"
            value={JSON.stringify(
              rows.map((row) => ({
                title: row.title,
                description: row.description,
                amount: Math.round(row.amount) || 0,
                dueDate: row.dueDate || null,
              })),
            )}
          />

          <ol className="flex flex-col gap-3">
            {rows.map((row, index) => (
              <li key={index} className="rounded-[var(--radius-card)] bg-surface-2 p-4">
                <div className="mb-2 flex items-center justify-between gap-2">
                  <span className="text-sm font-medium">{t('stage', { number: index + 1 })}</span>
                  {rows.length > 1 ? (
                    <Button
                      type="button"
                      size="sm"
                      variant="ghost"
                      onClick={() => setRows((current) => current.filter((_, i) => i !== index))}
                      aria-label={t('remove')}
                    >
                      <Trash2 aria-hidden className="size-4" />
                    </Button>
                  ) : null}
                </div>

                <div className="flex flex-col gap-3">
                  <div>
                    <Label htmlFor={`title-${index}`}>{t('stageTitle')}</Label>
                    <Input
                      id={`title-${index}`}
                      value={row.title}
                      onChange={(event) => update(index, { title: event.target.value })}
                      maxLength={120}
                      required
                    />
                  </div>

                  <div className="grid gap-3 sm:grid-cols-2">
                    <div>
                      <Label htmlFor={`amount-${index}`}>
                        {t('amount', { currency })}
                      </Label>
                      <Input
                        id={`amount-${index}`}
                        type="number"
                        min={1}
                        value={row.amount}
                        onChange={(event) =>
                          update(index, { amount: Number(event.target.value) || 0 })
                        }
                        required
                      />
                    </div>

                    <div>
                      <Label htmlFor={`due-${index}`}>{t('dueDate')}</Label>
                      <Input
                        id={`due-${index}`}
                        type="date"
                        value={row.dueDate}
                        onChange={(event) => update(index, { dueDate: event.target.value })}
                      />
                    </div>
                  </div>
                </div>
              </li>
            ))}
          </ol>

          <Button
            type="button"
            variant="secondary"
            size="sm"
            onClick={() =>
              setRows((current) => [...current, { title: '', description: '', amount: 0, dueDate: '' }])
            }
          >
            <Plus aria-hidden className="size-4" />
            {t('addStage')}
          </Button>

          <p className={balanced ? 'text-sm text-fg-muted' : 'text-sm text-[var(--pf-danger)]'}>
            {t('sum', { total, price, currency })}
          </p>

          {state.status === 'error' && state.message ? (
            <Alert tone="danger">{tRoot(state.message, state.values)}</Alert>
          ) : null}

          <div className="flex flex-wrap gap-2">
            <Button type="submit" loading={pending} disabled={!balanced}>
              {t('save')}
            </Button>

            {milestones.length > 0 && !mine ? (
              <Button type="button" variant="secondary" loading={confirming} onClick={confirm}>
                <Check aria-hidden className="size-4" />
                {t('confirm')}
              </Button>
            ) : null}
          </div>
        </form>
      </CardContent>
    </Card>
  );
}
