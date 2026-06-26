import { useMemo, useState } from 'react';
import type { FormEvent, ReactNode } from 'react';
import { useParams } from 'react-router-dom';

import { Badge } from '../components';
import { Button } from '../components';
import { Card } from '../components';
import { Select } from '../components';
import type { components } from '../api/schema';
import {
  useCreateQuestion,
  useDeleteQuestion,
  useQuestions,
  useTopics,
  useUpdateQuestion,
} from '../hooks';

/**
 * P09 — Question bank (screen 2.8, manual)
 *
 * Rendered as the `questions` sub-tab of the Subject detail page (P05); the
 * owning subject id comes from the `:subjectId` route param. Lets the parent
 * manually author and maintain the multiple-choice question bank that exams are
 * assembled from.
 *
 * Each question lists its prompt, options (with the correct one marked), topic
 * tag, difficulty and enabled state. Row actions: edit, disable / enable, and
 * delete (delete is confirmed first).
 *
 * The author dialog mirrors the server-side validation (see A09): a non-empty
 * prompt, at least four non-empty options, and exactly one option marked
 * correct. Options are repeatable inputs that can be added / removed (never
 * below four). The "Generate" affordance is shown but disabled — automated
 * generation arrives in Phase 2.
 *
 * All data flows through the H05 useQuestions hooks (and H03 useTopics for the
 * topic tag / filter); nothing here hand-rolls a fetch. The U05 (option editor),
 * U08 (table) and U19 (row actions / confirm) roles are composed inline from the
 * available shared primitives and the design tokens.
 */

type Question = components['schemas']['Question'];
type CreateQuestion = components['schemas']['CreateQuestion'];
type Topic = components['schemas']['Topic'];
type Difficulty = components['schemas']['Difficulty'];

const MIN_OPTIONS = 4;
const MAX_OPTIONS = 8;

const DIFFICULTY_OPTIONS: Array<{ value: Difficulty; label: string }> = [
  { value: 'easy', label: 'Easy' },
  { value: 'medium', label: 'Medium' },
  { value: 'hard', label: 'Hard' },
];

const DIFFICULTY_TONE: Record<Difficulty, 'success' | 'warning' | 'danger'> = {
  easy: 'success',
  medium: 'warning',
  hard: 'danger',
};

const DIFFICULTY_LABEL: Record<Difficulty, string> = {
  easy: 'Easy',
  medium: 'Medium',
  hard: 'Hard',
};

const ALL_TOPICS = '__all__';
const NO_TOPIC = '__none__';

interface QuestionFormState {
  text: string;
  topicId: string;
  difficulty: Difficulty;
  options: string[];
  correctIndex: number;
}

function emptyForm(): QuestionFormState {
  return {
    text: '',
    topicId: '',
    difficulty: 'medium',
    options: ['', '', '', ''],
    correctIndex: 0,
  };
}

function formFromQuestion(question: Question): QuestionFormState {
  const options = question.options.map((o) => o.text);
  const correctIndex = Math.max(
    0,
    question.options.findIndex((o) => o.id === question.correctOptionId),
  );
  return {
    text: question.text,
    topicId: question.topicId ?? '',
    difficulty: question.difficulty,
    options: options.length >= MIN_OPTIONS ? options : [...options, '', '', '', ''].slice(0, MIN_OPTIONS),
    correctIndex,
  };
}

export default function SubjectQuestions() {
  const { subjectId } = useParams<{ subjectId: string }>();

  const [topicFilter, setTopicFilter] = useState<string>(ALL_TOPICS);

  const topicsQuery = useTopics(subjectId);
  const questionsQuery = useQuestions(
    subjectId,
    topicFilter === ALL_TOPICS ? undefined : topicFilter,
  );

  const createQuestion = useCreateQuestion();
  const updateQuestion = useUpdateQuestion();
  const deleteQuestion = useDeleteQuestion();

  // Dialog state: null = closed; otherwise create or edit (with the question).
  const [editor, setEditor] = useState<
    { mode: 'create' } | { mode: 'edit'; question: Question } | null
  >(null);
  const [confirm, setConfirm] = useState<Question | null>(null);

  const topics: Topic[] = topicsQuery.data?.items ?? [];
  const topicById = useMemo(() => {
    const map = new Map<string, Topic>();
    for (const t of topics) map.set(t.id, t);
    return map;
  }, [topics]);

  const filterOptions = [
    { value: ALL_TOPICS, label: 'All topics' },
    ...topics.map((t) => ({ value: t.id, label: t.name })),
  ];

  function openCreate() {
    setEditor({ mode: 'create' });
  }

  function openEdit(question: Question) {
    setEditor({ mode: 'edit', question });
  }

  function closeEditor() {
    setEditor(null);
  }

  async function toggleEnabled(question: Question) {
    await updateQuestion.mutateAsync({
      id: question.id,
      changes: { enabled: !question.enabled },
    });
  }

  async function handleDelete() {
    if (!confirm) return;
    await deleteQuestion.mutateAsync(confirm.id);
    setConfirm(null);
  }

  async function handleSubmit(form: QuestionFormState) {
    const cleanedOptions = form.options.map((o) => o.trim());
    if (!editor) return;

    if (editor.mode === 'create') {
      const body: CreateQuestion = {
        subjectId: subjectId as string,
        topicId: form.topicId || undefined,
        text: form.text.trim(),
        options: cleanedOptions.map((text) => ({ text })),
        correctOptionIndex: form.correctIndex,
        difficulty: form.difficulty,
      };
      await createQuestion.mutateAsync(body);
    } else {
      // The PUT body is the full Question shape; reuse the existing option ids
      // where positions are unchanged so the answer key stays stable, and mint
      // synthetic ids for any newly added rows (the server re-keys on persist).
      const existing = editor.question.options;
      const options = cleanedOptions.map((text, i) => ({
        id: existing[i]?.id ?? `new-${i}`,
        text,
      }));
      await updateQuestion.mutateAsync({
        id: editor.question.id,
        changes: {
          topicId: form.topicId || undefined,
          text: form.text.trim(),
          options,
          correctOptionId: options[form.correctIndex]?.id,
          difficulty: form.difficulty,
        },
      });
    }
    closeEditor();
  }

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h2 className="font-display text-display-sm text-foreground">
            Question bank
          </h2>
          <p className="mt-1 text-sm text-foreground-muted">
            Author the multiple-choice questions exams are built from.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="secondary"
            disabled
            title="Automatic generation arrives in a later release"
          >
            Generate
          </Button>
          <Button onClick={openCreate}>Add question</Button>
        </div>
      </header>

      {topics.length > 0 && (
        <div className="max-w-xs">
          <Select
            label="Filter by topic"
            value={topicFilter}
            options={filterOptions}
            onChange={(e) => setTopicFilter(e.target.value)}
          />
        </div>
      )}

      {questionsQuery.isPending ? (
        <QuestionsSkeleton />
      ) : questionsQuery.isError ? (
        <ErrorState
          message={questionsQuery.error.message}
          onRetry={() => void questionsQuery.refetch()}
          retrying={questionsQuery.isFetching}
        />
      ) : questionsQuery.data.items.length === 0 ? (
        <EmptyState
          filtered={topicFilter !== ALL_TOPICS}
          onAdd={openCreate}
          onClearFilter={() => setTopicFilter(ALL_TOPICS)}
        />
      ) : (
        <ul className="space-y-3" aria-label="Questions">
          {questionsQuery.data.items.map((question) => (
            <li key={question.id}>
              <QuestionRow
                question={question}
                topicName={
                  question.topicId
                    ? topicById.get(question.topicId)?.name
                    : undefined
                }
                onEdit={() => openEdit(question)}
                onToggle={() => void toggleEnabled(question)}
                onDelete={() => setConfirm(question)}
                toggling={
                  updateQuestion.isPending &&
                  updateQuestion.variables?.id === question.id
                }
              />
            </li>
          ))}
        </ul>
      )}

      {editor && (
        <QuestionDialog
          key={editor.mode === 'edit' ? editor.question.id : 'create'}
          title={editor.mode === 'create' ? 'Add question' : 'Edit question'}
          initial={
            editor.mode === 'edit'
              ? formFromQuestion(editor.question)
              : emptyForm()
          }
          topics={topics}
          submitting={
            editor.mode === 'create'
              ? createQuestion.isPending
              : updateQuestion.isPending
          }
          onClose={closeEditor}
          onSubmit={handleSubmit}
        />
      )}

      {confirm && (
        <ConfirmDialog
          title="Delete question"
          body={`Permanently delete this question? This cannot be undone.`}
          confirmLabel="Delete"
          busy={deleteQuestion.isPending}
          onCancel={() => setConfirm(null)}
          onConfirm={() => void handleDelete()}
        />
      )}
    </div>
  );
}

interface QuestionRowProps {
  question: Question;
  topicName?: string;
  onEdit: () => void;
  onToggle: () => void;
  onDelete: () => void;
  toggling: boolean;
}

function QuestionRow({
  question,
  topicName,
  onEdit,
  onToggle,
  onDelete,
  toggling,
}: QuestionRowProps) {
  return (
    <Card padding="md" className="flex flex-col gap-3">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="font-medium text-foreground">{question.text}</p>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <Badge tone={DIFFICULTY_TONE[question.difficulty]} size="sm">
              {DIFFICULTY_LABEL[question.difficulty]}
            </Badge>
            {topicName ? (
              <Badge tone="info" size="sm">
                {topicName}
              </Badge>
            ) : (
              <Badge tone="neutral" size="sm">
                No topic
              </Badge>
            )}
            {!question.enabled && (
              <Badge tone="neutral" size="sm">
                Disabled
              </Badge>
            )}
          </div>
        </div>
      </div>

      <ul className="space-y-1 text-sm" aria-label="Answer options">
        {question.options.map((option) => {
          const correct = option.id === question.correctOptionId;
          return (
            <li
              key={option.id}
              className={`flex items-center gap-2 rounded-md px-2 py-1 ${
                correct ? 'bg-success-soft text-foreground' : 'text-foreground-muted'
              }`}
            >
              <span
                aria-hidden="true"
                className={`flex h-4 w-4 shrink-0 items-center justify-center rounded-full border text-[10px] ${
                  correct
                    ? 'border-success bg-success text-surface'
                    : 'border-border'
                }`}
              >
                {correct ? '✓' : ''}
              </span>
              <span className={correct ? 'font-medium' : ''}>{option.text}</span>
              {correct && <span className="sr-only">(correct answer)</span>}
            </li>
          );
        })}
      </ul>

      <div className="flex items-center justify-end gap-1">
        <Button variant="ghost" size="sm" onClick={onEdit}>
          Edit
        </Button>
        <Button
          variant="ghost"
          size="sm"
          onClick={onToggle}
          loading={toggling}
        >
          {question.enabled ? 'Disable' : 'Enable'}
        </Button>
        <Button variant="ghost" size="sm" onClick={onDelete}>
          Delete
        </Button>
      </div>
    </Card>
  );
}

interface QuestionDialogProps {
  title: string;
  initial: QuestionFormState;
  topics: Topic[];
  submitting: boolean;
  onClose: () => void;
  onSubmit: (form: QuestionFormState) => Promise<void> | void;
}

function QuestionDialog({
  title,
  initial,
  topics,
  submitting,
  onClose,
  onSubmit,
}: QuestionDialogProps) {
  const [form, setForm] = useState<QuestionFormState>(initial);
  const [touched, setTouched] = useState(false);

  const trimmedOptions = form.options.map((o) => o.trim());
  const filledCount = trimmedOptions.filter((o) => o.length > 0).length;

  const textError =
    touched && form.text.trim().length === 0
      ? 'A question prompt is required.'
      : undefined;

  const optionsError =
    touched && filledCount < MIN_OPTIONS
      ? `At least ${MIN_OPTIONS} options are required.`
      : touched && trimmedOptions[form.correctIndex].length === 0
        ? 'The option marked correct must have text.'
        : undefined;

  const valid =
    form.text.trim().length > 0 &&
    filledCount >= MIN_OPTIONS &&
    trimmedOptions[form.correctIndex].length > 0;

  function setOption(index: number, value: string) {
    setForm((f) => {
      const options = [...f.options];
      options[index] = value;
      return { ...f, options };
    });
  }

  function addOption() {
    setForm((f) =>
      f.options.length >= MAX_OPTIONS
        ? f
        : { ...f, options: [...f.options, ''] },
    );
  }

  function removeOption(index: number) {
    setForm((f) => {
      if (f.options.length <= MIN_OPTIONS) return f;
      const options = f.options.filter((_, i) => i !== index);
      let correctIndex = f.correctIndex;
      if (index === f.correctIndex) correctIndex = 0;
      else if (index < f.correctIndex) correctIndex -= 1;
      return { ...f, options, correctIndex };
    });
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setTouched(true);
    if (!valid) return;
    void onSubmit({ ...form, options: trimmedOptions });
  }

  const topicOptions = [
    { value: NO_TOPIC, label: 'No topic' },
    ...topics.map((t) => ({ value: t.id, label: t.name })),
  ];

  return (
    <Overlay labelledBy="question-dialog-title" onClose={onClose}>
      <form
        onSubmit={handleSubmit}
        className="flex max-h-[90vh] w-full max-w-lg flex-col rounded-card bg-surface shadow-card"
      >
        <h2
          id="question-dialog-title"
          className="border-b border-border px-6 py-4 font-display text-display-sm text-foreground"
        >
          {title}
        </h2>

        <div className="space-y-5 overflow-y-auto px-6 py-5">
          <div>
            <label
              htmlFor="question-text"
              className="block text-sm font-semibold text-foreground"
            >
              Question prompt
              <span aria-hidden="true" className="ml-0.5 text-danger">
                *
              </span>
            </label>
            <textarea
              id="question-text"
              required
              autoFocus
              rows={3}
              value={form.text}
              onChange={(e) =>
                setForm((f) => ({ ...f, text: e.target.value }))
              }
              onBlur={() => setTouched(true)}
              aria-invalid={Boolean(textError)}
              placeholder="e.g. What is the capital of France?"
              className="mt-1.5 w-full rounded-md border border-border bg-surface px-3 py-2 text-foreground shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            />
            {textError && (
              <p role="alert" className="mt-1 text-sm text-danger">
                {textError}
              </p>
            )}
          </div>

          <fieldset>
            <legend className="text-sm font-semibold text-foreground">
              Options
              <span aria-hidden="true" className="ml-0.5 text-danger">
                *
              </span>
            </legend>
            <p className="mt-0.5 text-xs text-foreground-muted">
              Provide at least {MIN_OPTIONS} options and select the correct one.
            </p>
            <ul className="mt-2 space-y-2">
              {form.options.map((option, index) => {
                const selected = form.correctIndex === index;
                return (
                  <li key={index} className="flex items-center gap-2">
                    <input
                      type="radio"
                      name="correct-option"
                      checked={selected}
                      onChange={() =>
                        setForm((f) => ({ ...f, correctIndex: index }))
                      }
                      aria-label={`Mark option ${index + 1} as correct`}
                      className="h-4 w-4 shrink-0 accent-primary"
                    />
                    <input
                      type="text"
                      value={option}
                      onChange={(e) => setOption(index, e.target.value)}
                      onBlur={() => setTouched(true)}
                      placeholder={`Option ${index + 1}`}
                      aria-label={`Option ${index + 1} text`}
                      className="min-w-0 flex-1 rounded-md border border-border bg-surface px-3 py-1.5 text-sm text-foreground shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    />
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={() => removeOption(index)}
                      disabled={form.options.length <= MIN_OPTIONS}
                      aria-label={`Remove option ${index + 1}`}
                    >
                      Remove
                    </Button>
                  </li>
                );
              })}
            </ul>
            {optionsError && (
              <p role="alert" className="mt-1.5 text-sm text-danger">
                {optionsError}
              </p>
            )}
            <div className="mt-2">
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={addOption}
                disabled={form.options.length >= MAX_OPTIONS}
              >
                Add option
              </Button>
            </div>
          </fieldset>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Select
              label="Topic"
              value={form.topicId === '' ? NO_TOPIC : form.topicId}
              options={topicOptions}
              onChange={(e) =>
                setForm((f) => ({
                  ...f,
                  topicId: e.target.value === NO_TOPIC ? '' : e.target.value,
                }))
              }
            />
            <Select
              label="Difficulty"
              value={form.difficulty}
              options={DIFFICULTY_OPTIONS}
              onChange={(e) =>
                setForm((f) => ({
                  ...f,
                  difficulty: e.target.value as Difficulty,
                }))
              }
            />
          </div>
        </div>

        <div className="flex justify-end gap-2 border-t border-border px-6 py-4">
          <Button
            type="button"
            variant="ghost"
            onClick={onClose}
            disabled={submitting}
          >
            Cancel
          </Button>
          <Button type="submit" loading={submitting} disabled={!valid && touched}>
            Save
          </Button>
        </div>
      </form>
    </Overlay>
  );
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
    <Overlay labelledBy="confirm-dialog-title" onClose={onCancel}>
      <div
        role="alertdialog"
        aria-labelledby="confirm-dialog-title"
        aria-describedby="confirm-dialog-body"
        className="w-full max-w-sm rounded-card bg-surface p-6 shadow-card"
      >
        <h2
          id="confirm-dialog-title"
          className="font-display text-display-sm text-foreground"
        >
          {title}
        </h2>
        <p id="confirm-dialog-body" className="mt-2 text-sm text-foreground-muted">
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
  children: ReactNode;
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

function QuestionsSkeleton() {
  return (
    <div className="space-y-3" aria-busy="true" aria-label="Loading questions">
      {Array.from({ length: 4 }).map((_, i) => (
        <div
          key={i}
          className="h-28 animate-pulse rounded-card border border-border bg-surface-muted"
        />
      ))}
    </div>
  );
}

interface EmptyStateProps {
  filtered: boolean;
  onAdd: () => void;
  onClearFilter: () => void;
}

function EmptyState({ filtered, onAdd, onClearFilter }: EmptyStateProps) {
  if (filtered) {
    return (
      <div className="rounded-card border border-dashed border-border bg-surface p-12 text-center">
        <h3 className="font-display text-display-sm text-foreground">
          No questions for this topic
        </h3>
        <p className="mx-auto mt-1 max-w-sm text-sm text-foreground-muted">
          There are no questions tagged with the selected topic yet.
        </p>
        <div className="mt-5 flex justify-center gap-2">
          <Button variant="secondary" onClick={onClearFilter}>
            Show all topics
          </Button>
          <Button onClick={onAdd}>Add question</Button>
        </div>
      </div>
    );
  }
  return (
    <div className="rounded-card border border-dashed border-border bg-surface p-12 text-center">
      <p className="text-4xl" aria-hidden="true">
        ❓
      </p>
      <h3 className="mt-3 font-display text-display-sm text-foreground">
        No questions yet
      </h3>
      <p className="mx-auto mt-1 max-w-sm text-sm text-foreground-muted">
        Add your first multiple-choice question to start building exams for this
        subject.
      </p>
      <div className="mt-5">
        <Button onClick={onAdd}>Add question</Button>
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
        Couldn&rsquo;t load questions
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
