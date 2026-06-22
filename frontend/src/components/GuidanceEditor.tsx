import { forwardRef, useId, useState } from 'react';
import type { FormEvent, HTMLAttributes, ReactNode } from 'react';

/**
 * U09 — GuidanceEditor
 *
 * A presentational, accessible editor for parent guidance that steers the AI
 * tutor (2-C07 Guidance / 2-A12). It lets a parent compose a new guidance note,
 * choose its scope (global or a specific subject), and view + delete existing
 * notes. Props-driven only: no data fetching, no business logic — all
 * persistence happens through the `onAdd` / `onDelete` callbacks. Styling uses
 * the StudyRover design tokens from `tailwind.config.ts` (e.g. `bg-surface`,
 * `rounded-card`, `border-border`, `text-foreground`).
 *
 * Accessibility:
 * - The add form is a real `<form>`; submitting requires non-empty text (and a
 *   subject when scope is "subject").
 * - Scope is chosen with a native `<select>`; the subject select only appears
 *   for subject scope and is required there.
 * - Each existing item exposes a labelled delete `<button>`.
 */

export type GuidanceScope = 'global' | 'subject';

/** Minimal shape of a stored guidance note (mirrors contracts `Guidance`). */
export interface GuidanceItem {
  /** Server-assigned unique identifier. */
  id: string;
  /** Whether the note applies to all subjects or a single subject. */
  scope: GuidanceScope;
  /** Subject this note targets; present only when `scope` is `"subject"`. */
  subjectId?: string;
  /** The free-text guidance the tutor should follow. */
  text: string;
  /** RFC 3339 creation timestamp. */
  createdAt: string;
}

/** A selectable subject for the subject-scoped picker. */
export interface GuidanceSubjectOption {
  /** Subject identifier (matches `GuidanceItem.subjectId`). */
  id: string;
  /** Human-readable subject name. */
  name: string;
}

/** Payload emitted when the parent adds a new guidance note. */
export interface NewGuidance {
  scope: GuidanceScope;
  subjectId?: string;
  text: string;
}

export interface GuidanceEditorProps
  extends Omit<HTMLAttributes<HTMLDivElement>, 'onSubmit' | 'title'> {
  /** Existing guidance notes to list. */
  items: GuidanceItem[];
  /** Subjects available for subject-scoped guidance. */
  subjects?: GuidanceSubjectOption[];
  /** Called with the composed note when the add form is submitted. */
  onAdd: (guidance: NewGuidance) => void;
  /** Called with a note's id when its delete button is activated. */
  onDelete: (id: string) => void;
  /** When true, controls are disabled (e.g. while a mutation is in flight). */
  busy?: boolean;
  /** Optional section heading. Defaults to "Tutor guidance". */
  title?: ReactNode;
  /** Optional supporting copy shown under the heading. */
  description?: ReactNode;
}

/** Joins truthy class fragments into a single className string. */
function cx(...parts: Array<string | false | null | undefined>): string {
  return parts.filter(Boolean).join(' ');
}

function ChevronIcon() {
  return (
    <svg
      width="1em"
      height="1em"
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden="true"
      focusable="false"
      className="text-foreground-muted"
    >
      <path
        d="M6 9l6 6 6-6"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function TrashIcon() {
  return (
    <svg
      width="1em"
      height="1em"
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden="true"
      focusable="false"
    >
      <path
        d="M4 7h16M9 7V5a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2m1 0v12a1 1 0 0 1-1 1H8a1 1 0 0 1-1-1V7"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

const selectShell =
  'group relative flex items-center rounded-md border bg-surface border-border ' +
  'transition-colors duration-150 ' +
  'focus-within:ring-2 focus-within:ring-ring focus-within:ring-offset-1 ' +
  'focus-within:ring-offset-background';

const selectControl =
  'h-11 w-full appearance-none bg-transparent pl-3 pr-9 text-base text-foreground ' +
  'focus-visible:outline-none disabled:cursor-not-allowed disabled:opacity-60';

export const GuidanceEditor = forwardRef<HTMLDivElement, GuidanceEditorProps>(
  function GuidanceEditor(
    {
      items,
      subjects = [],
      onAdd,
      onDelete,
      busy = false,
      title = 'Tutor guidance',
      description,
      className,
      ...rest
    },
    ref,
  ) {
    const baseId = useId();
    const textId = `${baseId}-text`;
    const scopeId = `${baseId}-scope`;
    const subjectId = `${baseId}-subject`;
    const listLabelId = `${baseId}-list`;

    const [scope, setScope] = useState<GuidanceScope>('global');
    const [selectedSubject, setSelectedSubject] = useState<string>('');
    const [text, setText] = useState('');

    const subjectName = (id?: string): string => {
      if (id == null) return '';
      return subjects.find((s) => s.id === id)?.name ?? id;
    };

    const trimmed = text.trim();
    const needsSubject = scope === 'subject';
    const canSubmit =
      !busy && trimmed.length > 0 && (!needsSubject || selectedSubject !== '');

    const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
      event.preventDefault();
      if (!canSubmit) return;
      onAdd({
        scope,
        subjectId: needsSubject ? selectedSubject : undefined,
        text: trimmed,
      });
      setText('');
    };

    return (
      <div
        ref={ref}
        className={cx(
          'flex flex-col gap-5 rounded-card border border-border bg-surface p-5 text-foreground',
          className,
        )}
        {...rest}
      >
        <div className="flex flex-col gap-1">
          <h2 className="font-display text-lg font-bold">{title}</h2>
          {description != null && (
            <p className="text-sm text-foreground-muted">{description}</p>
          )}
        </div>

        <form className="flex flex-col gap-4" onSubmit={handleSubmit} noValidate>
          <div className="flex flex-col gap-1.5">
            <label
              htmlFor={textId}
              className="text-sm font-semibold text-foreground"
            >
              Guidance for the tutor
            </label>
            <textarea
              id={textId}
              rows={3}
              value={text}
              disabled={busy}
              onChange={(event) => setText(event.target.value)}
              placeholder='e.g. "Focus on fractions and use real-world examples."'
              className={cx(
                'block w-full resize-y rounded-card border border-border bg-surface px-3 py-2',
                'text-base leading-relaxed text-foreground placeholder:text-foreground-muted',
                'transition-colors duration-150',
                'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                'focus-visible:ring-offset-2 focus-visible:ring-offset-background',
                'disabled:cursor-not-allowed disabled:opacity-60',
              )}
            />
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="flex flex-col gap-1.5">
              <label
                htmlFor={scopeId}
                className="text-sm font-semibold text-foreground"
              >
                Scope
              </label>
              <div className={selectShell}>
                <select
                  id={scopeId}
                  value={scope}
                  disabled={busy}
                  onChange={(event) => {
                    const next = event.target.value as GuidanceScope;
                    setScope(next);
                    if (next === 'global') setSelectedSubject('');
                  }}
                  className={selectControl}
                >
                  <option value="global">All subjects</option>
                  <option value="subject">Specific subject</option>
                </select>
                <span className="pointer-events-none absolute right-3 inline-flex">
                  <ChevronIcon />
                </span>
              </div>
            </div>

            {needsSubject && (
              <div className="flex flex-col gap-1.5">
                <label
                  htmlFor={subjectId}
                  className="text-sm font-semibold text-foreground"
                >
                  Subject
                  <span className="ml-1 text-danger" aria-hidden="true">
                    *
                  </span>
                </label>
                <div className={selectShell}>
                  <select
                    id={subjectId}
                    value={selectedSubject}
                    disabled={busy || subjects.length === 0}
                    required
                    aria-required="true"
                    onChange={(event) => setSelectedSubject(event.target.value)}
                    className={selectControl}
                  >
                    <option value="" disabled hidden>
                      {subjects.length === 0
                        ? 'No subjects available'
                        : 'Choose a subject'}
                    </option>
                    {subjects.map((subject) => (
                      <option key={subject.id} value={subject.id}>
                        {subject.name}
                      </option>
                    ))}
                  </select>
                  <span className="pointer-events-none absolute right-3 inline-flex">
                    <ChevronIcon />
                  </span>
                </div>
              </div>
            )}
          </div>

          <div className="flex justify-end">
            <button
              type="submit"
              disabled={!canSubmit}
              className={cx(
                'inline-flex h-11 items-center justify-center gap-2 rounded-pill border border-transparent px-5',
                'bg-primary font-semibold text-primary-foreground shadow-card',
                'transition-colors duration-150 hover:bg-primary/90 active:bg-primary/80',
                'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                'focus-visible:ring-offset-2 focus-visible:ring-offset-background',
                'disabled:cursor-not-allowed disabled:opacity-60',
              )}
            >
              Add guidance
            </button>
          </div>
        </form>

        <div className="flex flex-col gap-2">
          <h3
            id={listLabelId}
            className="text-sm font-semibold text-foreground-muted"
          >
            Existing guidance
          </h3>

          {items.length === 0 ? (
            <p className="rounded-card border border-dashed border-border px-4 py-6 text-center text-sm text-foreground-muted">
              No guidance yet. Add a note above to steer the tutor.
            </p>
          ) : (
            <ul aria-labelledby={listLabelId} className="flex flex-col gap-2">
              {items.map((item) => {
                const scopeLabel =
                  item.scope === 'global'
                    ? 'All subjects'
                    : subjectName(item.subjectId) || 'Subject';
                return (
                  <li
                    key={item.id}
                    className="flex items-start justify-between gap-3 rounded-card border border-border bg-background px-4 py-3"
                  >
                    <div className="min-w-0 flex-1">
                      <span
                        className={cx(
                          'mb-1 inline-flex items-center rounded-pill px-2 py-0.5 text-xs font-semibold',
                          item.scope === 'global'
                            ? 'bg-secondary/15 text-secondary-foreground'
                            : 'bg-primary/15 text-primary',
                        )}
                      >
                        {scopeLabel}
                      </span>
                      <p className="whitespace-pre-wrap break-words text-sm text-foreground">
                        {item.text}
                      </p>
                    </div>
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => onDelete(item.id)}
                      aria-label={`Delete guidance: ${item.text}`}
                      className={cx(
                        'inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-md text-lg',
                        'text-foreground-muted transition-colors duration-150',
                        'hover:bg-danger/10 hover:text-danger',
                        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                        'focus-visible:ring-offset-2 focus-visible:ring-offset-background',
                        'disabled:cursor-not-allowed disabled:opacity-60',
                      )}
                    >
                      <TrashIcon />
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </div>
    );
  },
);
