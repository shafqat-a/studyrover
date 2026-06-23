import { Link, useNavigate } from 'react-router-dom';

import { Button } from '../components';
import { useLoginParent } from '../hooks/useAuth';

/**
 * Parent login (sign-in with an existing passkey).
 *
 * Uses the discoverable-credential WebAuthn flow (useLoginParent), so no email
 * is required — the browser offers the registered passkey. First-time parents
 * follow the link to /parent/setup to register. On success the session cookie is
 * set and the user is sent to their subjects.
 */
export default function ParentLogin() {
  const navigate = useNavigate();
  const login = useLoginParent();

  async function handleLogin() {
    try {
      await login.mutateAsync();
      navigate('/parent/subjects', { replace: true });
    } catch {
      // Error is surfaced as a toast by the hook.
    }
  }

  return (
    <div className="mx-auto flex min-h-[60vh] max-w-md flex-col items-center justify-center gap-6 px-4 text-center">
      <div>
        <h1 className="font-display text-2xl font-extrabold text-foreground">
          Welcome back
        </h1>
        <p className="mt-2 text-foreground-muted">
          Sign in to StudyRover with your passkey.
        </p>
      </div>

      <Button
        onClick={handleLogin}
        loading={login.isPending}
        size="lg"
        fullWidth
      >
        Sign in with passkey
      </Button>

      <p className="text-sm text-foreground-muted">
        First time?{' '}
        <Link
          to="/parent/setup"
          className="font-semibold text-primary hover:underline"
        >
          Set up your account
        </Link>
      </p>
    </div>
  );
}
