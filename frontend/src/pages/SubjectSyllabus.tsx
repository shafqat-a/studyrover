import { Fragment, useMemo, useState } from 'react';
import type { DragEvent, FormEvent } from 'react';
import { useParams } from 'react-router-dom';
import {
  Check,
  ChevronDown,
  ChevronUp,
  FileText,
  GripVertical,
  ListTree,
  Pencil,
  Plus,
  RotateCcw,
  Sparkles,
  Trash2,
} from 'lucide-react';

import { Badge, Button, PageHeader, Select, TextInput } from '../components';
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

/**
 * The leading integer section of a topic name ("1.4 Density" → "1"), or null
 * when the name does not start with a number (used to group numbered syllabi).
 */
function sectionOf(name: string): string | null {
  return name.match(/^\s*(\d+)/)?.[1] ?? null;
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
  // Index of the row currently hovered during a drag (for the drop indicator).
  const [dragOverIndex, setDragOverIndex] = useState<number | null>(null);

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
  const activeCount = topics.filter((t) => t.active).length;

  // Group rows by their leading syllabus section number (e.g. every "1.x"
  // topic under a "Section 1" header). Only kicks in when the topics are
  // numbered and span ≥2 sections — subjects with unnumbered topics (English,
  // A Level component codes) just render as one flat list.
  const { showGroups, sectionCounts } = useMemo(() => {
    const counts = new Map<string, number>();
    for (const t of topics) {
      const s = sectionOf(t.name);
      if (s) counts.set(s, (counts.get(s) ?? 0) + 1);
    }
    return { showGroups: counts.size >= 2, sectionCounts: counts };
  }, [topics]);

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
      <PageHeader
        title="Syllabus"
        subtitle="Build the ordered list of topics this subject covers. Active topics are in scope for exams."
        actions={
          <>
            <Button
              variant="secondary"
              disabled
              title="Coming soon"
              aria-disabled="true"
              leadingIcon={<Sparkles className="h-4 w-4" aria-hidden="true" />}
            >
              Auto-suggest topics
            </Button>
            <Button
              onClick={() => setEditor({ mode: 'create' })}
              leadingIcon={<Plus className="h-4 w-4" aria-hidden="true" />}
            >
              Add topic
            </Button>
          </>
        }
      />

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
          icon={<ListTree className="h-5 w-5" />}
          title="No topics yet"
          description="Add topics manually to define what this subject covers and which sources each topic is drawn from."
          action={
            <Button
              onClick={() => setEditor({ mode: 'create' })}
              leadingIcon={<Plus className="h-4 w-4" aria-hidden="true" />}
            >
              Add topic
            </Button>
          }
        />
      ) : (
        <div className="space-y-3">
          <p className="text-sm text-foreground-muted" aria-live="polite">
            <span className="font-medium text-foreground">{topics.length}</span>{' '}
            {topics.length === 1 ? 'topic' : 'topics'}
            {activeCount < topics.length && (
              <> · {activeCount} active</>
            )}
          </p>

          <ol
            className="overflow-hidden rounded-card border border-border bg-surface shadow-xs"
            aria-label="Syllabus topics"
            aria-busy={reordering}
          >
            {topics.map((topic, index) => {
              const section = sectionOf(topic.name);
              const prevSection =
                index > 0 ? sectionOf(topics[index - 1].name) : null;
              const showHeader =
                showGroups && section != null && section !== prevSection;
              return (
                <Fragment key={topic.id}>
                  {showHeader && (
                    <li className="sticky top-0 z-10 flex items-center justify-between border-b border-border bg-surface/90 px-3 py-1.5 backdrop-blur supports-[backdrop-filter]:bg-surface/75">
                      <span className="text-xs font-semibold uppercase tracking-wide text-foreground-muted">
                        Section {section}
                      </span>
                      <Badge tone="neutral" size="sm">
                        {sectionCounts.get(section)}
                      </Badge>
                    </li>
                  )}
                  <li
                    draggable
                    onDragStart={() => setDragIndex(index)}
                    onDragEnd={() => {
                      setDragIndex(null);
                      setDragOverIndex(null);
                    }}
                    onDragOver={(e: DragEvent) => {
                      e.preventDefault();
                      setDragOverIndex(index);
                    }}
                    onDrop={(e: DragEvent) => {
                      e.preventDefault();
                      handleDrop(index);
                    }}
                    className={[
                      'group relative flex min-h-12 items-center gap-2 px-3 py-2 transition-colors',
                      'border-b border-border last:border-b-0',
                      'hover:bg-surface-muted/50 focus-within:bg-surface-muted/50',
                      dragIndex === index && 'opacity-40',
                      !topic.active && 'opacity-60',
                      dragOverIndex === index &&
                        dragIndex !== index &&
                        'before:absolute before:inset-x-0 before:-top-px before:z-10 before:h-0.5 before:bg-primary',
                    ]
                      .filter(Boolean)
                      .join(' ')}
                  >
                    <TopicRow
                      topic={topic}
                      source={
                        topic.sourceId
                          ? sourceById.get(topic.sourceId)
                          : undefined
                      }
                      isFirst={index === 0}
                      isLast={index === topics.length - 1}
                      busy={reordering}
                      toggling={updateTopic.isPending}
                      onMoveUp={() => moveTopic(index, index - 1)}
                      onMoveDown={() => moveTopic(index, index + 1)}
                      onToggleActive={(active) =>
                        void toggleActive(topic, active)
                      }
                      onEdit={() => setEditor({ mode: 'edit', topic })}
                      onDelete={() => setPendingDelete(topic)}
                    />
                  </li>
                </Fragment>
              );
            })}
          </ol>
        </div>
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

// Controls that only appear on row hover / keyboard focus, so the resting list
// stays clean. Always visible on touch (no hover) via the media query.
const revealOnHover =
  'opacity-0 transition-opacity group-hover:opacity-100 ' +
  'focus-within:opacity-100 [@media(hover:none)]:opacity-100';

function TopicRow({
  topic,
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
    <>
      {/* Drag handle — the primary reorder affordance. */}
      <span
        aria-hidden="true"
        className={
          'flex h-8 w-4 shrink-0 cursor-grab items-center justify-center ' +
          'text-foreground-muted/50 active:cursor-grabbing ' +
          revealOnHover
        }
      >
        <GripVertical className="h-4 w-4" />
      </span>

      {/* Keyboard-accessible reorder, revealed with the handle. */}
      <div className={'flex shrink-0 flex-col ' + revealOnHover}>
        <button
          type="button"
          aria-label={`Move ${topic.name} up`}
          disabled={isFirst || busy}
          onClick={onMoveUp}
          className="flex h-4 w-5 items-center justify-center rounded text-foreground-muted transition-colors hover:text-foreground disabled:opacity-30 focus-visible:opacity-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <ChevronUp className="h-3.5 w-3.5" aria-hidden="true" />
        </button>
        <button
          type="button"
          aria-label={`Move ${topic.name} down`}
          disabled={isLast || busy}
          onClick={onMoveDown}
          className="flex h-4 w-5 items-center justify-center rounded text-foreground-muted transition-colors hover:text-foreground disabled:opacity-30 focus-visible:opacity-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <ChevronDown className="h-3.5 w-3.5" aria-hidden="true" />
        </button>
      </div>

      {/* Name — the syllabus code is already the start of the name. */}
      <div className="min-w-0 flex-1">
        <span className="block truncate text-sm font-medium text-foreground">
          {topic.name}
        </span>
      </div>

      {!topic.active && (
        <Badge tone="neutral" size="sm">
          Inactive
        </Badge>
      )}

      {/* Source — only when linked; hidden on narrow screens. */}
      {source && (
        <span className="hidden max-w-[14rem] items-center gap-1 text-xs text-foreground-muted sm:flex">
          <FileText className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
          <span className="truncate">
            {source.title}
            {pageRange ? ` · ${pageRange}` : ''}
          </span>
        </span>
      )}

      <Toggle
        checked={topic.active}
        onChange={onToggleActive}
        disabled={toggling}
        size="sm"
        aria-label={`Toggle ${topic.name} active`}
      />

      {/* Edit / delete — hover-reveal icon buttons. */}
      <div className={'flex shrink-0 items-center gap-0.5 ' + revealOnHover}>
        <button
          type="button"
          aria-label={`Edit ${topic.name}`}
          onClick={onEdit}
          className="flex h-8 w-8 items-center justify-center rounded-md text-foreground-muted transition-colors hover:bg-surface-muted hover:text-foreground focus-visible:opacity-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <Pencil className="h-4 w-4" aria-hidden="true" />
        </button>
        <button
          type="button"
          aria-label={`Delete ${topic.name}`}
          onClick={onDelete}
          className="flex h-8 w-8 items-center justify-center rounded-md text-foreground-muted transition-colors hover:bg-danger-soft hover:text-danger focus-visible:opacity-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <Trash2 className="h-4 w-4" aria-hidden="true" />
        </button>
      </div>
    </>
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
          <Button
            type="submit"
            form="topic-form"
            loading={submitting}
            leadingIcon={<Check className="h-4 w-4" aria-hidden="true" />}
          >
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
              <span className="text-sm font-medium text-foreground">
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
              <span className="text-sm font-medium text-foreground">
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
    <div
      className="overflow-hidden rounded-card border border-border bg-surface"
      aria-busy="true"
      aria-label="Loading syllabus"
    >
      {Array.from({ length: 8 }).map((_, i) => (
        <div
          key={i}
          className="flex min-h-12 items-center gap-3 border-b border-border px-3 py-2 last:border-b-0"
        >
          <div className="h-4 w-4 shrink-0 rounded bg-surface-muted" />
          <div
            className="h-3.5 animate-pulse rounded bg-surface-muted"
            style={{ width: `${40 + ((i * 7) % 45)}%` }}
          />
          <div className="ml-auto h-5 w-9 shrink-0 rounded-pill bg-surface-muted" />
        </div>
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
      className="rounded-card border border-danger bg-danger-soft p-4"
    >
      <h2 className="text-base font-semibold text-danger">
        Couldn&rsquo;t load the syllabus
      </h2>
      <p className="mt-1 text-sm font-medium text-danger">{message}</p>
      <div className="mt-4">
        <Button
          variant="secondary"
          size="sm"
          onClick={onRetry}
          loading={retrying}
          leadingIcon={<RotateCcw className="h-4 w-4" aria-hidden="true" />}
        >
          Try again
        </Button>
      </div>
    </div>
  );
}
