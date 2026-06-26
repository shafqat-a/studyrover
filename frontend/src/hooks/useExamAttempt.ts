// H08 — useExamAttempt (start / in-progress / submit / result)
//
// The student exam-loop hooks, typed end-to-end against the frozen OpenAPI
// contract via the shared openapi-fetch client (`api`). Every request/response
// flows through `api` so it is checked against the generated schema; nothing
// here hand-rolls a fetch or redefines a shape.
//
// Powers P12 (start exam), P13 (exam in progress) and P14 (exam result):
//   - useStartAttempt()   POST   /attempts
//   - useAttempt(id)      GET    /attempts/{id}         (no answers revealed)
//   - useSubmitAttempt()  POST   /attempts/{id}/submit
//   - useAttemptResult(id) GET   /attempts/{id}/result  (answers revealed)
//
// Starting an attempt can be blocked by a cooldown after a failed attempt; the
// API returns a 409 CONFLICT Problem. We surface that explicitly as a
// `CooldownError` carrying `cooldownUntil` so the start page can show when the
// student may retry, rather than a generic toast.

import {
  useMutation,
  useQuery,
  useQueryClient,
  type UseMutationResult,
  type UseQueryResult,
} from '@tanstack/react-query';

import { api } from '../api/client';
import type { components } from '../api/schema';
import { useToast } from '../app/providers';

type ExamAttempt = components['schemas']['ExamAttempt'];
type StartAttempt = components['schemas']['StartAttempt'];
type StartAttemptResult = components['schemas']['StartAttemptResult'];
type SubmitAttempt = components['schemas']['SubmitAttempt'];
type SubmitAttemptResult = components['schemas']['SubmitAttemptResult'];
type Problem = components['schemas']['Problem'];

/**
 * Error raised when starting an attempt is blocked by a post-failure cooldown
 * (HTTP 409 CONFLICT). Carries the RFC 3339 instant until which a new attempt
 * is blocked, when the server provides it, so the UI can show a countdown.
 */
export class CooldownError extends Error {
  /** RFC 3339 timestamp until which a new attempt is blocked, if known. */
  readonly cooldownUntil?: string;

  constructor(message: string, cooldownUntil?: string) {
    super(message);
    this.name = 'CooldownError';
    this.cooldownUntil = cooldownUntil;
  }
}

/** Stable query keys for the exam-attempt resource. */
export const attemptKeys = {
  all: ['attempts'] as const,
  details: () => [...attemptKeys.all, 'detail'] as const,
  detail: (id: string) => [...attemptKeys.details(), id] as const,
  results: () => [...attemptKeys.all, 'result'] as const,
  result: (id: string) => [...attemptKeys.results(), id] as const,
};

/**
 * Turn an openapi-fetch `error` (the typed Problem body or an unknown thrown
 * value) into a human-readable message for a toast / thrown Error.
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

/** Whether a Problem body represents a cooldown conflict (409 CONFLICT). */
function isCooldownProblem(error: unknown): boolean {
  if (!error || typeof error !== 'object') {
    return false;
  }
  const problem = error as Partial<Problem>;
  return problem.code === 'CONFLICT' || problem.status === 409;
}

/**
 * Read the `cooldownUntil` extension member off a Problem body, if present. The
 * contract's Problem type does not declare it, but the server attaches it as an
 * RFC 7807 extension member on cooldown conflicts.
 */
function cooldownUntilOf(error: unknown): string | undefined {
  if (error && typeof error === 'object') {
    const value = (error as Record<string, unknown>).cooldownUntil;
    if (typeof value === 'string' && value.length > 0) {
      return value;
    }
  }
  return undefined;
}

/** Start a new exam attempt. `POST /attempts`. */
export function useStartAttempt(): UseMutationResult<
  StartAttemptResult,
  Error,
  StartAttempt
> {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  return useMutation({
    mutationFn: async (body: StartAttempt) => {
      const { data, error } = await api.POST('/attempts', { body });
      if (error) {
        if (isCooldownProblem(error)) {
          throw new CooldownError(
            problemMessage(error, 'You are in a cooldown period'),
            cooldownUntilOf(error),
          );
        }
        throw new Error(problemMessage(error, 'Failed to start exam'));
      }
      return data;
    },
    onSuccess: (result) => {
      // Seed the in-progress cache so P13 can render immediately.
      queryClient.setQueryData(
        attemptKeys.detail(result.attempt.id),
        result.attempt,
      );
      void queryClient.invalidateQueries({ queryKey: attemptKeys.all });
    },
    onError: (error) => {
      // Cooldown is a normal, expected outcome surfaced by the page itself.
      if (!(error instanceof CooldownError)) {
        toast(error.message, { variant: 'danger' });
      }
    },
  });
}

/**
 * Fetch an in-progress attempt by id. `GET /attempts/{id}`.
 * No answer key is revealed while in progress.
 */
export function useAttempt(
  id: string | undefined,
): UseQueryResult<ExamAttempt, Error> {
  return useQuery({
    queryKey: attemptKeys.detail(id ?? ''),
    enabled: Boolean(id),
    queryFn: async ({ signal }) => {
      const { data, error } = await api.GET('/attempts/{id}', {
        params: { path: { id: id as string } },
        signal,
      });
      if (error) {
        throw new Error(problemMessage(error, 'Failed to load attempt'));
      }
      return data;
    },
  });
}

/** Variables for submitting an attempt: the attempt id plus the answers. */
export interface SubmitAttemptVars {
  id: string;
  body: SubmitAttempt;
}

/** Submit answers and grade an attempt. `POST /attempts/{id}/submit`. */
export function useSubmitAttempt(): UseMutationResult<
  SubmitAttemptResult,
  Error,
  SubmitAttemptVars
> {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  return useMutation({
    mutationFn: async ({ id, body }: SubmitAttemptVars) => {
      const { data, error } = await api.POST('/attempts/{id}/submit', {
        params: { path: { id } },
        body,
      });
      if (error) {
        throw new Error(problemMessage(error, 'Failed to submit exam'));
      }
      return data;
    },
    onSuccess: (result) => {
      const attempt = result.attempt;
      // The graded attempt is now the canonical result for P14.
      queryClient.setQueryData(attemptKeys.detail(attempt.id), attempt);
      queryClient.setQueryData(attemptKeys.result(attempt.id), attempt);
      void queryClient.invalidateQueries({ queryKey: attemptKeys.all });
    },
    onError: (error) => {
      toast(error.message, { variant: 'danger' });
    },
  });
}

/**
 * Fetch the graded result of an attempt. `GET /attempts/{id}/result`.
 * Answers (the answer key) are revealed here.
 */
export function useAttemptResult(
  id: string | undefined,
): UseQueryResult<ExamAttempt, Error> {
  return useQuery({
    queryKey: attemptKeys.result(id ?? ''),
    enabled: Boolean(id),
    queryFn: async ({ signal }) => {
      const { data, error } = await api.GET('/attempts/{id}/result', {
        params: { path: { id: id as string } },
        signal,
      });
      if (error) {
        throw new Error(problemMessage(error, 'Failed to load result'));
      }
      return data;
    },
  });
}
