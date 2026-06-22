import { useEffect, useRef, useState } from 'react';
import type { ChangeEvent, FormEvent } from 'react';
import { useParams } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';

import {
  Badge,
  Button,
  Card,
  ConfirmDialog,
  EmptyState,
  FileUpload,
  PageHeader,
  Select,
  TextInput,
  Textarea,
} from '../components';
import { JobStatus } from '../components/JobStatus';
import type { components } from '../api/schema';
import {
  useCreateSource,
  useDeleteSource,
  useSources,
} from '../hooks';
import {
  isTerminalJobStatus,
  jobKeys,
  useJobs,
} from '../hooks/useJobs';
import { sourceKeys } from '../hooks/useSources';

/**
 * 2-P02 — Sources ingestion (screen 2.4, Phase-2 part)
 *
 * The async upgrade of the Sources tab. Mounted as the `sources` sub-tab of the
 * Subject detail page (P05), so the owning subject id comes from the route
 * param. Where Phase-1's manual P06 fallback recorded a source and called it
 * done, this screen treats every add as the *start of an ingestion job*:
 *
 *   - file        → drag/drop or browse a PDF / Word / text document.
 *   - notebooklm  → link an existing NotebookLM project by share URL.
 *   - text        → paste raw reference text inline.
 *
 * Submitting calls `POST /sources` (2-A05) which enqueues an ingest job and
 * returns the source in its `processing` state. Live status is then surfaced two
 * ways, both polled by the H03 job hooks:
 *
 *   - an "Active ingestion" panel rendering a JobStatus (2-U05) per in-flight
 *     `ingest` job (processing → ready / error), and
 *   - a per-source status pill in the list (Processing → Ready).
 *
 * When a job reaches a terminal state the sources list is invalidated so the
 * newly-ready source flips its pill and becomes usable by the tutor / generator
 * without a manual refresh. All data flows through the H02/H03 hooks; nothing
 * here hand-rolls a fetch.
 */

type Source = components['schemas']['Source'];
type SourceType = components['schemas']['SourceType'];
type SourceStatus = components['schemas']['SourceStatus'];
type CreateSource = components['schemas']['CreateSource'];
type Job = components['schemas']['Job'];

const TYPE_OPTIONS: ReadonlyArray<{
  value: SourceType;
  label: string;
  description: string;
}> = [
  {
    value: 'file',
    label: 'Upload a file',
    description: 'PDF, Word, or text — scanned pages are OCR-read on ingest.',
  },
  {
    value: 'notebooklm',
    label: 'Link a NotebookLM project',
    description: 'Ground answers in an existing NotebookLM notebook.',
  },
  {
    value: 'text',
    label: 'Paste text',
    description: 'Drop in notes, definitions, or any reference text.',
  },
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

const ACCEPTED_FILE_TYPES =
  '.pdf,.doc,.docx,.txt,application/pdf,application/msword,' +
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document,text/plain';

interface IngestFormState {
  type: SourceType;
  title: string;
  url: string;
  text: string;
}

function emptyForm(): IngestFormState {
  return { type: 'file', title: '', url: '', text: '' };
}

export default function SubjectSourcesIngest() {
  const { subjectId } = useParams<{ subjectId: string }>();
  const queryClient = useQueryClient();

  const sourcesQuery = useSources(subjectId);
  const jobsQuery = useJobs(subjectId);
  const createSource = useCreateSource();
  const deleteSource = useDeleteSource();

  const [form, setForm] = useState<IngestFormState>(emptyForm);
  const [file, setFile] = useState<File | null>(null);
  const [touched, setTouched] = useState(false);
  const [confirm, setConfirm] = useState<Source | null>(null);

  function patch(changes: Partial<IngestFormState>) {
    setForm((f) => ({ ...f, ...changes }));
  }

  function handleTypeChange(event: ChangeEvent<HTMLSelectElement>) {
    const next = event.target.value as SourceType;
    // Reset the type-specific inputs when switching the source kind so a stale
    // url/text/file is never submitted for the wrong type. Keep the title.
    setForm((f) => ({ ...emptyForm(), type: next, title: f.title }));
    setFile(null);
    setTouched(false);
  }

  function handleFilesChange(files: File[]) {
    const picked = files[0] ?? null;
    setFile(picked);
    if (picked && form.title.trim() === '') {
      patch({ title: picked.name });
    }
  }

  const titleError =
    touched && form.title.trim().length === 0 ? 'A title is required.' : undefined;

  function payloadError(): string | undefined {
    switch (form.type) {
      case 'file':
        return file == null ? 'Choose a file to ingest.' : undefined;
      case 'notebooklm':
        return form.url.trim() === '' ? 'Paste a NotebookLM project URL.' : undefined;
      case 'text':
        return form.text.trim() === '' ? 'Paste some text to ingest.' : undefined;
      default:
        return undefined;
    }
  }

  const submitDisabled =
    !subjectId || form.title.trim().length === 0 || Boolean(payloadError());

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setTouched(true);
    if (!subjectId || form.title.trim().length === 0 || payloadError()) {
      return;
    }

    const body: CreateSource = {
      subjectId,
      type: form.type,
      title: form.title.trim(),
      // For files we send the chosen file's name as the storage reference; the
      // backend ingest job reads the bytes and runs extraction / OCR.
      fileRef: form.type === 'file' ? (file?.name ?? undefined) : undefined,
      url: form.type === 'notebooklm' ? form.url.trim() : undefined,
      text: form.type === 'text' ? form.text.trim() : undefined,
    };

    await createSource.mutateAsync(body);
    // A new source kicks off an ingest job — make sure its status is polled now.
    void queryClient.invalidateQueries({ queryKey: jobKeys.list(subjectId, {}) });
    setForm(emptyForm());
    setFile(null);
    setTouched(false);
  }

  async function handleDelete() {
    if (!confirm || !subjectId) return;
    await deleteSource.mutateAsync({ id: confirm.id, subjectId });
    setConfirm(null);
  }

  // The ingest jobs for this subject, newest first.
  const ingestJobs: Job[] = (jobsQuery.data?.items ?? [])
    .filter((job) => job.type === 'ingest')
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  const activeIngestJobs = ingestJobs.filter(
    (job) => !isTerminalJobStatus(job.status),
  );

  // When the set of terminal ingest jobs grows, an ingest just finished — pull a
  // fresh sources list so the affected source flips processing → ready.
  const settledCount = ingestJobs.filter((job) =>
    isTerminalJobStatus(job.status),
  ).length;
  const prevSettled = useRef(settledCount);
  useEffect(() => {
    if (!subjectId) return;
    if (settledCount !== prevSettled.current) {
      prevSettled.current = settledCount;
      void queryClient.invalidateQueries({
        queryKey: sourceKeys.lists(subjectId),
      });
    }
  }, [settledCount, subjectId, queryClient]);

  return (
    <div className="space-y-6">
      <PageHeader
        as="h2"
        title="Sources"
        subtitle="Upload documents, link a NotebookLM project, or paste text. Each addition is ingested in the background and becomes usable by the tutor and exam generator once ready."
      />

      <Card padding="md">
        <form onSubmit={handleSubmit} className="space-y-5">
          <Select
            label="What are you adding?"
            value={form.type}
            onChange={handleTypeChange}
            hint={
              TYPE_OPTIONS.find((o) => o.value === form.type)?.description
            }
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
            placeholder="e.g. Chapter 3 — Cell biology"
            onChange={(e) => patch({ title: e.target.value })}
            onBlur={() => setTouched(true)}
          />

          {form.type === 'file' && (
            <FileUpload
              label="Document"
              hint="PDF, Word, or text. We extract the text (and OCR scanned pages) during ingestion."
              accept={ACCEPTED_FILE_TYPES}
              files={file ? [file] : []}
              onFilesChange={handleFilesChange}
              error={
                touched && file == null ? 'Choose a file to ingest.' : undefined
              }
            />
          )}

          {form.type === 'notebooklm' && (
            <TextInput
              label="NotebookLM project URL"
              type="url"
              required
              value={form.url}
              error={
                touched && form.url.trim() === ''
                  ? 'Paste a NotebookLM project URL.'
                  : undefined
              }
              hint="The shared notebook link, e.g. https://notebooklm.google.com/notebook/…"
              placeholder="https://notebooklm.google.com/notebook/..."
              onChange={(e) => patch({ url: e.target.value })}
              onBlur={() => setTouched(true)}
            />
          )}

          {form.type === 'text' && (
            <Textarea
              label="Text"
              required
              rows={6}
              value={form.text}
              error={
                touched && form.text.trim() === ''
                  ? 'Paste some text to ingest.'
                  : undefined
              }
              placeholder="Paste notes, definitions, or any reference text…"
              onChange={(e) => patch({ text: e.target.value })}
              onBlur={() => setTouched(true)}
            />
          )}

          <div className="flex justify-end">
            <Button
              type="submit"
              loading={createSource.isPending}
              disabled={submitDisabled}
            >
              Ingest source
            </Button>
          </div>
        </form>
      </Card>

      {activeIngestJobs.length > 0 && (
        <section aria-label="Active ingestion" className="space-y-3">
          <h3 className="font-display text-lg font-bold text-foreground">
            Active ingestion
          </h3>
          <ul className="space-y-3">
            {activeIngestJobs.map((job) => (
              <li key={job.id}>
                <JobStatus
                  status={job.status}
                  progress={job.progress}
                  label="Ingesting source"
                />
              </li>
            ))}
          </ul>
        </section>
      )}

      <section aria-label="Sources" className="space-y-3">
        <h3 className="font-display text-lg font-bold text-foreground">
          Sources
        </h3>

        {sourcesQuery.isPending ? (
          <SourcesSkeleton />
        ) : sourcesQuery.isError ? (
          <ErrorState
            message={sourcesQuery.error.message}
            onRetry={() => void sourcesQuery.refetch()}
            retrying={sourcesQuery.isFetching}
          />
        ) : sourcesQuery.data.items.length === 0 ? (
          <EmptyState
            icon="📄"
            title="No sources yet"
            description="Upload a document, link a NotebookLM project, or paste text above to give this subject something to study from."
          />
        ) : (
          <ul className="space-y-3">
            {sourcesQuery.data.items.map((source) => (
              <li key={source.id}>
                <SourceRow source={source} onRemove={() => setConfirm(source)} />
              </li>
            ))}
          </ul>
        )}
      </section>

      <ConfirmDialog
        open={confirm != null}
        title="Remove source"
        message={
          confirm
            ? `Remove “${confirm.title}” from this subject? This cannot be undone.`
            : ''
        }
        confirmLabel="Remove"
        danger
        onCancel={() => setConfirm(null)}
        onConfirm={handleDelete}
      />
    </div>
  );
}

interface SourceRowProps {
  source: Source;
  onRemove: () => void;
}

function SourceRow({ source, onRemove }: SourceRowProps) {
  const processing = source.status === 'processing';
  const detail =
    source.url ??
    source.fileRef ??
    (source.text ? truncate(source.text, 80) : undefined);
  return (
    <Card padding="sm" className="flex items-center gap-3">
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span className="truncate font-semibold text-foreground">
            {source.title}
          </span>
          <Badge tone={STATUS_TONE[source.status]} size="sm" dot>
            {STATUS_LABEL[source.status]}
          </Badge>
        </div>
        <p className="mt-0.5 truncate text-sm text-foreground-muted">
          {TYPE_LABELS[source.type]}
          {detail ? ` · ${detail}` : ''}
        </p>
      </div>
      <Button
        variant="ghost"
        size="sm"
        onClick={onRemove}
        disabled={processing}
        title={
          processing ? 'Cannot remove while still ingesting' : undefined
        }
      >
        Remove
      </Button>
    </Card>
  );
}

function truncate(value: string, max: number): string {
  const trimmed = value.trim();
  return trimmed.length > max ? `${trimmed.slice(0, max)}…` : trimmed;
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
