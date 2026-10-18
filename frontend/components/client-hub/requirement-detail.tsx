'use client';
import Link from 'next/link';
import { useState } from 'react';
import { ArrowLeft, Download, Pencil } from 'lucide-react';
import { api, ApiFailure, useResource } from '@/lib/api/client';
import type { ConfirmedPackage, Requirement, RequirementStatus } from '@/lib/types/hub';
import { budget, dateOnly, dateTime, label } from '@/lib/utils/format';
import {
  Badge,
  Button,
  Empty,
  ErrorNotice,
  Field,
  Loading,
  Notice,
} from '@/components/ui/primitives';
import { saveJson } from '@/lib/api/downloads';
import { useSubmission } from '@/lib/utils/form-state';
import { useDraft } from '@/components/ui/navigation-guard';
import { FormFeedback } from '@/components/ui/form-feedback';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { useActor } from './shell';
import { CommunicationRow, FileRow, NoteRow, TimelineEntries } from './record-rows';
const actionLabels: Record<RequirementStatus, string> = {
  DRAFT: 'Return to draft',
  UNDER_REVIEW: 'Submit for review',
  CONFIRMED: 'Confirm requirement',
  CHANGES_REQUESTED: 'Request changes',
  ARCHIVED: 'Archive requirement',
};
function TextBlock({ title, value }: { title: string; value: string | null | undefined }) {
  return (
    <div>
      <h3 className="text-secondary mb-2">{title}</h3>
      <p className="whitespace-pre-wrap break-words">{value || 'Not provided'}</p>
    </div>
  );
}
export function RequirementDetail({
  clientId,
  requirementId,
  review = false,
}: {
  clientId: string;
  requirementId: string;
  review?: boolean;
  saved?: boolean;
}) {
  const actor = useActor();
  const resource = useResource<Requirement>('/requirements/' + requirementId);
  const { busy, begin, end } = useSubmission();
  const draft = useDraft();
  const [pendingStatus, setPendingStatus] = useState<RequirementStatus | null>(null);
  const [error, setError] = useState<unknown>(null);
  const [message, setMessage] = useState('');
  const [reason, setReason] = useState('');
  if (resource.loading) return <Loading />;
  if (resource.error) return <ErrorNotice error={resource.error} retry={resource.reload} />;
  const record = resource.data;
  if (!record) return null;
  if (record.clientId !== clientId) return <Empty title="Requirement not found" />;
  const base = '/client-hub/clients/' + clientId + '/requirements/' + requirementId;
  function requestChange(status: RequirementStatus) {
    if (!record) return;
    if (
      (['CHANGES_REQUESTED', 'ARCHIVED'].includes(status) || record.status === 'CONFIRMED') &&
      !reason.trim()
    ) {
      setError(new ApiFailure('A reason is required for this action.', 'REASON_REQUIRED', {}, 400));
      return;
    }
    if (status === 'CONFIRMED' || status === 'ARCHIVED' || record.status === 'CONFIRMED')
      setPendingStatus(status);
    else void change(status);
  }
  async function change(status: RequirementStatus) {
    if (!record || !begin()) return;
    setError(null);
    setMessage('');
    try {
      await api('/requirements/' + requirementId + '/status', {
        method: 'PATCH',
        body: {
          status,
          expectedVersion: record.lockVersion,
          ...(reason.trim() ? { reason: reason.trim() } : {}),
        },
      });
      setMessage('Requirement moved to ' + label(status) + '.');
      draft.markSaved();
      setReason('');
      resource.reload();
    } catch (e) {
      setError(e);
    } finally {
      end();
    }
  }
  async function download(version?: number) {
    if (!begin()) return;
    setError(null);
    try {
      const snapshot = await api<ConfirmedPackage>(
        '/requirements/' + requirementId + '/export' + (version ? '?version=' + version : ''),
      );
      saveJson(
        snapshot,
        'requirement-' + requirementId + '-v' + (version ?? record?.version) + '.json',
      );
      setMessage('Confirmed requirement package downloaded.');
    } catch (e) {
      setError(e);
    } finally {
      end();
    }
  }
  return (
    <>
      <Link
        className="text-link inline-flex gap-2 mb-4"
        href={'/client-hub/clients/' + clientId + '?tab=requirements'}
      >
        <ArrowLeft size={16} />
        Client requirements
      </Link>
      <div className="page-heading">
        <div>
          <div className="flex flex-wrap gap-3 items-center">
            <h1 className="break-words">{record.title}</h1>
            <Badge status={record.status} />
          </div>
          <p>
            Version {record.version} · Prepared by {record.preparedBy.displayName} · Updated{' '}
            {dateTime(record.updatedAt)}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {record.editAllowed && (
            <Link className="btn btn-secondary" href={base + '/edit'}>
              <Pencil size={16} />
              Edit requirement
            </Link>
          )}
          {!review && Boolean(record.allowedTransitions?.length) && (
            <a className="btn btn-primary" href={base + '/review'}>
              Review requirement
            </a>
          )}
          {review && (
            <Link className="btn btn-secondary" href={base}>
              Back to detail
            </Link>
          )}
          {record.status === 'CONFIRMED' && actor.permissions.includes('file.read') && (
            <Button variant="secondary" disabled={busy} onClick={() => download()}>
              <Download size={16} />
              Download confirmed package
            </Button>
          )}
        </div>
      </div>
      {message && <Notice>{message}</Notice>}
      <ErrorNotice error={error} retry={resource.reload} />
      {error instanceof ApiFailure && error.status === 409 && (
        <p className="panel p-4 mb-4">
          This record changed. Your review note is retained. Retry to load its latest status, then
          review the available actions again.
        </p>
      )}
      <div className="panel p-4 mb-5 space-y-2" aria-label="Requirement versions">
        <p className="font-medium">
          Active version: {record.version} · {label(record.status)}
        </p>
        <p>
          Last confirmed version:{' '}
          {record.revisions?.length ? Math.max(...record.revisions.map((r) => r.version)) : 'None'}
        </p>
        {Boolean(record.revisions?.length) &&
          record.version > Math.max(...(record.revisions ?? []).map((r) => r.version)) && (
            <p className="help">
              This working version is unapproved. The previous confirmed package remains available
              in version history for downstream use.
            </p>
          )}
        {record.status === 'ARCHIVED' && (
          <p className="help">
            Archived records are read-only. Authorized history and confirmed downloads remain
            available.
          </p>
        )}
      </div>
      <ConfirmDialog
        open={Boolean(pendingStatus)}
        title={
          pendingStatus === 'CONFIRMED'
            ? 'Confirm this requirement version?'
            : pendingStatus === 'ARCHIVED'
              ? 'Archive this requirement?'
              : 'Start a controlled revision?'
        }
        confirmLabel={
          pendingStatus === 'CONFIRMED'
            ? 'Confirm version'
            : pendingStatus === 'ARCHIVED'
              ? 'Archive requirement'
              : 'Create draft revision'
        }
        danger={pendingStatus === 'ARCHIVED'}
        onCancel={() => setPendingStatus(null)}
        onConfirm={() => {
          const status = pendingStatus;
          setPendingStatus(null);
          if (status) void change(status);
        }}
      >
        {pendingStatus === 'CONFIRMED'
          ? 'Confirmation preserves the current content and references as an immutable approved version. Your verified identity and server time will be recorded.'
          : pendingStatus === 'ARCHIVED'
            ? 'This record will become read-only. Its confirmed versions and authorized history will remain available.'
            : 'A new unapproved working version will be created. The previous confirmed package remains unchanged and available by its exact version.'}
      </ConfirmDialog>
      {record.confirmedAt && (
        <div className="panel p-4 mb-5">
          <p className="font-medium">
            Confirmed by {record.confirmedBy?.displayName} on {dateTime(record.confirmedAt)}
          </p>
          <p className="help mt-1">
            This agreed version is preserved.{' '}
            {record.status === 'CONFIRMED'
              ? 'Further content changes require a new draft revision.'
              : 'Archived content remains read-only.'}
          </p>
        </div>
      )}
      <div className="space-y-5">
        <section className="form-section">
          <h2>Business objective</h2>
          <p className="whitespace-pre-wrap break-words">{record.objective}</p>
          <TextBlock title="Requested services" value={record.services.join(', ')} />
        </section>
        <section className="panel">
          <div className="panel-heading">
            <h2>Requirement items</h2>
            <span className="text-xs text-secondary">{record.items.length} items</span>
          </div>
          {record.items.map((item, index) => (
            <article className="record-row" key={item.id ?? index}>
              <div className="flex flex-wrap justify-between gap-2">
                <h3>
                  {index + 1}. {item.title}
                </h3>
                <span className="badge badge-neutral">{label(item.priority)}</span>
              </div>
              <p className="help mt-1">{item.category || 'Uncategorized'}</p>
              <p className="mt-3 whitespace-pre-wrap break-words">
                {item.description || 'No description provided'}
              </p>
              {item.notes && (
                <p className="mt-2 whitespace-pre-wrap break-words">
                  <strong>Notes:</strong> {item.notes}
                </p>
              )}
            </article>
          ))}
        </section>
        <section className="form-section">
          <h2>Client-provided information</h2>
          <p className="help">Budget and dates are client preferences, subject to review.</p>
          <dl className="detail-grid">
            <div>
              <dt>Budget range</dt>
              <dd>{budget(record.budgetMin, record.budgetMax, record.currency)}</dd>
            </div>
            <div>
              <dt>Target date</dt>
              <dd>{record.targetDate ? dateOnly(record.targetDate) : 'Not provided'}</dd>
            </div>
          </dl>
          <TextBlock title="Expected timeline" value={record.timeline} />
          <TextBlock title="Constraints" value={record.constraints} />
          <TextBlock title="Client notes" value={record.clientNotes} />
          <TextBlock title="Design / UI preferences" value={record.designPreferences} />
          <div>
            <h3 className="text-secondary mb-2">Reference websites</h3>
            {record.referenceLinks.length === 0 ? (
              <p>Not provided</p>
            ) : (
              <ul className="space-y-2">
                {record.referenceLinks.map((link, index) => (
                  <li key={index}>
                    <a className="text-link break-all" href={link} target="_blank" rel="noreferrer">
                      {link}
                    </a>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </section>
        <section className="form-section">
          <h2>Internal context</h2>
          <TextBlock title="Assumptions" value={record.assumptions} />
          <TextBlock title="Recommendations" value={record.internalRecommendations} />
        </section>
        {record.files && (
          <section className="panel">
            <div className="panel-heading">
              <h2>Supporting files & references</h2>
              <Link
                className="text-link"
                href={
                  '/client-hub/clients/' + clientId + '?tab=files&requirementId=' + requirementId
                }
              >
                Manage files
              </Link>
            </div>
            {record.files.length === 0 ? (
              <Empty title="No supporting material linked" />
            ) : (
              record.files.map((file) => <FileRow key={file.id} file={file} />)
            )}
          </section>
        )}
        {(record.notes || record.communications) && (
          <section className="panel">
            <div className="panel-heading">
              <h2>Clarifications & discussions</h2>
              <Link
                className="text-link"
                href={
                  '/client-hub/clients/' + clientId + '?tab=notes&requirementId=' + requirementId
                }
              >
                Add clarification
              </Link>
              {actor.permissions.includes('communication.read') && (
                <Link
                  className="text-link"
                  href={
                    '/client-hub/clients/' +
                    clientId +
                    '?tab=communications&requirementId=' +
                    requirementId
                  }
                >
                  Log related communication
                </Link>
              )}
            </div>
            {!(record.notes?.length || record.communications?.length) ? (
              <Empty title="No linked discussions" />
            ) : (
              <>
                {record.notes?.map((note) => (
                  <NoteRow key={note.id} note={note} />
                ))}
                {record.communications?.map((communication) => (
                  <CommunicationRow key={communication.id} record={communication} />
                ))}
              </>
            )}
          </section>
        )}
        {review && (
          <FormFeedback error={error}>
            <section className="form-section" onChangeCapture={draft.markDirty}>
              <h2>Review version {record.version}</h2>
              <p className="text-secondary">
                Review the scope and client information above before changing its status.
                Confirmation records the responsible person and preserves this version.
              </p>
              <Field
                name="reason"
                label="Reason / review note"
                help="Required for change requests, archiving and reopening confirmed content."
              >
                <textarea
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                  disabled={busy || !record.allowedTransitions?.length}
                  maxLength={2000}
                />
              </Field>
              {record.allowedTransitions?.length ? (
                <div className="flex flex-wrap gap-2">
                  {record.allowedTransitions.map((status) => (
                    <Button
                      key={status}
                      variant={
                        status === 'ARCHIVED'
                          ? 'destructive'
                          : status === 'CONFIRMED' || status === 'UNDER_REVIEW'
                            ? 'primary'
                            : 'secondary'
                      }
                      disabled={busy}
                      onClick={() => requestChange(status)}
                    >
                      {busy
                        ? 'Saving…'
                        : record.status === 'CONFIRMED' && status === 'DRAFT'
                          ? 'Reopen as new draft version'
                          : actionLabels[status]}
                    </Button>
                  ))}
                </div>
              ) : (
                <p className="text-secondary">
                  No status changes are available for this record and your permissions.
                </p>
              )}
            </section>
          </FormFeedback>
        )}
        <section className="panel">
          <div className="panel-heading">
            <h2>Confirmed version history</h2>
          </div>
          {record.revisions?.length ? (
            record.revisions.map((revision) => (
              <div
                className="record-row flex flex-wrap items-center justify-between gap-3"
                key={revision.id}
              >
                <div>
                  <h3>Version {revision.version}</h3>
                  <p className="help mt-1">
                    Confirmed by {revision.confirmedBy.displayName} ·{' '}
                    {dateTime(revision.confirmedAt)}
                  </p>
                </div>
                {actor.permissions.includes('file.read') && (
                  <Button
                    variant="secondary"
                    disabled={busy}
                    onClick={() => download(revision.version)}
                  >
                    <Download size={16} />
                    Download version {revision.version}
                  </Button>
                )}
              </div>
            ))
          ) : (
            <Empty title="No confirmed versions yet" />
          )}
        </section>
        <section className="panel">
          <div className="panel-heading">
            <h2>Requirement activity</h2>
          </div>
          {record.history?.length ? (
            <TimelineEntries entries={record.history} />
          ) : (
            <Empty title="No requirement activity" />
          )}
        </section>
      </div>
    </>
  );
}
