// H06 — useStudentProfile
//
// TanStack Query hooks for the singleton student profile resource, typed
// end-to-end against the frozen OpenAPI contract via the shared openapi-fetch
// client. The profile is a singleton, so there is a single query key (`['student']`)
// that the update mutation invalidates on success.
//
// On error we surface a toast using the RFC 7807 Problem body returned by the API.

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

type Student = components['schemas']['Student'];
type Problem = components['schemas']['Problem'];

/** Stable query keys for the singleton student profile. */
export const studentKeys = {
  all: ['student'] as const,
  profile: () => [...studentKeys.all] as const,
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

/** Fetch the student profile. `GET /student`. */
export function useStudentProfile(): UseQueryResult<Student, Error> {
  return useQuery({
    queryKey: studentKeys.profile(),
    queryFn: async ({ signal }) => {
      const { data, error } = await api.GET('/student', { signal });
      if (error) {
        throw new Error(problemMessage(error, 'Failed to load student profile'));
      }
      return data;
    },
  });
}

/**
 * Update (partial) the student profile. `PUT /student`. Invalidates `['student']`.
 *
 * The contract's PUT body is the Student shape; the server treats it as a
 * partial merge, so callers may pass only the changed fields.
 */
export function useUpdateStudentProfile(): UseMutationResult<
  Student,
  Error,
  Partial<Student>
> {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  return useMutation({
    mutationFn: async (changes: Partial<Student>) => {
      const { data, error } = await api.PUT('/student', {
        body: changes as Student,
      });
      if (error) {
        throw new Error(
          problemMessage(error, 'Failed to update student profile'),
        );
      }
      return data;
    },
    onSuccess: (student) => {
      queryClient.setQueryData(studentKeys.profile(), student);
      void queryClient.invalidateQueries({ queryKey: studentKeys.all });
    },
    onError: (error) => {
      toast(error.message, { variant: 'danger' });
    },
  });
}
