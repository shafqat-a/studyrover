import { useId, useState } from 'react';
import type { ChangeEvent } from 'react';
import type { components } from '../api/schema';

/**
 * U07 — QuestionDraftCard
 *
 * A presentational, accessible card for reviewing a single AI-generated
 * question draft (2-C05 `QuestionDraft`). It renders the draft prompt, its
 * options (with the correct one marked), and a difficulty badge, and lets a
 * parent edit the draft inline before approving or rejecting it.
 *
 * Props-driven only: no data fetching, no business logic. The component keeps
 * the *edited* draft in local state and emits the latest edited copy through
 * `onApprove`; `onReject` emits the draft id. Styling uses the StudyRover design
 * tokens from `tailwind.config.ts` (e.g. `bg-surface`, `rounded-card`,
 * `border-border`, `shadow-card`, `ring`).
 *
 * Accessibility:
 * - The option list is a WAI-ARIA `radiogroup`; in read mode each option is a
 *   `radio` reflecting `correctOptionIndex`; in edit mode each option pairs a
 *   native radio (mark-correct) with a text field (edit label).
 * - Action buttons expose `aria-busy` while their async work runs.
 */

type Draft = components['schemas']['QuestionDraft'];
type Difficulty = components['schemas']['Difficulty'];

export interface QuestionDraftCardProps {
  /** The draft to display and edit. Treated as the initial value. */
  draft: Draft;
  /**
   * Called when the parent approves the draft. Receives the latest edited copy
   * (text/options/correctOptionIndex/difficulty applied over the original).
   */
  onApprove?: (draft: Draft) => void;
  /** Called when the parent rejects the draft. Receives the draft id. */
  onReject?: (id: string) => void;
  /** When true, the approve action shows a busy state and is blocked. */
  approving?: boolean;
  /** When true, the reject action shows a busy state and is blocked. */
  rejecting?: boolean;
  /**
   * When true, all controls are disabled (e.g. the draft is no longer
   * `pending`). Defaults to deriving from `draft.status`.
   */
  disabled?: boolean;
  className?: string;
}

/** Joins truthy class fragments into a single className string. */
function cx(...parts: Array<string | false | null | undefined>): string {
  return parts.filter(Boolean).join(' ');
}

const difficulties: Difficulty[] = ['easy', 'medium', 'hard'];

const difficultyTone: Record<Difficulty, string> = {
  easy: 'bg-success-soft text-success border-success/40',
  medium: 'bg-primary-soft text-primary border-primary/40',
  hard: 'bg-danger-soft text-danger border-danger/40',
};

const statusTone: Record<Draft['status'], string> = {
  pending: 'bg-surface-muted text-foreground-muted border-border',
  approved: 'bg-success-soft text-success border-success/40',
  rejected: 'bg-danger-soft text-danger border-danger/40',
};

export function QuestionDraftCard({
  draft,
  onApprove,
  onReject,
  approving = false,
  rejecting = false,
  disabled,
  className,
}: QuestionDraftCardProps) {
  const baseId = useId();
  const [editing, setEditing] = useState(false);
  const [text, setText] = useState(draft.text);
  const [options, setOptions] = useState(() =>
    draft.options.map((o) => o.text),
  );
  const [correctOptionIndex, setCorrectOptionIndex] = useState(
    draft.correctOptionIndex,
  );
  const [difficulty, setDifficulty] = useState<Difficulty>(draft.difficulty);

  const isLocked =
    (disabled ?? draft.status !== 'pending') || approving || rejecting;
  const busy = approving || rejecting;

  const reset = () => {
    setText(draft.text);
    setOptions(draft.options.map((o) => o.text));
    setCorrectOptionIndex(draft.correctOptionIndex);
    setDifficulty(draft.difficulty);
  };

  const handleStartEdit = () => {
    reset();
    setEditing(true);
  };

  const handleCancel = () => {
    reset();
    setEditing(false);
  };

  const handleOptionText = (index: number) => (e: ChangeEvent<HTMLInputElement>) => {
    const next = e.target.value;
    setOptions((prev) => prev.map((o, i) => (i === index ? next : o)));
  };

  const buildEdited = (): Draft => ({
    ...draft,
    text: text.trim(),
    options: options.map((t) => ({ text: t.trim() })),
    correctOptionIndex,
    difficulty,
  });

  const handleApprove = () => {
    if (isLocked) return;
    onApprove?.(buildEdited());
    setEditing(false);
  };

  const handleReject = () => {
    if (isLocked) return;
    onReject?.(draft.id);
  };

  const promptId = `${baseId}-prompt`;
  const optionsLabelId = `${baseId}-options-label`;

  return (
    <div
      className={cx(
        'flex flex-col gap-4 bg-surface border border-border rounded-card',
        'shadow-card p-5 text-foreground',
        className,
      )}
    >
      {/* Header: difficulty + status */}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <span className="text-xs font-medium uppercase tracking-wide text-foreground-muted">
            Question draft
          </span>
          <span
            className={cx(
              'inline-flex items-center rounded-pill border px-2.5 py-0.5',
              'text-xs font-semibold capitalize',
              statusTone[draft.status],
            )}
          >
            {draft.status}
          </span>
        </div>

        {editing ? (
          <label className="flex items-center gap-2 text-sm">
            <span className="text-foreground-muted">Difficulty</span>
            <select
              value={difficulty}
              disabled={isLocked}
              onChange={(e) => setDifficulty(e.target.value as Difficulty)}
              className={cx(
                'h-9 rounded-card border border-border bg-surface px-2',
                'text-sm capitalize text-foreground',
                'focus-visible:outline-none focus-visible:ring-2',
                'focus-visible:ring-ring focus-visible:ring-offset-2',
                'focus-visible:ring-offset-background',
                'disabled:cursor-not-allowed disabled:opacity-60',
              )}
              aria-label="Difficulty"
            >
              {difficulties.map((d) => (
                <option key={d} value={d}>
                  {d}
                </option>
              ))}
            </select>
          </label>
        ) : (
          <span
            className={cx(
              'inline-flex items-center rounded-pill border px-2.5 py-0.5',
              'text-xs font-semibold capitalize',
              difficultyTone[difficulty],
            )}
          >
            {difficulty}
          </span>
        )}
      </div>

      {/* Prompt */}
      {editing ? (
        <div className="flex flex-col gap-1">
          <label
            htmlFor={promptId}
            className="text-sm font-medium text-foreground-muted"
          >
            Question
          </label>
          <textarea
            id={promptId}
            value={text}
            disabled={isLocked}
            onChange={(e) => setText(e.target.value)}
            rows={2}
            className={cx(
              'w-full resize-y rounded-card border border-border bg-surface',
              'px-3 py-2 text-base text-foreground',
              'focus-visible:outline-none focus-visible:ring-2',
              'focus-visible:ring-ring focus-visible:ring-offset-2',
              'focus-visible:ring-offset-background',
              'disabled:cursor-not-allowed disabled:opacity-60',
            )}
          />
        </div>
      ) : (
        <p id={promptId} className="text-base font-medium text-foreground">
          {draft.text}
        </p>
      )}

      {/* Options */}
      <div
        role="radiogroup"
        aria-labelledby={optionsLabelId}
        className="flex flex-col gap-2"
      >
        <span
          id={optionsLabelId}
          className="text-sm font-medium text-foreground-muted"
        >
          {editing ? 'Options (select the correct answer)' : 'Options'}
        </span>

        {(editing ? options : draft.options.map((o) => o.text)).map(
          (optText, index) => {
            const isCorrect = correctOptionIndex === index;
            const optId = `${baseId}-opt-${index}`;

            if (editing) {
              return (
                <div
                  key={index}
                  className={cx(
                    'flex items-center gap-3 rounded-card border-2 px-3 py-2',
                    'transition-colors duration-150',
                    isCorrect
                      ? 'border-success bg-success-soft'
                      : 'border-border bg-surface',
                  )}
                >
                  <input
                    type="radio"
                    name={`${baseId}-correct`}
                    id={optId}
                    checked={isCorrect}
                    disabled={isLocked}
                    onChange={() => setCorrectOptionIndex(index)}
                    className="h-5 w-5 shrink-0 accent-success focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    aria-label={`Mark option ${index + 1} as correct`}
                  />
                  <input
                    type="text"
                    value={optText}
                    disabled={isLocked}
                    onChange={handleOptionText(index)}
                    className={cx(
                      'min-w-0 flex-1 rounded-card border border-border bg-surface',
                      'px-3 py-1.5 text-base text-foreground',
                      'focus-visible:outline-none focus-visible:ring-2',
                      'focus-visible:ring-ring focus-visible:ring-offset-2',
                      'focus-visible:ring-offset-background',
                      'disabled:cursor-not-allowed disabled:opacity-60',
                    )}
                    aria-label={`Option ${index + 1} text`}
                  />
                </div>
              );
            }

            return (
              <div
                key={index}
                role="radio"
                aria-checked={isCorrect}
                aria-label={
                  isCorrect ? `${optText} (correct answer)` : optText
                }
                className={cx(
                  'flex items-center gap-3 rounded-card border-2 px-3 py-2',
                  'text-base',
                  isCorrect
                    ? 'border-success bg-success-soft text-foreground'
                    : 'border-border bg-surface text-foreground',
                )}
              >
                <span
                  aria-hidden="true"
                  className={cx(
                    'flex h-5 w-5 shrink-0 items-center justify-center',
                    'rounded-full border-2',
                    isCorrect ? 'border-success' : 'border-foreground-muted',
                  )}
                >
                  <span
                    className={cx(
                      'h-2.5 w-2.5 rounded-full',
                      isCorrect ? 'bg-success' : 'bg-transparent',
                    )}
                  />
                </span>
                <span className="flex-1">{optText}</span>
                {isCorrect && (
                  <span className="text-xs font-semibold uppercase tracking-wide text-success">
                    Correct
                  </span>
                )}
              </div>
            );
          },
        )}
      </div>

      {/* Actions */}
      <div className="flex flex-wrap items-center justify-end gap-2 border-t border-border pt-4">
        {editing ? (
          <button
            type="button"
            onClick={handleCancel}
            disabled={busy}
            className={cx(
              'inline-flex h-10 items-center justify-center rounded-pill px-4',
              'text-sm font-semibold text-foreground',
              'border border-border bg-transparent transition-colors duration-150',
              'hover:bg-surface-muted',
              'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
              'focus-visible:ring-offset-2 focus-visible:ring-offset-background',
              'disabled:cursor-not-allowed disabled:opacity-60',
            )}
          >
            Cancel
          </button>
        ) : (
          <button
            type="button"
            onClick={handleStartEdit}
            disabled={isLocked}
            className={cx(
              'inline-flex h-10 items-center justify-center rounded-pill px-4',
              'text-sm font-semibold text-foreground',
              'border border-border bg-transparent transition-colors duration-150',
              'hover:bg-surface-muted',
              'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
              'focus-visible:ring-offset-2 focus-visible:ring-offset-background',
              'disabled:cursor-not-allowed disabled:opacity-60',
            )}
          >
            Edit
          </button>
        )}

        <button
          type="button"
          onClick={handleReject}
          disabled={isLocked}
          aria-busy={rejecting || undefined}
          className={cx(
            'inline-flex h-10 items-center justify-center rounded-pill px-4',
            'text-sm font-semibold text-danger',
            'border border-danger/40 bg-transparent transition-colors duration-150',
            'hover:bg-danger-soft',
            'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
            'focus-visible:ring-offset-2 focus-visible:ring-offset-background',
            'disabled:cursor-not-allowed disabled:opacity-60',
          )}
        >
          {rejecting ? 'Rejecting…' : 'Reject'}
        </button>

        <button
          type="button"
          onClick={handleApprove}
          disabled={isLocked}
          aria-busy={approving || undefined}
          className={cx(
            'inline-flex h-10 items-center justify-center rounded-pill px-5',
            'text-sm font-semibold text-primary-foreground',
            'border border-transparent bg-primary shadow-card transition-colors duration-150',
            'hover:bg-primary/90 active:bg-primary/80',
            'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
            'focus-visible:ring-offset-2 focus-visible:ring-offset-background',
            'disabled:cursor-not-allowed disabled:opacity-60',
          )}
        >
          {approving ? 'Approving…' : editing ? 'Save & approve' : 'Approve'}
        </button>
      </div>
    </div>
  );
}
