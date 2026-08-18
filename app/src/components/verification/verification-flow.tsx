'use client';

import { useTranslations } from 'next-intl';
import { useActionState, useTransition } from 'react';

import { Alert } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input, Label } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { toast } from '@/components/ui/toast';
import { useRouter } from '@/i18n/navigation';
import { startVerification, submitVerification } from '@/server/actions/verification';
import { idleState, type ActionState } from '@/server/actions/types';
import { formatDate } from '@/lib/utils';

/**
 * Поток верификации (§4.9): выбор задания → сдача → ожидание решения.
 *
 * Описание процесса обязательно и длинное намеренно: подделать рендер
 * проще, чем внятно рассказать, как он сделан, — на этом и держится
 * проверка авторства.
 */

interface TaskView {
  id: string;
  specialization: string;
  titleRu: string;
  titleEn: string;
  bodyRu: string;
  bodyEn: string;
  estimateHours: number;
}

interface RequestView {
  id: string;
  status: string;
  processNote: string | null;
  decisionNote: string | null;
  retryAfter: string | null;
  submittedAt: string | null;
  decidedAt: string | null;
  images: { id: string; url: string }[];
  task: { id: string; titleRu: string; titleEn: string; bodyRu: string; bodyEn: string };
}

export function VerificationFlow({
  locale,
  tasks,
  request,
}: {
  locale: string;
  tasks: TaskView[];
  request: RequestView | null;
}) {
  const t = useTranslations('verification');
  const tRoot = useTranslations();
  const router = useRouter();
  const [starting, startTransition] = useTransition();

  const [state, action, pending] = useActionState(
    async (previous: ActionState, formData: FormData) => {
      const result = await submitVerification(previous, formData);
      if (result.status === 'success') {
        if (result.message) toast.success(tRoot(result.message));
        router.refresh();
      }
      return result;
    },
    idleState,
  );

  function choose(taskId: string) {
    startTransition(async () => {
      const result = await startVerification(taskId);
      if ('error' in result) {
        toast.error(tRoot(result.error));
        return;
      }
      router.refresh();
    });
  }

  const title = (entry: { titleRu: string; titleEn: string }) =>
    locale === 'en' ? entry.titleEn : entry.titleRu;
  const body = (entry: { bodyRu: string; bodyEn: string }) =>
    locale === 'en' ? entry.bodyEn : entry.bodyRu;

  if (request?.status === 'submitted') {
    return (
      <Card>
        <CardContent className="flex flex-col gap-3 p-5">
          <Badge variant="warning">{t('statuses.submitted')}</Badge>
          <p className="font-medium">{title(request.task)}</p>
          <p className="text-sm text-fg-muted">
            {t('submittedAt', {
              date: request.submittedAt ? formatDate(request.submittedAt, locale) : '',
            })}
          </p>
          <p className="text-sm">{t('waitingReview')}</p>
        </CardContent>
      </Card>
    );
  }

  if (request?.status === 'rejected') {
    const canRetry = !request.retryAfter || new Date(request.retryAfter) <= new Date();

    return (
      <div className="flex flex-col gap-4">
        <Card>
          <CardContent className="flex flex-col gap-3 p-5">
            <Badge variant="danger">{t('statuses.rejected')}</Badge>
            {request.decisionNote ? (
              <p className="text-sm whitespace-pre-line">{request.decisionNote}</p>
            ) : null}
            {!canRetry && request.retryAfter ? (
              <Alert tone="info">
                {t('retryAfter', { date: formatDate(request.retryAfter, locale) })}
              </Alert>
            ) : null}
          </CardContent>
        </Card>

        {canRetry ? (
          <TaskPool locale={locale} tasks={tasks} onChoose={choose} pending={starting} />
        ) : null}
      </div>
    );
  }

  if (request?.status === 'draft') {
    return (
      <Card>
        <CardContent className="p-5">
          <h2 className="mb-1 font-bold">{title(request.task)}</h2>
          <p className="mb-4 text-sm whitespace-pre-line text-fg-muted">{body(request.task)}</p>

          <form action={action} className="flex flex-col gap-4">
            <input type="hidden" name="requestId" value={request.id} />

            <div>
              <Label htmlFor="verification-images">{t('images')}</Label>
              <Input id="verification-images" name="images" type="file" multiple accept="image/*" />
              <p className="mt-1 text-xs text-fg-muted">{t('imagesHint')}</p>
            </div>

            <div>
              <Label htmlFor="verification-process">{t('process')}</Label>
              <Textarea
                id="verification-process"
                name="processNote"
                rows={8}
                required
                minLength={100}
                defaultValue={request.processNote ?? ''}
                placeholder={t('processHint')}
              />
            </div>

            {state.status === 'error' && state.message ? (
              <Alert tone="danger">{tRoot(state.message, state.values)}</Alert>
            ) : null}

            <Button type="submit" loading={pending}>
              {t('submit')}
            </Button>
          </form>
        </CardContent>
      </Card>
    );
  }

  return <TaskPool locale={locale} tasks={tasks} onChoose={choose} pending={starting} />;
}

/** Пул тестовых заданий своей специализации. */
function TaskPool({
  locale,
  tasks,
  onChoose,
  pending,
}: {
  locale: string;
  tasks: TaskView[];
  onChoose: (taskId: string) => void;
  pending: boolean;
}) {
  const t = useTranslations('verification');
  const tTax = useTranslations('taxonomy');

  if (tasks.length === 0) {
    return <Alert tone="info">{t('noTasks')}</Alert>;
  }

  return (
    <ul className="flex flex-col gap-3">
      {tasks.map((task) => (
        <li key={task.id}>
          <Card>
            <CardContent className="flex flex-col gap-2 p-5">
              <div className="flex flex-wrap items-center gap-2">
                <h2 className="font-bold">{locale === 'en' ? task.titleEn : task.titleRu}</h2>
                <Badge variant="outline">{tTax(`specialization.${task.specialization}`)}</Badge>
                <Badge variant="neutral">{t('hours', { hours: task.estimateHours })}</Badge>
              </div>
              <p className="text-sm whitespace-pre-line text-fg-muted">
                {locale === 'en' ? task.bodyEn : task.bodyRu}
              </p>
              <Button
                size="sm"
                className="mt-1 sm:w-fit"
                loading={pending}
                onClick={() => onChoose(task.id)}
              >
                {t('choose')}
              </Button>
            </CardContent>
          </Card>
        </li>
      ))}
    </ul>
  );
}
