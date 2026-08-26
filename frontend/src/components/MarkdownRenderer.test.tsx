import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { MarkdownRenderer } from './MarkdownRenderer';

describe('MarkdownRenderer', () => {
  it('renders headings, emphasis and lists', () => {
    render(
      <MarkdownRenderer>{'## Learning objectives\n- Explain **fractions**\n- Simplify'}</MarkdownRenderer>,
    );
    expect(screen.getByRole('heading', { level: 2 })).toHaveTextContent('Learning objectives');
    expect(screen.getAllByRole('listitem')).toHaveLength(2);
    expect(screen.getByText('fractions').tagName).toBe('STRONG');
  });

  it('typesets inline and display math with KaTeX', () => {
    const { container } = render(
      <MarkdownRenderer>{'Half is $\\frac{1}{2}$ of a whole.\n\n$$\n\\frac{6}{8} = \\frac{3}{4}\n$$'}</MarkdownRenderer>,
    );
    const katex = container.querySelectorAll('.katex');
    expect(katex.length).toBe(2);
    expect(container.querySelector('.katex-display')).not.toBeNull();
    // The raw TeX source must not leak into the visible text.
    expect(container.textContent).not.toContain('\\frac');
  });

  it('leaves currency-looking dollars alone', () => {
    const { container } = render(<MarkdownRenderer>{'Costs $5 and $10 each.'}</MarkdownRenderer>);
    expect(container.querySelector('.katex')).toBeNull();
    expect(container.textContent).toContain('$5 and $10');
  });

  it('renders <details>/<summary> as a disclosure, other HTML as text', () => {
    const { container } = render(
      <MarkdownRenderer>
        {'## Quick check\n1. What is 2/4 in lowest terms?\n\n<details>\n<summary>Answers</summary>\n\n1. **1/2**\n\n</details>\n\n<script>alert(1)</script>'}
      </MarkdownRenderer>,
    );
    const details = container.querySelector('details');
    expect(details).not.toBeNull();
    expect(details?.querySelector('summary')).toHaveTextContent('Answers');
    expect(details?.textContent).toContain('1/2');
    expect(container.querySelector('script')).toBeNull();
    expect(container.textContent).toContain('<script>alert(1)</script>');
  });

  it('renders pipe tables with alignment', () => {
    render(
      <MarkdownRenderer>
        {'| Term | Meaning |\n|:-----|--------:|\n| numerator | top number |\n| denominator | bottom \\| number |'}
      </MarkdownRenderer>,
    );
    const table = screen.getByRole('table');
    expect(table.querySelectorAll('th')).toHaveLength(2);
    expect(table.querySelectorAll('tbody tr')).toHaveLength(2);
    expect(screen.getByText('bottom | number')).toBeInTheDocument();
    expect(table.querySelectorAll('th')[1].className).toContain('text-right');
  });
});
