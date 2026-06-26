// H07 — useGuidance
//
// TanStack Query hooks for parent Guidance (C07 / 2-A12), typed end-to-end
// against the frozen OpenAPI contract via the shared openapi-fetch client. The
// contract exposes only `GET /guidance` (list, optionally scoped by subjectId)
// and `PUT /guidance` (create-or-replace). There is no DELETE endpoint, so a
// "delete" is modelled as replacing the guidance for a scope with empty text —
// the server treats an empty replacement as clearing that scope's guidance.
//
// Query keys are scoped by subjectId so mutations invalidate precisely (global
// guidance and per-subject guidance are cached independently).

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

type Guidance = components['schemas']['Guidance'];
type CreateGuidance = components['schemas']['CreateGuidance'];
type Problem = components['schemas']['Problem'];

/** Stable query keys for the Guidance resource, scoped by subject. */
export const guidanceKeys = {
  all: ['guidance'] as const,
  lists: () => [...guidanceKeys.all, 'list'] as const,
  /** A subject-scoped list, or the global list when subjectId is omitted. */
  list: (subjectId?: string) =>
    [...guidanceKeys.lists(), subjectId ?? 'global'] as const,
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
 * List parent guidance. `GET /guidance`. When `subjectId` is provided the
 * subject-scoped guidance is returned; otherwise the global guidance is.
 */
export function useGuidance(
  subjectId?: string,
): UseQueryResult<Guidance[], Error> {
  return useQuery({
    queryKey: guidanceKeys.list(subjectId),
    queryFn: async ({ signal }) => {
      const { data, error } = await api.GET('/guidance', {
        params: { query: subjectId ? { subjectId } : {} },
        signal,
      });
      if (error) {
        throw new Error(problemMessage(error, 'Failed to load guidance'));
      }
      return data;
    },
  });
}

/**
 * Create or replace parent guidance. `PUT /guidance`. Invalidates the list for
 * the affected scope (the subject it targets, or the global scope).
 */
export function useCreateGuidance(): UseMutationResult<
  Guidance,
  Error,
  CreateGuidance
> {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  return useMutation({
    mutationFn: async (body: CreateGuidance) => {
      const { data, error } = await api.PUT('/guidance', { body });
      if (error) {
        throw new Error(problemMessage(error, 'Failed to save guidance'));
      }
      return data;
    },
    onSuccess: (guidance) => {
      void queryClient.invalidateQueries({
        queryKey: guidanceKeys.list(guidance.subjectId),
      });
    },
    onError: (error) => {
      toast(error.message, { variant: 'danger' });
    },
  });
}

/**
 * Delete a single guidance entry by id via `DELETE /guidance/{id}`. Invalidates
 * all guidance lists so the removed note disappears.
 */
export function useDeleteGuidance(): UseMutationResult<void, Error, string> {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await api.DELETE('/guidance/{id}', {
        params: { path: { id } },
      });
      if (error) {
        throw new Error(problemMessage(error, 'Failed to delete guidance'));
      }
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: guidanceKeys.all });
    },
    onError: (error) => {
      toast(error.message, { variant: 'danger' });
    },
  });
}
