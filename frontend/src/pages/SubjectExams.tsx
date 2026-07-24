import { useEffect, useState } from 'react';
import type { FormEvent } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import {
  Check,
  ClipboardList,
  Play,
  Plus,
  RotateCcw,
  Wand2,
} from 'lucide-react';
import { useQueryClient } from '@tanstack/react-query';

import {
  Badge,
  Button,
  Card,
  ConfirmDialog,
  Dialog,
  EmptyState,
  JobStatus,
  NumberStepper,
  PageHeader,
  Select,
  TextInput,
} from '../components';
import type { components } from '../api/schema';
import {
  examDefinitionKeys,
  useCreateExamDefinition,
  useDeleteExamDefinition,
  useExamDefinitions,
  useGenerateExam,
  useJob,
  useTopics,
  useUpdateExamDefinition,
} from '../hooks';
import { useToast } from '../app/providers';

/**
 * P08 — Exam definitions (screen 2.6)
 *
 * Rendered as the `exams` sub-tab of the Subject detail page (P05), so the
 * owning subject id comes from the `:subjectId` route param. Lets the parent
 * define parent-configured exam templates for a subject:
 *
 *   - name        → human-readable label
 *   - type        → gate (unlocks internet time) or formal (graded only)
 *   - scope       → multi-select of the subject's topics; none selected means
 *                   the whole subject (scopeTopicIds = []).
 *   - size        → number of questions; presets 5 / 10 / 20 (default 20)
 *   - passBar     → minimum score % to pass (default 70)
 *   - cooldownMin → minutes to wait after a failed attempt (default 10)
 *   - rewardStyle → flat (full time on pass) or scaled (by score %)
 *
 * The spec §10 defaults (type gate, size 20, passBar 70, cooldownMin 10,
 * rewardStyle flat) are prefilled here so the form mirrors what the server
 * would apply. CRUD flows through the H04 useExamDefinitions hooks and the H03
 * useTopics hook for the scope picker; nothing here hand-rolls a fetch.
 *
 * States: loading (skeleton), error (retry), empty (call to action), and the
 * populated list, plus a create/edit dialog and a delete confirmation.
 */

type ExamDefinition = components['schemas']['ExamDefinition'];
type CreateExamDefinition = components['schemas']['CreateExamDefinition'];
type ExamType = components['schemas']['ExamType'];
type RewardStyle = components['schemas']['RewardStyle'];
type Topic = components['schemas']['Topic'];
type Job = components['schemas']['Job'];

const TYPE_OPTIONS: ReadonlyArray<{ value: ExamType; label: string }> = [
  { value: 'gate', label: 'Gate (unlocks internet time)' },
  { value: 'formal', label: 'Formal (graded only)' },
];

const TYPE_LABEL: Record<ExamType, string> = {
  gate: 'Gate',
  formal: 'Formal',
};

const REWARD_OPTIONS: ReadonlyArray<{ value: RewardStyle; label: string }> = [
  { value: 'flat', label: 'Flat — full time on a pass' },
  { value: 'scaled', label: 'Scaled — time × score %' },
];

const REWARD_LABEL: Record<RewardStyle, string> = {
  flat: 'Flat reward',
  scaled: 'Scaled reward',
};

const SIZE_PRESETS: readonly number[] = [5, 10, 20];

/** Spec §10 defaults, mirrored client-side so the form prefills sensibly. */
const DEFAULTS = {
  type: 'gate' as ExamType,
  size: 20,
  passBar: 70,
  cooldownMin: 10,
  rewardStyle: 'flat' as RewardStyle,
};

interface ExamFormState {
  name: string;
  type: ExamType;
  scopeTopicIds: string[];
  size: number;
  passBar: number;
  cooldownMin: number;
  rewardStyle: RewardStyle;
}

function emptyForm(): ExamFormState {
  return {
    name: '',
    type: DEFAULTS.type,
    scopeTopicIds: [],
    size: DEFAULTS.size,
    passBar: DEFAULTS.passBar,
    cooldownMin: DEFAULTS.cooldownMin,
    rewardStyle: DEFAULTS.rewardStyle,
  };
}

function formFromExam(exam: ExamDefinition): ExamFormState {
  return {
    name: exam.name,
    type: exam.type,
    scopeTopicIds: [...exam.scopeTopicIds],
    size: exam.size,
    passBar: exam.passBar,
    cooldownMin: exam.cooldownMin,
    rewardStyle: exam.rewardStyle,
  };
}

export default function SubjectExams() {
  const { subjectId } = useParams<{ subjectId: string }>();
  const navigate = useNavigate();

  const examsQuery = useExamDefinitions(subjectId);
  const topicsQuery = useTopics(subjectId);
  const createExam = useCreateExamDefinition();
  const updateExam = useUpdateExamDefinition();
  const deleteExam = useDeleteExamDefinition();

  const generateExam = useGenerateExam();
  const queryClient = useQueryClient();
  const { toast } = useToast();

  // Dialog state: `null` = closed; otherwise create (no exam) or edit.
  const [editor, setEditor] = useState<
    { mode: 'create' } | { mode: 'edit'; exam: ExamDefinition } | null
  >(null);
  const [confirm, setConfirm] = useState<ExamDefinition | null>(null);

  // Generate-exam flow: dialog open state + the async job to poll.
  const [genOpen, setGenOpen] = useState(false);
  const [genJobId, setGenJobId] = useState<string | null>(null);
  const genJob = useJob(genJobId ?? undefined);
  const genStatus = genJob.data?.status;
  const generating =
    generateExam.isPending ||
    genStatus === 'queued' ||
    genStatus === 'processing';

  useEffect(() => {
    if (genStatus === 'ready') {
      if (subjectId) {
        void queryClient.invalidateQueries({
          queryKey: examDefinitionKeys.lists(subjectId),
        });
      }
      toast('Exam generated — it’s ready to take.', { variant: 'success' });
      setGenJobId(null);
      setGenOpen(false);
    } else if (genStatus === 'error') {
      toast(genJob.data?.error ?? 'Exam generation failed.', {
        variant: 'danger',
      });
      setGenJobId(null);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [genStatus]);

  const topics = topicsQuery.data?.items ?? [];
  const topicName = (id: string) =>
    topics.find((t) => t.id === id)?.name ?? 'Unknown topic';

  function openCreate() {
    setEditor({ mode: 'create' });
  }

  function openEdit(exam: ExamDefinition) {
    setEditor({ mode: 'edit', exam });
  }

  function closeEditor() {
    setEditor(null);
  }

  async function handleDelete() {
    if (!confirm || !subjectId) return;
    await deleteExam.mutateAsync({ id: confirm.id, subjectId });
    setConfirm(null);
  }

  return (
    <div className="space-y-6">
      <PageHeader
        as="h2"
        title="Exams"
        subtitle="Define exam templates for this subject. Gate exams unlock internet time when a student passes; formal exams are graded only."
        actions={
          <div className="flex items-center gap-2">
            <Button
              variant="secondary"
              onClick={() => setGenOpen(true)}
              disabled={!subjectId}
              leadingIcon={<Wand2 className="h-4 w-4" aria-hidden="true" />}
            >
              Generate exam
            </Button>
            <Button
              onClick={openCreate}
              disabled={!subjectId}
              leadingIcon={<Plus className="h-4 w-4" aria-hidden="true" />}
            >
              New exam
            </Button>
          </div>
        }
      />

      {examsQuery.isPending ? (
        <ExamsSkeleton />
      ) : examsQuery.isError ? (
        <ErrorState
          message={examsQuery.error.message}
          onRetry={() => void examsQuery.refetch()}
          retrying={examsQuery.isFetching}
        />
      ) : examsQuery.data.items.length === 0 ? (
        <EmptyState
          icon={<ClipboardList className="h-5 w-5" />}
          title="No exams yet"
          description="Create an exam template to let your student earn internet time or check their understanding of this subject."
          action={
            <Button
              onClick={openCreate}
              disabled={!subjectId}
              leadingIcon={<Plus className="h-4 w-4" aria-hidden="true" />}
            >
              New exam
            </Button>
          }
        />
      ) : (
        <ul className="space-y-3" aria-label="Exam definitions">
          {examsQuery.data.items.map((exam) => (
            <li key={exam.id}>
              <ExamRow
                exam={exam}
                topicName={topicName}
                onPreview={() =>
                  navigate(
                    `/parent/subjects/${subjectId}/exams/${exam.id}/preview`,
                  )
                }
                onEdit={() => openEdit(exam)}
                onDelete={() => setConfirm(exam)}
              />
            </li>
          ))}
        </ul>
      )}

      {editor && subjectId && (
        <ExamDialog
          key={editor.mode === 'edit' ? editor.exam.id : 'create'}
          title={editor.mode === 'create' ? 'New exam' : 'Edit exam'}
          initial={
            editor.mode === 'edit' ? formFromExam(editor.exam) : emptyForm()
          }
          topics={topics}
          topicsLoading={topicsQuery.isPending}
          submitting={
            editor.mode === 'create' ? createExam.isPending : updateExam.isPending
          }
          onClose={closeEditor}
          onSubmit={async (form) => {
            if (editor.mode === 'create') {
              const body: CreateExamDefinition = {
                subjectId,
                name: form.name.trim(),
                type: form.type,
                scopeTopicIds: form.scopeTopicIds,
                size: form.size,
                passBar: form.passBar,
                cooldownMin: form.cooldownMin,
                rewardStyle: form.rewardStyle,
              };
              await createExam.mutateAsync(body);
            } else {
              await updateExam.mutateAsync({
                id: editor.exam.id,
                subjectId,
                changes: {
                  name: form.name.trim(),
                  type: form.type,
                  scopeTopicIds: form.scopeTopicIds,
                  size: form.size,
                  passBar: form.passBar,
                  cooldownMin: form.cooldownMin,
                  rewardStyle: form.rewardStyle,
                },
              });
            }
            closeEditor();
          }}
        />
      )}

      {confirm && (
        <ConfirmDialog
          open
          danger
          title="Delete exam"
          message={`Permanently delete the exam “${confirm.name}”? Past attempts are kept, but no new attempts can be started. This cannot be undone.`}
          confirmLabel="Delete"
          cancelLabel="Cancel"
          onCancel={() => setConfirm(null)}
          onConfirm={handleDelete}
        />
      )}

      {genOpen && subjectId && (
        <GenerateExamDialog
          topics={topics}
          submitting={generating}
          job={genJobId ? genJob.data : undefined}
          onClose={() => {
            if (!generating) setGenOpen(false);
          }}
          onGenerate={async (form) => {
            const job = await generateExam.mutateAsync({
              subjectId,
              name: form.name.trim(),
              passBar: form.passBar,
              difficulty: form.difficulty || undefined,
              topics: form.topics,
            });
            setGenJobId(job.id);
          }}
        />
      )}
    </div>
  );
}

interface GenerateExamForm {
  name: string;
  passBar: number;
  difficulty: string;
  topics: { topicId: string; count: number }[];
}

interface GenerateExamDialogProps {
  topics: Topic[];
  submitting: boolean;
  job: Job | undefined;
  onClose: () => void;
  onGenerate: (form: GenerateExamForm) => Promise<void> | void;
}

/**
 * Build a ready-to-take exam by picking how many questions to generate from each
 * topic. The AI authors the questions from the syllabus (no question bank), and
 * the exam is pinned to exactly those questions.
 */
function GenerateExamDialog({
  topics,
  submitting,
  job,
  onClose,
  onGenerate,
}: GenerateExamDialogProps) {
  const [name, setName] = useState('');
  const [passBar, setPassBar] = useState(70);
  const [difficulty, setDifficulty] = useState('');
  // topicId -> count (0 = not included).
  const [counts, setCounts] = useState<Record<string, number>>({});
  const [touched, setTouched] = useState(false);

  const selected = topics
    .map((t) => ({ topicId: t.id, count: counts[t.id] ?? 0 }))
    .filter((t) => t.count > 0);
  const total = selected.reduce((sum, t) => sum + t.count, 0);

  const nameError =
    touched && name.trim().length === 0 ? 'Name is required.' : undefined;
  const topicError =
    touched && selected.length === 0
      ? 'Pick at least one topic and a question count.'
      : undefined;

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setTouched(true);
    if (name.trim().length === 0 || selected.length === 0 || total > 60) return;
    void onGenerate({ name, passBar, difficulty, topics: selected });
  }

  return (
    <Dialog
      open
      onClose={onClose}
      title="Generate an exam"
      description="Choose how many questions to generate from each topic. The AI writes them from the syllabus — no question bank needed — and pins them into a ready-to-take exam."
      size="lg"
      footer={
        <>
          <Button
            type="button"
            variant="ghost"
            onClick={onClose}
            disabled={submitting}
          >
            Cancel
          </Button>
          <Button
            type="submit"
            form="generate-exam-form"
            loading={submitting}
            disabled={total === 0 || total > 60}
            leadingIcon={<Wand2 className="h-4 w-4" aria-hidden="true" />}
          >
            {submitting ? 'Generating…' : `Generate exam (${total})`}
          </Button>
        </>
      }
    >
      <form
        id="generate-exam-form"
        onSubmit={handleSubmit}
        className="space-y-5"
      >
        <TextInput
          label="Exam name"
          required
          autoFocus
          value={name}
          error={nameError}
          onChange={(e) => setName(e.target.value)}
          onBlur={() => setTouched(true)}
          placeholder="e.g. Trigonometry practice test"
        />

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div className="flex flex-col gap-1.5">
            <span className="text-sm font-semibold text-foreground">
              Pass mark (%)
            </span>
            <NumberStepper
              label="Pass mark percentage"
              value={passBar}
              min={0}
              max={100}
              step={5}
              onChange={setPassBar}
            />
          </div>
          <Select
            label="Difficulty"
            value={difficulty}
            options={[
              { value: '', label: 'A spread (default)' },
              { value: 'easy', label: 'Easy' },
              { value: 'medium', label: 'Medium' },
              { value: 'hard', label: 'Hard' },
            ]}
            onChange={(e) => setDifficulty(e.target.value)}
          />
        </div>

        <div>
          <div className="mb-1.5 flex items-center justify-between">
            <span className="text-sm font-semibold text-foreground">
              Questions per topic
            </span>
            <span className="text-sm text-foreground-muted">
              {total} total{total > 60 ? ' — max 60' : ''}
            </span>
          </div>
          {topicError && (
            <p role="alert" className="mb-2 text-sm text-danger">
              {topicError}
            </p>
          )}
          {topics.length === 0 ? (
            <p className="rounded-card border border-dashed border-border p-3 text-sm text-foreground-muted">
              This subject has no topics yet. Add topics first.
            </p>
          ) : (
            <ul className="max-h-72 space-y-1 overflow-y-auto rounded-card border border-border p-2">
              {topics.map((t) => (
                <li
                  key={t.id}
                  className="flex items-center justify-between gap-3 rounded-md px-2 py-1.5 hover:bg-surface-muted/50"
                >
                  <span className="min-w-0 flex-1 truncate text-sm text-foreground">
                    {t.name}
                  </span>
                  <NumberStepper
                    label={`Questions from ${t.name}`}
                    value={counts[t.id] ?? 0}
                    min={0}
                    max={20}
                    onChange={(v) =>
                      setCounts((c) => ({ ...c, [t.id]: v }))
                    }
                  />
                </li>
              ))}
            </ul>
          )}
        </div>

        {job && (job.status === 'queued' || job.status === 'processing') && (
          <JobStatus
            status={job.status}
            progress={job.progress}
            label="Generating exam questions"
          />
        )}
      </form>
    </Dialog>
  );
}

interface ExamRowProps {
  exam: ExamDefinition;
  topicName: (id: string) => string;
  onPreview: () => void;
  onEdit: () => void;
  onDelete: () => void;
}

function ExamRow({ exam, topicName, onPreview, onEdit, onDelete }: ExamRowProps) {
  const wholeSubject = exam.scopeTopicIds.length === 0;
  return (
    <Card padding="md" className="flex flex-col gap-3">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <span className="truncate font-display text-base font-semibold text-foreground">
              {exam.name}
            </span>
            <Badge tone={exam.type === 'gate' ? 'info' : 'neutral'} size="sm">
              {TYPE_LABEL[exam.type]}
            </Badge>
          </div>
          <p className="mt-1 text-sm text-foreground-muted">
            {exam.size} questions · pass {exam.passBar}% · cooldown{' '}
            {exam.cooldownMin} min · {REWARD_LABEL[exam.rewardStyle]}
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-1">
          <Button
            variant="secondary"
            size="sm"
            onClick={onPreview}
            leadingIcon={<Play className="h-4 w-4" aria-hidden="true" />}
          >
            Preview
          </Button>
          <Button variant="ghost" size="sm" onClick={onEdit}>
            Edit
          </Button>
          <Button variant="ghost" size="sm" onClick={onDelete}>
            Delete
          </Button>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <span className="text-xs font-semibold uppercase tracking-wide text-foreground-muted">
          Scope
        </span>
        {wholeSubject ? (
          <Badge tone="neutral" size="sm">
            Whole subject
          </Badge>
        ) : (
          exam.scopeTopicIds.map((id) => (
            <Badge key={id} tone="neutral" size="sm">
              {topicName(id)}
            </Badge>
          ))
        )}
      </div>
    </Card>
  );
}

interface ExamDialogProps {
  title: string;
  initial: ExamFormState;
  topics: components['schemas']['Topic'][];
  topicsLoading: boolean;
  submitting: boolean;
  onClose: () => void;
  onSubmit: (form: ExamFormState) => Promise<void> | void;
}

function ExamDialog({
  title,
  initial,
  topics,
  topicsLoading,
  submitting,
  onClose,
  onSubmit,
}: ExamDialogProps) {
  const [form, setForm] = useState<ExamFormState>(initial);
  const [touched, setTouched] = useState(false);

  const nameError =
    touched && form.name.trim().length === 0 ? 'A name is required.' : undefined;

  function patch(changes: Partial<ExamFormState>) {
    setForm((f) => ({ ...f, ...changes }));
  }

  function toggleTopic(id: string) {
    setForm((f) => ({
      ...f,
      scopeTopicIds: f.scopeTopicIds.includes(id)
        ? f.scopeTopicIds.filter((t) => t !== id)
        : [...f.scopeTopicIds, id],
    }));
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setTouched(true);
    if (form.name.trim().length === 0) {
      return;
    }
    void onSubmit(form);
  }

  return (
    <Dialog open onClose={onClose} title={title} size="md">
      <form onSubmit={handleSubmit} className="space-y-5">
        <TextInput
          label="Name"
          required
          autoFocus
          value={form.name}
          error={nameError}
          placeholder="e.g. Chapter 3 quiz"
          onChange={(e) => patch({ name: e.target.value })}
          onBlur={() => setTouched(true)}
        />

        <Select
          label="Type"
          value={form.type}
          onChange={(e) => patch({ type: e.target.value as ExamType })}
          options={TYPE_OPTIONS.map((o) => ({
            value: o.value,
            label: o.label,
          }))}
        />

        <fieldset>
          <legend className="text-sm font-semibold text-foreground">
            Scope
          </legend>
          <p className="mt-0.5 text-sm text-foreground-muted">
            Select topics to draw questions from. Leave all unchecked to cover
            the whole subject.
          </p>
          {topicsLoading ? (
            <p className="mt-2 text-sm text-foreground-muted">
              Loading topics…
            </p>
          ) : topics.length === 0 ? (
            <p className="mt-2 text-sm text-foreground-muted">
              No topics yet — this exam will cover the whole subject.
            </p>
          ) : (
            <div className="mt-2 max-h-40 space-y-1 overflow-y-auto rounded-md border border-border p-2">
              {topics.map((topic) => {
                const checked = form.scopeTopicIds.includes(topic.id);
                return (
                  <label
                    key={topic.id}
                    className="flex cursor-pointer items-center gap-2 rounded px-2 py-1 text-sm text-foreground hover:bg-surface-muted"
                  >
                    <input
                      type="checkbox"
                      className="h-4 w-4 rounded border-border text-primary focus:ring-ring"
                      checked={checked}
                      onChange={() => toggleTopic(topic.id)}
                    />
                    <span className="truncate">{topic.name}</span>
                  </label>
                );
              })}
            </div>
          )}
        </fieldset>

        <fieldset>
          <legend className="text-sm font-semibold text-foreground">
            Size
          </legend>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            {SIZE_PRESETS.map((preset) => {
              const selected = form.size === preset;
              return (
                <button
                  key={preset}
                  type="button"
                  aria-pressed={selected}
                  onClick={() => patch({ size: preset })}
                  className={`rounded-md border px-4 py-2 text-sm font-semibold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${
                    selected
                      ? 'border-primary bg-primary-soft text-foreground'
                      : 'border-border bg-surface text-foreground hover:bg-surface-muted'
                  }`}
                >
                  {preset}
                </button>
              );
            })}
            <TextInput
              label="Custom"
              type="number"
              min={1}
              value={String(form.size)}
              onChange={(e) =>
                patch({ size: clampInt(e.target.value, 1, DEFAULTS.size) })
              }
              className="w-28"
            />
          </div>
        </fieldset>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <TextInput
            label="Pass bar (%)"
            type="number"
            min={0}
            max={100}
            value={String(form.passBar)}
            onChange={(e) =>
              patch({ passBar: clampInt(e.target.value, 0, DEFAULTS.passBar) })
            }
          />
          <TextInput
            label="Cooldown (minutes)"
            type="number"
            min={0}
            value={String(form.cooldownMin)}
            onChange={(e) =>
              patch({
                cooldownMin: clampInt(e.target.value, 0, DEFAULTS.cooldownMin),
              })
            }
          />
        </div>

        <Select
          label="Reward style"
          value={form.rewardStyle}
          onChange={(e) =>
            patch({ rewardStyle: e.target.value as RewardStyle })
          }
          options={REWARD_OPTIONS.map((o) => ({
            value: o.value,
            label: o.label,
          }))}
        />

        <div className="flex justify-end gap-2">
          <Button
            type="button"
            variant="ghost"
            onClick={onClose}
            disabled={submitting}
          >
            Cancel
          </Button>
          <Button
            type="submit"
            loading={submitting}
            leadingIcon={<Check className="h-4 w-4" aria-hidden="true" />}
          >
            Save
          </Button>
        </div>
      </form>
    </Dialog>
  );
}

/** Parse a numeric input value to an int within [min, max], falling back. */
function clampInt(raw: string, min: number, fallback: number): number {
  const parsed = Number.parseInt(raw, 10);
  if (Number.isNaN(parsed)) {
    return fallback;
  }
  return parsed < min ? min : parsed;
}

function ExamsSkeleton() {
  return (
    <div className="space-y-3" aria-busy="true" aria-label="Loading exams">
      {Array.from({ length: 3 }).map((_, i) => (
        <div
          key={i}
          className="h-24 animate-pulse rounded-md bg-surface-muted"
        />
      ))}
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
      className="rounded-card border border-danger bg-danger-soft p-4 text-center"
    >
      <h3 className="font-display text-base font-semibold text-danger">
        Couldn&rsquo;t load exams
      </h3>
      <p className="mt-1 text-sm text-foreground-muted">{message}</p>
      <div className="mt-5">
        <Button
          variant="secondary"
          size="sm"
          onClick={onRetry}
          loading={retrying}
          leadingIcon={<RotateCcw className="h-4 w-4" aria-hidden="true" />}
        >
          Try again
        </Button>
      </div>
    </div>
  );
}
