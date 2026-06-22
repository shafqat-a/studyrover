import { useState } from 'react';
import type { FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';

import { Button } from '../components/Button';
import { Card } from '../components/Card';
import { TextInput } from '../components/TextInput';
import { useToast } from '../app/providers';
import type { components } from '../api/schema';
import { useStudentProfile } from '../hooks/useStudentProfile';
import { useSignInStudent } from '../hooks/useAuth';

/**
 * P02 — Student sign-in (screen 1.2)
 *
 * A deliberately lightweight, kid-friendly sign-in. The parent configures a
 * single student profile during setup (Phase 1 has one learner per install), so
 * this screen shows that profile as a big, tappable "who's studying?" card —
 * avatar + name — and, only if the profile is PIN-gated, asks for the PIN.
 *
 * The sign-in itself (POST /auth/student, which sets the session cookie) lives
 * entirely in the H10 `useSignInStudent` hook; this page only picks the student,
 * optionally collects a PIN, and routes to the student home on success. The
 * profile comes from the H06 `useStudentProfile` query. Errors surface as toasts.
 *
 * The route is registered in `src/app/router.tsx` via W03.
 *
 * States: loading (skeleton), error (retry), empty (no profile yet — point the
 * parent at setup), and the populated picker.
 */

type Student = components['schemas']['Student'];

export default function StudentSignIn() {
  const navigate = useNavigate();
  const { toast } = useToast();
  const studentQuery = useStudentProfile();
  const signIn = useSignInStudent();

  // `null` = no student selected yet; otherwise the PIN entry is shown for it.
  const [selected, setSelected] = useState<Student | null>(null);
  const [pin, setPin] = useState('');

  function goHome() {
    navigate('/student', { replace: true });
  }

  async function submitSignIn(student: Student, withPin?: string) {
    try {
      await signIn.mutateAsync({
        studentId: student.id,
        pin: withPin && withPin.length > 0 ? withPin : undefined,
      });
      goHome();
    } catch (error) {
      toast(messageFor(error, 'Could not sign in. Please try again.'), {
        variant: 'danger',
      });
    }
  }

  function handlePick(student: Student) {
    setPin('');
    setSelected(student);
    // No PIN configured → sign straight in; PIN configured → prompt for it.
    if (!isPinProtected(student)) {
      void submitSignIn(student);
    }
  }

  function handlePinSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selected) {
      return;
    }
    void submitSignIn(selected, pin);
  }

  return (
    <div className="mx-auto flex min-h-full w-full max-w-md flex-col justify-center py-12">
      <header className="mb-8 text-center">
        <p className="text-4xl" aria-hidden="true">
          👋
        </p>
        <h1 className="mt-3 font-display text-display-md text-foreground">
          Who&rsquo;s studying?
        </h1>
        <p className="mt-2 text-sm text-foreground-muted">
          Tap your profile to start.
        </p>
      </header>

      {studentQuery.isPending ? (
        <SignInSkeleton />
      ) : studentQuery.isError ? (
        <ErrorState
          message={studentQuery.error.message}
          onRetry={() => void studentQuery.refetch()}
          retrying={studentQuery.isFetching}
        />
      ) : !studentQuery.data ? (
        <EmptyState />
      ) : selected && isPinProtected(studentQuery.data) ? (
        <PinPrompt
          student={selected}
          pin={pin}
          onPinChange={setPin}
          submitting={signIn.isPending}
          onSubmit={handlePinSubmit}
          onBack={() => {
            setSelected(null);
            setPin('');
          }}
        />
      ) : (
        <Card padding="lg" aria-labelledby="picker-heading">
          <h2 id="picker-heading" className="sr-only">
            Choose a student
          </h2>
          <ul className="space-y-3" aria-label="Student profiles">
            <li>
              <StudentChoice
                student={studentQuery.data}
                busy={
                  signIn.isPending &&
                  selected?.id === studentQuery.data.id
                }
                onSelect={() => handlePick(studentQuery.data)}
              />
            </li>
          </ul>
        </Card>
      )}
    </div>
  );
}

/** A student is PIN-gated if their profile notes carry a "pin:" marker. */
function isPinProtected(student: Student): boolean {
  return typeof student.notes === 'string' && student.notes.includes('pin:');
}

interface StudentChoiceProps {
  student: Student;
  busy: boolean;
  onSelect: () => void;
}

function StudentChoice({ student, busy, onSelect }: StudentChoiceProps) {
  return (
    <button
      type="button"
      onClick={onSelect}
      disabled={busy}
      aria-busy={busy || undefined}
      className="flex w-full items-center gap-4 rounded-card border border-border bg-surface p-4 text-left transition hover:bg-surface-muted disabled:opacity-60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-surface"
    >
      <StudentAvatar student={student} />
      <span className="min-w-0 flex-1">
        <span className="block truncate font-display text-lg font-bold text-foreground">
          {student.name}
        </span>
        {student.gradeLevel ? (
          <span className="mt-0.5 block truncate text-sm text-foreground-muted">
            {student.gradeLevel}
          </span>
        ) : null}
      </span>
      <span aria-hidden="true" className="text-foreground-muted">
        {busy ? '…' : '→'}
      </span>
    </button>
  );
}

/** Avatar: the configured image if present, otherwise the name's initial. */
function StudentAvatar({ student }: { student: Student }) {
  if (student.avatarUrl) {
    return (
      <img
        src={student.avatarUrl}
        alt=""
        className="h-14 w-14 shrink-0 rounded-full object-cover"
      />
    );
  }
  const initial = student.name.trim().charAt(0).toUpperCase() || '?';
  return (
    <span
      aria-hidden="true"
      className="flex h-14 w-14 shrink-0 items-center justify-center rounded-full bg-primary-soft font-display text-xl font-bold text-primary"
    >
      {initial}
    </span>
  );
}

interface PinPromptProps {
  student: Student;
  pin: string;
  onPinChange: (value: string) => void;
  submitting: boolean;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
  onBack: () => void;
}

function PinPrompt({
  student,
  pin,
  onPinChange,
  submitting,
  onSubmit,
  onBack,
}: PinPromptProps) {
  return (
    <Card padding="lg" aria-labelledby="pin-heading">
      <div className="flex flex-col items-center text-center">
        <StudentAvatar student={student} />
        <h2
          id="pin-heading"
          className="mt-3 font-display text-display-sm text-foreground"
        >
          Hi, {student.name}
        </h2>
        <p className="mt-1 text-sm text-foreground-muted">
          Enter your PIN to continue.
        </p>
      </div>

      <form className="mt-6 space-y-4" onSubmit={onSubmit}>
        <TextInput
          label="PIN"
          type="password"
          inputMode="numeric"
          autoComplete="off"
          autoFocus
          value={pin}
          onChange={(e) => onPinChange(e.target.value)}
          placeholder="••••"
        />
        <Button
          type="submit"
          fullWidth
          loading={submitting}
          loadingLabel="Signing in…"
          disabled={pin.trim().length === 0}
        >
          Sign in
        </Button>
        <Button
          type="button"
          variant="ghost"
          fullWidth
          disabled={submitting}
          onClick={onBack}
        >
          Back
        </Button>
      </form>
    </Card>
  );
}

function SignInSkeleton() {
  return (
    <Card padding="lg" aria-busy="true" aria-label="Loading profile">
      <div className="flex items-center gap-4">
        <div className="h-14 w-14 shrink-0 animate-pulse rounded-full bg-surface-muted" />
        <div className="flex-1 space-y-2">
          <div className="h-4 w-2/3 animate-pulse rounded bg-surface-muted" />
          <div className="h-3 w-1/3 animate-pulse rounded bg-surface-muted" />
        </div>
      </div>
    </Card>
  );
}

function EmptyState() {
  return (
    <Card padding="lg">
      <div className="text-center">
        <p className="text-4xl" aria-hidden="true">
          🧑‍🎓
        </p>
        <h2 className="mt-3 font-display text-display-sm text-foreground">
          No student profile yet
        </h2>
        <p className="mx-auto mt-1 max-w-sm text-sm text-foreground-muted">
          Ask a parent to add a student profile in StudyRover settings before
          signing in.
        </p>
      </div>
    </Card>
  );
}

interface ErrorStateProps {
  message: string;
  onRetry: () => void;
  retrying: boolean;
}

function ErrorState({ message, onRetry, retrying }: ErrorStateProps) {
  return (
    <Card padding="lg">
      <div role="alert" className="text-center">
        <h2 className="font-display text-display-sm text-danger">
          Couldn&rsquo;t load profile
        </h2>
        <p className="mt-1 text-sm text-foreground-muted">{message}</p>
        <div className="mt-5">
          <Button variant="secondary" onClick={onRetry} loading={retrying}>
            Try again
          </Button>
        </div>
      </div>
    </Card>
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
