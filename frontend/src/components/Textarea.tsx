import { forwardRef, useId } from 'react';
import type { ReactNode, TextareaHTMLAttributes } from 'react';

/**
 * U04 — Textarea
 *
 * A presentational, accessible multi-line text input. Props-driven only: no
 * data fetching, no business logic. Styling uses the StudyRover design tokens
 * from `tailwind.config.ts` (e.g. `bg-surface`, `rounded-card`,
 * `border-border`, `text-foreground`).
 *
 * Features:
 * - Associated `<label>` (always rendered for assistive tech; visually hidden
 *   when `hideLabel` is set).
 * - `error` / `hint` messaging wired via `aria-describedby` and
 *   `aria-invalid`.
 * - Optional live character count, with `maxLength` awareness.
 * - Controlled usage via `value` + `onChange` (the native textarea contract).
 */

export interface TextareaProps
  extends Omit<TextareaHTMLAttributes<HTMLTextAreaElement>, 'id'> {
  /** Visible (or screen-reader-only) label text. Required for accessibility. */
  label: ReactNode;
  /** Explicit id; one is generated when omitted. */
  id?: string;
  /** Error message. When present, sets the error state and `aria-invalid`. */
  error?: ReactNode;
  /** Helper text shown below the control (suppressed when `error` is set). */
  hint?: ReactNode;
  /** Visually hide the label while keeping it available to assistive tech. */
  hideLabel?: boolean;
  /** Show a live character count. Uses `maxLength` for the limit when set. */
  showCount?: boolean;
}

/** Joins truthy class fragments into a single className string. */
function cx(...parts: Array<string | false | null | undefined>): string {
  return parts.filter(Boolean).join(' ');
}

const fieldBase =
  'block w-full bg-surface text-foreground placeholder:text-foreground-muted ' +
  'border rounded-card px-3 py-2 text-base leading-relaxed resize-y ' +
  'transition-colors duration-150 ' +
  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ' +
  'focus-visible:ring-offset-2 focus-visible:ring-offset-background ' +
  'disabled:cursor-not-allowed disabled:opacity-60';

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaProps>(
  function Textarea(
    {
      label,
      id,
      error,
      hint,
      hideLabel = false,
      showCount = false,
      rows = 4,
      className,
      value,
      defaultValue,
      maxLength,
      disabled = false,
      ...rest
    },
    ref,
  ) {
    const reactId = useId();
    const fieldId = id ?? reactId;
    const errorId = `${fieldId}-error`;
    const hintId = `${fieldId}-hint`;
    const countId = `${fieldId}-count`;

    const hasError = error != null && error !== false;
    const hasHint = !hasError && hint != null && hint !== false;

    const describedBy =
      cx(
        hasError && errorId,
        hasHint && hintId,
        showCount && countId,
      ) || undefined;

    const currentLength =
      typeof value === 'string'
        ? value.length
        : Array.isArray(value)
          ? value.join('').length
          : typeof value === 'number'
            ? String(value).length
            : typeof defaultValue === 'string'
              ? defaultValue.length
              : 0;

    return (
      <div className="w-full">
        <label
          htmlFor={fieldId}
          className={cx(
            'mb-1.5 block text-sm font-semibold text-foreground',
            hideLabel && 'sr-only',
          )}
        >
          {label}
        </label>

        <textarea
          ref={ref}
          id={fieldId}
          rows={rows}
          value={value}
          defaultValue={defaultValue}
          maxLength={maxLength}
          disabled={disabled}
          aria-invalid={hasError || undefined}
          aria-describedby={describedBy}
          className={cx(
            fieldBase,
            hasError
              ? 'border-danger focus-visible:ring-danger'
              : 'border-border',
            className,
          )}
          {...rest}
        />

        <div className="mt-1.5 flex items-start justify-between gap-3">
          <div className="min-w-0 flex-1">
            {hasError && (
              <p id={errorId} className="text-sm text-danger">
                {error}
              </p>
            )}
            {hasHint && (
              <p id={hintId} className="text-sm text-foreground-muted">
                {hint}
              </p>
            )}
          </div>

          {showCount && (
            <p
              id={countId}
              className="shrink-0 text-xs tabular-nums text-foreground-muted"
              aria-live="polite"
            >
              {typeof maxLength === 'number'
                ? `${currentLength}/${maxLength}`
                : currentLength}
            </p>
          )}
        </div>
      </div>
    );
  },
);
