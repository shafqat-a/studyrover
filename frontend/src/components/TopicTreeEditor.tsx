import { useCallback, useEffect, useId, useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import type { components } from '../api/schema';

/**
 * U06 — TopicTreeEditor
 *
 * A presentational, accessible editor for an AI-suggested syllabus topic tree
 * (2-C04 `TopicSuggestion`). Parents/teachers can rename topics, adjust page
 * ranges, reorder siblings, and include/exclude branches before the tree is
 * applied (2-A08 `POST /subjects/{id}/syllabus/apply`).
 *
 * Props-driven only: no data fetching, no API calls, no business logic beyond
 * local editing state. The parent supplies the initial `suggestions` and reacts
 * to `onChange`, which emits the cleaned final `TopicSuggestion[]` — excluded
 * branches are dropped and `order` is re-sequenced (0-based) per sibling group.
 *
 * Styling uses the StudyRover design tokens from `tailwind.config.ts`
 * (e.g. `bg-surface`, `border-border`, `ring-ring`, `text-foreground-muted`).
 *
 * Accessibility:
 * - The tree uses a labeled list structure; each row's controls are labeled.
 * - Reorder / include controls are native `<button>`s with descriptive
 *   `aria-label`s and disable at the ends of a sibling group.
 * - Name/page inputs are associated with visually-hidden labels.
 */

type TopicSuggestion = components['schemas']['TopicSuggestion'];

/** Internal editing node: TopicSuggestion fields plus a stable key + include flag. */
interface EditorNode {
  /** Stable identity for React keys + control wiring (not emitted). */
  key: string;
  name: string;
  sourceId?: string;
  pageStart?: number;
  pageEnd?: number;
  /** Whether this branch is included in the emitted output. */
  included: boolean;
  children: EditorNode[];
}

export interface TopicTreeEditorProps {
  /** Initial suggested topic tree to seed the editor. */
  suggestions: TopicSuggestion[];
  /** Emits the cleaned final tree whenever the user edits it. */
  onChange?: (topics: TopicSuggestion[]) => void;
  /** Disables all editing controls (e.g. while applying). */
  disabled?: boolean;
  /** Optional accessible label for the tree region. */
  label?: ReactNode;
  /** Rendered when there are no suggestions to edit. */
  emptyState?: ReactNode;
  /** Class names applied to the outer wrapper. */
  className?: string;
}

/** Joins truthy class fragments into a single className string. */
function cx(...parts: Array<string | false | null | undefined>): string {
  return parts.filter(Boolean).join(' ');
}

let keySeq = 0;
function nextKey(): string {
  keySeq += 1;
  return `tte-${keySeq}`;
}

/** Maps incoming suggestions into internal editor nodes (all included). */
function toNodes(suggestions: TopicSuggestion[]): EditorNode[] {
  return [...suggestions]
    .sort((a, b) => a.order - b.order)
    .map((s) => ({
      key: nextKey(),
      name: s.name,
      sourceId: s.sourceId,
      pageStart: s.pageStart,
      pageEnd: s.pageEnd,
      included: true,
      children: toNodes(s.children ?? []),
    }));
}

/** Serialises included nodes back to TopicSuggestion[], re-sequencing `order`. */
function toSuggestions(nodes: EditorNode[]): TopicSuggestion[] {
  const result: TopicSuggestion[] = [];
  for (const node of nodes) {
    if (!node.included) continue;
    const children = toSuggestions(node.children);
    const out: TopicSuggestion = {
      name: node.name,
      order: result.length,
    };
    if (node.sourceId != null) out.sourceId = node.sourceId;
    if (node.pageStart != null) out.pageStart = node.pageStart;
    if (node.pageEnd != null) out.pageEnd = node.pageEnd;
    if (children.length > 0) out.children = children;
    result.push(out);
  }
  return result;
}

/**
 * Applies `updater` to the node at `path` (array of sibling indices), returning
 * a new tree. A node whose entire branch should be removed/moved is handled by
 * the dedicated reorder/remove helpers below.
 */
function updateAt(
  nodes: EditorNode[],
  path: number[],
  updater: (node: EditorNode) => EditorNode,
): EditorNode[] {
  const [head, ...rest] = path;
  return nodes.map((node, i) => {
    if (i !== head) return node;
    if (rest.length === 0) return updater(node);
    return { ...node, children: updateAt(node.children, rest, updater) };
  });
}

/** Moves a sibling at `path` up (-1) or down (+1) within its group. */
function moveAt(nodes: EditorNode[], path: number[], delta: -1 | 1): EditorNode[] {
  const parentPath = path.slice(0, -1);
  const index = path[path.length - 1];

  const reorder = (siblings: EditorNode[]): EditorNode[] => {
    const target = index + delta;
    if (target < 0 || target >= siblings.length) return siblings;
    const copy = [...siblings];
    const [moved] = copy.splice(index, 1);
    copy.splice(target, 0, moved);
    return copy;
  };

  if (parentPath.length === 0) return reorder(nodes);
  return updateAt(nodes, parentPath, (parent) => ({
    ...parent,
    children: reorder(parent.children),
  }));
}

function ArrowUpIcon() {
  return (
    <svg width="1em" height="1em" viewBox="0 0 24 24" fill="none" aria-hidden="true" focusable="false">
      <path d="M12 19V5M5 12l7-7 7 7" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function ArrowDownIcon() {
  return (
    <svg width="1em" height="1em" viewBox="0 0 24 24" fill="none" aria-hidden="true" focusable="false">
      <path d="M12 5v14M19 12l-7 7-7-7" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

interface RowProps {
  node: EditorNode;
  path: number[];
  depth: number;
  index: number;
  siblingCount: number;
  disabled: boolean;
  idPrefix: string;
  onPatch: (path: number[], patch: Partial<EditorNode>) => void;
  onMove: (path: number[], delta: -1 | 1) => void;
}

function TopicRow({
  node,
  path,
  depth,
  index,
  siblingCount,
  disabled,
  idPrefix,
  onPatch,
  onMove,
}: RowProps) {
  const nameId = `${idPrefix}-${node.key}-name`;
  const startId = `${idPrefix}-${node.key}-start`;
  const endId = `${idPrefix}-${node.key}-end`;
  const includeId = `${idPrefix}-${node.key}-include`;

  const controlBase =
    'inline-flex h-8 w-8 items-center justify-center rounded-md border ' +
    'border-border bg-surface text-foreground-muted text-base transition-colors ' +
    'hover:bg-surface-muted hover:text-foreground ' +
    'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ' +
    'focus-visible:ring-offset-1 focus-visible:ring-offset-background ' +
    'disabled:cursor-not-allowed disabled:opacity-40';

  const inputBase =
    'h-9 rounded-md border border-border bg-surface px-2.5 text-sm text-foreground ' +
    'placeholder:text-foreground-muted ' +
    'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ' +
    'focus-visible:ring-offset-1 focus-visible:ring-offset-background ' +
    'disabled:cursor-not-allowed disabled:opacity-60';

  const rowDisabled = disabled || !node.included;

  const handleNumber = (field: 'pageStart' | 'pageEnd', raw: string) => {
    const trimmed = raw.trim();
    if (trimmed === '') {
      onPatch(path, { [field]: undefined });
      return;
    }
    const parsed = Number.parseInt(trimmed, 10);
    if (Number.isNaN(parsed) || parsed < 1) return;
    onPatch(path, { [field]: parsed });
  };

  return (
    <li>
      <div
        className={cx(
          'flex flex-wrap items-center gap-2 rounded-card border border-border px-3 py-2',
          node.included ? 'bg-surface' : 'bg-surface-muted opacity-70',
        )}
        style={{ marginInlineStart: depth * 20 }}
      >
        {/* Include / exclude */}
        <div className="flex items-center">
          <input
            id={includeId}
            type="checkbox"
            checked={node.included}
            disabled={disabled}
            onChange={(e) => onPatch(path, { included: e.target.checked })}
            className={cx(
              'h-4 w-4 rounded border-border text-primary accent-primary',
              'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
              'focus-visible:ring-offset-1 focus-visible:ring-offset-background',
              'disabled:cursor-not-allowed disabled:opacity-60',
            )}
          />
          <label htmlFor={includeId} className="sr-only">
            Include topic “{node.name || 'Untitled'}”
          </label>
        </div>

        {/* Name */}
        <div className="min-w-[10rem] flex-1">
          <label htmlFor={nameId} className="sr-only">
            Topic name
          </label>
          <input
            id={nameId}
            type="text"
            value={node.name}
            disabled={rowDisabled}
            placeholder="Topic name"
            aria-invalid={node.name.trim() === '' || undefined}
            onChange={(e) => onPatch(path, { name: e.target.value })}
            className={cx(inputBase, 'w-full font-medium', node.name.trim() === '' && 'border-danger')}
          />
        </div>

        {/* Page range */}
        <div className="flex items-center gap-1 text-foreground-muted">
          <label htmlFor={startId} className="sr-only">
            Start page for “{node.name || 'Untitled'}”
          </label>
          <input
            id={startId}
            type="number"
            min={1}
            inputMode="numeric"
            value={node.pageStart ?? ''}
            disabled={rowDisabled}
            placeholder="p."
            onChange={(e) => handleNumber('pageStart', e.target.value)}
            className={cx(inputBase, 'w-16 text-center')}
          />
          <span aria-hidden="true">–</span>
          <label htmlFor={endId} className="sr-only">
            End page for “{node.name || 'Untitled'}”
          </label>
          <input
            id={endId}
            type="number"
            min={1}
            inputMode="numeric"
            value={node.pageEnd ?? ''}
            disabled={rowDisabled}
            placeholder="p."
            onChange={(e) => handleNumber('pageEnd', e.target.value)}
            className={cx(inputBase, 'w-16 text-center')}
          />
        </div>

        {/* Reorder */}
        <div className="flex items-center gap-1">
          <button
            type="button"
            disabled={disabled || index === 0}
            onClick={() => onMove(path, -1)}
            aria-label={`Move “${node.name || 'Untitled'}” up`}
            className={controlBase}
          >
            <ArrowUpIcon />
          </button>
          <button
            type="button"
            disabled={disabled || index === siblingCount - 1}
            onClick={() => onMove(path, 1)}
            aria-label={`Move “${node.name || 'Untitled'}” down`}
            className={controlBase}
          >
            <ArrowDownIcon />
          </button>
        </div>
      </div>

      {node.children.length > 0 && (
        <ul className="mt-2 flex flex-col gap-2">
          {node.children.map((child, childIndex) => (
            <TopicRow
              key={child.key}
              node={child}
              path={[...path, childIndex]}
              depth={depth + 1}
              index={childIndex}
              siblingCount={node.children.length}
              disabled={disabled}
              idPrefix={idPrefix}
              onPatch={onPatch}
              onMove={onMove}
            />
          ))}
        </ul>
      )}
    </li>
  );
}

export function TopicTreeEditor({
  suggestions,
  onChange,
  disabled = false,
  label = 'Suggested topics',
  emptyState,
  className,
}: TopicTreeEditorProps) {
  const reactId = useId();
  const idPrefix = `tte${reactId}`;

  const [nodes, setNodes] = useState<EditorNode[]>(() => toNodes(suggestions));

  // Re-seed when a new suggestion set arrives (identity change).
  useEffect(() => {
    setNodes(toNodes(suggestions));
  }, [suggestions]);

  const emit = useCallback(
    (next: EditorNode[]) => {
      onChange?.(toSuggestions(next));
    },
    [onChange],
  );

  const handlePatch = useCallback(
    (path: number[], patch: Partial<EditorNode>) => {
      setNodes((prev) => {
        const next = updateAt(prev, path, (node) => ({ ...node, ...patch }));
        emit(next);
        return next;
      });
    },
    [emit],
  );

  const handleMove = useCallback(
    (path: number[], delta: -1 | 1) => {
      setNodes((prev) => {
        const next = moveAt(prev, path, delta);
        emit(next);
        return next;
      });
    },
    [emit],
  );

  const includedCount = useMemo(() => {
    const count = (list: EditorNode[]): number =>
      list.reduce((acc, n) => acc + (n.included ? 1 : 0) + count(n.children), 0);
    return count(nodes);
  }, [nodes]);

  const labelId = `${idPrefix}-label`;

  if (nodes.length === 0) {
    return (
      <div className={cx('text-sm text-foreground-muted', className)} role="status">
        {emptyState ?? 'No suggested topics to edit yet.'}
      </div>
    );
  }

  return (
    <div className={cx('flex flex-col gap-3', className)}>
      <div className="flex items-baseline justify-between gap-2">
        <h3 id={labelId} className="font-display text-base font-bold text-foreground">
          {label}
        </h3>
        <span className="text-xs text-foreground-muted" aria-live="polite">
          {includedCount} included
        </span>
      </div>

      <ul aria-labelledby={labelId} className="flex flex-col gap-2">
        {nodes.map((node, index) => (
          <TopicRow
            key={node.key}
            node={node}
            path={[index]}
            depth={0}
            index={index}
            siblingCount={nodes.length}
            disabled={disabled}
            idPrefix={idPrefix}
            onPatch={handlePatch}
            onMove={handleMove}
          />
        ))}
      </ul>
    </div>
  );
}
