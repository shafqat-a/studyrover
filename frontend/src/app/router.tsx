import type { ComponentType } from 'react';
import {
  createBrowserRouter,
  Navigate,
  Outlet,
  type LazyRouteFunction,
  type RouteObject,
} from 'react-router-dom';
import ParentLayout from './ParentLayout';
import StudentLayout from './StudentLayout';

/**
 * lazyPage adapts a default-exporting page module to React Router's `lazy`
 * contract (which expects a `Component` export). Pages are code-split so each
 * screen loads on demand.
 */
function lazyPage(
  load: () => Promise<{ default: ComponentType }>,
): LazyRouteFunction<RouteObject> {
  return async () => {
    const mod = await load();
    return { Component: mod.default };
  };
}

/**
 * Application route table (W03).
 *
 * Defines the parent + student areas and the nested subject sub-tabs. Every
 * Phase-1 page is wired via a lazy default import. Phase-2 screens (tutor,
 * dashboard, ingestion, question-gen) are intentionally NOT registered here.
 *
 * Route map (screen → P-task):
 *   /parent/setup .................... Parent setup           (P01)
 *   /student/signin .................. Student sign-in        (P02)
 *   /parent/profile .................. Student profile        (P03)
 *   /parent/subjects ................. Subjects list          (P04)
 *   /parent/subjects/:id ............. Subject detail + tabs  (P05)
 *     ./sources ...................... Sources tab            (P06)
 *     ./syllabus ..................... Syllabus builder       (P07)
 *     ./exams ........................ Exam definitions       (P08)
 *     ./questions .................... Question bank          (P09)
 *   /parent/settings ................. Settings               (P10)
 *   /student ......................... Student home           (P11)
 *   /student/exam/start .............. Start exam             (P12)
 *   /student/exam/:id ................ Exam in progress       (P13)
 *   /student/exam/:id/result ......... Exam result            (P14)
 */

function NotFound() {
  return (
    <div className="mx-auto max-w-md p-8 text-center">
      <p className="font-display text-display text-primary">404</p>
      <p className="mt-2 text-foreground-muted">
        We couldn&rsquo;t find that page.
      </p>
    </div>
  );
}

export const routes: RouteObject[] = [
  // Landing → parent home by default.
  { index: true, element: <Navigate to="/parent" replace /> },

  // Parent (guardian) area.
  {
    path: 'parent',
    element: <ParentLayout />,
    children: [
      {
        index: true,
        lazy: lazyPage(() => import('../pages/Subjects')),
      },
      {
        path: 'setup',
        lazy: lazyPage(() => import('../pages/ParentSetup')),
      },
      {
        path: 'profile',
        lazy: lazyPage(() => import('../pages/StudentProfile')),
      },
      {
        path: 'subjects',
        lazy: lazyPage(() => import('../pages/Subjects')),
      },
      {
        path: 'subjects/:id',
        // SubjectDetail (P05) hosts the subject sub-tabs via its own <Outlet/>.
        lazy: lazyPage(() => import('../pages/SubjectDetail')),
        children: [
          {
            index: true,
            element: <Navigate to="sources" replace />,
          },
          {
            path: 'sources',
            lazy: lazyPage(() => import('../pages/SubjectSources')),
          },
          {
            path: 'syllabus',
            lazy: lazyPage(() => import('../pages/SubjectSyllabus')),
          },
          {
            path: 'exams',
            lazy: lazyPage(() => import('../pages/SubjectExams')),
          },
          {
            path: 'questions',
            lazy: lazyPage(() => import('../pages/SubjectQuestions')),
          },
        ],
      },
      {
        path: 'settings',
        lazy: lazyPage(() => import('../pages/Settings')),
      },
    ],
  },

  // Student area.
  {
    path: 'student',
    element: <StudentLayout />,
    children: [
      {
        index: true,
        lazy: lazyPage(() => import('../pages/StudentHome')),
      },
      {
        path: 'signin',
        lazy: lazyPage(() => import('../pages/StudentSignIn')),
      },
      {
        path: 'exam/start',
        lazy: lazyPage(() => import('../pages/ExamStart')),
      },
      {
        path: 'exam/:id',
        lazy: lazyPage(() => import('../pages/ExamRun')),
      },
      {
        path: 'exam/:id/result',
        lazy: lazyPage(() => import('../pages/ExamResult')),
      },
    ],
  },

  { path: '*', element: <NotFound /> },
];

/**
 * Root layout: the providers are mounted in App.tsx above the RouterProvider,
 * so this just renders the matched route subtree.
 */
export function RootLayout() {
  return <Outlet />;
}

export const router = createBrowserRouter(routes, { basename: '/studyrover' });
