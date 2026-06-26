import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

/**
 * Global app providers (F11).
 *
 * Wraps the app in a single TanStack Query client and a lightweight toast
 * provider so every routed page has data fetching + transient notifications
 * available without re-wiring. A richer Toast UI component is owned by U16;
 * this provider exposes the imperative API and a default viewport that U16 /
 * W03 may later replace.
 */

// ---------------------------------------------------------------------------
// React Query
// ---------------------------------------------------------------------------

/** Create a QueryClient with sensible app-wide defaults. */
export function createQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: {
      queries: {
        // Avoid hammering the API on window focus during exam flows.
        refetchOnWindowFocus: false,
        retry: 1,
        staleTime: 30_000,
      },
      mutations: {
        retry: 0,
      },
    },
  });
}

// ---------------------------------------------------------------------------
// Toast
// ---------------------------------------------------------------------------

export type ToastVariant = 'info' | 'success' | 'warning' | 'danger';

export interface Toast {
  id: string;
  title: string;
  description?: string;
  variant: ToastVariant;
}

export interface ToastOptions {
  description?: string;
  variant?: ToastVariant;
  /** Auto-dismiss after this many ms. Use 0 to keep until dismissed. */
  durationMs?: number;
}

export interface ToastApi {
  toasts: Toast[];
  toast: (title: string, options?: ToastOptions) => string;
  dismiss: (id: string) => void;
}

const ToastContext = createContext<ToastApi | null>(null);

/** Access the app-wide toast API. Throws if used outside <AppProviders>. */
export function useToast(): ToastApi {
  const ctx = useContext(ToastContext);
  if (!ctx) {
    throw new Error('useToast must be used within <AppProviders>');
  }
  return ctx;
}

let toastSeq = 0;
function nextToastId(): string {
  toastSeq += 1;
  return `t${toastSeq}_${Date.now()}`;
}

const VARIANT_CLASSES: Record<ToastVariant, string> = {
  info: 'bg-surface text-foreground border-border',
  success: 'bg-success-soft text-success-foreground border-success/40',
  warning: 'bg-warning-soft text-warning-foreground border-warning/40',
  danger: 'bg-danger-soft text-danger-foreground border-danger/40',
};

function ToastViewport({ toasts, dismiss }: Pick<ToastApi, 'toasts' | 'dismiss'>) {
  if (toasts.length === 0) {
    return null;
  }
  return (
    <div
      className="pointer-events-none fixed inset-x-0 bottom-0 z-50 flex flex-col items-center gap-2 p-4 sm:items-end"
      role="region"
      aria-label="Notifications"
      aria-live="polite"
    >
      {toasts.map((t) => (
        <div
          key={t.id}
          role="status"
          className={`pointer-events-auto flex w-full max-w-sm items-start gap-3 rounded-card border px-4 py-3 shadow-pop animate-pop-in ${
            VARIANT_CLASSES[t.variant]
          }`}
        >
          <div className="min-w-0 flex-1">
            <p className="font-display text-sm font-bold">{t.title}</p>
            {t.description ? (
              <p className="mt-0.5 text-sm text-foreground-muted">{t.description}</p>
            ) : null}
          </div>
          <button
            type="button"
            onClick={() => dismiss(t.id)}
            className="shrink-0 rounded-pill px-2 text-sm text-foreground-muted hover:text-foreground"
            aria-label="Dismiss notification"
          >
            ✕
          </button>
        </div>
      ))}
    </div>
  );
}

interface ToastProviderProps {
  children: ReactNode;
  defaultDurationMs?: number;
}

/** Provides the toast API + renders the default toast viewport. */
export function ToastProvider({
  children,
  defaultDurationMs = 4000,
}: ToastProviderProps) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const timers = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());

  const dismiss = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
    const timer = timers.current.get(id);
    if (timer) {
      clearTimeout(timer);
      timers.current.delete(id);
    }
  }, []);

  const toast = useCallback(
    (title: string, options?: ToastOptions): string => {
      const id = nextToastId();
      const entry: Toast = {
        id,
        title,
        description: options?.description,
        variant: options?.variant ?? 'info',
      };
      setToasts((prev) => [...prev, entry]);

      const duration = options?.durationMs ?? defaultDurationMs;
      if (duration > 0) {
        const timer = setTimeout(() => dismiss(id), duration);
        timers.current.set(id, timer);
      }
      return id;
    },
    [defaultDurationMs, dismiss],
  );

  const api = useMemo<ToastApi>(
    () => ({ toasts, toast, dismiss }),
    [toasts, toast, dismiss],
  );

  return (
    <ToastContext.Provider value={api}>
      {children}
      <ToastViewport toasts={toasts} dismiss={dismiss} />
    </ToastContext.Provider>
  );
}

// ---------------------------------------------------------------------------
// Combined providers
// ---------------------------------------------------------------------------

interface AppProvidersProps {
  children: ReactNode;
  /** Optional injected client (tests / Storybook). Defaults to a new one. */
  queryClient?: QueryClient;
}

/** Mounts QueryClientProvider + ToastProvider app-wide. */
export function AppProviders({ children, queryClient }: AppProvidersProps) {
  const clientRef = useRef<QueryClient>();
  if (!clientRef.current) {
    clientRef.current = queryClient ?? createQueryClient();
  }

  return (
    <QueryClientProvider client={clientRef.current}>
      <ToastProvider>{children}</ToastProvider>
    </QueryClientProvider>
  );
}
