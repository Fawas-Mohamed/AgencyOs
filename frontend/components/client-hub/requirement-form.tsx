'use client';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useRef, useState } from 'react';
import { ArrowDown, ArrowLeft, ArrowUp, Plus, Trash2 } from 'lucide-react';
import { api, useResource } from '@/lib/api/client';
import type { Hub, Requirement, RequirementContent, RequirementItem } from '@/lib/types/hub';
import { label } from '@/lib/utils/format';
import { Button, Empty, ErrorNotice, Field, Loading } from '@/components/ui/primitives';
import { FormFeedback } from '@/components/ui/form-feedback';
import { useDraft, useNavigationGuard } from '@/components/ui/navigation-guard';
import { useSubmission } from '@/lib/utils/form-state';
import { ConflictRecovery } from './conflict-recovery';
import { useActor } from './shell';
function blankItem(): RequirementItem {
  return {
    id: crypto.randomUUID(),
    title: '',
    description: '',
    category: '',
    priority: 'MEDIUM',
    notes: '',
  };
}
function initialContent(record?: Requirement): RequirementContent {
  return {
    title: record?.title ?? '',
    objective: record?.objective ?? '',
    services: record?.services ?? [],
    items: record?.items ?? [blankItem()],
    designPreferences: record?.designPreferences ?? '',
    referenceLinks: record?.referenceLinks ?? [],
    constraints: record?.constraints ?? '',
    assumptions: record?.assumptions ?? '',
    internalRecommendations: record?.internalRecommendations ?? '',
    clientNotes: record?.clientNotes ?? '',
    timeline: record?.timeline ?? '',
    targetDate: record?.targetDate?.slice(0, 10) ?? null,
    budgetMin: record?.budgetMin ?? null,
    budgetMax: record?.budgetMax ?? null,
    currency: record?.currency ?? null,
  };
}
export function RequirementForm({
  clientId,
  requirementId,
}: {
  clientId: string;
  requirementId?: string;
}) {
  const actor = useActor();
  const hub = useResource<Hub>('/clients/' + clientId + '/hub');
  const record = useResource<Requirement>(requirementId ? '/requirements/' + requirementId : null);
  if (hub.loading || (requirementId && record.loading)) return <Loading />;
  if (hub.error || record.error)
    return (
      <ErrorNotice
        error={hub.error ?? record.error}
        retry={() => {
          hub.reload();
          record.reload();
        }}
      />
    );
  if (record.data && record.data.clientId !== clientId)
    return <Empty title="Requirement not found" />;
  if (
    !actor.permissions.includes('requirement.write') ||
    hub.data?.client.status !== 'ACTIVE' ||
    (record.data && !record.data.editAllowed)
  )
    return (
      <Empty title="This requirement cannot be edited">
        Use the review screen to reopen confirmed content when permitted.
      </Empty>
    );
  return (
    <ContentForm
      clientId={clientId}
      onReload={record.reload}
      record={record.data ?? undefined}
      key={record.data?.lockVersion ?? 'new'}
    />
  );
}
function ContentForm({
  clientId,
  record,
  onReload,
}: {
  clientId: string;
  record?: Requirement;
  onReload: () => void;
}) {
  const router = useRouter();
  const [form, setForm] = useState<RequirementContent>(() => initialContent(record));
  const [services, setServices] = useState(form.services.join(', '));
  const [references, setReferences] = useState(form.referenceLinks.join('\n'));
  const { busy, begin, end } = useSubmission();
  const draft = useDraft();
  const guard = useNavigationGuard();
  const formRef = useRef<HTMLFormElement>(null);
  const [announcement, setAnnouncement] = useState('');
  const [error, setError] = useState<unknown>(null);
  function update<K extends keyof RequirementContent>(key: K, value: RequirementContent[K]) {
    draft.markDirty();
    setForm((previous) => ({ ...previous, [key]: value }));
  }
  function itemUpdate(index: number, key: keyof RequirementItem, value: string) {
    update(
      'items',
      form.items.map((item, i) => (i === index ? { ...item, [key]: value } : item)),
    );
  }
  function move(index: number, direction: number) {
    const items = [...form.items];
    [items[index], items[index + direction]] = [items[index + direction], items[index]];
    update('items', items);
    setAnnouncement('Item moved to position ' + (index + direction + 1) + '.');
    requestAnimationFrame(() =>
      formRef.current
        ?.querySelector<HTMLInputElement>('[data-item="' + items[index + direction].id + '"] input')
        ?.focus(),
    );
  }
  function payload() {
    return {
      ...form,
      services: services
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean),
      referenceLinks: references
        .split(/\r?\n/)
        .map((s) => s.trim())
        .filter(Boolean),
      items: form.items.map(({ title, description, category, priority, notes }) => ({
        title,
        description,
        category,
        priority,
        notes,
      })),
      ...(record ? { expectedVersion: record.lockVersion } : {}),
    };
  }
  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (!begin()) return;
    setError(null);
    const body = payload();
    try {
      const result = await api<Requirement>(
        record ? '/requirements/' + record.id : '/clients/' + clientId + '/requirements',
        { method: record ? 'PATCH' : 'POST', body },
      );
      draft.markSaved();
      guard.flash('Requirement saved successfully.');
      router.push('/client-hub/clients/' + clientId + '/requirements/' + result.id);
    } catch (e) {
      setError(e);
      end();
    }
  }
  const back = record
    ? '/client-hub/clients/' + clientId + '/requirements/' + record.id
    : '/client-hub/clients/' + clientId + '?tab=requirements';
  return (
    <>
      <Link href={back} className="text-link inline-flex items-center gap-2 mb-4">
        <ArrowLeft size={16} />
        Back
      </Link>
      <div className="page-heading">
        <div>
          <h1>{record ? 'Edit requirement' : 'New requirement'}</h1>
          <p>
            {record
              ? 'Version ' + record.version + ' · agreed versions remain in history.'
              : 'Collect a clear, structured brief for review.'}
          </p>
        </div>
      </div>
      <ErrorNotice error={error} />
      {record && (
        <ConflictRecovery
          error={error}
          requirementId={record.id}
          getDraft={payload}
          onReplace={() => {
            draft.markSaved();
            onReload();
          }}
        />
      )}
      <FormFeedback error={error}>
        <form
          ref={formRef}
          onSubmit={submit}
          onChangeCapture={draft.markDirty}
          className="space-y-5"
        >
          <p className="sr-only" role="status">
            {announcement}
          </p>
          <fieldset disabled={busy} className="space-y-5">
            <section className="form-section">
              <h2>Requirement brief</h2>
              <Field name="title" label="Requirement title">
                <input
                  value={form.title}
                  onChange={(e) => update('title', e.target.value)}
                  required
                  maxLength={180}
                />
              </Field>
              <Field name="objective" label="Business objective / problem">
                <textarea
                  value={form.objective}
                  onChange={(e) => update('objective', e.target.value)}
                  required
                  maxLength={8000}
                />
              </Field>
              <Field
                name="services"
                label="Requested services"
                help="Separate service names with commas."
              >
                <input
                  value={services}
                  onChange={(e) => setServices(e.target.value)}
                  maxLength={3000}
                />
              </Field>
            </section>
            <section className="form-section">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <h2>Features & requirement items</h2>
                  <p className="help mt-1">
                    Order the requested features and describe each separately.
                  </p>
                </div>
                <Button
                  variant="secondary"
                  type="button"
                  disabled={form.items.length >= 100}
                  onClick={() => update('items', [...form.items, blankItem()])}
                >
                  <Plus size={16} />
                  Add item
                </Button>
              </div>
              {form.items.map((item, index) => (
                <div className="item-card" data-item={item.id} key={item.id ?? index}>
                  <div className="flex items-center justify-between gap-2">
                    <h3>Item {index + 1}</h3>
                    <div className="flex gap-1">
                      <Button
                        variant="ghost"
                        type="button"
                        aria-label={'Move item ' + (index + 1) + ' up'}
                        disabled={index === 0}
                        onClick={() => move(index, -1)}
                      >
                        <ArrowUp size={16} />
                      </Button>
                      <Button
                        variant="ghost"
                        type="button"
                        aria-label={'Move item ' + (index + 1) + ' down'}
                        disabled={index === form.items.length - 1}
                        onClick={() => move(index, 1)}
                      >
                        <ArrowDown size={16} />
                      </Button>
                      <Button
                        variant="ghost"
                        type="button"
                        aria-label={'Remove item ' + (index + 1)}
                        disabled={form.items.length === 1}
                        onClick={() =>
                          update(
                            'items',
                            form.items.filter((_, i) => i !== index),
                          )
                        }
                      >
                        <Trash2 size={16} />
                      </Button>
                    </div>
                  </div>
                  <Field name={'items.' + index + '.title'} label="Item title">
                    <input
                      value={item.title}
                      onChange={(e) => itemUpdate(index, 'title', e.target.value)}
                      required
                      maxLength={160}
                    />
                  </Field>
                  <Field name={'items.' + index + '.description'} label="Item description">
                    <textarea
                      value={item.description}
                      onChange={(e) => itemUpdate(index, 'description', e.target.value)}
                      maxLength={4000}
                    />
                  </Field>
                  <div className="form-grid">
                    <Field name={'items.' + index + '.category'} label="Category / type">
                      <input
                        value={item.category}
                        onChange={(e) => itemUpdate(index, 'category', e.target.value)}
                        maxLength={80}
                      />
                    </Field>
                    <Field name={'items.' + index + '.priority'} label="Priority">
                      <select
                        value={item.priority}
                        onChange={(e) => itemUpdate(index, 'priority', e.target.value)}
                      >
                        {['LOW', 'MEDIUM', 'HIGH', 'MUST_HAVE'].map((p) => (
                          <option key={p} value={p}>
                            {label(p)}
                          </option>
                        ))}
                      </select>
                    </Field>
                  </div>
                  <Field name={'items.' + index + '.notes'} label="Item notes">
                    <input
                      value={item.notes}
                      onChange={(e) => itemUpdate(index, 'notes', e.target.value)}
                      maxLength={2000}
                    />
                  </Field>
                </div>
              ))}
            </section>
            <section className="form-section">
              <h2>Design & references</h2>
              <Field name="designPreferences" label="Design / UI preferences">
                <textarea
                  value={form.designPreferences}
                  onChange={(e) => update('designPreferences', e.target.value)}
                  maxLength={4000}
                />
              </Field>
              <Field
                name="referenceLinks"
                label="Reference websites and links"
                help="One complete http:// or https:// URL per line. Add supporting files from the client workspace after saving."
              >
                <textarea value={references} onChange={(e) => setReferences(e.target.value)} />
              </Field>
            </section>
            <section className="form-section">
              <h2>Client-provided budget & timeline</h2>
              <p className="help">
                These are client estimates and preferences. They are not guaranteed commitments.
              </p>
              <div className="form-grid">
                <Field name="budgetMin" label="Minimum budget">
                  <input
                    inputMode="decimal"
                    value={form.budgetMin ?? ''}
                    onChange={(e) => update('budgetMin', e.target.value || null)}
                    pattern="(0|[1-9][0-9]{0,15})(\.[0-9]{1,2})?"
                    maxLength={19}
                  />
                </Field>
                <Field name="budgetMax" label="Maximum budget">
                  <input
                    inputMode="decimal"
                    value={form.budgetMax ?? ''}
                    onChange={(e) => update('budgetMax', e.target.value || null)}
                    pattern="(0|[1-9][0-9]{0,15})(\.[0-9]{1,2})?"
                    maxLength={19}
                  />
                </Field>
                <Field name="currency" label="Currency" help="Three-letter code, e.g. LKR or USD.">
                  <input
                    value={form.currency ?? ''}
                    onChange={(e) => update('currency', e.target.value.toUpperCase() || null)}
                    pattern="[A-Z]{3}"
                    minLength={3}
                    maxLength={3}
                    required={form.budgetMin !== null || form.budgetMax !== null}
                  />
                </Field>
                <Field name="targetDate" label="Target date">
                  <input
                    type="date"
                    min="0001-01-01"
                    max="9999-12-31"
                    value={form.targetDate ?? ''}
                    onChange={(e) => update('targetDate', e.target.value || null)}
                  />
                </Field>
              </div>
              <Field name="timeline" label="Expected timeline">
                <textarea
                  value={form.timeline}
                  onChange={(e) => update('timeline', e.target.value)}
                  maxLength={2000}
                />
              </Field>
            </section>
            <section className="form-section">
              <h2>Client constraints & notes</h2>
              <Field name="constraints" label="Client-provided constraints">
                <textarea
                  value={form.constraints}
                  onChange={(e) => update('constraints', e.target.value)}
                  maxLength={4000}
                />
              </Field>
              <Field name="clientNotes" label="Additional client notes">
                <textarea
                  value={form.clientNotes}
                  onChange={(e) => update('clientNotes', e.target.value)}
                  maxLength={4000}
                />
              </Field>
            </section>
            <section className="form-section">
              <h2>Internal assumptions & recommendations</h2>
              <p className="help">
                Keep team assumptions distinct from information provided by the client.
              </p>
              <Field name="assumptions" label="Internal assumptions">
                <textarea
                  value={form.assumptions}
                  onChange={(e) => update('assumptions', e.target.value)}
                  maxLength={4000}
                />
              </Field>
              <Field name="internalRecommendations" label="Internal recommendations">
                <textarea
                  value={form.internalRecommendations}
                  onChange={(e) => update('internalRecommendations', e.target.value)}
                  maxLength={4000}
                />
              </Field>
            </section>
          </fieldset>
          <div className="flex gap-3">
            <Button type="submit" disabled={busy}>
              {busy ? 'Saving…' : record ? 'Save changes' : 'Save draft'}
            </Button>
            <Link className="btn btn-secondary" href={back}>
              Cancel
            </Link>
          </div>
        </form>
      </FormFeedback>
    </>
  );
}
