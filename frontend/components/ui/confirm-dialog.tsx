'use client';
import { useEffect, useId, useRef } from 'react';
import type { ReactNode } from 'react';
import { Button } from './primitives';
export function ConfirmDialog({
  open,
  title,
  children,
  confirmLabel = 'Continue',
  onConfirm,
  onCancel,
  danger = false,
}: {
  open: boolean;
  title: string;
  children: ReactNode;
  confirmLabel?: string;
  onConfirm: () => void;
  onCancel: () => void;
  danger?: boolean;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  const descriptionId = useId();
  useEffect(() => {
    if (!open || !ref.current) return;
    const trigger = document.activeElement as HTMLElement | null;
    ref.current.showModal();
    const dialog = ref.current;
    return () => {
      if (dialog.open) dialog.close();
      if (trigger?.isConnected) trigger.focus();
    };
  }, [open]);
  return (
    <dialog
      ref={ref}
      className="confirm-dialog"
      aria-labelledby={titleId}
      aria-describedby={descriptionId}
      onKeyDown={(event) => {
        if (event.key !== 'Tab') return;
        const controls = Array.from(
          ref.current?.querySelectorAll<HTMLElement>(
            'button:not([disabled]),a[href],input:not([disabled]),textarea:not([disabled]),select:not([disabled])',
          ) ?? [],
        );
        const first = controls[0],
          last = controls[controls.length - 1];
        if (event.shiftKey && document.activeElement === first) {
          event.preventDefault();
          last?.focus();
        } else if (!event.shiftKey && document.activeElement === last) {
          event.preventDefault();
          first?.focus();
        }
      }}
      onCancel={(event) => {
        event.preventDefault();
        onCancel();
      }}
    >
      <h2 id={titleId}>{title}</h2>
      <div id={descriptionId} className="text-secondary my-4">
        {children}
      </div>
      <div className="flex flex-wrap justify-end gap-3">
        <Button type="button" variant="secondary" autoFocus onClick={onCancel}>
          Keep editing
        </Button>
        <Button type="button" variant={danger ? 'destructive' : 'primary'} onClick={onConfirm}>
          {confirmLabel}
        </Button>
      </div>
    </dialog>
  );
}
