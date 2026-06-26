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
 * Phase-1 page is wired via a lazy default import, and the Phase-2 screens
 * (tutor, dashboard, ingestion, syllabus-suggest, tutor-instructions,
 * question-gen) are wired alongside them without disturbing Phase-1.
 *
 * Route map (screen → P-task):
 *   /parent/setup ............................ Parent setup           (P01)
 *   /student/signin .......................... Student sign-in        (P02)
 *   /parent/profile .......................... Student profile        (P03)
 *   /parent/subjects ......................... Subjects list          (P04)
 *   /parent/subjects/:id ..................... Subject detail + tabs  (P05)
 *     ./sources .............................. Sources tab            (P06)
 *     ./syllabus ............................. Syllabus builder       (P07)
 *     ./syllabus/suggest ..................... Syllabus suggest (P2, :id)
 *     ./exams ................................ Exam definitions       (P08)
 *     ./questions ............................ Question bank          (P09)
 *     ./tutor-instructions ................... Tutor instructions (P2, :id)
 *   /parent/subjects/:subjectId/ingest ....... Sources ingest    (P2, :subjectId)
 *   /parent/subjects/:subjectId/question-gen . Question gen      (P2, :subjectId)
 *   /parent/dashboard ........................ Parent dashboard       (Phase-2)
 *   /parent/settings ......................... Settings               (P10)
 *   /student ................................. Student home           (P11)
 *   /student/study ........................... Study tutor            (Phase-2)
 *   /student/exam/start ...................... Start exam             (P12)
 *   /student/exam/:id ........................ Exam in progress       (P13)
 *   /student/exam/:id/result ................. Exam result            (P14)
 *
 * Note on params: the Phase-2 subject sub-tabs split by param name. The pages
 * that read `:id` (SubjectSyllabusSuggest, SubjectTutorInstructions) nest under
 * the existing `subjects/:id` route. The pages that read `:subjectId`
 * (SubjectSourcesIngest, SubjectQuestionGen) are registered as sibling routes
 * with the `:subjectId` param so their `useParams` lookups resolve correctly.
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
        path: 'login',
        lazy: lazyPage(() => import('../pages/ParentLogin')),
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
        path: 'subjects/:subjectId',
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
            // Phase-2: AI syllabus suggestion (reads the `:id` param).
            path: 'syllabus/suggest',
            lazy: lazyPage(() => import('../pages/SubjectSyllabusSuggest')),
          },
          {
            path: 'exams',
            lazy: lazyPage(() => import('../pages/SubjectExams')),
          },
          {
            path: 'questions',
            lazy: lazyPage(() => import('../pages/SubjectQuestions')),
          },
          {
            // Phase-2: tutor instructions editor (reads the `:id` param).
            path: 'tutor-instructions',
            lazy: lazyPage(() => import('../pages/SubjectTutorInstructions')),
          },
        ],
      },
      {
        // Phase-2: sources ingestion (reads the `:subjectId` param).
        path: 'subjects/:subjectId/ingest',
        lazy: lazyPage(() => import('../pages/SubjectSourcesIngest')),
      },
      {
        // Phase-2: AI question generation (reads the `:subjectId` param).
        path: 'subjects/:subjectId/question-gen',
        lazy: lazyPage(() => import('../pages/SubjectQuestionGen')),
      },
      {
        // Phase-2: parent dashboard.
        path: 'dashboard',
        lazy: lazyPage(() => import('../pages/ParentDashboard')),
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
        // Phase-2: AI study tutor chat.
        path: 'study',
        lazy: lazyPage(() => import('../pages/StudyTutor')),
      },
      {
        // ExamStart reads :examId; opened from StudentHome "Take exam".
        path: 'exams/:examId/start',
        lazy: lazyPage(() => import('../pages/ExamStart')),
      },
      {
        // ExamRun reads :attemptId; opened after ExamStart creates an attempt.
        path: 'attempts/:attemptId',
        lazy: lazyPage(() => import('../pages/ExamRun')),
      },
      {
        // ExamResult reads :attemptId.
        path: 'attempts/:attemptId/result',
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
