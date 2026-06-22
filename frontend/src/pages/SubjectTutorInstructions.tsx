import { useEffect, useMemo, useState } from 'react';
import type { FormEvent } from 'react';
import { useParams } from 'react-router-dom';

import {
  Button,
  Card,
  PageHeader,
  RadioGroup,
  Select,
  Textarea,
} from '../components';
import type { components } from '../api/schema';
import { useToast } from '../app/providers';
import { useSubject } from '../hooks';
import {
  useTutorInstructions,
  useUpdateTutorInstructions,
} from '../hooks/useTutorInstructions';

/**
 * P04 — Per-subject tutor instructions (screen 2.7)
 *
 * Lets a parent shape how the AI tutor behaves for a single subject. The screen
 * pairs a free-text "custom instructions" textarea with three quick toggles —
 * tone, target language, and difficulty — each defaulted so the form is usable
 * out of the box. The form is hydrated from the H06 `useTutorInstructions`
 * query and saved through `useUpdateTutorInstructions` (PUT); nothing here
 * hand-rolls a fetch.
 *
 * The subject id comes from the `:id` route param (this page is mounted under
 * the Subject detail route). All data access flows through the typed hooks.
 *
 * States: loading (skeleton), error (retry), and the populated editable form
 * with a dirty-aware Save / Reset footer.
 */

type TutorInstructions = components['schemas']['TutorInstructions'];
type Difficulty = NonNullable<TutorInstructions['difficulty']>;

/** Default tone offered to the tutor when the parent has not chosen one. */
const DEFAULT_TONE = 'encouraging';
/** Default response language (BCP 47 tag). */
const DEFAULT_LANGUAGE = 'en';
/** Default difficulty the tutor pitches explanations at. */
const DEFAULT_DIFFICULTY: Difficulty = 'medium';

/** Curated tone presets surfaced as a quick toggle. */
const TONE_OPTIONS: ReadonlyArray<{ value: string; label: string }> = [
  { value: 'encouraging', label: 'Encouraging' },
  { value: 'socratic', label: 'Socratic' },
  { value: 'concise', label: 'Concise' },
  { value: 'playful', label: 'Playful' },
  { value: 'formal', label: 'Formal' },
];

/** Curated target-language presets surfaced as a quick toggle. */
const LANGUAGE_OPTIONS: ReadonlyArray<{ value: string; label: string }> = [
  { value: 'en', label: 'English' },
  { value: 'es', label: 'Spanish' },
  { value: 'fr', label: 'French' },
  { value: 'de', label: 'German' },
  { value: 'ar', label: 'Arabic' },
  { value: 'hi', label: 'Hindi' },
  { value: 'zh', label: 'Chinese' },
];

/** Difficulty presets surfaced as a single-select radio group. */
const DIFFICULTY_OPTIONS: ReadonlyArray<{ id: Difficulty; label: string }> = [
  { id: 'easy', label: 'Easy — gentle pace, lots of scaffolding' },
  { id: 'medium', label: 'Medium — balanced explanations' },
  { id: 'hard', label: 'Hard — stretch goals and deeper questions' },
];

const MAX_INSTRUCTIONS = 2000;

interface FormState {
  customInstructions: string;
  tone: string;
  targetLanguage: string;
  difficulty: Difficulty;
}

/** Build the editable form state from a (possibly partial) server payload. */
function formFromInstructions(value: TutorInstructions | undefined): FormState {
  return {
    customInstructions: value?.customInstructions ?? '',
    tone: value?.tone ?? DEFAULT_TONE,
    targetLanguage: value?.targetLanguage ?? DEFAULT_LANGUAGE,
    difficulty: value?.difficulty ?? DEFAULT_DIFFICULTY,
  };
}

/** Structural equality for the form state (drives the dirty indicator). */
function formsEqual(a: FormState, b: FormState): boolean {
  return (
    a.customInstructions === b.customInstructions &&
    a.tone === b.tone &&
    a.targetLanguage === b.targetLanguage &&
    a.difficulty === b.difficulty
  );
}

export default function SubjectTutorInstructions() {
  const { id: subjectId } = useParams<{ id: string }>();
  const { toast } = useToast();

  const subjectQuery = useSubject(subjectId);
  const instructionsQuery = useTutorInstructions(subjectId);
  const updateInstructions = useUpdateTutorInstructions();

  // The server-derived baseline (with defaults applied) and the live edits.
  const baseline = useMemo(
    () => formFromInstructions(instructionsQuery.data),
    [instructionsQuery.data],
  );
  const [form, setForm] = useState<FormState>(baseline);

  // Re-seed the editable copy whenever a fresh payload arrives.
  useEffect(() => {
    setForm(baseline);
  }, [baseline]);

  const dirty = !formsEqual(form, baseline);
  const subjectName = subjectQuery.data?.name;

  function update<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!subjectId) return;
    const instructions: TutorInstructions = {
      subjectId,
      customInstructions: form.customInstructions.trim(),
      tone: form.tone,
      targetLanguage: form.targetLanguage,
      difficulty: form.difficulty,
    };
    await updateInstructions.mutateAsync({ subjectId, instructions });
    toast('Tutor instructions saved.', { variant: 'success' });
  }

  const breadcrumbs = subjectId
    ? [
        { label: 'Subjects', to: '/parent/subjects' },
        {
          label: subjectName ?? 'Subject',
          to: `/parent/subjects/${subjectId}`,
        },
        { label: 'Tutor instructions' },
      ]
    : undefined;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Tutor instructions"
        subtitle={
          subjectName
            ? `Shape how the AI tutor explains and questions for ${subjectName}.`
            : 'Shape how the AI tutor explains and questions for this subject.'
        }
        breadcrumbs={breadcrumbs}
      />

      {instructionsQuery.isPending ? (
        <InstructionsSkeleton />
      ) : instructionsQuery.isError ? (
        <ErrorState
          message={instructionsQuery.error.message}
          onRetry={() => void instructionsQuery.refetch()}
          retrying={instructionsQuery.isFetching}
        />
      ) : (
        <form onSubmit={handleSubmit} className="space-y-6">
          <Card padding="md" className="space-y-2">
            <Textarea
              label="Custom instructions"
              value={form.customInstructions}
              onChange={(e) => update('customInstructions', e.target.value)}
              rows={6}
              maxLength={MAX_INSTRUCTIONS}
              showCount
              placeholder="e.g. Always relate new ideas back to real-world examples, and check understanding with a quick question before moving on."
              hint="Free-text guidance layered on top of the syllabus and the student's progress when the tutor answers."
            />
          </Card>

          <Card padding="md" className="space-y-6">
            <div>
              <h2 className="font-display text-lg font-bold text-foreground">
                Quick settings
              </h2>
              <p className="mt-1 text-sm text-foreground-muted">
                Sensible defaults are applied — adjust any that matter for this
                subject.
              </p>
            </div>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <Select
                label="Tone"
                value={form.tone}
                onChange={(e) => update('tone', e.target.value)}
                options={TONE_OPTIONS.map((o) => ({
                  value: o.value,
                  label: o.label,
                }))}
                hint="How the tutor talks to the student."
              />

              <Select
                label="Target language"
                value={form.targetLanguage}
                onChange={(e) => update('targetLanguage', e.target.value)}
                options={LANGUAGE_OPTIONS.map((o) => ({
                  value: o.value,
                  label: o.label,
                }))}
                hint="The language the tutor responds in."
              />
            </div>

            <fieldset>
              <legend className="mb-2 text-sm font-semibold text-foreground">
                Difficulty
              </legend>
              <RadioGroup
                name="tutor-difficulty"
                aria-label="Difficulty"
                value={form.difficulty}
                onChange={(id) => update('difficulty', id as Difficulty)}
                options={DIFFICULTY_OPTIONS.map((o) => ({
                  id: o.id,
                  label: o.label,
                }))}
              />
            </fieldset>
          </Card>

          <div className="flex flex-wrap items-center justify-end gap-2">
            <Button
              type="button"
              variant="ghost"
              onClick={() => setForm(baseline)}
              disabled={!dirty || updateInstructions.isPending}
            >
              Reset
            </Button>
            <Button
              type="submit"
              loading={updateInstructions.isPending}
              disabled={!dirty || !subjectId}
            >
              Save changes
            </Button>
          </div>
        </form>
      )}
    </div>
  );
}

function InstructionsSkeleton() {
  return (
    <div
      className="space-y-6"
      aria-busy="true"
      aria-label="Loading tutor instructions"
    >
      <div className="h-44 animate-pulse rounded-card border border-border bg-surface-muted" />
      <div className="h-56 animate-pulse rounded-card border border-border bg-surface-muted" />
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
        Couldn&rsquo;t load tutor instructions
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
