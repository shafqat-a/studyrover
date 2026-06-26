// H07 — useSettings
//
// TanStack Query hooks for the Settings singleton (C-settings), typed end-to-end
// against the frozen OpenAPI contract via the shared openapi-fetch client. The
// query and mutation flow through `api` so requests/responses are checked
// against the generated schema; nothing here hand-rolls a fetch or redefines a
// shape.
//
// Query keys are centralized in `settingsKeys` so the mutation can invalidate
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

type Settings = components['schemas']['Settings'];
type Problem = components['schemas']['Problem'];

/** Stable query keys for the Settings singleton. */
export const settingsKeys = {
  all: ['settings'] as const,
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

/** Fetch the application settings singleton. `GET /settings`. */
export function useSettings(): UseQueryResult<Settings, Error> {
  return useQuery({
    queryKey: settingsKeys.all,
    queryFn: async ({ signal }) => {
      const { data, error } = await api.GET('/settings', { signal });
      if (error) {
        throw new Error(problemMessage(error, 'Failed to load settings'));
      }
      return data;
    },
  });
}

/**
 * Update the application settings singleton. `PUT /settings`. The contract's PUT
 * body is the full Settings shape; the server treats it as a partial merge, so
 * callers may forward only the changed fields. Invalidates the cached settings.
 */
export function useUpdateSettings(): UseMutationResult<
  Settings,
  Error,
  Partial<Settings>
> {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  return useMutation({
    mutationFn: async (changes: Partial<Settings>) => {
      const { data, error } = await api.PUT('/settings', {
        body: changes as Settings,
      });
      if (error) {
        throw new Error(problemMessage(error, 'Failed to update settings'));
      }
      return data;
    },
    onSuccess: (settings) => {
      queryClient.setQueryData(settingsKeys.all, settings);
      void queryClient.invalidateQueries({ queryKey: settingsKeys.all });
    },
    onError: (error) => {
      toast(error.message, { variant: 'danger' });
    },
  });
}
