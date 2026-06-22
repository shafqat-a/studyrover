// P05 — Subject detail + tabs (screen 2.3)
//
// The hub for a single subject. It loads the subject (H01 useSubject), shows an
// inline-editable header (name + description, persisted via H01 useUpdateSubject),
// and a tab bar that routes to the subject's child screens — Sources (P06),
// Syllabus (P07), Exams (P08), Questions (P09) — each mounted through the nested
// <Outlet/>. The Tutor tab is intentionally disabled in Phase 1/2.
//
// Business logic lives entirely in the H01 hooks; this page only composes them
// with the shared design-system primitives (Button / TextInput / Card / Badge)
// and React Router. The U09 (Tabs) and U20 (PageHeader) primitives are not yet
// in the shared component set, so their roles are composed inline here from the
// available primitives and design tokens. This file does NOT edit router.tsx —
// route registration (this element + its child tabs) is owned by W03.

import { useEffect, useState } from 'react';
import type { FormEvent, ReactNode } from 'react';
import { NavLink, Outlet, useParams } from 'react-router-dom';

import { Badge } from '../components/Badge';
import { Button } from '../components/Button';
import { Card } from '../components/Card';
import { TextInput } from '../components/TextInput';

import { useSubject, useUpdateSubject } from '../hooks/useSubjects';

/** A subject sub-tab: its relative route segment + label. */
interface SubjectTab {
  /** Relative path segment under `/parent/subjects/:subjectId`. */
  to: string;
  /** Tab label. */
  label: string;
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
  { to: 'sources', label: 'Sources' },
  { to: 'syllabus', label: 'Syllabus' },
  { to: 'exams', label: 'Exams' },
  { to: 'questions', label: 'Questions' },
  {
    to: 'tutor',
    label: 'Tutor',
    disabled: true,
    disabledReason: 'The tutor arrives in a later phase.',
  },
];

/** Centered helper used for empty / loading / error panels. */
function StatePanel({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-32 items-center justify-center px-4 py-8 text-center text-sm text-foreground-muted">
      {children}
    </div>
  );
}

const tabBase =
  'inline-flex items-center whitespace-nowrap border-b-2 px-1 pb-3 pt-2 ' +
  'text-sm font-semibold transition-colors focus-visible:outline-none ' +
  'focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 ' +
  'focus-visible:ring-offset-background rounded-sm';

const tabActive = 'border-primary text-primary';
const tabInactive =
  'border-transparent text-foreground-muted hover:border-border hover:text-foreground';
const tabDisabled =
  'border-transparent text-foreground-muted/60 cursor-not-allowed';

/** The horizontal tab bar wiring each sub-route via NavLink. */
function SubjectTabBar() {
  return (
    <nav
      className="-mb-px flex gap-6 overflow-x-auto border-b border-border"
      aria-label="Subject sections"
    >
      {SUBJECT_TABS.map((tab) =>
        tab.disabled ? (
          <span
            key={tab.to}
            className={`${tabBase} ${tabDisabled}`}
            aria-disabled="true"
            title={tab.disabledReason}
          >
            {tab.label}
          </span>
        ) : (
          <NavLink
            key={tab.to}
            to={tab.to}
            // `sources` is the index tab; mark it active at the subject root too.
            end={tab.to === 'sources' ? false : undefined}
            className={({ isActive }) =>
              `${tabBase} ${isActive ? tabActive : tabInactive}`
            }
          >
            {tab.label}
          </NavLink>
        ),
      )}
    </nav>
  );
}

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
      <StatePanel>
        No subject selected. Open a subject from the Subjects list.
      </StatePanel>
    );
  }

  if (subjectQuery.isLoading) {
    return <StatePanel>Loading subject…</StatePanel>;
  }

  if (subjectQuery.isError) {
    return (
      <StatePanel>
        <div className="flex flex-col items-center gap-3">
          <span className="text-danger">{subjectQuery.error.message}</span>
          <Button
            variant="secondary"
            size="sm"
            onClick={() => void subjectQuery.refetch()}
          >
            Retry
          </Button>
        </div>
      </StatePanel>
    );
  }

  if (!subject) {
    return (
      <StatePanel>
        That subject could not be found. It may have been deleted.
      </StatePanel>
    );
  }

  const saveDisabled = name.trim().length === 0;

  return (
    <div className="flex flex-col gap-6">
      {/* Header: inline-editable name + description (H01 useUpdateSubject). */}
      <Card padding="lg">
        {editing ? (
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
                className="text-sm font-semibold text-foreground"
              >
                Description
              </label>
              <textarea
                id="subject-description"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                rows={3}
                placeholder="What does this subject cover?"
                className="w-full rounded-md border border-border bg-surface p-3 text-base text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1 focus-visible:ring-offset-background"
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
        ) : (
          <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            <div className="flex min-w-0 flex-col gap-2">
              <div className="flex flex-wrap items-center gap-3">
                {subject.color ? (
                  <span
                    className="inline-block h-4 w-4 shrink-0 rounded-full border border-border"
                    style={{ backgroundColor: subject.color }}
                    aria-hidden="true"
                  />
                ) : null}
                <h1 className="font-display text-2xl font-bold text-foreground">
                  {subject.name}
                </h1>
                {subject.archived ? (
                  <Badge tone="neutral">Archived</Badge>
                ) : null}
              </div>
              {subject.description ? (
                <p className="max-w-prose text-sm text-foreground-muted">
                  {subject.description}
                </p>
              ) : (
                <p className="text-sm italic text-foreground-muted">
                  No description yet.
                </p>
              )}
            </div>
            <div className="shrink-0">
              <Button variant="secondary" size="sm" onClick={startEditing}>
                Edit
              </Button>
            </div>
          </div>
        )}
      </Card>

      {/* Sub-tab navigation. */}
      <SubjectTabBar />

      {/* The active child tab (P06–P09) renders here. */}
      <div>
        <Outlet />
      </div>
    </div>
  );
}
