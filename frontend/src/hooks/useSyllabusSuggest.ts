// H04 — useSyllabusSuggest
//
// TanStack Query hooks for AI syllabus derivation (2-A07 suggest, 2-A08 apply),
// typed end-to-end against the frozen OpenAPI contract via the shared
// openapi-fetch client. Every request flows through `api`; nothing here
// hand-rolls a fetch or redefines a shape.
//
// Suggestion is async: POST /subjects/{id}/syllabus/suggest returns a `Job`
// (type=syllabus) whose `result`, once status=ready, holds a TopicSuggestion[].
// `useSuggestSyllabus` kicks off the job; `useSyllabusJob` polls GET /jobs/{id}
// until it resolves and exposes the typed suggestions. `useApplySyllabus`
// materializes the (possibly parent-edited) tree into real Topics and
// invalidates the subject's topic list (key `['topics']`).
//
// On error we surface a toast using the RFC 7807 Problem body returned by the
// API (see C11).

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
import { topicKeys } from './useTopics';

type Job = components['schemas']['Job'];
type Topic = components['schemas']['Topic'];
type TopicSuggestion = components['schemas']['TopicSuggestion'];
type Problem = components['schemas']['Problem'];

/** Stable query keys for syllabus-derivation jobs. */
export const syllabusKeys = {
  all: ['syllabus'] as const,
  /** A poll query for a specific derivation job. */
  job: (jobId: string) => [...syllabusKeys.all, 'job', jobId] as const,
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
 * Extract the typed suggestions from a ready syllabus job's open `result`
 * payload. The contract types `Job.result` as an opaque object map; for
 * type=syllabus it carries a `topics` (TopicSuggestion[]) array.
 */
export function syllabusJobResult(job: Job | undefined): TopicSuggestion[] {
  if (!job || job.status !== 'ready' || !job.result) {
    return [];
  }
  const topics = (job.result as { topics?: unknown }).topics;
  return Array.isArray(topics) ? (topics as TopicSuggestion[]) : [];
}

/**
 * Kick off AI syllabus derivation for a subject.
 * `POST /subjects/{id}/syllabus/suggest` → `Job` (type=syllabus, async).
 *
 * The returned Job starts queued/processing; feed its `id` to
 * `useSyllabusJob` to poll for the derived TopicSuggestion[].
 */
export function useSuggestSyllabus(
  subjectId: string,
): UseMutationResult<Job, Error, void> {
  const { toast } = useToast();
  return useMutation({
    mutationFn: async () => {
      const { data, error } = await api.POST(
        '/subjects/{id}/syllabus/suggest',
        { params: { path: { id: subjectId } } },
      );
      if (error) {
        throw new Error(problemMessage(error, 'Failed to derive syllabus'));
      }
      return data;
    },
    onError: (error) => {
      toast(error.message, { variant: 'danger' });
    },
  });
}

/**
 * Poll a syllabus-derivation job until it reaches a terminal state.
 * `GET /jobs/{id}`. Disabled until a `jobId` is provided; refetches every
 * second while the job is queued/processing and stops once it is ready/error.
 */
export function useSyllabusJob(
  jobId: string | undefined,
): UseQueryResult<Job, Error> {
  return useQuery({
    queryKey: syllabusKeys.job(jobId ?? ''),
    enabled: Boolean(jobId),
    queryFn: async ({ signal }) => {
      const { data, error } = await api.GET('/jobs/{id}', {
        params: { path: { id: jobId as string } },
        signal,
      });
      if (error) {
        throw new Error(problemMessage(error, 'Failed to load syllabus job'));
      }
      return data;
    },
    // Poll while the job is in flight; stop once it reaches a terminal state.
    refetchInterval: (query) => {
      const job = query.state.data;
      if (job && (job.status === 'ready' || job.status === 'error')) {
        return false;
      }
      return 1000;
    },
  });
}

/**
 * Apply a (possibly parent-edited) suggested topic tree to a subject.
 * `POST /subjects/{id}/syllabus/apply` → `Topic[]`. Invalidates the subject's
 * topic list so the materialized topics appear immediately.
 */
export function useApplySyllabus(
  subjectId: string,
): UseMutationResult<Topic[], Error, TopicSuggestion[]> {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  return useMutation({
    mutationFn: async (topics: TopicSuggestion[]) => {
      const { data, error } = await api.POST('/subjects/{id}/syllabus/apply', {
        params: { path: { id: subjectId } },
        body: { topics },
      });
      if (error) {
        throw new Error(problemMessage(error, 'Failed to apply syllabus'));
      }
      return data;
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({
        queryKey: topicKeys.lists(subjectId),
      });
    },
    onError: (error) => {
      toast(error.message, { variant: 'danger' });
    },
  });
}
