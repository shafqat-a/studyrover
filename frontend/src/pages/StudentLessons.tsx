import { useMemo } from 'react';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import { ArrowLeft, BookOpen, ChevronRight, Home } from 'lucide-react';

import {
  Button,
  Card,
  EmptyState,
  LessonBody,
  LessonResourceGroups,
  Select,
  type Lesson,
} from '../components';
import { useLessons, useSubject } from '../hooks';

/**
 * Student lessons — `/student/subjects/:subjectId/lessons`.
 *
 * Reads the subject's published lessons (the API only returns `published`
 * ones to a student session) and shows them as a left-hand list (a Select on
 * small screens) with the selected lesson on the right: title, Markdown body,
 * then "Watch" (click-to-load YouTube facades), "Read more" (Wikipedia cards)
 * and "Links". `?lesson=<id>` preselects a lesson (the Study tutor and the
 * home card link here).
 */

const LESSON_PARAM = 'lesson';

export default function StudentLessons() {
  const { subjectId } = useParams<{ subjectId: string }>();
  const [searchParams, setSearchParams] = useSearchParams();

  const subjectQuery = useSubject(subjectId);
  const lessonsQuery = useLessons(subjectId);

  // Defensive: the API already filters for students, but never show a draft.
  const lessons = useMemo<Lesson[]>(
    () => (lessonsQuery.data ?? []).filter((l) => l.status === 'published'),
    [lessonsQuery.data],
  );

  const requestedId = searchParams.get(LESSON_PARAM);
  const selected =
    lessons.find((l) => l.id === requestedId) ?? lessons[0] ?? undefined;

  function select(id: string) {
    const next = new URLSearchParams(searchParams);
    next.set(LESSON_PARAM, id);
    setSearchParams(next, { replace: true });
  }

  const subjectName = subjectQuery.data?.name;

  return (
    <div className="space-y-6">
      <header className="space-y-3">
        <Link
          to="/student"
          className="inline-flex items-center gap-1 rounded-sm text-sm text-foreground-muted transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <ArrowLeft className="h-4 w-4" aria-hidden="true" />
          Home
        </Link>
        <div>
          <p className="flex items-center gap-1.5 text-sm font-semibold uppercase tracking-wide text-secondary">
            <BookOpen className="h-4 w-4" aria-hidden="true" />
            Lessons
          </p>
          <h1 className="mt-1 font-display text-xl font-semibold tracking-tight text-foreground sm:text-2xl">
            {subjectName ?? 'Lessons'}
          </h1>
          <p className="mt-1 text-sm text-foreground-muted">
            Read the lesson, then watch the videos and explore the articles
            your parent picked for you.
          </p>
        </div>
      </header>

      {lessonsQuery.isPending ? (
        <LessonsSkeleton />
      ) : lessonsQuery.isError ? (
        <div
          role="alert"
          className="rounded-card border border-danger bg-danger-soft p-4 text-center"
        >
          <h2 className="text-base font-semibold text-danger">
            Couldn&rsquo;t load lessons
          </h2>
          <p className="mt-1 text-sm text-foreground-muted">
            {lessonsQuery.error.message}
          </p>
          <div className="mt-5">
            <Button
              variant="secondary"
              size="sm"
              onClick={() => void lessonsQuery.refetch()}
              loading={lessonsQuery.isFetching}
            >
              Try again
            </Button>
          </div>
        </div>
      ) : lessons.length === 0 || !selected ? (
        <EmptyState
          icon={<BookOpen className="h-5 w-5" aria-hidden="true" />}
          title="No lessons yet"
          description="Ask your parent to publish a lesson for this subject, then come back here to read it."
          action={
            <Link
              to="/student"
              className="inline-flex h-10 items-center gap-2 rounded-md border border-border bg-surface px-4 text-sm font-medium text-foreground transition-colors hover:bg-surface-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
            >
              <Home className="h-4 w-4" aria-hidden="true" />
              Back home
            </Link>
          }
        />
      ) : (
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-[17rem_1fr]">
          {/* Mobile: Select. Desktop: list. */}
          <div className="lg:hidden">
            <Select
              label="Lesson"
              value={selected.id}
              options={lessons.map((l, i) => ({
                value: l.id,
                label: `${i + 1}. ${l.title}`,
              }))}
              onChange={(e) => select(e.target.value)}
            />
          </div>
          <nav aria-label="Lessons" className="hidden lg:block">
            <ol className="space-y-1">
              {lessons.map((l, i) => {
                const active = l.id === selected.id;
                return (
                  <li key={l.id}>
                    <button
                      type="button"
                      onClick={() => select(l.id)}
                      aria-current={active ? 'true' : undefined}
                      className={
                        'flex w-full items-center gap-3 rounded-md px-3 py-2 text-left text-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ' +
                        (active
                          ? 'bg-primary-soft font-semibold text-foreground'
                          : 'text-foreground-muted hover:bg-surface-muted hover:text-foreground')
                      }
                    >
                      <span
                        aria-hidden="true"
                        className={
                          'flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs font-semibold ' +
                          (active
                            ? 'bg-primary text-primary-foreground'
                            : 'bg-surface-muted text-foreground-muted')
                        }
                      >
                        {i + 1}
                      </span>
                      <span className="min-w-0 flex-1 truncate">{l.title}</span>
                      {active ? (
                        <ChevronRight
                          className="h-4 w-4 shrink-0 text-primary"
                          aria-hidden="true"
                        />
                      ) : null}
                    </button>
                  </li>
                );
              })}
            </ol>
          </nav>

          <Card padding="lg" className="min-w-0">
            <article aria-labelledby="student-lesson-title">
              <h2
                id="student-lesson-title"
                className="font-display text-2xl font-semibold tracking-tight text-foreground"
              >
                {selected.title}
              </h2>
              <div className="mt-4">
                {selected.markdown.trim().length > 0 ? (
                  <LessonBody
                    markdown={selected.markdown}
                    stripTitle={selected.title}
                  />
                ) : (
                  <p className="text-sm italic text-foreground-muted">
                    This lesson has no text yet.
                  </p>
                )}
              </div>
            </article>

            {selected.resources.length > 0 ? (
              <div className="mt-8 border-t border-border pt-6">
                <LessonResourceGroups
                  resources={selected.resources}
                  variant="student"
                />
              </div>
            ) : null}
          </Card>
        </div>
      )}
    </div>
  );
}

function LessonsSkeleton() {
  return (
    <div
      className="grid grid-cols-1 gap-6 lg:grid-cols-[17rem_1fr]"
      aria-busy="true"
      aria-label="Loading lessons"
    >
      <div className="hidden space-y-2 lg:block">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="h-9 animate-pulse rounded-md bg-surface-muted" />
        ))}
      </div>
      <div className="h-96 animate-pulse rounded-card bg-surface-muted" />
    </div>
  );
}
