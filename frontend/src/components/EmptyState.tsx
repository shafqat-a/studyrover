import { forwardRef } from 'react';
import type { HTMLAttributes, ReactNode } from 'react';

/**
 * U18 — EmptyState
 *
 * A presentational, accessible empty-state for empty lists (subjects,
 * questions, history, etc.). Props-driven only: no data fetching, no hooks,
 * no business logic. Styling uses the StudyRover design tokens from
 * `tailwind.config.ts` (e.g. `bg-surface`, `rounded-card`, `text-foreground`,
 * `border-border`).
 *
 * Layout: an optional icon, a title, an optional description, and an optional
 * call-to-action region — all centered and friendly.
 */

export interface EmptyStateProps
  extends Omit<HTMLAttributes<HTMLDivElement>, 'title'> {
  /** Optional decorative icon shown above the title. */
  icon?: ReactNode;
  /** Required headline describing the empty state. */
  title: ReactNode;
  /** Optional supporting copy below the title. */
  description?: ReactNode;
  /** Optional call-to-action region (e.g. a <Button />). */
  action?: ReactNode;
}

/** Joins truthy class fragments into a single className string. */
function cx(...parts: Array<string | false | null | undefined>): string {
  return parts.filter(Boolean).join(' ');
}

const base =
  'flex flex-col items-center justify-center text-center ' +
  'gap-3 px-6 py-12 rounded-card border border-dashed border-border ' +
  'bg-surface text-foreground';

export const EmptyState = forwardRef<HTMLDivElement, EmptyStateProps>(
  function EmptyState(
    { icon, title, description, action, className, ...rest },
    ref,
  ) {
    return (
      <div ref={ref} className={cx(base, className)} {...rest}>
        {icon != null && (
          <div
            className="flex h-12 w-12 items-center justify-center rounded-full bg-surface-muted text-foreground-muted text-2xl"
            aria-hidden="true"
          >
            {icon}
          </div>
        )}
        <div className="flex flex-col gap-1">
          <h3 className="font-display text-lg font-bold text-foreground">
            {title}
          </h3>
          {description != null && (
            <p className="max-w-prose text-sm text-foreground-muted">
              {description}
            </p>
          )}
        </div>
        {action != null && <div className="mt-2">{action}</div>}
      </div>
    );
  },
);
