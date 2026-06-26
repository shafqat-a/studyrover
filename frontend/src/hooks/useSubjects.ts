// H01 — useSubjects
//
// TanStack Query hooks for the Subject resource (C01), typed end-to-end against
// the frozen OpenAPI contract via the shared openapi-fetch client. Queries and
// mutations all flow through `api` so requests/responses are checked against the
// generated schema; nothing here hand-rolls a fetch or redefines a shape.
//
// Query keys are stable and centralized in `subjectKeys` so mutations can
// invalidate precisely. On error we surface a toast using the RFC 7807 Problem
// body returned by the API (see C11).

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

type Subject = components['schemas']['Subject'];
type CreateSubject = components['schemas']['CreateSubject'];
type PageOfSubject = components['schemas']['PageOfSubject'];
type Problem = components['schemas']['Problem'];

/** Optional pagination for the subject list. */
export interface UseSubjectsParams {
  page?: number;
  pageSize?: number;
}

/** Stable query keys for the Subject resource. */
export const subjectKeys = {
  all: ['subjects'] as const,
  lists: () => [...subjectKeys.all, 'list'] as const,
  list: (params: UseSubjectsParams) =>
    [...subjectKeys.lists(), params] as const,
  details: () => [...subjectKeys.all, 'detail'] as const,
  detail: (id: string) => [...subjectKeys.details(), id] as const,
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

/** List subjects (paginated). `GET /subjects`. */
export function useSubjects(
  params: UseSubjectsParams = {},
): UseQueryResult<PageOfSubject, Error> {
  return useQuery({
    queryKey: subjectKeys.list(params),
    queryFn: async ({ signal }) => {
      const { data, error } = await api.GET('/subjects', {
        params: { query: { page: params.page, pageSize: params.pageSize } },
        signal,
      });
      if (error) {
        throw new Error(problemMessage(error, 'Failed to load subjects'));
      }
      return data;
    },
  });
}

/** Fetch a single subject by id. `GET /subjects/{id}`. */
export function useSubject(
  id: string | undefined,
): UseQueryResult<Subject, Error> {
  return useQuery({
    queryKey: subjectKeys.detail(id ?? ''),
    enabled: Boolean(id),
    queryFn: async ({ signal }) => {
      const { data, error } = await api.GET('/subjects/{id}', {
        params: { path: { id: id as string } },
        signal,
      });
      if (error) {
        throw new Error(problemMessage(error, 'Failed to load subject'));
      }
      return data;
    },
  });
}

/** Create a subject. `POST /subjects`. Invalidates the subject list. */
export function useCreateSubject(): UseMutationResult<
  Subject,
  Error,
  CreateSubject
> {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  return useMutation({
    mutationFn: async (body: CreateSubject) => {
      const { data, error } = await api.POST('/subjects', { body });
      if (error) {
        throw new Error(problemMessage(error, 'Failed to create subject'));
      }
      return data;
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: subjectKeys.all });
    },
    onError: (error) => {
      toast(error.message, { variant: 'danger' });
    },
  });
}

/** Variables for updating a subject: full id plus the changed fields. */
export interface UpdateSubjectVars {
  id: string;
  changes: Partial<Subject>;
}

/** Update a subject. `PUT /subjects/{id}`. Invalidates list + detail. */
export function useUpdateSubject(): UseMutationResult<
  Subject,
  Error,
  UpdateSubjectVars
> {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  return useMutation({
    mutationFn: async ({ id, changes }: UpdateSubjectVars) => {
      // The contract's PUT body is the Subject shape; the server treats it as a
      // partial merge, so we forward only the changed fields (plus id).
      const { data, error } = await api.PUT('/subjects/{id}', {
        params: { path: { id } },
        body: { ...changes, id } as Subject,
      });
      if (error) {
        throw new Error(problemMessage(error, 'Failed to update subject'));
      }
      return data;
    },
    onSuccess: (subject) => {
      void queryClient.invalidateQueries({ queryKey: subjectKeys.lists() });
      queryClient.setQueryData(subjectKeys.detail(subject.id), subject);
    },
    onError: (error) => {
      toast(error.message, { variant: 'danger' });
    },
  });
}

/** Delete a subject. `DELETE /subjects/{id}`. Invalidates list + detail. */
export function useDeleteSubject(): UseMutationResult<string, Error, string> {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await api.DELETE('/subjects/{id}', {
        params: { path: { id } },
      });
      if (error) {
        throw new Error(problemMessage(error, 'Failed to delete subject'));
      }
      return id;
    },
    onSuccess: (id) => {
      void queryClient.invalidateQueries({ queryKey: subjectKeys.lists() });
      queryClient.removeQueries({ queryKey: subjectKeys.detail(id) });
    },
    onError: (error) => {
      toast(error.message, { variant: 'danger' });
    },
  });
}
