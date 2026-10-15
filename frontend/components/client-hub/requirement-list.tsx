'use client';
import Link from 'next/link';
import { useState } from 'react';
import { Plus } from 'lucide-react';
import { useResource } from '@/lib/api/client';
import type { Page, Requirement } from '@/lib/types/hub';
import { dateTime, label } from '@/lib/utils/format';
import { Badge, Empty, ErrorNotice, Loading, Pagination } from '@/components/ui/primitives';
import { useActor } from './shell';
export function RequirementList({ clientId, active }: { clientId: string; active: boolean }) {
  const actor = useActor();
  const [q, setQ] = useState('');
  const [status, setStatus] = useState('');
  const [page, setPage] = useState(1);
  const query = new URLSearchParams({ page: String(page), q, ...(status ? { status } : {}) });
  const resource = useResource<Page<Requirement>>(
    '/clients/' + clientId + '/requirements?' + query,
  );
  return (
    <>
      <div className="page-heading">
        <div>
          <h2>Requirements</h2>
          <p>Collect scope, review changes and preserve agreed versions.</p>
        </div>
        {active && actor.permissions.includes('requirement.write') && (
          <Link
            className="btn btn-primary"
            href={'/client-hub/clients/' + clientId + '/requirements/new'}
          >
            <Plus size={16} />
            New requirement
          </Link>
        )}
      </div>
      <div className="filters">
        <input
          aria-label="Search requirements"
          placeholder="Search title or objective"
          value={q}
          onChange={(e) => {
            setQ(e.target.value);
            setPage(1);
          }}
        />
        <select
          aria-label="Requirement status"
          value={status}
          onChange={(e) => {
            setStatus(e.target.value);
            setPage(1);
          }}
        >
          <option value="">All statuses</option>
          {['DRAFT', 'UNDER_REVIEW', 'CONFIRMED', 'CHANGES_REQUESTED', 'ARCHIVED'].map((s) => (
            <option key={s} value={s}>
              {label(s)}
            </option>
          ))}
        </select>
      </div>
      <ErrorNotice error={resource.error} retry={resource.reload} />
      {resource.loading ? (
        <Loading />
      ) : (
        resource.data && (
          <div className="panel">
            {resource.data.items.length === 0 ? (
              <Empty title="No requirements found">
                Create a requirement or adjust the filters.
              </Empty>
            ) : (
              <div className="table-wrap">
                <table className="data-table">
                  <thead>
                    <tr>
                      <th>Requirement</th>
                      <th>Status</th>
                      <th>Prepared by</th>
                      <th>Updated</th>
                    </tr>
                  </thead>
                  <tbody>
                    {resource.data.items.map((record) => (
                      <tr key={record.id}>
                        <td>
                          <Link
                            className="text-link"
                            href={'/client-hub/clients/' + clientId + '/requirements/' + record.id}
                          >
                            {record.title}
                          </Link>
                          <p className="text-xs text-secondary mt-1">Version {record.version}</p>
                        </td>
                        <td>
                          <Badge status={record.status} />
                        </td>
                        <td>{record.preparedBy.displayName}</td>
                        <td className="text-xs text-secondary">{dateTime(record.updatedAt)}</td>
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
