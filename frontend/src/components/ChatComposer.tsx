import { forwardRef, useRef, useState } from 'react';
import type { KeyboardEvent } from 'react';

/**
 * U02 — ChatComposer
 *
 * Presentational composer for the AI tutor chat. Props-driven only: no data
 * fetching, no hooks beyond local UI state, no business logic. Styling uses the
 * StudyRover design tokens from `tailwind.config.ts` (e.g. `bg-surface`,
 * `rounded-card`, `shadow-focus`, `bg-primary`).
 *
 * Behaviour:
 * - A multi-line text input plus a send button.
 * - Quick-action buttons ("Explain this", "Give an example", "I'm ready for a
 *   quiz") that submit canned prompts in one tap.
 * - Enter sends the message; Shift+Enter inserts a newline.
 * - Everything is disabled while `streaming` (the tutor is responding) or
 *   `disabled` is true.
 *
 * The component is uncontrolled by default (it owns its draft text) but supports
 * controlled usage via `value` + `onChange`.
 */

export interface ChatQuickAction {
  /** Stable identifier for the action. */
  id: string;
  /** Visible button label. */
  label: string;
  /** The prompt text submitted when the action is pressed. */
  prompt: string;
}

export interface ChatComposerProps {
  /** Called with the trimmed message text when the user sends. */
  onSubmit: (text: string) => void;
  /**
   * True while the tutor is streaming a response. Disables all controls and
   * sets `aria-busy` on the form.
   */
  streaming?: boolean;
  /** Disable the composer regardless of streaming state. */
  disabled?: boolean;
  /** Placeholder shown in the empty input. */
  placeholder?: string;
  /** Accessible label for the text input. Defaults to "Message the tutor". */
  inputLabel?: string;
  /** Controlled value of the input. Provide together with `onChange`. */
  value?: string;
  /** Change handler for controlled usage. */
  onChange?: (value: string) => void;
  /**
   * Quick-action buttons. Defaults to the three standard tutor prompts. Pass
   * an empty array to hide them.
   */
  quickActions?: ChatQuickAction[];
  className?: string;
}

/** Joins truthy class fragments into a single className string. */
function cx(...parts: Array<string | false | null | undefined>): string {
  return parts.filter(Boolean).join(' ');
}

export const DEFAULT_QUICK_ACTIONS: ChatQuickAction[] = [
  { id: 'explain', label: 'Explain this', prompt: 'Explain this.' },
  { id: 'example', label: 'Give an example', prompt: 'Give an example.' },
  {
    id: 'quiz',
    label: "I'm ready for a quiz",
    prompt: "I'm ready for a quiz.",
  },
];

function SendIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      width="1em"
      height="1em"
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden="true"
      focusable="false"
    >
      <path
        d="M3.4 20.4 21 12 3.4 3.6 3 10l12 2-12 2 .4 6.4Z"
        fill="currentColor"
      />
    </svg>
  );
}

const quickActionClasses =
  'inline-flex items-center rounded-pill border border-border bg-surface ' +
  'px-3 py-1.5 text-sm font-medium text-foreground transition-colors ' +
  'duration-150 hover:bg-surface-muted active:bg-surface-muted ' +
  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ' +
  'focus-visible:ring-offset-2 focus-visible:ring-offset-background ' +
  'disabled:cursor-not-allowed disabled:opacity-60';

const sendButtonClasses =
  'inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-pill ' +
  'bg-primary text-primary-foreground text-xl shadow-card transition-colors ' +
  'duration-150 hover:bg-primary/90 active:bg-primary/80 ' +
  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ' +
  'focus-visible:ring-offset-2 focus-visible:ring-offset-background ' +
  'disabled:cursor-not-allowed disabled:opacity-60';

export const ChatComposer = forwardRef<HTMLTextAreaElement, ChatComposerProps>(
  function ChatComposer(
    {
      onSubmit,
      streaming = false,
      disabled = false,
      placeholder = 'Ask your tutor anything…',
      inputLabel = 'Message the tutor',
      value,
      onChange,
      quickActions = DEFAULT_QUICK_ACTIONS,
      className,
    },
    ref,
  ) {
    const isControlled = value !== undefined;
    const [internalValue, setInternalValue] = useState('');
    const text = isControlled ? value : internalValue;

    const fallbackRef = useRef<HTMLTextAreaElement | null>(null);
    const setTextareaRef = (node: HTMLTextAreaElement | null) => {
      fallbackRef.current = node;
      if (typeof ref === 'function') ref(node);
      else if (ref) ref.current = node;
    };

    const isDisabled = disabled || streaming;

    function setText(next: string) {
      if (!isControlled) setInternalValue(next);
      onChange?.(next);
    }

    function send(raw: string) {
      if (isDisabled) return;
      const trimmed = raw.trim();
      if (trimmed === '') return;
      onSubmit(trimmed);
      setText('');
    }

    function handleFormSubmit(event: React.FormEvent<HTMLFormElement>) {
      event.preventDefault();
      send(text);
    }

    function handleKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
      if (event.key === 'Enter' && !event.shiftKey) {
        event.preventDefault();
        send(text);
      }
    }

    function handleQuickAction(action: ChatQuickAction) {
      send(action.prompt);
    }

    const canSend = !isDisabled && text.trim() !== '';

    return (
      <form
        className={cx(
          'flex flex-col gap-2 rounded-card border border-border bg-surface p-3 shadow-card',
          className,
        )}
        onSubmit={handleFormSubmit}
        aria-busy={streaming || undefined}
      >
        {quickActions.length > 0 && (
          <div
            className="flex flex-wrap gap-2"
            role="group"
            aria-label="Quick actions"
          >
            {quickActions.map((action) => (
              <button
                key={action.id}
                type="button"
                className={quickActionClasses}
                disabled={isDisabled}
                onClick={() => handleQuickAction(action)}
              >
                {action.label}
              </button>
            ))}
          </div>
        )}

        <div className="flex items-end gap-2">
          <label className="sr-only" htmlFor="chat-composer-input">
            {inputLabel}
          </label>
          <textarea
            id="chat-composer-input"
            ref={setTextareaRef}
            className={cx(
              'min-h-[2.75rem] max-h-40 flex-1 resize-y rounded-2xl border border-border',
              'bg-background px-4 py-2.5 text-base text-foreground',
              'placeholder:text-foreground-muted',
              'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
              'focus-visible:ring-offset-2 focus-visible:ring-offset-background',
              'disabled:cursor-not-allowed disabled:opacity-60',
            )}
            rows={1}
            value={text}
            placeholder={placeholder}
            disabled={isDisabled}
            aria-label={inputLabel}
            onChange={(event) => setText(event.target.value)}
            onKeyDown={handleKeyDown}
          />
          <button
            type="submit"
            className={sendButtonClasses}
            disabled={!canSend}
            aria-label={streaming ? 'Waiting for tutor…' : 'Send message'}
          >
            <SendIcon className="h-[1.1em] w-[1.1em]" />
          </button>
        </div>
      </form>
    );
  },
);
