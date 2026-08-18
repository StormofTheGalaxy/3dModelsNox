'use client';

import { Download, FileArchive, Lock } from 'lucide-react';
import { useTranslations } from 'next-intl';

import { Alert } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import type { MilestoneDetails, MilestoneView } from '@/components/deals/types';

/**
 * Вкладка «Файлы» (§4.6).
 *
 * Заказчик до подтверждения оплаты финального этапа видит превью с водяным
 * знаком, но не может скачать исходники: кнопка не прячется, а честно
 * объясняет, чего не хватает.
 */
export function DealFiles({
  details,
  milestones,
  sourcesUnlocked,
  role,
}: {
  details: MilestoneDetails[];
  milestones: MilestoneView[];
  sourcesUnlocked: boolean;
  role: 'customer' | 'designer' | 'staff';
}) {
  const t = useTranslations('deals.files');
  const locked = role === 'customer' && !sourcesUnlocked;

  const withFiles = details.filter((detail) => detail.deliveries.length > 0);

  if (withFiles.length === 0) {
    return <p className="text-sm text-fg-muted">{t('empty')}</p>;
  }

  return (
    <div className="flex flex-col gap-5">
      {locked ? (
        <Alert tone="info">
          <span className="flex items-center gap-1.5">
            <Lock aria-hidden className="size-4" />
            {t('locked')}
          </span>
        </Alert>
      ) : null}

      {withFiles.map((detail) => {
        const milestone = milestones.find((entry) => entry.id === detail.milestoneId);

        return (
          <section key={detail.milestoneId} className="flex flex-col gap-3">
            <h3 className="font-medium">
              {milestone ? `${milestone.position}. ${milestone.title}` : ''}
            </h3>

            {detail.deliveries.map((delivery) => (
              <div
                key={delivery.id}
                className="rounded-[var(--radius-card)] border border-[var(--pf-border)] p-3"
              >
                <div className="mb-2 flex items-center justify-between gap-2">
                  <Badge variant="outline">{t('version', { version: delivery.version })}</Badge>
                </div>

                {delivery.note ? (
                  <p className="mb-2 text-sm whitespace-pre-line">{delivery.note}</p>
                ) : null}

                <ul className="flex flex-col gap-2">
                  {delivery.files.map((file) => {
                    // Пока водяной знак не нанесён, показываем оригинальное превью
                    // только дизайнеру: заказчик увидит его помеченным.
                    const preview =
                      file.watermarkedUrl ?? (role === 'customer' && locked ? null : file.previewUrl);
                    const canDownload = !locked || !file.isSource;

                    return (
                      <li key={file.id} className="flex items-center gap-3">
                        {preview ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img
                            src={preview}
                            alt=""
                            className="size-14 shrink-0 rounded-[var(--radius-control)] object-cover"
                          />
                        ) : (
                          <span className="flex size-14 shrink-0 items-center justify-center rounded-[var(--radius-control)] bg-surface-2">
                            <FileArchive aria-hidden className="size-5 text-fg-muted" />
                          </span>
                        )}

                        <span className="min-w-0 flex-1 truncate text-sm">{file.fileName}</span>

                        {canDownload ? (
                          <a
                            href={`/api/deal-files/${file.id}?kind=delivery`}
                            className="flex items-center gap-1.5 text-sm text-accent hover:underline"
                          >
                            <Download aria-hidden className="size-4" />
                            {t('download')}
                          </a>
                        ) : (
                          <span className="flex items-center gap-1.5 text-sm text-fg-muted">
                            <Lock aria-hidden className="size-4" />
                            {t('lockedShort')}
                          </span>
                        )}
                      </li>
                    );
                  })}
                </ul>
              </div>
            ))}
          </section>
        );
      })}
    </div>
  );
}
