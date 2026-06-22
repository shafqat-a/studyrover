import { forwardRef } from 'react';
import type { HTMLAttributes, ReactNode } from 'react';

/**
 * 2-U05 — JobStatusIndicator
 *
 * A presentational, accessible indicator for an async job (ingest / syllabus /
 * questions). Props-driven only: no data fetching, no hooks, no business logic.
 * Styling uses the StudyRover design tokens from `tailwind.config.ts` (the
 * `*-soft` / `*-foreground` semantic colors, `rounded-pill`, `rounded-card`).
 *
 * Reflects the four job states from contract 2-C03:
 *   queued | processing | ready | error
 *
 * - A status pill conveys the state textually and (via a dot) non-textually.
 * - While `processing` (or `queued`) a progress track is shown, exposing
 *   `role="progressbar"` with the matching aria values. When `progress` is
 *   omitted the track renders an indeterminate animation.
 * - On `error` the `error` detail is rendered in an `role="alert"` region.
 * - Reaching a terminal state (`ready` / `error`) is announced through an
 *   `aria-live="polite"` region so assistive tech learns of completion without
 *   the user re-reading the component.
 */

export type JobStatusValue = 'queued' | 'processing' | 'ready' | 'error';

interface JobStatusOwnProps {
  /** Current job state. */
  status: JobStatusValue;
  /**
   * Completion percentage, 0–100. Values outside the range are clamped. When
   * omitted while running, the progress track is indeterminate.
   */
  progress?: number;
  /** Error detail, shown only when `status === 'error'`. */
  error?: ReactNode;
  /** Optional human label for the job (e.g. "Ingesting syllabus.pdf"). */
  label?: ReactNode;
  /** Override the default per-status status text. */
  statusText?: string;
  className?: string;
}

export type JobStatusProps = JobStatusOwnProps &
  Omit<HTMLAttributes<HTMLDivElement>, keyof JobStatusOwnProps>;

/** Joins truthy class fragments into a single className string. */
function cx(...parts: Array<string | false | null | undefined>): string {
  return parts.filter(Boolean).join(' ');
}

/** Clamp `n` into the inclusive [min, max] range. */
function clamp(n: number, min: number, max: number): number {
  if (Number.isNaN(n)) return min;
  return Math.min(max, Math.max(min, n));
}

const defaultStatusText: Record<JobStatusValue, string> = {
  queued: 'Queued',
  processing: 'Processing',
  ready: 'Ready',
  error: 'Failed',
};

const pillClasses: Record<JobStatusValue, string> = {
  queued: 'bg-surface-muted text-foreground',
  processing: 'bg-primary-soft text-primary',
  ready: 'bg-success-soft text-success',
  error: 'bg-danger-soft text-danger',
};

const dotClasses: Record<JobStatusValue, string> = {
  queued: 'bg-foreground-muted',
  processing: 'bg-primary',
  ready: 'bg-success',
  error: 'bg-danger',
};

const fillClasses: Record<JobStatusValue, string> = {
  queued: 'bg-foreground-muted',
  processing: 'bg-primary',
  ready: 'bg-success',
  error: 'bg-danger',
};

export const JobStatus = forwardRef<HTMLDivElement, JobStatusProps>(
  function JobStatus(
    { status, progress, error, label, statusText, className, ...rest },
    ref,
  ) {
    const isRunning = status === 'queued' || status === 'processing';
    const isTerminal = status === 'ready' || status === 'error';
    const text = statusText ?? defaultStatusText[status];

    const hasProgress = typeof progress === 'number';
    const pct = hasProgress ? clamp(progress as number, 0, 100) : 0;
    const rounded = Math.round(pct);

    // Show the track while running, and on `ready` (as a completed bar).
    const showTrack = isRunning || status === 'ready';
    const trackPct = status === 'ready' ? 100 : pct;
    const indeterminate = isRunning && !hasProgress;

    return (
      <div
        ref={ref}
        data-status={status}
        className={cx(
          'flex w-full flex-col gap-2 rounded-card border border-border bg-surface p-4 text-foreground',
          className,
        )}
        {...rest}
      >
        <div className="flex items-center justify-between gap-3">
          {label != null ? (
            <span className="min-w-0 truncate text-sm font-medium text-foreground">
              {label}
            </span>
          ) : (
            <span aria-hidden="true" />
          )}

          <span className="flex shrink-0 items-center gap-2">
            <span
              className={cx(
                'inline-flex select-none items-center gap-1.5 rounded-pill px-2.5 py-1',
                'text-sm font-semibold leading-none whitespace-nowrap',
                pillClasses[status],
              )}
            >
              <span
                aria-hidden="true"
                className={cx(
                  'h-1.5 w-1.5 shrink-0 rounded-full',
                  dotClasses[status],
                  status === 'processing' && 'animate-pulse',
                )}
              />
              {text}
            </span>
            {isRunning && hasProgress && (
              <span className="text-sm font-semibold tabular-nums text-foreground-muted">
                {rounded}%
              </span>
            )}
          </span>
        </div>

        {showTrack && (
          <div
            role="progressbar"
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={indeterminate ? undefined : Math.round(trackPct)}
            aria-valuetext={indeterminate ? 'In progress' : `${Math.round(trackPct)}%`}
            aria-label={typeof label === 'string' ? label : 'Job progress'}
            className="h-2.5 w-full overflow-hidden rounded-pill border border-border bg-surface-muted"
          >
            <div
              className={cx(
                'h-full rounded-pill',
                fillClasses[status],
                indeterminate
                  ? 'w-2/5 animate-pulse'
                  : 'transition-all duration-300 ease-out',
              )}
              style={indeterminate ? undefined : { width: `${trackPct}%` }}
            />
          </div>
        )}

        {status === 'error' && error != null && (
          <p role="alert" className="text-sm text-danger">
            {error}
          </p>
        )}

        {/* Polite announcement so assistive tech learns when the job settles. */}
        <span className="sr-only" aria-live="polite">
          {isTerminal
            ? status === 'ready'
              ? 'Job complete.'
              : 'Job failed.'
            : ''}
        </span>
      </div>
    );
  },
);
