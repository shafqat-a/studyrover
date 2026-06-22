import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';

import { Button, Card, EmptyState, PageHeader } from '../components';
import { JobStatus } from '../components/JobStatus';
import { TopicTreeEditor } from '../components/TopicTreeEditor';
import type { components } from '../api/schema';
import { useToast } from '../app/providers';
import { useSubject } from '../hooks';
import {
  syllabusJobResult,
  useApplySyllabus,
  useSuggestSyllabus,
  useSyllabusJob,
} from '../hooks/useSyllabusSuggest';

/**
 * P03 — Syllabus auto-suggest (screen 2.5, Phase-2 part)
 *
 * Drives the AI syllabus-derivation flow for a single subject:
 *
 *   1. "Auto-suggest topics" kicks off an async job (2-A07 → useSuggestSyllabus).
 *   2. The job is polled to completion (2-A06 → useSyllabusJob), its state shown
 *      via the JobStatus indicator (U05).
 *   3. Once ready, the derived TopicSuggestion[] (2-C04) seeds the TopicTreeEditor
 *      (U06) so a parent/teacher can rename, reorder, set page ranges, and
 *      include/exclude branches before committing.
 *   4. "Apply" materializes the (possibly edited) tree into real Topics
 *      (2-A08 → useApplySyllabus), then returns to the manual syllabus builder.
 *
 * Every API interaction flows through the H04 hooks; nothing here hand-rolls a
 * fetch. Presentation reuses the shared U-task primitives and the StudyRover
 * design tokens.
 */

type TopicSuggestion = components['schemas']['TopicSuggestion'];

export default function SubjectSyllabusSuggest() {
  const { id: subjectId } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { toast } = useToast();

  const subjectQuery = useSubject(subjectId);
  const suggest = useSuggestSyllabus(subjectId ?? '');
  const apply = useApplySyllabus(subjectId ?? '');

  // The id of the in-flight (or completed) derivation job, once started.
  const [jobId, setJobId] = useState<string | undefined>(undefined);
  const jobQuery = useSyllabusJob(jobId);

  // The current (possibly parent-edited) tree the editor emits. Seeded from the
  // job result once it is ready; `null` until then.
  const [edited, setEdited] = useState<TopicSuggestion[] | null>(null);

  const job = jobQuery.data;
  const suggestions = useMemo(() => syllabusJobResult(job), [job]);
  const isReady = job?.status === 'ready';
  const isFailed = job?.status === 'error';

  // When a job becomes ready, seed the editable working copy with its result.
  useEffect(() => {
    if (isReady) {
      setEdited(suggestions);
    }
  }, [isReady, suggestions]);

  const subjectName = subjectQuery.data?.name;
  const backTo = subjectId
    ? `/parent/subjects/${subjectId}/syllabus`
    : '/parent/subjects';

  const breadcrumbs = [
    { label: 'Subjects', to: '/parent/subjects' },
    {
      label: subjectName ?? 'Subject',
      to: subjectId ? `/parent/subjects/${subjectId}` : undefined,
    },
    { label: 'Syllabus', to: backTo },
    { label: 'Auto-suggest' },
  ];

  // Working tree: editor output once present, else the raw job suggestions.
  const workingTree = edited ?? suggestions;
  const includedCount = countTopics(workingTree);
  const canApply = isReady && includedCount > 0 && !apply.isPending;

  async function handleSuggest() {
    if (!subjectId) return;
    setEdited(null);
    try {
      const started = await suggest.mutateAsync();
      setJobId(started.id);
    } catch {
      // useSuggestSyllabus already surfaces a toast on failure.
    }
  }

  async function handleApply() {
    if (!subjectId || !isReady) return;
    try {
      const created = await apply.mutateAsync(workingTree);
      toast(
        `Applied ${created.length} ${created.length === 1 ? 'topic' : 'topics'} to the syllabus.`,
        { variant: 'success' },
      );
      navigate(backTo);
    } catch {
      // useApplySyllabus already surfaces a toast on failure.
    }
  }

  const starting = suggest.isPending;
  const running =
    Boolean(jobId) && (job == null || job.status === 'queued' || job.status === 'processing');
  const showStartButton = !jobId || isFailed;

  return (
    <div className="space-y-6">
      <PageHeader
        breadcrumbs={breadcrumbs}
        title="Auto-suggest topics"
        subtitle="Let the AI derive a syllabus from this subject’s sources. Review and edit the suggested topics before applying them."
        actions={
          <>
            <Button variant="ghost" onClick={() => navigate(backTo)}>
              Back to syllabus
            </Button>
            {!showStartButton && (
              <Button
                variant="secondary"
                onClick={() => void handleSuggest()}
                loading={starting}
                disabled={running}
              >
                Re-run suggestion
              </Button>
            )}
          </>
        }
      />

      {!subjectId ? (
        <Card padding="md">
          <p role="alert" className="text-sm text-danger">
            No subject selected.
          </p>
        </Card>
      ) : !jobId ? (
        <EmptyState
          icon="✨"
          title="Generate a suggested syllabus"
          description="StudyRover reads this subject’s sources and proposes an ordered topic tree with page ranges. You can fully edit the result before it becomes part of the syllabus."
          action={
            <Button onClick={() => void handleSuggest()} loading={starting}>
              Auto-suggest topics
            </Button>
          }
        />
      ) : (
        <div className="space-y-6">
          <JobStatus
            status={job?.status ?? 'queued'}
            progress={job?.progress}
            error={isFailed ? job?.error ?? 'The suggestion job failed.' : undefined}
            label={
              subjectName
                ? `Deriving syllabus for ${subjectName}`
                : 'Deriving syllabus'
            }
          />

          {isFailed && (
            <div className="flex justify-center">
              <Button onClick={() => void handleSuggest()} loading={starting}>
                Try again
              </Button>
            </div>
          )}

          {isReady &&
            (suggestions.length === 0 ? (
              <EmptyState
                icon="🤔"
                title="No topics were suggested"
                description="The AI couldn’t derive topics from the current sources. Add more source material to this subject and try again, or build the syllabus manually."
                action={
                  <div className="flex flex-wrap items-center justify-center gap-2">
                    <Button
                      variant="secondary"
                      onClick={() => navigate(backTo)}
                    >
                      Build manually
                    </Button>
                    <Button onClick={() => void handleSuggest()} loading={starting}>
                      Try again
                    </Button>
                  </div>
                }
              />
            ) : (
              <Card padding="md" className="space-y-5">
                <div>
                  <h2 className="font-display text-lg font-bold text-foreground">
                    Review suggested topics
                  </h2>
                  <p className="mt-1 text-sm text-foreground-muted">
                    Rename topics, adjust page ranges, reorder, or exclude
                    branches. Excluded topics won’t be added.
                  </p>
                </div>

                <TopicTreeEditor
                  suggestions={suggestions}
                  onChange={setEdited}
                  disabled={apply.isPending}
                />

                <div className="flex flex-wrap items-center justify-end gap-2 border-t border-border pt-4">
                  <span
                    className="mr-auto text-sm text-foreground-muted"
                    aria-live="polite"
                  >
                    {includedCount}{' '}
                    {includedCount === 1 ? 'topic' : 'topics'} will be added.
                  </span>
                  <Button
                    variant="ghost"
                    onClick={() => navigate(backTo)}
                    disabled={apply.isPending}
                  >
                    Cancel
                  </Button>
                  <Button
                    onClick={() => void handleApply()}
                    loading={apply.isPending}
                    disabled={!canApply}
                  >
                    Apply topics
                  </Button>
                </div>
              </Card>
            ))}
        </div>
      )}
    </div>
  );
}

/** Counts every node in a topic-suggestion tree (parents + descendants). */
function countTopics(topics: TopicSuggestion[]): number {
  return topics.reduce(
    (total, topic) => total + 1 + countTopics(topic.children ?? []),
    0,
  );
}
