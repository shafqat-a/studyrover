// H04 — useExamDefinitions
//
// TanStack Query hooks for the ExamDefinition resource (C04), typed end-to-end
// against the frozen OpenAPI contract via the shared openapi-fetch client. Every
// request flows through `api` so payloads/responses are checked against the
// generated schema; nothing here hand-rolls a fetch or redefines a shape.
//
// Exam definitions are scoped to a subject. The list query is keyed by
// `['examDefs', subjectId]` so create/update/delete for a subject invalidate
// exactly that subject's list and nothing else. The server applies the spec
// defaults (size 20, passBar 70, cooldownMin 10, type gate, rewardStyle flat),
// so create omits unset fields and lets the contract fill them in. On error we
// surface a toast using the RFC 7807 Problem body returned by the API (see C11).

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

type ExamDefinition = components['schemas']['ExamDefinition'];
type CreateExamDefinition = components['schemas']['CreateExamDefinition'];
type PageOfExamDefinition = components['schemas']['PageOfExamDefinition'];
type Problem = components['schemas']['Problem'];

/** Optional pagination for the exam-definition list. */
export interface UseExamDefinitionsParams {
  page?: number;
  pageSize?: number;
}

/** Stable query keys for the ExamDefinition resource, scoped by subject. */
export const examDefinitionKeys = {
  all: ['examDefs'] as const,
  /** All list queries for a given subject. */
  lists: (subjectId: string) => [...examDefinitionKeys.all, subjectId] as const,
  /** A specific paginated list query for a subject. */
  list: (subjectId: string, params: UseExamDefinitionsParams) =>
    [...examDefinitionKeys.lists(subjectId), 'list', params] as const,
  details: () => [...examDefinitionKeys.all, 'detail'] as const,
  detail: (id: string) => [...examDefinitionKeys.details(), id] as const,
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
 * List exam definitions for a single subject (paginated).
 * `GET /exam-definitions?subjectId=...`. Disabled until a `subjectId` is given.
 */
export function useExamDefinitions(
  subjectId: string | undefined,
  params: UseExamDefinitionsParams = {},
): UseQueryResult<PageOfExamDefinition, Error> {
  return useQuery({
    queryKey: examDefinitionKeys.list(subjectId ?? '', params),
    enabled: Boolean(subjectId),
    queryFn: async ({ signal }) => {
      const { data, error } = await api.GET('/exam-definitions', {
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
        throw new Error(problemMessage(error, 'Failed to load exam definitions'));
      }
      return data;
    },
  });
}

/** Fetch a single exam definition by id. `GET /exam-definitions/{id}`. */
export function useExamDefinition(
  id: string | undefined,
): UseQueryResult<ExamDefinition, Error> {
  return useQuery({
    queryKey: examDefinitionKeys.detail(id ?? ''),
    enabled: Boolean(id),
    queryFn: async ({ signal }) => {
      const { data, error } = await api.GET('/exam-definitions/{id}', {
        params: { path: { id: id as string } },
        signal,
      });
      if (error) {
        throw new Error(problemMessage(error, 'Failed to load exam definition'));
      }
      return data;
    },
  });
}

/**
 * Create an exam definition. `POST /exam-definitions`. The server applies spec
 * defaults for any omitted field. Invalidates the owning subject's list.
 */
export function useCreateExamDefinition(): UseMutationResult<
  ExamDefinition,
  Error,
  CreateExamDefinition
> {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  return useMutation({
    mutationFn: async (body: CreateExamDefinition) => {
      const { data, error } = await api.POST('/exam-definitions', { body });
      if (error) {
        throw new Error(
          problemMessage(error, 'Failed to create exam definition'),
        );
      }
      return data;
    },
    onSuccess: (examDef) => {
      void queryClient.invalidateQueries({
        queryKey: examDefinitionKeys.lists(examDef.subjectId),
      });
    },
    onError: (error) => {
      toast(error.message, { variant: 'danger' });
    },
  });
}

/** Variables for updating an exam definition: id, subjectId, and changed fields. */
export interface UpdateExamDefinitionVars {
  id: string;
  subjectId: string;
  changes: Partial<ExamDefinition>;
}

/**
 * Update an exam definition. `PUT /exam-definitions/{id}`. Invalidates the
 * subject's list and refreshes the cached detail.
 */
export function useUpdateExamDefinition(): UseMutationResult<
  ExamDefinition,
  Error,
  UpdateExamDefinitionVars
> {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  return useMutation({
    mutationFn: async ({ id, changes }: UpdateExamDefinitionVars) => {
      // The contract's PUT body is the ExamDefinition shape; the server treats
      // it as a partial merge, so we forward the changed fields (plus id).
      const { data, error } = await api.PUT('/exam-definitions/{id}', {
        params: { path: { id } },
        body: { ...changes, id } as ExamDefinition,
      });
      if (error) {
        throw new Error(
          problemMessage(error, 'Failed to update exam definition'),
        );
      }
      return data;
    },
    onSuccess: (examDef) => {
      void queryClient.invalidateQueries({
        queryKey: examDefinitionKeys.lists(examDef.subjectId),
      });
      queryClient.setQueryData(
        examDefinitionKeys.detail(examDef.id),
        examDef,
      );
    },
    onError: (error) => {
      toast(error.message, { variant: 'danger' });
    },
  });
}

/** Variables for deleting an exam definition: its id plus its subjectId. */
export interface DeleteExamDefinitionVars {
  id: string;
  subjectId: string;
}

/**
 * Delete an exam definition. `DELETE /exam-definitions/{id}`. Invalidates the
 * subject's list and drops the cached detail.
 */
export function useDeleteExamDefinition(): UseMutationResult<
  DeleteExamDefinitionVars,
  Error,
  DeleteExamDefinitionVars
> {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  return useMutation({
    mutationFn: async (vars: DeleteExamDefinitionVars) => {
      const { error } = await api.DELETE('/exam-definitions/{id}', {
        params: { path: { id: vars.id } },
      });
      if (error) {
        throw new Error(
          problemMessage(error, 'Failed to delete exam definition'),
        );
      }
      return vars;
    },
    onSuccess: ({ id, subjectId }) => {
      void queryClient.invalidateQueries({
        queryKey: examDefinitionKeys.lists(subjectId),
      });
      queryClient.removeQueries({ queryKey: examDefinitionKeys.detail(id) });
    },
    onError: (error) => {
      toast(error.message, { variant: 'danger' });
    },
  });
}
