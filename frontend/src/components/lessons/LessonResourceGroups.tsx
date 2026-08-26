import { useMemo } from 'react';
import type { ReactNode } from 'react';
import { BookOpenText, Link2, PlaySquare } from 'lucide-react';

import { LessonResourceCard } from './LessonResourceCard';
import {
  groupResources,
  type LessonResource,
  type LessonResourceKind,
} from './lessonUtils';

/**
 * Lesson resources grouped by kind (videos / articles / links), each group with
 * a heading and a responsive card grid. Presentational: the parent editor
 * passes `onRemove` + `showSource`; the student viewer passes the friendlier
 * "Watch / Read more / Links" headings via `variant="student"`.
 */

export interface LessonResourceGroupsProps {
  resources: ReadonlyArray<LessonResource> | undefined;
  /** Heading copy: parent ("Videos / Articles / Links") or student ("Watch / Read more / Links"). */
  variant?: 'parent' | 'student';
  /** Show the "Enriched" / "Manual" badge on each card. */
  showSource?: boolean;
  /** When set, every card gets a Remove button. */
  onRemove?: (resource: LessonResource) => void;
  /** The resource id currently being removed (disables its button). */
  removingId?: string | null;
  /** Rendered when there are no resources at all. */
  emptyState?: ReactNode;
  className?: string;
}

interface GroupSpec {
  kind: LessonResourceKind;
  label: Record<'parent' | 'student', string>;
  icon: ReactNode;
}

const GROUPS: ReadonlyArray<GroupSpec> = [
  {
    kind: 'youtube',
    label: { parent: 'Videos', student: 'Watch' },
    icon: <PlaySquare className="h-4 w-4" aria-hidden="true" />,
  },
  {
    kind: 'wikipedia',
    label: { parent: 'Articles', student: 'Read more' },
    icon: <BookOpenText className="h-4 w-4" aria-hidden="true" />,
  },
  {
    kind: 'link',
    label: { parent: 'Links', student: 'Links' },
    icon: <Link2 className="h-4 w-4" aria-hidden="true" />,
  },
];

export function LessonResourceGroups({
  resources,
  variant = 'parent',
  showSource = false,
  onRemove,
  removingId = null,
  emptyState,
  className,
}: LessonResourceGroupsProps) {
  const grouped = useMemo(() => groupResources(resources), [resources]);
  const total =
    grouped.youtube.length + grouped.wikipedia.length + grouped.link.length;

  if (total === 0) {
    return emptyState ? <div className={className}>{emptyState}</div> : null;
  }

  return (
    <div className={['space-y-6', className].filter(Boolean).join(' ')}>
      {GROUPS.map((group) => {
        const items = grouped[group.kind];
        if (items.length === 0) return null;
        const headingId = `lesson-resources-${group.kind}`;
        return (
          <section key={group.kind} aria-labelledby={headingId}>
            <h3
              id={headingId}
              className="mb-3 flex items-center gap-2 font-display text-sm font-semibold uppercase tracking-wide text-foreground-muted"
            >
              {group.icon}
              {group.label[variant]}
              <span className="font-sans text-xs font-medium normal-case tracking-normal">
                ({items.length})
              </span>
            </h3>
            <ul
              className={
                group.kind === 'youtube'
                  ? 'grid grid-cols-1 gap-4 md:grid-cols-2'
                  : 'grid grid-cols-1 gap-3 md:grid-cols-2'
              }
            >
              {items.map((resource) => (
                <li key={resource.id}>
                  <LessonResourceCard
                    resource={resource}
                    showSource={showSource}
                    onRemove={onRemove}
                    removing={removingId === resource.id}
                    className="h-full"
                  />
                </li>
              ))}
            </ul>
          </section>
        );
      })}
    </div>
  );
}
