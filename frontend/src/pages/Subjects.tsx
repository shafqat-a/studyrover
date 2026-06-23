import { useState } from 'react';
import type { FormEvent } from 'react';

import { Badge } from '../components/Badge';
import { Button } from '../components/Button';
import { Card } from '../components/Card';
import { TextInput } from '../components/TextInput';
import { iconGlyph } from '../components/ColorIconPicker';
import type { components } from '../api/schema';
import {
  useCreateSubject,
  useDeleteSubject,
  useSubjects,
  useUpdateSubject,
} from '../hooks/useSubjects';

/**
 * P04 — Subjects list (screen 2.2)
 *
 * A grid of subject cards (color + icon) with an "Add subject" dialog and per-card
 * edit / archive / delete row actions (delete + archive confirm before running).
 * All data flows through the H01 useSubjects hooks; nothing here hand-rolls fetch.
 * Cards navigate to the Subject detail page (P05) at `/parent/subjects/{id}`.
 *
 * States: loading (skeleton), error (retry), empty (call to action), and the
 * populated grid. The U11/U18/U19 primitives are not yet available in the shared
 * component set, so their roles (color/icon picker, empty state, confirm dialog)
 * are composed inline here from the available Button/TextInput/Card/Badge
 * primitives and the design tokens.
 */

type Subject = components['schemas']['Subject'];
type CreateSubject = components['schemas']['CreateSubject'];

/** Curated palette of design-token colors offered by the color picker. */
const COLOR_OPTIONS: ReadonlyArray<{ value: string; label: string }> = [
  { value: '#6366f1', label: 'Indigo' },
  { value: '#0ea5e9', label: 'Sky' },
  { value: '#10b981', label: 'Emerald' },
  { value: '#f59e0b', label: 'Amber' },
  { value: '#ef4444', label: 'Red' },
  { value: '#ec4899', label: 'Pink' },
  { value: '#8b5cf6', label: 'Violet' },
  { value: '#14b8a6', label: 'Teal' },
];

/** Curated set of emoji icons offered by the icon picker. */
const ICON_OPTIONS: readonly string[] = [
  '📚',
  '🧮',
  '🔬',
  '🌍',
  '🎨',
  '🎵',
  '💻',
  '📐',
  '🧪',
  '📖',
  '🗺️',
  '⚙️',
];

const DEFAULT_COLOR = COLOR_OPTIONS[0].value;
const DEFAULT_ICON = ICON_OPTIONS[0];

interface SubjectFormState {
  name: string;
  description: string;
  color: string;
  icon: string;
}

function emptyForm(): SubjectFormState {
  return {
    name: '',
    description: '',
    color: DEFAULT_COLOR,
    icon: DEFAULT_ICON,
  };
}

function formFromSubject(subject: Subject): SubjectFormState {
  return {
    name: subject.name,
    description: subject.description ?? '',
    color: subject.color ?? DEFAULT_COLOR,
    icon: subject.icon ?? DEFAULT_ICON,
  };
}

export default function Subjects() {
  const subjectsQuery = useSubjects();
  const createSubject = useCreateSubject();
  const updateSubject = useUpdateSubject();
  const deleteSubject = useDeleteSubject();

  // Dialog state: `null` = closed; otherwise create (no id) or edit (with id).
  const [editor, setEditor] = useState<
    { mode: 'create' } | { mode: 'edit'; subject: Subject } | null
  >(null);
  // Pending destructive confirmation (delete / archive).
  const [confirm, setConfirm] = useState<
    | { kind: 'delete' | 'archive'; subject: Subject }
    | null
  >(null);

  function openCreate() {
    setEditor({ mode: 'create' });
  }

  function openEdit(subject: Subject) {
    setEditor({ mode: 'edit', subject });
  }

  function closeEditor() {
    setEditor(null);
  }

  async function handleConfirm() {
    if (!confirm) return;
    if (confirm.kind === 'delete') {
      await deleteSubject.mutateAsync(confirm.subject.id);
    } else {
      await updateSubject.mutateAsync({
        id: confirm.subject.id,
        changes: { archived: true },
      });
    }
    setConfirm(null);
  }

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="font-display text-display-sm text-foreground">
            Subjects
          </h1>
          <p className="mt-1 text-sm text-foreground-muted">
            Organize study material, syllabi, and exams by subject.
          </p>
        </div>
        <Button onClick={openCreate}>Add subject</Button>
      </header>

      {subjectsQuery.isPending ? (
        <SubjectsSkeleton />
      ) : subjectsQuery.isError ? (
        <ErrorState
          message={subjectsQuery.error.message}
          onRetry={() => void subjectsQuery.refetch()}
          retrying={subjectsQuery.isFetching}
        />
      ) : subjectsQuery.data.items.length === 0 ? (
        <EmptyState onAdd={openCreate} />
      ) : (
        <ul
          className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3"
          aria-label="Subjects"
        >
          {subjectsQuery.data.items.map((subject) => (
            <li key={subject.id}>
              <SubjectCard
                subject={subject}
                onEdit={() => openEdit(subject)}
                onArchive={() => setConfirm({ kind: 'archive', subject })}
                onDelete={() => setConfirm({ kind: 'delete', subject })}
              />
            </li>
          ))}
        </ul>
      )}

      {editor && (
        <SubjectDialog
          key={editor.mode === 'edit' ? editor.subject.id : 'create'}
          title={editor.mode === 'create' ? 'Add subject' : 'Edit subject'}
          initial={
            editor.mode === 'edit'
              ? formFromSubject(editor.subject)
              : emptyForm()
          }
          submitting={
            editor.mode === 'create'
              ? createSubject.isPending
              : updateSubject.isPending
          }
          onClose={closeEditor}
          onSubmit={async (form) => {
            if (editor.mode === 'create') {
              const body: CreateSubject = {
                name: form.name.trim(),
                description: form.description.trim() || undefined,
                color: form.color,
                icon: form.icon,
              };
              await createSubject.mutateAsync(body);
            } else {
              await updateSubject.mutateAsync({
                id: editor.subject.id,
                changes: {
                  name: form.name.trim(),
                  description: form.description.trim() || undefined,
                  color: form.color,
                  icon: form.icon,
                },
              });
            }
            closeEditor();
          }}
        />
      )}

      {confirm && (
        <ConfirmDialog
          title={
            confirm.kind === 'delete' ? 'Delete subject' : 'Archive subject'
          }
          body={
            confirm.kind === 'delete'
              ? `Permanently delete “${confirm.subject.name}”? This also removes its sources, syllabus, and exams. This cannot be undone.`
              : `Archive “${confirm.subject.name}”? It will be hidden from active lists but can be restored later.`
          }
          confirmLabel={confirm.kind === 'delete' ? 'Delete' : 'Archive'}
          danger={confirm.kind === 'delete'}
          busy={
            confirm.kind === 'delete'
              ? deleteSubject.isPending
              : updateSubject.isPending
          }
          onCancel={() => setConfirm(null)}
          onConfirm={() => void handleConfirm()}
        />
      )}
    </div>
  );
}

interface SubjectCardProps {
  subject: Subject;
  onEdit: () => void;
  onArchive: () => void;
  onDelete: () => void;
}

function SubjectCard({
  subject,
  onEdit,
  onArchive,
  onDelete,
}: SubjectCardProps) {
  const color = subject.color ?? DEFAULT_COLOR;
  const icon = iconGlyph(subject.icon);
  return (
    <Card
      padding="md"
      className="flex h-full flex-col"
      style={{ borderTopColor: color, borderTopWidth: 4 }}
    >
      <div className="flex items-start justify-between gap-3">
        <a
          href={`/parent/subjects/${subject.id}`}
          className="group flex min-w-0 flex-1 items-center gap-3 rounded-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <span
            aria-hidden="true"
            className="flex h-11 w-11 shrink-0 items-center justify-center rounded-card text-2xl"
            style={{ backgroundColor: `${color}22` }}
          >
            {icon}
          </span>
          <span className="min-w-0">
            <span className="block truncate font-display font-bold text-foreground group-hover:underline">
              {subject.name}
            </span>
            {subject.description ? (
              <span className="mt-0.5 block truncate text-sm text-foreground-muted">
                {subject.description}
              </span>
            ) : null}
          </span>
        </a>
        {subject.archived && (
          <Badge tone="neutral" size="sm">
            Archived
          </Badge>
        )}
      </div>

      <div className="mt-4 flex items-center justify-end gap-1">
        <Button variant="ghost" size="sm" onClick={onEdit}>
          Edit
        </Button>
        {!subject.archived && (
          <Button variant="ghost" size="sm" onClick={onArchive}>
            Archive
          </Button>
        )}
        <Button variant="ghost" size="sm" onClick={onDelete}>
          Delete
        </Button>
      </div>
    </Card>
  );
}

interface SubjectDialogProps {
  title: string;
  initial: SubjectFormState;
  submitting: boolean;
  onClose: () => void;
  onSubmit: (form: SubjectFormState) => Promise<void> | void;
}

function SubjectDialog({
  title,
  initial,
  submitting,
  onClose,
  onSubmit,
}: SubjectDialogProps) {
  const [form, setForm] = useState<SubjectFormState>(initial);
  const [touched, setTouched] = useState(false);

  const nameError =
    touched && form.name.trim().length === 0
      ? 'Name is required.'
      : undefined;

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setTouched(true);
    if (form.name.trim().length === 0) {
      return;
    }
    void onSubmit(form);
  }

  return (
    <Overlay labelledBy="subject-dialog-title" onClose={onClose}>
      <form
        onSubmit={handleSubmit}
        className="w-full max-w-md rounded-card bg-surface p-6 shadow-card"
      >
        <h2
          id="subject-dialog-title"
          className="font-display text-display-sm text-foreground"
        >
          {title}
        </h2>

        <div className="mt-5 space-y-4">
          <TextInput
            label="Name"
            required
            autoFocus
            value={form.name}
            error={nameError}
            onChange={(e) =>
              setForm((f) => ({ ...f, name: e.target.value }))
            }
            onBlur={() => setTouched(true)}
            placeholder="e.g. Mathematics"
          />

          <TextInput
            label="Description"
            value={form.description}
            onChange={(e) =>
              setForm((f) => ({ ...f, description: e.target.value }))
            }
            hint="Optional — a short summary shown on the card."
            placeholder="Optional description"
          />

          <fieldset>
            <legend className="text-sm font-semibold text-foreground">
              Color
            </legend>
            <div className="mt-2 flex flex-wrap gap-2">
              {COLOR_OPTIONS.map((option) => {
                const selected = form.color === option.value;
                return (
                  <button
                    key={option.value}
                    type="button"
                    aria-label={option.label}
                    aria-pressed={selected}
                    onClick={() =>
                      setForm((f) => ({ ...f, color: option.value }))
                    }
                    className={`h-8 w-8 rounded-full border-2 transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-surface ${
                      selected
                        ? 'border-foreground'
                        : 'border-transparent'
                    }`}
                    style={{ backgroundColor: option.value }}
                  />
                );
              })}
            </div>
          </fieldset>

          <fieldset>
            <legend className="text-sm font-semibold text-foreground">
              Icon
            </legend>
            <div className="mt-2 flex flex-wrap gap-2">
              {ICON_OPTIONS.map((icon) => {
                const selected = form.icon === icon;
                return (
                  <button
                    key={icon}
                    type="button"
                    aria-label={`Icon ${icon}`}
                    aria-pressed={selected}
                    onClick={() => setForm((f) => ({ ...f, icon }))}
                    className={`flex h-9 w-9 items-center justify-center rounded-md border text-lg transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-surface ${
                      selected
                        ? 'border-primary bg-primary-soft'
                        : 'border-border bg-surface hover:bg-surface-muted'
                    }`}
                  >
                    <span aria-hidden="true">{icon}</span>
                  </button>
                );
              })}
            </div>
          </fieldset>
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

interface ConfirmDialogProps {
  title: string;
  body: string;
  confirmLabel: string;
  danger?: boolean;
  busy: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}

function ConfirmDialog({
  title,
  body,
  confirmLabel,
  danger = false,
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
        <p
          id="confirm-dialog-body"
          className="mt-2 text-sm text-foreground-muted"
        >
          {body}
        </p>
        <div className="mt-6 flex justify-end gap-2">
          <Button variant="ghost" onClick={onCancel} disabled={busy}>
            Cancel
          </Button>
          <Button
            variant={danger ? 'danger' : 'primary'}
            loading={busy}
            onClick={onConfirm}
          >
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

function SubjectsSkeleton() {
  return (
    <div
      className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3"
      aria-busy="true"
      aria-label="Loading subjects"
    >
      {Array.from({ length: 6 }).map((_, i) => (
        <div
          key={i}
          className="h-32 animate-pulse rounded-card border border-border bg-surface-muted"
        />
      ))}
    </div>
  );
}

function EmptyState({ onAdd }: { onAdd: () => void }) {
  return (
    <div className="rounded-card border border-dashed border-border bg-surface p-12 text-center">
      <p className="text-4xl" aria-hidden="true">
        📚
      </p>
      <h2 className="mt-3 font-display text-display-sm text-foreground">
        No subjects yet
      </h2>
      <p className="mx-auto mt-1 max-w-sm text-sm text-foreground-muted">
        Create your first subject to start adding sources, building a syllabus,
        and generating exams.
      </p>
      <div className="mt-5">
        <Button onClick={onAdd}>Add subject</Button>
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
      <h2 className="font-display text-display-sm text-danger">
        Couldn&rsquo;t load subjects
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
