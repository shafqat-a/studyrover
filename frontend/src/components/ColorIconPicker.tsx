import { forwardRef, useId } from 'react';
import type { HTMLAttributes, ReactNode } from 'react';

/**
 * U11 — ColorIconPicker
 *
 * A presentational, accessible picker for choosing a subject's color + icon
 * (onboarding / subject editor — screen 2.2). Props-driven only: no data
 * fetching, no business logic. The value is fully controlled by the parent via
 * `value` + `onChange`. Styling uses the StudyRover design tokens from
 * `tailwind.config.ts` (e.g. `bg-surface`, `rounded-card`, `border-border`,
 * `shadow-card`, `ring-ring`).
 *
 * Accessibility:
 * - Two semantic radio groups (`role="radiogroup"`) — one for color, one for
 *   icon — each labelled.
 * - Swatches/tiles are `role="radio"` with `aria-checked`; only the selected
 *   tile (or the first when none selected) is in the tab order (roving
 *   tabindex), and Arrow keys move selection within a group.
 */

/** A selectable color option. `value` is the stored token; `swatch` is any CSS color. */
export interface ColorOption {
  value: string;
  /** CSS color used to paint the swatch (e.g. `#6366f1` or `hsl(...)`). */
  swatch: string;
  /** Accessible label, e.g. "Indigo". */
  label: string;
}

/** A selectable icon option. `value` is the stored token; `glyph` is rendered visually. */
export interface IconOption {
  value: string;
  /** Visual representation — an emoji string or an icon node. */
  glyph: ReactNode;
  /** Accessible label, e.g. "Calculator". */
  label: string;
}

export interface ColorIconValue {
  color: string;
  icon: string;
}

export interface ColorIconPickerProps
  extends Omit<HTMLAttributes<HTMLDivElement>, 'onChange' | 'defaultValue'> {
  /** Controlled selection. */
  value: ColorIconValue;
  /** Called with the next full value when either dimension changes. */
  onChange: (next: ColorIconValue) => void;
  /** Available colors. Defaults to a kid-friendly palette. */
  colors?: ColorOption[];
  /** Available icons. Defaults to a small subject-themed set. */
  icons?: IconOption[];
  /** Group heading for the color section. Defaults to "Color". */
  colorLabel?: string;
  /** Group heading for the icon section. Defaults to "Icon". */
  iconLabel?: string;
  /** Disables all interaction and dims the control. */
  disabled?: boolean;
}

/** Joins truthy class fragments into a single className string. */
function cx(...parts: Array<string | false | null | undefined>): string {
  return parts.filter(Boolean).join(' ');
}

/** Sensible kid-friendly default palette. */
export const DEFAULT_COLORS: ColorOption[] = [
  { value: 'indigo', swatch: '#6366f1', label: 'Indigo' },
  { value: 'teal', swatch: '#14b8a6', label: 'Teal' },
  { value: 'amber', swatch: '#f59e0b', label: 'Amber' },
  { value: 'rose', swatch: '#f43f5e', label: 'Rose' },
  { value: 'emerald', swatch: '#10b981', label: 'Emerald' },
  { value: 'sky', swatch: '#0ea5e9', label: 'Sky' },
  { value: 'violet', swatch: '#8b5cf6', label: 'Violet' },
  { value: 'orange', swatch: '#fb923c', label: 'Orange' },
];

/** Sensible default subject icon set (emoji glyphs). */
export const DEFAULT_ICONS: IconOption[] = [
  { value: 'calculator', glyph: '🧮', label: 'Calculator' },
  { value: 'book', glyph: '📚', label: 'Book' },
  { value: 'flask', glyph: '🧪', label: 'Flask' },
  { value: 'globe', glyph: '🌍', label: 'Globe' },
  { value: 'palette', glyph: '🎨', label: 'Palette' },
  { value: 'music', glyph: '🎵', label: 'Music' },
  { value: 'rocket', glyph: '🚀', label: 'Rocket' },
  { value: 'pencil', glyph: '✏️', label: 'Pencil' },
];

const ICON_GLYPHS: Record<string, string> = Object.fromEntries(
  DEFAULT_ICONS.flatMap((i) =>
    typeof i.glyph === 'string' ? [[i.value, i.glyph] as const] : [],
  ),
);

/**
 * Resolve a stored icon value to a displayable glyph. Subjects may store either
 * a token (e.g. "calculator", from the picker / seed) or an emoji directly.
 * Tokens map to their glyph; emoji pass through; an unknown word falls back to a
 * book. This keeps cards from rendering a raw token like "calculator".
 */
export function iconGlyph(value?: string | null): string {
  if (!value) return '📚';
  if (ICON_GLYPHS[value]) return ICON_GLYPHS[value];
  // No ASCII letters → already an emoji/glyph, render as-is.
  if (!/[a-zA-Z]/.test(value)) return value;
  return '📚';
}

/** Moves selection within a group via Arrow/Home/End keys (roving tabindex). */
function handleArrowNav<T extends { value: string }>(
  event: React.KeyboardEvent,
  options: T[],
  currentIndex: number,
  select: (value: string) => void,
): void {
  const last = options.length - 1;
  let next = -1;
  switch (event.key) {
    case 'ArrowRight':
    case 'ArrowDown':
      next = currentIndex >= last ? 0 : currentIndex + 1;
      break;
    case 'ArrowLeft':
    case 'ArrowUp':
      next = currentIndex <= 0 ? last : currentIndex - 1;
      break;
    case 'Home':
      next = 0;
      break;
    case 'End':
      next = last;
      break;
    default:
      return;
  }
  event.preventDefault();
  const option = options[next];
  if (option) select(option.value);
}

export const ColorIconPicker = forwardRef<HTMLDivElement, ColorIconPickerProps>(
  function ColorIconPicker(
    {
      value,
      onChange,
      colors = DEFAULT_COLORS,
      icons = DEFAULT_ICONS,
      colorLabel = 'Color',
      iconLabel = 'Icon',
      disabled = false,
      className,
      ...rest
    },
    ref,
  ) {
    const baseId = useId();
    const colorLabelId = `${baseId}-color`;
    const iconLabelId = `${baseId}-icon`;

    const selectedColorIndex = colors.findIndex((c) => c.value === value.color);
    const selectedIconIndex = icons.findIndex((i) => i.value === value.icon);

    const selectColor = (color: string) => {
      if (!disabled) onChange({ ...value, color });
    };
    const selectIcon = (icon: string) => {
      if (!disabled) onChange({ ...value, icon });
    };

    /** Index whose tile is keyboard-reachable: the selection, or the first tile. */
    const rovingColor = selectedColorIndex >= 0 ? selectedColorIndex : 0;
    const rovingIcon = selectedIconIndex >= 0 ? selectedIconIndex : 0;

    return (
      <div
        ref={ref}
        className={cx('flex flex-col gap-5', disabled && 'opacity-60', className)}
        {...rest}
      >
        {/* Color group */}
        <fieldset className="m-0 border-0 p-0" disabled={disabled}>
          <legend
            id={colorLabelId}
            className="mb-2 block text-sm font-semibold text-foreground-muted"
          >
            {colorLabel}
          </legend>
          <div
            role="radiogroup"
            aria-labelledby={colorLabelId}
            className="flex flex-wrap gap-2.5"
          >
            {colors.map((option, index) => {
              const checked = option.value === value.color;
              return (
                <button
                  key={option.value}
                  type="button"
                  role="radio"
                  aria-checked={checked}
                  aria-label={option.label}
                  title={option.label}
                  tabIndex={index === rovingColor ? 0 : -1}
                  disabled={disabled}
                  onClick={() => selectColor(option.value)}
                  onKeyDown={(e) =>
                    handleArrowNav(e, colors, index, selectColor)
                  }
                  className={cx(
                    'relative inline-flex h-touch w-touch items-center justify-center',
                    'rounded-pill border transition-all duration-150',
                    'focus-visible:outline-none focus-visible:ring-2',
                    'focus-visible:ring-ring focus-visible:ring-offset-2',
                    'focus-visible:ring-offset-background',
                    'disabled:cursor-not-allowed',
                    checked
                      ? 'border-foreground shadow-card scale-105'
                      : 'border-border hover:scale-105',
                  )}
                  style={{ backgroundColor: option.swatch }}
                >
                  {checked && (
                    <svg
                      width="1.1em"
                      height="1.1em"
                      viewBox="0 0 24 24"
                      fill="none"
                      aria-hidden="true"
                      focusable="false"
                      className="text-white drop-shadow"
                    >
                      <path
                        d="M5 13l4 4L19 7"
                        stroke="currentColor"
                        strokeWidth="3"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      />
                    </svg>
                  )}
                </button>
              );
            })}
          </div>
        </fieldset>

        {/* Icon group */}
        <fieldset className="m-0 border-0 p-0" disabled={disabled}>
          <legend
            id={iconLabelId}
            className="mb-2 block text-sm font-semibold text-foreground-muted"
          >
            {iconLabel}
          </legend>
          <div
            role="radiogroup"
            aria-labelledby={iconLabelId}
            className="grid grid-cols-4 gap-2.5 sm:grid-cols-8"
          >
            {icons.map((option, index) => {
              const checked = option.value === value.icon;
              return (
                <button
                  key={option.value}
                  type="button"
                  role="radio"
                  aria-checked={checked}
                  aria-label={option.label}
                  title={option.label}
                  tabIndex={index === rovingIcon ? 0 : -1}
                  disabled={disabled}
                  onClick={() => selectIcon(option.value)}
                  onKeyDown={(e) => handleArrowNav(e, icons, index, selectIcon)}
                  className={cx(
                    'inline-flex aspect-square items-center justify-center',
                    'rounded-card border bg-surface text-2xl text-foreground',
                    'transition-colors duration-150',
                    'focus-visible:outline-none focus-visible:ring-2',
                    'focus-visible:ring-ring focus-visible:ring-offset-2',
                    'focus-visible:ring-offset-background',
                    'disabled:cursor-not-allowed',
                    checked
                      ? 'border-primary bg-primary-soft shadow-card'
                      : 'border-border hover:bg-surface-muted',
                  )}
                >
                  <span aria-hidden="true">{option.glyph}</span>
                </button>
              );
            })}
          </div>
        </fieldset>
      </div>
    );
  },
);
