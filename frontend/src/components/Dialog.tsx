import { useCallback, useEffect, useId, useRef } from 'react';
import type { HTMLAttributes, ReactNode } from 'react';

/**
 * U07 — Modal / Dialog
 *
 * A presentational, accessible modal dialog. Controlled via `open`/`onClose`.
 * Props-driven only: no data fetching, no business logic. Styling uses the
 * StudyRover design tokens from `tailwind.config.ts` (e.g. `bg-surface`,
 * `rounded-card`, `shadow-card`, `border-border`).
 *
 * Accessibility:
 * - `role="dialog"` + `aria-modal="true"`.
 * - `aria-labelledby` wired to the title and `aria-describedby` to the
 *   description (when provided).
 * - Focus is trapped inside the dialog while open (Tab / Shift+Tab cycle).
 * - Initial focus moves into the dialog when opened; the previously focused
 *   element is restored on close.
 * - ESC closes; clicking the backdrop closes (unless suppressed).
 */

export type DialogSize = 'sm' | 'md' | 'lg';

export interface DialogProps
  extends Omit<HTMLAttributes<HTMLDivElement>, 'className' | 'title'> {
  /** Whether the dialog is visible. Controlled. */
  open: boolean;
  /** Called when the user requests to close (ESC, backdrop, or close button). */
  onClose: () => void;
  /** Title rendered in the header and used as the accessible name. */
  title: ReactNode;
  /** Optional description rendered below the title; wired to aria-describedby. */
  description?: ReactNode;
  /** Optional footer region (e.g. action buttons). */
  footer?: ReactNode;
  /** Width of the dialog panel. Defaults to `md`. */
  size?: DialogSize;
  /** When true, clicking the backdrop does not close. Defaults to false. */
  disableBackdropClose?: boolean;
  /** When true, pressing ESC does not close. Defaults to false. */
  disableEscapeClose?: boolean;
  /** Hide the built-in close (×) button. Defaults to false. */
  hideCloseButton?: boolean;
  /** Accessible label for the close button. Defaults to `Close`. */
  closeLabel?: string;
  /** Extra classes applied to the panel. */
  className?: string;
  children?: ReactNode;
}

/** Joins truthy class fragments into a single className string. */
function cx(...parts: Array<string | false | null | undefined>): string {
  return parts.filter(Boolean).join(' ');
}

const sizeClasses: Record<DialogSize, string> = {
  sm: 'max-w-sm',
  md: 'max-w-lg',
  lg: 'max-w-2xl',
};

const FOCUSABLE_SELECTOR = [
  'a[href]',
  'area[href]',
  'button:not([disabled])',
  'input:not([disabled])',
  'select:not([disabled])',
  'textarea:not([disabled])',
  'iframe',
  'object',
  'embed',
  '[contenteditable]',
  '[tabindex]:not([tabindex="-1"])',
].join(',');

function getFocusable(container: HTMLElement): HTMLElement[] {
  const nodes = Array.from(
    container.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR),
  );
  return nodes.filter(
    (el) =>
      el.offsetWidth > 0 ||
      el.offsetHeight > 0 ||
      el === document.activeElement,
  );
}

export function Dialog({
  open,
  onClose,
  title,
  description,
  footer,
  size = 'md',
  disableBackdropClose = false,
  disableEscapeClose = false,
  hideCloseButton = false,
  closeLabel = 'Close',
  className,
  children,
  ...rest
}: DialogProps) {
  const panelRef = useRef<HTMLDivElement>(null);
  const previouslyFocused = useRef<HTMLElement | null>(null);
  const reactId = useId();
  const titleId = `${reactId}-title`;
  const descId = `${reactId}-desc`;

  // Capture the trigger element and move focus into the dialog on open;
  // restore focus to the trigger on close/unmount.
  useEffect(() => {
    if (!open) return;

    previouslyFocused.current =
      document.activeElement instanceof HTMLElement
        ? document.activeElement
        : null;

    const panel = panelRef.current;
    if (panel) {
      const focusables = getFocusable(panel);
      const target = focusables[0] ?? panel;
      // Defer to ensure the node is mounted and laid out.
      window.requestAnimationFrame(() => target.focus());
    }

    return () => {
      const toRestore = previouslyFocused.current;
      if (toRestore && typeof toRestore.focus === 'function') {
        toRestore.focus();
      }
    };
  }, [open]);

  const handleKeyDown = useCallback(
    (event: React.KeyboardEvent<HTMLDivElement>) => {
      if (event.key === 'Escape') {
        if (!disableEscapeClose) {
          event.stopPropagation();
          onClose();
        }
        return;
      }

      if (event.key !== 'Tab') return;

      const panel = panelRef.current;
      if (!panel) return;

      const focusables = getFocusable(panel);
      if (focusables.length === 0) {
        // Keep focus on the panel itself.
        event.preventDefault();
        panel.focus();
        return;
      }

      const first = focusables[0];
      const last = focusables[focusables.length - 1];
      const active = document.activeElement;

      if (event.shiftKey) {
        if (active === first || !panel.contains(active)) {
          event.preventDefault();
          last.focus();
        }
      } else if (active === last || !panel.contains(active)) {
        event.preventDefault();
        first.focus();
      }
    },
    [disableEscapeClose, onClose],
  );

  const handleBackdropMouseDown = useCallback(
    (event: React.MouseEvent<HTMLDivElement>) => {
      if (disableBackdropClose) return;
      // Only close when the mousedown originated on the backdrop itself.
      if (event.target === event.currentTarget) {
        onClose();
      }
    },
    [disableBackdropClose, onClose],
  );

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto bg-foreground/40 p-4 backdrop-blur-sm"
      onMouseDown={handleBackdropMouseDown}
    >
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={description != null ? descId : undefined}
        tabIndex={-1}
        onKeyDown={handleKeyDown}
        className={cx(
          'relative w-full bg-surface text-foreground border border-border ' +
            'rounded-card shadow-card outline-none flex max-h-full flex-col',
          sizeClasses[size],
          className,
        )}
        {...rest}
      >
        <div className="flex items-start justify-between gap-4 border-b border-border px-5 py-4">
          <div className="min-w-0">
            <h2 id={titleId} className="font-display text-lg font-bold">
              {title}
            </h2>
            {description != null && (
              <p id={descId} className="mt-1 text-sm text-foreground-muted">
                {description}
              </p>
            )}
          </div>
          {!hideCloseButton && (
            <button
              type="button"
              onClick={onClose}
              aria-label={closeLabel}
              className={cx(
                'inline-flex h-8 w-8 shrink-0 items-center justify-center ' +
                  'rounded-pill text-foreground-muted transition-colors ' +
                  'hover:bg-surface-muted hover:text-foreground ' +
                  'focus-visible:outline-none focus-visible:ring-2 ' +
                  'focus-visible:ring-ring focus-visible:ring-offset-2 ' +
                  'focus-visible:ring-offset-surface',
              )}
            >
              <svg
                width="1em"
                height="1em"
                viewBox="0 0 24 24"
                fill="none"
                aria-hidden="true"
                focusable="false"
                className="h-5 w-5"
              >
                <path
                  d="M6 6l12 12M18 6L6 18"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                />
              </svg>
            </button>
          )}
        </div>

        <div className="overflow-y-auto px-5 py-4">{children}</div>

        {footer != null && (
          <div className="flex items-center justify-end gap-3 border-t border-border px-5 py-4">
            {footer}
          </div>
        )}
      </div>
    </div>
  );
}
