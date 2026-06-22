import { NavLink, Outlet } from 'react-router-dom';

/**
 * Student area shell (F11).
 *
 * Provides the student-side nav chrome. Routed page bodies (P-tasks) render
 * into the <Outlet />. The chrome is intentionally lighter / friendlier than
 * the parent area; the live exam flow renders inside the same outlet.
 */

interface NavItem {
  to: string;
  label: string;
  end?: boolean;
}

const STUDENT_NAV: NavItem[] = [
  { to: '/student', label: 'Home', end: true },
];

function navLinkClass({ isActive }: { isActive: boolean }): string {
  const base =
    'rounded-pill px-3.5 py-2 text-sm font-semibold transition-colors';
  return isActive
    ? `${base} bg-secondary text-secondary-foreground`
    : `${base} text-foreground-muted hover:bg-surface-muted hover:text-foreground`;
}

export default function StudentLayout() {
  return (
    <div className="flex min-h-screen flex-col bg-background">
      <header className="sticky top-0 z-40 border-b border-border bg-surface/90 backdrop-blur">
        <div className="mx-auto flex w-full max-w-4xl items-center gap-4 px-4 py-3">
          <NavLink
            to="/student"
            end
            className="font-display text-xl font-extrabold text-secondary"
          >
            StudyRover
          </NavLink>
          <span className="hidden rounded-pill bg-secondary-soft px-2.5 py-1 text-xs font-bold uppercase tracking-wide text-secondary sm:inline">
            Student
          </span>
          <nav
            className="ml-auto flex items-center gap-1"
            aria-label="Student navigation"
          >
            {STUDENT_NAV.map((item) => (
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

      <main className="mx-auto w-full max-w-4xl flex-1 px-4 py-6">
        <Outlet />
      </main>
    </div>
  );
}
