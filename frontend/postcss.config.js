// PostCSS pipeline for the StudyRover SPA (build-time only — no Node in prod).
// Tailwind generates utilities from tailwind.config.ts; autoprefixer adds
// vendor prefixes for the supported browser targets.
export default {
  plugins: {
    tailwindcss: {},
    autoprefixer: {},
  },
};
