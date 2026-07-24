import { useState } from 'react';
import type { FormEvent } from 'react';
import { Link } from 'react-router-dom';
import {
  Archive,
  ChevronRight,
  GraduationCap,
  Library,
  Pencil,
  Plus,
  Trash2,
} from 'lucide-react';

import { Badge } from '../components/Badge';
import { Button } from '../components/Button';
import { Card } from '../components/Card';
import { ColorIconPicker } from '../components/ColorIconPicker';
import type { ColorOption, IconOption } from '../components/ColorIconPicker';
import { ConfirmDialog } from '../components/ConfirmDialog';
import { Dialog } from '../components/Dialog';
import { EmptyState } from '../components/EmptyState';
import { PageHeader } from '../components/PageHeader';
import { Select } from '../components/Select';
import { TextInput } from '../components/TextInput';
import type { components } from '../api/schema';
import {
  useCreateSubject,
  useDeleteSubject,
  useSubjects,
  useUpdateSubject,
} from '../hooks/useSubjects';
import {
  useCreateSyllabus,
  useDeleteSyllabus,
  useSyllabuses,
  useUpdateSyllabus,
} from '../hooks/useSyllabuses';

/**
 * P04 — Subjects list (screen 2.2)
 *
 * Subjects are organized like an education system: a syllabus is the class
 * level ("Class V") and its subjects are the units taught at that level ("Math
 * Class V"). The page renders one section per syllabus — heading + grid of
 * subject cards — followed by an "Other subjects" section for anything
 * ungrouped, so households that never create a syllabus keep the old flat
 * grid. Syllabuses have their own add/rename/delete flows; the subject dialog
 * gains a syllabus picker. All data flows through the H01 useSubjects and
 * useSyllabuses hooks; nothing here hand-rolls fetch.
 *
 * States: loading (skeleton), error (retry), empty (call to action), and the
 * populated sections.
 */

type Subject = components['schemas']['Subject'];
type CreateSubject = components['schemas']['CreateSubject'];
type Syllabus = components['schemas']['Syllabus'];

/** Curated palette of colors offered by the color picker. */
const COLOR_OPTIONS: ColorOption[] = [
  { value: '#6366f1', swatch: '#6366f1', label: 'Indigo' },
  { value: '#0ea5e9', swatch: '#0ea5e9', label: 'Sky' },
  { value: '#10b981', swatch: '#10b981', label: 'Emerald' },
  { value: '#f59e0b', swatch: '#f59e0b', label: 'Amber' },
  { value: '#ef4444', swatch: '#ef4444', label: 'Red' },
  { value: '#ec4899', swatch: '#ec4899', label: 'Pink' },
  { value: '#8b5cf6', swatch: '#8b5cf6', label: 'Violet' },
  { value: '#14b8a6', swatch: '#14b8a6', label: 'Teal' },
];

/** Curated set of emoji icons offered by the icon picker. */
const ICON_OPTIONS: IconOption[] = [
  { value: '📚', glyph: '📚', label: 'Books' },
  { value: '🧮', glyph: '🧮', label: 'Abacus' },
  { value: '🔬', glyph: '🔬', label: 'Microscope' },
  { value: '🌍', glyph: '🌍', label: 'Globe' },
  { value: '🎨', glyph: '🎨', label: 'Palette' },
  { value: '🎵', glyph: '🎵', label: 'Music' },
  { value: '💻', glyph: '💻', label: 'Computer' },
  { value: '📐', glyph: '📐', label: 'Triangle' },
  { value: '🧪', glyph: '🧪', label: 'Test tube' },
  { value: '📖', glyph: '📖', label: 'Book' },
  { value: '🗺️', glyph: '🗺️', label: 'Map' },
  { value: '⚙️', glyph: '⚙️', label: 'Gear' },
];

const DEFAULT_COLOR = COLOR_OPTIONS[0].value;
const DEFAULT_ICON = ICON_OPTIONS[0].value;

interface SubjectFormState {
  name: string;
  description: string;
  color: string;
  icon: string;
  /** '' = no syllabus (standalone subject). */
  syllabusId: string;
}

function emptyForm(syllabusId = ''): SubjectFormState {
  return {
    name: '',
    description: '',
    color: DEFAULT_COLOR,
    icon: DEFAULT_ICON,
    syllabusId,
  };
}

function formFromSubject(subject: Subject): SubjectFormState {
  return {
    name: subject.name,
    description: subject.description ?? '',
    color: subject.color ?? DEFAULT_COLOR,
    icon: subject.icon ?? DEFAULT_ICON,
    syllabusId: subject.syllabusId ?? '',
  };
}

interface SyllabusFormState {
  name: string;
  description: string;
}

export default function Subjects() {
  // pageSize 200 (the server max): the page renders the whole catalog grouped
  // by syllabus, so a default-sized first page would silently drop subjects.
  const subjectsQuery = useSubjects({ pageSize: 200 });
  const syllabusesQuery = useSyllabuses();
  const createSubject = useCreateSubject();
  const updateSubject = useUpdateSubject();
  const deleteSubject = useDeleteSubject();
  const createSyllabus = useCreateSyllabus();
  const updateSyllabus = useUpdateSyllabus();
  const deleteSyllabus = useDeleteSyllabus();

  // Subject dialog state: `null` = closed; create optionally pre-picks the
  // syllabus of the section whose "Add subject" was clicked.
  const [editor, setEditor] = useState<
    | { mode: 'create'; syllabusId?: string }
    | { mode: 'edit'; subject: Subject }
    | null
  >(null);
  // Syllabus dialog state (create or rename).
  const [syllabusEditor, setSyllabusEditor] = useState<
    { mode: 'create' } | { mode: 'edit'; syllabus: Syllabus } | null
  >(null);
  // Pending destructive confirmation (subject delete/archive, syllabus delete).
  const [confirm, setConfirm] = useState<
    | { kind: 'delete'; subject: Subject }
    | { kind: 'archive'; subject: Subject }
    | { kind: 'delete-syllabus'; syllabus: Syllabus }
    | null
  >(null);

  function openCreate(syllabusId?: string) {
    setEditor({ mode: 'create', syllabusId });
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
    } else if (confirm.kind === 'archive') {
      await updateSubject.mutateAsync({
        id: confirm.subject.id,
        changes: { archived: true },
      });
    } else {
      await deleteSyllabus.mutateAsync(confirm.syllabus.id);
    }
    setConfirm(null);
  }

  const loading = subjectsQuery.isPending || syllabusesQuery.isPending;
  const syllabuses = syllabusesQuery.data ?? [];
  const subjects = subjectsQuery.data?.items ?? [];

  // Group subjects under their syllabus; anything pointing at a missing
  // syllabus (or none) lands in the ungrouped bucket.
  const knownSyllabusIds = new Set(syllabuses.map((s) => s.id));
  const grouped = new Map<string, Subject[]>();
  const ungrouped: Subject[] = [];
  for (const subject of subjects) {
    if (subject.syllabusId && knownSyllabusIds.has(subject.syllabusId)) {
      const bucket = grouped.get(subject.syllabusId) ?? [];
      bucket.push(subject);
      grouped.set(subject.syllabusId, bucket);
    } else {
      ungrouped.push(subject);
    }
  }

  const empty = subjects.length === 0 && syllabuses.length === 0;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Subjects"
        subtitle="Group subjects under syllabuses — e.g. Math Class V inside the Class V syllabus."
        actions={
          <div className="flex items-center gap-2">
            <Button
              variant="secondary"
              onClick={() => setSyllabusEditor({ mode: 'create' })}
              leadingIcon={
                <GraduationCap className="h-4 w-4" aria-hidden="true" />
              }
            >
              Add syllabus
            </Button>
            <Button
              onClick={() => openCreate()}
              leadingIcon={<Plus className="h-4 w-4" aria-hidden="true" />}
            >
              Add subject
            </Button>
          </div>
        }
      />

      {loading ? (
        <SubjectsSkeleton />
      ) : subjectsQuery.isError ? (
        <ErrorState
          title="Couldn’t load subjects"
          message={subjectsQuery.error.message}
          onRetry={() => void subjectsQuery.refetch()}
          retrying={subjectsQuery.isFetching}
        />
      ) : syllabusesQuery.isError ? (
        <ErrorState
          title="Couldn’t load syllabuses"
          message={syllabusesQuery.error.message}
          onRetry={() => void syllabusesQuery.refetch()}
          retrying={syllabusesQuery.isFetching}
        />
      ) : empty ? (
        <EmptyState
          icon={<Library className="h-5 w-5" />}
          title="No subjects yet"
          description="Create a syllabus for each class level (e.g. Class V), then add its subjects to start building topics and exams."
          action={
            <div className="flex items-center gap-2">
              <Button
                variant="secondary"
                onClick={() => setSyllabusEditor({ mode: 'create' })}
                leadingIcon={
                  <GraduationCap className="h-4 w-4" aria-hidden="true" />
                }
              >
                Add syllabus
              </Button>
              <Button
                onClick={() => openCreate()}
                leadingIcon={<Plus className="h-4 w-4" aria-hidden="true" />}
              >
                Add subject
              </Button>
            </div>
          }
        />
      ) : (
        <div className="space-y-8">
          {syllabuses.map((syllabus) => (
            <SyllabusSection
              key={syllabus.id}
              syllabus={syllabus}
              subjects={grouped.get(syllabus.id) ?? []}
              onAddSubject={() => openCreate(syllabus.id)}
              onRename={() => setSyllabusEditor({ mode: 'edit', syllabus })}
              onDelete={() => setConfirm({ kind: 'delete-syllabus', syllabus })}
              onEditSubject={openEdit}
              onArchiveSubject={(subject) =>
                setConfirm({ kind: 'archive', subject })
              }
              onDeleteSubject={(subject) =>
                setConfirm({ kind: 'delete', subject })
              }
            />
          ))}

          {ungrouped.length > 0 && (
            <section aria-label="Other subjects">
              {syllabuses.length > 0 && (
                <h2 className="mb-3 font-display text-base font-semibold text-foreground-muted">
                  Other subjects
                </h2>
              )}
              <SubjectGrid
                subjects={ungrouped}
                onEdit={openEdit}
                onArchive={(subject) => setConfirm({ kind: 'archive', subject })}
                onDelete={(subject) => setConfirm({ kind: 'delete', subject })}
              />
            </section>
          )}
        </div>
      )}

      {editor && (
        <SubjectDialog
          key={editor.mode === 'edit' ? editor.subject.id : 'create'}
          title={editor.mode === 'create' ? 'Add subject' : 'Edit subject'}
          initial={
            editor.mode === 'edit'
              ? formFromSubject(editor.subject)
              : emptyForm(editor.syllabusId)
          }
          syllabuses={syllabuses}
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
                syllabusId: form.syllabusId || undefined,
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
                  // '' clears the grouping server-side; a non-empty id
                  // re-assigns the subject to that syllabus.
                  syllabusId: form.syllabusId,
                },
              });
            }
            closeEditor();
          }}
        />
      )}

      {syllabusEditor && (
        <SyllabusDialog
          key={
            syllabusEditor.mode === 'edit'
              ? syllabusEditor.syllabus.id
              : 'create'
          }
          title={
            syllabusEditor.mode === 'create' ? 'Add syllabus' : 'Edit syllabus'
          }
          initial={
            syllabusEditor.mode === 'edit'
              ? {
                  name: syllabusEditor.syllabus.name,
                  description: syllabusEditor.syllabus.description ?? '',
                }
              : { name: '', description: '' }
          }
          submitting={
            syllabusEditor.mode === 'create'
              ? createSyllabus.isPending
              : updateSyllabus.isPending
          }
          onClose={() => setSyllabusEditor(null)}
          onSubmit={async (form) => {
            if (syllabusEditor.mode === 'create') {
              await createSyllabus.mutateAsync({
                name: form.name.trim(),
                description: form.description.trim() || undefined,
              });
            } else {
              await updateSyllabus.mutateAsync({
                id: syllabusEditor.syllabus.id,
                changes: {
                  name: form.name.trim(),
                  description: form.description.trim() || undefined,
                },
              });
            }
            setSyllabusEditor(null);
          }}
        />
      )}

      {confirm && (
        <ConfirmDialog
          open
          title={
            confirm.kind === 'delete'
              ? 'Delete subject'
              : confirm.kind === 'archive'
                ? 'Archive subject'
                : 'Delete syllabus'
          }
          message={
            confirm.kind === 'delete'
              ? `Permanently delete “${confirm.subject.name}”? This also removes its sources, topics, and exams. This cannot be undone.`
              : confirm.kind === 'archive'
                ? `Archive “${confirm.subject.name}”? It will be hidden from active lists but can be restored later.`
                : `Delete the “${confirm.syllabus.name}” syllabus? Its subjects are kept and become ungrouped.`
          }
          confirmLabel={confirm.kind === 'archive' ? 'Archive' : 'Delete'}
          danger={confirm.kind !== 'archive'}
          onCancel={() => setConfirm(null)}
          onConfirm={handleConfirm}
        />
      )}
    </div>
  );
}

interface SyllabusSectionProps {
  syllabus: Syllabus;
  subjects: Subject[];
  onAddSubject: () => void;
  onRename: () => void;
  onDelete: () => void;
  onEditSubject: (subject: Subject) => void;
  onArchiveSubject: (subject: Subject) => void;
  onDeleteSubject: (subject: Subject) => void;
}

function SyllabusSection({
  syllabus,
  subjects,
  onAddSubject,
  onRename,
  onDelete,
  onEditSubject,
  onArchiveSubject,
  onDeleteSubject,
}: SyllabusSectionProps) {
  return (
    <section aria-label={syllabus.name}>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <div className="flex min-w-0 items-center gap-2">
          <GraduationCap
            className="h-5 w-5 shrink-0 text-foreground-muted"
            aria-hidden="true"
          />
          <h2 className="truncate font-display text-lg font-semibold text-foreground">
            {syllabus.name}
          </h2>
          {syllabus.description ? (
            <span className="hidden truncate text-sm text-foreground-muted sm:inline">
              — {syllabus.description}
            </span>
          ) : null}
        </div>
        <div className="flex items-center gap-1">
          <Button
            variant="ghost"
            size="sm"
            onClick={onAddSubject}
            leadingIcon={<Plus className="h-4 w-4" aria-hidden="true" />}
          >
            Add subject
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={onRename}
            leadingIcon={<Pencil className="h-4 w-4" aria-hidden="true" />}
          >
            Edit
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={onDelete}
            leadingIcon={<Trash2 className="h-4 w-4" aria-hidden="true" />}
          >
            Delete
          </Button>
        </div>
      </div>

      {subjects.length === 0 ? (
        <p className="rounded-card border border-dashed border-border p-4 text-sm text-foreground-muted">
          No subjects in this syllabus yet. Use “Add subject” to create one —
          e.g. Math {syllabus.name}.
        </p>
      ) : (
        <SubjectGrid
          subjects={subjects}
          onEdit={onEditSubject}
          onArchive={onArchiveSubject}
          onDelete={onDeleteSubject}
        />
      )}
    </section>
  );
}

interface SubjectGridProps {
  subjects: Subject[];
  onEdit: (subject: Subject) => void;
  onArchive: (subject: Subject) => void;
  onDelete: (subject: Subject) => void;
}

function SubjectGrid({ subjects, onEdit, onArchive, onDelete }: SubjectGridProps) {
  return (
    <ul
      className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4"
      aria-label="Subjects"
    >
      {subjects.map((subject) => (
        <li key={subject.id}>
          <SubjectCard
            subject={subject}
            onEdit={() => onEdit(subject)}
            onArchive={() => onArchive(subject)}
            onDelete={() => onDelete(subject)}
          />
        </li>
      ))}
    </ul>
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
  return (
    <Card padding="md" className="flex h-full flex-col">
      <div className="flex items-start justify-between gap-3">
        <Link
          to={`/parent/subjects/${subject.id}`}
          className="group flex min-w-0 flex-1 items-center gap-3 rounded-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <span
            aria-hidden="true"
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg text-base font-semibold uppercase text-white"
            style={{ backgroundColor: color }}
          >
            {subject.name.trim().charAt(0) || '?'}
          </span>
          <span className="min-w-0">
            <span className="block truncate font-display font-semibold text-foreground group-hover:underline">
              {subject.name}
            </span>
            {subject.description ? (
              <span className="mt-0.5 block truncate text-sm text-foreground-muted">
                {subject.description}
              </span>
            ) : null}
          </span>
          <ChevronRight
            className="ml-auto h-4 w-4 shrink-0 text-foreground-muted"
            aria-hidden="true"
          />
        </Link>
        {subject.archived && (
          <Badge tone="neutral" size="sm">
            Archived
          </Badge>
        )}
      </div>

      <div className="mt-4 flex items-center justify-end gap-1">
        <Button
          variant="ghost"
          size="sm"
          onClick={onEdit}
          leadingIcon={<Pencil className="h-4 w-4" aria-hidden="true" />}
        >
          Edit
        </Button>
        {!subject.archived && (
          <Button
            variant="ghost"
            size="sm"
            onClick={onArchive}
            leadingIcon={<Archive className="h-4 w-4" aria-hidden="true" />}
          >
            Archive
          </Button>
        )}
        <Button
          variant="ghost"
          size="sm"
          onClick={onDelete}
          leadingIcon={<Trash2 className="h-4 w-4" aria-hidden="true" />}
        >
          Delete
        </Button>
      </div>
    </Card>
  );
}

interface SubjectDialogProps {
  title: string;
  initial: SubjectFormState;
  syllabuses: Syllabus[];
  submitting: boolean;
  onClose: () => void;
  onSubmit: (form: SubjectFormState) => Promise<void> | void;
}

function SubjectDialog({
  title,
  initial,
  syllabuses,
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
    <Dialog
      open
      onClose={onClose}
      title={title}
      size="md"
      hideCloseButton
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
          <Button type="submit" form="subject-form" loading={submitting}>
            Save
          </Button>
        </>
      }
    >
      <form id="subject-form" onSubmit={handleSubmit} className="space-y-4">
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
          placeholder="e.g. Math Class V"
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

        <Select
          label="Syllabus"
          value={form.syllabusId}
          onChange={(e) =>
            setForm((f) => ({ ...f, syllabusId: e.target.value }))
          }
          options={[
            { value: '', label: 'No syllabus' },
            ...syllabuses.map((s) => ({ value: s.id, label: s.name })),
          ]}
          hint="The class level this subject belongs to (e.g. Class V)."
        />

        <ColorIconPicker
          value={{ color: form.color, icon: form.icon }}
          onChange={(next) =>
            setForm((f) => ({ ...f, color: next.color, icon: next.icon }))
          }
          colors={COLOR_OPTIONS}
          icons={ICON_OPTIONS}
        />
      </form>
    </Dialog>
  );
}

interface SyllabusDialogProps {
  title: string;
  initial: SyllabusFormState;
  submitting: boolean;
  onClose: () => void;
  onSubmit: (form: SyllabusFormState) => Promise<void> | void;
}

function SyllabusDialog({
  title,
  initial,
  submitting,
  onClose,
  onSubmit,
}: SyllabusDialogProps) {
  const [form, setForm] = useState<SyllabusFormState>(initial);
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
    <Dialog
      open
      onClose={onClose}
      title={title}
      size="md"
      hideCloseButton
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
          <Button type="submit" form="syllabus-form" loading={submitting}>
            Save
          </Button>
        </>
      }
    >
      <form id="syllabus-form" onSubmit={handleSubmit} className="space-y-4">
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
          placeholder="e.g. Class V"
        />

        <TextInput
          label="Description"
          value={form.description}
          onChange={(e) =>
            setForm((f) => ({ ...f, description: e.target.value }))
          }
          hint="Optional — e.g. the school year or curriculum board."
          placeholder="Optional description"
        />
      </form>
    </Dialog>
  );
}

function SubjectsSkeleton() {
  return (
    <div
      className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4"
      aria-busy="true"
      aria-label="Loading subjects"
    >
      {Array.from({ length: 6 }).map((_, i) => (
        <div
          key={i}
          className="h-32 animate-pulse rounded-md bg-surface-muted"
        />
      ))}
    </div>
  );
}

interface ErrorStateProps {
  title: string;
  message: string;
  onRetry: () => void;
  retrying: boolean;
}

function ErrorState({ title, message, onRetry, retrying }: ErrorStateProps) {
  return (
    <div
      role="alert"
      className="rounded-card border border-danger bg-danger-soft p-4"
    >
      <h2 className="text-base font-semibold text-danger">{title}</h2>
      <p className="mt-1 text-sm text-foreground-muted">{message}</p>
      <div className="mt-4">
        <Button variant="secondary" size="sm" onClick={onRetry} loading={retrying}>
          Try again
        </Button>
      </div>
    </div>
  );
}
