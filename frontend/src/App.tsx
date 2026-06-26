import { RouterProvider } from 'react-router-dom';
import { AppProviders } from './app/providers';
import { router } from './app/router';

/**
 * Root application component (F11).
 *
 * Composes the global providers (React Query + toasts) around the router.
 * `main.tsx` (owned by F05) renders <App /> into the DOM root.
 */
export default function App() {
  return (
    <AppProviders>
      <RouterProvider router={router} />
    </AppProviders>
  );
}
