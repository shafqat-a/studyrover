// P05 — Subject detail + tabs (screen 2.3)
//
// The hub for a single subject. It loads the subject (H01 useSubject), shows an
// inline-editable header (name + description, persisted via H01 useUpdateSubject),
// and a tab bar that routes to the subject's child screens — Sources (P06),
// Syllabus (P07), Exams (P08), Questions (P09) — each mounted through the nested
// <Outlet/>. The Tutor tab is intentionally disabled in Phase 1/2.
//
// Business logic lives entirely in the H01 hooks; this page only composes them
// with the shared design-system primitives. Route registration is owned by W03.

import { useEffect, useState } from 'react';
import type { FormEvent, ReactNode } from 'react';
import { Outlet, useParams } from 'react-router-dom';
import {
  ClipboardList,
  FileText,
  HelpCircle,
  ListTree,
  Pencil,
  Sparkles,
} from 'lucide-react';

import { Badge } from '../components/Badge';
import { Button } from '../components/Button';
import { Card } from '../components/Card';
import { PageHeader } from '../components/PageHeader';
import { Tabs } from '../components/Tabs';
import { TextInput } from '../components/TextInput';

import { useSubject, useUpdateSubject } from '../hooks/useSubjects';

/** A subject sub-tab: its relative route segment + label. */
interface SubjectTab {
  /** Relative path segment under `/parent/subjects/:subjectId`. */
  to: string;
  /** Tab label. */
  label: string;
  /** Optional decorative icon rendered before the label. */
  icon?: ReactNode;
  /** When true the tab is rendered but not navigable (Phase-gated). */
  disabled?: boolean;
  /** Hint shown via `title` when the tab is disabled. */
  disabledReason?: string;
}

/**
 * The subject sub-tabs. `sources` is the index tab (it is reachable both at the
 * subject root and at `./sources`, matching the router's index→Sources mapping).
 * The Tutor tab is disabled until Phase 2 wires the tutor experience.
 */
const SUBJECT_TABS: ReadonlyArray<SubjectTab> = [
  {
    to: 'sources',
    label: 'Sources',
    icon: <FileText className="h-4 w-4" aria-hidden="true" />,
  },
  {
    // Keeps the /syllabus route, but the tab is the subject's topic outline —
    // "Syllabus" now names the class-level grouping above subjects (Class V).
    to: 'syllabus',
    label: 'Topics',
    icon: <ListTree className="h-4 w-4" aria-hidden="true" />,
  },
  {
    to: 'exams',
    label: 'Exams',
    icon: <ClipboardList className="h-4 w-4" aria-hidden="true" />,
  },
  {
    to: 'questions',
    label: 'Questions',
    icon: <HelpCircle className="h-4 w-4" aria-hidden="true" />,
  },
  {
    to: 'tutor-instructions',
    label: 'Tutor',
    icon: <Sparkles className="h-4 w-4" aria-hidden="true" />,
  },
];

const SUBJECT_TAB_ITEMS = SUBJECT_TABS.map((tab) => ({
  id: tab.to,
  label: tab.label,
  icon: tab.icon,
  to: tab.to,
  disabled: tab.disabled,
}));

export default function SubjectDetail() {
  const { subjectId } = useParams<{ subjectId: string }>();

  const subjectQuery = useSubject(subjectId);
  const updateSubject = useUpdateSubject();
  const subject = subjectQuery.data;

  // Inline edit state for the header (name + description).
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');

  // Seed the edit fields whenever the loaded subject changes (and we are not
  // mid-edit, so we don't clobber the user's in-flight input).
  useEffect(() => {
    if (subject && !editing) {
      setName(subject.name);
      setDescription(subject.description ?? '');
    }
  }, [subject, editing]);

  function startEditing() {
    if (!subject) return;
    setName(subject.name);
    setDescription(subject.description ?? '');
    setEditing(true);
  }

  function cancelEditing() {
    setEditing(false);
    if (subject) {
      setName(subject.name);
      setDescription(subject.description ?? '');
    }
  }

  function handleSave(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!subject) return;

    const trimmedName = name.trim();
    if (!trimmedName) return;

    const trimmedDescription = description.trim();
    updateSubject.mutate(
      {
        id: subject.id,
        changes: {
          name: trimmedName,
          description: trimmedDescription.length > 0 ? trimmedDescription : undefined,
        },
      },
      {
        onSuccess: () => setEditing(false),
      },
    );
  }

  if (!subjectId) {
    return (
      <div className="rounded-card border border-border bg-surface p-4 text-sm text-foreground-muted">
        No subject selected. Open a subject from the Subjects list.
      </div>
    );
  }

  if (subjectQuery.isLoading) {
    return (
      <div className="space-y-6" aria-busy="true" aria-label="Loading subject">
        <div className="space-y-3">
          <div className="h-7 w-64 animate-pulse rounded-md bg-surface-muted" />
          <div className="h-4 w-96 max-w-full animate-pulse rounded-md bg-surface-muted" />
        </div>
        <div className="h-10 w-full animate-pulse rounded-md bg-surface-muted" />
      </div>
    );
  }

  if (subjectQuery.isError) {
    return (
      <div
        role="alert"
        className="rounded-card border border-danger bg-danger-soft p-4"
      >
        <p className="text-sm font-medium text-danger">
          {subjectQuery.error.message}
        </p>
        <div className="mt-3">
          <Button
            variant="secondary"
            size="sm"
            onClick={() => void subjectQuery.refetch()}
          >
            Retry
          </Button>
        </div>
      </div>
    );
  }

  if (!subject) {
    return (
      <div className="rounded-card border border-border bg-surface p-4 text-sm text-foreground-muted">
        That subject could not be found. It may have been deleted.
      </div>
    );
  }

  const saveDisabled = name.trim().length === 0;

  return (
    <div className="space-y-6">
      {/* Header: inline-editable name + description (H01 useUpdateSubject). */}
      {editing ? (
        <Card padding="lg">
          <form className="flex flex-col gap-4" onSubmit={handleSave}>
            <TextInput
              label="Subject name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Biology"
              required
              autoFocus
            />
            <div className="flex flex-col gap-1.5">
              <label
                htmlFor="subject-description"
                className="text-sm font-medium text-foreground"
              >
                Description
              </label>
              <textarea
                id="subject-description"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                rows={3}
                placeholder="What does this subject cover?"
                className="w-full rounded-md border border-border bg-surface p-3 text-sm text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1 focus-visible:ring-offset-background"
              />
            </div>
            <div className="flex justify-end gap-2">
              <Button
                type="button"
                variant="ghost"
                onClick={cancelEditing}
                disabled={updateSubject.isPending}
              >
                Cancel
              </Button>
              <Button
                type="submit"
                loading={updateSubject.isPending}
                disabled={saveDisabled}
              >
                Save changes
              </Button>
            </div>
          </form>
        </Card>
      ) : (
        <PageHeader
          title={
            <span className="inline-flex items-center gap-2">
              {subject.color ? (
                <span
                  className="h-4 w-4 shrink-0 rounded-full border border-border"
                  style={{ backgroundColor: subject.color }}
                  aria-hidden="true"
                />
              ) : null}
              <span>{subject.name}</span>
              {subject.archived ? <Badge tone="neutral">Archived</Badge> : null}
            </span>
          }
          subtitle={
            subject.description ? (
              subject.description
            ) : (
              <span className="italic">No description yet.</span>
            )
          }
          actions={
            <Button
              variant="secondary"
              size="sm"
              onClick={startEditing}
              leadingIcon={<Pencil className="h-4 w-4" aria-hidden="true" />}
            >
              Edit
            </Button>
          }
        />
      )}

      {/* Sub-tab navigation. */}
      <Tabs routed items={SUBJECT_TAB_ITEMS} aria-label="Subject sections" />

      {/* The active child tab (P06–P09) renders here. */}
      <div>
        <Outlet />
      </div>
    </div>
  );
}
