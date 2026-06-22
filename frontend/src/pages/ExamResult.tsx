import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';

import { Badge } from '../components/Badge';
import { Button } from '../components/Button';
import { Card } from '../components/Card';
import type { components } from '../api/schema';
import { useAttemptResult } from '../hooks/useExamAttempt';

/**
 * P14 — Exam result (screen 3.5)
 *
 * The student's graded report card for a submitted attempt. The attempt is
 * loaded through H08 (`useAttemptResult`), the only endpoint that reveals the
 * answer key (each Answer carries `correct`), so a per-question review is
 * possible here and only here.
 *
 * Layout follows screen 3.5:
 *   - A headline score (U15 score role, composed inline as a ring/percentage)
 *     with a pass / fail pill (U10 Badge).
 *   - A per-topic breakdown bar chart (correct / total per topic).
 *   - A "what to review" list highlighting the weakest topics.
 *   - Actions: review answers (U05 review mode — toggles an inline graded
 *     question list), study weak topics, and retry. Retry respects the
 *     post-failure cooldown: while the attempt's `cooldownUntil` is in the
 *     future the retry button is disabled and shows a live countdown.
 *
 * Phase-1 scope: the "earned time" reward and any "go online" affordance are
 * intentionally absent — there is no time/reward UI on this screen.
 *
 * States: loading (skeleton), error (retry), not-yet-graded guard, and the
 * populated report.
 */

type ExamAttempt = components['schemas']['ExamAttempt'];
type PerTopicScore = components['schemas']['PerTopicScore'];

/** A topic whose score sits at or below the review threshold. */
const WEAK_TOPIC_THRESHOLD = 0.8;

export default function ExamResult() {
  const { attemptId } = useParams<{ attemptId: string }>();
  const navigate = useNavigate();

  const resultQuery = useAttemptResult(attemptId);
  const [reviewing, setReviewing] = useState(false);

  if (!attemptId) {
    return (
      <FatalState
        title="Missing attempt"
        body="No exam attempt was specified. Head back to your home screen to start one."
        actionLabel="Back to home"
        onAction={() => navigate('/student')}
      />
    );
  }

  if (resultQuery.isPending) {
    return <ResultSkeleton />;
  }

  if (resultQuery.isError) {
    return (
      <ErrorState
        message={resultQuery.error.message}
        onRetry={() => void resultQuery.refetch()}
        retrying={resultQuery.isFetching}
      />
    );
  }

  const attempt = resultQuery.data;

  // The result endpoint should only return graded attempts, but guard against
  // an attempt that is somehow still in progress rather than rendering a blank
  // score card.
  if (attempt.status !== 'submitted' || attempt.scorePct === undefined) {
    return (
      <FatalState
        title="Not graded yet"
        body="This attempt hasn't been graded. Finish and submit the exam to see your results."
        actionLabel="Back to home"
        onAction={() => navigate('/student')}
      />
    );
  }

  return (
    <ResultReport
      attempt={attempt}
      reviewing={reviewing}
      onToggleReview={() => setReviewing((v) => !v)}
      onRetry={() =>
        navigate(`/student/exams/${attempt.examDefinitionId}/start`)
      }
      onStudyWeakTopics={() =>
        navigate(`/student/exams/${attempt.examDefinitionId}/start`)
      }
      onHome={() => navigate('/student')}
    />
  );
}

interface ResultReportProps {
  attempt: ExamAttempt;
  reviewing: boolean;
  onToggleReview: () => void;
  onRetry: () => void;
  onStudyWeakTopics: () => void;
  onHome: () => void;
}

function ResultReport({
  attempt,
  reviewing,
  onToggleReview,
  onRetry,
  onStudyWeakTopics,
  onHome,
}: ResultReportProps) {
  const scorePct = Math.round(attempt.scorePct ?? 0);
  const passed = attempt.passed === true;
  const perTopic = attempt.perTopic ?? [];

  const correctCount = attempt.answers.filter((a) => a.correct === true).length;
  const totalCount = attempt.questionIds.length;

  // Weakest topics first (lowest ratio), only those below the review bar.
  const weakTopics = useMemo(() => {
    return [...perTopic]
      .filter((t) => t.total > 0 && t.correct / t.total < WEAK_TOPIC_THRESHOLD)
      .sort((a, b) => a.correct / a.total - b.correct / b.total);
  }, [perTopic]);

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <header>
        <h1 className="font-display text-display-sm text-foreground">
          Exam results
        </h1>
        <p className="mt-1 text-sm text-foreground-muted">
          {correctCount} of {totalCount} questions correct.
        </p>
      </header>

      {/* Score + pass/fail */}
      <Card padding="lg">
        <div className="flex flex-col items-center gap-4 sm:flex-row sm:gap-8">
          <ScoreRing value={scorePct} passed={passed} />
          <div className="text-center sm:text-left">
            <Badge tone={passed ? 'success' : 'danger'} size="md" dot>
              {passed ? 'Passed' : 'Not passed'}
            </Badge>
            <p className="mt-3 text-sm text-foreground-muted">
              {passed
                ? 'Great work — you met the pass bar for this exam.'
                : 'You didn’t quite reach the pass bar this time. Review the topics below and try again.'}
            </p>
          </div>
        </div>
      </Card>

      {/* Per-topic breakdown */}
      {perTopic.length > 0 && (
        <Card padding="lg" className="space-y-4">
          <h2 className="font-display text-lg font-bold text-foreground">
            Topic breakdown
          </h2>
          <ul className="space-y-3" aria-label="Per-topic scores">
            {perTopic.map((topic) => (
              <li key={topic.topicId}>
                <TopicRow topic={topic} />
              </li>
            ))}
          </ul>
        </Card>
      )}

      {/* What to review */}
      {weakTopics.length > 0 && (
        <Card padding="lg" className="space-y-3">
          <h2 className="font-display text-lg font-bold text-foreground">
            What to review
          </h2>
          <p className="text-sm text-foreground-muted">
            Focus your next study session on these topics:
          </p>
          <ul className="flex flex-wrap gap-2" aria-label="Topics to review">
            {weakTopics.map((topic) => (
              <li key={topic.topicId}>
                <Badge tone="warning" size="md">
                  {topic.topicId} · {topic.correct}/{topic.total}
                </Badge>
              </li>
            ))}
          </ul>
        </Card>
      )}

      {/* Actions */}
      <div className="flex flex-wrap items-center gap-3">
        <Button variant="secondary" onClick={onToggleReview}>
          {reviewing ? 'Hide answers' : 'Review answers'}
        </Button>
        {weakTopics.length > 0 && (
          <Button variant="secondary" onClick={onStudyWeakTopics}>
            Study weak topics
          </Button>
        )}
        <RetryButton attempt={attempt} onRetry={onRetry} />
        <Button variant="ghost" onClick={onHome}>
          Back to home
        </Button>
      </div>

      {/* Review mode (U05): graded per-question list */}
      {reviewing && (
        <ReviewList attempt={attempt} correct={correctCount} total={totalCount} />
      )}
    </div>
  );
}

interface TopicRowProps {
  topic: PerTopicScore;
}

/** A single topic's correct/total ratio rendered as a labelled bar. */
function TopicRow({ topic }: TopicRowProps) {
  const ratio = topic.total > 0 ? topic.correct / topic.total : 0;
  const pct = Math.round(ratio * 100);
  const tone =
    ratio >= WEAK_TOPIC_THRESHOLD
      ? 'bg-success'
      : ratio >= 0.5
        ? 'bg-warning'
        : 'bg-danger';
  return (
    <div>
      <div className="flex items-center justify-between gap-3 text-sm">
        <span className="min-w-0 truncate font-medium text-foreground">
          {topic.topicId}
        </span>
        <span className="shrink-0 tabular-nums text-foreground-muted">
          {topic.correct}/{topic.total} · {pct}%
        </span>
      </div>
      <div
        role="progressbar"
        aria-valuemin={0}
        aria-valuemax={topic.total}
        aria-valuenow={topic.correct}
        aria-label={`${topic.topicId}: ${topic.correct} of ${topic.total} correct`}
        className="mt-1.5 h-2 w-full overflow-hidden rounded-full bg-surface-muted"
      >
        <div
          className={`h-full rounded-full ${tone} transition-[width] duration-300`}
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}

interface ScoreRingProps {
  value: number;
  passed: boolean;
}

/** U15 score role: a circular gauge showing the overall percentage. */
function ScoreRing({ value, passed }: ScoreRingProps) {
  const clamped = Math.max(0, Math.min(100, value));
  const ringColor = passed
    ? 'hsl(var(--sr-success))'
    : 'hsl(var(--sr-danger))';
  const trackColor = 'hsl(var(--sr-surface-muted))';
  return (
    <div
      role="img"
      aria-label={`Score ${clamped} percent`}
      className="relative flex h-32 w-32 shrink-0 items-center justify-center rounded-full"
      style={{
        background: `conic-gradient(${ringColor} ${clamped * 3.6}deg, ${trackColor} 0deg)`,
      }}
    >
      <div className="flex h-24 w-24 flex-col items-center justify-center rounded-full bg-surface">
        <span className="font-display text-display-sm font-bold text-foreground tabular-nums">
          {clamped}%
        </span>
        <span className="text-xs text-foreground-muted">score</span>
      </div>
    </div>
  );
}

interface RetryButtonProps {
  attempt: ExamAttempt;
  onRetry: () => void;
}

/** Retry action that respects the post-failure cooldown with a live countdown. */
function RetryButton({ attempt, onRetry }: RetryButtonProps) {
  const remaining = useCooldownRemaining(attempt.cooldownUntil);
  const blocked = remaining > 0;
  return (
    <Button onClick={onRetry} disabled={blocked}>
      {blocked ? `Retry in ${formatCountdown(remaining)}` : 'Retry exam'}
    </Button>
  );
}

/**
 * Returns the number of whole seconds remaining until `cooldownUntil`, ticking
 * down each second. Returns 0 when there is no cooldown or it has elapsed.
 */
function useCooldownRemaining(cooldownUntil: string | undefined): number {
  const target = useMemo(() => {
    if (!cooldownUntil) return null;
    const ms = Date.parse(cooldownUntil);
    return Number.isNaN(ms) ? null : ms;
  }, [cooldownUntil]);

  const remainingFor = (deadline: number | null): number => {
    if (deadline === null) return 0;
    return Math.max(0, Math.ceil((deadline - Date.now()) / 1000));
  };

  const [remaining, setRemaining] = useState(() => remainingFor(target));

  useEffect(() => {
    setRemaining(remainingFor(target));
    if (target === null) return;
    const id = window.setInterval(() => {
      const next = remainingFor(target);
      setRemaining(next);
      if (next <= 0) {
        window.clearInterval(id);
      }
    }, 1000);
    return () => window.clearInterval(id);
  }, [target]);

  return remaining;
}

/** Format whole seconds as M:SS for the cooldown countdown. */
function formatCountdown(totalSeconds: number): string {
  const safe = Math.max(0, Math.floor(totalSeconds));
  const minutes = Math.floor(safe / 60);
  const seconds = safe % 60;
  return `${minutes}:${seconds.toString().padStart(2, '0')}`;
}

interface ReviewListProps {
  attempt: ExamAttempt;
  correct: number;
  total: number;
}

/**
 * U05 review mode: a graded list of every question in the attempt with its
 * correct / incorrect / unanswered outcome. The result endpoint reveals each
 * Answer's `correct` flag, which is all that is available client-side here.
 */
function ReviewList({ attempt, correct, total }: ReviewListProps) {
  const answersById = useMemo(() => {
    const map = new Map<string, components['schemas']['Answer']>();
    for (const answer of attempt.answers) {
      map.set(answer.questionId, answer);
    }
    return map;
  }, [attempt.answers]);

  return (
    <Card padding="lg" className="space-y-4">
      <h2 className="font-display text-lg font-bold text-foreground">
        Answer review
      </h2>
      <p className="text-sm text-foreground-muted">
        {correct} of {total} answered correctly.
      </p>
      <ol className="space-y-2" aria-label="Answer review">
        {attempt.questionIds.map((questionId, index) => {
          const answer = answersById.get(questionId);
          const outcome: 'correct' | 'incorrect' | 'unanswered' = !answer
            ?.selectedOptionId
            ? 'unanswered'
            : answer.correct === true
              ? 'correct'
              : 'incorrect';
          return (
            <li
              key={questionId}
              className="flex items-center justify-between gap-3 rounded-card border border-border bg-surface px-4 py-3"
            >
              <span className="text-sm font-medium text-foreground">
                Question {index + 1}
              </span>
              <OutcomeBadge outcome={outcome} />
            </li>
          );
        })}
      </ol>
    </Card>
  );
}

function OutcomeBadge({
  outcome,
}: {
  outcome: 'correct' | 'incorrect' | 'unanswered';
}) {
  if (outcome === 'correct') {
    return (
      <Badge tone="success" size="sm" dot>
        Correct
      </Badge>
    );
  }
  if (outcome === 'incorrect') {
    return (
      <Badge tone="danger" size="sm" dot>
        Incorrect
      </Badge>
    );
  }
  return (
    <Badge tone="neutral" size="sm" dot>
      Unanswered
    </Badge>
  );
}

function ResultSkeleton() {
  return (
    <div
      className="mx-auto max-w-3xl space-y-6"
      aria-busy="true"
      aria-label="Loading results"
    >
      <div className="h-8 w-48 animate-pulse rounded-md bg-surface-muted" />
      <div className="h-40 animate-pulse rounded-card border border-border bg-surface-muted" />
      <div className="h-48 animate-pulse rounded-card border border-border bg-surface-muted" />
      <div className="flex gap-3">
        <div className="h-10 w-32 animate-pulse rounded-md bg-surface-muted" />
        <div className="h-10 w-32 animate-pulse rounded-md bg-surface-muted" />
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
        Couldn&rsquo;t load your results
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
