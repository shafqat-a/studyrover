import { useEffect, useMemo, useRef, useState } from 'react';
import type { FormEvent, KeyboardEvent } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import {
  Check,
  Eye,
  Link2,
  PencilLine,
  Plus,
  RotateCcw,
  Save,
  Sparkles,
  Trash2,
  Wand2,
} from 'lucide-react';

import {
  Button,
  Card,
  ConfirmDialog,
  Dialog,
  JobStatus,
  LessonBody,
  LessonResourceGroups,
  LessonStatusBadge,
  NumberStepper,
  PageHeader,
  Tabs,
  Textarea,
  TextInput,
  Toggle,
  type LessonResource,
} from '../components';
import type { components } from '../api/schema';
import {
  ENRICH_DEFAULTS,
  enrichResultOf,
  isTerminalJobStatus,
  lessonKeys,
  useAddLessonResource,
  useDeleteLesson,
  useDeleteLessonResource,
  useEnrichLesson,
  useGenerateLesson,
  useJob,
  useLesson,
  useSubject,
  useTopic,
  useUpdateLesson,
  type EnrichResult,
} from '../hooks';
import { useToast } from '../app/providers';

/**
 * Lesson editor (parent) — `/parent/subjects/:subjectId/lessons/:lessonId`.
 *
 * Edits one lesson: title, Markdown body (editor + live preview; a Write /
 * Preview switch below the `lg` breakpoint), publish toggle, "Regenerate with
 * AI" (synchronous, replaces the body after a confirm), and "Enrich" (async
 * job that attaches YouTube videos + Wikipedia articles; polled with `useJob`,
 * the lesson refetched when it is ready). The Resources section groups
 * videos / articles / links with remove + an "Add by URL" form.
 *
 * Data flows entirely through the `useLessons` hooks; nothing here hand-rolls
 * a fetch. Dirty tracking compares the local draft against the last-known
 * server copy so server-side changes (regenerate, enrich) are adopted only
 * when the field is untouched.
 */

type EnrichLessonRequest = components['schemas']['EnrichLessonRequest'];

interface Baseline {
  id: string;
  title: string;
  markdown: string;
}

/** "Added 3 videos and 2 articles" / "No new resources found". */
function summariseEnrich(result: EnrichResult | undefined): string {
  if (!result) return 'Enrichment finished.';
  const parts: string[] = [];
  if (result.youtube > 0) {
    parts.push(`${result.youtube} video${result.youtube === 1 ? '' : 's'}`);
  }
  if (result.wikipedia > 0) {
    parts.push(
      `${result.wikipedia} article${result.wikipedia === 1 ? '' : 's'}`,
    );
  }
  const other = result.added - result.youtube - result.wikipedia;
  if (other > 0) {
    parts.push(`${other} link${other === 1 ? '' : 's'}`);
  }
  if (parts.length === 0) return 'No new resources found.';
  return `Added ${parts.join(' and ')}.`;
}

export default function SubjectLessonEditor() {
  const { subjectId, lessonId } = useParams<{
    subjectId: string;
    lessonId: string;
  }>();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const subjectQuery = useSubject(subjectId);
  const lessonQuery = useLesson(lessonId);
  const lesson = lessonQuery.data;
  const topicQuery = useTopic(lesson?.topicId);

  const updateLesson = useUpdateLesson();
  const deleteLesson = useDeleteLesson();
  const generateLesson = useGenerateLesson();
  const enrichLesson = useEnrichLesson();
  const addResource = useAddLessonResource();
  const deleteResource = useDeleteLessonResource();

  // ----- Draft state (title + markdown) ------------------------------------
  const [title, setTitle] = useState('');
  const [markdown, setMarkdown] = useState('');
  const [savedAt, setSavedAt] = useState<number | null>(null);
  const [view, setView] = useState<'write' | 'preview'>('write');
  const baseline = useRef<Baseline | null>(null);

  // Seed the draft from the server copy; when the server copy changes under
  // us (regenerate / enrich / another tab) adopt the new value only for fields
  // the user has not edited.
  useEffect(() => {
    if (!lesson) return;
    const prev = baseline.current;
    const next: Baseline = {
      id: lesson.id,
      title: lesson.title,
      markdown: lesson.markdown,
    };
    if (!prev || prev.id !== lesson.id) {
      setTitle(next.title);
      setMarkdown(next.markdown);
    } else {
      setTitle((cur) => (cur === prev.title ? next.title : cur));
      setMarkdown((cur) => (cur === prev.markdown ? next.markdown : cur));
    }
    baseline.current = next;
  }, [lesson]);

  const dirty =
    Boolean(lesson) &&
    (title !== (lesson?.title ?? '') || markdown !== (lesson?.markdown ?? ''));
  const titleError =
    title.trim().length === 0 ? 'A lesson needs a title.' : undefined;

  const savingBody =
    updateLesson.isPending &&
    updateLesson.variables?.changes.status === undefined;
  const savingStatus =
    updateLesson.isPending &&
    updateLesson.variables?.changes.status !== undefined;

  function handleSave() {
    if (!lesson || !dirty || titleError) return;
    updateLesson.mutate(
      { id: lesson.id, changes: { title: title.trim(), markdown } },
      { onSuccess: () => setSavedAt(Date.now()) },
    );
  }

  function handleEditorKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 's') {
      event.preventDefault();
      handleSave();
    }
  }

  function handlePublishedChange(published: boolean) {
    if (!lesson) return;
    updateLesson.mutate(
      { id: lesson.id, changes: { status: published ? 'published' : 'draft' } },
      {
        onSuccess: (updated) => {
          toast(
            updated.status === 'published'
              ? 'Lesson published — your student can see it now.'
              : 'Lesson moved back to draft.',
            { variant: 'success' },
          );
        },
      },
    );
  }

  // ----- Regenerate ---------------------------------------------------------
  const [regenOpen, setRegenOpen] = useState(false);
  const [regenInstructions, setRegenInstructions] = useState('');

  async function handleRegenerate() {
    if (!lesson) return;
    const updated = await generateLesson.mutateAsync({
      id: lesson.id,
      instructions: regenInstructions,
    });
    // The user asked for a replacement: adopt the new body even if the draft
    // was dirty.
    baseline.current = {
      id: updated.id,
      title: updated.title,
      markdown: updated.markdown,
    };
    setTitle(updated.title);
    setMarkdown(updated.markdown);
    setSavedAt(Date.now());
    setRegenOpen(false);
    setRegenInstructions('');
    toast('Lesson body regenerated.', { variant: 'success' });
  }

  // ----- Enrich (async job) -------------------------------------------------
  const [enrichOpen, setEnrichOpen] = useState(false);
  const [enrichJobId, setEnrichJobId] = useState<string | null>(null);
  const enrichJob = useJob(enrichJobId ?? undefined);
  const jobData = enrichJob.data;
  const handledJobRef = useRef<string | null>(null);
  const enriching =
    enrichLesson.isPending ||
    (Boolean(enrichJobId) &&
      (!jobData || !isTerminalJobStatus(jobData.status)));

  useEffect(() => {
    if (!jobData || !lessonId) return;
    if (!isTerminalJobStatus(jobData.status)) return;
    if (handledJobRef.current === jobData.id) return;
    handledJobRef.current = jobData.id;

    if (jobData.status === 'ready') {
      void queryClient.invalidateQueries({
        queryKey: lessonKeys.detail(lessonId),
      });
      void queryClient.invalidateQueries({ queryKey: lessonKeys.lists() });
      const result = enrichResultOf(jobData);
      toast(summariseEnrich(result), {
        variant: result && result.added > 0 ? 'success' : 'info',
      });
      for (const warning of result?.warnings ?? []) {
        toast(warning, { variant: 'warning', durationMs: 8000 });
      }
    } else {
      toast(jobData.error ?? 'Enrichment failed.', { variant: 'danger' });
    }
  }, [jobData, lessonId, queryClient, toast]);

  async function handleEnrich(options: EnrichLessonRequest) {
    if (!lesson) return;
    const job = await enrichLesson.mutateAsync({ id: lesson.id, options });
    handledJobRef.current = null;
    setEnrichJobId(job.id);
    setEnrichOpen(false);
  }

  // ----- Resources ----------------------------------------------------------
  const [removing, setRemoving] = useState<LessonResource | null>(null);
  const [newUrl, setNewUrl] = useState('');
  const [newTitle, setNewTitle] = useState('');

  const urlError = useMemo(() => {
    const value = newUrl.trim();
    if (value.length === 0) return undefined;
    try {
      const u = new URL(value);
      if (u.protocol !== 'http:' && u.protocol !== 'https:') {
        return 'Enter an http(s) URL.';
      }
      return undefined;
    } catch {
      return 'Enter a full URL, e.g. https://…';
    }
  }, [newUrl]);

  function handleAddResource(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!lesson || urlError || newUrl.trim().length === 0) return;
    addResource.mutate(
      {
        lessonId: lesson.id,
        body: {
          url: newUrl.trim(),
          title: newTitle.trim().length > 0 ? newTitle.trim() : undefined,
        },
      },
      {
        onSuccess: (resource) => {
          setNewUrl('');
          setNewTitle('');
          toast(`Attached “${resource.title}”.`, { variant: 'success' });
        },
      },
    );
  }

  async function handleRemoveResource() {
    if (!lesson || !removing) return;
    await deleteResource.mutateAsync({
      lessonId: lesson.id,
      resourceId: removing.id,
    });
    setRemoving(null);
  }

  // ----- Delete lesson ------------------------------------------------------
  const [deleteOpen, setDeleteOpen] = useState(false);

  async function handleDeleteLesson() {
    if (!lesson) return;
    await deleteLesson.mutateAsync({ id: lesson.id, subjectId: lesson.subjectId });
    setDeleteOpen(false);
    toast('Lesson deleted.', { variant: 'success' });
    navigate(`/parent/subjects/${lesson.subjectId}/lessons`, { replace: true });
  }

  // ----- Render states ------------------------------------------------------
  const listPath = `/parent/subjects/${subjectId ?? ''}/lessons`;
  const subjectName = subjectQuery.data?.name ?? 'Subject';

  if (!lessonId || !subjectId) {
    return (
      <div className="rounded-card border border-border bg-surface p-4 text-sm text-foreground-muted">
        No lesson selected. Open a lesson from the Lessons tab.
      </div>
    );
  }

  if (lessonQuery.isPending) {
    return <EditorSkeleton />;
  }

  if (lessonQuery.isError || !lesson) {
    return (
      <div
        role="alert"
        className="rounded-card border border-danger bg-danger-soft p-4"
      >
        <p className="text-sm font-medium text-danger">
          {lessonQuery.error?.message ?? 'That lesson could not be found.'}
        </p>
        <div className="mt-3 flex gap-2">
          <Button
            variant="secondary"
            size="sm"
            onClick={() => void lessonQuery.refetch()}
          >
            Retry
          </Button>
          <Button variant="ghost" size="sm" onClick={() => navigate(listPath)}>
            Back to lessons
          </Button>
        </div>
      </div>
    );
  }

  const resourceCount = lesson.resources.length;

  return (
    <div className="space-y-6">
      <PageHeader
        breadcrumbs={[
          { label: 'Subjects', to: '/parent/subjects' },
          { label: subjectName, to: `/parent/subjects/${subjectId}` },
          { label: 'Lessons', to: listPath },
          { label: lesson.title || 'Untitled lesson' },
        ]}
        title={
          <span className="inline-flex flex-wrap items-center gap-2">
            <span>{lesson.title || 'Untitled lesson'}</span>
            <LessonStatusBadge status={lesson.status} />
          </span>
        }
        subtitle={
          topicQuery.data ? (
            <>
              Topic:{' '}
              <span className="font-medium text-foreground">
                {topicQuery.data.name}
              </span>
              {lesson.generatedAt ? (
                <span className="text-foreground-muted">
                  {' '}
                  · body generated by AI
                </span>
              ) : null}
            </>
          ) : undefined
        }
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <Button
              variant="secondary"
              onClick={() => setRegenOpen(true)}
              disabled={generateLesson.isPending}
              leadingIcon={<Wand2 className="h-4 w-4" aria-hidden="true" />}
            >
              Regenerate with AI
            </Button>
            <Button
              onClick={() => setEnrichOpen(true)}
              loading={enriching}
              loadingLabel="Enriching…"
              leadingIcon={<Sparkles className="h-4 w-4" aria-hidden="true" />}
            >
              Enrich
            </Button>
          </div>
        }
      />

      {/* Body editor */}
      <Card padding="lg">
        <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
          <div className="min-w-0 flex-1 md:max-w-xl">
            <TextInput
              label="Title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              error={titleError}
              required
            />
          </div>
          <Toggle
            checked={lesson.status === 'published'}
            onChange={handlePublishedChange}
            disabled={savingStatus}
            labelPosition="after"
            label="Published"
            description="Visible to the student"
            className="md:mt-7"
          />
        </div>

        <div className="mt-6">
          <div className="mb-3 flex items-center justify-between gap-3">
            <p className="text-sm font-medium text-foreground">Lesson body</p>
            <Tabs
              size="sm"
              className="lg:hidden"
              aria-label="Editor view"
              value={view}
              onValueChange={(id) => setView(id === 'preview' ? 'preview' : 'write')}
              items={[
                {
                  id: 'write',
                  label: 'Write',
                  icon: <PencilLine className="h-4 w-4" aria-hidden="true" />,
                },
                {
                  id: 'preview',
                  label: 'Preview',
                  icon: <Eye className="h-4 w-4" aria-hidden="true" />,
                },
              ]}
            />
          </div>

          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            <div className={view === 'write' ? 'block' : 'hidden lg:block'}>
              <Textarea
                label="Markdown"
                hideLabel
                value={markdown}
                onChange={(e) => setMarkdown(e.target.value)}
                onKeyDown={handleEditorKeyDown}
                spellCheck
                placeholder={
                  '# Objectives\n\n- …\n\n## Explanation\n\nWrite the lesson in Markdown.'
                }
                className="min-h-[28rem] font-mono text-[13px] leading-relaxed lg:min-h-[32rem]"
              />
            </div>
            <div
              className={
                (view === 'preview' ? 'block' : 'hidden lg:block') +
                ' min-h-[28rem] overflow-y-auto rounded-md border border-border bg-surface-muted/40 p-4 lg:max-h-[32rem]'
              }
              aria-label="Preview"
            >
              {markdown.trim().length > 0 ? (
                <LessonBody markdown={markdown} />
              ) : (
                <p className="text-sm italic text-foreground-muted">
                  Nothing to preview yet.
                </p>
              )}
            </div>
          </div>
        </div>

        <div className="mt-5 flex flex-wrap items-center justify-between gap-3 border-t border-border pt-4">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setDeleteOpen(true)}
            className="text-danger hover:bg-danger-soft"
            leadingIcon={<Trash2 className="h-4 w-4" aria-hidden="true" />}
          >
            Delete lesson
          </Button>
          <div className="flex items-center gap-3">
            <span
              role="status"
              className="text-xs text-foreground-muted"
              aria-live="polite"
            >
              {dirty ? (
                'Unsaved changes'
              ) : savedAt ? (
                <span className="inline-flex items-center gap-1 text-success">
                  <Check className="h-3.5 w-3.5" aria-hidden="true" />
                  Saved
                </span>
              ) : (
                'All changes saved'
              )}
            </span>
            <Button
              onClick={handleSave}
              disabled={!dirty || Boolean(titleError)}
              loading={savingBody}
              loadingLabel="Saving…"
              leadingIcon={<Save className="h-4 w-4" aria-hidden="true" />}
            >
              Save
            </Button>
          </div>
        </div>
      </Card>

      {/* Resources */}
      <Card padding="lg">
        <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
          <div>
            <h2 className="font-display text-lg font-semibold text-foreground">
              Resources{' '}
              <span className="text-sm font-normal text-foreground-muted">
                ({resourceCount})
              </span>
            </h2>
            <p className="mt-1 text-sm text-foreground-muted">
              Videos and articles shown under the lesson. Use Enrich to find
              them automatically, or add any URL by hand.
            </p>
          </div>
          {enrichJobId ? (
            <div className="w-full md:w-72">
              <JobStatus
                status={jobData?.status ?? 'queued'}
                progress={jobData?.progress}
                error={jobData?.error}
                label="Enriching lesson"
                statusText={
                  jobData?.status === 'ready' ? 'Done' : undefined
                }
              />
              {jobData && isTerminalJobStatus(jobData.status) ? (
                <div className="mt-1 flex justify-end">
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setEnrichJobId(null)}
                  >
                    Dismiss
                  </Button>
                </div>
              ) : null}
            </div>
          ) : null}
        </div>

        <form
          className="mt-5 grid grid-cols-1 gap-3 rounded-md border border-dashed border-border p-3 md:grid-cols-[1fr_14rem_auto] md:items-end"
          onSubmit={handleAddResource}
          aria-label="Add a resource by URL"
        >
          <TextInput
            label="Add by URL"
            value={newUrl}
            onChange={(e) => setNewUrl(e.target.value)}
            placeholder="https://www.youtube.com/watch?v=… or https://en.wikipedia.org/wiki/…"
            error={urlError}
            inputMode="url"
            leadingIcon={<Link2 className="h-4 w-4" aria-hidden="true" />}
          />
          <TextInput
            label="Title (optional)"
            value={newTitle}
            onChange={(e) => setNewTitle(e.target.value)}
            placeholder="Fetched automatically"
          />
          <Button
            type="submit"
            variant="secondary"
            disabled={newUrl.trim().length === 0 || Boolean(urlError)}
            loading={addResource.isPending}
            leadingIcon={<Plus className="h-4 w-4" aria-hidden="true" />}
          >
            Add
          </Button>
        </form>

        <div className="mt-6">
          <LessonResourceGroups
            resources={lesson.resources}
            variant="parent"
            showSource
            onRemove={(resource) => setRemoving(resource)}
            removingId={deleteResource.isPending ? removing?.id ?? null : null}
            emptyState={
              <div className="rounded-card border border-dashed border-border p-6 text-center">
                <Sparkles
                  className="mx-auto h-5 w-5 text-foreground-muted"
                  aria-hidden="true"
                />
                <p className="mt-2 text-sm text-foreground-muted">
                  No resources yet. Click{' '}
                  <span className="font-medium text-foreground">Enrich</span>{' '}
                  to find videos and articles for this topic.
                </p>
              </div>
            }
          />
        </div>
      </Card>

      {/* Regenerate confirm */}
      <ConfirmDialog
        open={regenOpen}
        title="Regenerate lesson body?"
        message="The current body will be replaced with a fresh AI-written lesson. Resources are kept. This cannot be undone."
        confirmLabel="Regenerate"
        cancelLabel="Cancel"
        onCancel={() => {
          if (!generateLesson.isPending) setRegenOpen(false);
        }}
        onConfirm={handleRegenerate}
      >
        <div className="mt-2">
          <Textarea
            label="Instructions (optional)"
            value={regenInstructions}
            onChange={(e) => setRegenInstructions(e.target.value)}
            rows={3}
            placeholder="e.g. Shorter, with two worked examples."
            disabled={generateLesson.isPending}
          />
          {generateLesson.isPending ? (
            <p
              role="status"
              className="mt-3 inline-flex items-center gap-2 text-xs text-foreground-muted"
            >
              <RotateCcw className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />
              Writing the lesson… this can take up to a minute.
            </p>
          ) : null}
        </div>
      </ConfirmDialog>

      {/* Enrich options */}
      {enrichOpen ? (
        <EnrichDialog
          submitting={enrichLesson.isPending}
          onClose={() => {
            if (!enrichLesson.isPending) setEnrichOpen(false);
          }}
          onSubmit={handleEnrich}
        />
      ) : null}

      {/* Remove resource confirm */}
      {removing ? (
        <ConfirmDialog
          open
          danger
          title="Remove resource"
          message={`Remove “${removing.title}” from this lesson?`}
          confirmLabel="Remove"
          cancelLabel="Cancel"
          onCancel={() => setRemoving(null)}
          onConfirm={handleRemoveResource}
        />
      ) : null}

      {/* Delete lesson confirm */}
      <ConfirmDialog
        open={deleteOpen}
        danger
        title="Delete lesson"
        message={`Permanently delete “${lesson.title}” and its resources? This cannot be undone.`}
        confirmLabel="Delete"
        cancelLabel="Cancel"
        onCancel={() => setDeleteOpen(false)}
        onConfirm={handleDeleteLesson}
      />
    </div>
  );
}

interface EnrichDialogProps {
  submitting: boolean;
  onClose: () => void;
  onSubmit: (options: EnrichLessonRequest) => Promise<void>;
}

function EnrichDialog({ submitting, onClose, onSubmit }: EnrichDialogProps) {
  const [youtube, setYoutube] = useState(ENRICH_DEFAULTS.youtube);
  const [wikipedia, setWikipedia] = useState(ENRICH_DEFAULTS.wikipedia);
  const [maxPerKind, setMaxPerKind] = useState(ENRICH_DEFAULTS.maxPerKind);
  const [query, setQuery] = useState('');

  const nothingSelected = !youtube && !wikipedia;

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (submitting || nothingSelected) return;
    void onSubmit({
      youtube,
      wikipedia,
      maxPerKind,
      query: query.trim().length > 0 ? query.trim() : undefined,
    }).catch(() => {
      // Errors are surfaced via toast inside the hook; keep the dialog open.
    });
  }

  return (
    <Dialog
      open
      onClose={onClose}
      title="Enrich lesson"
      description="Search for videos and articles about this topic and attach the best matches. Anything already attached is skipped."
      disableBackdropClose={submitting}
      disableEscapeClose={submitting}
      footer={
        <div className="flex justify-end gap-2">
          <Button
            type="button"
            variant="ghost"
            onClick={onClose}
            disabled={submitting}
          >
            Cancel
          </Button>
          <Button
            type="submit"
            form="enrich-lesson-form"
            loading={submitting}
            loadingLabel="Starting…"
            disabled={nothingSelected}
            leadingIcon={<Sparkles className="h-4 w-4" aria-hidden="true" />}
          >
            Start enrichment
          </Button>
        </div>
      }
    >
      <form
        id="enrich-lesson-form"
        className="flex flex-col gap-4"
        onSubmit={handleSubmit}
      >
        <Toggle
          checked={youtube}
          onChange={setYoutube}
          disabled={submitting}
          label="YouTube videos"
          description="Needs YOUTUBE_API_KEY on the server; skipped with a warning otherwise."
        />
        <Toggle
          checked={wikipedia}
          onChange={setWikipedia}
          disabled={submitting}
          label="Wikipedia articles"
        />
        <div className="flex items-center justify-between gap-3">
          <label
            htmlFor="enrich-max-per-kind"
            className="text-sm font-medium text-foreground"
          >
            Max per kind
          </label>
          <NumberStepper
            id="enrich-max-per-kind"
            value={maxPerKind}
            onChange={setMaxPerKind}
            min={1}
            max={10}
            disabled={submitting}
            label="Maximum resources per kind"
          />
        </div>
        <TextInput
          label="Search query (optional)"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Defaults to the topic and subject"
          disabled={submitting}
        />
        {nothingSelected ? (
          <p className="text-xs text-danger">Pick at least one source.</p>
        ) : null}
      </form>
    </Dialog>
  );
}

function EditorSkeleton() {
  return (
    <div className="space-y-6" aria-busy="true" aria-label="Loading lesson">
      <div className="space-y-3">
        <div className="h-4 w-64 animate-pulse rounded-md bg-surface-muted" />
        <div className="h-8 w-96 max-w-full animate-pulse rounded-md bg-surface-muted" />
      </div>
      <div className="h-[36rem] animate-pulse rounded-card bg-surface-muted" />
      <div className="h-48 animate-pulse rounded-card bg-surface-muted" />
    </div>
  );
}
