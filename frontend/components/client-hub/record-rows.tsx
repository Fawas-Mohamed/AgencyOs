'use client';
import Link from 'next/link';
import { Download, ExternalLink, FileText } from 'lucide-react';
import type { Activity, ClientFile, ClientNote, Communication } from '@/lib/types/hub';
import { dateTime, label } from '@/lib/utils/format';
import { Button } from '@/components/ui/primitives';
export function CommunicationRow({ record }: { record: Communication }) {
  return (
    <article className="record-row">
      <div className="flex flex-wrap justify-between gap-2">
        <h3>{record.subject}</h3>
        <span className="badge badge-neutral">{label(record.type)}</span>
      </div>
      <p className="text-xs text-secondary mt-2">
        {dateTime(record.occurredAt)} · Logged by {record.createdBy.displayName}
      </p>
      <p className="whitespace-pre-wrap break-words mt-3">{record.summary}</p>
      {record.participants.length > 0 && (
        <p className="text-secondary mt-2">Participants: {record.participants.join(', ')}</p>
      )}
      {record.followUp && (
        <p className="mt-2 whitespace-pre-wrap break-words">
          <strong>Follow-up:</strong> {record.followUp}
        </p>
      )}
      {record.requirementId && (
        <Link
          className="text-link inline-block mt-2 text-xs"
          href={'/client-hub/clients/' + record.clientId + '/requirements/' + record.requirementId}
        >
          Linked requirement
        </Link>
      )}
    </article>
  );
}
export function NoteRow({ note }: { note: ClientNote }) {
  return (
    <article className="record-row">
      <p className="text-xs font-medium text-secondary mb-2">Internal note</p>
      <p className="whitespace-pre-wrap break-words">{note.body}</p>
      <p className="text-xs text-secondary mt-3">
        {note.createdBy.displayName} · {dateTime(note.createdAt)}
      </p>
    </article>
  );
}
export function FileRow({
  file,
  onArchive,
  busy = false,
}: {
  file: ClientFile;
  onArchive?: (id: string) => void;
  busy?: boolean;
}) {
  const base = process.env.NEXT_PUBLIC_API_BASE_URL ?? '/api';
  return (
    <div className="record-row flex flex-wrap gap-3 justify-between">
      <div className="flex min-w-0 gap-3">
        <FileText className="shrink-0 text-secondary mt-1" size={18} />
        <div className="min-w-0">
          <p className="font-medium break-words">
            {file.originalName}
            {file.archivedAt && <span className="badge badge-neutral ml-2">Archived</span>}
          </p>
          <p className="text-xs text-secondary mt-1">
            {file.referenceUrl
              ? 'Reference link'
              : file.mimeType + ' · ' + Math.ceil((file.size ?? 0) / 1024) + ' KB'}{' '}
            · {file.uploadedBy.displayName} · {dateTime(file.createdAt)}
          </p>
          {file.requirementId && (
            <Link
              className="text-link text-xs mt-1 inline-block"
              href={'/client-hub/clients/' + file.clientId + '/requirements/' + file.requirementId}
            >
              Linked requirement
            </Link>
          )}
        </div>
      </div>
      <div className="flex items-center gap-2">
        {file.referenceUrl ? (
          <a
            className="btn btn-secondary"
            href={file.referenceUrl}
            target="_blank"
            rel="noreferrer"
          >
            <ExternalLink size={15} />
            Open link
          </a>
        ) : (
          <a className="btn btn-secondary" href={base + '/files/' + file.id + '/download'}>
            <Download size={15} />
            Download
          </a>
        )}
        {onArchive && !file.archivedAt && (
          <Button variant="ghost" disabled={busy} onClick={() => onArchive(file.id)}>
            Archive
          </Button>
        )}
      </div>
    </div>
  );
}
export function TimelineEntries({ entries }: { entries: Activity[] }) {
  return (
    <ol className="p-5 ml-2">
      {entries.map((event) => (
        <li className="timeline-item" key={event.id}>
          <span className="timeline-dot" aria-hidden="true" />
          <p className="font-medium">{event.summary}</p>
          <p className="text-xs text-secondary mt-1">
            {label(event.eventType)} · {dateTime(event.createdAt)} · {event.actor.displayName}
          </p>
          {typeof event.metadata?.reason === 'string' && event.metadata.reason && (
            <p className="mt-2 text-secondary whitespace-pre-wrap break-words">
              {event.metadata.reason}
            </p>
          )}
        </li>
      ))}
    </ol>
  );
}
