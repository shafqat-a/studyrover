// H05 — useQuestions
//
// TanStack Query hooks for the Question resource (C05), typed end-to-end against
// the frozen OpenAPI contract via the shared openapi-fetch client. These are the
// parent-facing (authoring) hooks, so they work with the full `Question` shape
// (including the answer key); the student-facing `DeliveredQuestion` is never
// touched here. Queries and mutations all flow through `api` so requests and
// responses are checked against the generated schema.
//
// Query keys are stable and centralized in `questionKeys` so mutations can
// invalidate precisely (the list is keyed by subject). On error we surface a
// toast using the RFC 7807 Problem body returned by the API (see C11).

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

type Question = components['schemas']['Question'];
type CreateQuestion = components['schemas']['CreateQuestion'];
type PageOfQuestion = components['schemas']['PageOfQuestion'];
type Problem = components['schemas']['Problem'];

/** Optional pagination for the question list. */
export interface UseQuestionsParams {
  page?: number;
  pageSize?: number;
}

/** Stable query keys for the Question resource, keyed by subject. */
export const questionKeys = {
  all: ['questions'] as const,
  lists: () => [...questionKeys.all, 'list'] as const,
  list: (subjectId: string, topicId?: string, params: UseQuestionsParams = {}) =>
    [...questionKeys.lists(), subjectId, topicId ?? null, params] as const,
  details: () => [...questionKeys.all, 'detail'] as const,
  detail: (id: string) => [...questionKeys.details(), id] as const,
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
 * List questions for a subject (optionally filtered to a topic), paginated.
 * `GET /questions`. The query is disabled until a `subjectId` is provided.
 */
export function useQuestions(
  subjectId: string | undefined,
  topicId?: string,
  params: UseQuestionsParams = {},
): UseQueryResult<PageOfQuestion, Error> {
  return useQuery({
    queryKey: questionKeys.list(subjectId ?? '', topicId, params),
    enabled: Boolean(subjectId),
    queryFn: async ({ signal }) => {
      const { data, error } = await api.GET('/questions', {
        params: {
          query: {
            subjectId: subjectId as string,
            topicId,
            page: params.page,
            pageSize: params.pageSize,
          },
        },
        signal,
      });
      if (error) {
        throw new Error(problemMessage(error, 'Failed to load questions'));
      }
      return data;
    },
  });
}

/** Fetch a single question by id. `GET /questions/{id}`. */
export function useQuestion(
  id: string | undefined,
): UseQueryResult<Question, Error> {
  return useQuery({
    queryKey: questionKeys.detail(id ?? ''),
    enabled: Boolean(id),
    queryFn: async ({ signal }) => {
      const { data, error } = await api.GET('/questions/{id}', {
        params: { path: { id: id as string } },
        signal,
      });
      if (error) {
        throw new Error(problemMessage(error, 'Failed to load question'));
      }
      return data;
    },
  });
}

/** Create a question. `POST /questions`. Invalidates the question lists. */
export function useCreateQuestion(): UseMutationResult<
  Question,
  Error,
  CreateQuestion
> {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  return useMutation({
    mutationFn: async (body: CreateQuestion) => {
      const { data, error } = await api.POST('/questions', { body });
      if (error) {
        throw new Error(problemMessage(error, 'Failed to create question'));
      }
      return data;
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: questionKeys.all });
    },
    onError: (error) => {
      toast(error.message, { variant: 'danger' });
    },
  });
}

/** Variables for updating a question: full id plus the changed fields. */
export interface UpdateQuestionVars {
  id: string;
  changes: Partial<Question>;
}

/** Update a question (partial). `PUT /questions/{id}`. Invalidates list + detail. */
export function useUpdateQuestion(): UseMutationResult<
  Question,
  Error,
  UpdateQuestionVars
> {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  return useMutation({
    mutationFn: async ({ id, changes }: UpdateQuestionVars) => {
      // The contract's PUT body is the Question shape; the server treats it as a
      // partial merge, so we forward only the changed fields (plus id).
      const { data, error } = await api.PUT('/questions/{id}', {
        params: { path: { id } },
        body: { ...changes, id } as Question,
      });
      if (error) {
        throw new Error(problemMessage(error, 'Failed to update question'));
      }
      return data;
    },
    onSuccess: (question) => {
      void queryClient.invalidateQueries({ queryKey: questionKeys.lists() });
      queryClient.setQueryData(questionKeys.detail(question.id), question);
    },
    onError: (error) => {
      toast(error.message, { variant: 'danger' });
    },
  });
}

/** Delete a question. `DELETE /questions/{id}`. Invalidates list + detail. */
export function useDeleteQuestion(): UseMutationResult<string, Error, string> {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await api.DELETE('/questions/{id}', {
        params: { path: { id } },
      });
      if (error) {
        throw new Error(problemMessage(error, 'Failed to delete question'));
      }
      return id;
    },
    onSuccess: (id) => {
      void queryClient.invalidateQueries({ queryKey: questionKeys.lists() });
      queryClient.removeQueries({ queryKey: questionKeys.detail(id) });
    },
    onError: (error) => {
      toast(error.message, { variant: 'danger' });
    },
  });
}
