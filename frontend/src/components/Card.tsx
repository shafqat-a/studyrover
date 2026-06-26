import { forwardRef } from 'react';
import type {
  AnchorHTMLAttributes,
  ButtonHTMLAttributes,
  HTMLAttributes,
  ReactNode,
} from 'react';

/**
 * U06 — Card
 *
 * A presentational, accessible container with optional header/footer and
 * padding variants. Props-driven only: no data fetching, no hooks, no business
 * logic. Styling uses the StudyRover design tokens from `tailwind.config.ts`
 * (e.g. `bg-surface`, `rounded-card`, `shadow-card`, `border-border`).
 *
 * Interactivity:
 * - Default renders a non-interactive `<div>`.
 * - Pass `href` to render a proper `<a>` (navigational).
 * - Pass `onClick` (without `href`) to render a proper `<button>` (action).
 *   Both interactive forms get a focus ring and hover affordance.
 */

export type CardPadding = 'none' | 'sm' | 'md' | 'lg';

interface CardOwnProps {
  /** Optional header region rendered above the body. */
  header?: ReactNode;
  /** Optional footer region rendered below the body. */
  footer?: ReactNode;
  /** Body padding. Defaults to `md`. Applies to header/footer too. */
  padding?: CardPadding;
  children?: ReactNode;
  className?: string;
}

export type CardProps =
  | (CardOwnProps &
      Omit<AnchorHTMLAttributes<HTMLAnchorElement>, 'className'> & {
        href: string;
      })
  | (CardOwnProps &
      Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'className'> & {
        href?: undefined;
        onClick: ButtonHTMLAttributes<HTMLButtonElement>['onClick'];
      })
  | (CardOwnProps &
      Omit<HTMLAttributes<HTMLDivElement>, 'className'> & {
        href?: undefined;
        onClick?: undefined;
      });

/** Joins truthy class fragments into a single className string. */
function cx(...parts: Array<string | false | null | undefined>): string {
  return parts.filter(Boolean).join(' ');
}

const paddingClasses: Record<CardPadding, string> = {
  none: 'p-0',
  sm: 'p-3',
  md: 'p-5',
  lg: 'p-7',
};

const dividerPadding: Record<CardPadding, string> = {
  none: 'px-0 py-0',
  sm: 'px-3 py-2',
  md: 'px-5 py-3',
  lg: 'px-7 py-4',
};

const base =
  'block overflow-hidden bg-surface border border-border rounded-card ' +
  'shadow-card text-left text-foreground';

const interactive =
  'transition-colors duration-150 hover:bg-surface-muted ' +
  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ' +
  'focus-visible:ring-offset-2 focus-visible:ring-offset-background ' +
  'cursor-pointer';

export const Card = forwardRef<HTMLElement, CardProps>(function Card(props, ref) {
  const {
    header,
    footer,
    padding = 'md',
    className,
    children,
    ...rest
  } = props as CardOwnProps & Record<string, unknown>;

  const isLink = typeof (props as { href?: string }).href === 'string';
  const isButton = !isLink && typeof (props as { onClick?: unknown }).onClick === 'function';
  const isInteractive = isLink || isButton;

  const content = (
    <>
      {header != null && (
        <div
          className={cx(
            'border-b border-border font-display font-bold',
            dividerPadding[padding],
          )}
        >
          {header}
        </div>
      )}
      <div className={paddingClasses[padding]}>{children}</div>
      {footer != null && (
        <div
          className={cx(
            'border-t border-border text-foreground-muted',
            dividerPadding[padding],
          )}
        >
          {footer}
        </div>
      )}
    </>
  );

  const classes = cx(base, isInteractive && interactive, className);

  if (isLink) {
    return (
      <a
        ref={ref as React.Ref<HTMLAnchorElement>}
        className={classes}
        {...(rest as AnchorHTMLAttributes<HTMLAnchorElement>)}
      >
        {content}
      </a>
    );
  }

  if (isButton) {
    return (
      <button
        ref={ref as React.Ref<HTMLButtonElement>}
        type="button"
        className={classes}
        {...(rest as ButtonHTMLAttributes<HTMLButtonElement>)}
      >
        {content}
      </button>
    );
  }

  return (
    <div
      ref={ref as React.Ref<HTMLDivElement>}
      className={classes}
      {...(rest as HTMLAttributes<HTMLDivElement>)}
    >
      {content}
    </div>
  );
});
