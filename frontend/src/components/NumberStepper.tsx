import { forwardRef, useId } from 'react';
import type { ReactNode } from 'react';

/**
 * U13 — NumberStepper
 *
 * A controlled, accessible numeric input with decrement/increment buttons,
 * range clamping, configurable step, and an optional suffix ("%", "min").
 * Props-driven only: no data fetching, no business logic. Styling uses the
 * StudyRover design tokens from `tailwind.config.ts` (e.g. `bg-surface`,
 * `rounded-card`, `border-border`, `shadow-card`).
 *
 * Behaviour:
 * - The displayed/committed value is always clamped to `[min, max]`.
 * - The +/- buttons step by `step` and disable at the respective bound.
 * - The text field accepts free typing; the value is clamped on commit
 *   (blur / Enter) and via ArrowUp / ArrowDown keyboard stepping.
 * - The control group is an accessible spinbutton (`role="spinbutton"` with
 *   `aria-valuemin/max/now`).
 */

export interface NumberStepperProps {
  /** Current numeric value (controlled). */
  value: number;
  /** Called with the next clamped value when the user changes it. */
  onChange: (value: number) => void;
  /** Minimum allowed value. Defaults to `0`. */
  min?: number;
  /** Maximum allowed value. Defaults to `100`. */
  max?: number;
  /** Increment/decrement amount. Defaults to `1`. */
  step?: number;
  /** Optional unit shown after the value, e.g. "%" or "min". */
  suffix?: ReactNode;
  /** Accessible label for the control. */
  label?: string;
  /** Associates an external visible `<label>` via id. */
  id?: string;
  /** When true, blocks all interaction and dims the control. */
  disabled?: boolean;
  /** Decrement button accessible label. Defaults to "Decrease". */
  decrementLabel?: string;
  /** Increment button accessible label. Defaults to "Increase". */
  incrementLabel?: string;
  className?: string;
}

/** Joins truthy class fragments into a single className string. */
function cx(...parts: Array<string | false | null | undefined>): string {
  return parts.filter(Boolean).join(' ');
}

/** Clamp `n` into `[min, max]`. */
function clamp(n: number, min: number, max: number): number {
  if (Number.isNaN(n)) return min;
  return Math.min(max, Math.max(min, n));
}

const stepButton =
  'inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-card ' +
  'border border-border bg-surface text-foreground text-lg font-semibold ' +
  'leading-none select-none transition-colors duration-150 ' +
  'hover:bg-surface-muted active:bg-surface-muted ' +
  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ' +
  'focus-visible:ring-offset-2 focus-visible:ring-offset-background ' +
  'disabled:cursor-not-allowed disabled:opacity-60';

export const NumberStepper = forwardRef<HTMLInputElement, NumberStepperProps>(
  function NumberStepper(
    {
      value,
      onChange,
      min = 0,
      max = 100,
      step = 1,
      suffix,
      label,
      id,
      disabled = false,
      decrementLabel = 'Decrease',
      incrementLabel = 'Increase',
      className,
    },
    ref,
  ) {
    const reactId = useId();
    const inputId = id ?? reactId;

    const current = clamp(value, min, max);
    const canDecrement = !disabled && current > min;
    const canIncrement = !disabled && current < max;

    const commit = (next: number) => {
      const clamped = clamp(next, min, max);
      if (clamped !== value) onChange(clamped);
    };

    const handleStep = (delta: number) => {
      commit(current + delta);
    };

    const handleInputChange = (raw: string) => {
      if (raw.trim() === '') return;
      const parsed = Number(raw);
      if (Number.isNaN(parsed)) return;
      // Allow free typing within range; clamp happens on blur/enter.
      onChange(parsed);
    };

    const handleKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
      if (disabled) return;
      if (event.key === 'ArrowUp') {
        event.preventDefault();
        handleStep(step);
      } else if (event.key === 'ArrowDown') {
        event.preventDefault();
        handleStep(-step);
      } else if (event.key === 'Enter') {
        event.preventDefault();
        commit(current);
      }
    };

    return (
      <div
        role="spinbutton"
        aria-valuenow={current}
        aria-valuemin={min}
        aria-valuemax={max}
        aria-label={label}
        aria-disabled={disabled || undefined}
        className={cx(
          'inline-flex items-center gap-2 rounded-card border border-border ' +
            'bg-surface p-1 shadow-card text-foreground',
          disabled && 'opacity-60',
          className,
        )}
      >
        <button
          type="button"
          className={stepButton}
          onClick={() => handleStep(-step)}
          disabled={!canDecrement}
          aria-label={decrementLabel}
          tabIndex={-1}
        >
          <span aria-hidden="true">&minus;</span>
        </button>

        <div className="inline-flex items-baseline gap-1 px-1">
          <input
            ref={ref}
            id={inputId}
            type="number"
            inputMode="numeric"
            value={current}
            min={min}
            max={max}
            step={step}
            disabled={disabled}
            aria-label={label}
            onChange={(e) => handleInputChange(e.target.value)}
            onBlur={() => commit(current)}
            onKeyDown={handleKeyDown}
            className={cx(
              'w-14 bg-transparent text-center text-base font-semibold ' +
                'text-foreground tabular-nums outline-none ' +
                'focus-visible:rounded-card focus-visible:ring-2 ' +
                'focus-visible:ring-ring ' +
                '[appearance:textfield] ' +
                '[&::-webkit-outer-spin-button]:appearance-none ' +
                '[&::-webkit-inner-spin-button]:appearance-none',
              disabled && 'cursor-not-allowed',
            )}
          />
          {suffix != null && (
            <span
              className="shrink-0 text-sm font-medium text-foreground-muted"
              aria-hidden="true"
            >
              {suffix}
            </span>
          )}
        </div>

        <button
          type="button"
          className={stepButton}
          onClick={() => handleStep(step)}
          disabled={!canIncrement}
          aria-label={incrementLabel}
          tabIndex={-1}
        >
          <span aria-hidden="true">+</span>
        </button>
      </div>
    );
  },
);
