import { useEffect, useMemo, useRef, useState } from 'react';
import { useLocation, useNavigate, useParams } from 'react-router-dom';

import { Badge } from '../components/Badge';
import { Button } from '../components/Button';
import { Card } from '../components/Card';
import type { components } from '../api/schema';
import {
  useAttempt,
  useSubmitAttempt,
} from '../hooks/useExamAttempt';

/**
 * P13 — Exam in progress (screen 3.4)
 *
 * The student answer loop. One multiple-choice question is shown at a time with
 * its options; the answer key is NEVER present client-side — questions are the
 * server's DeliveredQuestion shape (no correctOptionId) and grading happens on
 * submit. The student can move next / previous, jump to any question, and see a
 * progress bar of how many are answered. Submitting requires a confirmation
 * (U19, composed inline) and then runs `useSubmitAttempt`, routing to the exam
 * result page (P14) on success.
 *
 * Delivered questions are handed over from the Start exam page (P12) through
 * React Router location `state` (the `StartAttemptResult.questions`), because
 * the in-progress GET endpoint returns the attempt record (with questionIds)
 * but never re-issues the question texts/options mid-attempt. The attempt
 * record itself is loaded via H08 (`useAttempt`) for status + answer hydration.
 *
 * An optional countdown timer is shown when P12 forwards a `durationMinutes`
 * in location state; when it reaches zero the attempt auto-submits.
 *
 * States: loading (skeleton), error (retry), missing-questions (refresh
 * recovery), already-submitted (redirect to result), and the running exam.
 */

type DeliveredQuestion = components['schemas']['DeliveredQuestion'];
type SubmitAttempt = components['schemas']['SubmitAttempt'];

/**
 * Shape of the location `state` forwarded by the Start exam page (P12). All
 * fields are optional / defensively typed because `state` is `unknown` and a
 * hard refresh drops it entirely.
 */
interface ExamRunLocationState {
  questions?: DeliveredQuestion[];
  durationMinutes?: number;
}

/** Narrow the opaque router `state` to the delivered questions, if present. */
function readState(state: unknown): ExamRunLocationState {
  if (state && typeof state === 'object') {
    const s = state as Record<string, unknown>;
    const questions = Array.isArray(s.questions)
      ? (s.questions as DeliveredQuestion[])
      : undefined;
    const durationMinutes =
      typeof s.durationMinutes === 'number' ? s.durationMinutes : undefined;
    return { questions, durationMinutes };
  }
  return {};
}

/** Format a remaining-seconds count as M:SS. */
function formatClock(totalSeconds: number): string {
  const safe = Math.max(0, Math.floor(totalSeconds));
  const minutes = Math.floor(safe / 60);
  const seconds = safe % 60;
  return `${minutes}:${seconds.toString().padStart(2, '0')}`;
}

export default function ExamRun() {
  const { attemptId } = useParams<{ attemptId: string }>();
  const location = useLocation();
  const navigate = useNavigate();

  const { questions, durationMinutes } = useMemo(
    () => readState(location.state),
    [location.state],
  );

  const attemptQuery = useAttempt(attemptId);
  const submitAttempt = useSubmitAttempt();

  // questionId -> selected optionId. Seeded from any answers already on the
  // attempt record (e.g. when navigating back to a resumed attempt).
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [current, setCurrent] = useState(0);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const seededRef = useRef(false);

  // Hydrate selections from the attempt's existing answers exactly once.
  useEffect(() => {
    if (seededRef.current) return;
    const existing = attemptQuery.data?.answers;
    if (!existing || existing.length === 0) return;
    const seed: Record<string, string> = {};
    for (const answer of existing) {
      if (answer.selectedOptionId) {
        seed[answer.questionId] = answer.selectedOptionId;
      }
    }
    if (Object.keys(seed).length > 0) {
      setAnswers((prev) => ({ ...seed, ...prev }));
    }
    seededRef.current = true;
  }, [attemptQuery.data]);

  // If the attempt has already been graded, the exam is over — send the
  // student to the result page instead of letting them re-answer.
  const alreadySubmitted = attemptQuery.data?.status === 'submitted';
  useEffect(() => {
    if (alreadySubmitted && attemptId) {
      navigate(`/student/attempts/${attemptId}/result`, { replace: true });
    }
  }, [alreadySubmitted, attemptId, navigate]);

  const total = questions?.length ?? 0;
  const answeredCount = useMemo(() => {
    if (!questions) return 0;
    return questions.reduce(
      (count, q) => (answers[q.id] ? count + 1 : count),
      0,
    );
  }, [questions, answers]);

  function buildSubmitBody(): SubmitAttempt {
    return {
      answers: Object.entries(answers).map(([questionId, selectedOptionId]) => ({
        questionId,
        selectedOptionId,
      })),
    };
  }

  async function doSubmit() {
    if (!attemptId) return;
    const result = await submitAttempt.mutateAsync({
      id: attemptId,
      body: buildSubmitBody(),
    });
    navigate(`/student/attempts/${result.attempt.id}/result`, {
      replace: true,
    });
  }

  // ----- Optional countdown timer (auto-submit on expiry) -----------------
  const [remaining, setRemaining] = useState<number | null>(
    typeof durationMinutes === 'number' ? durationMinutes * 60 : null,
  );
  const submittingRef = useRef(false);
  submittingRef.current = submitAttempt.isPending;

  useEffect(() => {
    if (remaining === null) return;
    if (remaining <= 0) {
      if (!submittingRef.current && attemptId) {
        void doSubmit();
      }
      return;
    }
    const timer = window.setInterval(() => {
      setRemaining((value) => (value === null ? value : value - 1));
    }, 1000);
    return () => window.clearInterval(timer);
    // doSubmit is intentionally omitted: it closes over fresh `answers`
    // through the ref-guarded auto-submit, and re-running the interval on
    // every answer change would reset the clock.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [remaining, attemptId]);

  // ----- Render states -----------------------------------------------------

  if (!attemptId) {
    return (
      <FatalState
        title="Missing attempt"
        body="No exam attempt was specified. Head back to your exams to start one."
        actionLabel="Back to home"
        onAction={() => navigate('/student')}
      />
    );
  }

  if (attemptQuery.isPending) {
    return <ExamSkeleton />;
  }

  if (attemptQuery.isError) {
    return (
      <ErrorState
        message={attemptQuery.error.message}
        onRetry={() => void attemptQuery.refetch()}
        retrying={attemptQuery.isFetching}
      />
    );
  }

  if (alreadySubmitted) {
    // The redirect effect is running; render nothing meaningful in the meantime.
    return <ExamSkeleton />;
  }

  if (!questions || questions.length === 0) {
    return (
      <FatalState
        title="Exam questions unavailable"
        body="We couldn't load this exam's questions. This can happen if the page was reloaded mid-exam. Please start the exam again from your home screen."
        actionLabel="Back to home"
        onAction={() => navigate('/student')}
      />
    );
  }

  const question = questions[Math.min(current, total - 1)];
  const selected = answers[question.id];
  const progressPct = total > 0 ? Math.round((answeredCount / total) * 100) : 0;
  const isLast = current >= total - 1;
  const isFirst = current <= 0;

  function selectOption(optionId: string) {
    setAnswers((prev) => ({ ...prev, [question.id]: optionId }));
  }

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <header className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="font-display text-display-sm text-foreground">
              Exam in progress
            </h1>
            <p className="mt-1 text-sm text-foreground-muted">
              Question {current + 1} of {total} · {answeredCount} answered
            </p>
          </div>
          {remaining !== null && (
            <Badge
              tone={remaining <= 60 ? 'danger' : 'neutral'}
              size="md"
              aria-label={`Time remaining ${formatClock(remaining)}`}
            >
              <span className="tabular-nums">{formatClock(remaining)}</span>
            </Badge>
          )}
        </div>

        <ProgressBar value={progressPct} answered={answeredCount} total={total} />

        <nav aria-label="Jump to question" className="flex flex-wrap gap-1.5">
          {questions.map((q, index) => {
            const isCurrent = index === current;
            const isAnswered = Boolean(answers[q.id]);
            return (
              <button
                key={q.id}
                type="button"
                onClick={() => setCurrent(index)}
                aria-current={isCurrent ? 'true' : undefined}
                aria-label={`Question ${index + 1}${
                  isAnswered ? ', answered' : ', not answered'
                }`}
                className={`flex h-8 w-8 items-center justify-center rounded-md border text-sm font-semibold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-surface ${
                  isCurrent
                    ? 'border-primary bg-primary text-on-primary'
                    : isAnswered
                      ? 'border-primary bg-primary-soft text-primary'
                      : 'border-border bg-surface text-foreground-muted hover:bg-surface-muted'
                }`}
              >
                {index + 1}
              </button>
            );
          })}
        </nav>
      </header>

      <Card padding="lg" className="space-y-5">
        <div className="flex items-start justify-between gap-3">
          <h2 className="font-display text-lg font-bold text-foreground">
            {question.text}
          </h2>
          <Badge tone="neutral" size="sm">
            {question.difficulty}
          </Badge>
        </div>

        <fieldset className="space-y-2">
          <legend className="sr-only">Answer options</legend>
          {question.options.map((option) => {
            const isChecked = selected === option.id;
            return (
              <label
                key={option.id}
                className={`flex cursor-pointer items-center gap-3 rounded-card border p-4 transition focus-within:ring-2 focus-within:ring-ring ${
                  isChecked
                    ? 'border-primary bg-primary-soft'
                    : 'border-border bg-surface hover:bg-surface-muted'
                }`}
              >
                <input
                  type="radio"
                  name={`q-${question.id}`}
                  value={option.id}
                  checked={isChecked}
                  onChange={() => selectOption(option.id)}
                  className="h-4 w-4 shrink-0 accent-primary focus:outline-none"
                />
                <span className="text-sm text-foreground">{option.text}</span>
              </label>
            );
          })}
        </fieldset>
      </Card>

      <div className="flex items-center justify-between gap-3">
        <Button
          variant="secondary"
          onClick={() => setCurrent((c) => Math.max(0, c - 1))}
          disabled={isFirst}
        >
          Previous
        </Button>

        {isLast ? (
          <Button
            onClick={() => setConfirmOpen(true)}
            loading={submitAttempt.isPending}
          >
            Submit exam
          </Button>
        ) : (
          <Button onClick={() => setCurrent((c) => Math.min(total - 1, c + 1))}>
            Next
          </Button>
        )}
      </div>

      {!isLast && (
        <div className="text-center">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setConfirmOpen(true)}
            loading={submitAttempt.isPending}
          >
            Submit exam now
          </Button>
        </div>
      )}

      {confirmOpen && (
        <ConfirmDialog
          title="Submit exam?"
          body={
            answeredCount < total
              ? `You've answered ${answeredCount} of ${total} questions. Unanswered questions will be marked incorrect. Submit and grade now?`
              : `You've answered all ${total} questions. Submit and grade now?`
          }
          confirmLabel="Submit"
          busy={submitAttempt.isPending}
          onCancel={() => setConfirmOpen(false)}
          onConfirm={() => void doSubmit()}
        />
      )}
    </div>
  );
}

interface ProgressBarProps {
  value: number;
  answered: number;
  total: number;
}

/** Inline progress bar (U15 role): answered-questions completion. */
function ProgressBar({ value, answered, total }: ProgressBarProps) {
  return (
    <div
      role="progressbar"
      aria-valuemin={0}
      aria-valuemax={total}
      aria-valuenow={answered}
      aria-label={`${answered} of ${total} questions answered`}
      className="h-2 w-full overflow-hidden rounded-full bg-surface-muted"
    >
      <div
        className="h-full rounded-full bg-primary transition-[width] duration-300"
        style={{ width: `${value}%` }}
      />
    </div>
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

/** Inline confirm dialog (U19 role) for the destructive-ish submit action. */
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
        aria-modal="true"
        aria-labelledby="submit-dialog-title"
        aria-describedby="submit-dialog-body"
        className="w-full max-w-sm rounded-card bg-surface p-6 shadow-card"
        onClick={(e) => e.stopPropagation()}
      >
        <h2
          id="submit-dialog-title"
          className="font-display text-display-sm text-foreground"
        >
          {title}
        </h2>
        <p
          id="submit-dialog-body"
          className="mt-2 text-sm text-foreground-muted"
        >
          {body}
        </p>
        <div className="mt-6 flex justify-end gap-2">
          <Button variant="ghost" onClick={onCancel} disabled={busy}>
            Keep going
          </Button>
          <Button loading={busy} onClick={onConfirm}>
            {confirmLabel}
          </Button>
        </div>
      </div>
    </div>
  );
}

function ExamSkeleton() {
  return (
    <div
      className="mx-auto max-w-3xl space-y-6"
      aria-busy="true"
      aria-label="Loading exam"
    >
      <div className="h-8 w-48 animate-pulse rounded-md bg-surface-muted" />
      <div className="h-2 w-full animate-pulse rounded-full bg-surface-muted" />
      <div className="h-64 animate-pulse rounded-card border border-border bg-surface-muted" />
      <div className="flex justify-between">
        <div className="h-10 w-28 animate-pulse rounded-md bg-surface-muted" />
        <div className="h-10 w-28 animate-pulse rounded-md bg-surface-muted" />
      </div>
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
      className="mx-auto max-w-md rounded-card border border-danger bg-danger-soft p-8 text-center"
    >
      <h2 className="font-display text-display-sm text-danger">
        Couldn&rsquo;t load this exam
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

interface FatalStateProps {
  title: string;
  body: string;
  actionLabel: string;
  onAction: () => void;
}

function FatalState({ title, body, actionLabel, onAction }: FatalStateProps) {
  return (
    <div className="mx-auto max-w-md rounded-card border border-dashed border-border bg-surface p-12 text-center">
      <h2 className="font-display text-display-sm text-foreground">{title}</h2>
      <p className="mx-auto mt-1 max-w-sm text-sm text-foreground-muted">
        {body}
      </p>
      <div className="mt-5">
        <Button onClick={onAction}>{actionLabel}</Button>
      </div>
    </div>
  );
}
