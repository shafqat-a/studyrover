import { forwardRef } from 'react';
import type { ButtonHTMLAttributes, ReactNode } from 'react';

/**
 * U01 — Button
 *
 * A presentational, accessible button primitive. Props-driven only: no data
 * fetching, no hooks, no business logic. Styling uses the StudyRover design
 * tokens from `tailwind.config.ts` (e.g. `bg-primary`, `rounded-pill`,
 * `shadow-focus`).
 *
 * Variants: primary | secondary | ghost | danger.
 * Sizes:    sm | md | lg.
 * States:   `loading` (shows a spinner, sets `aria-busy`, blocks clicks),
 *           `disabled` (blocks clicks). Both keep the element keyboard-focusable
 *           semantics of a native <button> and visibly dim.
 */

export type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger';
export type ButtonSize = 'sm' | 'md' | 'lg';

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  /** Visual style. Defaults to `primary`. */
  variant?: ButtonVariant;
  /** Size of the control. Defaults to `md`. */
  size?: ButtonSize;
  /** When true, shows a spinner, sets `aria-busy`, and blocks interaction. */
  loading?: boolean;
  /** Stretch to fill the available inline width. */
  fullWidth?: boolean;
  /** Optional element rendered before the label (hidden while loading). */
  leadingIcon?: ReactNode;
  /** Optional element rendered after the label. */
  trailingIcon?: ReactNode;
  /** Accessible label shown to assistive tech while `loading` is true. */
  loadingLabel?: string;
  children?: ReactNode;
}

/** Joins truthy class fragments into a single className string. */
function cx(...parts: Array<string | false | null | undefined>): string {
  return parts.filter(Boolean).join(' ');
}

const base =
  'relative inline-flex items-center justify-center gap-2 font-semibold ' +
  'rounded-pill border transition-colors duration-150 select-none ' +
  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ' +
  'focus-visible:ring-offset-2 focus-visible:ring-offset-background ' +
  'disabled:cursor-not-allowed disabled:opacity-60';

const variantClasses: Record<ButtonVariant, string> = {
  primary:
    'bg-primary text-primary-foreground border-transparent ' +
    'hover:bg-primary/90 active:bg-primary/80 shadow-card',
  secondary:
    'bg-secondary text-secondary-foreground border-transparent ' +
    'hover:bg-secondary/90 active:bg-secondary/80 shadow-card',
  ghost:
    'bg-transparent text-foreground border-transparent ' +
    'hover:bg-surface-muted active:bg-surface-muted',
  danger:
    'bg-danger text-danger-foreground border-transparent ' +
    'hover:bg-danger/90 active:bg-danger/80 shadow-card',
};

const sizeClasses: Record<ButtonSize, string> = {
  sm: 'h-9 px-3 text-sm',
  md: 'h-11 px-5 text-base',
  lg: 'h-touch px-7 text-lg',
};

function Spinner({ className }: { className?: string }) {
  return (
    <svg
      className={cx('animate-spin', className)}
      width="1em"
      height="1em"
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden="true"
      focusable="false"
    >
      <circle
        className="opacity-25"
        cx="12"
        cy="12"
        r="10"
        stroke="currentColor"
        strokeWidth="4"
      />
      <path
        className="opacity-90"
        fill="currentColor"
        d="M4 12a8 8 0 0 1 8-8V0C5.373 0 0 5.373 0 12h4z"
      />
    </svg>
  );
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  {
    variant = 'primary',
    size = 'md',
    loading = false,
    fullWidth = false,
    leadingIcon,
    trailingIcon,
    loadingLabel = 'Loading',
    disabled = false,
    type = 'button',
    className,
    children,
    ...rest
  },
  ref,
) {
  const isDisabled = disabled || loading;

  return (
    <button
      ref={ref}
      type={type}
      disabled={isDisabled}
      aria-busy={loading || undefined}
      className={cx(
        base,
        variantClasses[variant],
        sizeClasses[size],
        fullWidth && 'w-full',
        className,
      )}
      {...rest}
    >
      {loading && (
        <span className="absolute inset-0 flex items-center justify-center">
          <Spinner className="h-[1.25em] w-[1.25em]" />
          <span className="sr-only">{loadingLabel}</span>
        </span>
      )}
      <span
        className={cx(
          'inline-flex items-center gap-2',
          loading && 'invisible',
        )}
      >
        {leadingIcon != null && (
          <span className="inline-flex shrink-0" aria-hidden="true">
            {leadingIcon}
          </span>
        )}
        {children}
        {trailingIcon != null && (
          <span className="inline-flex shrink-0" aria-hidden="true">
            {trailingIcon}
          </span>
        )}
      </span>
    </button>
  );
});
