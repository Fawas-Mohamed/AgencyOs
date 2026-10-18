'use client';
import { createContext, useContext, useRef, useState } from 'react';
import { ApiFailure } from '@/lib/api/client';
export const FieldErrors = createContext<Record<string, string>>({});
export function useFieldError(name?: string) {
  const errors = useContext(FieldErrors);
  return name ? errors[name] : undefined;
}
export function apiFieldErrors(error: unknown) {
  const errors: Record<string, string> = {};
  if (!(error instanceof ApiFailure)) return errors;
  if (Array.isArray(error.details.errors))
    for (const value of error.details.errors)
      if (typeof value === 'string') {
        const key = /^([\w.]+)\s/.exec(value)?.[1];
        if (key) errors[key] = value;
      }
  const fields: Record<string, string> = {
    INVALID_BUDGET: 'budgetMax',
    CURRENCY_REQUIRED: 'currency',
    INVALID_URL: 'referenceLinks',
    REASON_REQUIRED: 'reason',
  };
  if (fields[error.code]) errors[fields[error.code]] = error.message;
  return errors;
}
export function useSubmission() {
  const lock = useRef(false);
  const [busy, setBusy] = useState(false);
  return {
    busy,
    begin: () => {
      if (lock.current) return false;
      lock.current = true;
      setBusy(true);
      return true;
    },
    end: () => {
      lock.current = false;
      setBusy(false);
    },
  };
}
