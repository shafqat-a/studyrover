import { useMemo } from 'react';

import { MarkdownRenderer } from '../MarkdownRenderer';
import { stripLeadingTitle } from './lessonUtils';

/**
 * LessonBody — renders a lesson's Markdown body.
 *
 * `MarkdownRenderer` already typesets `$…$` / `$$…$$` math with KaTeX and
 * renders pipe tables and `<details>` answer blocks, so this wrapper only
 * drops a leading `# Heading` that merely repeats the lesson title (AI-written
 * bodies usually start with one) so the page heading is not shown twice.
 */
export interface LessonBodyProps {
  markdown: string;
  /** When given, a leading H1 equal to this title is removed. */
  stripTitle?: string;
  className?: string;
}

export function LessonBody({ markdown, stripTitle, className }: LessonBodyProps) {
  const source = useMemo(
    () => (stripTitle ? stripLeadingTitle(markdown, stripTitle) : markdown),
    [markdown, stripTitle],
  );
  return (
    <div className={['sr-rich', className].filter(Boolean).join(' ')}>
      <MarkdownRenderer as="article">{source}</MarkdownRenderer>
    </div>
  );
}
