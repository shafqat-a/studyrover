import { useEffect, useMemo, useRef } from 'react';
import DOMPurify from 'dompurify';
import renderMathInElement from 'katex/contrib/auto-render';

/**
 * RichContent — renders AI-authored question content that may contain HTML,
 * LaTeX math, and inline SVG geometry figures, so formulas and diagrams display
 * properly instead of as raw source.
 *
 * Pipeline (safe by construction):
 *  1. DOMPurify sanitises the model HTML/SVG — scripts, event handlers,
 *     `foreignObject`, forms and links are stripped, so `dangerouslySetInnerHTML`
 *     only ever receives vetted markup. SVG (geometry diagrams) and MathML are
 *     allowed via DOMPurify's profiles.
 *  2. KaTeX `renderMathInElement` typesets LaTeX delimited by `$…$`, `$$…$$`,
 *     `\(…\)` and `\[…\]` in the sanitised DOM. `throwOnError:false` degrades a
 *     bad expression to its source rather than crashing the page.
 *
 * Use `inline` for option text (renders a `<span>`); the default renders a
 * block `<div>` suitable for a question body.
 */

export interface RichContentProps {
  /** The HTML/LaTeX/SVG content to render. Plain text is fine too. */
  html: string;
  /** Render inline (`<span>`) instead of block (`<div>`). */
  inline?: boolean;
  className?: string;
}

// Allow rich formatting + SVG geometry, but never executable or navigational
// markup. DOMPurify strips event handlers and unknown protocols by default; we
// additionally forbid tags that could escape the figure/text sandbox.
const SANITIZE_CONFIG = {
  USE_PROFILES: { html: true, svg: true, svgFilters: true, mathMl: true },
  FORBID_TAGS: ['script', 'style', 'iframe', 'foreignObject', 'form', 'input', 'a'],
};

const MATH_DELIMITERS = [
  { left: '$$', right: '$$', display: true },
  { left: '\\[', right: '\\]', display: true },
  { left: '\\(', right: '\\)', display: false },
  { left: '$', right: '$', display: false },
];

/** Strip tags and math delimiters to a plain string (for aria-labels/titles). */
export function toPlainText(html: string): string {
  if (!html) return '';
  const noTags = html.replace(/<[^>]*>/g, ' ');
  const decoded = noTags
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&')
    .replace(/&nbsp;/g, ' ');
  return decoded
    .replace(/\$\$?|\\\(|\\\)|\\\[|\\\]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

export function RichContent({ html, inline = false, className }: RichContentProps) {
  const elRef = useRef<HTMLElement | null>(null);
  const setRef = (el: HTMLElement | null) => {
    elRef.current = el;
  };

  const clean = useMemo(
    () => DOMPurify.sanitize(html ?? '', SANITIZE_CONFIG),
    [html],
  );

  useEffect(() => {
    const el = elRef.current;
    if (!el) return;
    try {
      renderMathInElement(el, {
        delimiters: MATH_DELIMITERS,
        throwOnError: false,
        ignoredTags: ['script', 'noscript', 'style', 'textarea', 'pre', 'code'],
      });
    } catch {
      // Leave the raw (sanitised) content in place if typesetting fails.
    }
  }, [clean]);

  const Tag = inline ? 'span' : 'div';
  return (
    <Tag
      ref={setRef}
      className={['sr-rich', className].filter(Boolean).join(' ')}
      // eslint-disable-next-line react/no-danger -- content is DOMPurify-sanitised above
      dangerouslySetInnerHTML={{ __html: clean }}
    />
  );
}
