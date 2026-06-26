import { forwardRef, useEffect, useRef } from 'react';
import type { HTMLAttributes, ReactNode } from 'react';

/**
 * 2-U01 — ChatThread
 *
 * A presentational, accessible transcript for the AI-tutor conversation. It
 * renders a list of student (`user`) and tutor (`assistant`) messages, an
 * optional live-streaming partial assistant message, per-message citations,
 * and markdown bodies. Props-driven only: no data fetching, no hooks beyond
 * local layout effects (autoscroll), no business logic. Styling uses the
 * StudyRover design tokens from `tailwind.config.ts` (e.g. `bg-surface`,
 * `bg-primary`, `rounded-card`, `text-foreground-muted`).
 *
 * Composition seams (so the markdown renderer (2-U10) and citation list
 * (2-U03) stay decoupled from this primitive):
 * - `renderMarkdown(text)` — render a message body. Defaults to safe plain
 *   text with preserved whitespace.
 * - `renderCitations(citations)` — render an assistant message's sources.
 *   Defaults to a compact, accessible inline citation list.
 *
 * Streaming: pass `streaming` with the partial assistant text accumulated so
 * far. While `streaming.active` is true a blinking caret is shown and the
 * region is announced politely to assistive tech.
 *
 * Accessibility: the thread is a `log` with `aria-live="polite"`; each message
 * is a labelled group identifying its author.
 */

/** A reference to a knowledge source backing an assistant answer. */
export interface ChatCitation {
  /** Identifier of the knowledge source being cited. */
  sourceId: string;
  /** Human-readable label for the cited source (e.g. document title). */
  label: string;
  /** Optional location within the source (e.g. page number or anchor). */
  locator?: string;
}

/** A single rendered turn in the tutor conversation. */
export interface ChatMessage {
  /** Stable unique identifier (used as the React key). */
  id: string;
  /** Who authored the message. */
  role: 'user' | 'assistant';
  /** Full message text (markdown for assistant turns). */
  text: string;
  /** Source citations backing an assistant message. */
  citations?: ChatCitation[];
  /** Optional RFC 3339 creation timestamp, shown as a relative-ish label. */
  createdAt?: string;
}

/** The in-flight assistant message being streamed token-by-token. */
export interface ChatStreamingMessage {
  /** Partial assistant text accumulated so far. */
  text: string;
  /** Whether the stream is still producing tokens. */
  active: boolean;
  /** Citations that have arrived for the streamed answer (often at the end). */
  citations?: ChatCitation[];
}

export interface ChatThreadProps
  extends Omit<HTMLAttributes<HTMLDivElement>, 'children'> {
  /** Completed messages, oldest first. */
  messages: ChatMessage[];
  /** Optional live-streaming assistant message appended after `messages`. */
  streaming?: ChatStreamingMessage;
  /**
   * When true, shows a "thinking" indicator for an assistant turn that has not
   * yet begun streaming text. Ignored once `streaming.text` is non-empty.
   */
  pending?: boolean;
  /** Content shown when there are no messages and nothing is streaming. */
  emptyState?: ReactNode;
  /**
   * Renders a message body. Defaults to safe plain text with preserved
   * whitespace. Wire this to the markdown renderer (2-U10) for assistant turns.
   */
  renderMarkdown?: (text: string, role: ChatMessage['role']) => ReactNode;
  /**
   * Renders an assistant message's citations (2-U03). Defaults to a compact
   * inline list. Not called when there are no citations.
   */
  renderCitations?: (citations: ChatCitation[]) => ReactNode;
  /**
   * Disable automatic scroll-to-bottom on new content. Defaults to enabled.
   */
  disableAutoscroll?: boolean;
}

/** Joins truthy class fragments into a single className string. */
function cx(...parts: Array<string | false | null | undefined>): string {
  return parts.filter(Boolean).join(' ');
}

const roleLabel: Record<ChatMessage['role'], string> = {
  user: 'You',
  assistant: 'Tutor',
};

function defaultRenderMarkdown(text: string): ReactNode {
  return <span className="whitespace-pre-wrap break-words">{text}</span>;
}

function DefaultCitations({ citations }: { citations: ChatCitation[] }): ReactNode {
  return (
    <ul className="mt-2 flex flex-wrap gap-1.5" aria-label="Sources">
      {citations.map((c, i) => (
        <li key={`${c.sourceId}-${i}`}>
          <span
            className={cx(
              'inline-flex items-center gap-1 rounded-pill border border-border',
              'bg-surface px-2 py-0.5 text-xs text-foreground-muted',
            )}
          >
            <span aria-hidden="true">[{i + 1}]</span>
            <span className="font-medium text-foreground">{c.label}</span>
            {c.locator != null && c.locator.length > 0 && (
              <span className="text-foreground-muted">· {c.locator}</span>
            )}
          </span>
        </li>
      ))}
    </ul>
  );
}

function bubbleClasses(role: ChatMessage['role']): string {
  if (role === 'user') {
    return 'bg-primary text-primary-foreground rounded-card rounded-br-sm';
  }
  return 'bg-surface text-foreground border border-border rounded-card rounded-bl-sm';
}

function rowClasses(role: ChatMessage['role']): string {
  return role === 'user' ? 'items-end' : 'items-start';
}

function MessageBubble({
  message,
  renderMarkdown,
  renderCitations,
}: {
  message: ChatMessage;
  renderMarkdown: NonNullable<ChatThreadProps['renderMarkdown']>;
  renderCitations: NonNullable<ChatThreadProps['renderCitations']>;
}) {
  const { role, text, citations } = message;
  const hasCitations =
    role === 'assistant' && Array.isArray(citations) && citations.length > 0;

  return (
    <div className={cx('flex w-full flex-col gap-1', rowClasses(role))}>
      <div className="px-1 text-xs font-semibold text-foreground-muted">
        {roleLabel[role]}
      </div>
      <div
        className={cx(
          'max-w-[85%] px-4 py-2.5 text-base leading-relaxed shadow-card',
          bubbleClasses(role),
        )}
      >
        {renderMarkdown(text, role)}
        {hasCitations && renderCitations(citations!)}
      </div>
    </div>
  );
}

function TypingIndicator() {
  return (
    <span className="inline-flex items-center gap-1" aria-hidden="true">
      <span className="h-2 w-2 animate-bounce rounded-full bg-foreground-muted [animation-delay:-0.3s]" />
      <span className="h-2 w-2 animate-bounce rounded-full bg-foreground-muted [animation-delay:-0.15s]" />
      <span className="h-2 w-2 animate-bounce rounded-full bg-foreground-muted" />
    </span>
  );
}

export const ChatThread = forwardRef<HTMLDivElement, ChatThreadProps>(
  function ChatThread(
    {
      messages,
      streaming,
      pending = false,
      emptyState,
      renderMarkdown = defaultRenderMarkdown,
      renderCitations = (citations) => <DefaultCitations citations={citations} />,
      disableAutoscroll = false,
      className,
      ...rest
    },
    ref,
  ) {
    const endRef = useRef<HTMLDivElement>(null);

    const streamingText = streaming?.text ?? '';
    const isStreaming = streaming?.active === true;
    const hasStreamBody = streamingText.length > 0;
    // Show a standalone "thinking" bubble only before any text has streamed in.
    const showPending = (pending || isStreaming) && !hasStreamBody;
    const streamingCitations = streaming?.citations;
    const hasStreamCitations =
      Array.isArray(streamingCitations) && streamingCitations.length > 0;

    const isEmpty =
      messages.length === 0 && !hasStreamBody && !showPending;

    // Autoscroll to the latest content whenever the transcript grows or the
    // streamed text changes.
    useEffect(() => {
      if (disableAutoscroll) return;
      endRef.current?.scrollIntoView({ block: 'end' });
    }, [messages.length, streamingText, showPending, disableAutoscroll]);

    return (
      <div
        ref={ref}
        role="log"
        aria-live="polite"
        aria-relevant="additions text"
        aria-label="Tutor conversation"
        className={cx(
          'flex flex-col gap-4 overflow-y-auto px-4 py-4',
          className,
        )}
        {...rest}
      >
        {isEmpty ? (
          <div className="flex flex-1 items-center justify-center text-foreground-muted">
            {emptyState ?? (
              <p className="text-center text-sm">
                Ask your tutor a question to get started.
              </p>
            )}
          </div>
        ) : (
          <>
            {messages.map((message) => (
              <MessageBubble
                key={message.id}
                message={message}
                renderMarkdown={renderMarkdown}
                renderCitations={renderCitations}
              />
            ))}

            {hasStreamBody && (
              <div className="flex w-full flex-col items-start gap-1">
                <div className="px-1 text-xs font-semibold text-foreground-muted">
                  {roleLabel.assistant}
                </div>
                <div
                  className={cx(
                    'max-w-[85%] px-4 py-2.5 text-base leading-relaxed shadow-card',
                    bubbleClasses('assistant'),
                  )}
                >
                  {renderMarkdown(streamingText, 'assistant')}
                  {isStreaming && (
                    <span
                      className="ml-0.5 inline-block h-[1.1em] w-[2px] translate-y-[2px] animate-pulse bg-foreground align-middle"
                      aria-hidden="true"
                    />
                  )}
                  {hasStreamCitations && renderCitations(streamingCitations!)}
                </div>
              </div>
            )}

            {showPending && (
              <div className="flex w-full flex-col items-start gap-1">
                <div className="px-1 text-xs font-semibold text-foreground-muted">
                  {roleLabel.assistant}
                </div>
                <div
                  className={cx(
                    'inline-flex max-w-[85%] px-4 py-3 shadow-card',
                    bubbleClasses('assistant'),
                  )}
                >
                  <TypingIndicator />
                  <span className="sr-only">Tutor is thinking…</span>
                </div>
              </div>
            )}
          </>
        )}

        <div ref={endRef} aria-hidden="true" />
      </div>
    );
  },
);
