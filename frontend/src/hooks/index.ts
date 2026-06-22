// StudyRover — hook barrel (W03).
//
// Single re-export surface for the TanStack Query data hooks (H-tasks). Pages
// import from "@/hooks" so the data-access API is one import away and stable as
// hooks land. Each hook owns its own file; this barrel only re-exports.

export * from './useAuth';
export * from './useDashboard';
export * from './useExamAttempt';
export * from './useExamDefinitions';
export * from './useExamHistory';
export * from './useGuidance';
export * from './useJobs';
export * from './useQuestionGen';
export * from './useQuestions';
export * from './useSettings';
export * from './useSources';
export * from './useStudentProfile';
export * from './useStudyGuide';
export * from './useSubjects';
export * from './useSyllabusSuggest';
export * from './useTopics';
export * from './useTutorChat';
export * from './useTutorInstructions';
