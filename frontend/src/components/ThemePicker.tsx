import { useEffect, useRef, useState } from 'react';
import { Check, Moon, Monitor, Palette, Sun } from 'lucide-react';

import { THEMES, useTheme, type ColorMode, type ThemeName } from '../app/theme';

/**
 * Appearance control: pick one of 5 brand themes + light/dark/system mode.
 *
 * `variant="compact"` renders an icon button that opens a popover (for the
 * header chrome). `variant="full"` renders the controls inline (for Settings).
 * State lives in <ThemeProvider>; this component only reads/writes it.
 */

function cx(...parts: Array<string | false | null | undefined>): string {
  return parts.filter(Boolean).join(' ');
}

const MODE_OPTIONS: Array<{
  value: ColorMode;
  label: string;
  icon: typeof Sun;
}> = [
  { value: 'light', label: 'Light', icon: Sun },
  { value: 'dark', label: 'Dark', icon: Moon },
  { value: 'system', label: 'Auto', icon: Monitor },
];

function ThemeSwatches({ onPick }: { onPick?: () => void }) {
  const { theme, setTheme } = useTheme();
  return (
    <div className="grid grid-cols-5 gap-2">
      {THEMES.map((option) => {
        const selected = theme === option.name;
        return (
          <button
            key={option.name}
            type="button"
            aria-label={option.label}
            aria-pressed={selected}
            title={option.label}
            onClick={() => {
              setTheme(option.name as ThemeName);
              onPick?.();
            }}
            className={cx(
              'group relative flex h-10 items-center justify-center rounded-md border-2 transition-colors',
              'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
              'focus-visible:ring-offset-2 focus-visible:ring-offset-surface',
              selected ? 'border-foreground' : 'border-transparent hover:border-border',
            )}
            style={{ backgroundColor: option.swatch }}
          >
            {selected && (
              <Check
                className="h-4 w-4 text-white drop-shadow"
                strokeWidth={3}
                aria-hidden="true"
              />
            )}
          </button>
        );
      })}
    </div>
  );
}

function ModeSwitch() {
  const { mode, setMode } = useTheme();
  return (
    <div
      role="radiogroup"
      aria-label="Color mode"
      className="grid grid-cols-3 gap-1 rounded-md border border-border bg-surface-muted p-1"
    >
      {MODE_OPTIONS.map((option) => {
        const selected = mode === option.value;
        const Icon = option.icon;
        return (
          <button
            key={option.value}
            type="button"
            role="radio"
            aria-checked={selected}
            onClick={() => setMode(option.value as ColorMode)}
            className={cx(
              'inline-flex h-8 items-center justify-center gap-1.5 rounded text-xs font-medium transition-colors',
              'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
              selected
                ? 'bg-surface text-foreground shadow-xs'
                : 'text-foreground-muted hover:text-foreground',
            )}
          >
            <Icon className="h-3.5 w-3.5" aria-hidden="true" />
            {option.label}
          </button>
        );
      })}
    </div>
  );
}

export function ThemePicker({ variant = 'compact' }: { variant?: 'compact' | 'full' }) {
  const { theme } = useTheme();
  const active = THEMES.find((t) => t.name === theme) ?? THEMES[0];

  if (variant === 'full') {
    return (
      <div className="space-y-4">
        <div>
          <p className="text-sm font-medium text-foreground">Theme</p>
          <p className="mt-0.5 text-xs text-foreground-muted">
            Choose the accent color used across the app.
          </p>
          <div className="mt-3">
            <ThemeSwatches />
          </div>
          <p className="mt-2 text-xs font-medium text-foreground-muted">
            {active.label}
          </p>
        </div>
        <div>
          <p className="text-sm font-medium text-foreground">Appearance</p>
          <p className="mt-0.5 text-xs text-foreground-muted">
            Light, dark, or follow your system.
          </p>
          <div className="mt-3 max-w-xs">
            <ModeSwitch />
          </div>
        </div>
      </div>
    );
  }

  // Compact: icon button + popover.
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function onPointerDown(event: MouseEvent) {
      if (ref.current && !ref.current.contains(event.target as Node)) {
        setOpen(false);
      }
    }
    function onKey(event: KeyboardEvent) {
      if (event.key === 'Escape') setOpen(false);
    }
    document.addEventListener('mousedown', onPointerDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onPointerDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        aria-label="Change theme"
        aria-haspopup="true"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
        className={cx(
          'inline-flex h-8 w-8 items-center justify-center rounded-md border border-border bg-surface text-foreground-muted transition-colors',
          'hover:bg-surface-muted hover:text-foreground',
          'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background',
        )}
      >
        <span
          aria-hidden="true"
          className="absolute -right-0.5 -top-0.5 h-2.5 w-2.5 rounded-full border-2 border-surface"
          style={{ backgroundColor: active.swatch }}
        />
        <Palette className="h-4 w-4" aria-hidden="true" />
      </button>

      {open && (
        <div
          role="dialog"
          aria-label="Appearance"
          className="absolute right-0 z-50 mt-2 w-60 animate-pop-in rounded-card border border-border bg-surface p-4 shadow-pop"
        >
          <p className="text-xs font-semibold uppercase tracking-wide text-foreground-muted">
            Theme
          </p>
          <div className="mt-2">
            <ThemeSwatches onPick={() => setOpen(false)} />
          </div>
          <div className="mt-4">
            <ModeSwitch />
          </div>
        </div>
      )}
    </div>
  );
}
