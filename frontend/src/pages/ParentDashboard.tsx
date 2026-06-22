import { useMemo } from 'react';

import { Badge } from '../components/Badge';
import { Button } from '../components/Button';
import { Card } from '../components/Card';
import { GuidanceEditor } from '../components/GuidanceEditor';
import type {
  GuidanceItem,
  GuidanceSubjectOption,
  NewGuidance,
} from '../components/GuidanceEditor';
import { MasteryTimeline } from '../components/MasteryTimeline';
import type { components } from '../api/schema';
import { useDashboard } from '../hooks/useDashboard';
import {
  useCreateGuidance,
  useDeleteGuidance,
  useGuidance,
} from '../hooks/useGuidance';
import { useStudentProfile } from '../hooks/useStudentProfile';
import { useSubjects } from '../hooks/useSubjects';

/**
 * P06 — Parent dashboard (screen 2.10)
 *
 * The parent-facing progress view for a single student. It surfaces, from the
 * H08 `useDashboard` query (C08 / 2-A13):
 *   - headline KPIs: average score, current streak, and topics tracked,
 *   - per-topic mastery (current %),
 *   - the mastery timeline chart (U08 MasteryTimeline),
 *   - recent exam history (scores, pass/fail, dates),
 * and lets the parent steer the tutor through guidance notes (U09
 * GuidanceEditor) backed by the H07 guidance hooks.
 *
 * Phase-1/2 scope: there is NO internet-time / reward UI here — Guardian is off
 * and the contract's Dashboard intentionally omits time fields. The "time
 * earned/used" slot stays empty until the Guardian feature lands (Phase 3).
 *
 * Data flows through the typed hooks only; nothing here hand-rolls fetch. The
 * studentId scope comes from the singleton student profile (H06). States are
 * handled explicitly: profile loading, dashboard loading (skeleton), error
 * (retry), and the populated view.
 */

type Dashboard = components['schemas']['Dashboard'];
type TopicMastery = components['schemas']['TopicMastery'];
type ExamAttempt = components['schemas']['ExamAttempt'];
type Guidance = components['schemas']['Guidance'];
type Subject = components['schemas']['Subject'];

export default function ParentDashboard() {
  const studentQuery = useStudentProfile();
  const studentId = studentQuery.data?.id;

  const dashboardQuery = useDashboard(studentId);
  const subjectsQuery = useSubjects();
  const guidanceQuery = useGuidance();
  const createGuidance = useCreateGuidance();
  const deleteGuidance = useDeleteGuidance();

  const subjectOptions: GuidanceSubjectOption[] = useMemo(
    () =>
      (subjectsQuery.data?.items ?? [])
        .filter((s: Subject) => !s.archived)
        .map((s: Subject) => ({ id: s.id, name: s.name })),
    [subjectsQuery.data],
  );

  // Guidance shown in the editor: prefer the dedicated guidance list, but fall
  // back to whatever the dashboard bundled so the section is never empty when
  // the standalone list is still loading.
  const guidanceItems: GuidanceItem[] = useMemo(() => {
    const source: Guidance[] =
      guidanceQuery.data ?? dashboardQuery.data?.guidance ?? [];
    return source.map((g) => ({
      id: g.id,
      scope: g.scope,
      subjectId: g.subjectId,
      text: g.text,
      createdAt: g.createdAt,
    }));
  }, [guidanceQuery.data, dashboardQuery.data]);

  const guidanceBusy =
    createGuidance.isPending ||
    deleteGuidance.isPending ||
    guidanceQuery.isPending;

  function handleAddGuidance(next: NewGuidance) {
    const body =
      next.scope === 'subject'
        ? { scope: 'subject' as const, subjectId: next.subjectId, text: next.text }
        : { scope: 'global' as const, text: next.text };
    void createGuidance.mutateAsync(body);
  }

  function handleDeleteGuidance(id: string) {
    const target = guidanceItems.find((g) => g.id === id);
    if (!target) return;
    void deleteGuidance.mutateAsync({
      scope: target.scope,
      subjectId: target.subjectId,
    });
  }

  const studentName = studentQuery.data?.name;

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="font-display text-display-sm text-foreground">
            Dashboard
          </h1>
          <p className="mt-1 text-sm text-foreground-muted">
            {studentName
              ? `Progress and tutor guidance for ${studentName}.`
              : 'Progress and tutor guidance.'}
          </p>
        </div>
      </header>

      {studentQuery.isPending ? (
        <DashboardSkeleton />
      ) : studentQuery.isError ? (
        <ErrorState
          message={studentQuery.error.message}
          onRetry={() => void studentQuery.refetch()}
          retrying={studentQuery.isFetching}
        />
      ) : dashboardQuery.isPending ? (
        <DashboardSkeleton />
      ) : dashboardQuery.isError ? (
        <ErrorState
          message={dashboardQuery.error.message}
          onRetry={() => void dashboardQuery.refetch()}
          retrying={dashboardQuery.isFetching}
        />
      ) : (
        <DashboardBody dashboard={dashboardQuery.data} />
      )}

      {/* Guidance editor is always available once we know the student, so the
          parent can steer the tutor even before any progress accrues. */}
      {!studentQuery.isPending && !studentQuery.isError && (
        <GuidanceEditor
          items={guidanceItems}
          subjects={subjectOptions}
          busy={guidanceBusy}
          onAdd={handleAddGuidance}
          onDelete={handleDeleteGuidance}
          description="Notes you add here shape how the AI tutor responds — globally or per subject."
        />
      )}
    </div>
  );
}

function DashboardBody({ dashboard }: { dashboard: Dashboard }) {
  const { mastery, masteryTimeline, history, avgScore, streak } = dashboard;

  return (
    <>
      <section
        className="grid grid-cols-1 gap-4 sm:grid-cols-3"
        aria-label="Summary"
      >
        <StatCard
          label="Average score"
          value={`${Math.round(avgScore)}%`}
          hint="Across graded exam attempts"
        />
        <StatCard
          label="Study streak"
          value={`${streak} ${streak === 1 ? 'day' : 'days'}`}
          hint="Consecutive days of progress"
        />
        <StatCard
          label="Topics tracked"
          value={String(mastery.length)}
          hint="Topics with recorded mastery"
        />
      </section>

      <Card padding="md">
        <MasteryTimeline
          points={masteryTimeline.map((p) => ({
            date: p.date,
            topicId: p.topicId,
            mastery: p.mastery,
          }))}
          title="Mastery over time"
          description="How each topic's mastery has trended."
          emptyLabel="No mastery history yet. It will appear once exams are graded."
        />
      </Card>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <MasterySection mastery={mastery} />
        <HistorySection history={history} />
      </div>
    </>
  );
}

interface StatCardProps {
  label: string;
  value: string;
  hint?: string;
}

function StatCard({ label, value, hint }: StatCardProps) {
  return (
    <Card padding="md">
      <p className="text-sm font-semibold text-foreground-muted">{label}</p>
      <p className="mt-1 font-display text-display-sm text-foreground">
        {value}
      </p>
      {hint ? (
        <p className="mt-1 text-xs text-foreground-muted">{hint}</p>
      ) : null}
    </Card>
  );
}

/** Clamp a raw mastery value (expected 0–100) into a percentage. */
function clampPct(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(100, Math.round(value)));
}

function MasterySection({ mastery }: { mastery: TopicMastery[] }) {
  const sorted = useMemo(
    () => [...mastery].sort((a, b) => b.mastery - a.mastery),
    [mastery],
  );

  return (
    <Card padding="md">
      <h2 className="font-display text-lg font-bold text-foreground">
        Mastery by topic
      </h2>
      {sorted.length === 0 ? (
        <p className="mt-4 rounded-card border border-dashed border-border px-4 py-6 text-center text-sm text-foreground-muted">
          No mastery recorded yet.
        </p>
      ) : (
        <ul className="mt-4 space-y-3" aria-label="Mastery by topic">
          {sorted.map((m) => {
            const pct = clampPct(m.mastery);
            return (
              <li key={m.topicId} className="space-y-1">
                <div className="flex items-center justify-between gap-3 text-sm">
                  <span className="min-w-0 truncate text-foreground">
                    {m.topicId}
                  </span>
                  <span className="shrink-0 font-semibold tabular-nums text-foreground">
                    {pct}%
                  </span>
                </div>
                <div
                  className="h-2 w-full overflow-hidden rounded-pill bg-surface-muted"
                  role="progressbar"
                  aria-valuenow={pct}
                  aria-valuemin={0}
                  aria-valuemax={100}
                  aria-label={`Mastery for topic ${m.topicId}`}
                >
                  <div
                    className="h-full rounded-pill bg-primary"
                    style={{ width: `${pct}%` }}
                  />
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </Card>
  );
}

/** Format an RFC 3339 timestamp as a short, locale-aware date. */
function formatDate(iso?: string): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
}

function HistorySection({ history }: { history: ExamAttempt[] }) {
  return (
    <Card padding="md">
      <h2 className="font-display text-lg font-bold text-foreground">
        Recent exams
      </h2>
      {history.length === 0 ? (
        <p className="mt-4 rounded-card border border-dashed border-border px-4 py-6 text-center text-sm text-foreground-muted">
          No exam attempts yet.
        </p>
      ) : (
        <ul className="mt-4 divide-y divide-border" aria-label="Recent exams">
          {history.map((attempt) => {
            const graded = typeof attempt.scorePct === 'number';
            const date = attempt.submittedAt ?? attempt.startedAt;
            return (
              <li
                key={attempt.id}
                className="flex items-center justify-between gap-3 py-3"
              >
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium text-foreground">
                    {formatDate(date)}
                  </p>
                  <p className="text-xs text-foreground-muted">
                    {graded
                      ? `Score ${clampPct(attempt.scorePct as number)}%`
                      : 'Not yet graded'}
                  </p>
                </div>
                <AttemptBadge attempt={attempt} />
              </li>
            );
          })}
        </ul>
      )}
    </Card>
  );
}

function AttemptBadge({ attempt }: { attempt: ExamAttempt }) {
  if (typeof attempt.passed === 'boolean') {
    return (
      <Badge tone={attempt.passed ? 'success' : 'danger'} size="sm">
        {attempt.passed ? 'Passed' : 'Failed'}
      </Badge>
    );
  }
  return (
    <Badge tone="neutral" size="sm">
      {attempt.status === 'in_progress' ? 'In progress' : 'Pending'}
    </Badge>
  );
}

function DashboardSkeleton() {
  return (
    <div aria-busy="true" aria-label="Loading dashboard" className="space-y-6">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        {Array.from({ length: 3 }).map((_, i) => (
          <div
            key={i}
            className="h-24 animate-pulse rounded-card border border-border bg-surface-muted"
          />
        ))}
      </div>
      <div className="h-64 animate-pulse rounded-card border border-border bg-surface-muted" />
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        {Array.from({ length: 2 }).map((_, i) => (
          <div
            key={i}
            className="h-48 animate-pulse rounded-card border border-border bg-surface-muted"
          />
        ))}
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
      className="rounded-card border border-danger bg-danger-soft p-8 text-center"
    >
      <h2 className="font-display text-display-sm text-danger">
        Couldn&rsquo;t load the dashboard
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
