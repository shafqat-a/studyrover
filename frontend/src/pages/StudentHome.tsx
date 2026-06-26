import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';

import { Badge } from '../components/Badge';
import { Button } from '../components/Button';
import { Card } from '../components/Card';
import type { components } from '../api/schema';
import { useSubjects } from '../hooks/useSubjects';
import { useExamDefinitions } from '../hooks/useExamDefinitions';
import { useTopics } from '../hooks/useTopics';
import { useProgress } from '../hooks/useExamHistory';
import { useStudentProfile } from '../hooks/useStudentProfile';

/**
 * P11 — Student home (screen 3.1)
 *
 * The student's launchpad. A grid of subject cards (color + icon); picking one
 * reveals that subject's exam templates with a "Take an exam" action (routes to
 * P12 — `/student/exams/{examId}/start`) and a disabled "Study" action (P2,
 * reserved for a future tutor surface). A streak chip and the recommended next
 * topic (lowest-mastery topic from H09 progress) sit up top to orient the day.
 *
 * Guardian is off in Phase 1, so there is intentionally NO earned/remaining
 * time UI anywhere on this screen.
 *
 * Data flows entirely through the H01/H04/H03/H06/H09 hooks; nothing here
 * hand-rolls a fetch. States covered: loading (skeleton), error (retry), empty
 * (no subjects), and the populated grid / exam list.
 */

type Subject = components['schemas']['Subject'];
type ExamDefinition = components['schemas']['ExamDefinition'];
type Topic = components['schemas']['Topic'];

const DEFAULT_COLOR = '#6366f1';

export default function StudentHome() {
  const navigate = useNavigate();

  const studentQuery = useStudentProfile();
  const studentId = studentQuery.data?.id;

  const subjectsQuery = useSubjects();
  const progressQuery = useProgress(studentId);

  // The active subject card whose exams are expanded. `null` until one is picked.
  const [activeSubjectId, setActiveSubjectId] = useState<string | null>(null);

  const activeSubjects = useMemo(
    () => subjectsQuery.data?.items.filter((s) => !s.archived) ?? [],
    [subjectsQuery.data],
  );

  const recommendedTopic = useRecommendedTopic(
    progressQuery.data?.mastery,
    activeSubjectId ?? undefined,
  );

  function selectSubject(id: string) {
    setActiveSubjectId((current) => (current === id ? null : id));
  }

  return (
    <div className="space-y-6">
      <header className="space-y-3">
        <div>
          <h1 className="font-display text-display-sm text-foreground">
            {studentQuery.data
              ? `Hi, ${studentQuery.data.name.split(' ')[0]} 👋`
              : 'Welcome back 👋'}
          </h1>
          <p className="mt-1 text-sm text-foreground-muted">
            Pick a subject to take an exam.
          </p>
        </div>
        <StatusStrip
          streak={progressQuery.data?.streak}
          loading={progressQuery.isPending && Boolean(studentId)}
          recommendedTopic={recommendedTopic}
        />
      </header>

      {subjectsQuery.isPending ? (
        <SubjectsSkeleton />
      ) : subjectsQuery.isError ? (
        <ErrorState
          message={subjectsQuery.error.message}
          onRetry={() => void subjectsQuery.refetch()}
          retrying={subjectsQuery.isFetching}
        />
      ) : activeSubjects.length === 0 ? (
        <EmptyState />
      ) : (
        <ul
          className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3"
          aria-label="Subjects"
        >
          {activeSubjects.map((subject) => (
            <li key={subject.id}>
              <SubjectCard
                subject={subject}
                expanded={activeSubjectId === subject.id}
                onSelect={() => selectSubject(subject.id)}
                onTakeExam={(examId) =>
                  navigate(`/student/exams/${examId}/start`)
                }
              />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/**
 * Resolve the recommended next topic for the active subject from the progress
 * mastery list (lowest mastery first). Falls back to the subject's first topic
 * when the student has no mastery records yet. Returns `undefined` while there
 * is no active subject.
 */
function useRecommendedTopic(
  mastery: components['schemas']['TopicMastery'][] | undefined,
  subjectId: string | undefined,
): Topic | undefined {
  const topicsQuery = useTopics(subjectId);
  return useMemo(() => {
    const topics = topicsQuery.data?.items;
    if (!subjectId || !topics || topics.length === 0) {
      return undefined;
    }
    if (!mastery || mastery.length === 0) {
      return [...topics].sort((a, b) => a.order - b.order)[0];
    }
    const masteryById = new Map(mastery.map((m) => [m.topicId, m.mastery]));
    // Lowest mastery (treat unseen topics as 0) wins; ties broken by syllabus order.
    return [...topics].sort((a, b) => {
      const ma = masteryById.get(a.id) ?? 0;
      const mb = masteryById.get(b.id) ?? 0;
      if (ma !== mb) return ma - mb;
      return a.order - b.order;
    })[0];
  }, [topicsQuery.data, mastery, subjectId]);
}

interface StatusStripProps {
  streak: number | undefined;
  loading: boolean;
  recommendedTopic: Topic | undefined;
}

function StatusStrip({ streak, loading, recommendedTopic }: StatusStripProps) {
  return (
    <div className="flex flex-wrap items-center gap-3">
      <span className="inline-flex items-center gap-2 rounded-card bg-surface px-3 py-1.5 shadow-card">
        <span aria-hidden="true" className="text-lg">
          🔥
        </span>
        <span className="text-sm text-foreground">
          {loading ? (
            <span className="text-foreground-muted">Loading streak…</span>
          ) : (
            <>
              <span className="font-display font-bold">{streak ?? 0}</span>{' '}
              <span className="text-foreground-muted">
                day{(streak ?? 0) === 1 ? '' : 's'} streak
              </span>
            </>
          )}
        </span>
      </span>

      {recommendedTopic && (
        <span className="inline-flex min-w-0 items-center gap-2 rounded-card bg-primary-soft px-3 py-1.5">
          <span aria-hidden="true" className="text-lg">
            🎯
          </span>
          <span className="min-w-0 text-sm">
            <span className="text-foreground-muted">Next up:</span>{' '}
            <span className="font-semibold text-foreground">
              {recommendedTopic.name}
            </span>
          </span>
        </span>
      )}
    </div>
  );
}

interface SubjectCardProps {
  subject: Subject;
  expanded: boolean;
  onSelect: () => void;
  onTakeExam: (examId: string) => void;
}

function SubjectCard({
  subject,
  expanded,
  onSelect,
  onTakeExam,
}: SubjectCardProps) {
  const color = subject.color ?? DEFAULT_COLOR;
  return (
    <Card
      padding="md"
      className="flex h-full flex-col"
      style={{ borderTopColor: color, borderTopWidth: 4 }}
    >
      <button
        type="button"
        aria-expanded={expanded}
        onClick={onSelect}
        className="group flex w-full items-center gap-3 rounded-md text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        <span
          aria-hidden="true"
          className="flex h-11 w-11 shrink-0 items-center justify-center rounded-card text-lg font-bold uppercase text-white"
          style={{ backgroundColor: color }}
        >
          {subject.name.trim().charAt(0) || "?"}
        </span>
        <span className="min-w-0 flex-1">
          <span className="block truncate font-display font-bold text-foreground group-hover:underline">
            {subject.name}
          </span>
          {subject.description ? (
            <span className="mt-0.5 block truncate text-sm text-foreground-muted">
              {subject.description}
            </span>
          ) : null}
        </span>
        <span
          aria-hidden="true"
          className={`shrink-0 text-foreground-muted transition-transform ${
            expanded ? 'rotate-90' : ''
          }`}
        >
          ›
        </span>
      </button>

      {expanded && (
        <div className="mt-4 border-t border-border pt-4">
          <SubjectExams subjectId={subject.id} onTakeExam={onTakeExam} />
        </div>
      )}
    </Card>
  );
}

interface SubjectExamsProps {
  subjectId: string;
  onTakeExam: (examId: string) => void;
}

function SubjectExams({ subjectId, onTakeExam }: SubjectExamsProps) {
  const examsQuery = useExamDefinitions(subjectId);

  if (examsQuery.isPending) {
    return (
      <div aria-busy="true" aria-label="Loading exams" className="space-y-2">
        {Array.from({ length: 2 }).map((_, i) => (
          <div
            key={i}
            className="h-10 animate-pulse rounded-md bg-surface-muted"
          />
        ))}
      </div>
    );
  }

  if (examsQuery.isError) {
    return (
      <div
        role="alert"
        className="rounded-md border border-danger bg-danger-soft p-3 text-sm text-foreground"
      >
        <p>{examsQuery.error.message}</p>
        <div className="mt-2">
          <Button
            variant="secondary"
            size="sm"
            onClick={() => void examsQuery.refetch()}
            loading={examsQuery.isFetching}
          >
            Try again
          </Button>
        </div>
      </div>
    );
  }

  const exams = examsQuery.data.items;
  if (exams.length === 0) {
    return (
      <p className="text-sm text-foreground-muted">
        No exams set up for this subject yet.
      </p>
    );
  }

  return (
    <ul className="space-y-2" aria-label="Exams">
      {exams.map((exam) => (
        <li key={exam.id}>
          <ExamRow exam={exam} onTakeExam={() => onTakeExam(exam.id)} />
        </li>
      ))}
    </ul>
  );
}

interface ExamRowProps {
  exam: ExamDefinition;
  onTakeExam: () => void;
}

function ExamRow({ exam, onTakeExam }: ExamRowProps) {
  return (
    <div className="flex items-center justify-between gap-3 rounded-md bg-surface-muted px-3 py-2">
      <div className="min-w-0">
        <p className="truncate text-sm font-semibold text-foreground">
          {exam.name}
        </p>
        <p className="mt-0.5 flex flex-wrap items-center gap-x-2 text-xs text-foreground-muted">
          <span>{exam.size} questions</span>
          <span aria-hidden="true">·</span>
          <span>pass {exam.passBar}%</span>
          <Badge tone="neutral" size="sm">
            {exam.type}
          </Badge>
        </p>
      </div>
      <div className="flex shrink-0 items-center gap-2">
        <Button
          variant="ghost"
          size="sm"
          disabled
          title="Study mode is coming soon"
        >
          Study
        </Button>
        <Button size="sm" onClick={onTakeExam}>
          Take an exam
        </Button>
      </div>
    </div>
  );
}

function SubjectsSkeleton() {
  return (
    <div
      className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3"
      aria-busy="true"
      aria-label="Loading subjects"
    >
      {Array.from({ length: 6 }).map((_, i) => (
        <div
          key={i}
          className="h-24 animate-pulse rounded-card border border-border bg-surface-muted"
        />
      ))}
    </div>
  );
}

function EmptyState() {
  return (
    <div className="rounded-card border border-dashed border-border bg-surface p-12 text-center">
      <p className="text-4xl" aria-hidden="true">
        📚
      </p>
      <h2 className="mt-3 font-display text-display-sm text-foreground">
        No subjects yet
      </h2>
      <p className="mx-auto mt-1 max-w-sm text-sm text-foreground-muted">
        Ask your parent to add a subject and set up an exam, then come back to
        start studying.
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
      <h2 className="font-display text-display-sm text-danger">
        Couldn&rsquo;t load subjects
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
