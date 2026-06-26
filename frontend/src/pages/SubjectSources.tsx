import { useState } from 'react';
import type { ChangeEvent, FormEvent } from 'react';
import { useParams } from 'react-router-dom';

import { Badge } from '../components';
import { Button } from '../components';
import { Card } from '../components';
import { Select } from '../components';
import { TextInput } from '../components';
import type { components } from '../api/schema';
import {
  useCreateSource,
  useDeleteSource,
  useSources,
} from '../hooks';

/**
 * P06 — Sources tab (screen 2.4, manual)
 *
 * Rendered as the `sources` sub-tab of the Subject detail page (P05), so the
 * owning subject id comes from the `:subjectId` route param. Lets the parent
 * register study material for a subject in one of three manual ways:
 *
 *   - file        → pick a local file; we record its name as the storage ref
 *                   (real ingestion / extraction is Phase 2).
 *   - notebooklm  → paste a NotebookLM share URL.
 *   - text        → paste raw text inline.
 *
 * Existing sources are listed with a status pill (processing / ready) and a
 * remove action (confirmed before deleting). All data flows through the H02
 * useSources hooks; nothing here hand-rolls a fetch.
 *
 * States: loading (skeleton), error (retry), empty (call to action), and the
 * populated list. The U12 (file upload), U04 (textarea), U08 (table) and U10
 * (badge) roles are composed inline from the available shared primitives
 * (Button / TextInput / Select / Card / Badge) and the design tokens.
 */

type Source = components['schemas']['Source'];
type SourceType = components['schemas']['SourceType'];
type SourceStatus = components['schemas']['SourceStatus'];
type CreateSource = components['schemas']['CreateSource'];

const TYPE_OPTIONS: ReadonlyArray<{ value: SourceType; label: string }> = [
  { value: 'file', label: 'File upload' },
  { value: 'notebooklm', label: 'NotebookLM URL' },
  { value: 'text', label: 'Pasted text' },
];

const TYPE_LABELS: Record<SourceType, string> = {
  file: 'File',
  notebooklm: 'NotebookLM',
  text: 'Text',
};

const STATUS_TONE: Record<SourceStatus, 'success' | 'warning'> = {
  ready: 'success',
  processing: 'warning',
};

const STATUS_LABEL: Record<SourceStatus, string> = {
  ready: 'Ready',
  processing: 'Processing',
};

interface SourceFormState {
  type: SourceType;
  title: string;
  url: string;
  text: string;
  fileRef: string;
  fileName: string;
}

function emptyForm(): SourceFormState {
  return {
    type: 'file',
    title: '',
    url: '',
    text: '',
    fileRef: '',
    fileName: '',
  };
}

export default function SubjectSources() {
  const { subjectId } = useParams<{ subjectId: string }>();

  const sourcesQuery = useSources(subjectId);
  const createSource = useCreateSource();
  const deleteSource = useDeleteSource();

  const [form, setForm] = useState<SourceFormState>(emptyForm);
  const [touched, setTouched] = useState(false);
  const [confirm, setConfirm] = useState<Source | null>(null);

  function patch(changes: Partial<SourceFormState>) {
    setForm((f) => ({ ...f, ...changes }));
  }

  function handleTypeChange(event: ChangeEvent<HTMLSelectElement>) {
    // Reset the type-specific inputs when switching the source kind so a stale
    // url/text/file doesn't get submitted for the wrong type.
    setForm({
      ...emptyForm(),
      type: event.target.value as SourceType,
      title: form.title,
    });
    setTouched(false);
  }

  function handleFileChange(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) {
      patch({ fileRef: '', fileName: '' });
      return;
    }
    patch({
      fileRef: file.name,
      fileName: file.name,
      // Default the title to the file name if the user hasn't typed one.
      title: form.title.trim() === '' ? file.name : form.title,
    });
  }

  const titleError =
    touched && form.title.trim().length === 0 ? 'A title is required.' : undefined;

  function payloadError(): string | undefined {
    switch (form.type) {
      case 'file':
        return form.fileRef === '' ? 'Choose a file to upload.' : undefined;
      case 'notebooklm':
        return form.url.trim() === '' ? 'Paste a NotebookLM URL.' : undefined;
      case 'text':
        return form.text.trim() === '' ? 'Paste some text.' : undefined;
      default:
        return undefined;
    }
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setTouched(true);
    if (!subjectId) return;
    if (form.title.trim().length === 0 || payloadError()) {
      return;
    }

    const body: CreateSource = {
      subjectId,
      type: form.type,
      title: form.title.trim(),
      fileRef: form.type === 'file' ? form.fileRef : undefined,
      url: form.type === 'notebooklm' ? form.url.trim() : undefined,
      text: form.type === 'text' ? form.text.trim() : undefined,
    };

    await createSource.mutateAsync(body);
    setForm(emptyForm());
    setTouched(false);
  }

  async function handleDelete() {
    if (!confirm || !subjectId) return;
    await deleteSource.mutateAsync({ id: confirm.id, subjectId });
    setConfirm(null);
  }

  const submitDisabled =
    !subjectId ||
    form.title.trim().length === 0 ||
    Boolean(payloadError());

  return (
    <div className="space-y-6">
      <header>
        <h2 className="font-display text-display-sm text-foreground">Sources</h2>
        <p className="mt-1 text-sm text-foreground-muted">
          Add the study material for this subject. Sources are entered manually
          for now; automatic ingestion arrives later.
        </p>
      </header>

      <Card padding="md">
        <form onSubmit={handleSubmit} className="space-y-4">
          <Select
            label="Source type"
            value={form.type}
            onChange={handleTypeChange}
            options={TYPE_OPTIONS.map((o) => ({
              value: o.value,
              label: o.label,
            }))}
          />

          <TextInput
            label="Title"
            required
            value={form.title}
            error={titleError}
            placeholder="e.g. Chapter 3 notes"
            onChange={(e) => patch({ title: e.target.value })}
            onBlur={() => setTouched(true)}
          />

          {form.type === 'file' && (
            <div>
              <span className="text-sm font-semibold text-foreground">
                File
              </span>
              <div className="mt-2 flex flex-wrap items-center gap-3">
                <label className="inline-flex cursor-pointer items-center gap-2 rounded-md border border-border bg-surface px-4 py-2 text-sm font-semibold text-foreground transition hover:bg-surface-muted focus-within:ring-2 focus-within:ring-ring">
                  <span>Choose file</span>
                  <input
                    type="file"
                    className="sr-only"
                    onChange={handleFileChange}
                  />
                </label>
                <span className="text-sm text-foreground-muted">
                  {form.fileName || 'No file selected'}
                </span>
              </div>
              {touched && form.fileRef === '' && (
                <p role="alert" className="mt-1 text-sm text-danger">
                  Choose a file to upload.
                </p>
              )}
            </div>
          )}

          {form.type === 'notebooklm' && (
            <TextInput
              label="NotebookLM URL"
              type="url"
              required
              value={form.url}
              error={
                touched && form.url.trim() === ''
                  ? 'Paste a NotebookLM URL.'
                  : undefined
              }
              placeholder="https://notebooklm.google.com/notebook/..."
              onChange={(e) => patch({ url: e.target.value })}
              onBlur={() => setTouched(true)}
            />
          )}

          {form.type === 'text' && (
            <div>
              <label
                htmlFor="source-text"
                className="text-sm font-semibold text-foreground"
              >
                Text
                <span aria-hidden="true" className="text-danger">
                  {' '}
                  *
                </span>
              </label>
              <textarea
                id="source-text"
                required
                rows={6}
                value={form.text}
                onChange={(e) => patch({ text: e.target.value })}
                onBlur={() => setTouched(true)}
                placeholder="Paste notes, definitions, or any reference text…"
                aria-invalid={
                  touched && form.text.trim() === '' ? true : undefined
                }
                className="mt-2 block w-full rounded-md border border-border bg-surface px-3 py-2 text-sm text-foreground shadow-sm placeholder:text-foreground-muted focus:outline-none focus:ring-2 focus:ring-ring"
              />
              {touched && form.text.trim() === '' && (
                <p role="alert" className="mt-1 text-sm text-danger">
                  Paste some text.
                </p>
              )}
            </div>
          )}

          <div className="flex justify-end">
            <Button
              type="submit"
              loading={createSource.isPending}
              disabled={submitDisabled}
            >
              Add source
            </Button>
          </div>
        </form>
      </Card>

      {sourcesQuery.isPending ? (
        <SourcesSkeleton />
      ) : sourcesQuery.isError ? (
        <ErrorState
          message={sourcesQuery.error.message}
          onRetry={() => void sourcesQuery.refetch()}
          retrying={sourcesQuery.isFetching}
        />
      ) : sourcesQuery.data.items.length === 0 ? (
        <EmptyState />
      ) : (
        <ul className="space-y-3" aria-label="Sources">
          {sourcesQuery.data.items.map((source) => (
            <li key={source.id}>
              <SourceRow
                source={source}
                onRemove={() => setConfirm(source)}
              />
            </li>
          ))}
        </ul>
      )}

      {confirm && (
        <ConfirmDialog
          title="Remove source"
          body={`Remove “${confirm.title}” from this subject? This cannot be undone.`}
          confirmLabel="Remove"
          busy={deleteSource.isPending}
          onCancel={() => setConfirm(null)}
          onConfirm={() => void handleDelete()}
        />
      )}
    </div>
  );
}

interface SourceRowProps {
  source: Source;
  onRemove: () => void;
}

function SourceRow({ source, onRemove }: SourceRowProps) {
  return (
    <Card padding="sm" className="flex items-center gap-3">
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span className="truncate font-semibold text-foreground">
            {source.title}
          </span>
          <Badge tone={STATUS_TONE[source.status]} size="sm">
            {STATUS_LABEL[source.status]}
          </Badge>
        </div>
        <p className="mt-0.5 truncate text-sm text-foreground-muted">
          {TYPE_LABELS[source.type]}
          {source.url ? ` · ${source.url}` : ''}
          {source.fileRef ? ` · ${source.fileRef}` : ''}
        </p>
      </div>
      <Button variant="ghost" size="sm" onClick={onRemove}>
        Remove
      </Button>
    </Card>
  );
}

interface ConfirmDialogProps {
  title: string;
  body: string;
  confirmLabel: string;
  busy: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}

function ConfirmDialog({
  title,
  body,
  confirmLabel,
  busy,
  onCancel,
  onConfirm,
}: ConfirmDialogProps) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-foreground/40 p-4"
      onClick={onCancel}
    >
      <div
        role="alertdialog"
        aria-labelledby="remove-source-title"
        aria-describedby="remove-source-body"
        className="w-full max-w-sm rounded-card bg-surface p-6 shadow-card"
        onClick={(e) => e.stopPropagation()}
      >
        <h2
          id="remove-source-title"
          className="font-display text-display-sm text-foreground"
        >
          {title}
        </h2>
        <p
          id="remove-source-body"
          className="mt-2 text-sm text-foreground-muted"
        >
          {body}
        </p>
        <div className="mt-6 flex justify-end gap-2">
          <Button variant="ghost" onClick={onCancel} disabled={busy}>
            Cancel
          </Button>
          <Button variant="danger" loading={busy} onClick={onConfirm}>
            {confirmLabel}
          </Button>
        </div>
      </div>
    </div>
  );
}

function SourcesSkeleton() {
  return (
    <div className="space-y-3" aria-busy="true" aria-label="Loading sources">
      {Array.from({ length: 3 }).map((_, i) => (
        <div
          key={i}
          className="h-16 animate-pulse rounded-card border border-border bg-surface-muted"
        />
      ))}
    </div>
  );
}

function EmptyState() {
  return (
    <div className="rounded-card border border-dashed border-border bg-surface p-12 text-center">
      <p className="text-4xl" aria-hidden="true">
        📄
      </p>
      <h3 className="mt-3 font-display text-display-sm text-foreground">
        No sources yet
      </h3>
      <p className="mx-auto mt-1 max-w-sm text-sm text-foreground-muted">
        Add a file, a NotebookLM link, or pasted text above to give this subject
        something to study from.
      </p>
    </div>
  );
}

interface ErrorStateProps {
  message: string;
  onRetry: () => void;
  retrying: boolean;
}

function ErrorState({ message, onRetry, retrying }: ErrorStateProps) {
  return (
    <div
      role="alert"
      className="rounded-card border border-danger bg-danger-soft p-8 text-center"
    >
      <h3 className="font-display text-display-sm text-danger">
        Couldn&rsquo;t load sources
      </h3>
      <p className="mt-1 text-sm text-foreground-muted">{message}</p>
      <div className="mt-5">
        <Button variant="secondary" onClick={onRetry} loading={retrying}>
          Try again
        </Button>
      </div>
    </div>
  );
}
