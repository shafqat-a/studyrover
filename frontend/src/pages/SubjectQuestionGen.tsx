import { useMemo, useState } from 'react';
import { useParams } from 'react-router-dom';

import { Button } from '../components/Button';
import { Card } from '../components/Card';
import { EmptyState } from '../components/EmptyState';
import { JobStatus } from '../components/JobStatus';
import { NumberStepper } from '../components/NumberStepper';
import { QuestionDraftCard } from '../components/QuestionDraftCard';
import { Select } from '../components/Select';
import type { components } from '../api/schema';
import { useJob } from '../hooks/useJobs';
import {
  useApproveDraft,
  useGenerateQuestions,
  useQuestionDrafts,
  useRejectDraft,
} from '../hooks/useQuestionGen';
import { useTopics } from '../hooks/useTopics';

/**
 * P05 — AI question generation + review (screen 2.8, P2 part)
 *
 * Rendered as the `generate` sub-view of the Subject detail page (P05); the
 * owning subject id comes from the `:subjectId` route param. Drives the full
 * generate → review → approve/reject flow defined by 2-A09/2-A10:
 *
 *   1. The parent picks a count (and optionally scopes to one topic) and presses
 *      "Generate questions". This enqueues an async job (H05 useGenerateQuestions)
 *      and we remember the returned job id.
 *   2. We poll the job (H03 useJob) to terminal state, surfacing live progress
 *      via the U05 JobStatus indicator. On `ready` the draft list (which the
 *      generate mutation already invalidated) refetches.
 *   3. Each generated draft is reviewed in a U07 QuestionDraftCard, where it can
 *      be edited inline then approved (minting a real Question into the live P09
 *      bank) or rejected (so it never enters the bank).
 *
 * All data flows through the H03/H05 hooks; nothing here hand-rolls a fetch.
 * Generated questions are deliberately *drafts* requiring parent approval before
 * entering the live bank (keeps the anti-gaming bank trustworthy per the spec).
 *
 * States: generation form, in-flight job (progress), draft review grid, empty
 * (nothing generated yet), loading skeleton, and a list-error retry.
 */

type Topic = components['schemas']['Topic'];
type QuestionDraft = components['schemas']['QuestionDraft'];

const ALL_TOPICS = '__all__';

const MIN_COUNT = 1;
const MAX_COUNT = 25;
const DEFAULT_COUNT = 5;

export default function SubjectQuestionGen() {
  const { subjectId } = useParams<{ subjectId: string }>();

  // Generation form state.
  const [topic, setTopic] = useState<string>(ALL_TOPICS);
  const [count, setCount] = useState<number>(DEFAULT_COUNT);

  // The id of the most recently enqueued generation job (drives the poll).
  const [jobId, setJobId] = useState<string | undefined>(undefined);

  const topicsQuery = useTopics(subjectId);
  const draftsQuery = useQuestionDrafts(subjectId);
  const job = useJob(jobId);

  const generate = useGenerateQuestions(subjectId as string);
  const approve = useApproveDraft();
  const reject = useRejectDraft();

  const topics: Topic[] = topicsQuery.data?.items ?? [];
  const topicById = useMemo(() => {
    const map = new Map<string, Topic>();
    for (const t of topics) map.set(t.id, t);
    return map;
  }, [topics]);

  const topicOptions = [
    { value: ALL_TOPICS, label: 'All topics' },
    ...topics.map((t) => ({ value: t.id, label: t.name })),
  ];

  const jobRunning =
    job.data != null && (job.data.status === 'queued' || job.data.status === 'processing');
  const generating = generate.isPending || jobRunning;

  async function handleGenerate() {
    if (!subjectId) return;
    const enqueued = await generate.mutateAsync({
      topicId: topic === ALL_TOPICS ? undefined : topic,
      count,
    });
    setJobId(enqueued.id);
  }

  const drafts: QuestionDraft[] = draftsQuery.data?.items ?? [];
  // Show pending drafts at the top of the review queue; settled ones below.
  const pendingDrafts = drafts.filter((d) => d.status === 'pending');
  const settledDrafts = drafts.filter((d) => d.status !== 'pending');

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h2 className="font-display text-display-sm text-foreground">
            Generate questions
          </h2>
          <p className="mt-1 max-w-prose text-sm text-foreground-muted">
            Use the knowledge base to draft multiple-choice questions. Review and
            approve each draft before it joins the live question bank.
          </p>
        </div>
      </header>

      {/* Generation controls */}
      <Card padding="md" className="flex flex-col gap-4">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Select
            label="Scope"
            value={topic}
            options={topicOptions}
            disabled={generating || topicsQuery.isPending}
            hint={
              topics.length === 0 && !topicsQuery.isPending
                ? 'No topics yet — questions will span the whole subject.'
                : 'Limit generation to a single topic, or span the subject.'
            }
            onChange={(e) => setTopic(e.target.value)}
          />

          <div className="flex flex-col gap-1.5">
            <span className="text-sm font-semibold text-foreground">
              How many
            </span>
            <NumberStepper
              label="Number of questions to generate"
              value={count}
              min={MIN_COUNT}
              max={MAX_COUNT}
              onChange={setCount}
              disabled={generating}
            />
            <span className="text-sm text-foreground-muted">
              Between {MIN_COUNT} and {MAX_COUNT} drafts per run.
            </span>
          </div>
        </div>

        <div className="flex justify-end">
          <Button
            onClick={() => void handleGenerate()}
            loading={generating}
            disabled={!subjectId}
          >
            {generating ? 'Generating…' : 'Generate questions'}
          </Button>
        </div>

        {/* Live job progress for the current run. */}
        {jobId && job.data && (
          <JobStatus
            status={job.data.status}
            progress={job.data.progress}
            error={job.data.error}
            label="Generating question drafts"
          />
        )}
        {jobId && job.isError && (
          <p role="alert" className="text-sm text-danger">
            Couldn&rsquo;t track the generation job: {job.error.message}
          </p>
        )}
      </Card>

      {/* Review queue */}
      <section className="space-y-4" aria-label="Question drafts for review">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h3 className="font-display text-lg font-bold text-foreground">
            Review drafts
          </h3>
          {pendingDrafts.length > 0 && (
            <span className="text-sm text-foreground-muted">
              {pendingDrafts.length} awaiting review
            </span>
          )}
        </div>

        {draftsQuery.isPending ? (
          <DraftsSkeleton />
        ) : draftsQuery.isError ? (
          <ErrorState
            message={draftsQuery.error.message}
            onRetry={() => void draftsQuery.refetch()}
            retrying={draftsQuery.isFetching}
          />
        ) : drafts.length === 0 ? (
          <EmptyState
            icon={<span aria-hidden="true">✨</span>}
            title="No drafts yet"
            description="Generate a batch above to start reviewing AI-drafted questions. Approved drafts appear in the question bank."
          />
        ) : (
          <div className="space-y-6">
            {pendingDrafts.length > 0 && (
              <ul className="space-y-4" aria-label="Pending drafts">
                {pendingDrafts.map((draft) => (
                  <li key={draft.id}>
                    <DraftReview
                      draft={draft}
                      subjectId={subjectId as string}
                      topicName={
                        draft.topicId
                          ? topicById.get(draft.topicId)?.name
                          : undefined
                      }
                      approving={
                        approve.isPending && approve.variables?.id === draft.id
                      }
                      rejecting={
                        reject.isPending && reject.variables?.id === draft.id
                      }
                      onApprove={(edited) =>
                        void approve.mutateAsync({
                          id: edited.id,
                          subjectId: subjectId as string,
                        })
                      }
                      onReject={(id) =>
                        void reject.mutateAsync({
                          id,
                          subjectId: subjectId as string,
                        })
                      }
                    />
                  </li>
                ))}
              </ul>
            )}

            {settledDrafts.length > 0 && (
              <div className="space-y-3">
                <h4 className="text-sm font-semibold text-foreground-muted">
                  Recently reviewed
                </h4>
                <ul className="space-y-4" aria-label="Reviewed drafts">
                  {settledDrafts.map((draft) => (
                    <li key={draft.id}>
                      <QuestionDraftCard draft={draft} disabled />
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        )}
      </section>
    </div>
  );
}

interface DraftReviewProps {
  draft: QuestionDraft;
  subjectId: string;
  topicName?: string;
  approving: boolean;
  rejecting: boolean;
  onApprove: (draft: QuestionDraft) => void;
  onReject: (id: string) => void;
}

/**
 * Wraps the shared U07 card with the draft's topic tag (the card itself is
 * topic-agnostic) and threads through approve/reject handlers + busy state.
 */
function DraftReview({
  draft,
  topicName,
  approving,
  rejecting,
  onApprove,
  onReject,
}: DraftReviewProps) {
  return (
    <div className="space-y-1.5">
      <div className="flex items-center gap-2 px-1 text-xs text-foreground-muted">
        <span className="font-medium uppercase tracking-wide">Topic</span>
        <span className="rounded-pill bg-surface-muted px-2 py-0.5">
          {topicName ?? 'Whole subject'}
        </span>
      </div>
      <QuestionDraftCard
        draft={draft}
        approving={approving}
        rejecting={rejecting}
        onApprove={onApprove}
        onReject={onReject}
      />
    </div>
  );
}

function DraftsSkeleton() {
  return (
    <div
      className="space-y-4"
      aria-busy="true"
      aria-label="Loading question drafts"
    >
      {Array.from({ length: 3 }).map((_, i) => (
        <div
          key={i}
          className="h-48 animate-pulse rounded-card border border-border bg-surface-muted"
        />
      ))}
    </div>
  );
}

interface ErrorStateProps {
  message: string;
  onRetry: () => void;
  retrying: boolean;
}

function ErrorState({ message, onRetry, retrying }: ErrorStateProps) {
  return (
    <div
      role="alert"
      className="rounded-card border border-danger bg-danger-soft p-8 text-center"
    >
      <h3 className="font-display text-display-sm text-danger">
        Couldn&rsquo;t load drafts
      </h3>
      <p className="mt-1 text-sm text-foreground-muted">{message}</p>
      <div className="mt-5">
        <Button variant="secondary" onClick={onRetry} loading={retrying}>
          Try again
        </Button>
      </div>
    </div>
  );
}
