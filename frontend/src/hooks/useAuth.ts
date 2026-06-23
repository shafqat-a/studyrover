// H10 — useAuth
//
// Client auth hooks for StudyRover. They wrap the WebAuthn (passkey) browser
// ceremonies for parents and the PIN-gated student sign-in, all flowing through
// the shared, contract-typed `api` client so requests/responses are checked
// against the frozen OpenAPI contract (W01). Nothing here hand-rolls a fetch.
//
// The WebAuthn endpoints (`POST /auth/register`, `POST /auth/login`) are
// two-step ceremonies driven over a single path: the first call (no
// authenticator response) returns opaque `options`; we hand those to the
// browser via @simplewebauthn/browser, then post the authenticator's response
// back to the same endpoint to `finish` and receive a Session. Student sign-in
// (`POST /auth/student`) is a single round-trip.
//
// There is no GET session endpoint in the contract, so `useSession` reads the
// established Session from the query cache; the auth mutations seed it on
// success. On error we surface a toast using the RFC 7807 Problem body.

import {
  useMutation,
  useQuery,
  useQueryClient,
  type UseMutationResult,
  type UseQueryResult,
} from '@tanstack/react-query';
import {
  startAuthentication,
  startRegistration,
} from '@simplewebauthn/browser';

import { api } from '../api/client';
import type { components } from '../api/schema';
import { useToast } from '../app/providers';

type Session = components['schemas']['Session'];
type RegisterBegin = components['schemas']['RegisterBegin'];
type StudentSignIn = components['schemas']['StudentSignIn'];
type WebAuthnCeremony = components['schemas']['WebAuthnCeremony'];
type AuthResult = components['schemas']['AuthResult'];
type Problem = components['schemas']['Problem'];

// The browser ceremony option shapes are owned by @simplewebauthn/browser; we
// derive them from the function parameters rather than importing the (not
// separately installed) @simplewebauthn/types package.
type RegistrationOptionsJSON = Parameters<
  typeof startRegistration
>[0]['optionsJSON'];
type AuthenticationOptionsJSON = Parameters<
  typeof startAuthentication
>[0]['optionsJSON'];

/** Stable query keys for the auth/session state. */
export const authKeys = {
  all: ['auth'] as const,
  session: () => [...authKeys.all, 'session'] as const,
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

/** Post a ceremony step to a WebAuthn auth endpoint and return its result. */
async function postRegister(body: WebAuthnCeremony): Promise<AuthResult> {
  const { data, error } = await api.POST('/auth/register', { body });
  if (error) {
    throw new Error(problemMessage(error, 'Registration failed'));
  }
  return data;
}

async function postLogin(body: WebAuthnCeremony): Promise<AuthResult> {
  const { data, error } = await api.POST('/auth/login', { body });
  if (error) {
    throw new Error(problemMessage(error, 'Sign-in failed'));
  }
  return data;
}

/**
 * Register a parent via a passkey ceremony.
 *
 * begin: post the RegisterBegin (display name + email) to obtain creation
 *        options; finish: run the browser ceremony and post the authenticator
 *        response back to establish the Session. The session cookie is set by
 *        the server; we also seed the session cache so the UI updates at once.
 */
export function useRegisterParent(): UseMutationResult<
  Session,
  Error,
  RegisterBegin
> {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  return useMutation({
    mutationFn: async (begin: RegisterBegin) => {
      const started = await postRegister(begin as unknown as WebAuthnCeremony);
      if (!started.options) {
        throw new Error('Server did not return registration options');
      }
      const attestation = await startRegistration({
        optionsJSON:
          started.options as unknown as RegistrationOptionsJSON,
      });
      const finished = await postRegister(
        attestation as unknown as WebAuthnCeremony,
      );
      if (!finished.session) {
        throw new Error('Registration did not complete');
      }
      return finished.session;
    },
    onSuccess: (session) => {
      queryClient.setQueryData(authKeys.session(), session);
    },
    onError: (error) => {
      toast(error.message, { variant: 'danger' });
    },
  });
}

/**
 * Log a parent in via a passkey ceremony.
 *
 * begin: post an empty payload to obtain request options; finish: run the
 * browser assertion and post the authenticator response back to establish the
 * Session.
 */
export function useLoginParent(): UseMutationResult<Session, Error, void> {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  return useMutation({
    mutationFn: async () => {
      const started = await postLogin({} as WebAuthnCeremony);
      if (!started.options) {
        throw new Error('Server did not return authentication options');
      }
      const assertion = await startAuthentication({
        optionsJSON:
          started.options as unknown as AuthenticationOptionsJSON,
      });
      const finished = await postLogin(
        assertion as unknown as WebAuthnCeremony,
      );
      if (!finished.session) {
        throw new Error('Sign-in did not complete');
      }
      return finished.session;
    },
    onSuccess: (session) => {
      queryClient.setQueryData(authKeys.session(), session);
    },
    onError: (error) => {
      toast(error.message, { variant: 'danger' });
    },
  });
}

/** Sign a student in (optionally with a PIN). Sets the session cookie + cache. */
export function useSignInStudent(): UseMutationResult<
  Session,
  Error,
  StudentSignIn
> {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  return useMutation({
    mutationFn: async (body: StudentSignIn) => {
      const { data, error } = await api.POST('/auth/student', { body });
      if (error) {
        throw new Error(problemMessage(error, 'Student sign-in failed'));
      }
      return data;
    },
    onSuccess: (session) => {
      queryClient.setQueryData(authKeys.session(), session);
    },
    onError: (error) => {
      toast(error.message, { variant: 'danger' });
    },
  });
}

/**
 * Read the active Session from `GET /auth/session`, which reflects the
 * server-side sr_session cookie. A 401 means "logged out" and maps to `null`
 * (not an error). Auth mutations also seed this cache on success. Used by the
 * layouts to gate routes.
 */
export function useSession(): UseQueryResult<Session | null, Error> {
  return useQuery({
    queryKey: authKeys.session(),
    queryFn: async () => {
      const { data, error } = await api.GET('/auth/session');
      if (error) return null;
      return (data ?? null) as Session | null;
    },
    staleTime: 30_000,
  });
}
