import { useMemo } from 'react';
import type { ReactNode } from 'react';
import type { components } from '../api/schema';

/**
 * 2-U04 — StudyGuideView
 *
 * Presentational view of an AI-generated, citation-grounded study guide
 * (contract `StudyGuide`, 2-C02). Renders the guide's Markdown body (2-U10),
 * a sticky section navigation derived from its headings, and the source
 * citations that ground its content (2-U03).
 *
 * Props-driven only: no data fetching, no hooks beyond local memoisation, no
 * business logic. Styling uses the StudyRover design tokens from
 * `tailwind.config.ts` (e.g. `bg-surface`, `text-foreground`, `rounded-card`).
 *
 * The component ships a small, self-contained Markdown renderer covering the
 * subset emitted by study guides: ATX headings, paragraphs, ordered/unordered
 * lists, fenced/indented code, blockquotes, horizontal rules and inline
 * emphasis/code/links. It is deliberately dependency-free so the shared UI
 * library stays buildable without a Markdown package.
 */

type StudyGuide = components['schemas']['StudyGuide'];
type Citation = components['schemas']['Citation'];

export interface StudyGuideViewProps {
  /** The study guide to render. */
  guide: StudyGuide;
  /** Optional heading shown above the guide body (e.g. the subject/topic name). */
  title?: string;
  /**
   * Optional click handler for a citation. When provided, each citation in the
   * sources list becomes an interactive button (e.g. to open the source).
   */
  onCitationClick?: (citation: Citation) => void;
  className?: string;
}

/** Joins truthy class fragments into a single className string. */
function cx(...parts: Array<string | false | null | undefined>): string {
  return parts.filter(Boolean).join(' ');
}

/** A heading extracted from the Markdown, used to build the section nav. */
interface GuideSection {
  id: string;
  text: string;
  level: number;
}

/** Slugify heading text into a stable, URL-safe anchor id. */
function slugify(text: string, seen: Map<string, number>): string {
  const base =
    text
      .toLowerCase()
      .replace(/[`*_~]/g, '')
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '') || 'section';
  const count = seen.get(base) ?? 0;
  seen.set(base, count + 1);
  return count === 0 ? base : `${base}-${count}`;
}

/**
 * Render inline Markdown (code, bold, italics, links) into React nodes.
 * Order matters: code spans are extracted first so their contents are not
 * re-interpreted as emphasis.
 */
function renderInline(text: string, keyPrefix: string): ReactNode[] {
  const nodes: ReactNode[] = [];
  // Tokenise into code spans vs. the rest; emphasis/links only apply outside code.
  const codeRe = /`([^`]+)`/g;
  let last = 0;
  let match: RegExpExecArray | null;
  let i = 0;
  while ((match = codeRe.exec(text)) !== null) {
    if (match.index > last) {
      nodes.push(
        ...renderEmphasis(text.slice(last, match.index), `${keyPrefix}-t${i}`),
      );
    }
    nodes.push(
      <code
        key={`${keyPrefix}-c${i}`}
        className="rounded bg-surface-muted px-1.5 py-0.5 font-mono text-[0.875em] text-foreground"
      >
        {match[1]}
      </code>,
    );
    last = match.index + match[0].length;
    i += 1;
  }
  if (last < text.length) {
    nodes.push(...renderEmphasis(text.slice(last), `${keyPrefix}-t${i}`));
  }
  return nodes;
}

/** Render bold/italic emphasis and links within a code-free text segment. */
function renderEmphasis(text: string, keyPrefix: string): ReactNode[] {
  const nodes: ReactNode[] = [];
  // Combined matcher: links, **bold**, *italic*/_italic_.
  const re =
    /\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)|\*\*([^*]+)\*\*|\*([^*]+)\*|_([^_]+)_/g;
  let last = 0;
  let match: RegExpExecArray | null;
  let i = 0;
  while ((match = re.exec(text)) !== null) {
    if (match.index > last) {
      nodes.push(text.slice(last, match.index));
    }
    if (match[1] != null && match[2] != null) {
      nodes.push(
        <a
          key={`${keyPrefix}-l${i}`}
          href={match[2]}
          target="_blank"
          rel="noreferrer noopener"
          className="font-medium text-primary underline underline-offset-2 hover:text-primary/80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
        >
          {match[1]}
        </a>,
      );
    } else if (match[3] != null) {
      nodes.push(
        <strong key={`${keyPrefix}-b${i}`} className="font-semibold text-foreground">
          {match[3]}
        </strong>,
      );
    } else {
      const emphasis = match[4] ?? match[5];
      nodes.push(
        <em key={`${keyPrefix}-i${i}`} className="italic">
          {emphasis}
        </em>,
      );
    }
    last = match.index + match[0].length;
    i += 1;
  }
  if (last < text.length) {
    nodes.push(text.slice(last));
  }
  return nodes;
}

/** A parsed top-level Markdown block. */
type Block =
  | { kind: 'heading'; level: number; text: string; id: string }
  | { kind: 'paragraph'; text: string }
  | { kind: 'ul'; items: string[] }
  | { kind: 'ol'; items: string[] }
  | { kind: 'code'; code: string }
  | { kind: 'quote'; text: string }
  | { kind: 'hr' };

/**
 * Parse Markdown source into a flat list of blocks and the heading sections.
 * A single pass keeps section ids in sync between the nav and the rendered body.
 */
function parseMarkdown(markdown: string): {
  blocks: Block[];
  sections: GuideSection[];
} {
  const lines = markdown.replace(/\r\n/g, '\n').split('\n');
  const blocks: Block[] = [];
  const sections: GuideSection[] = [];
  const seen = new Map<string, number>();

  let row = 0;
  while (row < lines.length) {
    const line = lines[row];

    // Fenced code block.
    const fence = line.match(/^\s*```/);
    if (fence) {
      const code: string[] = [];
      row += 1;
      while (row < lines.length && !/^\s*```/.test(lines[row])) {
        code.push(lines[row]);
        row += 1;
      }
      row += 1; // consume closing fence (if present)
      blocks.push({ kind: 'code', code: code.join('\n') });
      continue;
    }

    // Blank line — skip.
    if (line.trim() === '') {
      row += 1;
      continue;
    }

    // Horizontal rule.
    if (/^\s*(?:-{3,}|\*{3,}|_{3,})\s*$/.test(line)) {
      blocks.push({ kind: 'hr' });
      row += 1;
      continue;
    }

    // ATX heading.
    const heading = line.match(/^(#{1,6})\s+(.*)$/);
    if (heading) {
      const level = heading[1].length;
      const text = heading[2].replace(/\s+#+\s*$/, '').trim();
      const id = slugify(text, seen);
      blocks.push({ kind: 'heading', level, text, id });
      sections.push({ id, text, level });
      row += 1;
      continue;
    }

    // Blockquote (one or more consecutive `>` lines).
    if (/^\s*>/.test(line)) {
      const quote: string[] = [];
      while (row < lines.length && /^\s*>/.test(lines[row])) {
        quote.push(lines[row].replace(/^\s*>\s?/, ''));
        row += 1;
      }
      blocks.push({ kind: 'quote', text: quote.join(' ') });
      continue;
    }

    // Unordered list.
    if (/^\s*[-*+]\s+/.test(line)) {
      const items: string[] = [];
      while (row < lines.length && /^\s*[-*+]\s+/.test(lines[row])) {
        items.push(lines[row].replace(/^\s*[-*+]\s+/, ''));
        row += 1;
      }
      blocks.push({ kind: 'ul', items });
      continue;
    }

    // Ordered list.
    if (/^\s*\d+[.)]\s+/.test(line)) {
      const items: string[] = [];
      while (row < lines.length && /^\s*\d+[.)]\s+/.test(lines[row])) {
        items.push(lines[row].replace(/^\s*\d+[.)]\s+/, ''));
        row += 1;
      }
      blocks.push({ kind: 'ol', items });
      continue;
    }

    // Paragraph — gather consecutive non-blank, non-structural lines.
    const para: string[] = [];
    while (
      row < lines.length &&
      lines[row].trim() !== '' &&
      !/^\s*```/.test(lines[row]) &&
      !/^(#{1,6})\s+/.test(lines[row]) &&
      !/^\s*>/.test(lines[row]) &&
      !/^\s*[-*+]\s+/.test(lines[row]) &&
      !/^\s*\d+[.)]\s+/.test(lines[row]) &&
      !/^\s*(?:-{3,}|\*{3,}|_{3,})\s*$/.test(lines[row])
    ) {
      para.push(lines[row].trim());
      row += 1;
    }
    blocks.push({ kind: 'paragraph', text: para.join(' ') });
  }

  return { blocks, sections };
}

const headingClasses: Record<number, string> = {
  1: 'font-display text-display-sm font-extrabold text-foreground mt-8 first:mt-0',
  2: 'font-display text-2xl font-bold text-foreground mt-7 first:mt-0',
  3: 'font-display text-xl font-bold text-foreground mt-6 first:mt-0',
  4: 'font-display text-lg font-semibold text-foreground mt-5 first:mt-0',
  5: 'text-base font-semibold text-foreground mt-4 first:mt-0',
  6: 'text-sm font-semibold uppercase tracking-wide text-foreground-muted mt-4 first:mt-0',
};

/** Render a single parsed block to React. */
function renderBlock(block: Block, index: number): ReactNode {
  const key = `b${index}`;
  switch (block.kind) {
    case 'heading': {
      const Tag = (`h${Math.min(block.level + 1, 6)}` as unknown) as keyof JSX.IntrinsicElements;
      return (
        <Tag
          key={key}
          id={block.id}
          className={cx('scroll-mt-24', headingClasses[block.level])}
        >
          {renderInline(block.text, key)}
        </Tag>
      );
    }
    case 'paragraph':
      return (
        <p key={key} className="mt-4 leading-relaxed text-foreground first:mt-0">
          {renderInline(block.text, key)}
        </p>
      );
    case 'ul':
      return (
        <ul key={key} className="mt-4 list-disc space-y-1.5 pl-6 text-foreground">
          {block.items.map((item, i) => (
            <li key={`${key}-${i}`} className="leading-relaxed">
              {renderInline(item, `${key}-${i}`)}
            </li>
          ))}
        </ul>
      );
    case 'ol':
      return (
        <ol key={key} className="mt-4 list-decimal space-y-1.5 pl-6 text-foreground">
          {block.items.map((item, i) => (
            <li key={`${key}-${i}`} className="leading-relaxed">
              {renderInline(item, `${key}-${i}`)}
            </li>
          ))}
        </ol>
      );
    case 'code':
      return (
        <pre
          key={key}
          className="mt-4 overflow-x-auto rounded-card border border-border bg-surface-muted p-4 text-sm"
        >
          <code className="font-mono text-foreground">{block.code}</code>
        </pre>
      );
    case 'quote':
      return (
        <blockquote
          key={key}
          className="mt-4 border-l-4 border-primary/40 bg-surface-muted py-2 pl-4 pr-3 italic text-foreground-muted"
        >
          {renderInline(block.text, key)}
        </blockquote>
      );
    case 'hr':
      return <hr key={key} className="my-8 border-t border-border" />;
    default:
      return null;
  }
}

/** Compact, accessible label for a single citation. */
function citationLabel(citation: Citation): string {
  return citation.locator
    ? `${citation.label} — ${citation.locator}`
    : citation.label;
}

export function StudyGuideView({
  guide,
  title,
  onCitationClick,
  className,
}: StudyGuideViewProps) {
  const { blocks, sections } = useMemo(
    () => parseMarkdown(guide.markdown ?? ''),
    [guide.markdown],
  );

  const generated = useMemo(() => {
    const date = new Date(guide.generatedAt);
    return Number.isNaN(date.getTime())
      ? null
      : date.toLocaleDateString(undefined, {
          year: 'numeric',
          month: 'long',
          day: 'numeric',
        });
  }, [guide.generatedAt]);

  const hasNav = sections.length > 1;
  const hasCitations = guide.citations.length > 0;

  return (
    <article
      className={cx('text-foreground', className)}
      aria-label={title ?? 'Study guide'}
    >
      {(title || generated) && (
        <header className="mb-6">
          {title && (
            <h1 className="font-display text-display-sm font-extrabold text-foreground">
              {title}
            </h1>
          )}
          {generated && (
            <p className="mt-1 text-sm text-foreground-muted">
              Generated{' '}
              <time dateTime={guide.generatedAt}>{generated}</time>
            </p>
          )}
        </header>
      )}

      <div className={cx('gap-8', hasNav && 'lg:grid lg:grid-cols-[16rem_1fr]')}>
        {hasNav && (
          <nav
            aria-label="Sections"
            className="mb-6 lg:sticky lg:top-20 lg:mb-0 lg:self-start"
          >
            <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-foreground-muted">
              On this page
            </p>
            <ul className="space-y-1 border-l border-border">
              {sections.map((section) => (
                <li key={section.id}>
                  <a
                    href={`#${section.id}`}
                    className={cx(
                      'block border-l-2 border-transparent py-1 text-sm text-foreground-muted',
                      'hover:border-primary hover:text-foreground',
                      'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background',
                      '-ml-px',
                    )}
                    style={{ paddingLeft: `${0.75 + (section.level - 1) * 0.75}rem` }}
                  >
                    {section.text}
                  </a>
                </li>
              ))}
            </ul>
          </nav>
        )}

        <div className="min-w-0">
          {blocks.length > 0 ? (
            <div className="max-w-prose">{blocks.map(renderBlock)}</div>
          ) : (
            <p className="text-foreground-muted">This study guide is empty.</p>
          )}

          {hasCitations && (
            <section
              aria-label="Sources"
              className="mt-10 border-t border-border pt-6"
            >
              <h2 className="font-display text-lg font-bold text-foreground">
                Sources
              </h2>
              <ol className="mt-3 space-y-2">
                {guide.citations.map((citation, i) => {
                  const marker = (
                    <span
                      aria-hidden="true"
                      className="mt-0.5 inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-pill bg-primary-soft text-xs font-semibold text-primary"
                    >
                      {i + 1}
                    </span>
                  );
                  const body = (
                    <span className="min-w-0">
                      <span className="block truncate font-medium text-foreground">
                        {citation.label}
                      </span>
                      {citation.locator && (
                        <span className="block text-sm text-foreground-muted">
                          {citation.locator}
                        </span>
                      )}
                    </span>
                  );
                  const key = `${citation.sourceId}-${i}`;
                  return (
                    <li key={key}>
                      {onCitationClick ? (
                        <button
                          type="button"
                          onClick={() => onCitationClick(citation)}
                          aria-label={citationLabel(citation)}
                          className="flex w-full items-start gap-3 rounded-card border border-border bg-surface p-3 text-left transition-colors hover:bg-surface-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
                        >
                          {marker}
                          {body}
                        </button>
                      ) : (
                        <div className="flex items-start gap-3 rounded-card border border-border bg-surface p-3">
                          {marker}
                          {body}
                        </div>
                      )}
                    </li>
                  );
                })}
              </ol>
            </section>
          )}
        </div>
      </div>
    </article>
  );
}
