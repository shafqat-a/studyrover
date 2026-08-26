// useLessons
//
// TanStack Query hooks for the class-lesson resource (tag `lessons`), typed
// end-to-end against the frozen OpenAPI contract via the shared openapi-fetch
// client. A lesson is one Markdown body per topic plus a list of enrichment
// resources (YouTube videos, Wikipedia articles, plain links).
//
// Semantics the hooks rely on (see contracts/openapi.yaml):
//   - `GET /subjects/{id}/lessons` returns every lesson for a parent session
//     and only `published` lessons for a student session.
//   - `POST /lessons/{id}/generate` is synchronous (like study guides) and
//     replaces the body; resources are kept.
//   - `POST /lessons/{id}/enrich` is async: it answers 202 with a Job whose
//     `result` is an EnrichResult once `ready`. Pages poll it with `useJob`
//     and refetch the lesson when it completes.
//   - `POST /lessons/{id}/resources` answers 409 when the URL is already
//     attached; that case is surfaced as a friendly "Already attached" toast.
//
// Query keys are centralized in `lessonKeys` so the mutations invalidate the
// subject list + the lesson detail precisely. On error we surface a toast using
// the RFC 7807 Problem body (C11).

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

type Lesson = components['schemas']['Lesson'];
type LessonResource = components['schemas']['LessonResource'];
type CreateLesson = components['schemas']['CreateLesson'];
type UpdateLesson = components['schemas']['UpdateLesson'];
type GenerateLessonRequest = components['schemas']['GenerateLessonRequest'];
type EnrichLessonRequest = components['schemas']['EnrichLessonRequest'];
type AddLessonResource = components['schemas']['AddLessonResource'];
type Job = components['schemas']['Job'];
type Problem = components['schemas']['Problem'];

/** The `result` payload of an `enrich` job. */
export type EnrichResult = components['schemas']['EnrichResult'];

/** Stable query keys for the Lesson resource. */
export const lessonKeys = {
  all: ['lessons'] as const,
  lists: () => [...lessonKeys.all, 'list'] as const,
  /** The subject's lesson list (the invalidation target for a subject). */
  list: (subjectId: string) => [...lessonKeys.lists(), subjectId] as const,
  details: () => [...lessonKeys.all, 'detail'] as const,
  detail: (id: string) => [...lessonKeys.details(), id] as const,
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
 * Error thrown by the lesson hooks. Carries the Problem `status` (when the
 * server returned one) so callers can distinguish e.g. the 409 "already
 * attached" conflict from other failures.
 */
export class LessonError extends Error {
  readonly status: number | undefined;

  constructor(message: string, status?: number) {
    super(message);
    this.name = 'LessonError';
    this.status = status;
  }
}

function toLessonError(
  error: unknown,
  fallback: string,
  response?: Response,
): LessonError {
  const problemStatus =
    error && typeof error === 'object'
      ? (error as Partial<Problem>).status
      : undefined;
  return new LessonError(
    problemMessage(error, fallback),
    problemStatus ?? response?.status,
  );
}

/** True when `err` is a 409 Conflict from the lesson API. */
export function isLessonConflictError(err: unknown): boolean {
  return err instanceof LessonError && err.status === 409;
}

/**
 * Read the typed EnrichResult out of a finished `enrich` job. Returns
 * `undefined` while the job is not ready or its result is malformed.
 */
export function enrichResultOf(job: Job | undefined): EnrichResult | undefined {
  if (!job || job.status !== 'ready' || !job.result) return undefined;
  const r = job.result as Partial<EnrichResult>;
  if (typeof r.added !== 'number') return undefined;
  return {
    lessonId: typeof r.lessonId === 'string' ? r.lessonId : '',
    added: r.added,
    youtube: typeof r.youtube === 'number' ? r.youtube : 0,
    wikipedia: typeof r.wikipedia === 'number' ? r.wikipedia : 0,
    warnings: Array.isArray(r.warnings)
      ? r.warnings.filter((w): w is string => typeof w === 'string')
      : [],
  };
}

/**
 * List a subject's lessons (one per topic, in topic order).
 * `GET /subjects/{id}/lessons`. Students only receive published lessons.
 * Disabled until a `subjectId` is provided.
 */
export function useLessons(
  subjectId: string | undefined,
): UseQueryResult<Lesson[], Error> {
  return useQuery({
    queryKey: lessonKeys.list(subjectId ?? ''),
    enabled: Boolean(subjectId),
    queryFn: async ({ signal }) => {
      const { data, error, response } = await api.GET(
        '/subjects/{id}/lessons',
        { params: { path: { id: subjectId as string } }, signal },
      );
      if (error) {
        throw toLessonError(error, 'Failed to load lessons', response);
      }
      return data;
    },
  });
}

/** Fetch a single lesson with its resources. `GET /lessons/{id}`. */
export function useLesson(
  lessonId: string | undefined,
): UseQueryResult<Lesson, Error> {
  return useQuery({
    queryKey: lessonKeys.detail(lessonId ?? ''),
    enabled: Boolean(lessonId),
    queryFn: async ({ signal }) => {
      const { data, error, response } = await api.GET('/lessons/{id}', {
        params: { path: { id: lessonId as string } },
        signal,
      });
      if (error) {
        throw toLessonError(error, 'Failed to load lesson', response);
      }
      return data;
    },
  });
}

/** Seed the detail cache and invalidate the subject list + detail. */
function settleLesson(
  queryClient: ReturnType<typeof useQueryClient>,
  lesson: Lesson,
): void {
  queryClient.setQueryData(lessonKeys.detail(lesson.id), lesson);
  void queryClient.invalidateQueries({
    queryKey: lessonKeys.list(lesson.subjectId),
  });
  void queryClient.invalidateQueries({
    queryKey: lessonKeys.detail(lesson.id),
  });
}

/**
 * Create a lesson for a topic, optionally generating the body with the AI
 * knowledge backend (synchronous — may take a while). `POST /subjects/{id}/lessons`.
 * Answers 409 when the topic already has a lesson.
 */
export function useCreateLesson(
  subjectId: string | undefined,
): UseMutationResult<Lesson, Error, CreateLesson> {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  return useMutation({
    mutationFn: async (body: CreateLesson) => {
      if (!subjectId) {
        throw new LessonError('No subject selected');
      }
      const { data, error, response } = await api.POST(
        '/subjects/{id}/lessons',
        { params: { path: { id: subjectId } }, body },
      );
      if (error) {
        throw toLessonError(error, 'Failed to create lesson', response);
      }
      return data;
    },
    onSuccess: (lesson) => settleLesson(queryClient, lesson),
    onError: (error) => {
      toast(error.message, { variant: 'danger' });
    },
  });
}

/** Variables for updating a lesson: its id plus the changed fields. */
export interface UpdateLessonVars {
  id: string;
  changes: UpdateLesson;
}

/** Update a lesson's title / body / status (partial). `PUT /lessons/{id}`. */
export function useUpdateLesson(): UseMutationResult<
  Lesson,
  Error,
  UpdateLessonVars
> {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  return useMutation({
    mutationFn: async ({ id, changes }: UpdateLessonVars) => {
      const { data, error, response } = await api.PUT('/lessons/{id}', {
        params: { path: { id } },
        body: changes,
      });
      if (error) {
        throw toLessonError(error, 'Failed to save lesson', response);
      }
      return data;
    },
    onSuccess: (lesson) => settleLesson(queryClient, lesson),
    onError: (error) => {
      toast(error.message, { variant: 'danger' });
    },
  });
}

/** Variables for deleting a lesson: id plus owning subjectId for invalidation. */
export interface DeleteLessonVars {
  id: string;
  subjectId: string;
}

/** Delete a lesson and its resources. `DELETE /lessons/{id}`. */
export function useDeleteLesson(): UseMutationResult<
  DeleteLessonVars,
  Error,
  DeleteLessonVars
> {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  return useMutation({
    mutationFn: async (vars: DeleteLessonVars) => {
      const { error, response } = await api.DELETE('/lessons/{id}', {
        params: { path: { id: vars.id } },
      });
      if (error) {
        throw toLessonError(error, 'Failed to delete lesson', response);
      }
      return vars;
    },
    onSuccess: ({ id, subjectId }) => {
      queryClient.removeQueries({ queryKey: lessonKeys.detail(id) });
      void queryClient.invalidateQueries({
        queryKey: lessonKeys.list(subjectId),
      });
    },
    onError: (error) => {
      toast(error.message, { variant: 'danger' });
    },
  });
}

/** Variables for (re)generating a lesson body. */
export interface GenerateLessonVars {
  id: string;
  /** Optional steer for the generator. */
  instructions?: string;
}

/**
 * (Re)generate the lesson body with the AI knowledge backend (synchronous —
 * replaces the body, keeps resources). `POST /lessons/{id}/generate`.
 */
export function useGenerateLesson(): UseMutationResult<
  Lesson,
  Error,
  GenerateLessonVars
> {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  return useMutation({
    mutationFn: async ({ id, instructions }: GenerateLessonVars) => {
      const body: GenerateLessonRequest = {};
      if (instructions && instructions.trim().length > 0) {
        body.instructions = instructions.trim();
      }
      const { data, error, response } = await api.POST(
        '/lessons/{id}/generate',
        { params: { path: { id } }, body },
      );
      if (error) {
        throw toLessonError(error, 'Failed to generate lesson', response);
      }
      return data;
    },
    onSuccess: (lesson) => settleLesson(queryClient, lesson),
    onError: (error) => {
      toast(error.message, { variant: 'danger' });
    },
  });
}

/** Contract defaults for an enrich request (mirrored client-side). */
export const ENRICH_DEFAULTS: EnrichLessonRequest = {
  youtube: true,
  wikipedia: true,
  maxPerKind: 3,
};

/** Variables for enriching a lesson: its id plus the optional options. */
export interface EnrichLessonVars {
  id: string;
  /** Partial options; anything omitted falls back to `ENRICH_DEFAULTS`. */
  options?: Partial<EnrichLessonRequest>;
}

/**
 * Queue an `enrich` job that attaches YouTube videos and Wikipedia articles
 * for the lesson's topic. `POST /lessons/{id}/enrich` → 202 Job. Poll the
 * returned job with `useJob`; when it is `ready`, refetch the lesson and read
 * the summary with `enrichResultOf(job)`.
 */
export function useEnrichLesson(): UseMutationResult<
  Job,
  Error,
  EnrichLessonVars
> {
  const { toast } = useToast();
  return useMutation({
    mutationFn: async ({ id, options }: EnrichLessonVars) => {
      const body: EnrichLessonRequest = { ...ENRICH_DEFAULTS, ...options };
      if (!body.query || body.query.trim().length === 0) {
        delete body.query;
      }
      const { data, error, response } = await api.POST(
        '/lessons/{id}/enrich',
        { params: { path: { id } }, body },
      );
      if (error) {
        throw toLessonError(error, 'Failed to start enrichment', response);
      }
      return data;
    },
    onError: (error) => {
      toast(error.message, { variant: 'danger' });
    },
  });
}

/** Invalidate the lesson detail plus every subject list (a resource change). */
function invalidateLessonViews(
  queryClient: ReturnType<typeof useQueryClient>,
  lessonId: string,
): void {
  void queryClient.invalidateQueries({ queryKey: lessonKeys.detail(lessonId) });
  void queryClient.invalidateQueries({ queryKey: lessonKeys.lists() });
}

/** Variables for attaching a resource by URL. */
export interface AddLessonResourceVars {
  lessonId: string;
  body: AddLessonResource;
}

/**
 * Attach a resource by URL (YouTube / Wikipedia / any link).
 * `POST /lessons/{id}/resources` → 201. A 409 ("already attached") is
 * surfaced as a warning toast rather than an error.
 */
export function useAddLessonResource(): UseMutationResult<
  LessonResource,
  Error,
  AddLessonResourceVars
> {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  return useMutation({
    mutationFn: async ({ lessonId, body }: AddLessonResourceVars) => {
      const { data, error, response } = await api.POST(
        '/lessons/{id}/resources',
        { params: { path: { id: lessonId } }, body },
      );
      if (error) {
        throw toLessonError(error, 'Failed to add resource', response);
      }
      return data;
    },
    onSuccess: (resource) => invalidateLessonViews(queryClient, resource.lessonId),
    onError: (error) => {
      if (isLessonConflictError(error)) {
        toast('Already attached', {
          description: 'That URL is already on this lesson.',
          variant: 'warning',
        });
        return;
      }
      toast(error.message, { variant: 'danger' });
    },
  });
}

/** Variables for detaching a resource. */
export interface DeleteLessonResourceVars {
  lessonId: string;
  resourceId: string;
}

/** Detach a resource. `DELETE /lessons/{id}/resources/{resourceId}`. */
export function useDeleteLessonResource(): UseMutationResult<
  DeleteLessonResourceVars,
  Error,
  DeleteLessonResourceVars
> {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  return useMutation({
    mutationFn: async (vars: DeleteLessonResourceVars) => {
      const { error, response } = await api.DELETE(
        '/lessons/{id}/resources/{resourceId}',
        { params: { path: { id: vars.lessonId, resourceId: vars.resourceId } } },
      );
      if (error) {
        throw toLessonError(error, 'Failed to remove resource', response);
      }
      return vars;
    },
    onSuccess: ({ lessonId }) => invalidateLessonViews(queryClient, lessonId),
    onError: (error) => {
      toast(error.message, { variant: 'danger' });
    },
  });
}
