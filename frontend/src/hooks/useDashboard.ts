// H08 — useDashboard
//
// TanStack Query hook for the parent Dashboard (C08 / 2-A13), typed end-to-end
// against the frozen OpenAPI contract via the shared openapi-fetch client. The
// query flows through `api` so the request/response is checked against the
// generated schema; nothing here hand-rolls a fetch or redefines a shape.
//
// The returned `Dashboard` bundles mastery, the mastery timeline, recent exam
// history, the average score, the study streak, and active parent guidance for
// a single student. On error we surface a toast using the RFC 7807 Problem body.

import {
  useQuery,
  type UseQueryResult,
} from '@tanstack/react-query';

import { api } from '../api/client';
import type { components } from '../api/schema';
import { useToast } from '../app/providers';

type Dashboard = components['schemas']['Dashboard'];
type Problem = components['schemas']['Problem'];

/** Stable query keys for the Dashboard resource. */
export const dashboardKeys = {
  all: ['dashboard'] as const,
  detail: (studentId: string) => [...dashboardKeys.all, studentId] as const,
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

/**
 * Fetch the parent dashboard for a student. `GET /dashboard?studentId=`.
 *
 * Returns the full {@link Dashboard} (mastery, masteryTimeline, history,
 * avgScore, streak, guidance). The query is disabled until a `studentId` is
 * provided so it never fires with an empty scope.
 */
export function useDashboard(
  studentId: string | undefined,
): UseQueryResult<Dashboard, Error> {
  const { toast } = useToast();
  return useQuery({
    queryKey: dashboardKeys.detail(studentId ?? ''),
    enabled: Boolean(studentId),
    queryFn: async ({ signal }) => {
      const { data, error } = await api.GET('/dashboard', {
        params: { query: { studentId: studentId as string } },
        signal,
      });
      if (error) {
        const message = problemMessage(error, 'Failed to load dashboard');
        toast(message, { variant: 'danger' });
        throw new Error(message);
      }
      return data;
    },
  });
}
