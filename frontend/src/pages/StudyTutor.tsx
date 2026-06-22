import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';

import { Button } from '../components/Button';
import { Card } from '../components/Card';
import { Select } from '../components/Select';
import { EmptyState } from '../components/EmptyState';
import { ChatThread } from '../components/ChatThread';
import type { ChatCitation, ChatMessage } from '../components/ChatThread';
import { ChatComposer } from '../components/ChatComposer';
import type { ChatQuickAction } from '../components/ChatComposer';
import { StudyGuideView } from '../components/StudyGuideView';
import { MarkdownRenderer } from '../components/MarkdownRenderer';
import type { components } from '../api/schema';
import { useSubjects } from '../hooks/useSubjects';
import { useTopics } from '../hooks/useTopics';
import { useStudentProfile } from '../hooks/useStudentProfile';
import { useTutorChat } from '../hooks/useTutorChat';
import { useStudyGuide, useGenerateStudyGuide } from '../hooks/useStudyGuide';

/**
 * 2-P01 — Study / Tutor chat (screen 3.2)
 *
 * The student's grounded AI-tutor surface. The learner picks a subject (and,
 * optionally, a topic to focus on) and then chats with the tutor, whose
 * answers stream token-by-token with source citations (H01 `useTutorChat` over
 * the SSE endpoint 2-A02). A side panel surfaces an on-demand, citation-grounded
 * study guide for the same subject/topic (H02 `useStudyGuide`).
 *
 * Quick actions ("Explain this", "Give an example") submit canned prompts; a
 * dedicated "I'm ready for a quiz" action routes to the exam start flow (P12)
 * instead of sending a message, per the screen spec.
 *
 * Data flows entirely through the H-task hooks; this page only composes the
 * presentational U-tasks (ChatThread/ChatComposer/StudyGuideView) and the shared
 * primitives. Conversations are (re)started whenever the subject changes once a
 * student + subject are known.
 *
 * States covered: loading (skeleton), error (retry), empty (no subjects), and
 * the populated two-pane chat + guide layout.
 */

type Message = components['schemas']['Message'];
type Citation = components['schemas']['Citation'];

/** Sentinel value for the "Whole subject" (no specific topic) option. */
const ALL_TOPICS = '';

/** Map a contract Citation to the ChatThread's presentational citation shape. */
function toChatCitation(citation: Citation): ChatCitation {
  return {
    sourceId: citation.sourceId,
    label: citation.label,
    locator: citation.locator ?? undefined,
  };
}

/** Map a contract Message to the ChatThread's presentational message shape. */
function toChatMessage(message: Message): ChatMessage {
  return {
    id: message.id,
    role: message.role,
    text: message.text,
    citations:
      message.role === 'assistant' && message.citations
        ? message.citations.map(toChatCitation)
        : undefined,
    createdAt: message.createdAt,
  };
}

export default function StudyTutor() {
  const navigate = useNavigate();

  const studentQuery = useStudentProfile();
  const studentId = studentQuery.data?.id;

  const subjectsQuery = useSubjects();
  const activeSubjects = useMemo(
    () => subjectsQuery.data?.items.filter((s) => !s.archived) ?? [],
    [subjectsQuery.data],
  );

  // Selected subject + topic. Topic empty string == "Whole subject".
  const [subjectId, setSubjectId] = useState<string>('');
  const [topicId, setTopicId] = useState<string>(ALL_TOPICS);

  // Seed the subject selection from the first available subject.
  useEffect(() => {
    if (subjectId === '' && activeSubjects.length > 0) {
      setSubjectId(activeSubjects[0].id);
    }
  }, [activeSubjects, subjectId]);

  const topicsQuery = useTopics(subjectId || undefined);
  const topics = useMemo(
    () =>
      [...(topicsQuery.data?.items ?? [])].sort((a, b) => a.order - b.order),
    [topicsQuery.data],
  );

  const chat = useTutorChat();
  const { startConversation } = chat;

  // Start (or restart) a conversation whenever the student + subject are known
  // and the subject changes. Topic is passed per-message, so it does not restart.
  useEffect(() => {
    if (!studentId || !subjectId) return;
    void startConversation({ subjectId, studentId }).catch(() => {
      // Errors are surfaced via toast inside the hook.
    });
  }, [studentId, subjectId, startConversation]);

  const guideQuery = useStudyGuide(
    subjectId || undefined,
    topicId || undefined,
  );
  const generateGuide = useGenerateStudyGuide();

  const selectedSubject = activeSubjects.find((s) => s.id === subjectId);
  const selectedTopic = topics.find((t) => t.id === topicId);

  const subjectOptions = useMemo(
    () => activeSubjects.map((s) => ({ value: s.id, label: s.name })),
    [activeSubjects],
  );
  const topicOptions = useMemo(
    () => [
      { value: ALL_TOPICS, label: 'Whole subject' },
      ...topics.map((t) => ({ value: t.id, label: t.name })),
    ],
    [topics],
  );

  // Quick actions: the "ready for a quiz" prompt is handled separately (it
  // routes to the exam flow), so it is omitted from the composer's canned set.
  const quickActions: ChatQuickAction[] = useMemo(
    () => [
      { id: 'explain', label: 'Explain this', prompt: 'Explain this.' },
      { id: 'example', label: 'Give an example', prompt: 'Give an example.' },
      {
        id: 'summarize',
        label: 'Summarize the topic',
        prompt: 'Summarize this topic for me.',
      },
    ],
    [],
  );

  const chatMessages = useMemo(
    () => chat.messages.map(toChatMessage),
    [chat.messages],
  );

  function handleSend(text: string) {
    void chat.sendMessage(text, topicId || undefined);
  }

  function handleReadyForQuiz() {
    if (!subjectId) return;
    // Route to the exam start flow (P12), carrying the study context so the
    // exam surface can pre-select this subject/topic.
    navigate('/student/exam/start', {
      state: { subjectId, topicId: topicId || undefined },
    });
  }

  function handleGenerateGuide() {
    if (!subjectId) return;
    generateGuide.mutate({ subjectId, topicId: topicId || undefined });
  }

  const guideTitle = selectedTopic
    ? `${selectedSubject?.name ?? 'Subject'} · ${selectedTopic.name}`
    : selectedSubject?.name;

  // ----- Render states -----------------------------------------------------

  if (studentQuery.isPending || subjectsQuery.isPending) {
    return <StudyTutorSkeleton />;
  }

  if (subjectsQuery.isError) {
    return (
      <ErrorState
        message={subjectsQuery.error.message}
        onRetry={() => void subjectsQuery.refetch()}
        retrying={subjectsQuery.isFetching}
      />
    );
  }

  if (studentQuery.isError) {
    return (
      <ErrorState
        message={studentQuery.error.message}
        onRetry={() => void studentQuery.refetch()}
        retrying={studentQuery.isFetching}
      />
    );
  }

  if (activeSubjects.length === 0) {
    return (
      <EmptyState
        icon={<span className="text-4xl">📚</span>}
        title="No subjects to study yet"
        description="Ask your parent to add a subject and some study material, then come back to chat with your tutor."
      />
    );
  }

  return (
    <div className="space-y-6">
      <header className="space-y-4">
        <div>
          <p className="text-sm font-semibold uppercase tracking-wide text-secondary">
            Study with your tutor
          </p>
          <h1 className="mt-1 font-display text-display-sm text-foreground">
            {selectedSubject ? selectedSubject.name : 'Study'}
          </h1>
          <p className="mt-1 text-sm text-foreground-muted">
            Ask questions, get grounded explanations, and build a study guide.
            When you feel ready, jump into a quiz.
          </p>
        </div>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:max-w-2xl">
          <Select
            label="Subject"
            value={subjectId}
            options={subjectOptions}
            onChange={(e) => {
              setSubjectId(e.target.value);
              setTopicId(ALL_TOPICS);
            }}
          />
          <Select
            label="Topic"
            value={topicId}
            options={topicOptions}
            hint="Focus the tutor on a single topic, or study the whole subject."
            disabled={topicsQuery.isPending || topics.length === 0}
            onChange={(e) => setTopicId(e.target.value)}
          />
        </div>
      </header>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[1fr_22rem]">
        {/* Chat pane */}
        <Card padding="none" className="flex h-[32rem] flex-col overflow-hidden">
          <ChatThread
            className="flex-1"
            messages={chatMessages}
            pending={chat.isStreaming}
            renderMarkdown={(text, role) =>
              role === 'assistant' && text.length > 0 ? (
                <MarkdownRenderer>{text}</MarkdownRenderer>
              ) : (
                <span className="whitespace-pre-wrap break-words">{text}</span>
              )
            }
            emptyState={
              <p className="max-w-sm text-center text-sm text-foreground-muted">
                Ask anything about{' '}
                <span className="font-semibold text-foreground">
                  {selectedTopic?.name ?? selectedSubject?.name ?? 'this subject'}
                </span>
                . Your tutor answers with sources you can check.
              </p>
            }
          />
          <div className="border-t border-border p-3">
            <ChatComposer
              onSubmit={handleSend}
              streaming={chat.isStreaming}
              disabled={chat.isLoading || !chat.conversation}
              quickActions={quickActions}
              placeholder={
                chat.isLoading
                  ? 'Starting your study session…'
                  : 'Ask your tutor anything…'
              }
            />
            <div className="mt-3 flex justify-end">
              <Button
                variant="secondary"
                onClick={handleReadyForQuiz}
                disabled={!subjectId}
              >
                I&rsquo;m ready for a quiz
              </Button>
            </div>
          </div>
        </Card>

        {/* Study-guide pane */}
        <Card padding="md" className="flex h-[32rem] flex-col">
          <div className="flex items-center justify-between gap-3">
            <h2 className="font-display text-lg font-bold text-foreground">
              Study guide
            </h2>
            <Button
              variant="secondary"
              size="sm"
              onClick={handleGenerateGuide}
              loading={generateGuide.isPending}
              disabled={!subjectId}
            >
              {guideQuery.data ? 'Regenerate' : 'Generate'}
            </Button>
          </div>

          <div className="mt-4 min-h-0 flex-1 overflow-y-auto">
            {guideQuery.isPending ? (
              <GuideSkeleton />
            ) : guideQuery.isError ? (
              <div className="rounded-card border border-dashed border-border bg-surface p-6 text-center">
                <p className="text-sm text-foreground-muted">
                  No study guide yet. Generate one to get a grounded summary of
                  this {selectedTopic ? 'topic' : 'subject'}.
                </p>
                <div className="mt-4">
                  <Button
                    size="sm"
                    onClick={handleGenerateGuide}
                    loading={generateGuide.isPending}
                    disabled={!subjectId}
                  >
                    Generate study guide
                  </Button>
                </div>
              </div>
            ) : guideQuery.data ? (
              <StudyGuideView guide={guideQuery.data} title={guideTitle} />
            ) : (
              <div className="rounded-card border border-dashed border-border bg-surface p-6 text-center">
                <p className="text-sm text-foreground-muted">
                  Generate a study guide to see a grounded summary here.
                </p>
              </div>
            )}
          </div>
        </Card>
      </div>
    </div>
  );
}

function StudyTutorSkeleton() {
  return (
    <div className="space-y-6" aria-busy="true" aria-label="Loading study session">
      <div className="space-y-2">
        <div className="h-4 w-40 animate-pulse rounded-md bg-surface-muted" />
        <div className="h-8 w-64 animate-pulse rounded-md bg-surface-muted" />
      </div>
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[1fr_22rem]">
        <div className="h-[32rem] animate-pulse rounded-card border border-border bg-surface-muted" />
        <div className="h-[32rem] animate-pulse rounded-card border border-border bg-surface-muted" />
      </div>
    </div>
  );
}

function GuideSkeleton() {
  return (
    <div className="space-y-3" aria-busy="true" aria-label="Loading study guide">
      <div className="h-6 w-2/3 animate-pulse rounded-md bg-surface-muted" />
      <div className="h-4 w-full animate-pulse rounded-md bg-surface-muted" />
      <div className="h-4 w-5/6 animate-pulse rounded-md bg-surface-muted" />
      <div className="h-4 w-4/6 animate-pulse rounded-md bg-surface-muted" />
      <div className="mt-4 h-4 w-full animate-pulse rounded-md bg-surface-muted" />
      <div className="h-4 w-3/4 animate-pulse rounded-md bg-surface-muted" />
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
      <h2 className="font-display text-display-sm text-danger">
        Couldn&rsquo;t start studying
      </h2>
      <p className="mt-1 text-sm text-foreground-muted">{message}</p>
      <div className="mt-5">
        <Button variant="secondary" onClick={onRetry} loading={retrying}>
          Try again
        </Button>
      </div>
    </div>
  );
}
