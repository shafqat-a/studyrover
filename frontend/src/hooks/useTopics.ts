// H03 — useTopics
//
// TanStack Query hooks for the Topic resource (C03), typed end-to-end against
// the frozen OpenAPI contract via the shared openapi-fetch client. Topics are
// scoped to a subject and ordered within it (`order`), so queries and cache
// invalidation key off `subjectId`. Everything flows through `api` so
// payloads/responses are checked against the generated schema; nothing here
// hand-rolls a fetch or redefines a shape.
//
// Query keys are stable and centralized in `topicKeys` so mutations can
// invalidate exactly one subject's topic list. Reorder is expressed as a batch
// of partial updates (one per moved topic's `order`). On error we surface a
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

type Topic = components['schemas']['Topic'];
type CreateTopic = components['schemas']['CreateTopic'];
type PageOfTopic = components['schemas']['PageOfTopic'];
type Problem = components['schemas']['Problem'];

/** Optional pagination for the topic list (always scoped by subject). */
export interface UseTopicsParams {
  page?: number;
  pageSize?: number;
}

/** Stable query keys for the Topic resource, scoped by subject. */
export const topicKeys = {
  all: ['topics'] as const,
  /** All list queries for a given subject (the invalidation target). */
  lists: (subjectId: string) => [...topicKeys.all, subjectId] as const,
  /** A specific paginated list query for a subject. */
  list: (subjectId: string, params: UseTopicsParams) =>
    [...topicKeys.lists(subjectId), 'list', params] as const,
  details: () => [...topicKeys.all, 'detail'] as const,
  detail: (id: string) => [...topicKeys.details(), id] as const,
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
 * List the topics for a single subject (paginated). `GET /topics?subjectId=...`.
 * Disabled until a `subjectId` is provided.
 */
export function useTopics(
  subjectId: string | undefined,
  params: UseTopicsParams = {},
): UseQueryResult<PageOfTopic, Error> {
  return useQuery({
    queryKey: topicKeys.list(subjectId ?? '', params),
    enabled: Boolean(subjectId),
    queryFn: async ({ signal }) => {
      const { data, error } = await api.GET('/topics', {
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
        throw new Error(problemMessage(error, 'Failed to load topics'));
      }
      return data;
    },
  });
}

/** Fetch a single topic by id. `GET /topics/{id}`. */
export function useTopic(id: string | undefined): UseQueryResult<Topic, Error> {
  return useQuery({
    queryKey: topicKeys.detail(id ?? ''),
    enabled: Boolean(id),
    queryFn: async ({ signal }) => {
      const { data, error } = await api.GET('/topics/{id}', {
        params: { path: { id: id as string } },
        signal,
      });
      if (error) {
        throw new Error(problemMessage(error, 'Failed to load topic'));
      }
      return data;
    },
  });
}

/**
 * Create a topic. `POST /topics`. Invalidates the owning subject's topic list
 * (keyed by the created topic's `subjectId`).
 */
export function useCreateTopic(): UseMutationResult<Topic, Error, CreateTopic> {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  return useMutation({
    mutationFn: async (body: CreateTopic) => {
      const { data, error } = await api.POST('/topics', { body });
      if (error) {
        throw new Error(problemMessage(error, 'Failed to create topic'));
      }
      return data;
    },
    onSuccess: (topic) => {
      void queryClient.invalidateQueries({
        queryKey: topicKeys.lists(topic.subjectId),
      });
    },
    onError: (error) => {
      toast(error.message, { variant: 'danger' });
    },
  });
}

/** Variables for updating a topic: id, owning subjectId, and changed fields. */
export interface UpdateTopicVars {
  id: string;
  subjectId: string;
  changes: Partial<Topic>;
}

/** Update a topic. `PUT /topics/{id}`. Invalidates list + refreshes detail. */
export function useUpdateTopic(): UseMutationResult<
  Topic,
  Error,
  UpdateTopicVars
> {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  return useMutation({
    mutationFn: async ({ id, changes }: UpdateTopicVars) => {
      // The contract's PUT body is the Topic shape; the server treats it as a
      // partial merge, so we forward only the changed fields (plus id).
      const { data, error } = await api.PUT('/topics/{id}', {
        params: { path: { id } },
        body: { ...changes, id } as Topic,
      });
      if (error) {
        throw new Error(problemMessage(error, 'Failed to update topic'));
      }
      return data;
    },
    onSuccess: (topic) => {
      void queryClient.invalidateQueries({
        queryKey: topicKeys.lists(topic.subjectId),
      });
      queryClient.setQueryData(topicKeys.detail(topic.id), topic);
    },
    onError: (error) => {
      toast(error.message, { variant: 'danger' });
    },
  });
}

/** Variables for deleting a topic: id plus owning subjectId for invalidation. */
export interface DeleteTopicVars {
  id: string;
  subjectId: string;
}

/** Delete a topic. `DELETE /topics/{id}`. Invalidates list + drops detail. */
export function useDeleteTopic(): UseMutationResult<
  DeleteTopicVars,
  Error,
  DeleteTopicVars
> {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  return useMutation({
    mutationFn: async (vars: DeleteTopicVars) => {
      const { error } = await api.DELETE('/topics/{id}', {
        params: { path: { id: vars.id } },
      });
      if (error) {
        throw new Error(problemMessage(error, 'Failed to delete topic'));
      }
      return vars;
    },
    onSuccess: ({ id, subjectId }) => {
      void queryClient.invalidateQueries({
        queryKey: topicKeys.lists(subjectId),
      });
      queryClient.removeQueries({ queryKey: topicKeys.detail(id) });
    },
    onError: (error) => {
      toast(error.message, { variant: 'danger' });
    },
  });
}

/** A single topic's new syllabus position. */
export interface TopicOrder {
  id: string;
  order: number;
}

/** Variables for reordering a subject's topics. */
export interface ReorderTopicsVars {
  subjectId: string;
  /** The topics whose `order` changed, with their new positions. */
  orders: TopicOrder[];
}

/**
 * Reorder topics within a subject. Persists each changed `order` via
 * `PUT /topics/{id}` (the contract has no batch endpoint), then invalidates the
 * subject's topic list once. Requests run in parallel; the first failure
 * surfaces.
 */
export function useReorderTopics(): UseMutationResult<
  ReorderTopicsVars,
  Error,
  ReorderTopicsVars
> {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  return useMutation({
    mutationFn: async (vars: ReorderTopicsVars) => {
      await Promise.all(
        vars.orders.map(async ({ id, order }) => {
          const { error } = await api.PUT('/topics/{id}', {
            params: { path: { id } },
            body: { id, order } as Topic,
          });
          if (error) {
            throw new Error(problemMessage(error, 'Failed to reorder topics'));
          }
        }),
      );
      return vars;
    },
    onSuccess: ({ subjectId }) => {
      void queryClient.invalidateQueries({
        queryKey: topicKeys.lists(subjectId),
      });
    },
    onError: (error) => {
      toast(error.message, { variant: 'danger' });
    },
  });
}
