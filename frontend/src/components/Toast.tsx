import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import type { ReactNode } from 'react';

/**
 * U16 — Toast / notifications
 *
 * A self-contained toast system: a context `ToastProvider` (mounted once by the
 * app shell), a fixed-position container, and a `useToast()` hook exposing
 * `toast.success/error/info`. Toasts auto-dismiss after a timeout and are
 * announced to assistive tech via `role="status"` + `aria-live="polite"`.
 *
 * Presentational only beyond the local state needed to queue toasts: no data
 * fetching, no business logic. Styling uses the StudyRover design tokens from
 * `tailwind.config.ts` (e.g. `bg-surface`, `rounded-card`, `shadow-card`,
 * `border-border`).
 */

export type ToastVariant = 'success' | 'error' | 'info';

export interface ToastOptions {
  /** Optional bold title rendered above the message. */
  title?: ReactNode;
  /** Auto-dismiss delay in ms. Defaults to 5000. Pass 0 to disable. */
  duration?: number;
}

export interface ToastItem extends ToastOptions {
  id: string;
  variant: ToastVariant;
  message: ReactNode;
}

export interface ToastApi {
  /** Show a success toast. Returns the toast id. */
  success: (message: ReactNode, options?: ToastOptions) => string;
  /** Show an error toast. Returns the toast id. */
  error: (message: ReactNode, options?: ToastOptions) => string;
  /** Show an info toast. Returns the toast id. */
  info: (message: ReactNode, options?: ToastOptions) => string;
  /** Imperatively dismiss a toast by id. */
  dismiss: (id: string) => void;
}

/** Joins truthy class fragments into a single className string. */
function cx(...parts: Array<string | false | null | undefined>): string {
  return parts.filter(Boolean).join(' ');
}

const ToastContext = createContext<ToastApi | null>(null);

const DEFAULT_DURATION = 5000;

let toastCounter = 0;
function nextId(): string {
  toastCounter += 1;
  return `toast-${toastCounter}`;
}

const variantClasses: Record<ToastVariant, string> = {
  success: 'border-l-4 border-l-success',
  error: 'border-l-4 border-l-danger',
  info: 'border-l-4 border-l-primary',
};

const iconColor: Record<ToastVariant, string> = {
  success: 'text-success',
  error: 'text-danger',
  info: 'text-primary',
};

const variantLabel: Record<ToastVariant, string> = {
  success: 'Success',
  error: 'Error',
  info: 'Information',
};

function ToastIcon({ variant }: { variant: ToastVariant }) {
  return (
    <svg
      className={cx('h-5 w-5 shrink-0', iconColor[variant])}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      {variant === 'success' && (
        <>
          <circle cx="12" cy="12" r="9" />
          <path d="m8.5 12.5 2.5 2.5 4.5-5" />
        </>
      )}
      {variant === 'error' && (
        <>
          <circle cx="12" cy="12" r="9" />
          <path d="M12 7.5v5" />
          <path d="M12 16h.01" />
        </>
      )}
      {variant === 'info' && (
        <>
          <circle cx="12" cy="12" r="9" />
          <path d="M12 11v5" />
          <path d="M12 8h.01" />
        </>
      )}
    </svg>
  );
}

function ToastCard({
  toast,
  onDismiss,
}: {
  toast: ToastItem;
  onDismiss: (id: string) => void;
}) {
  const duration = toast.duration ?? DEFAULT_DURATION;

  useEffect(() => {
    if (duration <= 0) return;
    const timer = window.setTimeout(() => onDismiss(toast.id), duration);
    return () => window.clearTimeout(timer);
  }, [toast.id, duration, onDismiss]);

  return (
    <div
      role="status"
      aria-live="polite"
      className={cx(
        'pointer-events-auto flex w-full items-start gap-3 ' +
          'bg-surface text-foreground border border-border rounded-card ' +
          'shadow-card px-4 py-3',
        variantClasses[toast.variant],
      )}
    >
      <ToastIcon variant={toast.variant} />
      <div className="min-w-0 flex-1">
        <span className="sr-only">{variantLabel[toast.variant]}: </span>
        {toast.title != null && (
          <p className="font-display font-bold text-sm leading-snug">
            {toast.title}
          </p>
        )}
        <p className="text-sm leading-snug text-foreground-muted break-words">
          {toast.message}
        </p>
      </div>
      <button
        type="button"
        onClick={() => onDismiss(toast.id)}
        aria-label="Dismiss notification"
        className={cx(
          'shrink-0 -mr-1 -mt-1 inline-flex h-7 w-7 items-center justify-center ' +
            'rounded-pill text-foreground-muted transition-colors ' +
            'hover:bg-surface-muted hover:text-foreground ' +
            'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ' +
            'focus-visible:ring-offset-2 focus-visible:ring-offset-surface',
        )}
      >
        <svg
          className="h-4 w-4"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
          focusable="false"
        >
          <path d="M6 6 18 18" />
          <path d="M18 6 6 18" />
        </svg>
      </button>
    </div>
  );
}

export interface ToastProviderProps {
  children?: ReactNode;
}

/**
 * Mounts the toast context and a fixed-position container. Should wrap the app
 * once (done by the app shell). Children can call `useToast()` to enqueue.
 */
export function ToastProvider({ children }: ToastProviderProps) {
  const [toasts, setToasts] = useState<ToastItem[]>([]);

  const dismiss = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const push = useCallback(
    (variant: ToastVariant, message: ReactNode, options?: ToastOptions) => {
      const id = nextId();
      setToasts((prev) => [...prev, { id, variant, message, ...options }]);
      return id;
    },
    [],
  );

  // Keep a stable api identity across renders.
  const pushRef = useRef(push);
  pushRef.current = push;
  const dismissRef = useRef(dismiss);
  dismissRef.current = dismiss;

  const api = useMemo<ToastApi>(
    () => ({
      success: (message, options) =>
        pushRef.current('success', message, options),
      error: (message, options) => pushRef.current('error', message, options),
      info: (message, options) => pushRef.current('info', message, options),
      dismiss: (id) => dismissRef.current(id),
    }),
    [],
  );

  return (
    <ToastContext.Provider value={api}>
      {children}
      <div
        className={cx(
          'pointer-events-none fixed inset-x-0 bottom-0 z-50 ' +
            'flex flex-col items-center gap-2 p-4 ' +
            'sm:inset-x-auto sm:right-0 sm:items-end sm:max-w-sm',
        )}
      >
        {toasts.map((toast) => (
          <ToastCard key={toast.id} toast={toast} onDismiss={dismiss} />
        ))}
      </div>
    </ToastContext.Provider>
  );
}

/**
 * Returns the toast API. Must be called within a `ToastProvider`.
 */
export function useToast(): ToastApi {
  const ctx = useContext(ToastContext);
  if (ctx == null) {
    throw new Error('useToast must be used within a <ToastProvider>');
  }
  return ctx;
}
