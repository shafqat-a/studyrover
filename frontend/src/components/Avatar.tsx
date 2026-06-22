import { forwardRef, useState } from 'react';
import type { HTMLAttributes, ReactNode } from 'react';

/**
 * U17 — Avatar
 *
 * A presentational, accessible avatar primitive for student profile/home.
 * Props-driven only: no data fetching, no business logic. Styling uses the
 * StudyRover design tokens from `tailwind.config.ts` (e.g. `bg-surface-muted`,
 * `rounded-full`, `text-foreground`, `border-border`).
 *
 * Behaviour:
 * - Renders `src` as an image with the required `alt` text.
 * - Falls back to derived initials (from `name`) when `src` is absent or the
 *   image fails to load.
 * - Falls back to a generic icon when neither `src` nor `name` is available.
 * - Sizes: xs | sm | md | lg | xl.
 */

export type AvatarSize = 'xs' | 'sm' | 'md' | 'lg' | 'xl';

export interface AvatarProps
  extends Omit<HTMLAttributes<HTMLSpanElement>, 'children'> {
  /** Image URL. When absent or failing to load, initials are shown. */
  src?: string;
  /**
   * Accessible label for the avatar. Used as the image `alt` and as the
   * `aria-label` for the initials/icon fallback. Always present.
   */
  alt: string;
  /**
   * Display name used to derive initials for the fallback. When omitted, a
   * generic person icon is shown instead.
   */
  name?: string;
  /** Size of the control. Defaults to `md`. */
  size?: AvatarSize;
  /** Optional element rendered on top (e.g. a status dot). */
  children?: ReactNode;
}

/** Joins truthy class fragments into a single className string. */
function cx(...parts: Array<string | false | null | undefined>): string {
  return parts.filter(Boolean).join(' ');
}

/** Derives up to two uppercase initials from a display name. */
function initialsFromName(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '';
  if (parts.length === 1) {
    return parts[0].slice(0, 2).toUpperCase();
  }
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

const sizeClasses: Record<AvatarSize, string> = {
  xs: 'h-6 w-6 text-[0.625rem]',
  sm: 'h-8 w-8 text-xs',
  md: 'h-10 w-10 text-sm',
  lg: 'h-12 w-12 text-base',
  xl: 'h-16 w-16 text-xl',
};

const base =
  'relative inline-flex shrink-0 items-center justify-center overflow-hidden ' +
  'rounded-full bg-surface-muted text-foreground border border-border ' +
  'font-semibold uppercase select-none align-middle';

function PersonIcon() {
  return (
    <svg
      className="h-[60%] w-[60%] text-foreground-muted"
      viewBox="0 0 24 24"
      fill="currentColor"
      aria-hidden="true"
      focusable="false"
    >
      <path d="M12 12a5 5 0 1 0 0-10 5 5 0 0 0 0 10Zm0 2c-4.42 0-8 2.69-8 6v2h16v-2c0-3.31-3.58-6-8-6Z" />
    </svg>
  );
}

export const Avatar = forwardRef<HTMLSpanElement, AvatarProps>(function Avatar(
  { src, alt, name, size = 'md', className, children, ...rest },
  ref,
) {
  const [failed, setFailed] = useState(false);
  const showImage = typeof src === 'string' && src.length > 0 && !failed;
  const initials = name ? initialsFromName(name) : '';

  return (
    <span
      ref={ref}
      className={cx(base, sizeClasses[size], className)}
      role={showImage ? undefined : 'img'}
      aria-label={showImage ? undefined : alt}
      {...rest}
    >
      {showImage ? (
        <img
          src={src}
          alt={alt}
          className="h-full w-full object-cover"
          onError={() => setFailed(true)}
        />
      ) : initials ? (
        <span aria-hidden="true">{initials}</span>
      ) : (
        <PersonIcon />
      )}
      {children}
    </span>
  );
});
