import type { HTMLAttributes, ReactNode } from 'react';

/**
 * U10 — Badge / StatusPill
 *
 * A presentational, accessible pill for compact status labels (e.g. source
 * status, exam pass/fail). Props-driven only: no data fetching, no hooks, no
 * business logic. Styling uses the StudyRover design tokens from
 * `tailwind.config.ts` (the `*-soft` / `*-foreground` semantic colors and
 * `rounded-pill`).
 *
 * Tones are tuned for AA contrast: foreground text sits on the matching soft
 * surface. An optional leading dot conveys the same status non-textually.
 */

export type BadgeTone =
  | 'neutral'
  | 'success'
  | 'warning'
  | 'danger'
  | 'info';

export type BadgeSize = 'sm' | 'md';

export interface BadgeProps extends HTMLAttributes<HTMLSpanElement> {
  /** Color tone of the pill. Defaults to `neutral`. */
  tone?: BadgeTone;
  /** Size of the pill. Defaults to `md`. */
  size?: BadgeSize;
  /** Render a leading status dot. */
  dot?: boolean;
  children?: ReactNode;
}

/** Joins truthy class fragments into a single className string. */
function cx(...parts: Array<string | false | null | undefined>): string {
  return parts.filter(Boolean).join(' ');
}

const toneClasses: Record<BadgeTone, string> = {
  neutral: 'bg-surface-muted text-foreground',
  success: 'bg-success-soft text-success',
  warning: 'bg-warning-soft text-warning',
  danger: 'bg-danger-soft text-danger',
  // Brand indigo doubles as the informational tone.
  info: 'bg-primary-soft text-primary',
};

const dotClasses: Record<BadgeTone, string> = {
  neutral: 'bg-foreground-muted',
  success: 'bg-success',
  warning: 'bg-warning',
  danger: 'bg-danger',
  info: 'bg-primary',
};

const sizeClasses: Record<BadgeSize, string> = {
  sm: 'h-5 gap-1 px-2 text-xs',
  md: 'h-6 gap-1.5 px-2.5 text-sm',
};

export function Badge({
  tone = 'neutral',
  size = 'md',
  dot = false,
  className,
  children,
  ...rest
}: BadgeProps) {
  return (
    <span
      data-tone={tone}
      className={cx(
        'inline-flex select-none items-center rounded-pill font-semibold leading-none',
        'whitespace-nowrap align-middle',
        toneClasses[tone],
        sizeClasses[size],
        className,
      )}
      {...rest}
    >
      {dot && (
        <span
          aria-hidden="true"
          className={cx('h-1.5 w-1.5 shrink-0 rounded-full', dotClasses[tone])}
        />
      )}
      {children}
    </span>
  );
}
