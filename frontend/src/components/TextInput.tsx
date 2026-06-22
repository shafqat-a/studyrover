import { forwardRef, useId } from 'react';
import type { InputHTMLAttributes, ReactNode } from 'react';

/**
 * U02 — TextInput / FormField
 *
 * A presentational, accessible labeled text input. Props-driven only: no data
 * fetching, no hooks beyond `useId` for stable label/help id wiring, no
 * business logic. Styling uses the StudyRover design tokens from
 * `tailwind.config.ts` (e.g. `bg-surface`, `border-border`, `ring-ring`).
 *
 * Accessibility:
 * - `<label>` is associated to the `<input>` via a shared id.
 * - `hint` and `error` text are linked through `aria-describedby`.
 * - When `error` is present, `aria-invalid="true"` is set and the error is
 *   announced (`role="alert"`).
 * - `required` shows a visual marker and sets the native `required` attribute.
 */

export interface TextInputProps
  extends Omit<InputHTMLAttributes<HTMLInputElement>, 'size'> {
  /** Visible label associated with the input. */
  label: ReactNode;
  /** Error message; when set, the field renders in an invalid state. */
  error?: ReactNode;
  /** Supplementary helper text shown below the input (hidden when `error`). */
  hint?: ReactNode;
  /** Marks the field as required (visual marker + native attribute). */
  required?: boolean;
  /** Stretch to fill the available inline width. Defaults to true. */
  fullWidth?: boolean;
  /** Optional element rendered at the start of the field (e.g. an icon). */
  leadingIcon?: ReactNode;
  /** Optional element rendered at the end of the field. */
  trailingIcon?: ReactNode;
  /** Class names applied to the outer wrapper. */
  className?: string;
  /** Class names applied to the `<input>` element. */
  inputClassName?: string;
}

/** Joins truthy class fragments into a single className string. */
function cx(...parts: Array<string | false | null | undefined>): string {
  return parts.filter(Boolean).join(' ');
}

export const TextInput = forwardRef<HTMLInputElement, TextInputProps>(
  function TextInput(
    {
      label,
      error,
      hint,
      required = false,
      fullWidth = true,
      leadingIcon,
      trailingIcon,
      className,
      inputClassName,
      id,
      disabled = false,
      type = 'text',
      'aria-describedby': ariaDescribedBy,
      ...rest
    },
    ref,
  ) {
    const generatedId = useId();
    const inputId = id ?? generatedId;
    const hintId = `${inputId}-hint`;
    const errorId = `${inputId}-error`;
    const hasError = error != null && error !== false;
    const showHint = !hasError && hint != null && hint !== false;

    const describedBy =
      cx(
        ariaDescribedBy,
        hasError ? errorId : undefined,
        showHint ? hintId : undefined,
      ) || undefined;

    return (
      <div className={cx('flex flex-col gap-1.5', fullWidth && 'w-full', className)}>
        <label
          htmlFor={inputId}
          className="text-sm font-semibold text-foreground"
        >
          {label}
          {required && (
            <span className="ml-1 text-danger" aria-hidden="true">
              *
            </span>
          )}
        </label>

        <div
          className={cx(
            'group relative flex items-center gap-2 rounded-md border bg-surface',
            'px-3 transition-colors duration-150',
            'focus-within:ring-2 focus-within:ring-ring focus-within:ring-offset-1',
            'focus-within:ring-offset-background',
            hasError
              ? 'border-danger focus-within:ring-danger'
              : 'border-border',
            disabled && 'cursor-not-allowed opacity-60',
          )}
        >
          {leadingIcon != null && (
            <span
              className="inline-flex shrink-0 text-foreground-muted"
              aria-hidden="true"
            >
              {leadingIcon}
            </span>
          )}

          <input
            ref={ref}
            id={inputId}
            type={type}
            disabled={disabled}
            required={required}
            aria-invalid={hasError || undefined}
            aria-describedby={describedBy}
            aria-required={required || undefined}
            className={cx(
              'h-11 w-full bg-transparent text-base text-foreground',
              'placeholder:text-foreground-muted',
              'focus-visible:outline-none',
              'disabled:cursor-not-allowed',
              inputClassName,
            )}
            {...rest}
          />

          {trailingIcon != null && (
            <span
              className="inline-flex shrink-0 text-foreground-muted"
              aria-hidden="true"
            >
              {trailingIcon}
            </span>
          )}
        </div>

        {hasError ? (
          <p id={errorId} role="alert" className="text-sm font-medium text-danger">
            {error}
          </p>
        ) : showHint ? (
          <p id={hintId} className="text-sm text-foreground-muted">
            {hint}
          </p>
        ) : null}
      </div>
    );
  },
);
