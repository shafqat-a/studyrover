// H02 — useStudyGuide
//
// TanStack Query hooks for the StudyGuide resource (2-C02), typed end-to-end
// against the frozen OpenAPI contract via the shared openapi-fetch client.
// `useStudyGuide` reads the latest generated guide for a subject (optionally
// scoped to a topic) via `GET /subjects/{id}/study-guide`; `useGenerateStudyGuide`
// regenerates it via `POST /subjects/{id}/study-guide` and invalidates the cached
// guide so the fresh markdown + citations are re-fetched (2-A04).
//
// Query keys are centralized in `studyGuideKeys` so the mutation can invalidate
// precisely. On error we surface a toast using the RFC 7807 Problem body
// returned by the API (see C11).

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

type StudyGuide = components['schemas']['StudyGuide'];
type GuideRequest = components['schemas']['GuideRequest'];
type Problem = components['schemas']['Problem'];

/** Stable query keys for the StudyGuide resource. */
export const studyGuideKeys = {
  all: ['study-guide'] as const,
  details: () => [...studyGuideKeys.all, 'detail'] as const,
  detail: (subjectId: string, topicId?: string) =>
    [...studyGuideKeys.details(), subjectId, topicId ?? null] as const,
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
 * Fetch the latest study guide for a subject, optionally scoped to a topic.
 * `GET /subjects/{id}/study-guide`. Disabled until a subjectId is provided.
 */
export function useStudyGuide(
  subjectId: string | undefined,
  topicId?: string,
): UseQueryResult<StudyGuide, Error> {
  return useQuery({
    queryKey: studyGuideKeys.detail(subjectId ?? '', topicId),
    enabled: Boolean(subjectId),
    queryFn: async ({ signal }) => {
      const { data, error } = await api.GET('/subjects/{id}/study-guide', {
        params: {
          path: { id: subjectId as string },
          query: { topicId },
        },
        signal,
      });
      if (error) {
        throw new Error(problemMessage(error, 'Failed to load study guide'));
      }
      return data;
    },
  });
}

/** Variables for generating a study guide: the subject id plus the request body. */
export interface GenerateStudyGuideVars {
  subjectId: string;
  topicId?: string;
}

/**
 * Generate (regenerate) a study guide for a subject. `POST /subjects/{id}/study-guide`.
 * Seeds the detail cache with the fresh guide and invalidates it so consumers
 * re-read the latest markdown + citations.
 */
export function useGenerateStudyGuide(): UseMutationResult<
  StudyGuide,
  Error,
  GenerateStudyGuideVars
> {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  return useMutation({
    mutationFn: async ({ subjectId, topicId }: GenerateStudyGuideVars) => {
      const body: GuideRequest = { subjectId, topicId };
      const { data, error } = await api.POST('/subjects/{id}/study-guide', {
        params: { path: { id: subjectId } },
        body,
      });
      if (error) {
        throw new Error(problemMessage(error, 'Failed to generate study guide'));
      }
      return data;
    },
    onSuccess: (guide, { subjectId, topicId }) => {
      queryClient.setQueryData(
        studyGuideKeys.detail(subjectId, topicId),
        guide,
      );
      void queryClient.invalidateQueries({
        queryKey: studyGuideKeys.detail(subjectId, topicId),
      });
    },
    onError: (error) => {
      toast(error.message, { variant: 'danger' });
    },
  });
}
