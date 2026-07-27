import { useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { ArrowLeft, CheckCircle2, RotateCcw } from 'lucide-react';

import {
  Badge,
  Button,
  Card,
  RadioGroup,
  RichContent,
  toPlainText,
} from '../components';
import { useExamDefinition, useExamPreview } from '../hooks';

/**
 * Parent exam preview (ad-hoc "sit the exam" from the parent view).
 *
 * The parent assembles and takes the exam exactly as a student would, but the
 * preview endpoint returns the answer key so grading happens entirely
 * client-side. Nothing is persisted — no student, no saved attempt, no cooldown
 * or reward — so a parent can sanity-check an exam (especially AI-generated
 * ones) before handing it to their student.
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
    <div className="mx-auto max-w-3xl space-y-6">
      <div className="flex items-center justify-between gap-3">
        <Link
          to={backTo}
          className="inline-flex items-center gap-1.5 text-sm text-foreground-muted transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded-sm"
        >
          <ArrowLeft className="h-4 w-4" aria-hidden="true" />
          Back to exams
        </Link>
        <Badge tone="info" size="sm">
          Parent preview
        </Badge>
      </div>

      <header>
        <h1 className="font-display text-2xl font-semibold tracking-tight text-foreground">
          {defQuery.data?.name ?? 'Exam preview'}
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
            This exam has no questions to preview. For a bank-sampled exam, add
            questions to its topics first.
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
                leadingIcon={<RotateCcw className="h-4 w-4" aria-hidden="true" />}
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
