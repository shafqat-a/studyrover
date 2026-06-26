// H06 — useTutorInstructions
//
// TanStack Query hooks for per-subject TutorInstructions (2-C06), typed
// end-to-end against the frozen OpenAPI contract via the shared openapi-fetch
// client. The GET/PUT pair lets a parent read and edit the instructions that
// steer the AI tutor for a single subject. Everything flows through `api` so
// requests/responses are checked against the generated schema; nothing here
// hand-rolls a fetch or redefines a shape.
//
// On a successful update we both seed the detail cache with the server's
// response and invalidate it so any other observer refetches the fresh value.

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

type TutorInstructions = components['schemas']['TutorInstructions'];
type Problem = components['schemas']['Problem'];

/** Stable query keys for the TutorInstructions resource (keyed by subject). */
export const tutorInstructionsKeys = {
  all: ['tutor-instructions'] as const,
  detail: (subjectId: string) =>
    [...tutorInstructionsKeys.all, subjectId] as const,
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
 * Fetch the tutor instructions for a subject.
 * `GET /subjects/{id}/tutor-instructions`. Disabled until a subjectId is known.
 */
export function useTutorInstructions(
  subjectId: string | undefined,
): UseQueryResult<TutorInstructions, Error> {
  return useQuery({
    queryKey: tutorInstructionsKeys.detail(subjectId ?? ''),
    enabled: Boolean(subjectId),
    queryFn: async ({ signal }) => {
      const { data, error } = await api.GET(
        '/subjects/{id}/tutor-instructions',
        {
          params: { path: { id: subjectId as string } },
          signal,
        },
      );
      if (error) {
        throw new Error(
          problemMessage(error, 'Failed to load tutor instructions'),
        );
      }
      return data;
    },
  });
}

/** Variables for updating tutor instructions: the subject id plus the body. */
export interface UpdateTutorInstructionsVars {
  subjectId: string;
  instructions: TutorInstructions;
}

/**
 * Update the tutor instructions for a subject.
 * `PUT /subjects/{id}/tutor-instructions`. Seeds + invalidates the detail cache.
 */
export function useUpdateTutorInstructions(): UseMutationResult<
  TutorInstructions,
  Error,
  UpdateTutorInstructionsVars
> {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  return useMutation({
    mutationFn: async ({
      subjectId,
      instructions,
    }: UpdateTutorInstructionsVars) => {
      const { data, error } = await api.PUT(
        '/subjects/{id}/tutor-instructions',
        {
          params: { path: { id: subjectId } },
          body: { ...instructions, subjectId },
        },
      );
      if (error) {
        throw new Error(
          problemMessage(error, 'Failed to save tutor instructions'),
        );
      }
      return data;
    },
    onSuccess: (instructions) => {
      queryClient.setQueryData(
        tutorInstructionsKeys.detail(instructions.subjectId),
        instructions,
      );
      void queryClient.invalidateQueries({
        queryKey: tutorInstructionsKeys.detail(instructions.subjectId),
      });
    },
    onError: (error) => {
      toast(error.message, { variant: 'danger' });
    },
  });
}
