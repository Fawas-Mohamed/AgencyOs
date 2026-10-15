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
import { useActor } from './shell';
import { CommunicationRow, FileRow, NoteRow, TimelineEntries } from './record-rows';
function RequirementPicker({ clientId }: { clientId: string }) {
  const actor = useActor();
  const [q, setQ] = useState('');
  const resource = useResource<Page<Requirement>>(
    actor.permissions.includes('requirement.read')
      ? '/clients/' + clientId + '/requirements?limit=100&q=' + encodeURIComponent(q)
      : null,
  );
  if (!actor.permissions.includes('requirement.read')) return null;
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
        help="Choose a requirement only when this entry relates to it."
      >
        <select name="requirementId" defaultValue="" disabled={resource.loading}>
          <option value="">Client-level entry</option>
          {resource.data?.items.map((r) => (
            <option value={r.id} key={r.id}>
              {r.title} · {label(r.status)}
            </option>
          ))}
        </select>
      </Field>
      <ErrorNotice error={resource.error} retry={resource.reload} />
    </div>
  );
}
function localNow() {
  const value = new Date();
  return new Date(value.getTime() - value.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
}
export function Communications({ clientId, active }: { clientId: string; active: boolean }) {
  const actor = useActor();
  const [q, setQ] = useState('');
  const [type, setType] = useState('');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [page, setPage] = useState(1);
  const [show, setShow] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const [success, setSuccess] = useState(false);
  const query = new URLSearchParams({
    q,
    page: String(page),
    ...(type ? { type } : {}),
    ...(from ? { from: new Date(from + 'T00:00:00').toISOString() } : {}),
    ...(to ? { to: new Date(to + 'T23:59:59.999').toISOString() } : {}),
  });
  const resource = useResource<Page<Communication>>(
    '/clients/' + clientId + '/communications?' + query,
  );
  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;
    setBusy(true);
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
      setShow(false);
      setSuccess(true);
      resource.reload();
    } catch (e) {
      setError(e);
    } finally {
      setBusy(false);
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
            onClick={() => {
              setShow((v) => !v);
              setSuccess(false);
              setError(null);
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
        <form className="form-section mb-5" onSubmit={submit}>
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
              <Field label="Occurred at">
                <input type="datetime-local" name="occurredAt" defaultValue={localNow()} required />
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
            <RequirementPicker clientId={clientId} />
          </fieldset>
          <Button type="submit" disabled={busy}>
            {busy ? 'Saving…' : 'Save communication'}
          </Button>
        </form>
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
export function Notes({ clientId, active }: { clientId: string; active: boolean }) {
  const actor = useActor();
  const [page, setPage] = useState(1);
  const [q, setQ] = useState('');
  const [show, setShow] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const [success, setSuccess] = useState(false);
  const resource = useResource<Page<ClientNote>>(
    '/clients/' + clientId + '/notes?' + new URLSearchParams({ page: String(page), q }),
  );
  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;
    setBusy(true);
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
      setShow(false);
      setSuccess(true);
      resource.reload();
    } catch (e) {
      setError(e);
    } finally {
      setBusy(false);
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
            onClick={() => {
              setShow((v) => !v);
              setSuccess(false);
              setError(null);
            }}
            variant={show ? 'secondary' : 'primary'}
          >
            {show ? 'Close form' : 'Add internal note'}
          </Button>
        )}
      </div>
      {success && <Notice>Internal note added.</Notice>}
      {show && (
        <form onSubmit={submit} className="form-section mb-5">
          <ErrorNotice error={error} />
          <fieldset className="space-y-4" disabled={busy}>
            <Field label="Internal note">
              <textarea name="body" required maxLength={8000} />
            </Field>
            <RequirementPicker clientId={clientId} />
          </fieldset>
          <Button type="submit" disabled={busy}>
            {busy ? 'Saving…' : 'Save note'}
          </Button>
        </form>
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
export function Files({ clientId, active }: { clientId: string; active: boolean }) {
  const actor = useActor();
  const [page, setPage] = useState(1);
  const [q, setQ] = useState('');
  const [includeArchived, setIncludeArchived] = useState(false);
  const [mode, setMode] = useState<'upload' | 'link' | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const [message, setMessage] = useState('');
  const resource = useResource<Page<ClientFile>>(
    '/clients/' +
      clientId +
      '/files?' +
      new URLSearchParams({ page: String(page), q, includeArchived: String(includeArchived) }),
  );
  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;
    setBusy(true);
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
      setMode(null);
      setMessage(mode === 'upload' ? 'File uploaded privately.' : 'Reference link added.');
      resource.reload();
    } catch (e) {
      setError(e);
    } finally {
      setBusy(false);
    }
  }
  async function archive(id: string) {
    if (busy) return;
    setBusy(true);
    setError(null);
    setMessage('');
    try {
      await api('/files/' + id, { method: 'DELETE' });
      setMessage('Reference archived. Private history is retained.');
      resource.reload();
    } catch (e) {
      setError(e);
    } finally {
      setBusy(false);
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
                setMode(mode === 'link' ? null : 'link');
                setError(null);
              }}
            >
              Add reference link
            </Button>
            <Button
              disabled={busy}
              onClick={() => {
                setMode(mode === 'upload' ? null : 'upload');
                setError(null);
              }}
            >
              Upload file
            </Button>
          </div>
        )}
      </div>
      {message && <Notice>{message}</Notice>}
      <ErrorNotice error={error} />
      {mode && (
        <form className="form-section mb-5" onSubmit={submit} key={mode}>
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
            <RequirementPicker clientId={clientId} />
          </fieldset>
          <div className="flex gap-2">
            <Button type="submit" disabled={busy}>
              {busy ? 'Saving…' : mode === 'upload' ? 'Upload privately' : 'Save reference'}
            </Button>
            <Button type="button" variant="secondary" disabled={busy} onClick={() => setMode(null)}>
              Cancel
            </Button>
          </div>
        </form>
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
                  onArchive={write ? archive : undefined}
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
