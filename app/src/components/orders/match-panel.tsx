'use client';

import { BadgeCheck, Clock, Sparkles, Star, UserPlus, Users } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useState, useTransition } from 'react';

import { Alert } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { toast } from '@/components/ui/toast';
import { Link } from '@/i18n/navigation';
import { matchDesignersForOrder } from '@/server/actions/ai';
import { inviteDesigner } from '@/server/actions/orders';
import { cn } from '@/lib/utils';

/**
 * Подбор исполнителей под заказ (§4.5, ИИ-слой — post-MVP №4).
 *
 * Список собирается запросом по тегам; при включённом флаге модель его
 * упорядочивает и объясняет. Разница видна пользователю: без объяснений
 * панель честно называет это подбором по тегам профиля.
 */

interface Designer {
  id: string;
  nickname: string;
  avatarUrl: string | null;
  level: string;
  rating: number;
  ratingCount: number;
  ordersCompleted: number;
  onTimePct: number | null;
  specializations: string[];
  styles: string[];
  score: number;
  reason: string;
  invited: boolean;
}

export function MatchPanel({ orderId }: { orderId: string }) {
  const t = useTranslations('orders.match');
  const tTax = useTranslations('taxonomy');
  const tRoot = useTranslations();

  const [designers, setDesigners] = useState<Designer[] | null>(null);
  const [explained, setExplained] = useState(false);
  const [pending, startTransition] = useTransition();
  const [inviting, startInvite] = useTransition();

  function run() {
    startTransition(async () => {
      const result = await matchDesignersForOrder(orderId);

      if (!result.ok) {
        toast.error(tRoot(result.error, result.values));
        return;
      }

      setDesigners(result.designers);
      setExplained(result.explained);
    });
  }

  function invite(designer: Designer) {
    startInvite(async () => {
      const result = await inviteDesigner(orderId, designer.nickname);

      if (!result.ok) {
        toast.error(tRoot(result.error ?? 'errors.generic'));
        return;
      }

      setDesigners(
        (current) =>
          current?.map((item) => (item.id === designer.id ? { ...item, invited: true } : item)) ??
          null,
      );
      toast.success(t('invited', { nickname: designer.nickname }));
    });
  }

  return (
    <Card>
      <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-3">
        <CardTitle className="flex items-center gap-2">
          <Users aria-hidden className="size-5 text-accent" />
          {t('title')}
        </CardTitle>

        {designers !== null ? (
          <Badge variant={explained ? 'accent' : 'neutral'}>
            {explained ? t('byAI') : t('byTags')}
          </Badge>
        ) : null}
      </CardHeader>

      <CardContent className="flex flex-col gap-4">
        <p className="text-sm text-fg-muted">{t('hint')}</p>

        {designers === null ? (
          <Button className="sm:w-fit" loading={pending} onClick={run}>
            <Sparkles aria-hidden />
            {t('run')}
          </Button>
        ) : designers.length === 0 ? (
          <Alert tone="info">{t('empty')}</Alert>
        ) : (
          <ul className="flex flex-col gap-2">
            {designers.map((designer) => (
              <li
                key={designer.id}
                // На телефоне карточка складывается в две строки: иначе
                // счётчик с кнопкой съедают ширину, ник ужимается до трёх
                // букв, а объяснение вытягивается в столбец.
                className="flex flex-col gap-3 rounded-[var(--radius-card)] border border-[var(--pf-border)] px-4 py-3 sm:flex-row sm:items-start sm:justify-between"
              >
                <div className="flex min-w-0 flex-1 gap-3">
                  <span className="size-10 shrink-0 overflow-hidden rounded-[var(--radius-control)] bg-surface-2">
                    {designer.avatarUrl ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={designer.avatarUrl} alt="" className="size-full object-cover" />
                    ) : (
                      <span className="pf-gradient flex size-full items-center justify-center text-sm font-bold text-white">
                        {designer.nickname.slice(0, 1).toUpperCase()}
                      </span>
                    )}
                  </span>

                  <div className="flex min-w-0 flex-col gap-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <Link
                        href={`/designers/${designer.nickname}`}
                        className="truncate font-medium hover:text-accent"
                      >
                        @{designer.nickname}
                      </Link>

                      <Badge variant="neutral">{tTax(`level.${designer.level}`)}</Badge>

                      {designer.ratingCount > 0 ? (
                        <span className="inline-flex items-center gap-1 text-xs text-fg-muted">
                          <Star className="size-3 fill-current text-[var(--pf-warning)]" aria-hidden />
                          {designer.rating.toFixed(1)}
                        </span>
                      ) : null}

                      {designer.onTimePct !== null ? (
                        <span className="inline-flex items-center gap-1 text-xs text-fg-muted">
                          <Clock className="size-3" aria-hidden />
                          {designer.onTimePct}%
                        </span>
                      ) : null}
                    </div>

                    {/* Объяснение от модели. Без флага его нет, и вместо
                        пустой строки показываем теги — по ним и подбирали. */}
                    {designer.reason ? (
                      <p className="text-xs text-fg-muted">{designer.reason}</p>
                    ) : (
                      <p className="flex flex-wrap gap-1">
                        {designer.specializations.slice(0, 3).map((item) => (
                          <Badge key={item} variant="outline">
                            {tTax(`specialization.${item}`)}
                          </Badge>
                        ))}
                      </p>
                    )}
                  </div>
                </div>

                <div className="flex shrink-0 items-center justify-end gap-3">
                  <span
                    className={cn(
                      'font-mono text-sm tabular-nums',
                      designer.score >= 70 ? 'text-accent' : 'text-fg-muted',
                    )}
                    title={t('scoreHint')}
                  >
                    {designer.score}
                  </span>

                  {designer.invited ? (
                    <Badge variant="success">
                      <BadgeCheck className="size-3" aria-hidden />
                      {t('alreadyInvited')}
                    </Badge>
                  ) : (
                    <Button size="sm" variant="secondary" loading={inviting} onClick={() => invite(designer)}>
                      <UserPlus aria-hidden />
                      {t('invite')}
                    </Button>
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}

        {designers !== null && designers.length > 0 ? (
          <p className="text-xs text-fg-muted">
            {t('footer', { count: designers.length })}
          </p>
        ) : null}
      </CardContent>
    </Card>
  );
}
