import { useMemo, useState } from 'react';
import type { FormEvent, ReactNode } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import {
  BookOpen,
  BookOpenText,
  ListTree,
  PlaySquare,
  Plus,
  Sparkles,
} from 'lucide-react';

import {
  Button,
  Dialog,
  EmptyState,
  LessonStatusBadge,
  PageHeader,
  Table,
  Textarea,
  TextInput,
  Toggle,
  countResources,
  formatUpdated,
  type Lesson,
} from '../components';
import type { components } from '../api/schema';
import { useCreateLesson, useLessons, useTopics } from '../hooks';

/**
 * Subject → Lessons tab (parent).
 *
 * One row per active topic (syllabus order), joined with the topic's lesson
 * when one exists: status pill (No lesson / Draft / Published), resource
 * counts, last update, and either "Create lesson" (small dialog: title
 * prefilled with the topic name, "Generate with AI" on by default, optional
 * instructions) or "Open" → the lesson editor.
 *
 * Data flows through `useTopics` + `useLessons`; creation through
 * `useCreateLesson` (synchronous AI generation, so the dialog shows a
 * "generating" state until the server answers).
 */

type Topic = components['schemas']['Topic'];

interface LessonRow {
  topic: Topic;
  lesson: Lesson | undefined;
}

export default function SubjectLessons() {
  const { subjectId } = useParams<{ subjectId: string }>();
  const navigate = useNavigate();

  const topicsQuery = useTopics(subjectId, { pageSize: 200 });
  const lessonsQuery = useLessons(subjectId);
  const createLesson = useCreateLesson(subjectId);

  const [creating, setCreating] = useState<Topic | null>(null);

  const rows = useMemo<LessonRow[]>(() => {
    const topics = [...(topicsQuery.data?.items ?? [])]
      .filter((t) => t.active)
      .sort((a, b) => a.order - b.order);
    const byTopic = new Map(
      (lessonsQuery.data ?? []).map((lesson) => [lesson.topicId, lesson]),
    );
    return topics.map((topic) => ({ topic, lesson: byTopic.get(topic.id) }));
  }, [topicsQuery.data, lessonsQuery.data]);

  const published = rows.filter((r) => r.lesson?.status === 'published').length;
  const drafted = rows.filter((r) => r.lesson?.status === 'draft').length;

  function openEditor(lessonId: string) {
    navigate(`/parent/subjects/${subjectId}/lessons/${lessonId}`);
  }

  const columns = useMemo(
    () => [
      {
        key: 'topic',
        header: 'Topic',
        cell: (row: LessonRow) => (
          <div className="min-w-0">
            <p className="truncate font-semibold text-foreground">
              {row.topic.name}
            </p>
            {row.lesson && row.lesson.title !== row.topic.name ? (
              <p className="mt-0.5 truncate text-xs text-foreground-muted">
                {row.lesson.title}
              </p>
            ) : null}
          </div>
        ),
      },
      {
        key: 'status',
        header: 'Status',
        width: '9rem',
        cell: (row: LessonRow) => (
          <LessonStatusBadge status={row.lesson?.status} />
        ),
      },
      {
        key: 'resources',
        header: 'Resources',
        width: '9rem',
        cell: (row: LessonRow) => <ResourceCounts lesson={row.lesson} />,
      },
      {
        key: 'updated',
        header: 'Updated',
        width: '8rem',
        cell: (row: LessonRow) => (
          <span className="text-foreground-muted">
            {formatUpdated(row.lesson?.updatedAt)}
          </span>
        ),
      },
    ],
    [],
  );

  return (
    <div className="space-y-6">
      <PageHeader
        as="h2"
        title="Lessons"
        subtitle="One class lesson per topic — an AI-written body you can edit, enriched with videos and articles. Publish a lesson to make it visible to your student."
        actions={
          rows.length > 0 ? (
            <div className="flex flex-wrap items-center gap-2 text-xs text-foreground-muted">
              <span>
                <span className="font-semibold text-foreground">{published}</span>{' '}
                published
              </span>
              <span aria-hidden="true">·</span>
              <span>
                <span className="font-semibold text-foreground">{drafted}</span>{' '}
                draft{drafted === 1 ? '' : 's'}
              </span>
            </div>
          ) : undefined
        }
      />

      {topicsQuery.isPending || lessonsQuery.isPending ? (
        <ListSkeleton />
      ) : topicsQuery.isError ? (
        <ErrorState
          message={topicsQuery.error.message}
          onRetry={() => void topicsQuery.refetch()}
          retrying={topicsQuery.isFetching}
        />
      ) : lessonsQuery.isError ? (
        <ErrorState
          message={lessonsQuery.error.message}
          onRetry={() => void lessonsQuery.refetch()}
          retrying={lessonsQuery.isFetching}
        />
      ) : rows.length === 0 ? (
        <EmptyState
          icon={<ListTree className="h-5 w-5" />}
          title="Add topics first"
          description="Lessons are written per topic. Build this subject's topic outline, then come back to create a lesson for each one."
          action={
            <Link
              to="../syllabus"
              className="inline-flex h-10 items-center gap-2 rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
            >
              <ListTree className="h-4 w-4" aria-hidden="true" />
              Go to Topics
            </Link>
          }
        />
      ) : (
        <Table<LessonRow>
          caption="Lessons by topic"
          columns={columns}
          rows={rows}
          rowKey={(row) => row.topic.id}
          rowActions={(row) => {
            const lesson = row.lesson;
            return lesson ? (
              <Button
                variant="secondary"
                size="sm"
                onClick={() => openEditor(lesson.id)}
                leadingIcon={<BookOpen className="h-4 w-4" aria-hidden="true" />}
              >
                Open
              </Button>
            ) : (
              <Button
                size="sm"
                onClick={() => setCreating(row.topic)}
                disabled={createLesson.isPending}
                leadingIcon={<Plus className="h-4 w-4" aria-hidden="true" />}
              >
                Create lesson
              </Button>
            );
          }}
        />
      )}

      {creating ? (
        <CreateLessonDialog
          key={creating.id}
          topic={creating}
          submitting={createLesson.isPending}
          onClose={() => {
            if (!createLesson.isPending) setCreating(null);
          }}
          onSubmit={async (form) => {
            const lesson = await createLesson.mutateAsync({
              topicId: creating.id,
              title: form.title.trim() || undefined,
              generate: form.generate,
              instructions:
                form.generate && form.instructions.trim().length > 0
                  ? form.instructions.trim()
                  : undefined,
            });
            setCreating(null);
            openEditor(lesson.id);
          }}
        />
      ) : null}
    </div>
  );
}

/** Compact "▶ 2 · W 1 · 🔗 1" resource summary (only non-zero kinds). */
function ResourceCounts({ lesson }: { lesson: Lesson | undefined }) {
  if (!lesson) {
    return <span className="text-foreground-muted">—</span>;
  }
  const counts = countResources(lesson.resources);
  const parts: { key: string; icon: ReactNode; n: number; label: string }[] =
    [
      {
        key: 'yt',
        icon: <PlaySquare className="h-3.5 w-3.5" aria-hidden="true" />,
        n: counts.youtube,
        label: 'videos',
      },
      {
        key: 'wiki',
        icon: <BookOpenText className="h-3.5 w-3.5" aria-hidden="true" />,
        n: counts.wikipedia,
        label: 'articles',
      },
    ].filter((p) => p.n > 0);
  const links = counts.link;
  if (parts.length === 0 && links === 0) {
    return <span className="text-foreground-muted">None</span>;
  }
  return (
    <span className="inline-flex flex-wrap items-center gap-x-2 gap-y-1 text-foreground">
      {parts.map((p, i) => (
        <span key={p.key} className="inline-flex items-center gap-1">
          {i > 0 ? (
            <span aria-hidden="true" className="text-foreground-muted">
              ·
            </span>
          ) : null}
          {p.icon}
          <span>
            {p.n}
            <span className="sr-only"> {p.label}</span>
          </span>
        </span>
      ))}
      {links > 0 ? (
        <span className="inline-flex items-center gap-1">
          {parts.length > 0 ? (
            <span aria-hidden="true" className="text-foreground-muted">
              ·
            </span>
          ) : null}
          <span>
            {links} link{links === 1 ? '' : 's'}
          </span>
        </span>
      ) : null}
    </span>
  );
}

interface CreateLessonForm {
  title: string;
  generate: boolean;
  instructions: string;
}

interface CreateLessonDialogProps {
  topic: Topic;
  submitting: boolean;
  onClose: () => void;
  onSubmit: (form: CreateLessonForm) => Promise<void>;
}

function CreateLessonDialog({
  topic,
  submitting,
  onClose,
  onSubmit,
}: CreateLessonDialogProps) {
  const [title, setTitle] = useState(topic.name);
  const [generate, setGenerate] = useState(true);
  const [instructions, setInstructions] = useState('');

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (submitting) return;
    void onSubmit({ title, generate, instructions }).catch(() => {
      // Errors are surfaced via toast inside the hook; keep the dialog open.
    });
  }

  const formId = `create-lesson-${topic.id}`;

  return (
    <Dialog
      open
      onClose={onClose}
      title="Create lesson"
      description={
        <>
          For the topic{' '}
          <span className="font-semibold text-foreground">{topic.name}</span>.
        </>
      }
      disableBackdropClose={submitting}
      disableEscapeClose={submitting}
      footer={
        <div className="flex justify-end gap-2">
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
            form={formId}
            loading={submitting}
            loadingLabel={generate ? 'Generating…' : 'Creating…'}
            leadingIcon={
              generate ? (
                <Sparkles className="h-4 w-4" aria-hidden="true" />
              ) : (
                <Plus className="h-4 w-4" aria-hidden="true" />
              )
            }
          >
            {generate ? 'Generate lesson' : 'Create empty lesson'}
          </Button>
        </div>
      }
    >
      <form id={formId} className="flex flex-col gap-4" onSubmit={handleSubmit}>
        <TextInput
          label="Title"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder={topic.name}
          hint="Defaults to the topic name."
          disabled={submitting}
          autoFocus
        />
        <Toggle
          checked={generate}
          onChange={setGenerate}
          disabled={submitting}
          label="Generate with AI"
          description="Write the lesson body now from the curriculum knowledge base. You can edit or regenerate it afterwards."
        />
        {generate ? (
          <Textarea
            label="Instructions (optional)"
            value={instructions}
            onChange={(e) => setInstructions(e.target.value)}
            rows={3}
            placeholder="e.g. Focus on fractions of a set; keep examples grade 5."
            disabled={submitting}
          />
        ) : null}
        {submitting && generate ? (
          <p
            role="status"
            className="rounded-md bg-primary-soft px-3 py-2 text-xs text-foreground"
          >
            Writing the lesson… this can take up to a minute.
          </p>
        ) : null}
      </form>
    </Dialog>
  );
}

function ListSkeleton() {
  return (
    <div
      className="space-y-2"
      aria-busy="true"
      aria-label="Loading lessons"
    >
      {Array.from({ length: 4 }).map((_, i) => (
        <div key={i} className="h-14 animate-pulse rounded-md bg-surface-muted" />
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
      className="rounded-card border border-danger bg-danger-soft p-4 text-center"
    >
      <h3 className="text-base font-semibold text-danger">
        Couldn&rsquo;t load lessons
      </h3>
      <p className="mt-1 text-sm text-foreground-muted">{message}</p>
      <div className="mt-5">
        <Button variant="secondary" size="sm" onClick={onRetry} loading={retrying}>
          Try again
        </Button>
      </div>
    </div>
  );
}
