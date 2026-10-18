'use client';
import { useEffect, useMemo, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { FieldErrors, apiFieldErrors } from '@/lib/utils/form-state';
export function FormFeedback({ error, children }: { error: unknown; children: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  const [native, setNative] = useState<Record<string, string>>({});
  const [cleared, setCleared] = useState<Set<string>>(new Set());
  const errors = useMemo(() => {
    const values = { ...apiFieldErrors(error), ...native };
    for (const key of cleared) delete values[key];
    return values;
  }, [error, native, cleared]);
  useEffect(() => {
    setCleared(new Set());
    if (error)
      requestAnimationFrame(() =>
        ref.current?.querySelector<HTMLElement>('[aria-invalid="true"]')?.focus(),
      );
  }, [error]);
  return (
    <FieldErrors.Provider value={errors}>
      <div
        ref={ref}
        onInvalidCapture={(event) => {
          const input = event.target as HTMLInputElement;
          if (input.name)
            setNative((previous) => ({ ...previous, [input.name]: input.validationMessage }));
        }}
        onChangeCapture={(event) => {
          const input = event.target as HTMLInputElement;
          if (input.name) {
            setNative((previous) => {
              const copy = { ...previous };
              delete copy[input.name];
              return copy;
            });
            setCleared((previous) => new Set(previous).add(input.name));
          }
        }}
      >
        {children}
      </div>
    </FieldErrors.Provider>
  );
}
