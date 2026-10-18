'use client';
import { cloneElement, isValidElement, useId } from 'react';
import type { ButtonHTMLAttributes, ReactNode } from 'react';
import { AlertCircle, CheckCircle2, Inbox } from 'lucide-react';
import { useFieldError } from '@/lib/utils/form-state';
import { ApiFailure } from '@/lib/api/client';
import { label } from '@/lib/utils/format';
export function Button({
  variant = 'primary',
  className = '',
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: 'primary' | 'secondary' | 'ghost' | 'destructive';
}) {
  return <button {...props} className={'btn btn-' + variant + ' ' + className} />;
}
export function Field({
  label: caption,
  help,
  name,
  error,
  children,
}: {
  label: string;
  help?: string;
  name?: string;
  error?: string;
  children: ReactNode;
}) {
  const generatedId = useId();
  const control = isValidElement<{
    id?: string;
    name?: string;
    'aria-describedby'?: string;
    'aria-invalid'?: boolean;
  }>(children)
    ? children
    : null;
  const fieldName = name ?? control?.props.name;
  const contextError = useFieldError(fieldName);
  const fieldError = error ?? contextError;
  const errorId = generatedId + '-error';
  const controlId = control?.props.id ?? generatedId;
  const helpId = generatedId + '-help';
  const describedBy =
    [
      control?.props['aria-describedby'],
      help ? helpId : undefined,
      fieldError ? errorId : undefined,
    ]
      .filter(Boolean)
      .join(' ') || undefined;
  return (
    <div className="field">
      <label htmlFor={controlId}>{caption}</label>
      {control
        ? cloneElement(control, {
            id: controlId,
            name: fieldName,
            'aria-describedby': describedBy,
            'aria-invalid': Boolean(fieldError) || undefined,
          })
        : children}
      {fieldError && (
        <span className="field-error" id={errorId}>
          {fieldError}
        </span>
      )}
      {help && (
        <span className="help" id={helpId}>
          {help}
        </span>
      )}
    </div>
  );
}
export function Badge({ status }: { status: string }) {
  const tone =
    status === 'CONFIRMED' || status === 'ACTIVE'
      ? 'badge-success'
      : status === 'UNDER_REVIEW' || status === 'CHANGES_REQUESTED'
        ? 'badge-warning'
        : 'badge-neutral';
  return <span className={'badge ' + tone}>{label(status)}</span>;
}
export function Notice({
  children,
  kind = 'success',
}: {
  children: ReactNode;
  kind?: 'success' | 'error';
}) {
  const Icon = kind === 'error' ? AlertCircle : CheckCircle2;
  return (
    <div
      className={'notice ' + (kind === 'error' ? 'notice-error' : 'notice-success')}
      role={kind === 'error' ? 'alert' : 'status'}
    >
      <Icon size={18} aria-hidden="true" />
      <div>{children}</div>
    </div>
  );
}
export function ErrorNotice({ error, retry }: { error: unknown; retry?: () => void }) {
  if (!error) return null;
  const message =
    error instanceof ApiFailure ? error.message : 'Something went wrong. Please retry.';
  const errors =
    error instanceof ApiFailure && Array.isArray(error.details.errors)
      ? (error.details.errors as string[])
      : [];
  return (
    <Notice kind="error">
      <p>{message}</p>
      {errors.length > 0 && (
        <ul className="list-disc pl-5">
          {errors.map((text, index) => (
            <li key={index}>{text}</li>
          ))}
        </ul>
      )}
      {retry && (
        <button type="button" className="underline mt-2" onClick={retry}>
          Retry
        </button>
      )}
    </Notice>
  );
}
export function Loading() {
  return (
    <div className="panel p-6" role="status" aria-live="polite">
      Loading workspace…
    </div>
  );
}
export function Empty({ title, children }: { title: string; children?: ReactNode }) {
  return (
    <div className="empty">
      <Inbox size={28} aria-hidden="true" />
      <h3>{title}</h3>
      {children && <div>{children}</div>}
    </div>
  );
}
export function Pagination({
  page,
  totalPages,
  total,
  onPage,
  loading = false,
}: {
  page: number;
  totalPages: number;
  total: number;
  onPage: (page: number) => void;
  loading?: boolean;
}) {
  return (
    <div className="pagination">
      <span>
        {total} record{total === 1 ? '' : 's'} · Page {page} of {Math.max(totalPages, 1)}
      </span>
      <div className="flex gap-2">
        <Button
          variant="secondary"
          disabled={loading || page <= 1}
          onClick={() => onPage(page - 1)}
        >
          Previous
        </Button>
        <Button
          variant="secondary"
          disabled={loading || page >= totalPages}
          onClick={() => onPage(page + 1)}
        >
          Next
        </Button>
      </div>
    </div>
  );
}
