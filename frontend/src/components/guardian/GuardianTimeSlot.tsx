import { useEffect, useMemo, useState } from 'react';
import { Timer, Wifi, WifiOff } from 'lucide-react';

import { useEarnedTime } from '../../hooks/useGuardian';
import { CountdownTimer } from './CountdownTimer';
import { deadlineFrom, formatClock, formatMinutes } from './countdown';

/**
 * 3-U06 — GuardianTimeSlot
 *
 * The student-facing "earned internet time" slot that Phase-1 pages reserved
 * (StudentHome, ExamResult). It resolves through `useEarnedTime` (3-H06) and
 * renders NOTHING unless the Guardian is enabled on the server AND turned on
 * by the parent — so with the Guardian off, the Phase-1 pages look identical.
 *
 * Variants:
 *   - `home`: a compact strip. While a grant is open it shows
 *     "Online · 27:35 left" (ticking locally, re-synced every 30s) with the
 *     device name and the wall-clock expiry. Otherwise it nudges the student to
 *     earn time and shows today's earned / cap.
 *   - `result`: shown under the score card after a PASSED attempt. Exam grants
 *     are created asynchronously (~2s after submit), so it polls every 2s for
 *     up to ~15s until `lastGrantAttemptId` matches this attempt, then shows a
 *     celebratory line. If nothing arrives, it gives up quietly.
 *
 * Hidden in print (`print:hidden`) so report cards stay clean.
 */
export interface GuardianTimeSlotProps {
  /** The signed-in student. Nothing renders until it is known. */
  studentId?: string;
  variant: 'home' | 'result';
  /** `result` variant only: the attempt whose grant we are waiting for. */
  attemptId?: string;
  className?: string;
}

/** How long the `result` variant keeps polling for the exam grant (ms). */
const RESULT_POLL_WINDOW_MS = 15_000;
/** Poll cadence while waiting for the exam grant (ms). */
const RESULT_POLL_INTERVAL_MS = 2_000;

export function GuardianTimeSlot(props: GuardianTimeSlotProps) {
  if (props.variant === 'result') {
    return <ResultSlot {...props} />;
  }
  return <HomeSlot {...props} />;
}

function cx(...parts: Array<string | false | null | undefined>): string {
  return parts.filter(Boolean).join(' ');
}

function HomeSlot({ studentId, className }: GuardianTimeSlotProps) {
  const query = useEarnedTime(studentId);
  const data = query.data;

  const deadline = useMemo(
    () => deadlineFrom(data?.remainingSeconds, query.dataUpdatedAt),
    [data?.remainingSeconds, query.dataUpdatedAt],
  );

  if (!data || !data.enabled) return null;

  const online = deadline !== null && deadline > Date.now();
  const until = data.expiresAt ? formatClock(data.expiresAt) : formatClock(deadline ?? undefined);
  const capLabel =
    data.capMinutes > 0
      ? `${formatMinutes(data.minutesToday)} of ${formatMinutes(data.capMinutes)} earned today`
      : `${formatMinutes(data.minutesToday)} earned today`;

  return (
    <div
      className={cx(
        'flex flex-wrap items-center gap-x-3 gap-y-1 rounded-card border px-3 py-2 text-sm print:hidden',
        online
          ? 'border-success/30 bg-success-soft text-foreground'
          : 'border-border bg-surface text-foreground',
        className,
      )}
      data-testid="guardian-time-slot"
    >
      {online ? (
        <>
          <span className="inline-flex items-center gap-2">
            <Wifi className="h-4 w-4 text-success" aria-hidden="true" />
            <span className="font-semibold text-success">Online</span>
            <span aria-hidden="true" className="text-foreground-muted">
              ·
            </span>
            <CountdownTimer
              deadlineMs={deadline}
              onExpire={() => void query.refetch()}
            />
            <span className="text-foreground-muted">left</span>
          </span>
          <span className="text-xs text-foreground-muted">
            {data.deviceName ? `${data.deviceName} · ` : ''}
            {until ? `until ${until}` : ''}
          </span>
        </>
      ) : (
        <>
          <span className="inline-flex items-center gap-2">
            <WifiOff
              className="h-4 w-4 text-foreground-muted"
              aria-hidden="true"
            />
            <span className="text-foreground">
              No internet time yet — pass an exam to earn some.
            </span>
          </span>
          <span className="text-xs text-foreground-muted">{capLabel}</span>
        </>
      )}
    </div>
  );
}

function ResultSlot({ studentId, attemptId, className }: GuardianTimeSlotProps) {
  // Poll quickly until the grant for this attempt appears, then settle down.
  const [gaveUp, setGaveUp] = useState(false);
  const query = useEarnedTime(studentId, {
    enabled: Boolean(attemptId),
    refetchInterval: (q) => {
      const d = q.state.data;
      if (!d || !d.enabled) return false;
      if (d.lastGrantAttemptId === attemptId) return 30_000;
      return gaveUp ? false : RESULT_POLL_INTERVAL_MS;
    },
  });
  const data = query.data;
  const matched = Boolean(
    data && attemptId && data.lastGrantAttemptId === attemptId,
  );

  useEffect(() => {
    if (matched) return;
    const id = window.setTimeout(() => setGaveUp(true), RESULT_POLL_WINDOW_MS);
    return () => window.clearTimeout(id);
  }, [matched, attemptId]);

  const deadline = useMemo(
    () => deadlineFrom(data?.remainingSeconds, query.dataUpdatedAt),
    [data?.remainingSeconds, query.dataUpdatedAt],
  );

  if (!attemptId || !data || !data.enabled) return null;

  if (!matched) {
    if (gaveUp) return null;
    return (
      <p
        className={cx('text-xs text-foreground-muted print:hidden', className)}
        aria-live="polite"
      >
        <span className="inline-flex items-center gap-1.5">
          <Timer className="h-3.5 w-3.5" aria-hidden="true" />
          Checking your internet time…
        </span>
      </p>
    );
  }

  const minutes = data.lastGrantMinutes ?? 0;
  const until = data.expiresAt
    ? formatClock(data.expiresAt)
    : formatClock(deadline ?? undefined);

  if (minutes <= 0) {
    return (
      <div
        className={cx(
          'rounded-card border border-border bg-surface px-4 py-3 text-sm text-foreground-muted print:hidden',
          className,
        )}
        aria-live="polite"
      >
        You passed, but today&rsquo;s internet time cap is already reached — it
        resets tomorrow.
      </div>
    );
  }

  return (
    <div
      className={cx(
        'flex flex-wrap items-center gap-x-3 gap-y-1 rounded-card border border-accent/40 bg-accent-soft px-4 py-3 text-sm text-foreground print:hidden',
        className,
      )}
      aria-live="polite"
      data-testid="guardian-time-slot"
    >
      <span className="inline-flex items-center gap-2 font-semibold">
        <Wifi className="h-4 w-4 text-accent" aria-hidden="true" />
        You earned {minutes} minutes of internet{' '}
        <span aria-hidden="true">🎉</span>
      </span>
      {until ? (
        <span className="text-foreground-muted">· online until {until}</span>
      ) : null}
    </div>
  );
}
