'use client';
import { useState } from 'react';
import { Plus } from 'lucide-react';
import { api, useResource } from '@/lib/api/client';
import type {
  Activity,
  ClientFile,
  ClientNote,
  Communication,
  Page,
  Requirement,
} from '@/lib/types/hub';
import { label } from '@/lib/utils/format';
import {
  Button,
  Empty,
  ErrorNotice,
  Field,
  Loading,
  Notice,
  Pagination,
} from '@/components/ui/primitives';
import { FormFeedback } from '@/components/ui/form-feedback';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { useDraft } from '@/components/ui/navigation-guard';
import { useSubmission } from '@/lib/utils/form-state';
import { useActor } from './shell';
import { CommunicationRow, FileRow, NoteRow, TimelineEntries } from './record-rows';
type RecordProps = {
  clientId: string;
  active: boolean;
  requirementId?: string;
  onSaved?: () => void;
};
function RequirementPicker({
  clientId,
  requirementId,
  editableOnly = false,
  onDirty,
}: {
  clientId: string;
  requirementId?: string;
  editableOnly?: boolean;
  onDirty: () => void;
}) {
  const actor = useActor();
  const [q, setQ] = useState('');
  const [selected, setSelected] = useState(requirementId ?? '');
  const resource = useResource<Page<Requirement>>(
    actor.permissions.includes('requirement.read')
      ? '/clients/' + clientId + '/requirements?limit=100&q=' + encodeURIComponent(q)
      : null,
  );
  const found = resource.data?.items.find((r) => r.id === selected);
  const chosen = useResource<Requirement>(
    selected && !found && actor.permissions.includes('requirement.read')
      ? '/requirements/' + selected
      : null,
  );
  if (!actor.permissions.includes('requirement.read')) return null;
  const current = found ?? chosen.data;
  const valid =
    current?.clientId === clientId &&
    (!editableOnly || ['DRAFT', 'CHANGES_REQUESTED'].includes(current.status));
  const options = (resource.data?.items ?? []).filter(
    (r) => !editableOnly || ['DRAFT', 'CHANGES_REQUESTED'].includes(r.status),
  );
  if (selected && valid && current && !options.some((r) => r.id === current.id))
    options.unshift(current);
  return (
    <div className="space-y-2">
      <Field label="Find a requirement (optional)">
        <input
          type="search"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Filter available requirements"
        />
      </Field>
      <Field
        label="Linked requirement"
        help={
          editableOnly
            ? 'Attachments can be added to editable draft or changes-requested requirements. Confirmed attachments are retained.'
            : 'Choose a requirement only when this entry relates to it.'
        }
      >
        <select
          name="requirementId"
          value={selected && valid ? selected : ''}
          required={Boolean(selected)}
          onChange={(e) => {
            setSelected(e.target.value);
            onDirty();
          }}
        >
          <option value="">
            {selected && !valid
              ? 'Resolve or clear the selected requirement'
              : 'Client-level entry'}
          </option>
          {options.map((r) => (
            <option value={r.id} key={r.id}>
              {r.title} ? {label(r.status)}
            </option>
          ))}
        </select>
      </Field>
      {selected && (
        <Button
          type="button"
          variant="ghost"
          onClick={() => {
            setSelected('');
            onDirty();
          }}
        >
          Clear linked requirement
        </Button>
      )}
      {selected && !valid && !chosen.loading && !resource.loading && (
        <p role="alert" className="field-error">
          The selected requirement is unavailable for this entry. Choose an eligible requirement or
          clear the link.
        </p>
      )}
      {(resource.loading || (selected && !found && chosen.loading)) && (
        <p role="status" className="help">
          Loading requirements...
        </p>
      )}
      <ErrorNotice
        error={resource.error ?? chosen.error}
        retry={() => {
          resource.reload();
          chosen.reload();
        }}
      />
    </div>
  );
}
function dateBoundary(value: string, end: boolean) {
  const date = new Date(value + (end ? 'T23:59:59.999' : 'T00:00:00'));
  return /^\d{4}-\d{2}-\d{2}$/.test(value) && Number.isFinite(date.getTime())
    ? date.toISOString()
    : value;
}
function localNow() {
  const value = new Date();
  return new Date(value.getTime() - value.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
}
export function Communications({ clientId, active, requirementId, onSaved }: RecordProps) {
  const actor = useActor();
  const [q, setQ] = useState('');
  const [type, setType] = useState('');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [page, setPage] = useState(1);
  const [show, setShow] = useState(false);
  const { busy, begin, end } = useSubmission();
  const draft = useDraft();
  const [error, setError] = useState<unknown>(null);
  const [success, setSuccess] = useState(false);
  const query = new URLSearchParams({
    q,
    ...(requirementId ? { requirementId } : {}),
    page: String(page),
    ...(type ? { type } : {}),
    ...(from ? { from: dateBoundary(from, false) } : {}),
    ...(to ? { to: dateBoundary(to, true) } : {}),
  });
  const resource = useResource<Page<Communication>>(
    '/clients/' + clientId + '/communications?' + query,
  );
  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!begin()) return;
    setError(null);
    const form = new FormData(event.currentTarget);
    try {
      await api('/clients/' + clientId + '/communications', {
        method: 'POST',
        body: {
          type: form.get('type'),
          subject: form.get('subject'),
          summary: form.get('summary'),
          occurredAt: new Date(String(form.get('occurredAt'))).toISOString(),
          participants: String(form.get('participants'))
            .split(',')
            .map((s) => s.trim())
            .filter(Boolean),
          followUp: form.get('followUp'),
          ...(form.get('requirementId') ? { requirementId: form.get('requirementId') } : {}),
        },
      });
      draft.markSaved();
      setShow(false);
      setSuccess(true);
      onSaved?.();
      resource.reload();
    } catch (e) {
      setError(e);
    } finally {
      end();
    }
  }
  return (
    <>
      <div className="page-heading">
        <div>
          <h2>Communication log</h2>
          <p>Record calls, meetings and messages manually.</p>
        </div>
        {active && actor.permissions.includes('communication.write') && (
          <Button
            disabled={busy}
            onClick={() => {
              const toggle = () => {
                setShow((v) => !v);
                setSuccess(false);
                setError(null);
              };
              if (show) draft.discard(toggle);
              else toggle();
            }}
            variant={show ? 'secondary' : 'primary'}
          >
            <Plus size={16} />
            {show ? 'Close form' : 'Log communication'}
          </Button>
        )}
      </div>
      {success && <Notice>Communication recorded.</Notice>}
      {show && (
        <FormFeedback error={error}>
          <form className="form-section mb-5" onSubmit={submit} onChangeCapture={draft.markDirty}>
            <h3>New communication</h3>
            <ErrorNotice error={error} />
            <fieldset disabled={busy} className="space-y-4">
              <div className="form-grid">
                <Field label="Communication type">
                  <select name="type">
                    {['CALL', 'EMAIL', 'MEETING', 'WHATSAPP_MESSAGE', 'VIDEO_MEETING', 'OTHER'].map(
                      (t) => (
                        <option key={t} value={t}>
                          {label(t)}
                        </option>
                      ),
                    )}
                  </select>
                </Field>
                <Field
                  label="Occurred at"
                  help="Your device's local time; saved with an explicit timezone."
                >
                  <input
                    type="datetime-local"
                    min="0001-01-01T00:00"
                    max="9999-12-31T23:59"
                    name="occurredAt"
                    defaultValue={localNow()}
                    required
                  />
                </Field>
              </div>
              <Field label="Subject">
                <input name="subject" required maxLength={180} />
              </Field>
              <Field label="Summary">
                <textarea name="summary" required maxLength={8000} />
              </Field>
              <Field label="Participants" help="Separate names with commas.">
                <input name="participants" maxLength={4000} />
              </Field>
              <Field label="Follow-up note">
                <textarea name="followUp" maxLength={4000} />
              </Field>
              <RequirementPicker
                clientId={clientId}
                requirementId={requirementId}
                onDirty={draft.markDirty}
              />
            </fieldset>
            <Button type="submit" disabled={busy}>
              {busy ? 'Saving…' : 'Save communication'}
            </Button>
          </form>
        </FormFeedback>
      )}
      <div className="filters">
        <input
          aria-label="Search communications"
          placeholder="Search subject or summary"
          value={q}
          onChange={(e) => {
            setQ(e.target.value);
            setPage(1);
          }}
        />
        <select
          aria-label="Filter communication type"
          value={type}
          onChange={(e) => {
            setType(e.target.value);
            setPage(1);
          }}
        >
          <option value="">All types</option>
          {['CALL', 'EMAIL', 'MEETING', 'WHATSAPP_MESSAGE', 'VIDEO_MEETING', 'OTHER'].map((t) => (
            <option key={t} value={t}>
              {label(t)}
            </option>
          ))}
        </select>
        <Field label="From date">
          <input
            type="date"
            min="0001-01-01"
            max="9999-12-31"
            value={from}
            onChange={(e) => {
              setFrom(e.target.value);
              setPage(1);
            }}
          />
        </Field>
        <Field label="To date">
          <input
            type="date"
            min="0001-01-01"
            max="9999-12-31"
            value={to}
            onChange={(e) => {
              setTo(e.target.value);
              setPage(1);
            }}
          />
        </Field>
      </div>
      <ErrorNotice error={resource.error} retry={resource.reload} />
      {resource.loading ? (
        <Loading />
      ) : (
        resource.data && (
          <section className="panel">
            {resource.data.items.length === 0 ? (
              <Empty title="No communications found">
                Log a conversation or adjust the filters.
              </Empty>
            ) : (
              resource.data.items.map((record) => (
                <CommunicationRow key={record.id} record={record} />
              ))
            )}
            <Pagination {...resource.data} onPage={setPage} />
          </section>
        )
      )}
    </>
  );
}
export function Notes({ clientId, active, requirementId, onSaved }: RecordProps) {
  const actor = useActor();
  const [page, setPage] = useState(1);
  const [q, setQ] = useState('');
  const [show, setShow] = useState(false);
  const { busy, begin, end } = useSubmission();
  const draft = useDraft();
  const [error, setError] = useState<unknown>(null);
  const [success, setSuccess] = useState(false);
  const resource = useResource<Page<ClientNote>>(
    '/clients/' +
      clientId +
      '/notes?' +
      new URLSearchParams({ page: String(page), q, ...(requirementId ? { requirementId } : {}) }),
  );
  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!begin()) return;
    setError(null);
    const form = new FormData(event.currentTarget);
    try {
      await api('/clients/' + clientId + '/notes', {
        method: 'POST',
        body: {
          body: form.get('body'),
          ...(form.get('requirementId') ? { requirementId: form.get('requirementId') } : {}),
        },
      });
      draft.markSaved();
      setShow(false);
      setSuccess(true);
      onSaved?.();
      resource.reload();
    } catch (e) {
      setError(e);
    } finally {
      end();
    }
  }
  return (
    <>
      <div className="page-heading">
        <div>
          <h2>Internal notes</h2>
          <p>Keep team context separate from client communications.</p>
        </div>
        {active && actor.permissions.includes('note.write') && (
          <Button
            disabled={busy}
            onClick={() => {
              const toggle = () => {
                setShow((v) => !v);
                setSuccess(false);
                setError(null);
              };
              if (show) draft.discard(toggle);
              else toggle();
            }}
            variant={show ? 'secondary' : 'primary'}
          >
            {show ? 'Close form' : 'Add internal note'}
          </Button>
        )}
      </div>
      {success && <Notice>Internal note added.</Notice>}
      {show && (
        <FormFeedback error={error}>
          <form onSubmit={submit} className="form-section mb-5" onChangeCapture={draft.markDirty}>
            <ErrorNotice error={error} />
            <fieldset className="space-y-4" disabled={busy}>
              <Field label="Internal note">
                <textarea name="body" required maxLength={8000} />
              </Field>
              <RequirementPicker
                clientId={clientId}
                requirementId={requirementId}
                onDirty={draft.markDirty}
              />
            </fieldset>
            <Button type="submit" disabled={busy}>
              {busy ? 'Saving…' : 'Save note'}
            </Button>
          </form>
        </FormFeedback>
      )}
      <div className="filters">
        <input
          aria-label="Search notes"
          placeholder="Search internal notes"
          value={q}
          onChange={(e) => {
            setQ(e.target.value);
            setPage(1);
          }}
        />
      </div>
      <ErrorNotice error={resource.error} retry={resource.reload} />
      {resource.loading ? (
        <Loading />
      ) : (
        resource.data && (
          <section className="panel">
            {resource.data.items.length === 0 ? (
              <Empty title="No internal notes found" />
            ) : (
              resource.data.items.map((note) => <NoteRow key={note.id} note={note} />)
            )}
            <Pagination {...resource.data} onPage={setPage} />
          </section>
        )
      )}
    </>
  );
}
export function Files({ clientId, active, requirementId, onSaved }: RecordProps) {
  const actor = useActor();
  const [page, setPage] = useState(1);
  const [q, setQ] = useState('');
  const [includeArchived, setIncludeArchived] = useState(false);
  const [mode, setMode] = useState<'upload' | 'link' | null>(null);
  const { busy, begin, end } = useSubmission();
  const draft = useDraft();
  const [error, setError] = useState<unknown>(null);
  const [message, setMessage] = useState('');
  const [archiveId, setArchiveId] = useState<string | null>(null);
  function switchMode(next: 'upload' | 'link' | null) {
    const change = () => {
      setMode(next);
      setError(null);
    };
    if (mode) draft.discard(change);
    else change();
  }
  const resource = useResource<Page<ClientFile>>(
    '/clients/' +
      clientId +
      '/files?' +
      new URLSearchParams({
        page: String(page),
        q,
        includeArchived: String(includeArchived),
        ...(requirementId ? { requirementId } : {}),
      }),
  );
  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!begin()) return;
    setError(null);
    setMessage('');
    const form = new FormData(event.currentTarget);
    if (!form.get('requirementId')) form.delete('requirementId');
    try {
      if (mode === 'upload')
        await api('/clients/' + clientId + '/files/upload', { method: 'POST', body: form });
      else
        await api('/clients/' + clientId + '/files', {
          method: 'POST',
          body: {
            originalName: form.get('originalName'),
            referenceUrl: form.get('referenceUrl'),
            ...(form.get('requirementId') ? { requirementId: form.get('requirementId') } : {}),
          },
        });
      draft.markSaved();
      setMode(null);
      onSaved?.();
      setMessage(mode === 'upload' ? 'File uploaded privately.' : 'Reference link added.');
      resource.reload();
    } catch (e) {
      setError(e);
    } finally {
      end();
    }
  }
  async function archive(id: string) {
    if (!begin()) return;
    setError(null);
    setMessage('');
    try {
      await api('/files/' + id, { method: 'DELETE' });
      onSaved?.();
      setMessage('Reference archived. Private history is retained.');
      resource.reload();
    } catch (e) {
      setError(e);
    } finally {
      end();
    }
  }
  const write = active && actor.permissions.includes('file.write');
  return (
    <>
      <div className="page-heading">
        <div>
          <h2>Files & references</h2>
          <p>Keep supporting material with the right client or requirement.</p>
        </div>
        {write && (
          <div className="flex gap-2">
            <Button
              variant="secondary"
              disabled={busy}
              onClick={() => {
                switchMode(mode === 'link' ? null : 'link');
              }}
            >
              Add reference link
            </Button>
            <Button
              disabled={busy}
              onClick={() => {
                switchMode(mode === 'upload' ? null : 'upload');
              }}
            >
              Upload file
            </Button>
          </div>
        )}
      </div>
      <ConfirmDialog
        open={Boolean(archiveId)}
        title="Archive this reference?"
        confirmLabel="Archive reference"
        danger
        onCancel={() => setArchiveId(null)}
        onConfirm={() => {
          const id = archiveId;
          setArchiveId(null);
          if (id) void archive(id);
        }}
      >
        The reference will be hidden from the active list. Authorized historical access and
        confirmed attachments are retained.
      </ConfirmDialog>
      {message && <Notice>{message}</Notice>}
      <ErrorNotice error={error} />
      {mode && (
        <FormFeedback error={error} key={mode}>
          <form className="form-section mb-5" onSubmit={submit} onChangeCapture={draft.markDirty}>
            <h3>{mode === 'upload' ? 'Upload supporting file' : 'Add reference link'}</h3>
            <fieldset disabled={busy} className="space-y-4">
              {mode === 'upload' ? (
                <Field
                  label="Supporting file"
                  help="File type, content and size are validated on upload."
                >
                  <input type="file" name="file" required />
                </Field>
              ) : (
                <div className="form-grid">
                  <Field label="Reference name">
                    <input name="originalName" required maxLength={200} />
                  </Field>
                  <Field label="Reference URL">
                    <input name="referenceUrl" type="url" required maxLength={2000} />
                  </Field>
                </div>
              )}
              <RequirementPicker
                clientId={clientId}
                requirementId={requirementId}
                editableOnly
                onDirty={draft.markDirty}
              />
            </fieldset>
            <div className="flex gap-2">
              <Button type="submit" disabled={busy}>
                {busy ? 'Saving…' : mode === 'upload' ? 'Upload privately' : 'Save reference'}
              </Button>
              <Button
                type="button"
                variant="secondary"
                disabled={busy}
                onClick={() => switchMode(null)}
              >
                Cancel
              </Button>
            </div>
          </form>
        </FormFeedback>
      )}
      <div className="filters items-center">
        <input
          aria-label="Search files"
          placeholder="Search file or reference name"
          value={q}
          onChange={(e) => {
            setQ(e.target.value);
            setPage(1);
          }}
        />
        <label className="flex gap-2 items-center">
          <input
            className="h-4 w-4"
            type="checkbox"
            checked={includeArchived}
            onChange={(e) => {
              setIncludeArchived(e.target.checked);
              setPage(1);
            }}
          />
          Include archived references
        </label>
      </div>
      <ErrorNotice error={resource.error} retry={resource.reload} />
      {resource.loading ? (
        <Loading />
      ) : (
        resource.data && (
          <section className="panel">
            {resource.data.items.length === 0 ? (
              <Empty title="No files or references found" />
            ) : (
              resource.data.items.map((file) => (
                <FileRow
                  key={file.id}
                  file={file}
                  busy={busy}
                  onArchive={write ? setArchiveId : undefined}
                />
              ))
            )}
            <Pagination {...resource.data} onPage={setPage} />
          </section>
        )
      )}
    </>
  );
}
export function Timeline({ clientId }: { clientId: string }) {
  const [page, setPage] = useState(1);
  const [sort, setSort] = useState('newest');
  const [q, setQ] = useState('');
  const resource = useResource<Page<Activity>>(
    '/clients/' + clientId + '/timeline?' + new URLSearchParams({ page: String(page), sort, q }),
  );
  return (
    <>
      <div className="page-heading">
        <div>
          <h2>Activity timeline</h2>
          <p>Meaningful client activity with the responsible person and time.</p>
        </div>
      </div>
      <div className="filters">
        <input
          aria-label="Search timeline"
          placeholder="Search activity or event type"
          value={q}
          onChange={(e) => {
            setQ(e.target.value);
            setPage(1);
          }}
        />
        <select
          aria-label="Timeline order"
          value={sort}
          onChange={(e) => {
            setSort(e.target.value);
            setPage(1);
          }}
        >
          <option value="newest">Newest first</option>
          <option value="oldest">Oldest first</option>
        </select>
      </div>
      <ErrorNotice error={resource.error} retry={resource.reload} />
      {resource.loading ? (
        <Loading />
      ) : (
        resource.data && (
          <section className="panel">
            {resource.data.items.length === 0 ? (
              <Empty title="No activity found" />
            ) : (
              <TimelineEntries entries={resource.data.items} />
            )}
            <Pagination {...resource.data} onPage={setPage} />
          </section>
        )
      )}
    </>
  );
}
