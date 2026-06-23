import { NavLink, Navigate, Outlet, useLocation } from 'react-router-dom';

import { useSession } from '../hooks/useAuth';

/**
 * Parent (guardian) area shell (F11).
 *
 * Provides the parent-side nav chrome. Routed page bodies (P-tasks) render
 * into the <Outlet />. Subject sub-tabs are nested routes rendered by the
 * SubjectDetail page's own <Outlet />, not here.
 */

interface NavItem {
  to: string;
  label: string;
  /** Match the route exactly (used for index/landing links). */
  end?: boolean;
}

const PARENT_NAV: NavItem[] = [
  { to: '/parent', label: 'Home', end: true },
  { to: '/parent/subjects', label: 'Subjects' },
  { to: '/parent/student', label: 'Student' },
  { to: '/parent/settings', label: 'Settings' },
];

function navLinkClass({ isActive }: { isActive: boolean }): string {
  const base =
    'rounded-pill px-3.5 py-2 text-sm font-semibold transition-colors';
  return isActive
    ? `${base} bg-primary text-primary-foreground`
    : `${base} text-foreground-muted hover:bg-surface-muted hover:text-foreground`;
}

export default function ParentLayout() {
  const { data: session, isLoading } = useSession();
  const location = useLocation();
  // The register/login pages live under /parent but must stay reachable while
  // logged out, so they are exempt from the gate.
  const onAuthPage =
    location.pathname === '/parent/login' ||
    location.pathname === '/parent/setup';

  if (!onAuthPage) {
    if (isLoading) {
      return (
        <div className="flex min-h-screen items-center justify-center bg-background text-foreground-muted">
          Loading…
        </div>
      );
    }
    if (session?.role !== 'parent') {
      return <Navigate to="/parent/login" replace />;
    }
  }

  return (
    <div className="flex min-h-screen flex-col bg-background">
      <header className="sticky top-0 z-40 border-b border-border bg-surface/90 backdrop-blur">
        <div className="mx-auto flex w-full max-w-6xl items-center gap-4 px-4 py-3">
          <NavLink
            to="/parent"
            end
            className="font-display text-xl font-extrabold text-primary"
          >
            StudyRover
          </NavLink>
          <span className="hidden rounded-pill bg-primary-soft px-2.5 py-1 text-xs font-bold uppercase tracking-wide text-primary sm:inline">
            Parent
          </span>
          <nav
            className="ml-auto flex items-center gap-1"
            aria-label="Parent navigation"
          >
            {PARENT_NAV.map((item) => (
              <NavLink
                key={item.to}
                to={item.to}
                end={item.end}
                className={navLinkClass}
              >
                {item.label}
              </NavLink>
            ))}
          </nav>
        </div>
      </header>

      <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-6">
        <Outlet />
      </main>
    </div>
  );
}
