import { useMemo, useState } from 'react';
import type { DragEvent, FormEvent } from 'react';
import { useParams } from 'react-router-dom';

import { Badge, Button, Card, Select, TextInput } from '../components';
import { ConfirmDialog } from '../components/ConfirmDialog';
import { Dialog } from '../components/Dialog';
import { EmptyState } from '../components/EmptyState';
import { NumberStepper } from '../components/NumberStepper';
import { Toggle } from '../components/Toggle';
import type { components } from '../api/schema';
import {
  useCreateTopic,
  useDeleteTopic,
  useReorderTopics,
  useSources,
  useTopics,
  useUpdateTopic,
} from '../hooks';

/**
 * P07 — Syllabus builder (screen 2.5, manual)
 *
 * Manual topic builder for one subject. Topics render as an ordered list: each
 * row shows its syllabus position, name, the source it is drawn from with an
 * optional page range, and an active toggle that controls whether the topic is
 * in scope for exams (U14). Topics can be reordered by drag-and-drop or with the
 * up/down controls; every move is persisted as a batch of `order` updates (H03
 * useReorderTopics). Create / edit happen in a dialog (U07) with a source picker
 * (U03) and page-range steppers; delete is confirmed (U19).
 *
 * The AI "Auto-suggest topics" affordance is a Phase-2 feature and is rendered
 * disabled here per the screen spec. All data flows through the H02/H03 hooks;
 * nothing here hand-rolls a fetch.
 *
 * States: loading (skeleton), error (retry), empty (call to action), and the
 * populated ordered list.
 */

type Topic = components['schemas']['Topic'];
type CreateTopic = components['schemas']['CreateTopic'];
type Source = components['schemas']['Source'];

interface TopicFormState {
  name: string;
  sourceId: string;
  hasPages: boolean;
  pageStart: number;
  pageEnd: number;
  active: boolean;
}

function emptyForm(): TopicFormState {
  return {
    name: '',
    sourceId: '',
    hasPages: false,
    pageStart: 1,
    pageEnd: 1,
    active: true,
  };
}

function formFromTopic(topic: Topic): TopicFormState {
  const hasPages = topic.pageStart != null || topic.pageEnd != null;
  return {
    name: topic.name,
    sourceId: topic.sourceId ?? '',
    hasPages,
    pageStart: topic.pageStart ?? 1,
    pageEnd: topic.pageEnd ?? topic.pageStart ?? 1,
    active: topic.active,
  };
}

/** Sort a topic list by syllabus position, then name for stability. */
function byOrder(a: Topic, b: Topic): number {
  if (a.order !== b.order) return a.order - b.order;
  return a.name.localeCompare(b.name);
}

export default function SubjectSyllabus() {
  const { subjectId } = useParams<{ subjectId: string }>();

  const topicsQuery = useTopics(subjectId, { pageSize: 200 });
  const sourcesQuery = useSources(subjectId, { pageSize: 200 });
  const createTopic = useCreateTopic();
  const updateTopic = useUpdateTopic();
  const deleteTopic = useDeleteTopic();
  const reorderTopics = useReorderTopics();

  // Dialog state: `null` = closed; otherwise create or edit a specific topic.
  const [editor, setEditor] = useState<
    { mode: 'create' } | { mode: 'edit'; topic: Topic } | null
  >(null);
  // Pending delete confirmation.
  const [pendingDelete, setPendingDelete] = useState<Topic | null>(null);
  // Index of the row currently being dragged (for drop computation + styling).
  const [dragIndex, setDragIndex] = useState<number | null>(null);

  const topics = useMemo(
    () => (topicsQuery.data ? [...topicsQuery.data.items].sort(byOrder) : []),
    [topicsQuery.data],
  );
  const sources = sourcesQuery.data?.items ?? [];
  const sourceById = useMemo(() => {
    const map = new Map<string, Source>();
    for (const source of sources) map.set(source.id, source);
    return map;
  }, [sources]);

  const reordering = reorderTopics.isPending;

  /** Persist a fully reordered list by writing each changed position. */
  function persistOrder(next: Topic[]) {
    if (!subjectId) return;
    const orders = next
      .map((topic, index) => ({ id: topic.id, order: index }))
      .filter((entry, index) => topics[index]?.id !== entry.id || topics[index]?.order !== entry.order);
    if (orders.length === 0) return;
    reorderTopics.mutate({ subjectId, orders });
  }

  function moveTopic(from: number, to: number) {
    if (from === to || to < 0 || to >= topics.length) return;
    const next = [...topics];
    const [moved] = next.splice(from, 1);
    next.splice(to, 0, moved);
    persistOrder(next);
  }

  function handleDrop(targetIndex: number) {
    if (dragIndex == null) return;
    moveTopic(dragIndex, targetIndex);
    setDragIndex(null);
  }

  async function submitForm(form: TopicFormState) {
    if (!subjectId) return;
    const trimmedName = form.name.trim();
    const sourceId = form.sourceId || undefined;
    const pageStart = form.hasPages ? form.pageStart : undefined;
    const pageEnd = form.hasPages ? form.pageEnd : undefined;

    if (editor?.mode === 'create') {
      const body: CreateTopic = {
        subjectId,
        name: trimmedName,
        sourceId,
        pageStart,
        pageEnd,
        order: topics.length,
      };
      await createTopic.mutateAsync(body);
    } else if (editor?.mode === 'edit') {
      await updateTopic.mutateAsync({
        id: editor.topic.id,
        subjectId,
        changes: {
          name: trimmedName,
          sourceId,
          pageStart,
          pageEnd,
          active: form.active,
        },
      });
    }
    setEditor(null);
  }

  async function toggleActive(topic: Topic, active: boolean) {
    if (!subjectId) return;
    await updateTopic.mutateAsync({
      id: topic.id,
      subjectId,
      changes: { active },
    });
  }

  async function confirmDelete() {
    if (!pendingDelete || !subjectId) return;
    await deleteTopic.mutateAsync({ id: pendingDelete.id, subjectId });
    setPendingDelete(null);
  }

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="font-display text-display-sm text-foreground">
            Syllabus
          </h1>
          <p className="mt-1 text-sm text-foreground-muted">
            Build the ordered list of topics this subject covers. Active topics
            are in scope for exams.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="secondary"
            disabled
            title="Coming soon"
            aria-disabled="true"
          >
            Auto-suggest topics
          </Button>
          <Button onClick={() => setEditor({ mode: 'create' })}>
            Add topic
          </Button>
        </div>
      </header>

      {topicsQuery.isPending ? (
        <SyllabusSkeleton />
      ) : topicsQuery.isError ? (
        <ErrorState
          message={topicsQuery.error.message}
          onRetry={() => void topicsQuery.refetch()}
          retrying={topicsQuery.isFetching}
        />
      ) : topics.length === 0 ? (
        <EmptyState
          icon="🧭"
          title="No topics yet"
          description="Add topics manually to define what this subject covers and which sources each topic is drawn from."
          action={
            <Button onClick={() => setEditor({ mode: 'create' })}>
              Add topic
            </Button>
          }
        />
      ) : (
        <ol className="space-y-2" aria-label="Syllabus topics" aria-busy={reordering}>
          {topics.map((topic, index) => (
            <li
              key={topic.id}
              draggable
              onDragStart={() => setDragIndex(index)}
              onDragEnd={() => setDragIndex(null)}
              onDragOver={(e: DragEvent) => e.preventDefault()}
              onDrop={(e: DragEvent) => {
                e.preventDefault();
                handleDrop(index);
              }}
              className={dragIndex === index ? 'opacity-50' : undefined}
            >
              <TopicRow
                topic={topic}
                position={index + 1}
                source={topic.sourceId ? sourceById.get(topic.sourceId) : undefined}
                isFirst={index === 0}
                isLast={index === topics.length - 1}
                busy={reordering}
                toggling={updateTopic.isPending}
                onMoveUp={() => moveTopic(index, index - 1)}
                onMoveDown={() => moveTopic(index, index + 1)}
                onToggleActive={(active) => void toggleActive(topic, active)}
                onEdit={() => setEditor({ mode: 'edit', topic })}
                onDelete={() => setPendingDelete(topic)}
              />
            </li>
          ))}
        </ol>
      )}

      {editor && (
        <TopicDialog
          key={editor.mode === 'edit' ? editor.topic.id : 'create'}
          mode={editor.mode}
          initial={
            editor.mode === 'edit' ? formFromTopic(editor.topic) : emptyForm()
          }
          sources={sources}
          sourcesLoading={sourcesQuery.isPending}
          submitting={
            editor.mode === 'create'
              ? createTopic.isPending
              : updateTopic.isPending
          }
          onClose={() => setEditor(null)}
          onSubmit={submitForm}
        />
      )}

      <ConfirmDialog
        open={pendingDelete != null}
        title="Delete topic"
        message={
          pendingDelete
            ? `Permanently delete “${pendingDelete.name}” from the syllabus? This cannot be undone.`
            : undefined
        }
        confirmLabel="Delete"
        danger
        onConfirm={confirmDelete}
        onCancel={() => setPendingDelete(null)}
      />
    </div>
  );
}

interface TopicRowProps {
  topic: Topic;
  position: number;
  source: Source | undefined;
  isFirst: boolean;
  isLast: boolean;
  busy: boolean;
  toggling: boolean;
  onMoveUp: () => void;
  onMoveDown: () => void;
  onToggleActive: (active: boolean) => void;
  onEdit: () => void;
  onDelete: () => void;
}

function TopicRow({
  topic,
  position,
  source,
  isFirst,
  isLast,
  busy,
  toggling,
  onMoveUp,
  onMoveDown,
  onToggleActive,
  onEdit,
  onDelete,
}: TopicRowProps) {
  const pageRange = formatPages(topic.pageStart, topic.pageEnd);
  return (
    <Card
      padding="sm"
      className="flex items-center gap-3"
    >
      <div className="flex flex-col items-center gap-0.5">
        <button
          type="button"
          aria-label="Move topic up"
          disabled={isFirst || busy}
          onClick={onMoveUp}
          className="flex h-6 w-6 items-center justify-center rounded-md text-foreground-muted transition hover:bg-surface-muted disabled:opacity-40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <span aria-hidden="true">▲</span>
        </button>
        <button
          type="button"
          aria-label="Move topic down"
          disabled={isLast || busy}
          onClick={onMoveDown}
          className="flex h-6 w-6 items-center justify-center rounded-md text-foreground-muted transition hover:bg-surface-muted disabled:opacity-40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <span aria-hidden="true">▼</span>
        </button>
      </div>

      <span
        aria-hidden="true"
        className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-surface-muted text-sm font-bold text-foreground-muted"
      >
        {position}
      </span>

      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span className="truncate font-display font-bold text-foreground">
            {topic.name}
          </span>
          {!topic.active && (
            <Badge tone="neutral" size="sm">
              Inactive
            </Badge>
          )}
        </div>
        <div className="mt-0.5 truncate text-sm text-foreground-muted">
          {source ? source.title : 'No source'}
          {pageRange ? ` · ${pageRange}` : ''}
        </div>
      </div>

      <Toggle
        checked={topic.active}
        onChange={onToggleActive}
        disabled={toggling}
        size="sm"
        aria-label={`Toggle ${topic.name} active`}
      />

      <div className="flex items-center gap-1">
        <Button variant="ghost" size="sm" onClick={onEdit}>
          Edit
        </Button>
        <Button variant="ghost" size="sm" onClick={onDelete}>
          Delete
        </Button>
      </div>
    </Card>
  );
}

/** Render a human-readable page range from optional start/end pages. */
function formatPages(
  start: number | undefined,
  end: number | undefined,
): string {
  if (start != null && end != null) {
    return start === end ? `p. ${start}` : `pp. ${start}–${end}`;
  }
  if (start != null) return `from p. ${start}`;
  if (end != null) return `to p. ${end}`;
  return '';
}

interface TopicDialogProps {
  mode: 'create' | 'edit';
  initial: TopicFormState;
  sources: Source[];
  sourcesLoading: boolean;
  submitting: boolean;
  onClose: () => void;
  onSubmit: (form: TopicFormState) => Promise<void> | void;
}

function TopicDialog({
  mode,
  initial,
  sources,
  sourcesLoading,
  submitting,
  onClose,
  onSubmit,
}: TopicDialogProps) {
  const [form, setForm] = useState<TopicFormState>(initial);
  const [touched, setTouched] = useState(false);

  const nameError =
    touched && form.name.trim().length === 0 ? 'Name is required.' : undefined;
  const pageError =
    form.hasPages && form.pageEnd < form.pageStart
      ? 'End page must be on or after the start page.'
      : undefined;

  const sourceOptions = sources.map((source) => ({
    value: source.id,
    label: source.title,
  }));

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setTouched(true);
    if (form.name.trim().length === 0 || pageError) return;
    void onSubmit(form);
  }

  return (
    <Dialog
      open
      onClose={onClose}
      title={mode === 'create' ? 'Add topic' : 'Edit topic'}
      description="Topics define what this subject covers. Link a source and an optional page range."
      footer={
        <>
          <Button
            type="button"
            variant="ghost"
            onClick={onClose}
            disabled={submitting}
          >
            Cancel
          </Button>
          <Button type="submit" form="topic-form" loading={submitting}>
            Save
          </Button>
        </>
      }
    >
      <form id="topic-form" onSubmit={handleSubmit} className="space-y-4">
        <TextInput
          label="Name"
          required
          autoFocus
          value={form.name}
          error={nameError}
          onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
          onBlur={() => setTouched(true)}
          placeholder="e.g. Photosynthesis"
        />

        <Select
          label="Source"
          value={form.sourceId}
          placeholder={
            sourcesLoading
              ? 'Loading sources…'
              : sourceOptions.length === 0
                ? 'No sources available'
                : 'No source (optional)'
          }
          options={sourceOptions}
          disabled={sourcesLoading || sourceOptions.length === 0}
          hint="Optional — link the source material this topic is drawn from."
          onChange={(e) =>
            setForm((f) => ({ ...f, sourceId: e.target.value }))
          }
        />

        <Toggle
          checked={form.hasPages}
          onChange={(hasPages) => setForm((f) => ({ ...f, hasPages }))}
          label="Restrict to a page range"
          description="Limit this topic to specific pages of its source."
          size="sm"
        />

        {form.hasPages && (
          <div className="flex flex-wrap items-end gap-4">
            <div className="flex flex-col gap-1.5">
              <span className="text-sm font-semibold text-foreground">
                Start page
              </span>
              <NumberStepper
                value={form.pageStart}
                min={1}
                max={100000}
                label="Start page"
                onChange={(pageStart) =>
                  setForm((f) => ({
                    ...f,
                    pageStart,
                    pageEnd: Math.max(f.pageEnd, pageStart),
                  }))
                }
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <span className="text-sm font-semibold text-foreground">
                End page
              </span>
              <NumberStepper
                value={form.pageEnd}
                min={1}
                max={100000}
                label="End page"
                onChange={(pageEnd) =>
                  setForm((f) => ({ ...f, pageEnd }))
                }
              />
            </div>
          </div>
        )}

        {pageError && (
          <p role="alert" className="text-sm font-medium text-danger">
            {pageError}
          </p>
        )}
      </form>
    </Dialog>
  );
}

function SyllabusSkeleton() {
  return (
    <div className="space-y-2" aria-busy="true" aria-label="Loading syllabus">
      {Array.from({ length: 5 }).map((_, i) => (
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
      <h2 className="font-display text-display-sm text-danger">
        Couldn&rsquo;t load the syllabus
      </h2>
      <p className="mt-1 text-sm text-foreground-muted">{message}</p>
      <div className="mt-5">
        <Button variant="secondary" onClick={onRetry} loading={retrying}>
          Try again
        </Button>
      </div>
    </div>
  );
}
