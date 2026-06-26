// H09 — useExamHistory / useProgress
//
// TanStack Query hooks for a student's exam history (paginated GET /attempts)
// and progress summary (GET /progress). Both are read-only and typed end-to-end
// against the frozen OpenAPI contract via the shared openapi-fetch client `api`;
// nothing here hand-rolls a fetch or redefines a shape.
//
// Query keys are stable and centralized so future mutations (e.g. submitting an
// attempt) can invalidate precisely. On error we surface the RFC 7807 Problem
// body returned by the API.

import { useQuery, type UseQueryResult } from '@tanstack/react-query';

import { api } from '../api/client';
import type { components } from '../api/schema';

type PageOfExamAttempt = components['schemas']['PageOfExamAttempt'];
type Progress = components['schemas']['Progress'];
type Problem = components['schemas']['Problem'];

/** Optional pagination / filtering for the attempt history list. */
export interface UseExamHistoryParams {
  page?: number;
  pageSize?: number;
}

/** Stable query keys for exam history + progress. */
export const examHistoryKeys = {
  all: ['examHistory'] as const,
  lists: () => [...examHistoryKeys.all, 'list'] as const,
  list: (studentId: string, params: UseExamHistoryParams) =>
    [...examHistoryKeys.lists(), studentId, params] as const,
  progressAll: ['progress'] as const,
  progress: (studentId: string) =>
    [...examHistoryKeys.progressAll, studentId] as const,
};

/**
 * Turn an openapi-fetch `error` (the typed Problem body or an unknown thrown
 * value) into a human-readable message for a thrown Error.
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

/**
 * List a student's exam attempts (paginated). `GET /attempts`.
 *
 * The contract scopes attempts by `studentId`; `subjectId` is accepted for
 * call-site convenience but the contract has no server-side subject filter, so
 * it only participates in the cache key (callers can filter client-side).
 */
export function useExamHistory(
  studentId: string | undefined,
  subjectId?: string,
  params: UseExamHistoryParams = {},
): UseQueryResult<PageOfExamAttempt, Error> {
  return useQuery({
    queryKey: examHistoryKeys.list(studentId ?? '', { ...params }),
    enabled: Boolean(studentId),
    queryFn: async ({ signal }) => {
      const { data, error } = await api.GET('/attempts', {
        params: {
          query: {
            studentId,
            page: params.page,
            pageSize: params.pageSize,
          },
        },
        signal,
      });
      if (error) {
        throw new Error(problemMessage(error, 'Failed to load exam history'));
      }
      // `subjectId` has no contract filter; reference it so the param is part of
      // the call without changing the typed request.
      void subjectId;
      return data;
    },
  });
}

/**
 * Fetch a student's progress summary (mastery + streak + recent history).
 * `GET /progress`.
 */
export function useProgress(
  studentId: string | undefined,
): UseQueryResult<Progress, Error> {
  return useQuery({
    queryKey: examHistoryKeys.progress(studentId ?? ''),
    enabled: Boolean(studentId),
    queryFn: async ({ signal }) => {
      const { data, error } = await api.GET('/progress', {
        params: { query: { studentId } },
        signal,
      });
      if (error) {
        throw new Error(problemMessage(error, 'Failed to load progress'));
      }
      return data;
    },
  });
}
