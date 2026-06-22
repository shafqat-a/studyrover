import { useState } from 'react';
import type { FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';

import { Button } from '../components/Button';
import { Card } from '../components/Card';
import { TextInput } from '../components/TextInput';
import { useToast } from '../app/providers';
import { useRegisterParent } from '../hooks/useAuth';

/**
 * P01 — Parent setup (screen 1.1)
 *
 * First-run flow that creates the parent account and registers its first
 * WebAuthn passkey, then strongly prompts the parent to enroll a *backup*
 * authenticator so a single lost device can't lock them out of the family
 * account.
 *
 * The actual WebAuthn ceremony (begin -> navigator.credentials -> finish) lives
 * entirely inside the H10 `useRegisterParent` hook; this page only collects the
 * display name + email, drives the two registration steps, and routes to the
 * subjects list on success. Errors surface as toasts.
 *
 * Flow:
 *   1. "account"  — collect display name + email, register the primary passkey.
 *   2. "backup"   — strongly-prompted second authenticator (can be skipped, but
 *                   the skip path is de-emphasised and warns about lockout).
 *
 * The route is registered in `src/app/router.tsx` via W03.
 */

type Step = 'account' | 'backup';

interface FormState {
  displayName: string;
  email: string;
}

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export default function ParentSetup() {
  const navigate = useNavigate();
  const { toast } = useToast();
  const registerParent = useRegisterParent();

  const [step, setStep] = useState<Step>('account');
  const [form, setForm] = useState<FormState>({ displayName: '', email: '' });
  const [touched, setTouched] = useState(false);

  const trimmedName = form.displayName.trim();
  const trimmedEmail = form.email.trim();

  const nameError =
    touched && trimmedName.length === 0
      ? 'Your name is required.'
      : undefined;
  const emailError =
    touched && !EMAIL_PATTERN.test(trimmedEmail)
      ? 'Enter a valid email address.'
      : undefined;

  const accountValid =
    trimmedName.length > 0 && EMAIL_PATTERN.test(trimmedEmail);

  function goToSubjects() {
    navigate('/parent/subjects', { replace: true });
  }

  async function handleCreateAccount(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setTouched(true);
    if (!accountValid) {
      return;
    }
    try {
      await registerParent.mutateAsync({
        displayName: trimmedName,
        email: trimmedEmail,
      });
      toast('Passkey created', {
        description: 'Your account is protected with a passkey.',
        variant: 'success',
      });
      setStep('backup');
    } catch (error) {
      toast(messageFor(error, 'Could not create your passkey.'), {
        variant: 'danger',
      });
    }
  }

  async function handleAddBackup() {
    try {
      await registerParent.mutateAsync({
        displayName: trimmedName,
        email: trimmedEmail,
      });
      toast('Backup passkey added', {
        description: 'You now have a spare way to sign in.',
        variant: 'success',
      });
      goToSubjects();
    } catch (error) {
      toast(messageFor(error, 'Could not add a backup passkey.'), {
        variant: 'danger',
      });
    }
  }

  return (
    <div className="mx-auto flex min-h-full w-full max-w-md flex-col justify-center py-12">
      <header className="mb-8 text-center">
        <p className="text-4xl" aria-hidden="true">
          🚀
        </p>
        <h1 className="mt-3 font-display text-display text-foreground">
          Welcome to StudyRover
        </h1>
        <p className="mt-2 text-sm text-foreground-muted">
          {step === 'account'
            ? 'Set up the parent account that manages subjects, exams, and student profiles.'
            : 'One more step to keep your account safe.'}
        </p>
      </header>

      {step === 'account' ? (
        <Card padding="lg" aria-labelledby="account-heading">
          <h2
            id="account-heading"
            className="font-display text-display-sm text-foreground"
          >
            Create your account
          </h2>
          <p className="mt-1 text-sm text-foreground-muted">
            We&rsquo;ll register a passkey on this device — no password to
            remember.
          </p>

          <form className="mt-6 space-y-4" onSubmit={handleCreateAccount}>
            <TextInput
              label="Your name"
              required
              autoFocus
              autoComplete="name"
              value={form.displayName}
              error={nameError}
              onChange={(e) =>
                setForm((f) => ({ ...f, displayName: e.target.value }))
              }
              onBlur={() => setTouched(true)}
              placeholder="e.g. Alex Carter"
            />

            <TextInput
              label="Email"
              type="email"
              required
              autoComplete="email"
              value={form.email}
              error={emailError}
              hint="Used to identify your account when you sign in."
              onChange={(e) =>
                setForm((f) => ({ ...f, email: e.target.value }))
              }
              onBlur={() => setTouched(true)}
              placeholder="you@example.com"
            />

            <Button
              type="submit"
              fullWidth
              loading={registerParent.isPending}
              loadingLabel="Creating passkey…"
            >
              Create passkey
            </Button>
          </form>
        </Card>
      ) : (
        <Card padding="lg" aria-labelledby="backup-heading">
          <h2
            id="backup-heading"
            className="font-display text-display-sm text-foreground"
          >
            Add a backup passkey
          </h2>

          <div
            role="note"
            className="mt-4 rounded-card border border-warning/40 bg-warning-soft p-4"
          >
            <p className="text-sm font-semibold text-warning-foreground">
              Strongly recommended
            </p>
            <p className="mt-1 text-sm text-warning-foreground">
              If you only have one passkey and lose that device, you could be
              locked out of the family account permanently. Add a second
              authenticator now — a phone, another laptop, or a hardware
              security key.
            </p>
          </div>

          <div className="mt-6 space-y-3">
            <Button
              type="button"
              fullWidth
              loading={registerParent.isPending}
              loadingLabel="Adding backup…"
              onClick={() => void handleAddBackup()}
            >
              Add backup passkey
            </Button>
            <Button
              type="button"
              variant="ghost"
              fullWidth
              disabled={registerParent.isPending}
              onClick={goToSubjects}
            >
              Skip for now (not recommended)
            </Button>
          </div>
        </Card>
      )}
    </div>
  );
}

/** Best-effort human-readable message from a thrown error / Problem body. */
function messageFor(error: unknown, fallback: string): string {
  if (error instanceof Error && error.message) {
    return error.message;
  }
  if (error && typeof error === 'object') {
    const maybe = error as { detail?: unknown; title?: unknown };
    if (typeof maybe.detail === 'string' && maybe.detail.length > 0) {
      return maybe.detail;
    }
    if (typeof maybe.title === 'string' && maybe.title.length > 0) {
      return maybe.title;
    }
  }
  return fallback;
}
