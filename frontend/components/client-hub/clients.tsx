'use client';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { ArrowLeft, Plus } from 'lucide-react';
import { api, useResource } from '@/lib/api/client';
import type { Client, Hub, Page } from '@/lib/types/hub';
import { dateTime } from '@/lib/utils/format';
import {
  Badge,
  Button,
  Empty,
  ErrorNotice,
  Field,
  Loading,
  Pagination,
} from '@/components/ui/primitives';
import { FormFeedback } from '@/components/ui/form-feedback';
import { useDraft, useNavigationGuard } from '@/components/ui/navigation-guard';
import { useSubmission } from '@/lib/utils/form-state';
import { useActor } from './shell';
export function ClientList({ initialQuery = '' }: { initialQuery?: string }) {
  const actor = useActor();
  const [q, setQ] = useState(initialQuery);
  const [status, setStatus] = useState('');
  const [page, setPage] = useState(1);
  const query = new URLSearchParams({ page: String(page), q, ...(status ? { status } : {}) });
  const resource = useResource<Page<Client>>('/clients?' + query);
  return (
    <>
      <div className="page-heading">
        <div>
          <p className="text-xs uppercase tracking-wide mb-1">Client operations</p>
          <h1>Clients</h1>
          <p>Open a client to manage requirements, conversations and supporting material.</p>
        </div>
        {actor.permissions.includes('client.write') && (
          <Link className="btn btn-primary" href="/client-hub/clients/new">
            <Plus size={16} />
            New client
          </Link>
        )}
      </div>
      <div className="filters">
        <input
          aria-label="Filter clients"
          placeholder="Search name, company or contact"
          value={q}
          onChange={(e) => {
            setQ(e.target.value);
            setPage(1);
          }}
        />
        <select
          aria-label="Client status"
          value={status}
          onChange={(e) => {
            setStatus(e.target.value);
            setPage(1);
          }}
        >
          <option value="">All clients</option>
          <option value="ACTIVE">Active</option>
          <option value="ARCHIVED">Archived</option>
        </select>
      </div>
      <ErrorNotice error={resource.error} retry={resource.reload} />
      {resource.loading ? (
        <Loading />
      ) : (
        resource.data && (
          <div className="panel">
            {resource.data.items.length === 0 ? (
              <Empty title="No clients found">Create a client or adjust your search.</Empty>
            ) : (
              <div className="table-wrap">
                <table className="data-table">
                  <thead>
                    <tr>
                      <th>Client / company</th>
                      <th>Primary contact</th>
                      <th>Status</th>
                      <th>Updated</th>
                    </tr>
                  </thead>
                  <tbody>
                    {resource.data.items.map((client) => (
                      <tr key={client.id}>
                        <td>
                          <Link className="text-link" href={'/client-hub/clients/' + client.id}>
                            {client.name}
                          </Link>
                          <p className="text-xs text-secondary mt-1">{client.company}</p>
                        </td>
                        <td>
                          {client.contactName}
                          <p className="text-xs text-secondary mt-1">
                            {client.email ?? 'No email provided'}
                          </p>
                        </td>
                        <td>
                          <Badge status={client.status} />
                        </td>
                        <td className="text-xs text-secondary whitespace-nowrap">
                          {dateTime(client.updatedAt)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
            <Pagination {...resource.data} onPage={setPage} />
          </div>
        )
      )}
    </>
  );
}
export function ClientForm({ clientId }: { clientId?: string }) {
  const actor = useActor();
  const router = useRouter();
  const resource = useResource<Hub>(clientId ? '/clients/' + clientId + '/hub' : null);
  const { busy, begin, end } = useSubmission();
  const draft = useDraft();
  const guard = useNavigationGuard();
  const [error, setError] = useState<unknown>(null);
  if (!actor.permissions.includes('client.write'))
    return <Empty title="You do not have permission to manage clients." />;
  if (clientId && resource.loading) return <Loading />;
  if (resource.error) return <ErrorNotice error={resource.error} retry={resource.reload} />;
  const client = resource.data?.client;
  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!begin()) return;
    setError(null);
    const values = new FormData(event.currentTarget);
    const body = {
      name: values.get('name'),
      company: values.get('company'),
      contactName: values.get('contactName'),
      email: values.get('email') || null,
      phone: values.get('phone') || null,
      website: values.get('website') || null,
      ...(clientId ? { status: values.get('status') } : {}),
    };
    try {
      const result = await api<Client>(clientId ? '/clients/' + clientId : '/clients', {
        method: clientId ? 'PATCH' : 'POST',
        body,
      });
      draft.markSaved();
      guard.flash('Client saved successfully.');
      router.push('/client-hub/clients/' + result.id);
    } catch (e) {
      setError(e);
      end();
    }
  }
  return (
    <>
      <Link
        className="text-link inline-flex gap-2 mb-4"
        href={clientId ? '/client-hub/clients/' + clientId : '/client-hub'}
      >
        <ArrowLeft size={16} />
        Back
      </Link>
      <div className="page-heading">
        <div>
          <h1>{clientId ? 'Edit client' : 'New client'}</h1>
          <p>Capture the client and their primary point of contact.</p>
        </div>
      </div>
      <ErrorNotice error={error} />
      <FormFeedback error={error}>
        <form
          className="form-section max-w-3xl"
          onSubmit={submit}
          onChangeCapture={draft.markDirty}
        >
          <fieldset disabled={busy} className="form-grid">
            <Field label="Client name">
              <input name="name" defaultValue={client?.name} required maxLength={160} />
            </Field>
            <Field label="Company">
              <input name="company" defaultValue={client?.company} required maxLength={160} />
            </Field>
            <Field label="Primary contact">
              <input
                name="contactName"
                defaultValue={client?.contactName}
                required
                maxLength={160}
              />
            </Field>
            <Field label="Email">
              <input name="email" type="email" defaultValue={client?.email ?? ''} maxLength={254} />
            </Field>
            <Field label="Phone">
              <input name="phone" type="tel" defaultValue={client?.phone ?? ''} maxLength={50} />
            </Field>
            <Field label="Website">
              <input
                name="website"
                type="url"
                defaultValue={client?.website ?? ''}
                maxLength={2000}
              />
            </Field>
            {client && (
              <Field
                label="Client status"
                help="Archived clients remain available for history and their child records become read-only."
              >
                <select name="status" defaultValue={client.status}>
                  <option value="ACTIVE">Active</option>
                  <option value="ARCHIVED">Archived</option>
                </select>
              </Field>
            )}
          </fieldset>
          <div className="flex gap-3">
            <Button type="submit" disabled={busy}>
              {busy ? 'Saving…' : 'Save client'}
            </Button>
            <Link
              className="btn btn-secondary"
              href={clientId ? '/client-hub/clients/' + clientId : '/client-hub'}
            >
              Cancel
            </Link>
          </div>
        </form>
      </FormFeedback>
    </>
  );
}
