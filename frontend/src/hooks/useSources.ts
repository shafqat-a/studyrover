// H02 — useSources
//
// TanStack Query hooks for the Source resource (C02), typed end-to-end against
// the frozen OpenAPI contract via the shared openapi-fetch client. Every request
// flows through `api` so payloads/responses are checked against the generated
// schema; nothing here hand-rolls a fetch or redefines a shape.
//
// Sources are always scoped to a subject. The list query is keyed by
// `['sources', subjectId]` so a create/delete for a given subject invalidates
// exactly that subject's list and nothing else. On error we surface a toast
// using the RFC 7807 Problem body returned by the API (see C11).

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

type Source = components['schemas']['Source'];
type CreateSource = components['schemas']['CreateSource'];
type PageOfSource = components['schemas']['PageOfSource'];
type Problem = components['schemas']['Problem'];

/** Optional pagination for the source list. */
export interface UseSourcesParams {
  page?: number;
  pageSize?: number;
}

/** Stable query keys for the Source resource, scoped by subject. */
export const sourceKeys = {
  all: ['sources'] as const,
  /** All list queries for a given subject. */
  lists: (subjectId: string) => [...sourceKeys.all, subjectId] as const,
  /** A specific paginated list query for a subject. */
  list: (subjectId: string, params: UseSourcesParams) =>
    [...sourceKeys.lists(subjectId), 'list', params] as const,
  details: () => [...sourceKeys.all, 'detail'] as const,
  detail: (id: string) => [...sourceKeys.details(), id] as const,
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
 * List sources for a single subject (paginated). `GET /sources?subjectId=...`.
 * Disabled until a `subjectId` is provided.
 */
export function useSources(
  subjectId: string | undefined,
  params: UseSourcesParams = {},
): UseQueryResult<PageOfSource, Error> {
  return useQuery({
    queryKey: sourceKeys.list(subjectId ?? '', params),
    enabled: Boolean(subjectId),
    queryFn: async ({ signal }) => {
      const { data, error } = await api.GET('/sources', {
        params: {
          query: {
            subjectId: subjectId as string,
            page: params.page,
            pageSize: params.pageSize,
          },
        },
        signal,
      });
      if (error) {
        throw new Error(problemMessage(error, 'Failed to load sources'));
      }
      return data;
    },
  });
}

/** Fetch a single source by id. `GET /sources/{id}`. */
export function useSource(
  id: string | undefined,
): UseQueryResult<Source, Error> {
  return useQuery({
    queryKey: sourceKeys.detail(id ?? ''),
    enabled: Boolean(id),
    queryFn: async ({ signal }) => {
      const { data, error } = await api.GET('/sources/{id}', {
        params: { path: { id: id as string } },
        signal,
      });
      if (error) {
        throw new Error(problemMessage(error, 'Failed to load source'));
      }
      return data;
    },
  });
}

/**
 * Create a source. `POST /sources`. Invalidates the owning subject's source
 * list (keyed by the created source's `subjectId`).
 */
export function useCreateSource(): UseMutationResult<
  Source,
  Error,
  CreateSource
> {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  return useMutation({
    mutationFn: async (body: CreateSource) => {
      const { data, error } = await api.POST('/sources', { body });
      if (error) {
        throw new Error(problemMessage(error, 'Failed to create source'));
      }
      return data;
    },
    onSuccess: (source) => {
      void queryClient.invalidateQueries({
        queryKey: sourceKeys.lists(source.subjectId),
      });
    },
    onError: (error) => {
      toast(error.message, { variant: 'danger' });
    },
  });
}

/**
 * Variables for deleting a source: the source `id` plus its `subjectId` so we
 * can invalidate the correct subject-scoped list without an extra fetch.
 */
export interface DeleteSourceVars {
  id: string;
  subjectId: string;
}

/**
 * Delete a source. `DELETE /sources/{id}`. Invalidates the owning subject's
 * source list and drops the cached detail.
 */
export function useDeleteSource(): UseMutationResult<
  DeleteSourceVars,
  Error,
  DeleteSourceVars
> {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  return useMutation({
    mutationFn: async (vars: DeleteSourceVars) => {
      const { error } = await api.DELETE('/sources/{id}', {
        params: { path: { id: vars.id } },
      });
      if (error) {
        throw new Error(problemMessage(error, 'Failed to delete source'));
      }
      return vars;
    },
    onSuccess: ({ id, subjectId }) => {
      void queryClient.invalidateQueries({
        queryKey: sourceKeys.lists(subjectId),
      });
      queryClient.removeQueries({ queryKey: sourceKeys.detail(id) });
    },
    onError: (error) => {
      toast(error.message, { variant: 'danger' });
    },
  });
}
