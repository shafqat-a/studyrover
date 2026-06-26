import { forwardRef } from 'react';
import type { ButtonHTMLAttributes, ReactNode } from 'react';

/**
 * U03 — CitationChip / SourceRef
 *
 * A presentational, accessible chip that renders a single tutor/study-guide
 * citation `{ sourceId, label, locator }`. Props-driven only: no data fetching,
 * no hooks, no business logic. Styling uses the StudyRover design tokens from
 * `tailwind.config.ts` (e.g. `bg-surface-muted`, `rounded-pill`,
 * `shadow-focus`).
 *
 * Behaviour:
 * - Renders a native `<button>` so it is keyboard-focusable and activates on
 *   Enter/Space. Click invokes `onSelect(citation)` so the caller can open the
 *   source at the given locator.
 * - Shows the human-readable `label`; the optional `locator` (e.g. a page range)
 *   is rendered as a muted suffix and surfaced to assistive tech.
 */

/** Minimal shape of a Citation (contracts 2-C01). */
export interface Citation {
  /** Id of the source document this citation points at. */
  sourceId: string;
  /** Human-readable label shown on the chip (e.g. document title). */
  label: string;
  /** Optional position inside the source (e.g. "p. 12" or a section anchor). */
  locator?: string | null;
}

export interface CitationChipProps
  extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'onSelect'> {
  /** The citation to render. */
  citation: Citation;
  /**
   * Invoked when the chip is activated (click / Enter / Space). Receives the
   * citation so the caller can open the source at `locator`.
   */
  onSelect?: (citation: Citation) => void;
  /** Optional element rendered before the label (e.g. a source icon). */
  icon?: ReactNode;
}

/** Joins truthy class fragments into a single className string. */
function cx(...parts: Array<string | false | null | undefined>): string {
  return parts.filter(Boolean).join(' ');
}

const base =
  'inline-flex max-w-full items-center gap-1.5 align-middle ' +
  'rounded-pill border border-border bg-surface-muted ' +
  'px-2.5 py-0.5 text-sm font-medium text-foreground ' +
  'transition-colors duration-150 select-none ' +
  'hover:bg-secondary/15 active:bg-secondary/25 ' +
  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ' +
  'focus-visible:ring-offset-2 focus-visible:ring-offset-background ' +
  'disabled:cursor-not-allowed disabled:opacity-60';

function QuoteIcon() {
  return (
    <svg
      width="1em"
      height="1em"
      viewBox="0 0 24 24"
      fill="currentColor"
      aria-hidden="true"
      focusable="false"
      className="shrink-0 opacity-70"
    >
      <path d="M7 7h6v6c0 2.21-1.79 4-4 4v-2c1.1 0 2-.9 2-2H7V7zm9 0h6v6c0 2.21-1.79 4-4 4v-2c1.1 0 2-.9 2-2h-4V7z" />
    </svg>
  );
}

export const CitationChip = forwardRef<HTMLButtonElement, CitationChipProps>(
  function CitationChip(
    { citation, onSelect, icon, className, onClick, disabled, ...rest },
    ref,
  ) {
    const { label, locator } = citation;
    const trimmedLocator =
      typeof locator === 'string' && locator.trim().length > 0
        ? locator.trim()
        : null;

    const accessibleLabel = trimmedLocator
      ? `Open citation: ${label}, ${trimmedLocator}`
      : `Open citation: ${label}`;

    return (
      <button
        ref={ref}
        type="button"
        disabled={disabled}
        className={cx(base, className)}
        aria-label={accessibleLabel}
        title={accessibleLabel}
        onClick={(event) => {
          onClick?.(event);
          if (!event.defaultPrevented) {
            onSelect?.(citation);
          }
        }}
        {...rest}
      >
        <span className="inline-flex shrink-0" aria-hidden="true">
          {icon ?? <QuoteIcon />}
        </span>
        <span className="truncate">{label}</span>
        {trimmedLocator && (
          <span className="shrink-0 text-foreground-muted" aria-hidden="true">
            · {trimmedLocator}
          </span>
        )}
      </button>
    );
  },
);
