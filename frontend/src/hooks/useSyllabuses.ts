// useSyllabuses — TanStack Query hooks for the Syllabus resource.
//
// A syllabus is the curriculum grouping above subjects, modelled on an
// education system's class level: "Class V" holds "Math Class V", "Science
// Class V", and so on. Subjects reference a syllabus via `syllabusId`
// (optional), so the Subjects page can group its grid under syllabus headings.
// Everything flows through the shared openapi-fetch client, mirroring H01
// useSubjects; nothing here hand-rolls a fetch or redefines a contract shape.

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

type Syllabus = components['schemas']['Syllabus'];
type CreateSyllabus = components['schemas']['CreateSyllabus'];
type Problem = components['schemas']['Problem'];

/** Stable query keys for the Syllabus resource. */
export const syllabusKeys = {
  all: ['syllabuses'] as const,
  list: () => [...syllabusKeys.all, 'list'] as const,
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

/** List every syllabus, oldest first. `GET /syllabuses`. */
export function useSyllabuses(): UseQueryResult<Syllabus[], Error> {
  return useQuery({
    queryKey: syllabusKeys.list(),
    queryFn: async ({ signal }) => {
      const { data, error } = await api.GET('/syllabuses', { signal });
      if (error) {
        throw new Error(problemMessage(error, 'Failed to load syllabuses'));
      }
      return data;
    },
  });
}

/** Create a syllabus. `POST /syllabuses`. Invalidates the list. */
export function useCreateSyllabus(): UseMutationResult<
  Syllabus,
  Error,
  CreateSyllabus
> {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  return useMutation({
    mutationFn: async (body: CreateSyllabus) => {
      const { data, error } = await api.POST('/syllabuses', { body });
      if (error) {
        throw new Error(problemMessage(error, 'Failed to create syllabus'));
      }
      return data;
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: syllabusKeys.all });
    },
    onError: (error) => {
      toast(error.message, { variant: 'danger' });
    },
  });
}

/** Variables for `useUpdateSyllabus`: the id plus the changed fields. */
export interface UpdateSyllabusVars {
  id: string;
  changes: Partial<Pick<Syllabus, 'name' | 'description'>>;
}

/** Update a syllabus. `PUT /syllabuses/{id}`. Invalidates the list. */
export function useUpdateSyllabus(): UseMutationResult<
  Syllabus,
  Error,
  UpdateSyllabusVars
> {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  return useMutation({
    mutationFn: async ({ id, changes }: UpdateSyllabusVars) => {
      // The contract's PUT body is the Syllabus shape; the server treats it as
      // a partial update (absent fields are left untouched).
      const { data, error } = await api.PUT('/syllabuses/{id}', {
        params: { path: { id } },
        body: { ...changes, id } as Syllabus,
      });
      if (error) {
        throw new Error(problemMessage(error, 'Failed to update syllabus'));
      }
      return data;
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: syllabusKeys.all });
    },
    onError: (error) => {
      toast(error.message, { variant: 'danger' });
    },
  });
}

/**
 * Delete a syllabus. `DELETE /syllabuses/{id}`. Its subjects survive and are
 * un-grouped by the server, so the subject list is invalidated too.
 */
export function useDeleteSyllabus(): UseMutationResult<void, Error, string> {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await api.DELETE('/syllabuses/{id}', {
        params: { path: { id } },
      });
      if (error) {
        throw new Error(problemMessage(error, 'Failed to delete syllabus'));
      }
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: syllabusKeys.all });
      void queryClient.invalidateQueries({ queryKey: ['subjects'] });
    },
    onError: (error) => {
      toast(error.message, { variant: 'danger' });
    },
  });
}
