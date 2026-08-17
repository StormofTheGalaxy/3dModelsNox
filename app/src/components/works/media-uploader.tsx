'use client';

import { GripVertical, Loader2, TriangleAlert, Upload, X } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useRef, useState, useTransition, type DragEvent } from 'react';

import { deleteWorkMedia, uploadWorkMedia } from '@/server/actions/works';
import { toast } from '@/components/ui/toast';
import { cn } from '@/lib/utils';

export interface UploadedItem {
  id: string;
  url: string;
  type: string;
  status: string;
}

/**
 * Загрузка медиа работы (§4.3): drag & drop, порядок перетаскиванием,
 * первое изображение — обложка.
 *
 * Файлы уезжают на сервер сразу, до сохранения формы: пользователь видит
 * превью и понимает, что загрузка прошла, а не ждёт финальной кнопки.
 */
export function MediaUploader({
  workId,
  initialItems = [],
  maxItems,
}: {
  workId: string;
  initialItems?: UploadedItem[];
  maxItems: number;
}) {
  const t = useTranslations('works.form');
  const tRoot = useTranslations();

  const [items, setItems] = useState<UploadedItem[]>(initialItems);
  const [dragOver, setDragOver] = useState(false);
  const [dragIndex, setDragIndex] = useState<number | null>(null);
  const [uploading, startUpload] = useTransition();
  const inputRef = useRef<HTMLInputElement>(null);

  function upload(files: FileList | File[]) {
    const list = [...files].slice(0, Math.max(0, maxItems - items.length));
    if (list.length === 0) return;

    startUpload(async () => {
      for (const file of list) {
        const formData = new FormData();
        formData.set('workId', workId);
        formData.set('file', file);

        const result = await uploadWorkMedia(formData);

        if (!result.ok) {
          toast.error(tRoot(result.error, result.values));
          continue;
        }

        setItems((current) => [...current, result.media]);
      }
    });
  }

  function remove(id: string) {
    setItems((current) => current.filter((item) => item.id !== id));
    void deleteWorkMedia(id);
  }

  /** Перестановка перетаскиванием: порядок карточек = порядок в работе. */
  function reorder(target: number) {
    if (dragIndex === null || dragIndex === target) return;

    setItems((current) => {
      const next = [...current];
      const [moved] = next.splice(dragIndex, 1);
      if (moved) next.splice(target, 0, moved);
      return next;
    });
    setDragIndex(target);
  }

  function onDrop(event: DragEvent<HTMLDivElement>) {
    event.preventDefault();
    setDragOver(false);
    if (event.dataTransfer.files.length > 0) upload(event.dataTransfer.files);
  }

  return (
    <div className="flex flex-col gap-3">
      <input type="hidden" name="mediaIds" value={JSON.stringify(items.map((i) => i.id))} readOnly />

      {items.length > 0 ? (
        <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
          {items.map((item, index) => (
            <li
              key={item.id}
              draggable
              onDragStart={() => setDragIndex(index)}
              onDragEnter={() => reorder(index)}
              onDragEnd={() => setDragIndex(null)}
              onDragOver={(event) => event.preventDefault()}
              className={cn(
                'group relative aspect-4/3 overflow-hidden rounded-[var(--radius-control)]',
                'border border-[var(--pf-border)] bg-surface-2',
                dragIndex === index && 'opacity-50',
              )}
            >
              {item.type === 'video' ? (
                <video src={item.url} className="size-full object-cover" muted playsInline />
              ) : (
                // Источник — пользовательская загрузка на произвольном хосте (CDN).
                // eslint-disable-next-line @next/next/no-img-element
                <img src={item.url} alt="" className="size-full object-cover" />
              )}

              {item.status === 'processing' ? (
                <span className="absolute inset-0 flex items-center justify-center gap-1.5 bg-black/45 text-xs text-white">
                  <Loader2 className="size-3.5 animate-spin" aria-hidden />
                  {t('processing')}
                </span>
              ) : null}

              {item.status === 'failed' ? (
                <span className="absolute inset-0 flex items-center justify-center gap-1.5 bg-black/60 text-xs text-white">
                  <TriangleAlert className="size-3.5" aria-hidden />
                  {t('failed')}
                </span>
              ) : null}

              {index === 0 ? (
                <span className="absolute left-2 top-2 rounded-full bg-accent px-2 py-0.5 text-[11px] font-medium text-white">
                  {t('cover')}
                </span>
              ) : null}

              <span className="absolute bottom-2 left-2 cursor-grab text-white/70 opacity-0 transition-opacity group-hover:opacity-100">
                <GripVertical className="size-4" aria-hidden />
              </span>

              <button
                type="button"
                onClick={() => remove(item.id)}
                aria-label={t('remove')}
                className={cn(
                  'absolute right-2 top-2 rounded-full bg-black/60 p-1 text-white',
                  'opacity-0 transition-opacity group-hover:opacity-100 focus-visible:opacity-100',
                )}
              >
                <X className="size-3.5" aria-hidden />
              </button>
            </li>
          ))}
        </ul>
      ) : null}

      {items.length < maxItems ? (
        <div
          onDragOver={(event) => {
            event.preventDefault();
            setDragOver(true);
          }}
          onDragLeave={() => setDragOver(false)}
          onDrop={onDrop}
          className={cn(
            'flex flex-col items-center justify-center gap-2 rounded-[var(--radius-card)]',
            'border border-dashed px-6 py-10 text-center transition-colors',
            dragOver ? 'border-accent bg-accent-soft' : 'border-[var(--pf-border)]',
          )}
        >
          {uploading ? (
            <Loader2 className="size-5 animate-spin text-accent" aria-hidden />
          ) : (
            <Upload className="size-5 text-fg-muted" aria-hidden />
          )}

          <p className="text-sm font-medium">{t('dropzone')}</p>

          <button
            type="button"
            onClick={() => inputRef.current?.click()}
            className="text-sm text-accent hover:underline"
          >
            {t('dropzoneAction')}
          </button>

          <p className="text-xs text-fg-muted">{t('mediaHint')}</p>

          <input
            ref={inputRef}
            type="file"
            multiple
            accept="image/png,image/jpeg,image/webp,image/avif,video/mp4,video/webm,video/quicktime"
            onChange={(event) => {
              if (event.target.files) upload(event.target.files);
              event.target.value = '';
            }}
            className="hidden"
          />
        </div>
      ) : null}
    </div>
  );
}
