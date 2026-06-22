import { Fragment } from 'react';
import type { ReactNode } from 'react';

/**
 * U10 — MarkdownRenderer
 *
 * A presentational, accessible component that renders a safe subset of Markdown
 * (study guides + tutor answers) as React elements. Props-driven only: no data
 * fetching, no hooks, no business logic.
 *
 * Security: this renderer is XSS-safe *by construction*. It never uses
 * `dangerouslySetInnerHTML`; the Markdown source is parsed into a tree and
 * emitted as plain React elements, so any embedded HTML (e.g. `<script>`,
 * `<img onerror=...>`) is rendered as literal, escaped text — never executed.
 * Link/image URLs are additionally sanitized so only safe schemes are honored;
 * unsafe schemes (`javascript:`, `data:`, etc.) are stripped.
 *
 * Supported syntax:
 * - ATX headings (`#`…`######`)
 * - Paragraphs and hard line breaks (two trailing spaces or `\`)
 * - Unordered (`-`, `*`, `+`) and ordered (`1.`) lists, with nesting
 * - Blockquotes (`>`)
 * - Fenced code blocks (```), with optional language label
 * - Horizontal rules (`---`, `***`, `___`)
 * - Inline: bold (`**`/`__`), italic (`*`/`_`), inline code (`` ` ``),
 *   links (`[text](url)`), and autolinked bare http(s) URLs.
 *
 * Styling uses the StudyRover design tokens from `tailwind.config.ts`.
 */

export interface MarkdownRendererProps {
  /** The Markdown source to render. */
  children: string;
  /** Extra classes applied to the wrapper element. */
  className?: string;
  /** Wrapper element tag. Defaults to `div`. */
  as?: 'div' | 'article' | 'section';
}

/** Joins truthy class fragments into a single className string. */
function cx(...parts: Array<string | false | null | undefined>): string {
  return parts.filter(Boolean).join(' ');
}

/* --------------------------------------------------------------------------
 * URL sanitization
 * ------------------------------------------------------------------------ */

// Only these schemes (or scheme-less relative/anchor URLs) are allowed for
// links and images. Everything else collapses to a harmless placeholder.
const SAFE_URL = /^(?:https?:|mailto:|tel:|#|\/|\.{0,2}\/)/i;

function sanitizeUrl(raw: string): string | undefined {
  const url = raw.trim();
  if (url === '') return undefined;
  // Reject any control characters that could smuggle a scheme break.
  // eslint-disable-next-line no-control-regex
  if (/[\u0000-\u0020]/.test(url)) return undefined;
  if (SAFE_URL.test(url)) return url;
  return undefined;
}

/* --------------------------------------------------------------------------
 * Inline parsing → ReactNode[]
 * ------------------------------------------------------------------------ */

interface InlineCtx {
  /** Monotonic key source so sibling fragments stay stable. */
  next: () => string;
}

function makeCtx(prefix: string): InlineCtx {
  let i = 0;
  return { next: () => `${prefix}-${i++}` };
}

// Matches the *earliest* of the supported inline constructs.
const INLINE = new RegExp(
  [
    '(`+)([\\s\\S]+?)\\1', // 1,2: inline code
    '(\\*\\*|__)(?=\\S)([\\s\\S]+?\\S)\\3', // 3,4: bold
    '(\\*|_)(?=\\S)([\\s\\S]+?\\S)\\5', // 5,6: italic
    '!\\[([^\\]]*)\\]\\(([^)\\s]+)(?:\\s+"([^"]*)")?\\)', // 7,8,9: image
    '\\[([^\\]]*)\\]\\(([^)\\s]+)(?:\\s+"([^"]*)")?\\)', // 10,11,12: link
    '(https?:\\/\\/[^\\s<]+[^\\s<.,:;"\')\\]])', // 13: autolink
  ].join('|'),
);

function parseInline(text: string, ctx: InlineCtx): ReactNode[] {
  const out: ReactNode[] = [];
  let rest = text;

  while (rest.length > 0) {
    const m = INLINE.exec(rest);
    if (!m || m.index === undefined) {
      out.push(...emitText(rest, ctx));
      break;
    }

    if (m.index > 0) {
      out.push(...emitText(rest.slice(0, m.index), ctx));
    }

    if (m[1] !== undefined) {
      // inline code
      out.push(
        <code
          key={ctx.next()}
          className="rounded bg-surface-muted px-1.5 py-0.5 font-mono text-[0.9em] text-foreground"
        >
          {m[2]}
        </code>,
      );
    } else if (m[3] !== undefined) {
      out.push(
        <strong key={ctx.next()} className="font-bold text-foreground">
          {parseInline(m[4], ctx)}
        </strong>,
      );
    } else if (m[5] !== undefined) {
      out.push(
        <em key={ctx.next()} className="italic">
          {parseInline(m[6], ctx)}
        </em>,
      );
    } else if (m[7] !== undefined || m[8] !== undefined) {
      const src = sanitizeUrl(m[8] ?? '');
      const alt = m[7] ?? '';
      if (src) {
        out.push(
          <img
            key={ctx.next()}
            src={src}
            alt={alt}
            title={m[9] || undefined}
            className="my-2 max-w-full rounded-md border border-border"
          />,
        );
      } else {
        // Unsafe/empty image src → render the alt text as plain text.
        out.push(<Fragment key={ctx.next()}>{alt}</Fragment>);
      }
    } else if (m[10] !== undefined || m[11] !== undefined) {
      const href = sanitizeUrl(m[11] ?? '');
      const label = parseInline(m[10] ?? '', ctx);
      if (href) {
        out.push(
          <a
            key={ctx.next()}
            href={href}
            title={m[12] || undefined}
            target="_blank"
            rel="noopener noreferrer nofollow"
            className="font-semibold text-primary underline underline-offset-2 hover:text-primary/80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1 focus-visible:ring-offset-background"
          >
            {label}
          </a>,
        );
      } else {
        out.push(<Fragment key={ctx.next()}>{label}</Fragment>);
      }
    } else if (m[13] !== undefined) {
      const href = sanitizeUrl(m[13]);
      if (href) {
        out.push(
          <a
            key={ctx.next()}
            href={href}
            target="_blank"
            rel="noopener noreferrer nofollow"
            className="font-semibold text-primary underline underline-offset-2 hover:text-primary/80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1 focus-visible:ring-offset-background"
          >
            {m[13]}
          </a>,
        );
      } else {
        out.push(<Fragment key={ctx.next()}>{m[13]}</Fragment>);
      }
    }

    rest = rest.slice(m.index + m[0].length);
  }

  return out;
}

// Emits a run of plain text, honoring hard line breaks (`  \n` or `\\\n`).
function emitText(text: string, ctx: InlineCtx): ReactNode[] {
  const segments = text.split(/(?: {2,}|\\)\n/);
  const out: ReactNode[] = [];
  segments.forEach((seg, idx) => {
    if (idx > 0) out.push(<br key={ctx.next()} />);
    // Collapse remaining single newlines to spaces (soft wrap).
    out.push(
      <Fragment key={ctx.next()}>{seg.replace(/\n/g, ' ')}</Fragment>,
    );
  });
  return out;
}

/* --------------------------------------------------------------------------
 * Block parsing → ReactNode[]
 * ------------------------------------------------------------------------ */

interface ListItem {
  /** Raw inner text of the item (already de-indented), may contain children. */
  text: string;
  children: ListBlock[];
}

interface ListBlock {
  type: 'list';
  ordered: boolean;
  start: number;
  items: ListItem[];
}

const FENCE = /^(```+|~~~+)\s*([^\n`]*)$/;
const HEADING = /^(#{1,6})\s+(.*?)\s*#*\s*$/;
const HR = /^ {0,3}(?:-{3,}|\*{3,}|_{3,})\s*$/;
const UL_ITEM = /^(\s*)([-*+])\s+(.*)$/;
const OL_ITEM = /^(\s*)(\d{1,9})[.)]\s+(.*)$/;
const BLOCKQUOTE = /^ {0,3}>\s?(.*)$/;

let blockKey = 0;
function key(): string {
  return `b-${blockKey++}`;
}

function renderBlocks(src: string): ReactNode[] {
  const lines = src.replace(/\r\n?/g, '\n').split('\n');
  const out: ReactNode[] = [];
  let i = 0;

  while (i < lines.length) {
    const line = lines[i];

    // Blank line — skip.
    if (line.trim() === '') {
      i++;
      continue;
    }

    // Fenced code block.
    const fence = FENCE.exec(line);
    if (fence) {
      const marker = fence[1][0];
      const lang = fence[2].trim();
      const body: string[] = [];
      i++;
      while (i < lines.length && !new RegExp(`^${marker === '`' ? '`' : '~'}{3,}\\s*$`).test(lines[i])) {
        body.push(lines[i]);
        i++;
      }
      i++; // consume closing fence (or EOF)
      out.push(
        <pre
          key={key()}
          className="my-3 overflow-x-auto rounded-md border border-border bg-surface-muted p-3 text-sm"
        >
          <code className="font-mono text-foreground" data-language={lang || undefined}>
            {body.join('\n')}
          </code>
        </pre>,
      );
      continue;
    }

    // Heading.
    const heading = HEADING.exec(line);
    if (heading) {
      const level = heading[1].length;
      const ctx = makeCtx(key());
      const content = parseInline(heading[2], ctx);
      out.push(renderHeading(level, content));
      i++;
      continue;
    }

    // Horizontal rule.
    if (HR.test(line)) {
      out.push(<hr key={key()} className="my-5 border-0 border-t border-border" />);
      i++;
      continue;
    }

    // Blockquote.
    if (BLOCKQUOTE.test(line)) {
      const quoteLines: string[] = [];
      while (i < lines.length && BLOCKQUOTE.test(lines[i])) {
        quoteLines.push((BLOCKQUOTE.exec(lines[i]) as RegExpExecArray)[1]);
        i++;
      }
      out.push(
        <blockquote
          key={key()}
          className="my-3 border-l-4 border-primary/40 bg-surface-muted/50 py-1 pl-4 text-foreground-muted"
        >
          {renderBlocks(quoteLines.join('\n'))}
        </blockquote>,
      );
      continue;
    }

    // Lists.
    if (UL_ITEM.test(line) || OL_ITEM.test(line)) {
      const consumed = parseList(lines, i);
      out.push(renderList(consumed.block));
      i = consumed.next;
      continue;
    }

    // Paragraph: gather consecutive non-blank, non-block lines.
    const para: string[] = [];
    while (i < lines.length) {
      const l = lines[i];
      if (
        l.trim() === '' ||
        FENCE.test(l) ||
        HEADING.test(l) ||
        HR.test(l) ||
        BLOCKQUOTE.test(l) ||
        UL_ITEM.test(l) ||
        OL_ITEM.test(l)
      ) {
        break;
      }
      para.push(l);
      i++;
    }
    const ctx = makeCtx(key());
    out.push(
      <p key={key()} className="my-2 leading-relaxed text-foreground">
        {parseInline(para.join('\n'), ctx)}
      </p>,
    );
  }

  return out;
}

function renderHeading(level: number, content: ReactNode): ReactNode {
  const cls = [
    'mt-5 mb-2 font-display font-extrabold text-foreground text-3xl',
    'mt-5 mb-2 font-display font-bold text-foreground text-2xl',
    'mt-4 mb-2 font-display font-bold text-foreground text-xl',
    'mt-4 mb-1 font-display font-bold text-foreground text-lg',
    'mt-3 mb-1 font-display font-semibold text-foreground text-base',
    'mt-3 mb-1 font-display font-semibold text-foreground-muted text-sm uppercase tracking-wide',
  ][level - 1];
  const k = key();
  switch (level) {
    case 1:
      return <h1 key={k} className={cls}>{content}</h1>;
    case 2:
      return <h2 key={k} className={cls}>{content}</h2>;
    case 3:
      return <h3 key={k} className={cls}>{content}</h3>;
    case 4:
      return <h4 key={k} className={cls}>{content}</h4>;
    case 5:
      return <h5 key={k} className={cls}>{content}</h5>;
    default:
      return <h6 key={k} className={cls}>{content}</h6>;
  }
}

/** Parses a (possibly nested) list starting at `start`; returns block + next index. */
function parseList(
  lines: string[],
  start: number,
): { block: ListBlock; next: number } {
  const first = (UL_ITEM.exec(lines[start]) ?? OL_ITEM.exec(lines[start])) as RegExpExecArray;
  const baseIndent = first[1].length;
  const ordered = OL_ITEM.test(lines[start]);
  const startNum = ordered ? parseInt((OL_ITEM.exec(lines[start]) as RegExpExecArray)[2], 10) : 1;

  const items: ListItem[] = [];
  let i = start;

  while (i < lines.length) {
    const line = lines[i];
    const ul = UL_ITEM.exec(line);
    const ol = OL_ITEM.exec(line);
    const match = ul ?? ol;

    if (line.trim() === '') {
      // Allow a single blank line within a list (loose list); stop on two.
      if (i + 1 < lines.length && lines[i + 1].trim() === '') break;
      i++;
      continue;
    }

    if (!match) {
      // Continuation line indented under the current item.
      if (items.length > 0 && /^\s+\S/.test(line) && line.length - line.trimStart().length > baseIndent) {
        items[items.length - 1].text += '\n' + line.trim();
        i++;
        continue;
      }
      break;
    }

    const indent = match[1].length;
    if (indent < baseIndent) break;

    if (indent > baseIndent) {
      // Nested list belongs to the previous item.
      const nested = parseList(lines, i);
      if (items.length > 0) items[items.length - 1].children.push(nested.block);
      i = nested.next;
      continue;
    }

    // A sibling item at this level. Items must share ordered-ness.
    const isOrdered = ol !== null;
    if (isOrdered !== ordered) break;
    items.push({ text: match[3], children: [] });
    i++;
  }

  return { block: { type: 'list', ordered, start: startNum, items }, next: i };
}

function renderList(block: ListBlock): ReactNode {
  const k = key();
  const childItems = block.items.map((item) => {
    const ctx = makeCtx(key());
    return (
      <li key={key()} className="my-1 leading-relaxed">
        {parseInline(item.text, ctx)}
        {item.children.map((child) => renderList(child))}
      </li>
    );
  });

  if (block.ordered) {
    return (
      <ol
        key={k}
        start={block.start}
        className="my-2 list-decimal space-y-0.5 pl-6 text-foreground marker:text-foreground-muted"
      >
        {childItems}
      </ol>
    );
  }
  return (
    <ul
      key={k}
      className="my-2 list-disc space-y-0.5 pl-6 text-foreground marker:text-foreground-muted"
    >
      {childItems}
    </ul>
  );
}

/* --------------------------------------------------------------------------
 * Component
 * ------------------------------------------------------------------------ */

export function MarkdownRenderer({
  children,
  className,
  as: Tag = 'div',
}: MarkdownRendererProps) {
  // Reset the module-level key counter per render pass for stable, unique keys.
  blockKey = 0;
  const nodes = renderBlocks(children ?? '');

  return (
    <Tag
      className={cx(
        'max-w-none break-words text-base text-foreground [&>*:first-child]:mt-0 [&>*:last-child]:mb-0',
        className,
      )}
    >
      {nodes}
    </Tag>
  );
}
