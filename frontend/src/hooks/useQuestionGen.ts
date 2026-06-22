// H05 — useQuestionGen / useQuestionDrafts
//
// TanStack Query hooks for AI question generation and the draft review flow,
// typed end-to-end against the frozen OpenAPI contract via the shared
// openapi-fetch client. Everything flows through `api` so requests/responses are
// checked against the generated schema; nothing here hand-rolls a fetch.
//
// Generation is async (2-A09): `useGenerateQuestions` enqueues a job and returns
// the Job descriptor (clients poll GET /jobs/{id} for completion, after which the
// draft list is invalidated and re-fetched). Drafts are listed via
// `useQuestionDrafts` (2-A10); approving a draft (`useApproveDraft`) mints a real
// Question and so invalidates the live `['questions']` bank as well as the draft
// list, while rejecting (`useRejectDraft`) just refreshes the drafts.
//
// Query keys are centralized in `questionDraftKeys` so mutations can invalidate
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

type Job = components['schemas']['Job'];
type GenRequest = components['schemas']['GenRequest'];
type QuestionDraft = components['schemas']['QuestionDraft'];
type PageOfQuestionDraft = components['schemas']['PageOfQuestionDraft'];
type Question = components['schemas']['Question'];
type Problem = components['schemas']['Problem'];

/** The live question bank's query-key root, invalidated when a draft is approved. */
const questionsRoot = ['questions'] as const;

/** Optional pagination for the draft list. */
export interface UseQuestionDraftsParams {
  topicId?: string;
  page?: number;
  pageSize?: number;
}

/** Stable query keys for the QuestionDraft resource, scoped by subject. */
export const questionDraftKeys = {
  all: ['question-drafts'] as const,
  /** All list queries for a given subject. */
  lists: (subjectId: string) =>
    [...questionDraftKeys.all, subjectId] as const,
  /** A specific paginated list query for a subject. */
  list: (subjectId: string, params: UseQuestionDraftsParams) =>
    [...questionDraftKeys.lists(subjectId), 'list', params] as const,
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

/** Variables for kicking off question generation. */
export interface GenerateQuestionsVars {
  topicId?: string;
  count: number;
}

/**
 * Kick off async generation of question drafts for a subject.
 * `POST /questions/generate`. Returns the enqueued Job; once it reaches `ready`
 * the caller should refetch the drafts (the draft list is invalidated on
 * success so a poll that lands here re-reads). Disabled inputs are validated by
 * the caller — `subjectId` is bound at hook construction.
 */
export function useGenerateQuestions(
  subjectId: string,
): UseMutationResult<Job, Error, GenerateQuestionsVars> {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  return useMutation({
    mutationFn: async ({ topicId, count }: GenerateQuestionsVars) => {
      const body: GenRequest = { subjectId, topicId, count };
      const { data, error } = await api.POST('/questions/generate', { body });
      if (error) {
        throw new Error(
          problemMessage(error, 'Failed to start question generation'),
        );
      }
      return data;
    },
    onSuccess: () => {
      // The job runs asynchronously; invalidate the draft list so that once the
      // worker finishes and the list query refetches, the new drafts appear.
      void queryClient.invalidateQueries({
        queryKey: questionDraftKeys.lists(subjectId),
      });
    },
    onError: (error) => {
      toast(error.message, { variant: 'danger' });
    },
  });
}

/**
 * List generated question drafts awaiting review for a subject (paginated),
 * optionally scoped to a topic. `GET /questions/drafts?subjectId=...`.
 * Disabled until a `subjectId` is provided.
 */
export function useQuestionDrafts(
  subjectId: string | undefined,
  params: UseQuestionDraftsParams = {},
): UseQueryResult<PageOfQuestionDraft, Error> {
  return useQuery({
    queryKey: questionDraftKeys.list(subjectId ?? '', params),
    enabled: Boolean(subjectId),
    queryFn: async ({ signal }) => {
      const { data, error } = await api.GET('/questions/drafts', {
        params: {
          query: {
            subjectId: subjectId as string,
            topicId: params.topicId,
            page: params.page,
            pageSize: params.pageSize,
          },
        },
        signal,
      });
      if (error) {
        throw new Error(problemMessage(error, 'Failed to load question drafts'));
      }
      return data;
    },
  });
}

/**
 * Variables for approving a draft: the draft `id` plus its `subjectId` so we can
 * invalidate the correct subject-scoped draft list without an extra fetch.
 */
export interface ApproveDraftVars {
  id: string;
  subjectId: string;
}

/**
 * Approve a pending draft into the live question bank.
 * `POST /questions/drafts/{id}/approve`. Returns the created Question and
 * invalidates both the subject's draft list (the draft leaves `pending`) and the
 * live `['questions']` bank so the new question shows up.
 */
export function useApproveDraft(): UseMutationResult<
  Question,
  Error,
  ApproveDraftVars
> {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  return useMutation({
    mutationFn: async ({ id }: ApproveDraftVars) => {
      const { data, error } = await api.POST('/questions/drafts/{id}/approve', {
        params: { path: { id } },
      });
      if (error) {
        throw new Error(problemMessage(error, 'Failed to approve draft'));
      }
      return data;
    },
    onSuccess: (_question, { subjectId }) => {
      void queryClient.invalidateQueries({
        queryKey: questionDraftKeys.lists(subjectId),
      });
      void queryClient.invalidateQueries({ queryKey: questionsRoot });
    },
    onError: (error) => {
      toast(error.message, { variant: 'danger' });
    },
  });
}

/**
 * Variables for rejecting a draft: the draft `id` plus its `subjectId` so we can
 * invalidate the correct subject-scoped draft list.
 */
export interface RejectDraftVars {
  id: string;
  subjectId: string;
}

/**
 * Reject a pending draft so it never enters the live bank.
 * `POST /questions/drafts/{id}/reject`. Returns the rejected draft and
 * invalidates the subject's draft list.
 */
export function useRejectDraft(): UseMutationResult<
  QuestionDraft,
  Error,
  RejectDraftVars
> {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  return useMutation({
    mutationFn: async ({ id }: RejectDraftVars) => {
      const { data, error } = await api.POST('/questions/drafts/{id}/reject', {
        params: { path: { id } },
      });
      if (error) {
        throw new Error(problemMessage(error, 'Failed to reject draft'));
      }
      return data;
    },
    onSuccess: (_draft, { subjectId }) => {
      void queryClient.invalidateQueries({
        queryKey: questionDraftKeys.lists(subjectId),
      });
    },
    onError: (error) => {
      toast(error.message, { variant: 'danger' });
    },
  });
}
