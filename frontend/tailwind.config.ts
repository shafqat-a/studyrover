import type { Config } from 'tailwindcss';

/**
 * StudyRover design tokens.
 *
 * Tokens are exposed both as Tailwind theme values and (via globals.css) as
 * CSS custom properties, so components can reference `bg-primary`, `rounded-card`,
 * `text-display`, etc. and stay visually consistent and kid-friendly.
 *
 * Colors are tuned for WCAG AA contrast on the chosen surfaces. Brand hues use
 * an HSL-channel CSS variable so opacity modifiers (e.g. `bg-primary/80`) work.
 */
const withChannels = (cssVar: string) => `hsl(var(${cssVar}) / <alpha-value>)`;

const config: Config = {
  content: ['./index.html', './src/**/*.{ts,tsx,js,jsx,html}'],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        // Neutral surfaces.
        background: withChannels('--sr-background'),
        surface: withChannels('--sr-surface'),
        'surface-muted': withChannels('--sr-surface-muted'),
        border: withChannels('--sr-border'),
        ring: withChannels('--sr-ring'),

        // Foreground / text.
        foreground: withChannels('--sr-foreground'),
        'foreground-muted': withChannels('--sr-foreground-muted'),

        // Brand: friendly indigo/violet primary.
        primary: {
          DEFAULT: withChannels('--sr-primary'),
          foreground: withChannels('--sr-primary-foreground'),
          soft: withChannels('--sr-primary-soft'),
        },
        // Playful secondary (teal).
        secondary: {
          DEFAULT: withChannels('--sr-secondary'),
          foreground: withChannels('--sr-secondary-foreground'),
          soft: withChannels('--sr-secondary-soft'),
        },
        // Warm accent (amber) for rewards / highlights.
        accent: {
          DEFAULT: withChannels('--sr-accent'),
          foreground: withChannels('--sr-accent-foreground'),
          soft: withChannels('--sr-accent-soft'),
        },

        // Semantic states.
        success: {
          DEFAULT: withChannels('--sr-success'),
          foreground: withChannels('--sr-success-foreground'),
          soft: withChannels('--sr-success-soft'),
        },
        warning: {
          DEFAULT: withChannels('--sr-warning'),
          foreground: withChannels('--sr-warning-foreground'),
          soft: withChannels('--sr-warning-soft'),
        },
        danger: {
          DEFAULT: withChannels('--sr-danger'),
          foreground: withChannels('--sr-danger-foreground'),
          soft: withChannels('--sr-danger-soft'),
        },
      },

      borderRadius: {
        // Rounder, friendlier corners for a kid-facing UI.
        none: '0px',
        sm: '0.375rem', // 6px
        DEFAULT: '0.625rem', // 10px
        md: '0.75rem', // 12px
        lg: '1rem', // 16px
        xl: '1.25rem', // 20px
        '2xl': '1.5rem', // 24px
        card: '1.25rem', // 20px — default for Card/Dialog
        pill: '9999px',
        full: '9999px',
      },

      spacing: {
        // 4px base scale plus a few generous extras for touch targets.
        px: '1px',
        0: '0px',
        0.5: '0.125rem',
        1: '0.25rem',
        1.5: '0.375rem',
        2: '0.5rem',
        2.5: '0.625rem',
        3: '0.75rem',
        3.5: '0.875rem',
        4: '1rem',
        5: '1.25rem',
        6: '1.5rem',
        7: '1.75rem',
        8: '2rem',
        10: '2.5rem',
        12: '3rem',
        14: '3.5rem',
        16: '4rem',
        18: '4.5rem',
        20: '5rem',
        24: '6rem',
        28: '7rem',
        32: '8rem',
        // Comfortable minimum touch target for young users.
        touch: '2.75rem', // 44px
      },

      fontFamily: {
        sans: [
          'Nunito',
          'ui-rounded',
          'system-ui',
          '-apple-system',
          'Segoe UI',
          'Roboto',
          'Helvetica Neue',
          'Arial',
          'sans-serif',
        ],
        display: [
          'Baloo 2',
          'Nunito',
          'ui-rounded',
          'system-ui',
          'sans-serif',
        ],
        mono: ['ui-monospace', 'SFMono-Regular', 'Menlo', 'monospace'],
      },

      fontSize: {
        // [size, lineHeight] pairs. Tuned slightly larger for readability.
        xs: ['0.75rem', { lineHeight: '1rem' }],
        sm: ['0.875rem', { lineHeight: '1.25rem' }],
        base: ['1rem', { lineHeight: '1.5rem' }],
        lg: ['1.125rem', { lineHeight: '1.75rem' }],
        xl: ['1.25rem', { lineHeight: '1.75rem' }],
        '2xl': ['1.5rem', { lineHeight: '2rem' }],
        '3xl': ['1.875rem', { lineHeight: '2.25rem' }],
        '4xl': ['2.25rem', { lineHeight: '2.5rem' }],
        display: ['2.5rem', { lineHeight: '1.1', fontWeight: '800' }],
        'display-sm': ['1.75rem', { lineHeight: '1.2', fontWeight: '700' }],
      },

      boxShadow: {
        // Soft, low-contrast elevation for a gentle look.
        card: '0 1px 2px 0 hsl(var(--sr-shadow) / 0.06), 0 4px 16px -2px hsl(var(--sr-shadow) / 0.10)',
        pop: '0 8px 32px -4px hsl(var(--sr-shadow) / 0.18)',
        focus: '0 0 0 3px hsl(var(--sr-ring) / 0.45)',
      },

      ringColor: {
        DEFAULT: withChannels('--sr-ring'),
      },

      keyframes: {
        'fade-in': {
          from: { opacity: '0' },
          to: { opacity: '1' },
        },
        'pop-in': {
          '0%': { opacity: '0', transform: 'scale(0.96)' },
          '100%': { opacity: '1', transform: 'scale(1)' },
        },
      },
      animation: {
        'fade-in': 'fade-in 150ms ease-out',
        'pop-in': 'pop-in 180ms cubic-bezier(0.16, 1, 0.3, 1)',
      },
    },
  },
  plugins: [],
};

export default config;
