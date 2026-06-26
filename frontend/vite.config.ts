import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Backend dev server (Go) that the SPA proxies API calls to.
const BACKEND_TARGET = process.env.VITE_BACKEND_URL ?? 'http://localhost:8080';

// https://vitejs.dev/config/
export default defineConfig({
  base: '/studyrover/',
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      // In dev, forward API requests to the Go backend.
      // In prod the Go binary serves both the API and the embedded SPA.
      '/api': {
        target: BACKEND_TARGET,
        changeOrigin: true,
      },
    },
  },
  build: {
    // Hashed static assets consumed by the backend via go:embed (W02).
    outDir: 'dist',
    emptyOutDir: true,
    sourcemap: true,
  },
});
