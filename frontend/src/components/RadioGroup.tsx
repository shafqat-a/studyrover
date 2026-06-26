import { forwardRef, useId, useRef } from 'react';
import type { KeyboardEvent } from 'react';

/**
 * U05 — RadioGroup (MCQ)
 *
 * A presentational, accessible single-select control used as the core exam
 * input (pick one choice) and reused in the question editor to mark the correct
 * option. Props-driven only: no data fetching, no business logic. Styling uses
 * the StudyRover design tokens from `tailwind.config.ts` (e.g. `bg-surface`,
 * `rounded-card`, `border-border`, `shadow-card`, `ring`).
 *
 * Accessibility:
 * - Implements the WAI-ARIA radiogroup pattern (`role="radiogroup"` with
 *   `role="radio"` options driven by roving `tabIndex`).
 * - Arrow keys move and select; Space/Enter selects the focused option; Home/End
 *   jump to the first/last enabled option (kid-friendly, large tap targets).
 *
 * Review mode (`showResult` + `correctId`) highlights the correct option in
 * `success` and a wrong-but-selected option in `danger`, with `sr-only` status
 * text so assistive tech announces right/wrong.
 */

export interface RadioOption {
  /** Stable identifier; this is the value emitted via `onChange`. */
  id: string;
  /** Visible label for the option. */
  label: string;
  /** When true, the option cannot be selected or focused. */
  disabled?: boolean;
}

export interface RadioGroupProps {
  /** Options to render, in display order. */
  options: RadioOption[];
  /** Currently selected option id, or `null`/`undefined` when none. */
  value?: string | null;
  /** Called with the newly selected option id. */
  onChange?: (id: string) => void;
  /**
   * Group name, used to derive ids and as the `aria-label` fallback when no
   * `aria-label`/`aria-labelledby` is supplied.
   */
  name: string;
  /** Accessible label for the group (overrides `name` as the label). */
  ['aria-label']?: string;
  /** Id of an external element labelling the group. */
  ['aria-labelledby']?: string;
  /** When true, the option matching `correctId` is highlighted as correct. */
  showResult?: boolean;
  /** Id of the correct option, used only when `showResult` is true. */
  correctId?: string;
  /** Disables the entire group. */
  disabled?: boolean;
  className?: string;
}

/** Joins truthy class fragments into a single className string. */
function cx(...parts: Array<string | false | null | undefined>): string {
  return parts.filter(Boolean).join(' ');
}

type OptionTone = 'default' | 'selected' | 'correct' | 'wrong';

const toneClasses: Record<OptionTone, string> = {
  default:
    'bg-surface border-border text-foreground ' +
    'hover:bg-surface-muted hover:border-foreground-muted',
  selected: 'bg-primary-soft border-primary text-foreground',
  correct: 'bg-success-soft border-success text-foreground',
  wrong: 'bg-danger-soft border-danger text-foreground',
};

const indicatorTone: Record<OptionTone, string> = {
  default: 'border-foreground-muted',
  selected: 'border-primary',
  correct: 'border-success',
  wrong: 'border-danger',
};

const dotTone: Record<OptionTone, string> = {
  default: 'bg-transparent',
  selected: 'bg-primary',
  correct: 'bg-success',
  wrong: 'bg-danger',
};

export const RadioGroup = forwardRef<HTMLDivElement, RadioGroupProps>(
  function RadioGroup(
    {
      options,
      value,
      onChange,
      name,
      showResult = false,
      correctId,
      disabled = false,
      className,
      'aria-label': ariaLabel,
      'aria-labelledby': ariaLabelledby,
    },
    ref,
  ) {
    const baseId = useId();
    const itemRefs = useRef<Array<HTMLButtonElement | null>>([]);

    const isEnabled = (opt: RadioOption) => !disabled && !opt.disabled;
    const enabledIndices = options.reduce<number[]>((acc, opt, i) => {
      if (isEnabled(opt)) acc.push(i);
      return acc;
    }, []);

    const selectedIndex = options.findIndex((o) => o.id === value);
    // The single tab stop: the selected option, else the first enabled one.
    const tabStopIndex =
      selectedIndex >= 0 && isEnabled(options[selectedIndex])
        ? selectedIndex
        : (enabledIndices[0] ?? -1);

    const select = (index: number) => {
      const opt = options[index];
      if (!opt || !isEnabled(opt)) return;
      onChange?.(opt.id);
    };

    const focusAndSelect = (index: number) => {
      const opt = options[index];
      if (!opt || !isEnabled(opt)) return;
      itemRefs.current[index]?.focus();
      select(index);
    };

    const moveFocus = (from: number, dir: 1 | -1) => {
      if (enabledIndices.length === 0) return;
      const pos = enabledIndices.indexOf(from);
      const nextPos =
        pos === -1
          ? 0
          : (pos + dir + enabledIndices.length) % enabledIndices.length;
      focusAndSelect(enabledIndices[nextPos]);
    };

    const handleKeyDown = (
      event: KeyboardEvent<HTMLButtonElement>,
      index: number,
    ) => {
      switch (event.key) {
        case 'ArrowDown':
        case 'ArrowRight':
          event.preventDefault();
          moveFocus(index, 1);
          break;
        case 'ArrowUp':
        case 'ArrowLeft':
          event.preventDefault();
          moveFocus(index, -1);
          break;
        case 'Home':
          event.preventDefault();
          if (enabledIndices.length > 0) focusAndSelect(enabledIndices[0]);
          break;
        case 'End':
          event.preventDefault();
          if (enabledIndices.length > 0)
            focusAndSelect(enabledIndices[enabledIndices.length - 1]);
          break;
        case ' ':
        case 'Enter':
          event.preventDefault();
          select(index);
          break;
        default:
          break;
      }
    };

    return (
      <div
        ref={ref}
        role="radiogroup"
        aria-label={ariaLabelledby ? undefined : (ariaLabel ?? name)}
        aria-labelledby={ariaLabelledby}
        aria-disabled={disabled || undefined}
        className={cx('flex flex-col gap-3', className)}
      >
        {options.map((opt, index) => {
          const optionEnabled = isEnabled(opt);
          const checked = opt.id === value;
          const isCorrect = showResult && correctId === opt.id;
          const isWrongSelected =
            showResult && checked && correctId !== undefined && !isCorrect;

          let tone: OptionTone = 'default';
          if (isCorrect) tone = 'correct';
          else if (isWrongSelected) tone = 'wrong';
          else if (checked) tone = 'selected';

          let statusText: string | null = null;
          if (isCorrect) statusText = 'Correct answer';
          else if (isWrongSelected) statusText = 'Incorrect answer';

          return (
            <button
              key={opt.id}
              ref={(el) => {
                itemRefs.current[index] = el;
              }}
              id={`${baseId}-${opt.id}`}
              type="button"
              role="radio"
              name={name}
              aria-checked={checked}
              disabled={!optionEnabled}
              tabIndex={index === tabStopIndex ? 0 : -1}
              onClick={() => select(index)}
              onKeyDown={(event) => handleKeyDown(event, index)}
              className={cx(
                'flex w-full items-center gap-3 text-left',
                'min-h-touch rounded-card border-2 px-4 py-3',
                'text-base font-medium transition-colors duration-150',
                'focus-visible:outline-none focus-visible:ring-2',
                'focus-visible:ring-ring focus-visible:ring-offset-2',
                'focus-visible:ring-offset-background shadow-card',
                'disabled:cursor-not-allowed disabled:opacity-60',
                'select-none',
                toneClasses[tone],
              )}
            >
              <span
                aria-hidden="true"
                className={cx(
                  'flex h-6 w-6 shrink-0 items-center justify-center',
                  'rounded-full border-2 transition-colors duration-150',
                  indicatorTone[tone],
                )}
              >
                <span
                  className={cx(
                    'h-3 w-3 rounded-full transition-colors duration-150',
                    checked || isCorrect ? dotTone[tone] : 'bg-transparent',
                  )}
                />
              </span>
              <span className="flex-1">{opt.label}</span>
              {statusText != null && (
                <span className="sr-only">{statusText}</span>
              )}
            </button>
          );
        })}
      </div>
    );
  },
);
