import { useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';

import { Badge } from '../components/Badge';
import { Button } from '../components/Button';
import { Card } from '../components/Card';
import { Select } from '../components/Select';
import type { components } from '../api/schema';
import {
  CooldownError,
  useExamDefinition,
  useStartAttempt,
} from '../hooks';
import { useStudentProfile } from '../hooks/useStudentProfile';

/**
 * P12 — Start exam (screen 3.3)
 *
 * The student's pre-flight screen for a single exam. The route carries the
 * ExamDefinition id (`/student/exams/:examId/start`), so we load that template
 * via H04 (`useExamDefinition`) and the signed-in learner via H06
 * (`useStudentProfile`). The screen previews the exam (name, scope, pass bar)
 * and lets the student pick a question count — 5 / 10 / 20, defaulting to the
 * template's size (spec default 20). Per the spec, time-per-option is hidden in
 * Phase 1, so no timer config is exposed here.
 *
 * "Start" calls H08 (`useStartAttempt` → POST /attempts). The contract's
 * StartAttempt body only carries `examDefinitionId` + `studentId`; the chosen
 * size is a client-side preference surfaced to the student (the server delivers
 * the template's configured size), so it is not sent on the wire. On success we
 * route to the in-progress page (P13) at `/student/attempts/{id}`, forwarding
 * the just-delivered questions through router `state` exactly as ExamRun reads
 * them.
 *
 * Cooldown handling: a post-failure cooldown surfaces as a 409 CONFLICT, which
 * H08 raises as a typed `CooldownError`. Instead of starting, we render a
 * cooldown notice (with the retry time when the server provides it) rather than
 * a generic error toast.
 *
 * States: loading (skeleton), error (retry), missing-exam (recovery), cooldown
 * (blocked), and the populated start card.
 */

type ExamDefinition = components['schemas']['ExamDefinition'];

/** Question-count choices offered to the student (spec §screen 3.3). */
const SIZE_CHOICES = [5, 10, 20] as const;

/** Default size = the template's configured size, clamped into the choices. */
function defaultSizeFor(def: ExamDefinition): number {
  if (SIZE_CHOICES.includes(def.size as (typeof SIZE_CHOICES)[number])) {
    return def.size;
  }
  return 20;
}

/** Human label for an exam's scope. */
function scopeLabel(def: ExamDefinition): string {
  const count = def.scopeTopicIds.length;
  if (count === 0) {
    return 'Whole subject';
  }
  return count === 1 ? '1 topic' : `${count} topics`;
}

/** Format an RFC 3339 cooldown instant for display, falling back gracefully. */
function formatCooldown(until: string | undefined): string | undefined {
  if (!until) return undefined;
  const date = new Date(until);
  if (Number.isNaN(date.getTime())) return undefined;
  return date.toLocaleString();
}

export default function ExamStart() {
  const { examId } = useParams<{ examId: string }>();
  const navigate = useNavigate();

  const examQuery = useExamDefinition(examId);
  const studentQuery = useStudentProfile();
  const startAttempt = useStartAttempt();

  // Chosen question count; `null` until the exam loads and seeds the default.
  const [size, setSize] = useState<number | null>(null);
  // Set when a start attempt is blocked by a post-failure cooldown.
  const [cooldown, setCooldown] = useState<CooldownError | null>(null);

  const def = examQuery.data;
  const effectiveSize = size ?? (def ? defaultSizeFor(def) : 20);

  const sizeOptions = useMemo(
    () =>
      SIZE_CHOICES.map((value) => ({
        value: String(value),
        label: `${value} questions`,
      })),
    [],
  );

  async function handleStart() {
    if (!examId || !studentQuery.data) return;
    setCooldown(null);
    try {
      const result = await startAttempt.mutateAsync({
        examDefinitionId: examId,
        studentId: studentQuery.data.id,
      });
      navigate(`/student/attempts/${result.attempt.id}`, {
        state: { questions: result.questions },
      });
    } catch (error) {
      if (error instanceof CooldownError) {
        setCooldown(error);
        return;
      }
      // Non-cooldown failures are surfaced as a toast by the H08 hook.
    }
  }

  // ----- Render states -----------------------------------------------------

  if (!examId) {
    return (
      <FatalState
        title="Missing exam"
        body="No exam was specified. Head back home and pick an exam to start."
        actionLabel="Back to home"
        onAction={() => navigate('/student')}
      />
    );
  }

  if (examQuery.isPending || studentQuery.isPending) {
    return <StartSkeleton />;
  }

  if (examQuery.isError) {
    return (
      <ErrorState
        message={examQuery.error.message}
        onRetry={() => void examQuery.refetch()}
        retrying={examQuery.isFetching}
      />
    );
  }

  if (studentQuery.isError) {
    return (
      <ErrorState
        message={studentQuery.error.message}
        onRetry={() => void studentQuery.refetch()}
        retrying={studentQuery.isFetching}
      />
    );
  }

  if (!def) {
    return (
      <FatalState
        title="Exam not found"
        body="This exam may have been removed. Head back home to pick another."
        actionLabel="Back to home"
        onAction={() => navigate('/student')}
      />
    );
  }

  const cooldownAt = cooldown ? formatCooldown(cooldown.cooldownUntil) : undefined;

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <header>
        <p className="text-sm font-semibold uppercase tracking-wide text-secondary">
          Ready to start?
        </p>
        <h1 className="mt-1 font-display text-display-sm text-foreground">
          {def.name}
        </h1>
        <p className="mt-1 text-sm text-foreground-muted">
          Take your time and do your best. You&rsquo;ve got this!
        </p>
      </header>

      <Card padding="lg" className="space-y-6">
        <dl className="grid grid-cols-2 gap-4 sm:grid-cols-3">
          <Stat label="Scope" value={scopeLabel(def)} />
          <Stat label="Pass mark" value={`${def.passBar}%`} />
          <Stat
            label="Type"
            value={<Badge tone="neutral" size="sm">{def.type}</Badge>}
          />
        </dl>

        <Select
          label="Number of questions"
          value={String(effectiveSize)}
          options={sizeOptions}
          hint="Choose how many questions to answer this round."
          onChange={(e) => setSize(Number(e.target.value))}
          disabled={Boolean(cooldown) || startAttempt.isPending}
        />

        {cooldown ? (
          <CooldownNotice message={cooldown.message} until={cooldownAt} />
        ) : (
          <div className="flex flex-wrap items-center justify-end gap-3">
            <Button
              variant="ghost"
              onClick={() => navigate('/student')}
              disabled={startAttempt.isPending}
            >
              Not now
            </Button>
            <Button
              size="lg"
              loading={startAttempt.isPending}
              onClick={() => void handleStart()}
            >
              Start exam
            </Button>
          </div>
        )}
      </Card>

      {cooldown && (
        <div className="text-center">
          <Button variant="secondary" onClick={() => navigate('/student')}>
            Back to home
          </Button>
        </div>
      )}
    </div>
  );
}

interface StatProps {
  label: string;
  value: React.ReactNode;
}

function Stat({ label, value }: StatProps) {
  return (
    <div className="rounded-card bg-surface-muted p-3">
      <dt className="text-xs font-semibold uppercase tracking-wide text-foreground-muted">
        {label}
      </dt>
      <dd className="mt-1 text-base font-bold text-foreground">{value}</dd>
    </div>
  );
}

interface CooldownNoticeProps {
  message: string;
  until?: string;
}

/** Shown instead of the Start button when a post-failure cooldown is active. */
function CooldownNotice({ message, until }: CooldownNoticeProps) {
  return (
    <div
      role="status"
      className="rounded-card border border-warning bg-warning-soft p-5 text-center"
    >
      <p className="text-3xl" aria-hidden="true">
        ⏳
      </p>
      <h2 className="mt-2 font-display text-lg font-bold text-foreground">
        Hang on a moment
      </h2>
      <p className="mt-1 text-sm text-foreground-muted">{message}</p>
      {until && (
        <p className="mt-1 text-sm font-semibold text-foreground">
          You can try again at {until}.
        </p>
      )}
    </div>
  );
}

function StartSkeleton() {
  return (
    <div
      className="mx-auto max-w-2xl space-y-6"
      aria-busy="true"
      aria-label="Loading exam"
    >
      <div className="space-y-2">
        <div className="h-4 w-32 animate-pulse rounded-md bg-surface-muted" />
        <div className="h-8 w-64 animate-pulse rounded-md bg-surface-muted" />
      </div>
      <div className="h-64 animate-pulse rounded-card border border-border bg-surface-muted" />
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
