import { GraduationCap } from 'lucide-react';

/** Joins truthy class fragments into a single className string. */
function cx(...parts: Array<string | false | null | undefined>): string {
  return parts.filter(Boolean).join(' ');
}

/**
 * StudyRover logo mark — a primary-filled rounded tile with a graduation-cap
 * glyph. Sized via `size` (px). Use anywhere the brand appears (header,
 * auth screens, empty states).
 */
export function Logo({
  size = 28,
  className,
}: {
  size?: number;
  className?: string;
}) {
  return (
    <span
      aria-hidden="true"
      className={cx(
        'inline-flex shrink-0 items-center justify-center rounded-md bg-primary text-primary-foreground',
        className,
      )}
      style={{ width: size, height: size }}
    >
      <GraduationCap style={{ width: size * 0.6, height: size * 0.6 }} />
    </span>
  );
}
