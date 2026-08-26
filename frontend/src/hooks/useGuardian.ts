// 3-H01..3-H06 — useGuardian
//
// TanStack Query hooks for the Phase-3 Guardian (Reward Engine + Network Wall),
// typed end-to-end against the frozen OpenAPI contract via the shared
// openapi-fetch client. Every request flows through `api` so payloads and
// responses are checked against the generated schema; nothing here hand-rolls
// a fetch or redefines a shape.
//
// Semantics the hooks rely on (see contracts/openapi.yaml, tag `guardian`):
//   - All /guardian/* endpoints need a parent session, except
//     GET /guardian/earned-time?studentId= which a student may call for their
//     own id.
//   - When the Guardian is not wired into the server (GUARDIAN_ENABLED unset):
//     GET /guardian/status and GET /guardian/earned-time still answer 200 with
//     `enabled:false`; every other endpoint answers 409 Problem. Pages use
//     `isGuardianDisabledError` to render the "not enabled" state instead of a
//     generic error.
//   - `remainingSeconds` is a snapshot. Consumers tick it down locally and the
//     queries refetch on an interval to re-sync.
//
// Query keys are centralized in `guardianKeys` so the mutations invalidate
// precisely. On error we surface a toast using the RFC 7807 Problem body (C11).

import {
  useMutation,
  useQuery,
  useQueryClient,
  type UseMutationResult,
  type UseQueryOptions,
  type UseQueryResult,
} from '@tanstack/react-query';

import { api } from '../api/client';
import type { components } from '../api/schema';
import { useToast } from '../app/providers';

type GuardianStatus = components['schemas']['GuardianStatus'];
type GuardianPolicy = components['schemas']['GuardianPolicy'];
type UpdateGuardianPolicy = components['schemas']['UpdateGuardianPolicy'];
type GuardianDevice = components['schemas']['GuardianDevice'];
type CreateGuardianDevice = components['schemas']['CreateGuardianDevice'];
type UpdateGuardianDevice = components['schemas']['UpdateGuardianDevice'];
type DiscoveredDevice = components['schemas']['DiscoveredDevice'];
type GuardianGrant = components['schemas']['GuardianGrant'];
type ManualGrant = components['schemas']['ManualGrant'];
type GuardianOverrideLog = components['schemas']['GuardianOverrideLog'];
type EarnedTime = components['schemas']['EarnedTime'];
type Problem = components['schemas']['Problem'];

/** Stable query keys for the Guardian resources. */
export const guardianKeys = {
  all: ['guardian'] as const,
  status: () => [...guardianKeys.all, 'status'] as const,
  policy: () => [...guardianKeys.all, 'policy'] as const,
  devices: () => [...guardianKeys.all, 'devices'] as const,
  sessions: () => [...guardianKeys.all, 'sessions'] as const,
  overrideLog: () => [...guardianKeys.all, 'override-log'] as const,
  earnedTime: (studentId: string) =>
    [...guardianKeys.all, 'earned-time', studentId] as const,
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
 * Error thrown by the Guardian hooks. Carries the Problem `status` (when the
 * server returned one) so callers can distinguish the "Guardian is not
 * enabled on this server" 409 from other failures.
 */
export class GuardianError extends Error {
  readonly status: number | undefined;

  constructor(message: string, status?: number) {
    super(message);
    this.name = 'GuardianError';
    this.status = status;
  }
}

function toGuardianError(error: unknown, fallback: string): GuardianError {
  const status =
    error && typeof error === 'object'
      ? (error as Partial<Problem>).status
      : undefined;
  return new GuardianError(problemMessage(error, fallback), status);
}

const DISABLED_PATTERN = /guardian is not enabled/i;

/**
 * True when `err` is the 409 Problem the server returns for every Guardian
 * endpoint while `GUARDIAN_ENABLED` is unset ("Guardian is not enabled on
 * this server"). Pages render the "not enabled" empty state for this case
 * instead of a generic error.
 */
export function isGuardianDisabledError(err: unknown): boolean {
  if (err instanceof GuardianError) {
    return err.status === 409 && DISABLED_PATTERN.test(err.message);
  }
  if (err instanceof Error) {
    return DISABLED_PATTERN.test(err.message);
  }
  if (err && typeof err === 'object') {
    const problem = err as Partial<Problem>;
    return (
      problem.status === 409 &&
      DISABLED_PATTERN.test(`${problem.detail ?? ''} ${problem.title ?? ''}`)
    );
  }
  return false;
}

/** Refetch cadence for the live status/session views (ms). */
const LIVE_REFETCH_MS = 15_000;

/**
 * Guardian status — enabled/paused flags, wall health, active grants, recent
 * grants, per-student daily usage, and the registered devices.
 * `GET /guardian/status`. Answers 200 with `enabled:false` when the Guardian is
 * not wired in, so this never throws for a disabled server. Refetches every
 * 15s so countdowns re-sync.
 */
export function useGuardianStatus(): UseQueryResult<GuardianStatus, Error> {
  return useQuery({
    queryKey: guardianKeys.status(),
    refetchInterval: LIVE_REFETCH_MS,
    queryFn: async ({ signal }) => {
      const { data, error } = await api.GET('/guardian/status', { signal });
      if (error) {
        throw toGuardianError(error, 'Failed to load Guardian status');
      }
      return data;
    },
  });
}

/** The effective reward policy. `GET /guardian/policy`. 409 when disabled. */
export function useGuardianPolicy(): UseQueryResult<GuardianPolicy, Error> {
  return useQuery({
    queryKey: guardianKeys.policy(),
    retry: (count, error) => !isGuardianDisabledError(error) && count < 3,
    queryFn: async ({ signal }) => {
      const { data, error } = await api.GET('/guardian/policy', { signal });
      if (error) {
        throw toGuardianError(error, 'Failed to load reward policy');
      }
      return data;
    },
  });
}

/**
 * Update the reward policy (partial). `PUT /guardian/policy`. Seeds the policy
 * cache and invalidates status (the parent switch feeds `paused`).
 */
export function useUpdateGuardianPolicy(): UseMutationResult<
  GuardianPolicy,
  Error,
  UpdateGuardianPolicy
> {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  return useMutation({
    mutationFn: async (body: UpdateGuardianPolicy) => {
      const { data, error } = await api.PUT('/guardian/policy', { body });
      if (error) {
        throw toGuardianError(error, 'Failed to update reward policy');
      }
      return data;
    },
    onSuccess: (policy) => {
      queryClient.setQueryData(guardianKeys.policy(), policy);
      void queryClient.invalidateQueries({ queryKey: guardianKeys.policy() });
      void queryClient.invalidateQueries({ queryKey: guardianKeys.status() });
    },
    onError: (error) => {
      toast(error.message, { variant: 'danger' });
    },
  });
}

/** Registered (gated) devices. `GET /guardian/devices`. 409 when disabled. */
export function useGuardianDevices(): UseQueryResult<GuardianDevice[], Error> {
  return useQuery({
    queryKey: guardianKeys.devices(),
    retry: (count, error) => !isGuardianDisabledError(error) && count < 3,
    queryFn: async ({ signal }) => {
      const { data, error } = await api.GET('/guardian/devices', { signal });
      if (error) {
        throw toGuardianError(error, 'Failed to load devices');
      }
      return data;
    },
  });
}

/** Invalidate everything a device change can affect. */
function invalidateDeviceViews(
  queryClient: ReturnType<typeof useQueryClient>,
): void {
  void queryClient.invalidateQueries({ queryKey: guardianKeys.devices() });
  void queryClient.invalidateQueries({ queryKey: guardianKeys.status() });
  void queryClient.invalidateQueries({ queryKey: guardianKeys.sessions() });
}

/** Register a device by MAC. `POST /guardian/devices`. */
export function useCreateGuardianDevice(): UseMutationResult<
  GuardianDevice,
  Error,
  CreateGuardianDevice
> {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  return useMutation({
    mutationFn: async (body: CreateGuardianDevice) => {
      const { data, error } = await api.POST('/guardian/devices', { body });
      if (error) {
        throw toGuardianError(error, 'Failed to register device');
      }
      return data;
    },
    onSuccess: () => invalidateDeviceViews(queryClient),
    onError: (error) => {
      toast(error.message, { variant: 'danger' });
    },
  });
}

/** Variables for updating a device: its id plus the changed fields. */
export interface UpdateGuardianDeviceVars {
  id: string;
  changes: UpdateGuardianDevice;
}

/** Update a registered device (partial). `PUT /guardian/devices/{id}`. */
export function useUpdateGuardianDevice(): UseMutationResult<
  GuardianDevice,
  Error,
  UpdateGuardianDeviceVars
> {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  return useMutation({
    mutationFn: async ({ id, changes }: UpdateGuardianDeviceVars) => {
      const { data, error } = await api.PUT('/guardian/devices/{id}', {
        params: { path: { id } },
        body: changes,
      });
      if (error) {
        throw toGuardianError(error, 'Failed to update device');
      }
      return data;
    },
    onSuccess: () => invalidateDeviceViews(queryClient),
    onError: (error) => {
      toast(error.message, { variant: 'danger' });
    },
  });
}

/**
 * Unregister a device (revokes any active grant for it).
 * `DELETE /guardian/devices/{id}`.
 */
export function useDeleteGuardianDevice(): UseMutationResult<
  string,
  Error,
  string
> {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await api.DELETE('/guardian/devices/{id}', {
        params: { path: { id } },
      });
      if (error) {
        throw toGuardianError(error, 'Failed to remove device');
      }
      return id;
    },
    onSuccess: () => invalidateDeviceViews(queryClient),
    onError: (error) => {
      toast(error.message, { variant: 'danger' });
    },
  });
}

/**
 * Discover devices currently visible to the wall. `POST /guardian/devices/scan`.
 * Modelled as a mutation because a scan is an on-demand action with
 * side-effects on the wall, not a cached resource.
 */
export function useScanGuardianDevices(): UseMutationResult<
  DiscoveredDevice[],
  Error,
  void
> {
  const { toast } = useToast();
  return useMutation({
    mutationFn: async () => {
      const { data, error } = await api.POST('/guardian/devices/scan');
      if (error) {
        throw toGuardianError(error, 'Network scan failed');
      }
      return data;
    },
    onError: (error) => {
      toast(error.message, { variant: 'danger' });
    },
  });
}

/**
 * Grants currently open on the wall. `GET /guardian/sessions`. 409 when
 * disabled. Refetches every 15s so countdowns re-sync.
 */
export function useGuardianSessions(): UseQueryResult<GuardianGrant[], Error> {
  return useQuery({
    queryKey: guardianKeys.sessions(),
    refetchInterval: LIVE_REFETCH_MS,
    retry: (count, error) => !isGuardianDisabledError(error) && count < 3,
    queryFn: async ({ signal }) => {
      const { data, error } = await api.GET('/guardian/sessions', { signal });
      if (error) {
        throw toGuardianError(error, 'Failed to load active sessions');
      }
      return data;
    },
  });
}

/** Invalidate everything a grant change can affect. */
function invalidateGrantViews(
  queryClient: ReturnType<typeof useQueryClient>,
): void {
  void queryClient.invalidateQueries({ queryKey: guardianKeys.sessions() });
  void queryClient.invalidateQueries({ queryKey: guardianKeys.status() });
  void queryClient.invalidateQueries({
    queryKey: [...guardianKeys.all, 'earned-time'],
  });
}

/** Revoke an active grant now. `POST /guardian/sessions/{id}/revoke`. */
export function useRevokeGuardianSession(): UseMutationResult<
  GuardianGrant,
  Error,
  string
> {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  return useMutation({
    mutationFn: async (id: string) => {
      const { data, error } = await api.POST('/guardian/sessions/{id}/revoke', {
        params: { path: { id } },
      });
      if (error) {
        throw toGuardianError(error, 'Failed to revoke session');
      }
      return data;
    },
    onSuccess: () => invalidateGrantViews(queryClient),
    onError: (error) => {
      toast(error.message, { variant: 'danger' });
    },
  });
}

/**
 * Parent override — open a device for N minutes now. `POST /guardian/grant`.
 * Logged to the override log; does not count against the daily cap.
 */
export function useCreateGuardianGrant(): UseMutationResult<
  GuardianGrant,
  Error,
  ManualGrant
> {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  return useMutation({
    mutationFn: async (body: ManualGrant) => {
      const { data, error } = await api.POST('/guardian/grant', { body });
      if (error) {
        throw toGuardianError(error, 'Failed to open internet time');
      }
      return data;
    },
    onSuccess: () => {
      invalidateGrantViews(queryClient);
      void queryClient.invalidateQueries({
        queryKey: guardianKeys.overrideLog(),
      });
    },
    onError: (error) => {
      toast(error.message, { variant: 'danger' });
    },
  });
}

/** Parent override history, newest first. `GET /guardian/override-log`. */
export function useGuardianOverrideLog(): UseQueryResult<
  GuardianOverrideLog[],
  Error
> {
  return useQuery({
    queryKey: guardianKeys.overrideLog(),
    retry: (count, error) => !isGuardianDisabledError(error) && count < 3,
    queryFn: async ({ signal }) => {
      const { data, error } = await api.GET('/guardian/override-log', {
        signal,
      });
      if (error) {
        throw toGuardianError(error, 'Failed to load override log');
      }
      return data;
    },
  });
}

type EarnedTimeQueryOptions = UseQueryOptions<
  EarnedTime,
  Error,
  EarnedTime,
  ReturnType<typeof guardianKeys.earnedTime>
>;

/** Options for `useEarnedTime`. */
export interface UseEarnedTimeOptions {
  /** Extra gate on top of "studentId is set". Defaults to true. */
  enabled?: boolean;
  /**
   * Refetch cadence in ms, `false` to disable, or a function of the query
   * (TanStack semantics) for adaptive polling. Defaults to 30s.
   */
  refetchInterval?: EarnedTimeQueryOptions['refetchInterval'];
}

/**
 * A student's earned / remaining internet time. `GET /guardian/earned-time`.
 * Student-readable for their own id. Answers `enabled:false` when the Guardian
 * is off, so the student UI can stay dark without special-casing errors.
 * Disabled until a `studentId` is known; refetches every 30s by default so the
 * local countdown re-syncs with the wall.
 */
export function useEarnedTime(
  studentId: string | undefined,
  opts: UseEarnedTimeOptions = {},
): UseQueryResult<EarnedTime, Error> {
  const { enabled = true, refetchInterval = 30_000 } = opts;
  return useQuery({
    queryKey: guardianKeys.earnedTime(studentId ?? ''),
    enabled: Boolean(studentId) && enabled,
    refetchInterval,
    // The student surfaces render nothing on error; don't hammer a server that
    // has no Guardian.
    retry: 1,
    queryFn: async ({ signal }) => {
      const { data, error } = await api.GET('/guardian/earned-time', {
        params: { query: { studentId: studentId as string } },
        signal,
      });
      if (error) {
        throw toGuardianError(error, 'Failed to load earned time');
      }
      return data;
    },
  });
}
