# StudyRover — Frozen Contracts (Phase 2: Intelligence & Depth)

> Extends `CONTRACTS.md`. Same rules: OpenAPI 3.1 is the source of truth; codegen → Go + TS. Phase 2 stays **inside the Study Platform** (no Guardian). It adds the AI tutor, the knowledge backend, async ingestion, AI generation, and the parent dashboard.

## Key architectural seam — the Knowledge-Source adapter
A Go interface (`internal/knowledge.Source`) isolates the backend so it's swappable (spec §4). Two impls (Gemini-direct, NotebookLM-MCP) + a fake. Everything LLM/OCR/grounding goes through it.

```go
type Source interface {
    Ingest(ctx, IngestRequest) (JobID, error)         // PDF/Word/text/NotebookLM link → processed
    DeriveSyllabus(ctx, subjectID) ([]TopicSuggestion, error)
    GenerateQuestions(ctx, GenRequest) ([]QuestionDraft, error)
    GenerateStudyGuide(ctx, GuideRequest) (StudyGuide, error)
    AnswerGrounded(ctx, AskRequest) (stream of AnswerChunk, error)  // tutor chat, with citations
}
```
OCR is offloaded to the backend (it reads scanned PDFs/images natively). StudyRover does none itself.

## Async jobs
Ingestion, syllabus derivation, and question generation are **async**. A Postgres-backed job queue + worker drives `processing → ready/error`. Clients poll `GET /jobs/{id}` (optionally SSE).

## Entity schemas (`contracts/components/*.yaml`)

- **2-C01 TutorChat** — `Conversation{id, subjectId, studentId, createdAt}`, `Message{id, conversationId, role(user|assistant), text, citations[], createdAt}`, `Citation{sourceId, label, locator}`, SSE `AnswerChunk{delta, citations?, done}`, `AskRequest{conversationId, text, topicId?}`.
- **2-C02 StudyGuide** — `StudyGuide{id, subjectId, topicId?, markdown, citations[], generatedAt}`, `GuideRequest{subjectId, topicId?}`.
- **2-C03 Job** — `Job{id, type(ingest|syllabus|questions), status(queued|processing|ready|error), subjectId, progress(0-100), result?, error?, createdAt, updatedAt}`.
- **2-C04 SyllabusSuggestion** — `TopicSuggestion{name, sourceId?, pageStart?, pageEnd?, order, children?[]}`, `SuggestSyllabusResponse{jobId}` then `Job.result = TopicSuggestion[]`.
- **2-C05 QuestionDraft** — `QuestionDraft{id, subjectId, topicId?, text, options:[{text}], correctOptionIndex, difficulty, status(pending|approved|rejected)}`. Approve → real `Question` (C05).
- **2-C06 TutorInstructions** — `TutorInstructions{subjectId, customInstructions, tone?, targetLanguage?, difficulty?}` (per subject; spec §2.7).
- **2-C07 Guidance** — `Guidance{id, scope(global|subject), subjectId?, text, createdAt}` (parent guidance to tutor; spec §2.10).
- **2-C08 Dashboard** — `Dashboard{mastery: TopicMastery[], masteryTimeline: {date, topicId, mastery}[], history: ExamAttempt[], avgScore, streak, guidance: Guidance[]}` (no internet-time — Guardian off).

## API additions (under `/api`)
| Method + path | Body → Returns | Task |
|---|---|---|
| `POST /tutor/conversations` | `{subjectId, studentId}` → `Conversation` | 2-A01 |
| `POST /tutor/conversations/{id}/messages` | `AskRequest` → **SSE** `AnswerChunk` | 2-A02 |
| `GET /tutor/conversations/{id}` | → `Conversation` + `Message[]` | 2-A03 |
| `POST /subjects/{id}/study-guide` · `GET` | `GuideRequest` → `StudyGuide` | 2-A04 |
| `POST /sources` (ingest) | `CreateSource` → `Job` (async) | 2-A05 |
| `GET /jobs/{id}` · `GET /jobs?subjectId` | → `Job` / `Job[]` (SSE optional) | 2-A06 |
| `POST /subjects/{id}/syllabus/suggest` | → `Job` | 2-A07 |
| `POST /subjects/{id}/syllabus/apply` | `TopicSuggestion[]` → `Topic[]` | 2-A08 |
| `POST /questions/generate` | `GenRequest` → `Job` | 2-A09 |
| `GET /questions/drafts` · `POST /questions/drafts/{id}/approve|reject` | → `QuestionDraft` / `Question` | 2-A10 |
| `GET/PUT /subjects/{id}/tutor-instructions` | `TutorInstructions` | 2-A11 |
| `GET/PUT /guidance` (`?subjectId`) | `Guidance` | 2-A12 |
| `GET /dashboard` (`?studentId`) | → `Dashboard` | 2-A13 |

The tutor system prompt is assembled (2-L01) from: syllabus + student progress + per-subject `TutorInstructions` + parent `Guidance`. Generated questions are **drafts** requiring parent approval before entering the live bank (keeps the §6 anti-gaming bank trustworthy).
