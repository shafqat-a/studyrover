import { NavLink, Navigate, Outlet, useLocation } from 'react-router-dom';
import {
  Home,
  LayoutDashboard,
  Library,
  Settings as SettingsIcon,
  User,
  type LucideIcon,
} from 'lucide-react';

import { Logo } from '../components/Logo';
import { ThemePicker } from '../components/ThemePicker';
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
  icon: LucideIcon;
  /** Match the route exactly (used for index/landing links). */
  end?: boolean;
}

const PARENT_NAV: NavItem[] = [
  { to: '/parent', label: 'Home', icon: Home, end: true },
  { to: '/parent/subjects', label: 'Subjects', icon: Library },
  { to: '/parent/dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { to: '/parent/profile', label: 'Student', icon: User },
  { to: '/parent/settings', label: 'Settings', icon: SettingsIcon },
];

function navLinkClass({ isActive }: { isActive: boolean }): string {
  const base =
    'inline-flex h-8 items-center gap-2 rounded-md px-2.5 text-sm font-medium transition-colors';
  return isActive
    ? `${base} bg-surface-muted text-foreground`
    : `${base} text-foreground-muted hover:bg-surface-muted/60 hover:text-foreground`;
}

/** Brand logo mark + wordmark. */
function BrandMark({ to }: { to: string }) {
  return (
    <NavLink to={to} end className="flex items-center gap-2.5">
      <Logo size={28} />
      <span className="font-display text-[15px] font-semibold tracking-tight text-foreground">
        StudyRover
      </span>
    </NavLink>
  );
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
        <div className="flex min-h-screen items-center justify-center bg-background text-sm text-foreground-muted">
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
      <header className="sticky top-0 z-40 border-b border-border bg-surface/80 backdrop-blur">
        <div className="mx-auto flex h-14 w-full max-w-6xl items-center gap-4 px-5">
          <BrandMark to="/parent" />
          <span className="hidden rounded-md border border-border bg-surface-muted px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-foreground-muted lg:inline">
            Parent
          </span>
          <nav
            className="ml-auto flex items-center gap-0.5"
            aria-label="Parent navigation"
          >
            {PARENT_NAV.map((item) => {
              const Icon = item.icon;
              return (
                <NavLink
                  key={item.to}
                  to={item.to}
                  end={item.end}
                  className={navLinkClass}
                >
                  <Icon className="h-4 w-4" aria-hidden="true" />
                  <span className="hidden lg:inline">{item.label}</span>
                </NavLink>
              );
            })}
            <div className="ml-2">
              <ThemePicker />
            </div>
          </nav>
        </div>
      </header>

      <main className="mx-auto w-full max-w-6xl flex-1 px-5 py-8">
        <Outlet />
      </main>
    </div>
  );
}
