import { Link } from 'react-router-dom';
import type { ReactNode } from 'react';

/**
 * U20 — PageHeader / Breadcrumb
 *
 * A presentational, accessible page header. Props-driven only: no data
 * fetching, no business logic. Renders an optional breadcrumb trail (each crumb
 * with a `to` becomes a React Router `<Link>`; the last/current crumb is plain
 * text), a title with optional subtitle, and a right-aligned actions slot.
 * Layout is responsive: on small screens the actions wrap below the title; on
 * larger screens they sit on the same row, right-aligned.
 *
 * Styling uses the StudyRover design tokens from `tailwind.config.ts`
 * (e.g. `text-foreground`, `text-foreground-muted`, `border-border`).
 */

export interface Breadcrumb {
  /** Visible label for the crumb. */
  label: string;
  /** React Router target. Omit for the current (non-link) crumb. */
  to?: string;
}

export interface PageHeaderProps {
  /** The page title rendered as the primary heading. */
  title: ReactNode;
  /** Optional supporting copy rendered below the title. */
  subtitle?: ReactNode;
  /** Optional breadcrumb trail rendered above the title. */
  breadcrumbs?: Breadcrumb[];
  /** Optional right-aligned actions (e.g. buttons). */
  actions?: ReactNode;
  /** Heading level for the title. Defaults to `h1`. */
  as?: 'h1' | 'h2' | 'h3';
  /** Accessible label for the breadcrumb nav. Defaults to `Breadcrumb`. */
  breadcrumbLabel?: string;
  className?: string;
}

/** Joins truthy class fragments into a single className string. */
function cx(...parts: Array<string | false | null | undefined>): string {
  return parts.filter(Boolean).join(' ');
}

const titleClasses: Record<NonNullable<PageHeaderProps['as']>, string> = {
  h1: 'text-2xl sm:text-3xl',
  h2: 'text-xl sm:text-2xl',
  h3: 'text-lg sm:text-xl',
};

function Separator() {
  return (
    <span className="text-foreground-muted/60" aria-hidden="true">
      /
    </span>
  );
}

export function PageHeader({
  title,
  subtitle,
  breadcrumbs,
  actions,
  as = 'h1',
  breadcrumbLabel = 'Breadcrumb',
  className,
}: PageHeaderProps) {
  const Heading = as;
  const hasCrumbs = breadcrumbs != null && breadcrumbs.length > 0;

  return (
    <header className={cx('w-full', className)}>
      {hasCrumbs && (
        <nav aria-label={breadcrumbLabel} className="mb-2">
          <ol className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-foreground-muted">
            {breadcrumbs.map((crumb, index) => {
              const isLast = index === breadcrumbs.length - 1;
              return (
                <li
                  key={`${crumb.label}-${index}`}
                  className="inline-flex items-center gap-2"
                >
                  {crumb.to != null && !isLast ? (
                    <Link
                      to={crumb.to}
                      className="rounded-sm transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
                    >
                      {crumb.label}
                    </Link>
                  ) : (
                    <span
                      className={cx(isLast && 'text-foreground')}
                      aria-current={isLast ? 'page' : undefined}
                    >
                      {crumb.label}
                    </span>
                  )}
                  {!isLast && <Separator />}
                </li>
              );
            })}
          </ol>
        </nav>
      )}

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0">
          <Heading
            className={cx(
              'font-display font-bold leading-tight text-foreground',
              titleClasses[as],
            )}
          >
            {title}
          </Heading>
          {subtitle != null && (
            <p className="mt-1 text-sm text-foreground-muted sm:text-base">
              {subtitle}
            </p>
          )}
        </div>

        {actions != null && (
          <div className="flex shrink-0 flex-wrap items-center gap-2 sm:justify-end">
            {actions}
          </div>
        )}
      </div>
    </header>
  );
}
