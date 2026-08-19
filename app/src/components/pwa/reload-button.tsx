'use client';

import { RotateCw } from 'lucide-react';

import { Button } from '@/components/ui/button';

/** Кнопка «повторить» на офлайн-странице: просто перезагрузка. */
export function ReloadButton({ label }: { label: string }) {
  return (
    <Button onClick={() => window.location.reload()}>
      <RotateCw aria-hidden />
      {label}
    </Button>
  );
}
