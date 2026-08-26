import { useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { ArrowLeft, CheckCircle2, Printer, RotateCcw } from 'lucide-react';

import {
  Badge,
  Button,
  Card,
  RadioGroup,
  RichContent,
  toPlainText,
} from '../components';
import { useExamDefinition, useExamPreview } from '../hooks';

/** Option index -> "A", "B", "C", … for the printed worksheet. */
function optionLetter(index: number): string {
  return String.fromCharCode(65 + index);
}

/**
 * Parent exam preview (ad-hoc "sit the exam" from the parent view).
 *
 * The parent assembles and takes the exam exactly as a student would, but the
 * preview endpoint returns the answer key so grading happens entirely
 * client-side. Nothing is persisted — no student, no saved attempt, no cooldown
 * or reward — so a parent can sanity-check an exam (especially AI-generated
 * ones) before handing it to their student.
 *
 * "Print" renders a paper worksheet (questions with lettered options and a
 * separate answer-key page) via a print-only section; the interactive UI is
 * hidden with `print:hidden`.
 */
export default function ParentExamPreview() {
  const { subjectId, examId } = useParams<{
    subjectId: string;
    examId: string;
  }>();
  const defQuery = useExamDefinition(examId);
  const previewQuery = useExamPreview(examId);

  // questionId -> chosen optionId.
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [submitted, setSubmitted] = useState(false);

  const questions = previewQuery.data?.questions ?? [];
  const passBar = defQuery.data?.passBar ?? 70;
  const examName = defQuery.data?.name ?? 'Exam preview';

  const { correct, total, scorePct } = useMemo(() => {
    const t = questions.length;
    let c = 0;
    for (const q of questions) {
      if (answers[q.id] && answers[q.id] === q.correctOptionId) c += 1;
    }
    return { correct: c, total: t, scorePct: t ? Math.round((c / t) * 100) : 0 };
  }, [questions, answers]);
  const passed = scorePct >= passBar;
  const answeredCount = questions.filter((q) => answers[q.id]).length;

  function reset() {
    setAnswers({});
    setSubmitted(false);
    void previewQuery.refetch();
  }

  const backTo = `/parent/subjects/${subjectId}/exams`;

  return (
    <div className="mx-auto max-w-3xl">
      {/* Interactive on-screen view (hidden when printing). */}
      <div className="space-y-6 print:hidden">
        <div className="flex items-center justify-between gap-3">
          <Link
            to={backTo}
            className="inline-flex items-center gap-1.5 text-sm text-foreground-muted transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded-sm"
          >
            <ArrowLeft className="h-4 w-4" aria-hidden="true" />
            Back to exams
          </Link>
          <div className="flex items-center gap-2">
            <Button
              variant="secondary"
              size="sm"
              onClick={() => window.print()}
              disabled={questions.length === 0}
              leadingIcon={<Printer className="h-4 w-4" aria-hidden="true" />}
            >
              Print
            </Button>
            <Badge tone="info" size="sm">
              Parent preview
            </Badge>
          </div>
        </div>

        <header>
          <h1 className="font-display text-2xl font-semibold tracking-tight text-foreground">
            {examName}
          </h1>
          <p className="mt-1 text-sm text-foreground-muted">
            Sit this exam yourself to check the questions. Nothing is saved and
            your student isn’t affected.
          </p>
        </header>

        {previewQuery.isPending ? (
          <PreviewSkeleton />
        ) : previewQuery.isError ? (
          <div
            role="alert"
            className="rounded-card border border-danger bg-danger-soft p-4"
          >
            <p className="text-sm font-medium text-danger">
              {previewQuery.error.message}
            </p>
            <Button
              variant="secondary"
              size="sm"
              className="mt-3"
              onClick={() => void previewQuery.refetch()}
            >
              Try again
            </Button>
          </div>
        ) : questions.length === 0 ? (
          <Card padding="lg">
            <p className="text-sm text-foreground-muted">
              This exam has no questions to preview. For a bank-sampled exam,
              add questions to its topics first.
            </p>
          </Card>
        ) : (
          <>
            {submitted ? (
              <Card
                padding="lg"
                className={
                  passed
                    ? 'border-success bg-success-soft'
                    : 'border-danger bg-danger-soft'
                }
              >
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <p className="font-display text-2xl font-semibold text-foreground">
                      {scorePct}%
                    </p>
                    <p className="text-sm text-foreground-muted">
                      {correct} of {total} correct · pass mark {passBar}%
                    </p>
                  </div>
                  <Badge tone={passed ? 'success' : 'danger'} size="md" dot>
                    {passed ? 'Pass' : 'Below pass mark'}
                  </Badge>
                </div>
              </Card>
            ) : (
              <p className="text-sm text-foreground-muted" aria-live="polite">
                <span className="font-medium text-foreground">
                  {answeredCount}
                </span>{' '}
                of {total} answered
              </p>
            )}

            <ol className="space-y-4" aria-label="Preview questions">
              {questions.map((q, index) => {
                const chosen = answers[q.id];
                const isCorrect = submitted && chosen === q.correctOptionId;
                return (
                  <li key={q.id}>
                    <Card padding="lg" className="space-y-4">
                      <div className="flex items-start justify-between gap-3">
                        <div className="flex min-w-0 items-start gap-2.5">
                          <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-surface-muted text-xs font-semibold text-foreground-muted">
                            {index + 1}
                          </span>
                          <RichContent
                            html={q.text}
                            className="font-medium text-foreground"
                          />
                        </div>
                        {submitted && (
                          <Badge
                            tone={isCorrect ? 'success' : 'danger'}
                            size="sm"
                          >
                            {isCorrect
                              ? 'Correct'
                              : chosen
                                ? 'Incorrect'
                                : 'Skipped'}
                          </Badge>
                        )}
                      </div>

                      <RadioGroup
                        name={`q-${q.id}`}
                        aria-label={`Question ${index + 1} options`}
                        value={chosen ?? null}
                        onChange={(id) =>
                          setAnswers((a) => ({ ...a, [q.id]: id }))
                        }
                        disabled={submitted}
                        showResult={submitted}
                        correctId={q.correctOptionId}
                        options={q.options.map((o) => ({
                          id: o.id,
                          label: <RichContent inline html={o.text} />,
                          ariaLabel: toPlainText(o.text),
                        }))}
                      />
                    </Card>
                  </li>
                );
              })}
            </ol>

            <div className="flex justify-end gap-2">
              {submitted ? (
                <Button
                  variant="secondary"
                  onClick={reset}
                  leadingIcon={
                    <RotateCcw className="h-4 w-4" aria-hidden="true" />
                  }
                >
                  Retake
                </Button>
              ) : (
                <Button
                  onClick={() => setSubmitted(true)}
                  disabled={total === 0}
                  leadingIcon={
                    <CheckCircle2 className="h-4 w-4" aria-hidden="true" />
                  }
                >
                  Check answers
                </Button>
              )}
            </div>
          </>
        )}
      </div>

      {/* Paper worksheet — only rendered when printing. */}
      {questions.length > 0 && (
        <PrintableExam
          name={examName}
          passBar={passBar}
          questions={questions}
        />
      )}
    </div>
  );
}

interface PrintableExamProps {
  name: string;
  passBar: number;
  questions: Array<{
    id: string;
    text: string;
    correctOptionId: string;
    options: Array<{ id: string; text: string }>;
  }>;
}

/**
 * Print-only worksheet: header with name/date/score lines, numbered questions
 * with lettered options and blank bubbles, then the answer key on its own page
 * so the parent can detach it before handing the paper to their student.
 * Uses fixed black-on-white colours so it prints legibly whatever the theme.
 */
function PrintableExam({ name, passBar, questions }: PrintableExamProps) {
  const total = questions.length;
  return (
    <section
      className="hidden text-black print:block"
      data-testid="exam-print-view"
    >
      <header className="mb-6 border-b border-black pb-3">
        <h1 className="font-display text-2xl font-semibold text-black">
          {name}
        </h1>
        <p className="mt-1 text-sm text-black">
          {total} {total === 1 ? 'question' : 'questions'} · pass mark{' '}
          {passBar}% · choose one answer per question
        </p>
        <div className="mt-5 flex flex-wrap gap-x-10 gap-y-2 text-sm">
          <span>Name: ______________________________</span>
          <span>Date: ________________</span>
          <span>Score: ______ / {total}</span>
        </div>
      </header>

      <ol className="space-y-5">
        {questions.map((q, index) => (
          <li key={q.id} className="break-inside-avoid">
            <div className="flex items-start gap-2">
              <span className="w-7 shrink-0 text-right font-semibold tabular-nums">
                {index + 1}.
              </span>
              <RichContent html={q.text} className="min-w-0 flex-1 font-medium" />
            </div>
            <ol className="ml-9 mt-2 space-y-1.5">
              {q.options.map((o, j) => (
                <li key={o.id} className="flex items-start gap-2.5">
                  <span
                    aria-hidden="true"
                    className="mt-1 h-3.5 w-3.5 shrink-0 rounded-full border border-black"
                  />
                  <span className="w-5 shrink-0 font-medium">
                    {optionLetter(j)}.
                  </span>
                  <span className="min-w-0 flex-1">
                    <RichContent inline html={o.text} />
                  </span>
                </li>
              ))}
            </ol>
          </li>
        ))}
      </ol>

      <section className="break-before-page">
        <h2 className="font-display text-xl font-semibold text-black">
          Answer key — {name}
        </h2>
        <p className="mt-1 text-sm">
          For the parent. Remove this page before giving the exam to your
          student.
        </p>
        <ol className="mt-4 columns-3 gap-8 text-sm tabular-nums">
          {questions.map((q, index) => {
            const correctIdx = q.options.findIndex(
              (o) => o.id === q.correctOptionId,
            );
            return (
              <li key={q.id} className="flex gap-2 py-0.5">
                <span className="w-7 text-right">{index + 1}.</span>
                <span className="font-semibold">
                  {correctIdx >= 0 ? optionLetter(correctIdx) : '—'}
                </span>
              </li>
            );
          })}
        </ol>
      </section>
    </section>
  );
}

function PreviewSkeleton() {
  return (
    <div className="space-y-4" aria-busy="true" aria-label="Loading preview">
      {Array.from({ length: 3 }).map((_, i) => (
        <div key={i} className="h-40 animate-pulse rounded-card bg-surface-muted" />
      ))}
    </div>
  );
}
