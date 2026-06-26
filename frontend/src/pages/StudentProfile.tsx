import { useEffect, useState } from 'react';
import type { FormEvent } from 'react';

import { Avatar } from '../components/Avatar';
import { Button } from '../components/Button';
import { Card } from '../components/Card';
import { FileUpload } from '../components/FileUpload';
import { TextInput } from '../components/TextInput';
import { Textarea } from '../components/Textarea';
import type { components } from '../api/schema';
import { useToast } from '../app/providers';
import { useStudentProfile, useUpdateStudentProfile } from '../hooks/useStudentProfile';

/**
 * P03 — Student profile admin (screen 2.1)
 *
 * The parent-facing form for the single student profile (C07): display name,
 * grade / year level, avatar, and free-form notes/preferences that feed the
 * tutor in a later phase. Data is loaded and persisted through the H06
 * `useStudentProfile` / `useUpdateStudentProfile` hooks — nothing here hand-rolls a fetch.
 *
 * The profile is fetched on mount and used to seed an editable form. Saving PUTs
 * the full Student (the contract's update body) and surfaces a success/error
 * toast. A read-only "Devices" panel is shown as a placeholder for the Guardian
 * device summary that lands in Phase 3.
 *
 * States: loading (skeleton), error (retry), and the populated form.
 */

type Student = components['schemas']['Student'];

const NAME_MAX = 80;
const GRADE_MAX = 40;
const NOTES_MAX = 2000;
const AVATAR_ACCEPT = '.png,.jpg,.jpeg,.gif,.webp,image/*';

interface ProfileFormState {
  name: string;
  gradeLevel: string;
  avatarUrl: string;
  notes: string;
}

function formFromStudent(student: Student): ProfileFormState {
  return {
    name: student.name,
    gradeLevel: student.gradeLevel ?? '',
    avatarUrl: student.avatarUrl ?? '',
    notes: student.notes ?? '',
  };
}

export default function StudentProfile() {
  const studentQuery = useStudentProfile();
  const updateStudent = useUpdateStudentProfile();
  const { toast } = useToast();

  const [form, setForm] = useState<ProfileFormState | null>(null);
  const [touched, setTouched] = useState(false);
  // Locally selected avatar file (U17 upload). Phase 1 only captures the
  // reference and previews it; persisted ingestion lands later. The preview is
  // shown immediately so the parent gets feedback.
  const [avatarFiles, setAvatarFiles] = useState<File[]>([]);
  const [avatarPreview, setAvatarPreview] = useState<string | null>(null);

  const student = studentQuery.data;

  // Seed the form once the profile loads (and whenever a fresh copy arrives).
  useEffect(() => {
    if (student) {
      setForm(formFromStudent(student));
    }
  }, [student]);

  // Build (and revoke) an object URL for the selected avatar preview.
  useEffect(() => {
    const file = avatarFiles[0];
    if (!file) {
      setAvatarPreview(null);
      return;
    }
    const url = URL.createObjectURL(file);
    setAvatarPreview(url);
    return () => URL.revokeObjectURL(url);
  }, [avatarFiles]);

  const nameError =
    touched && (form?.name.trim().length ?? 0) === 0
      ? 'Name is required.'
      : undefined;

  function update<K extends keyof ProfileFormState>(
    key: K,
    value: ProfileFormState[K],
  ) {
    setForm((prev) => (prev ? { ...prev, [key]: value } : prev));
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setTouched(true);
    if (!form || !student) return;
    if (form.name.trim().length === 0) return;

    const body: Student = {
      ...student,
      name: form.name.trim(),
      gradeLevel: form.gradeLevel.trim() || undefined,
      avatarUrl: form.avatarUrl.trim() || undefined,
      notes: form.notes.trim() || undefined,
    };

    try {
      await updateStudent.mutateAsync(body);
      toast('Profile saved', {
        variant: 'success',
        description: 'The student profile has been updated.',
      });
    } catch (err) {
      toast('Could not save profile', {
        variant: 'danger',
        description:
          err instanceof Error ? err.message : 'Please try again.',
      });
    }
  }

  const dirty =
    !!form &&
    !!student &&
    (form.name.trim() !== student.name ||
      form.gradeLevel.trim() !== (student.gradeLevel ?? '') ||
      form.avatarUrl.trim() !== (student.avatarUrl ?? '') ||
      form.notes.trim() !== (student.notes ?? ''));

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <header>
        <h1 className="font-display text-display-sm text-foreground">
          Student profile
        </h1>
        <p className="mt-1 text-sm text-foreground-muted">
          Manage the student&rsquo;s name, level, avatar, and study preferences.
        </p>
      </header>

      {studentQuery.isPending ? (
        <ProfileSkeleton />
      ) : studentQuery.isError ? (
        <ErrorState
          message={studentQuery.error.message}
          onRetry={() => void studentQuery.refetch()}
          retrying={studentQuery.isFetching}
        />
      ) : form ? (
        <form onSubmit={handleSubmit} className="space-y-6">
          <Card padding="lg">
            <div className="space-y-5">
              <div className="flex items-center gap-4">
                <Avatar
                  size="xl"
                  src={avatarPreview ?? (form.avatarUrl || undefined)}
                  name={form.name}
                  alt={form.name ? `${form.name}'s avatar` : 'Student avatar'}
                />
                <div className="min-w-0">
                  <p className="font-display text-lg font-bold text-foreground">
                    {form.name.trim() || 'Unnamed student'}
                  </p>
                  {form.gradeLevel.trim() ? (
                    <p className="text-sm text-foreground-muted">
                      {form.gradeLevel.trim()}
                    </p>
                  ) : null}
                </div>
              </div>

              <TextInput
                label="Display name"
                required
                value={form.name}
                maxLength={NAME_MAX}
                error={nameError}
                onChange={(e) => update('name', e.target.value)}
                onBlur={() => setTouched(true)}
                placeholder="e.g. Alex Johnson"
              />

              <TextInput
                label="Grade / level"
                value={form.gradeLevel}
                maxLength={GRADE_MAX}
                hint="Optional — free-form, e.g. “Grade 7” or “Year 10”."
                onChange={(e) => update('gradeLevel', e.target.value)}
                placeholder="e.g. Grade 7"
              />
            </div>
          </Card>

          <Card padding="lg">
            <div className="space-y-5">
              <FileUpload
                label="Avatar"
                hint="Optional — upload an image to use as the student's avatar."
                accept={AVATAR_ACCEPT}
                files={avatarFiles}
                onFilesChange={setAvatarFiles}
              />

              <TextInput
                label="Avatar image URL"
                value={form.avatarUrl}
                hint="Or paste a link to an image hosted elsewhere."
                onChange={(e) => update('avatarUrl', e.target.value)}
                placeholder="https://…"
              />
            </div>
          </Card>

          <Card padding="lg">
            <Textarea
              label="Notes & preferences"
              value={form.notes}
              rows={6}
              maxLength={NOTES_MAX}
              showCount
              hint="Context the tutor will use later — interests, goals, learning style, or things to avoid."
              onChange={(e) => update('notes', e.target.value)}
              placeholder="e.g. Prefers worked examples; loves space and dinosaurs; gets discouraged by long passages."
            />
          </Card>

          <DeviceSummaryPlaceholder />

          <div className="flex items-center justify-end gap-3">
            <p className="mr-auto text-sm text-foreground-muted" aria-live="polite">
              {dirty ? 'Unsaved changes' : 'All changes saved'}
            </p>
            <Button
              type="submit"
              loading={updateStudent.isPending}
              disabled={!dirty && !updateStudent.isPending}
            >
              Save changes
            </Button>
          </div>
        </form>
      ) : null}
    </div>
  );
}

/**
 * Read-only placeholder for the Guardian device summary (Phase 3). Rendered as a
 * disabled-looking panel so the parent knows where managed devices will appear.
 */
function DeviceSummaryPlaceholder() {
  return (
    <Card padding="lg">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="font-display font-bold text-foreground">Devices</h2>
          <p className="mt-1 text-sm text-foreground-muted">
            Managed devices and screen-time controls will appear here once the
            Guardian companion is connected.
          </p>
        </div>
        <span className="shrink-0 rounded-pill border border-border bg-surface-muted px-3 py-1 text-xs font-semibold text-foreground-muted">
          Coming soon
        </span>
      </div>
      <p className="mt-4 rounded-card border border-dashed border-border bg-surface-muted px-4 py-6 text-center text-sm text-foreground-muted">
        No devices connected yet.
      </p>
    </Card>
  );
}

function ProfileSkeleton() {
  return (
    <div className="space-y-6" aria-busy="true" aria-label="Loading profile">
      <div className="h-56 animate-pulse rounded-card border border-border bg-surface-muted" />
      <div className="h-48 animate-pulse rounded-card border border-border bg-surface-muted" />
      <div className="h-40 animate-pulse rounded-card border border-border bg-surface-muted" />
    </div>
  );
}

interface ErrorStateProps {
  message: string;
  onRetry: () => void;
  retrying: boolean;
}

function ErrorState({ message, onRetry, retrying }: ErrorStateProps) {
  return (
    <div
      role="alert"
      className="rounded-card border border-danger bg-danger-soft p-8 text-center"
    >
      <h2 className="font-display text-display-sm text-danger">
        Couldn&rsquo;t load the profile
      </h2>
      <p className="mt-1 text-sm text-foreground-muted">{message}</p>
      <div className="mt-5">
        <Button variant="secondary" onClick={onRetry} loading={retrying}>
          Try again
        </Button>
      </div>
    </div>
  );
}
