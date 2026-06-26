import { forwardRef, useId } from 'react';
import type { ReactNode, SelectHTMLAttributes } from 'react';

/**
 * U03 — Select
 *
 * A presentational, accessible labeled select built on the native `<select>`
 * element (which is keyboard-usable and screen-reader friendly out of the box).
 * Props-driven only: no data fetching, no hooks beyond `useId` for stable
 * label/help id wiring, no business logic. Styling uses the StudyRover design
 * tokens from `tailwind.config.ts` (e.g. `bg-surface`, `border-border`,
 * `ring-ring`).
 *
 * Controlled usage: pass `value` and `onChange`.
 *
 * Accessibility:
 * - `<label>` is associated to the `<select>` via a shared id.
 * - `hint` and `error` text are linked through `aria-describedby`.
 * - When `error` is present, `aria-invalid="true"` is set and the error is
 *   announced (`role="alert"`).
 * - `required` shows a visual marker and sets the native `required` attribute.
 * - A `placeholder` renders a disabled, empty-value option used as the prompt.
 */

export interface SelectOption {
  /** Visible option text. */
  label: ReactNode;
  /** Submitted/controlled value for the option. */
  value: string;
  /** Disables selection of this individual option. */
  disabled?: boolean;
}

export interface SelectProps
  extends Omit<SelectHTMLAttributes<HTMLSelectElement>, 'children'> {
  /** Visible label associated with the select. */
  label: ReactNode;
  /** Options to render. */
  options: SelectOption[];
  /** Error message; when set, the field renders in an invalid state. */
  error?: ReactNode;
  /** Supplementary helper text shown below the field (hidden when `error`). */
  hint?: ReactNode;
  /** Prompt shown as a disabled, empty-value first option. */
  placeholder?: string;
  /** Marks the field as required (visual marker + native attribute). */
  required?: boolean;
  /** Stretch to fill the available inline width. Defaults to true. */
  fullWidth?: boolean;
  /** Class names applied to the outer wrapper. */
  className?: string;
  /** Class names applied to the `<select>` element. */
  selectClassName?: string;
}

/** Joins truthy class fragments into a single className string. */
function cx(...parts: Array<string | false | null | undefined>): string {
  return parts.filter(Boolean).join(' ');
}

function ChevronIcon() {
  return (
    <svg
      width="1em"
      height="1em"
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden="true"
      focusable="false"
      className="text-foreground-muted"
    >
      <path
        d="M6 9l6 6 6-6"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export const Select = forwardRef<HTMLSelectElement, SelectProps>(function Select(
  {
    label,
    options,
    error,
    hint,
    placeholder,
    required = false,
    fullWidth = true,
    className,
    selectClassName,
    id,
    disabled = false,
    value,
    defaultValue,
    'aria-describedby': ariaDescribedBy,
    ...rest
  },
  ref,
) {
  const generatedId = useId();
  const selectId = id ?? generatedId;
  const hintId = `${selectId}-hint`;
  const errorId = `${selectId}-error`;
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
      <label htmlFor={selectId} className="text-sm font-semibold text-foreground">
        {label}
        {required && (
          <span className="ml-1 text-danger" aria-hidden="true">
            *
          </span>
        )}
      </label>

      <div
        className={cx(
          'group relative flex items-center rounded-md border bg-surface',
          'transition-colors duration-150',
          'focus-within:ring-2 focus-within:ring-ring focus-within:ring-offset-1',
          'focus-within:ring-offset-background',
          hasError ? 'border-danger focus-within:ring-danger' : 'border-border',
          disabled && 'cursor-not-allowed opacity-60',
        )}
      >
        <select
          ref={ref}
          id={selectId}
          disabled={disabled}
          required={required}
          value={value}
          defaultValue={defaultValue}
          aria-invalid={hasError || undefined}
          aria-describedby={describedBy}
          aria-required={required || undefined}
          className={cx(
            'h-11 w-full appearance-none bg-transparent pl-3 pr-9 text-base text-foreground',
            'focus-visible:outline-none',
            'disabled:cursor-not-allowed',
            selectClassName,
          )}
          {...rest}
        >
          {placeholder != null && (
            <option value="" disabled hidden>
              {placeholder}
            </option>
          )}
          {options.map((option) => (
            <option
              key={option.value}
              value={option.value}
              disabled={option.disabled}
            >
              {option.label}
            </option>
          ))}
        </select>

        <span className="pointer-events-none absolute right-3 inline-flex">
          <ChevronIcon />
        </span>
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
});
