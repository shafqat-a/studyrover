import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Ban, ShieldCheck, Wifi } from 'lucide-react';

import { Badge } from '../../components/Badge';
import { Button } from '../../components/Button';
import { Card } from '../../components/Card';
import { ConfirmDialog } from '../../components/ConfirmDialog';
import { ProgressBar } from '../../components/ProgressBar';
import { Table, type TableColumn } from '../../components/Table';
import { CountdownTimer } from '../../components/guardian/CountdownTimer';
import {
  deadlineFrom,
  formatClock,
  formatMinutes,
  formatWhen,
} from '../../components/guardian/countdown';
import type { components } from '../../api/schema';
import {
  useGuardianStatus,
  useRevokeGuardianSession,
} from '../../hooks/useGuardian';
import { useStudentProfile } from '../../hooks/useStudentProfile';
import { wallLabel } from './labels';
import {
  GuardianQueryError,
  GuardianSkeleton,
  SectionHeading,
  SourceBadge,
} from './shared';

/**
 * 3-P02 — Guardian overview (`/parent/guardian`)
 *
 * The at-a-glance view of the Guardian: the enabled / paused state and wall
 * health, today's earned minutes against the daily cap per student, the grants
 * currently open on the wall (with a ticking countdown and a Revoke action),
 * and the most recent grants. Everything comes from the single
 * `GET /guardian/status` snapshot (3-H01), refetched every 15s; countdowns
 * tick locally in between.
 */

type GuardianStatus = components['schemas']['GuardianStatus'];
type GuardianGrant = components['schemas']['GuardianGrant'];
type GuardianDailyUsage = components['schemas']['GuardianDailyUsage'];

export default function GuardianOverview() {
  const statusQuery = useGuardianStatus();

  if (statusQuery.isPending) return <GuardianSkeleton rows={3} />;
  if (statusQuery.isError) {
    return (
      <GuardianQueryError
        error={statusQuery.error}
        onRetry={() => void statusQuery.refetch()}
        retrying={statusQuery.isFetching}
      />
    );
  }

  return (
    <OverviewBody
      status={statusQuery.data}
      syncedAt={statusQuery.dataUpdatedAt}
      onRefresh={() => void statusQuery.refetch()}
    />
  );
}

interface OverviewBodyProps {
  status: GuardianStatus;
  syncedAt: number;
  onRefresh: () => void;
}

function OverviewBody({ status, syncedAt, onRefresh }: OverviewBodyProps) {
  const studentQuery = useStudentProfile();
  const studentName = (id: string) =>
    studentQuery.data?.id === id ? studentQuery.data.name : 'Student';

  return (
    <div className="space-y-6">
      <StatusBanner status={status} />

      <Card padding="md">
        <SectionHeading
          title="Today"
          description="Minutes earned from passed exams against the daily cap. Parent overrides don't count."
        />
        <div className="mt-5">
          {status.dailyUsage.length === 0 ? (
            <p className="text-sm text-foreground-muted">
              Nothing earned yet today.
            </p>
          ) : (
            <ul className="space-y-4" aria-label="Today's earned time">
              {status.dailyUsage.map((usage) => (
                <li key={`${usage.studentId}-${usage.day}`}>
                  <DailyUsageRow usage={usage} name={studentName(usage.studentId)} />
                </li>
              ))}
            </ul>
          )}
        </div>
      </Card>

      <Card padding="md">
        <SectionHeading
          title="Active sessions"
          description="Devices that are online right now. Revoking closes the internet for that device immediately."
          actions={
            <Button variant="secondary" size="sm" onClick={onRefresh}>
              Refresh
            </Button>
          }
        />
        <div className="mt-5">
          {status.active.length === 0 ? (
            <p className="text-sm text-foreground-muted">
              No device is online right now.
            </p>
          ) : (
            <ul className="space-y-3" aria-label="Active sessions">
              {status.active.map((grant) => (
                <li key={grant.id}>
                  <ActiveSessionRow
                    grant={grant}
                    syncedAt={syncedAt}
                    onExpire={onRefresh}
                  />
                </li>
              ))}
            </ul>
          )}
        </div>
      </Card>

      <div className="space-y-3">
        <SectionHeading
          title="Recent grants"
          description="The last grants the Guardian opened, newest first."
        />
        <RecentGrantsTable grants={status.recent} />
      </div>
    </div>
  );
}

function StatusBanner({ status }: { status: GuardianStatus }) {
  const running = !status.paused;
  return (
    <Card padding="md">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex min-w-0 items-start gap-3">
          <span
            className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-lg ${
              running
                ? 'bg-success-soft text-success'
                : 'bg-warning-soft text-warning'
            }`}
            aria-hidden="true"
          >
            <ShieldCheck className="h-5 w-5" />
          </span>
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="font-display text-base font-semibold text-foreground">
                {running ? 'Earned internet time is on' : 'Earned internet time is paused'}
              </h2>
              <Badge tone={running ? 'success' : 'warning'} dot>
                {running ? 'Enabled' : 'Paused'}
              </Badge>
            </div>
            <p className="mt-1 text-sm text-foreground-muted">
              {running
                ? 'Passed exams open the registered devices for the earned minutes.'
                : 'Passed exams are recorded but open no internet time until you turn it back on in Policy.'}
            </p>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2 sm:justify-end">
          <Badge tone="neutral">{wallLabel(status.wall)}</Badge>
          <Badge
            tone={status.wallHealthy ? 'success' : 'danger'}
            dot
            title={status.wallError}
          >
            {status.wallHealthy ? 'Wall healthy' : 'Wall unreachable'}
          </Badge>
          <Link
            to="/parent/guardian/policy"
            className="text-sm font-medium text-primary hover:underline"
          >
            Policy
          </Link>
        </div>
      </div>
      {!status.wallHealthy && status.wallError ? (
        <p
          role="alert"
          className="mt-3 rounded-md border border-danger bg-danger-soft px-3 py-2 text-sm text-foreground"
        >
          {status.wallError}
        </p>
      ) : null}
    </Card>
  );
}

function DailyUsageRow({
  usage,
  name,
}: {
  usage: GuardianDailyUsage;
  name: string;
}) {
  const hasCap = usage.capMinutes > 0;
  const pct = hasCap
    ? Math.min(100, (usage.minutes / usage.capMinutes) * 100)
    : usage.minutes > 0
      ? 100
      : 0;
  const tone = hasCap && pct >= 100 ? 'warning' : 'neutral';
  const valueText = hasCap
    ? `${formatMinutes(usage.minutes)} / ${formatMinutes(usage.capMinutes)}`
    : `${formatMinutes(usage.minutes)} · no cap`;
  return (
    <ProgressBar
      value={pct}
      tone={tone}
      size="md"
      label={
        <span className="inline-flex items-center gap-2">
          {name}
          <span className="text-xs font-normal text-foreground-muted">
            {usage.passes} pass{usage.passes === 1 ? '' : 'es'} today
          </span>
        </span>
      }
      valueText={valueText}
      aria-label={`${name}: ${valueText} earned today`}
    />
  );
}

interface ActiveSessionRowProps {
  grant: GuardianGrant;
  syncedAt: number;
  onExpire: () => void;
}

function ActiveSessionRow({ grant, syncedAt, onExpire }: ActiveSessionRowProps) {
  const revoke = useRevokeGuardianSession();
  const [confirming, setConfirming] = useState(false);
  const deadline = useMemo(
    () => deadlineFrom(grant.remainingSeconds, syncedAt),
    [grant.remainingSeconds, syncedAt],
  );

  return (
    <div className="flex flex-wrap items-center gap-3 rounded-card border border-border bg-surface-muted/60 px-4 py-3">
      <span
        className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-success-soft text-success"
        aria-hidden="true"
      >
        <Wifi className="h-4 w-4" />
      </span>
      <div className="min-w-0 flex-1 basis-48">
        <p className="flex flex-wrap items-center gap-2 text-sm font-semibold text-foreground">
          <span className="min-w-0 break-words">{grant.deviceName}</span>
          <SourceBadge source={grant.source} />
        </p>
        <p className="mt-0.5 flex flex-wrap gap-x-1.5 text-xs text-foreground-muted">
          <span className="font-mono">{grant.mac}</span>
          <span aria-hidden="true">·</span>
          <span>{grant.minutes} min granted</span>
          <span aria-hidden="true">·</span>
          <span>expires {formatClock(grant.expiresAt)}</span>
        </p>
      </div>
      <div className="flex w-full items-center justify-between gap-3 border-t border-border pt-3 sm:ml-auto sm:w-auto sm:justify-end sm:border-t-0 sm:pt-0">
        <CountdownTimer
          deadlineMs={deadline}
          onExpire={onExpire}
          className="font-display text-lg font-semibold tabular-nums text-foreground"
        />
        <Button
          variant="secondary"
          size="sm"
          leadingIcon={<Ban className="h-4 w-4" aria-hidden="true" />}
          onClick={() => setConfirming(true)}
          aria-label={`Revoke ${grant.deviceName}'s session`}
        >
          Revoke
        </Button>
      </div>
      <ConfirmDialog
        open={confirming}
        title="Revoke this session?"
        message={`${grant.deviceName} will lose internet access immediately. The student can earn more time by passing another exam.`}
        confirmLabel="Revoke"
        danger
        onCancel={() => setConfirming(false)}
        onConfirm={async () => {
          try {
            await revoke.mutateAsync(grant.id);
          } finally {
            setConfirming(false);
          }
        }}
      />
    </div>
  );
}

function grantState(grant: GuardianGrant): {
  label: string;
  tone: 'success' | 'neutral' | 'danger';
} {
  if (grant.revokedAt) return { label: 'Revoked', tone: 'danger' };
  if (grant.remainingSeconds > 0) return { label: 'Active', tone: 'success' };
  return { label: 'Expired', tone: 'neutral' };
}

const RECENT_COLUMNS: Array<TableColumn<GuardianGrant>> = [
  {
    key: 'when',
    header: 'When',
    label: 'When',
    cell: (g) => (
      <span className="whitespace-nowrap text-foreground-muted">
        {formatWhen(g.startedAt)}
      </span>
    ),
    width: '9rem',
  },
  {
    key: 'device',
    header: 'Device',
    label: 'Device',
    cell: (g) => <span className="font-medium">{g.deviceName}</span>,
  },
  {
    key: 'minutes',
    header: 'Minutes',
    label: 'Minutes',
    align: 'right',
    cell: (g) => <span className="tabular-nums">{g.minutes}</span>,
    width: '6rem',
  },
  {
    key: 'source',
    header: 'Source',
    label: 'Source',
    cell: (g) => <SourceBadge source={g.source} />,
    width: '9rem',
  },
  {
    key: 'reason',
    header: 'Reason / attempt',
    label: 'Reason',
    cell: (g) =>
      g.source === 'manual' ? (
        <span className="text-foreground-muted">{g.reason ?? '—'}</span>
      ) : g.attemptId ? (
        <span className="font-mono text-xs text-foreground-muted">
          attempt {g.attemptId.slice(0, 8)}
        </span>
      ) : (
        <span className="text-foreground-muted">—</span>
      ),
  },
  {
    key: 'state',
    header: 'Status',
    label: 'Status',
    cell: (g) => {
      const s = grantState(g);
      return (
        <Badge tone={s.tone} size="sm" dot>
          {s.label}
        </Badge>
      );
    },
    width: '6rem',
  },
];

function RecentGrantsTable({ grants }: { grants: GuardianGrant[] }) {
  return (
    <Table<GuardianGrant>
      columns={RECENT_COLUMNS}
      rows={grants}
      rowKey={(g) => g.id}
      caption="Recent internet grants"
      emptyTitle="No grants yet"
      emptyDescription="When the student passes an exam, the grant shows up here."
    />
  );
}
