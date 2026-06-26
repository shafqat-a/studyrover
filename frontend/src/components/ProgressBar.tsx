import { forwardRef } from 'react';
import type { HTMLAttributes, ReactNode } from 'react';

/**
 * U15 — ProgressBar / MasteryBar
 *
 * A presentational, accessible progress/mastery indicator. Props-driven only:
 * no data fetching, no hooks, no business logic. Styling uses the StudyRover
 * design tokens from `tailwind.config.ts` (e.g. `bg-surface-muted`,
 * `rounded-pill`, `text-foreground`, `border-border`).
 *
 * Behaviour:
 * - `value` is clamped to 0–100 and exposed via `role="progressbar"` plus the
 *   matching `aria-valuenow` / `aria-valuemin` / `aria-valuemax` attributes.
 * - Tone is derived from a `passThreshold`: at or above the threshold the bar
 *   reads as `success`, otherwise `warning` (or `danger` when well below).
 *   An explicit `tone` prop overrides the threshold-derived tone.
 * - Optional `label` and a numeric/score readout sit above the track.
 */

export type ProgressBarTone = 'success' | 'warning' | 'danger' | 'neutral';
export type ProgressBarSize = 'sm' | 'md' | 'lg';

interface ProgressBarOwnProps {
  /** Current progress / mastery, 0–100. Values outside the range are clamped. */
  value: number;
  /** Optional label shown above the track (e.g. "Algebra mastery"). */
  label?: ReactNode;
  /**
   * Score at or above which the bar is considered "passing". Drives the
   * threshold tone. Defaults to 80.
   */
  passThreshold?: number;
  /**
   * Score below which the bar reads as `danger` (vs `warning`). Defaults to
   * half the `passThreshold`.
   */
  dangerThreshold?: number;
  /** Force a specific tone, overriding the threshold-derived tone. */
  tone?: ProgressBarTone;
  /** Track thickness. Defaults to `md`. */
  size?: ProgressBarSize;
  /** Show the numeric percentage readout next to the label. Defaults to true. */
  showValue?: boolean;
  /**
   * Custom rendering of the readout (e.g. "12 / 15"). When provided it replaces
   * the default percentage text.
   */
  valueText?: ReactNode;
  className?: string;
}

export type ProgressBarProps = ProgressBarOwnProps &
  Omit<
    HTMLAttributes<HTMLDivElement>,
    keyof ProgressBarOwnProps | 'role' | 'aria-valuenow' | 'aria-valuemin' | 'aria-valuemax'
  >;

/** Joins truthy class fragments into a single className string. */
function cx(...parts: Array<string | false | null | undefined>): string {
  return parts.filter(Boolean).join(' ');
}

/** Clamp `n` into the inclusive [min, max] range. */
function clamp(n: number, min: number, max: number): number {
  if (Number.isNaN(n)) return min;
  return Math.min(max, Math.max(min, n));
}

const sizeClasses: Record<ProgressBarSize, string> = {
  sm: 'h-1.5',
  md: 'h-2.5',
  lg: 'h-4',
};

const fillClasses: Record<ProgressBarTone, string> = {
  success: 'bg-success',
  warning: 'bg-warning',
  danger: 'bg-danger',
  neutral: 'bg-primary',
};

const valueTextClasses: Record<ProgressBarTone, string> = {
  success: 'text-success',
  warning: 'text-warning',
  danger: 'text-danger',
  neutral: 'text-foreground',
};

export const ProgressBar = forwardRef<HTMLDivElement, ProgressBarProps>(
  function ProgressBar(
    {
      value,
      label,
      passThreshold = 80,
      dangerThreshold,
      tone,
      size = 'md',
      showValue = true,
      valueText,
      className,
      ...rest
    },
    ref,
  ) {
    const pct = clamp(value, 0, 100);
    const rounded = Math.round(pct);
    const lowThreshold = dangerThreshold ?? passThreshold / 2;

    const resolvedTone: ProgressBarTone =
      tone ??
      (pct >= passThreshold
        ? 'success'
        : pct < lowThreshold
          ? 'danger'
          : 'warning');

    const hasHeader = label != null || showValue || valueText != null;

    return (
      <div ref={ref} className={cx('w-full', className)} {...rest}>
        {hasHeader && (
          <div className="mb-1.5 flex items-baseline justify-between gap-2">
            {label != null ? (
              <span className="text-sm font-medium text-foreground">
                {label}
              </span>
            ) : (
              <span aria-hidden="true" />
            )}
            {(showValue || valueText != null) && (
              <span
                className={cx(
                  'text-sm font-semibold tabular-nums',
                  valueTextClasses[resolvedTone],
                )}
              >
                {valueText != null ? valueText : `${rounded}%`}
              </span>
            )}
          </div>
        )}
        <div
          role="progressbar"
          aria-valuenow={rounded}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuetext={valueText != null ? undefined : `${rounded}%`}
          className={cx(
            'w-full overflow-hidden rounded-pill border border-border bg-surface-muted',
            sizeClasses[size],
          )}
        >
          <div
            className={cx(
              'h-full rounded-pill transition-all duration-300 ease-out',
              fillClasses[resolvedTone],
            )}
            style={{ width: `${pct}%` }}
          />
        </div>
      </div>
    );
  },
);
