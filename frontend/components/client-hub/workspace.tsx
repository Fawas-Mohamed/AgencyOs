'use client';
import Link from 'next/link';
import { ArrowLeft, Pencil } from 'lucide-react';
import { useResource } from '@/lib/api/client';
import type { Hub } from '@/lib/types/hub';
import { dateTime } from '@/lib/utils/format';
import { Badge, Empty, ErrorNotice, Loading } from '@/components/ui/primitives';
import { RequirementList } from './requirement-list';
import { Communications, Files, Notes, Timeline } from './workspace-records';
import { useActor } from './shell';
const tabs = [
  ['overview', 'Overview'],
  ['requirements', 'Requirements'],
  ['communications', 'Communications'],
  ['files', 'Files'],
  ['notes', 'Notes'],
  ['timeline', 'Activity'],
];
export function Workspace({
  clientId,
  tab = 'overview',
  requirementId,
}: {
  clientId: string;
  tab?: string;
  saved?: boolean;
  requirementId?: string;
}) {
  const actor = useActor();
  const resource = useResource<Hub>('/clients/' + clientId + '/hub');
  if (resource.loading && !resource.data) return <Loading />;
  if (resource.error) return <ErrorNotice error={resource.error} retry={resource.reload} />;
  if (!resource.data) return null;
  const hub = resource.data;
  const client = hub.client;
  const active = client.status === 'ACTIVE';
  const permission = (key: string) => actor.permissions.includes(key);
  const allowedTabs = tabs.filter(
    ([key]) =>
      key === 'overview' ||
      permission(
        key === 'requirements'
          ? 'requirement.read'
          : key === 'communications'
            ? 'communication.read'
            : key === 'files'
              ? 'file.read'
              : key === 'notes'
                ? 'note.read'
                : 'timeline.read',
      ),
  );
  const selected = allowedTabs.some(([key]) => key === tab) ? tab : 'overview';
  return (
    <>
      <Link className="text-link inline-flex gap-2 mb-4" href="/client-hub">
        <ArrowLeft size={16} />
        All clients
      </Link>
      <div className="page-heading">
        <div>
          <div className="flex flex-wrap items-center gap-3">
            <h1>{client.name}</h1>
            <Badge status={client.status} />
          </div>
          <p>
            {client.company} · {client.contactName}
          </p>
        </div>
        {permission('client.write') && (
          <Link className="btn btn-secondary" href={'/client-hub/clients/' + clientId + '/edit'}>
            <Pencil size={16} />
            Edit client
          </Link>
        )}
      </div>
      {!active && (
        <div className="panel p-4 mb-4 text-secondary">
          This client is archived. Its records remain available for historical review.
        </div>
      )}
      <nav className="tabs" aria-label="Client workspace sections">
        {allowedTabs.map(([key, title]) => (
          <Link
            key={key}
            href={'/client-hub/clients/' + clientId + '?tab=' + key}
            aria-label={title}
            aria-current={selected === key ? 'page' : undefined}
          >
            {title}
            {key !== 'overview' && hub.counts[key as keyof Hub['counts']] !== null && (
              <span aria-hidden="true" className="ml-2 text-xs">
                {hub.counts[key as keyof Hub['counts']]}
              </span>
            )}
          </Link>
        ))}
      </nav>
      {selected === 'overview' && (
        <div className="grid gap-5 xl:grid-cols-2">
          <section className="panel">
            <div className="panel-heading">
              <h2>Client details</h2>
            </div>
            <dl className="detail-grid p-5">
              <div>
                <dt>Company</dt>
                <dd>{client.company}</dd>
              </div>
              <div>
                <dt>Primary contact</dt>
                <dd>{client.contactName}</dd>
              </div>
              <div>
                <dt>Email</dt>
                <dd>
                  {client.email ? (
                    <a className="text-link" href={'mailto:' + client.email}>
                      {client.email}
                    </a>
                  ) : (
                    'Not provided'
                  )}
                </dd>
              </div>
              <div>
                <dt>Phone</dt>
                <dd>{client.phone ?? 'Not provided'}</dd>
              </div>
              <div>
                <dt>Website</dt>
                <dd>
                  {client.website ? (
                    <a className="text-link" href={client.website} target="_blank" rel="noreferrer">
                      Open website
                    </a>
                  ) : (
                    'Not provided'
                  )}
                </dd>
              </div>
              <div>
                <dt>Last updated</dt>
                <dd>{dateTime(client.updatedAt)}</dd>
              </div>
            </dl>
          </section>
          {hub.requirements && (
            <section className="panel">
              <div className="panel-heading">
                <h2>Recent requirements</h2>
                <Link className="text-link" href={'?tab=requirements'}>
                  View all
                </Link>
              </div>
              {hub.requirements.length === 0 ? (
                <Empty title="No requirements yet" />
              ) : (
                hub.requirements.map((r) => (
                  <div
                    className="record-row flex flex-wrap items-center justify-between gap-2"
                    key={r.id}
                  >
                    <div>
                      <Link
                        className="text-link"
                        href={'/client-hub/clients/' + clientId + '/requirements/' + r.id}
                      >
                        {r.title}
                      </Link>
                      <p className="text-xs text-secondary mt-1">
                        Version {r.version} · {r.preparedBy.displayName}
                      </p>
                    </div>
                    <Badge status={r.status} />
                  </div>
                ))
              )}
            </section>
          )}
          {hub.notes && (
            <section className="panel">
              <div className="panel-heading">
                <h2>Internal context</h2>
                <Link className="text-link" href={'?tab=notes'}>
                  View notes
                </Link>
              </div>
              {hub.notes.length === 0 ? (
                <Empty title="No internal notes" />
              ) : (
                hub.notes.slice(0, 3).map((note) => (
                  <div className="record-row" key={note.id}>
                    <p className="whitespace-pre-wrap break-words">{note.body}</p>
                    <p className="text-xs text-secondary mt-2">
                      {note.createdBy.displayName} · {dateTime(note.createdAt)}
                    </p>
                  </div>
                ))
              )}
            </section>
          )}
          <section className="panel p-5">
            <h2>Related business records</h2>
            <p className="text-secondary mt-2">
              Shared records are not connected in this standalone workspace.
            </p>
            <details className="mt-4">
              <summary className="cursor-pointer text-primary">View integration areas</summary>
              <ul className="mt-3 space-y-2 text-secondary">
                {hub.relatedRecords.map((record) => (
                  <li key={record.kind} className="capitalize">
                    {record.kind}: provider unavailable
                  </li>
                ))}
              </ul>
            </details>
          </section>
        </div>
      )}
      {requirementId && ['communications', 'files', 'notes'].includes(selected) && (
        <div className="panel p-4 mb-4 flex flex-wrap gap-3 justify-between">
          <span>Showing entries linked to the selected requirement.</span>
          <Link className="text-link" href={'?tab=' + selected}>
            Show all client entries
          </Link>
        </div>
      )}
      {selected === 'requirements' && <RequirementList clientId={clientId} active={active} />}
      {selected === 'communications' && (
        <Communications
          clientId={clientId}
          active={active}
          requirementId={requirementId}
          onSaved={resource.reload}
        />
      )}
      {selected === 'files' && (
        <Files
          clientId={clientId}
          active={active}
          requirementId={requirementId}
          onSaved={resource.reload}
        />
      )}
      {selected === 'notes' && (
        <Notes
          clientId={clientId}
          active={active}
          requirementId={requirementId}
          onSaved={resource.reload}
        />
      )}
      {selected === 'timeline' && <Timeline clientId={clientId} />}
    </>
  );
}
