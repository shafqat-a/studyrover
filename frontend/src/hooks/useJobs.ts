// H03 — useJobs
//
// TanStack Query hooks for the async Job resource (2-C03), typed end-to-end
// against the frozen OpenAPI contract via the shared openapi-fetch client.
//
// `useJob(id)` polls `GET /jobs/{id}` until the job reaches a terminal state
// (`ready` or `error`), then stops refetching. `useJobs(subjectId)` lists jobs
// for a subject and keeps polling while any of them is still in flight so the
// UI stays current as background work progresses.

import {
  useQuery,
  type UseQueryResult,
} from '@tanstack/react-query';

import { api } from '../api/client';
import type { components } from '../api/schema';

type Job = components['schemas']['Job'];
type PageOfJob = components['schemas']['PageOfJob'];
type JobStatus = Job['status'];
type Problem = components['schemas']['Problem'];

/** How often to re-poll a job while it is still running, in milliseconds. */
const POLL_INTERVAL_MS = 2000;

/** Optional pagination for the job list. */
export interface UseJobsParams {
  page?: number;
  pageSize?: number;
}

/** Stable query keys for the Job resource. */
export const jobKeys = {
  all: ['jobs'] as const,
  lists: () => [...jobKeys.all, 'list'] as const,
  list: (subjectId: string | undefined, params: UseJobsParams) =>
    [...jobKeys.lists(), subjectId ?? null, params] as const,
  details: () => [...jobKeys.all, 'detail'] as const,
  detail: (id: string) => [...jobKeys.details(), id] as const,
};

/** A job is terminal (done polling) once it is ready or errored. */
export function isTerminalJobStatus(status: JobStatus): boolean {
  return status === 'ready' || status === 'error';
}

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
 * Poll a single async job by id. `GET /jobs/{id}`.
 *
 * Refetches on an interval until the job reaches a terminal state
 * (`ready`/`error`), at which point polling stops automatically.
 */
export function useJob(
  id: string | undefined,
): UseQueryResult<Job, Error> {
  return useQuery({
    queryKey: jobKeys.detail(id ?? ''),
    enabled: Boolean(id),
    queryFn: async ({ signal }) => {
      const { data, error } = await api.GET('/jobs/{id}', {
        params: { path: { id: id as string } },
        signal,
      });
      if (error) {
        throw new Error(problemMessage(error, 'Failed to load job'));
      }
      return data;
    },
    // Keep polling while the job is in flight; stop once it is terminal.
    refetchInterval: (query) => {
      const job = query.state.data;
      if (job && isTerminalJobStatus(job.status)) {
        return false;
      }
      return POLL_INTERVAL_MS;
    },
  });
}

/**
 * List async jobs for a subject. `GET /jobs?subjectId=...`.
 *
 * Continues polling while any job in the page is still queued or processing so
 * progress updates surface without a manual refresh; stops once every job is
 * terminal.
 */
export function useJobs(
  subjectId: string | undefined,
  params: UseJobsParams = {},
): UseQueryResult<PageOfJob, Error> {
  return useQuery({
    queryKey: jobKeys.list(subjectId, params),
    queryFn: async ({ signal }) => {
      const { data, error } = await api.GET('/jobs', {
        params: {
          query: {
            subjectId,
            page: params.page,
            pageSize: params.pageSize,
          },
        },
        signal,
      });
      if (error) {
        throw new Error(problemMessage(error, 'Failed to load jobs'));
      }
      return data;
    },
    refetchInterval: (query) => {
      const page = query.state.data;
      if (!page) {
        return POLL_INTERVAL_MS;
      }
      const anyInFlight = page.items.some(
        (job) => !isTerminalJobStatus(job.status),
      );
      return anyInFlight ? POLL_INTERVAL_MS : false;
    },
  });
}
