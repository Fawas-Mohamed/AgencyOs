'use client';
import { useState } from 'react';
import { ApiFailure, useResource } from '@/lib/api/client';
import { saveJson } from '@/lib/api/downloads';
import type { Requirement } from '@/lib/types/hub';
import { Button, ErrorNotice, Loading } from '@/components/ui/primitives';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { label } from '@/lib/utils/format';

export function ConflictRecovery({
  error,
  requirementId,
  getDraft,
  onReplace,
}: {
  error: unknown;
  requirementId: string;
  getDraft: () => unknown;
  onReplace: () => void;
}) {
  const conflict = error instanceof ApiFailure && error.status === 409;
  const latest = useResource<Requirement>(conflict ? '/requirements/' + requirementId : null);
  const [replace, setReplace] = useState(false);
  if (!conflict) return null;
  return (
    <section className="panel p-5 my-4 space-y-3" aria-label="Edit conflict recovery">
      <h2>Your draft has been kept</h2>
      <p>
        The record changed while this form was open. Review the latest record before replacing your
        inputs. Saving again will not overwrite the newer version.
      </p>
      {latest.loading && <Loading />}
      <ErrorNotice error={latest.error} retry={latest.reload} />
      {latest.data && (
        <details open>
          <summary className="text-link cursor-pointer">Latest saved record</summary>
          <dl className="detail-grid mt-3">
            <div>
              <dt>Active version / state</dt>
              <dd>
                {latest.data.version} · {label(latest.data.status)} · edit check{' '}
                {latest.data.lockVersion}
              </dd>
            </div>
            <div>
              <dt>Title</dt>
              <dd>{latest.data.title}</dd>
            </div>
            <div>
              <dt>Objective</dt>
              <dd>{latest.data.objective}</dd>
            </div>
            <div>
              <dt>Items</dt>
              <dd>{latest.data.items.map((item) => item.title).join(', ')}</dd>
            </div>
          </dl>
          <details className="mt-3">
            <summary className="text-link cursor-pointer">Complete latest content</summary>
            <pre className="mt-2 max-h-80 overflow-auto whitespace-pre-wrap break-all text-xs">
              {JSON.stringify(latest.data, null, 2)}
            </pre>
          </details>
        </details>
      )}
      <div className="flex flex-wrap gap-2">
        <Button
          type="button"
          variant="secondary"
          onClick={() =>
            saveJson(
              { approved: false, requirementId, draft: getDraft() },
              'unapproved-draft-' + requirementId + '.json',
            )
          }
        >
          Download my unsaved draft
        </Button>
        <Button
          type="button"
          disabled={!latest.data || latest.loading}
          onClick={() => setReplace(true)}
        >
          Replace form with latest
        </Button>
      </div>
      <ConfirmDialog
        open={replace}
        title="Replace your unsaved inputs?"
        confirmLabel="Load latest record"
        onCancel={() => setReplace(false)}
        onConfirm={() => {
          setReplace(false);
          onReplace();
        }}
      >
        Your current inputs will be discarded. Download your draft first if you need to reapply any
        changes. Confirmed content remains read-only.
      </ConfirmDialog>
    </section>
  );
}
