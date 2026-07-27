import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { KeyRound, LogIn } from 'lucide-react';

import { Button, Card, TextInput } from '../components';
import { Logo } from '../components/Logo';
import { useLoginParent, useLoginParentPassword } from '../hooks/useAuth';

/**
 * Parent login (sign-in with an existing passkey, or a password fallback).
 *
 * The server looks the parent up by email, then runs the WebAuthn assertion
 * against their registered credential(s). On devices without passkey support
 * (no WebAuthn API) the page falls back to email + password, which the parent
 * can also pick explicitly; the server accepts the account password or the
 * built-in default when none is set. First-time parents follow the link to
 * /parent/setup. On success the session cookie is set and the user is sent to
 * their subjects.
 */
export default function ParentLogin() {
  const navigate = useNavigate();
  const login = useLoginParent();
  const passwordLogin = useLoginParentPassword();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');

  // WebAuthn is feature-detected; without it the password form is the only
  // usable mode, so it becomes the default.
  const passkeySupported =
    typeof window !== 'undefined' && 'PublicKeyCredential' in window;
  const [usePassword, setUsePassword] = useState(!passkeySupported);

  const pending = login.isPending || passwordLogin.isPending;

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault();
    const trimmed = email.trim().toLowerCase();
    if (!trimmed) return;
    try {
      if (usePassword) {
        if (!password) return;
        await passwordLogin.mutateAsync({ email: trimmed, password });
      } else {
        await login.mutateAsync(trimmed);
      }
      navigate('/parent/subjects', { replace: true });
    } catch {
      // Error is surfaced as a toast by the hook.
    }
  }

  return (
    <div className="mx-auto flex min-h-full w-full max-w-md flex-col justify-center py-12 bg-[radial-gradient(60rem_60rem_at_50%_-10%,hsl(var(--sr-primary)/0.08),transparent)]">
      <header className="mb-8 flex flex-col items-center text-center">
        <Logo size={40} />
        <h1 className="mt-6 font-display text-xl sm:text-2xl font-semibold tracking-tight text-foreground">
          Welcome back
        </h1>
        <p className="mt-2 text-sm text-foreground-muted">
          {usePassword
            ? 'Sign in to StudyRover with your password.'
            : 'Sign in to StudyRover with your passkey.'}
        </p>
      </header>

      <Card padding="lg">
        <form onSubmit={handleLogin} className="space-y-4">
          <TextInput
            label="Email"
            type="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="you@example.com"
            autoComplete={usePassword ? 'username' : 'username webauthn'}
          />
          {usePassword && (
            <TextInput
              label="Password"
              type="password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete="current-password"
            />
          )}
          <Button
            type="submit"
            loading={pending}
            size="lg"
            fullWidth
            disabled={!email.trim() || (usePassword && !password)}
            leadingIcon={
              usePassword ? (
                <KeyRound className="h-4 w-4" aria-hidden="true" />
              ) : (
                <LogIn className="h-4 w-4" aria-hidden="true" />
              )
            }
          >
            {usePassword ? 'Sign in with password' : 'Sign in with passkey'}
          </Button>
        </form>

        <p className="mt-4 text-center text-sm">
          {usePassword ? (
            passkeySupported && (
              <button
                type="button"
                onClick={() => setUsePassword(false)}
                className="font-medium text-secondary hover:underline"
              >
                Use a passkey instead
              </button>
            )
          ) : (
            <button
              type="button"
              onClick={() => setUsePassword(true)}
              className="font-medium text-secondary hover:underline"
            >
              Passkey not available? Sign in with password
            </button>
          )}
        </p>
      </Card>

      <p className="mt-6 text-center text-sm text-foreground-muted">
        First time?{' '}
        <Link
          to="/parent/setup"
          className="font-medium text-secondary hover:underline"
        >
          Set up your account
        </Link>
      </p>
    </div>
  );
}
