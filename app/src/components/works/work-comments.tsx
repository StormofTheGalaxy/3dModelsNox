'use client';

import { EyeOff, MessageSquare, Pencil, Reply, Send, Trash2 } from 'lucide-react';
import { useLocale, useTranslations } from 'next-intl';
import { useState, useTransition } from 'react';

import { Alert } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Textarea } from '@/components/ui/textarea';
import { toast } from '@/components/ui/toast';
import { ReportDialog } from '@/components/report/report-dialog';
import { Link } from '@/i18n/navigation';
import {
  deleteComment,
  editComment,
  hideComment,
  postComment,
} from '@/server/actions/comments';
import { cn } from '@/lib/utils';
import type { CommentView } from '@/server/comments';

/**
 * Комментарии к работе (§4.3, post-MVP №5).
 *
 * Одноуровневые ответы, правка в окне из настроек, мягкое удаление автором
 * и скрытие автором работы или модератором. Гость читает, но не пишет:
 * форма ему заменена приглашением войти — это воронка регистрации (§4.4).
 */

/** Форма узла та же, что на сервере: две копии типа разъезжаются. */
export type CommentNode = CommentView;

export function WorkComments({
  workId,
  initial,
  canWrite,
  isGuest,
  maxLength,
}: {
  workId: string;
  initial: CommentNode[];
  canWrite: boolean;
  isGuest: boolean;
  maxLength: number;
}) {
  const t = useTranslations('works.comments');
  const tRoot = useTranslations();
  const locale = useLocale();

  const [comments, setComments] = useState(initial);
  const [draft, setDraft] = useState('');
  const [replyTo, setReplyTo] = useState<string | null>(null);
  const [replyDraft, setReplyDraft] = useState('');
  const [editing, setEditing] = useState<string | null>(null);
  const [editDraft, setEditDraft] = useState('');
  const [pending, startTransition] = useTransition();

  const formatter = new Intl.DateTimeFormat(locale, { dateStyle: 'medium', timeStyle: 'short' });

  // Считаем то же, что счётчик на карточке работы: скрытые и удалённые в
  // число не входят, даже когда зритель их видит (свои и модераторские).
  const countable = (node: CommentNode) => (node.deleted || node.hidden ? 0 : 1);
  const total = comments.reduce(
    (sum, node) => sum + countable(node) + node.replies.reduce((inner, reply) => inner + countable(reply), 0),
    0,
  );

  function run(
    action: () => Promise<
      | { ok: true; comments: CommentNode[] }
      | { ok: false; error: string; values?: Record<string, string | number> }
    >,
  ) {
    startTransition(async () => {
      const result = await action();

      if (!result.ok) {
        toast.error(tRoot(result.error, result.values));
        return;
      }

      setComments(result.comments);
    });
  }

  function submitRoot() {
    const text = draft;
    run(async () => {
      const result = await postComment(workId, text);
      if (result.ok) setDraft('');
      return result;
    });
  }

  function submitReply(parentId: string) {
    const text = replyDraft;
    run(async () => {
      const result = await postComment(workId, text, parentId);
      if (result.ok) {
        setReplyDraft('');
        setReplyTo(null);
      }
      return result;
    });
  }

  function submitEdit(commentId: string) {
    const text = editDraft;
    run(async () => {
      const result = await editComment(commentId, text);
      if (result.ok) setEditing(null);
      return result;
    });
  }

  function renderNode(node: CommentNode, isReply: boolean) {
    const unavailable = node.deleted || (node.hidden && node.text.length === 0);

    return (
      <li key={node.id} className={cn('flex flex-col gap-2', isReply && 'ml-6 sm:ml-10')}>
        <div
          className={cn(
            'flex flex-col gap-2 rounded-[var(--radius-card)] px-4 py-3',
            node.hidden ? 'border border-dashed border-[var(--pf-border)]' : 'bg-surface-2',
          )}
        >
          <div className="flex flex-wrap items-center gap-2">
            <span className="size-7 shrink-0 overflow-hidden rounded-full bg-surface">
              {node.avatarUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={node.avatarUrl} alt="" className="size-full object-cover" />
              ) : (
                <span className="pf-gradient flex size-full items-center justify-center text-xs font-bold text-white">
                  {node.nickname.slice(0, 1).toUpperCase()}
                </span>
              )}
            </span>

            <Link href={`/designers/${node.nickname}`} className="text-sm font-medium hover:text-accent">
              @{node.nickname}
            </Link>

            <span className="text-xs text-fg-muted">{formatter.format(new Date(node.createdAt))}</span>

            {node.editedAt ? <span className="text-xs text-fg-muted">{t('edited')}</span> : null}
            {node.hidden ? <Badge variant="warning">{t('hiddenBadge')}</Badge> : null}
          </div>

          {unavailable ? (
            <p className="text-sm text-fg-muted italic">
              {node.deleted ? t('deletedText') : t('hiddenText')}
            </p>
          ) : editing === node.id ? (
            <div className="flex flex-col gap-2">
              <Textarea
                rows={3}
                value={editDraft}
                maxLength={maxLength}
                onChange={(event) => setEditDraft(event.target.value)}
                aria-label={t('editLabel')}
              />
              <div className="flex gap-2">
                <Button size="sm" loading={pending} onClick={() => submitEdit(node.id)}>
                  {t('save')}
                </Button>
                <Button size="sm" variant="ghost" onClick={() => setEditing(null)}>
                  {tRoot('common.cancel')}
                </Button>
              </div>
            </div>
          ) : (
            <p className="text-sm whitespace-pre-line">{node.text}</p>
          )}

          {!unavailable && editing !== node.id ? (
            <div className="flex flex-wrap items-center gap-1">
              {/* У скрытого комментария остаётся только удаление: отвечать в
                  невидимую ветку некому, а правку сервер всё равно отвергнет. */}
              {canWrite && !isReply && !node.hidden ? (
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => {
                    setReplyTo(replyTo === node.id ? null : node.id);
                    setReplyDraft('');
                  }}
                >
                  <Reply aria-hidden />
                  {t('reply')}
                </Button>
              ) : null}

              {node.isOwn ? (
                <>
                  {!node.hidden ? (
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => {
                        setEditing(node.id);
                        setEditDraft(node.text);
                      }}
                    >
                      <Pencil aria-hidden />
                      {t('edit')}
                    </Button>
                  ) : null}

                  <Button
                    size="sm"
                    variant="ghost"
                    loading={pending}
                    onClick={() => run(() => deleteComment(node.id))}
                  >
                    <Trash2 aria-hidden />
                    {t('delete')}
                  </Button>
                </>
              ) : null}

              {node.canHide ? (
                <Button
                  size="sm"
                  variant="ghost"
                  loading={pending}
                  onClick={() => run(() => hideComment(node.id))}
                >
                  <EyeOff aria-hidden />
                  {t('hide')}
                </Button>
              ) : null}

              {!node.isOwn && !isGuest ? (
                <ReportDialog targetType="comment" targetId={node.id} />
              ) : null}
            </div>
          ) : null}
        </div>

        {replyTo === node.id ? (
          <div className="ml-6 flex flex-col gap-2 sm:ml-10">
            <Textarea
              rows={2}
              value={replyDraft}
              maxLength={maxLength}
              placeholder={t('replyPlaceholder', { nickname: node.nickname })}
              onChange={(event) => setReplyDraft(event.target.value)}
              aria-label={t('replyLabel')}
            />
            <div className="flex gap-2">
              <Button size="sm" loading={pending} onClick={() => submitReply(node.id)}>
                <Send aria-hidden />
                {t('send')}
              </Button>
              <Button size="sm" variant="ghost" onClick={() => setReplyTo(null)}>
                {tRoot('common.cancel')}
              </Button>
            </div>
          </div>
        ) : null}

        {node.replies.length > 0 ? (
          <ul className="flex flex-col gap-2">
            {node.replies.map((reply) => renderNode(reply, true))}
          </ul>
        ) : null}
      </li>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <MessageSquare aria-hidden className="size-5 text-fg-muted" />
          {t('title', { count: total })}
        </CardTitle>
      </CardHeader>

      <CardContent className="flex flex-col gap-4">
        {comments.length === 0 ? (
          <p className="text-sm text-fg-muted">{t('empty')}</p>
        ) : (
          <ul className="flex flex-col gap-3">{comments.map((node) => renderNode(node, false))}</ul>
        )}

        {canWrite ? (
          <div className="flex flex-col gap-2 border-t border-[var(--pf-border)] pt-4">
            <Textarea
              rows={3}
              value={draft}
              maxLength={maxLength}
              placeholder={t('placeholder')}
              onChange={(event) => setDraft(event.target.value)}
              aria-label={t('label')}
            />
            <Button className="sm:w-fit" loading={pending} onClick={submitRoot}>
              <Send aria-hidden />
              {t('send')}
            </Button>
          </div>
        ) : isGuest ? (
          // Гость читает, но для ответа нужна регистрация — это воронка (§4.4).
          <Alert tone="info">
            {t('guest')}{' '}
            <Link href="/login" className="font-medium text-accent hover:underline">
              {t('guestCta')}
            </Link>
          </Alert>
        ) : (
          <Alert tone="info">{t('needVerified')}</Alert>
        )}
      </CardContent>
    </Card>
  );
}
