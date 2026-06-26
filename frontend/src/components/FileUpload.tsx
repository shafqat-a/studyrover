import { forwardRef, useCallback, useId, useRef, useState } from 'react';
import type { DragEvent, KeyboardEvent, ReactNode } from 'react';

/**
 * U12 — FileUpload
 *
 * A presentational, accessible drag/drop + click file picker for sources
 * (PDF / Word / text). Phase 1 only captures the file reference and surfaces an
 * optional upload-progress affordance; ingestion happens in Phase 2.
 *
 * Props-driven only: no data fetching, no business logic. Styling uses the
 * StudyRover design tokens from `tailwind.config.ts` (e.g. `bg-surface`,
 * `rounded-card`, `border-border`, `shadow-card`, `text-foreground`).
 *
 * Behaviour:
 * - Click or keyboard (Enter/Space) on the drop zone opens the native picker.
 * - Drag-over highlights the zone; dropping accepted files emits them.
 * - The current selection is displayed with a remove control.
 * - When `accept` is provided, dropped files are filtered to allowed types;
 *   rejected drops surface an error message.
 */

export interface FileUploadProps {
  /** Visible label for the field. */
  label: string;
  /** Optional helper/description text shown under the label. */
  hint?: ReactNode;
  /**
   * Comma-separated list of accepted types, e.g.
   * `.pdf,.doc,.docx,.txt,application/pdf`. Mirrors the native `accept` attr and
   * is also used to filter dropped files.
   */
  accept?: string;
  /** Allow selecting more than one file. Defaults to false. */
  multiple?: boolean;
  /** Disables all interaction. */
  disabled?: boolean;
  /** Currently selected files (controlled). */
  files?: File[];
  /** Emitted whenever the selection changes (add or remove). */
  onFilesChange?: (files: File[]) => void;
  /** Optional 0–100 upload progress; when set, a progress bar is shown. */
  progress?: number;
  /** Externally supplied error message (e.g. from a failed upload). */
  error?: string;
  className?: string;
  /** Stable id for the input; auto-generated when omitted. */
  id?: string;
}

/** Joins truthy class fragments into a single className string. */
function cx(...parts: Array<string | false | null | undefined>): string {
  return parts.filter(Boolean).join(' ');
}

/** Parses a native `accept` string into a list of normalized tokens. */
function parseAccept(accept?: string): string[] {
  if (!accept) return [];
  return accept
    .split(',')
    .map((token) => token.trim().toLowerCase())
    .filter(Boolean);
}

/** Returns true when the file matches one of the accept tokens (or none set). */
function fileMatchesAccept(file: File, tokens: string[]): boolean {
  if (tokens.length === 0) return true;
  const name = file.name.toLowerCase();
  const type = file.type.toLowerCase();
  return tokens.some((token) => {
    if (token.startsWith('.')) return name.endsWith(token);
    if (token.endsWith('/*')) return type.startsWith(token.slice(0, -1));
    return type === token;
  });
}

/** Formats a byte count into a short human-readable string. */
function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  const units = ['KB', 'MB', 'GB'];
  let value = bytes / 1024;
  let unit = 0;
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024;
    unit += 1;
  }
  return `${value.toFixed(value >= 10 ? 0 : 1)} ${units[unit]}`;
}

function fileKey(file: File): string {
  return `${file.name}:${file.size}:${file.lastModified}`;
}

function UploadIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      width="1em"
      height="1em"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
      <path d="M17 8l-5-5-5 5" />
      <path d="M12 3v12" />
    </svg>
  );
}

function RemoveIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      width="1em"
      height="1em"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      <path d="M18 6 6 18" />
      <path d="m6 6 12 12" />
    </svg>
  );
}

export const FileUpload = forwardRef<HTMLInputElement, FileUploadProps>(
  function FileUpload(
    {
      label,
      hint,
      accept,
      multiple = false,
      disabled = false,
      files,
      onFilesChange,
      progress,
      error,
      className,
      id,
    },
    ref,
  ) {
    const generatedId = useId();
    const inputId = id ?? `fileupload-${generatedId}`;
    const hintId = `${inputId}-hint`;
    const errorId = `${inputId}-error`;

    const internalRef = useRef<HTMLInputElement | null>(null);
    const [isDragging, setIsDragging] = useState(false);
    const [rejected, setRejected] = useState(false);

    const tokens = parseAccept(accept);
    const selected = files ?? [];
    const hasSelection = selected.length > 0;
    const showProgress =
      typeof progress === 'number' && progress >= 0 && progress < 100;
    const clamped = showProgress ? Math.min(100, Math.max(0, progress)) : 0;
    const message = error ?? (rejected ? 'Unsupported file type.' : undefined);
    const describedBy =
      [hint != null ? hintId : null, message ? errorId : null]
        .filter(Boolean)
        .join(' ') || undefined;

    const setRef = useCallback(
      (node: HTMLInputElement | null) => {
        internalRef.current = node;
        if (typeof ref === 'function') ref(node);
        else if (ref) {
          (ref as React.MutableRefObject<HTMLInputElement | null>).current =
            node;
        }
      },
      [ref],
    );

    const commit = useCallback(
      (incoming: File[]) => {
        const accepted = incoming.filter((file) =>
          fileMatchesAccept(file, tokens),
        );
        setRejected(accepted.length < incoming.length);
        if (accepted.length === 0) return;

        const next = multiple ? [...selected, ...accepted] : [accepted[0]];
        // De-duplicate by identity key while preserving order.
        const seen = new Set<string>();
        const deduped = next.filter((file) => {
          const key = fileKey(file);
          if (seen.has(key)) return false;
          seen.add(key);
          return true;
        });
        onFilesChange?.(deduped);
      },
      [multiple, onFilesChange, selected, tokens],
    );

    const openPicker = useCallback(() => {
      if (disabled) return;
      internalRef.current?.click();
    }, [disabled]);

    const handleKeyDown = useCallback(
      (event: KeyboardEvent<HTMLDivElement>) => {
        if (disabled) return;
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault();
          openPicker();
        }
      },
      [disabled, openPicker],
    );

    const handleDragOver = useCallback(
      (event: DragEvent<HTMLDivElement>) => {
        if (disabled) return;
        event.preventDefault();
        setIsDragging(true);
      },
      [disabled],
    );

    const handleDragLeave = useCallback(
      (event: DragEvent<HTMLDivElement>) => {
        event.preventDefault();
        setIsDragging(false);
      },
      [],
    );

    const handleDrop = useCallback(
      (event: DragEvent<HTMLDivElement>) => {
        if (disabled) return;
        event.preventDefault();
        setIsDragging(false);
        const dropped = Array.from(event.dataTransfer.files);
        if (dropped.length > 0) commit(dropped);
      },
      [commit, disabled],
    );

    const handleInputChange = useCallback(
      (event: React.ChangeEvent<HTMLInputElement>) => {
        const picked = Array.from(event.target.files ?? []);
        if (picked.length > 0) commit(picked);
        // Reset so picking the same file again re-fires onChange.
        event.target.value = '';
      },
      [commit],
    );

    const handleRemove = useCallback(
      (file: File) => {
        const key = fileKey(file);
        onFilesChange?.(selected.filter((f) => fileKey(f) !== key));
        setRejected(false);
      },
      [onFilesChange, selected],
    );

    return (
      <div className={cx('flex flex-col gap-2', className)}>
        <label
          htmlFor={inputId}
          className="font-display font-bold text-foreground"
        >
          {label}
        </label>
        {hint != null && (
          <p id={hintId} className="text-sm text-foreground-muted">
            {hint}
          </p>
        )}

        <div
          role="button"
          tabIndex={disabled ? -1 : 0}
          aria-disabled={disabled || undefined}
          aria-describedby={describedBy}
          aria-invalid={message ? true : undefined}
          onClick={openPicker}
          onKeyDown={handleKeyDown}
          onDragOver={handleDragOver}
          onDragEnter={handleDragOver}
          onDragLeave={handleDragLeave}
          onDrop={handleDrop}
          className={cx(
            'flex flex-col items-center justify-center gap-2 rounded-card border-2 border-dashed',
            'bg-surface px-6 py-8 text-center shadow-card transition-colors duration-150',
            'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
            'focus-visible:ring-offset-2 focus-visible:ring-offset-background',
            isDragging
              ? 'border-primary bg-surface-muted'
              : 'border-border hover:bg-surface-muted',
            disabled && 'cursor-not-allowed opacity-60 hover:bg-surface',
            !disabled && 'cursor-pointer',
          )}
        >
          <UploadIcon className="h-7 w-7 text-foreground-muted" />
          <span className="text-base font-semibold text-foreground">
            Drag &amp; drop {multiple ? 'files' : 'a file'} here
          </span>
          <span className="text-sm text-foreground-muted">
            or click to browse
          </span>
          {accept != null && (
            <span className="text-xs text-foreground-muted">
              Accepted: {accept}
            </span>
          )}
          <input
            ref={setRef}
            id={inputId}
            type="file"
            className="sr-only"
            accept={accept}
            multiple={multiple}
            disabled={disabled}
            aria-describedby={describedBy}
            onChange={handleInputChange}
          />
        </div>

        {showProgress && (
          <div
            className="h-2 w-full overflow-hidden rounded-pill bg-surface-muted"
            role="progressbar"
            aria-label="Upload progress"
            aria-valuenow={clamped}
            aria-valuemin={0}
            aria-valuemax={100}
          >
            <div
              className="h-full bg-primary transition-[width] duration-200"
              style={{ width: `${clamped}%` }}
            />
          </div>
        )}

        {message && (
          <p id={errorId} className="text-sm text-danger" role="alert">
            {message}
          </p>
        )}

        {hasSelection && (
          <ul className="flex flex-col gap-2" aria-label="Selected files">
            {selected.map((file) => (
              <li
                key={fileKey(file)}
                className={cx(
                  'flex items-center justify-between gap-3 rounded-card border border-border',
                  'bg-surface px-4 py-3 text-foreground shadow-card',
                )}
              >
                <span className="flex min-w-0 flex-col">
                  <span className="truncate font-semibold">{file.name}</span>
                  <span className="text-xs text-foreground-muted">
                    {formatSize(file.size)}
                  </span>
                </span>
                <button
                  type="button"
                  disabled={disabled}
                  onClick={() => handleRemove(file)}
                  aria-label={`Remove ${file.name}`}
                  className={cx(
                    'inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-pill',
                    'text-foreground-muted transition-colors duration-150 hover:bg-surface-muted',
                    'hover:text-foreground focus-visible:outline-none focus-visible:ring-2',
                    'focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background',
                    'disabled:cursor-not-allowed disabled:opacity-60',
                  )}
                >
                  <RemoveIcon className="h-4 w-4" />
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    );
  },
);
