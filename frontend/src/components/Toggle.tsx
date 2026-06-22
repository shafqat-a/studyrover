import { forwardRef } from 'react';
import type { ReactNode } from 'react';

/**
 * U14 — Toggle / Switch
 *
 * A presentational, accessible switch primitive. Props-driven only: no data
 * fetching, no hooks, no business logic. It is a controlled component — the
 * parent owns `checked` and updates it via `onChange`.
 *
 * Accessibility:
 * - Renders a real `<button role="switch">` with `aria-checked`.
 * - Toggles via click and keyboard (native button: Space/Enter activate it).
 * - When a visible `label` is provided it is associated via `aria-labelledby`;
 *   otherwise pass `aria-label` through `...rest` for an accessible name.
 *
 * Styling uses the StudyRover design tokens from `tailwind.config.ts`
 * (e.g. `bg-primary`, `rounded-pill`, `shadow-card`, `ring-ring`). Suitable for
 * ramp / active / reward style on/off controls.
 */

export type ToggleSize = 'sm' | 'md' | 'lg';

export interface ToggleProps {
  /** Controlled on/off state. */
  checked: boolean;
  /** Called with the next checked value when the user toggles. */
  onChange: (checked: boolean) => void;
  /** Optional visible label rendered beside the switch. */
  label?: ReactNode;
  /** Optional description rendered under the label. */
  description?: ReactNode;
  /** Place the label before the switch instead of after. Defaults to before. */
  labelPosition?: 'before' | 'after';
  /** Size of the control. Defaults to `md`. */
  size?: ToggleSize;
  /** When true, blocks interaction and visibly dims. */
  disabled?: boolean;
  /** Accessible name when no visible `label` is provided. */
  'aria-label'?: string;
  /** Forwarded as `aria-labelledby` (overrides the internal association). */
  'aria-labelledby'?: string;
  /** Optional id for the underlying button. */
  id?: string;
  /** Extra classes for the outer wrapper. */
  className?: string;
}

/** Joins truthy class fragments into a single className string. */
function cx(...parts: Array<string | false | null | undefined>): string {
  return parts.filter(Boolean).join(' ');
}

interface SizeSpec {
  /** Track. */
  track: string;
  /** Thumb. */
  thumb: string;
  /** Thumb offset when checked. */
  translate: string;
  /** Label text. */
  text: string;
}

const sizeSpec: Record<ToggleSize, SizeSpec> = {
  sm: { track: 'h-5 w-9', thumb: 'h-4 w-4', translate: 'translate-x-4', text: 'text-sm' },
  md: { track: 'h-6 w-11', thumb: 'h-5 w-5', translate: 'translate-x-5', text: 'text-base' },
  lg: { track: 'h-7 w-[3.25rem]', thumb: 'h-6 w-6', translate: 'translate-x-6', text: 'text-lg' },
};

const trackBase =
  'relative inline-flex shrink-0 items-center rounded-pill border border-transparent ' +
  'transition-colors duration-150 select-none ' +
  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ' +
  'focus-visible:ring-offset-2 focus-visible:ring-offset-background ' +
  'disabled:cursor-not-allowed disabled:opacity-60';

const thumbBase =
  'pointer-events-none inline-block rounded-pill bg-surface shadow-card ' +
  'transform transition-transform duration-150';

let toggleSeq = 0;

export const Toggle = forwardRef<HTMLButtonElement, ToggleProps>(function Toggle(
  {
    checked,
    onChange,
    label,
    description,
    labelPosition = 'before',
    size = 'md',
    disabled = false,
    id,
    className,
    'aria-label': ariaLabel,
    'aria-labelledby': ariaLabelledBy,
  },
  ref,
) {
  const spec = sizeSpec[size];

  // Stable-ish id for label association across the lifetime of this render
  // chain. Not random per render: derived once per component instance via a
  // module counter, mirroring the lightweight house style of the primitives.
  const baseId = id ?? `toggle-${(toggleSeq += 1)}`;
  const labelId = `${baseId}-label`;
  const descId = `${baseId}-desc`;

  const hasLabel = label != null;
  const hasDescription = description != null;

  const resolvedLabelledBy =
    ariaLabelledBy ?? (hasLabel ? labelId : undefined);

  const switchEl = (
    <button
      ref={ref}
      id={baseId}
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={resolvedLabelledBy ? undefined : ariaLabel}
      aria-labelledby={resolvedLabelledBy}
      aria-describedby={hasDescription ? descId : undefined}
      disabled={disabled}
      onClick={() => {
        if (!disabled) onChange(!checked);
      }}
      className={cx(
        trackBase,
        spec.track,
        checked ? 'bg-primary' : 'bg-surface-muted',
      )}
    >
      <span
        aria-hidden="true"
        className={cx(
          thumbBase,
          spec.thumb,
          'ml-0.5',
          checked ? spec.translate : 'translate-x-0',
        )}
      />
    </button>
  );

  if (!hasLabel && !hasDescription) {
    return className ? <span className={className}>{switchEl}</span> : switchEl;
  }

  const labelBlock = (
    <span className="flex min-w-0 flex-col">
      {hasLabel && (
        <span
          id={labelId}
          className={cx('font-medium text-foreground', spec.text)}
        >
          {label}
        </span>
      )}
      {hasDescription && (
        <span id={descId} className="text-sm text-foreground-muted">
          {description}
        </span>
      )}
    </span>
  );

  return (
    <span
      className={cx(
        'inline-flex items-center gap-3',
        disabled && 'opacity-60',
        className,
      )}
    >
      {labelPosition === 'before' && labelBlock}
      {switchEl}
      {labelPosition === 'after' && labelBlock}
    </span>
  );
});
