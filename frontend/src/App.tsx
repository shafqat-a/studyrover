import { RouterProvider } from 'react-router-dom';
import { AppProviders } from './app/providers';
import { ThemeProvider } from './app/theme';
import { router } from './app/router';

/**
 * Root application component (F11).
 *
 * Composes the global providers (theme + React Query + toasts) around the
 * router. `main.tsx` (owned by F05) renders <App /> into the DOM root.
 */
export default function App() {
  return (
    <ThemeProvider>
      <AppProviders>
        <RouterProvider router={router} />
      </AppProviders>
    </ThemeProvider>
  );
}
