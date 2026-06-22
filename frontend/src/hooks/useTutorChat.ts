// 2-H01 — useTutorChat (SSE)
//
// Stateful React hook powering the AI tutor chat (2-P01). It starts (or reuses)
// a Conversation (2-A01), loads its message history (2-A03), and posts a student
// message that streams the grounded assistant answer as Server-Sent Events
// (2-A02): `POST /tutor/conversations/{id}/messages` returns a text/event-stream
// whose every `data:` line is a JSON-encoded `AnswerChunk`.
//
// Conversation creation + history use the shared, contract-typed `api` client so
// those requests/responses are checked against the frozen OpenAPI schema. The
// streaming send cannot go through openapi-fetch (it buffers the whole body), so
// it uses `fetch` against the same base URL and reads the `ReadableStream`,
// accumulating `delta` values into the in-progress assistant Message and merging
// any `citations` that arrive. Disconnects/aborts are handled gracefully: the
// partial assistant text is kept and the error is surfaced via a toast.

import { useCallback, useRef, useState } from 'react';

import { API_BASE_URL, api } from '../api/client';
import type { components } from '../api/schema';
import { useToast } from '../app/providers';

type Conversation = components['schemas']['Conversation'];
type Message = components['schemas']['Message'];
type Citation = components['schemas']['Citation'];
type AnswerChunk = components['schemas']['AnswerChunk'];
type AskRequest = components['schemas']['AskRequest'];
type Problem = components['schemas']['Problem'];

/** Public shape returned by {@link useTutorChat}. */
export interface UseTutorChat {
  /** The active conversation, once started; `undefined` before the first start. */
  conversation: Conversation | undefined;
  /** Full message history including any in-flight (streaming) assistant turn. */
  messages: Message[];
  /** True while a conversation is being created or history loaded. */
  isLoading: boolean;
  /** True while an assistant answer is actively streaming. */
  isStreaming: boolean;
  /** Last error message, if any (also surfaced via toast). */
  error: string | undefined;
  /** Start a fresh conversation for a subject + student. */
  startConversation: (vars: StartConversationVars) => Promise<Conversation>;
  /** Send a student message and stream the assistant's grounded answer. */
  sendMessage: (text: string, topicId?: string) => Promise<void>;
  /** Abort an in-flight stream, keeping any partial assistant text. */
  cancel: () => void;
}

/** Inputs for starting a conversation. */
export interface StartConversationVars {
  subjectId: string;
  studentId: string;
}

/**
 * Turn a thrown value or RFC 7807 Problem body into a human-readable message.
 */
function problemMessage(error: unknown, fallback: string): string {
  if (error && typeof error === 'object') {
    const problem = error as Partial<Problem>;
    if (typeof problem.detail === 'string' && problem.detail.length > 0) {
      return problem.detail;
    }
    if (typeof problem.title === 'string' && problem.title.length > 0) {
      return problem.title;
    }
  }
  if (error instanceof Error && error.message) {
    return error.message;
  }
  return fallback;
}

/** Merge incoming citations into an existing list, de-duplicating by source+locator. */
function mergeCitations(
  existing: Citation[] | undefined,
  incoming: Citation[] | undefined,
): Citation[] | undefined {
  if (!incoming || incoming.length === 0) {
    return existing;
  }
  const merged = [...(existing ?? [])];
  for (const c of incoming) {
    const dup = merged.some(
      (m) => m.sourceId === c.sourceId && m.locator === c.locator,
    );
    if (!dup) {
      merged.push(c);
    }
  }
  return merged;
}

/** A locally-constructed id for an optimistic / streaming message. */
function localId(prefix: string): string {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

/**
 * Stateful tutor-chat hook. Manages a single conversation's lifecycle and the
 * SSE token stream for assistant answers.
 */
export function useTutorChat(): UseTutorChat {
  const { toast } = useToast();
  const [conversation, setConversation] = useState<Conversation | undefined>(
    undefined,
  );
  const [messages, setMessages] = useState<Message[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isStreaming, setIsStreaming] = useState(false);
  const [error, setError] = useState<string | undefined>(undefined);

  const abortRef = useRef<AbortController | null>(null);

  const startConversation = useCallback(
    async (vars: StartConversationVars): Promise<Conversation> => {
      setIsLoading(true);
      setError(undefined);
      try {
        const { data, error: createErr } = await api.POST(
          '/tutor/conversations',
          { body: { subjectId: vars.subjectId, studentId: vars.studentId } },
        );
        if (createErr || !data) {
          throw new Error(
            problemMessage(createErr, 'Failed to start conversation'),
          );
        }
        setConversation(data);

        // Load any existing history (a fresh conversation simply yields []).
        const { data: hist, error: histErr } = await api.GET(
          '/tutor/conversations/{id}',
          { params: { path: { id: data.id } } },
        );
        if (histErr) {
          throw new Error(
            problemMessage(histErr, 'Failed to load conversation'),
          );
        }
        setMessages(hist?.messages ?? []);
        return data;
      } catch (err) {
        const message = problemMessage(err, 'Failed to start conversation');
        setError(message);
        toast(message, { variant: 'danger' });
        throw err instanceof Error ? err : new Error(message);
      } finally {
        setIsLoading(false);
      }
    },
    [toast],
  );

  const cancel = useCallback(() => {
    abortRef.current?.abort();
    abortRef.current = null;
    setIsStreaming(false);
  }, []);

  const sendMessage = useCallback(
    async (text: string, topicId?: string): Promise<void> => {
      const conv = conversation;
      if (!conv) {
        const message = 'Start a conversation before sending a message';
        setError(message);
        toast(message, { variant: 'danger' });
        return;
      }
      const trimmed = text.trim();
      if (trimmed.length === 0) {
        return;
      }

      // Cancel any prior in-flight stream before starting a new turn.
      abortRef.current?.abort();
      const controller = new AbortController();
      abortRef.current = controller;

      const now = new Date().toISOString();
      const userMessage: Message = {
        id: localId('user'),
        conversationId: conv.id,
        role: 'user',
        text: trimmed,
        createdAt: now,
      };
      const assistantId = localId('assistant');
      const assistantMessage: Message = {
        id: assistantId,
        conversationId: conv.id,
        role: 'assistant',
        text: '',
        citations: [],
        createdAt: now,
      };

      setError(undefined);
      setIsStreaming(true);
      setMessages((prev) => [...prev, userMessage, assistantMessage]);

      /** Apply an AnswerChunk to the streaming assistant message in state. */
      const applyChunk = (chunk: AnswerChunk) => {
        setMessages((prev) =>
          prev.map((m) => {
            if (m.id !== assistantId) {
              return m;
            }
            return {
              ...m,
              text: m.text + (chunk.delta ?? ''),
              citations: mergeCitations(m.citations, chunk.citations),
            };
          }),
        );
      };

      const body: AskRequest = {
        conversationId: conv.id,
        text: trimmed,
        ...(topicId ? { topicId } : {}),
      };

      try {
        const response = await fetch(
          `${API_BASE_URL}/tutor/conversations/${encodeURIComponent(conv.id)}/messages`,
          {
            method: 'POST',
            credentials: 'include',
            headers: {
              'Content-Type': 'application/json',
              Accept: 'text/event-stream',
            },
            body: JSON.stringify(body),
            signal: controller.signal,
          },
        );

        if (!response.ok || !response.body) {
          let detail = `Tutor request failed (${response.status})`;
          try {
            const problem = (await response.json()) as Partial<Problem>;
            detail = problemMessage(problem, detail);
          } catch {
            // Non-JSON error body; keep the status-based message.
          }
          throw new Error(detail);
        }

        const reader = response.body
          .pipeThrough(new TextDecoderStream())
          .getReader();
        let buffer = '';
        let done = false;

        // Parse the text/event-stream incrementally: events are separated by a
        // blank line; each event's `data:` lines carry one JSON AnswerChunk.
        const consumeEvent = (raw: string) => {
          const dataLines: string[] = [];
          for (const line of raw.split('\n')) {
            if (line.startsWith('data:')) {
              dataLines.push(line.slice(5).replace(/^ /, ''));
            }
          }
          if (dataLines.length === 0) {
            return;
          }
          const payload = dataLines.join('\n');
          if (payload === '[DONE]') {
            done = true;
            return;
          }
          try {
            const chunk = JSON.parse(payload) as AnswerChunk;
            applyChunk(chunk);
            if (chunk.done) {
              done = true;
            }
          } catch {
            // Ignore malformed/keep-alive frames.
          }
        };

        // eslint-disable-next-line no-constant-condition
        while (true) {
          const { value, done: streamDone } = await reader.read();
          if (value) {
            buffer += value;
            let sepIndex = buffer.indexOf('\n\n');
            while (sepIndex !== -1) {
              const rawEvent = buffer.slice(0, sepIndex);
              buffer = buffer.slice(sepIndex + 2);
              consumeEvent(rawEvent);
              if (done) {
                break;
              }
              sepIndex = buffer.indexOf('\n\n');
            }
          }
          if (streamDone || done) {
            break;
          }
        }
        // Flush a trailing event without its terminating blank line.
        if (!done && buffer.trim().length > 0) {
          consumeEvent(buffer);
        }
      } catch (err) {
        // An intentional cancel() aborts the controller — not a user-facing error.
        if (controller.signal.aborted) {
          return;
        }
        const message = problemMessage(err, 'The tutor stream was interrupted');
        setError(message);
        toast(message, { variant: 'danger' });
      } finally {
        if (abortRef.current === controller) {
          abortRef.current = null;
        }
        setIsStreaming(false);
      }
    },
    [conversation, toast],
  );

  return {
    conversation,
    messages,
    isLoading,
    isStreaming,
    error,
    startConversation,
    sendMessage,
    cancel,
  };
}
