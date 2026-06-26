import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';

import { Button, TextInput } from '../components';
import { useLoginParent } from '../hooks/useAuth';

/**
 * Parent login (sign-in with an existing passkey).
 *
 * The server looks the parent up by email, then runs the WebAuthn assertion
 * against their registered credential(s). First-time parents follow the link to
 * /parent/setup. On success the session cookie is set and the user is sent to
 * their subjects.
 */
export default function ParentLogin() {
  const navigate = useNavigate();
  const login = useLoginParent();
  const [email, setEmail] = useState('');

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault();
    if (!email.trim()) return;
    try {
      await login.mutateAsync(email.trim().toLowerCase());
      navigate('/parent/subjects', { replace: true });
    } catch {
      // Error is surfaced as a toast by the hook.
    }
  }

  return (
    <div className="mx-auto flex min-h-[60vh] max-w-md flex-col items-center justify-center gap-6 px-4">
      <div className="text-center">
        <h1 className="font-display text-2xl font-extrabold text-foreground">
          Welcome back
        </h1>
        <p className="mt-2 text-foreground-muted">
          Sign in to StudyRover with your passkey.
        </p>
      </div>

      <form onSubmit={handleLogin} className="flex w-full flex-col gap-4">
        <TextInput
          label="Email"
          type="email"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="you@example.com"
          autoComplete="username webauthn"
        />
        <Button
          type="submit"
          loading={login.isPending}
          size="lg"
          fullWidth
          disabled={!email.trim()}
        >
          Sign in with passkey
        </Button>
      </form>

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
