import { forwardRef } from 'react';
import type { ReactNode } from 'react';
import { EmptyState } from './EmptyState';

/**
 * U08 — Table / DataList
 *
 * A presentational, accessible, generic data table. Props-driven only: no data
 * fetching, no hooks, no business logic. Styling uses the StudyRover design
 * tokens from `tailwind.config.ts` (e.g. `bg-surface`, `rounded-card`,
 * `border-border`, `shadow-card`, `text-foreground`).
 *
 * Generic over the row type `T`. Columns describe how to render each cell and
 * carry alignment + width hints. An optional `rowActions` slot renders a
 * trailing actions cell per row. When `rows` is empty, the `EmptyState`
 * fallback is shown instead of an empty grid.
 *
 * Responsiveness: on small screens each row collapses into a stacked card where
 * every cell is labelled by its column header (via a `data-label` pseudo
 * element), so the data stays legible without horizontal scrolling. From the
 * `md` breakpoint up it renders as a conventional table.
 */

export type TableAlign = 'left' | 'center' | 'right';

export interface TableColumn<T> {
  /** Stable identifier for the column; used as React key. */
  key: string;
  /** Header label. Also used as the per-cell label when stacked on mobile. */
  header: ReactNode;
  /** Renders the cell content for a given row. */
  cell: (row: T, rowIndex: number) => ReactNode;
  /** Horizontal alignment for header + cells. Defaults to `left`. */
  align?: TableAlign;
  /** Optional fixed/min width applied to the column (e.g. `'8rem'`). */
  width?: string;
  /** Plain-text label used for the mobile stacked view (falls back to nothing). */
  label?: string;
}

export interface TableProps<T> {
  /** Column definitions describing how each cell renders. */
  columns: Array<TableColumn<T>>;
  /** The row data. */
  rows: T[];
  /** Stable key extractor for each row. */
  rowKey: (row: T, rowIndex: number) => string;
  /** Optional per-row actions slot rendered in a trailing cell. */
  rowActions?: (row: T, rowIndex: number) => ReactNode;
  /** Accessible label for the actions column header. Defaults to `Actions`. */
  actionsLabel?: string;
  /** Accessible caption describing the table for assistive tech. */
  caption?: ReactNode;
  /** Content shown when there are no rows. Overrides default EmptyState text. */
  emptyState?: ReactNode;
  /** Title for the default EmptyState (when `emptyState` is not provided). */
  emptyTitle?: string;
  /** Description for the default EmptyState. */
  emptyDescription?: string;
  className?: string;
}

/** Joins truthy class fragments into a single className string. */
function cx(...parts: Array<string | false | null | undefined>): string {
  return parts.filter(Boolean).join(' ');
}

const alignClasses: Record<TableAlign, string> = {
  left: 'text-left',
  center: 'text-center',
  right: 'text-right',
};

function TableInner<T>(
  {
    columns,
    rows,
    rowKey,
    rowActions,
    actionsLabel = 'Actions',
    caption,
    emptyState,
    emptyTitle = 'Nothing here yet',
    emptyDescription,
    className,
  }: TableProps<T>,
  ref: React.Ref<HTMLDivElement>,
) {
  const hasActions = typeof rowActions === 'function';

  if (rows.length === 0) {
    return (
      <div
        ref={ref}
        className={cx(
          'bg-surface border border-border rounded-card shadow-card p-6',
          className,
        )}
      >
        {emptyState ?? (
          <EmptyState title={emptyTitle} description={emptyDescription} />
        )}
      </div>
    );
  }

  return (
    <div
      ref={ref}
      className={cx(
        'bg-surface border border-border rounded-card shadow-card ' +
          'overflow-hidden md:overflow-x-auto',
        className,
      )}
    >
      <table className="w-full border-collapse text-sm text-foreground">
        {caption != null && (
          <caption className="sr-only">{caption}</caption>
        )}

        {/* Header is visually hidden on mobile (stacked layout) and shown from md up. */}
        <thead className="hidden md:table-header-group">
          <tr className="border-b border-border bg-surface-muted">
            {columns.map((col) => (
              <th
                key={col.key}
                scope="col"
                style={col.width ? { width: col.width } : undefined}
                className={cx(
                  'px-4 py-3 font-semibold text-foreground-muted',
                  alignClasses[col.align ?? 'left'],
                )}
              >
                {col.header}
              </th>
            ))}
            {hasActions && (
              <th
                scope="col"
                className="px-4 py-3 text-right font-semibold text-foreground-muted"
              >
                {actionsLabel}
              </th>
            )}
          </tr>
        </thead>

        <tbody className="block md:table-row-group">
          {rows.map((row, rowIndex) => (
            <tr
              key={rowKey(row, rowIndex)}
              className={cx(
                // Stacked card on mobile…
                'block border-b border-border last:border-b-0 ' +
                  'mb-3 rounded-card border md:mb-0 md:rounded-none ' +
                  // …conventional row from md up.
                  'md:table-row md:border-x-0 md:border-t-0 ' +
                  'md:transition-colors md:hover:bg-surface-muted',
              )}
            >
              {columns.map((col) => {
                const mobileLabel = col.label ?? undefined;
                return (
                  <td
                    key={col.key}
                    data-label={mobileLabel}
                    className={cx(
                      // Mobile: label/value pair per cell.
                      'flex items-center justify-between gap-4 px-4 py-2 ' +
                        'border-b border-border last:border-b-0 ' +
                        'before:font-semibold before:text-foreground-muted ' +
                        "before:content-[attr(data-label)] " +
                        // Desktop: normal cell.
                        'md:table-cell md:border-b-0 md:py-3 ' +
                        'md:before:content-none',
                      alignClasses[col.align ?? 'left'],
                    )}
                  >
                    <span className="md:contents">{col.cell(row, rowIndex)}</span>
                  </td>
                );
              })}
              {hasActions && (
                <td
                  data-label={actionsLabel}
                  className={cx(
                    'flex items-center justify-between gap-4 px-4 py-2 ' +
                      'before:font-semibold before:text-foreground-muted ' +
                      "before:content-[attr(data-label)] " +
                      'md:table-cell md:py-3 md:text-right ' +
                      'md:before:content-none',
                  )}
                >
                  <span className="inline-flex items-center justify-end gap-2">
                    {rowActions!(row, rowIndex)}
                  </span>
                </td>
              )}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/**
 * `forwardRef` does not preserve generics, so we re-assert the call signature
 * to keep `<Table<MyRow> … />` fully typed at call sites.
 */
export const Table = forwardRef(TableInner) as <T>(
  props: TableProps<T> & { ref?: React.Ref<HTMLDivElement> },
) => ReturnType<typeof TableInner>;
