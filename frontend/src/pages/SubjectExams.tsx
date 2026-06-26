import { useState } from 'react';
import type { FormEvent } from 'react';
import { useParams } from 'react-router-dom';

import { Badge } from '../components';
import { Button } from '../components';
import { Card } from '../components';
import { Select } from '../components';
import { TextInput } from '../components';
import type { components } from '../api/schema';
import {
  useCreateExamDefinition,
  useDeleteExamDefinition,
  useExamDefinitions,
  useTopics,
  useUpdateExamDefinition,
} from '../hooks';

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

  const examsQuery = useExamDefinitions(subjectId);
  const topicsQuery = useTopics(subjectId);
  const createExam = useCreateExamDefinition();
  const updateExam = useUpdateExamDefinition();
  const deleteExam = useDeleteExamDefinition();

  // Dialog state: `null` = closed; otherwise create (no exam) or edit.
  const [editor, setEditor] = useState<
    { mode: 'create' } | { mode: 'edit'; exam: ExamDefinition } | null
  >(null);
  const [confirm, setConfirm] = useState<ExamDefinition | null>(null);

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
      <header className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h2 className="font-display text-display-sm text-foreground">Exams</h2>
          <p className="mt-1 text-sm text-foreground-muted">
            Define exam templates for this subject. Gate exams unlock internet
            time when a student passes; formal exams are graded only.
          </p>
        </div>
        <Button onClick={openCreate} disabled={!subjectId}>
          New exam
        </Button>
      </header>

      {examsQuery.isPending ? (
        <ExamsSkeleton />
      ) : examsQuery.isError ? (
        <ErrorState
          message={examsQuery.error.message}
          onRetry={() => void examsQuery.refetch()}
          retrying={examsQuery.isFetching}
        />
      ) : examsQuery.data.items.length === 0 ? (
        <EmptyState onAdd={openCreate} disabled={!subjectId} />
      ) : (
        <ul className="space-y-3" aria-label="Exam definitions">
          {examsQuery.data.items.map((exam) => (
            <li key={exam.id}>
              <ExamRow
                exam={exam}
                topicName={topicName}
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
          title="Delete exam"
          body={`Permanently delete the exam “${confirm.name}”? Past attempts are kept, but no new attempts can be started. This cannot be undone.`}
          confirmLabel="Delete"
          busy={deleteExam.isPending}
          onCancel={() => setConfirm(null)}
          onConfirm={() => void handleDelete()}
        />
      )}
    </div>
  );
}

interface ExamRowProps {
  exam: ExamDefinition;
  topicName: (id: string) => string;
  onEdit: () => void;
  onDelete: () => void;
}

function ExamRow({ exam, topicName, onEdit, onDelete }: ExamRowProps) {
  const wholeSubject = exam.scopeTopicIds.length === 0;
  return (
    <Card padding="md" className="flex flex-col gap-3">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <span className="truncate font-display font-bold text-foreground">
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
    <Overlay labelledBy="exam-dialog-title" onClose={onClose}>
      <form
        onSubmit={handleSubmit}
        className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-card bg-surface p-6 shadow-card"
      >
        <h2
          id="exam-dialog-title"
          className="font-display text-display-sm text-foreground"
        >
          {title}
        </h2>

        <div className="mt-5 space-y-5">
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
        </div>

        <div className="mt-6 flex justify-end gap-2">
          <Button
            type="button"
            variant="ghost"
            onClick={onClose}
            disabled={submitting}
          >
            Cancel
          </Button>
          <Button type="submit" loading={submitting}>
            Save
          </Button>
        </div>
      </form>
    </Overlay>
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

interface ConfirmDialogProps {
  title: string;
  body: string;
  confirmLabel: string;
  busy: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}

function ConfirmDialog({
  title,
  body,
  confirmLabel,
  busy,
  onCancel,
  onConfirm,
}: ConfirmDialogProps) {
  return (
    <Overlay labelledBy="delete-exam-title" onClose={onCancel}>
      <div
        role="alertdialog"
        aria-labelledby="delete-exam-title"
        aria-describedby="delete-exam-body"
        className="w-full max-w-sm rounded-card bg-surface p-6 shadow-card"
      >
        <h2
          id="delete-exam-title"
          className="font-display text-display-sm text-foreground"
        >
          {title}
        </h2>
        <p id="delete-exam-body" className="mt-2 text-sm text-foreground-muted">
          {body}
        </p>
        <div className="mt-6 flex justify-end gap-2">
          <Button variant="ghost" onClick={onCancel} disabled={busy}>
            Cancel
          </Button>
          <Button variant="danger" loading={busy} onClick={onConfirm}>
            {confirmLabel}
          </Button>
        </div>
      </div>
    </Overlay>
  );
}

interface OverlayProps {
  labelledBy: string;
  onClose: () => void;
  children: React.ReactNode;
}

/** Minimal modal overlay: backdrop click + role=dialog wrapper. */
function Overlay({ labelledBy, onClose, children }: OverlayProps) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-foreground/40 p-4"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={labelledBy}
        className="flex w-full justify-center"
        onClick={(e) => e.stopPropagation()}
      >
        {children}
      </div>
    </div>
  );
}

function ExamsSkeleton() {
  return (
    <div className="space-y-3" aria-busy="true" aria-label="Loading exams">
      {Array.from({ length: 3 }).map((_, i) => (
        <div
          key={i}
          className="h-24 animate-pulse rounded-card border border-border bg-surface-muted"
        />
      ))}
    </div>
  );
}

interface EmptyStateProps {
  onAdd: () => void;
  disabled: boolean;
}

function EmptyState({ onAdd, disabled }: EmptyStateProps) {
  return (
    <div className="rounded-card border border-dashed border-border bg-surface p-12 text-center">
      <p className="text-4xl" aria-hidden="true">
        📝
      </p>
      <h3 className="mt-3 font-display text-display-sm text-foreground">
        No exams yet
      </h3>
      <p className="mx-auto mt-1 max-w-sm text-sm text-foreground-muted">
        Create an exam template to let your student earn internet time or check
        their understanding of this subject.
      </p>
      <div className="mt-5">
        <Button onClick={onAdd} disabled={disabled}>
          New exam
        </Button>
      </div>
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
      <h3 className="font-display text-display-sm text-danger">
        Couldn&rsquo;t load exams
      </h3>
      <p className="mt-1 text-sm text-foreground-muted">{message}</p>
      <div className="mt-5">
        <Button variant="secondary" onClick={onRetry} loading={retrying}>
          Try again
        </Button>
      </div>
    </div>
  );
}
