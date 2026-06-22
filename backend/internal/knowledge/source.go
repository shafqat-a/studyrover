// Package knowledge defines the swappable knowledge-backend seam that every
// AI feature in StudyRover calls through (spec §4).
//
// # The Source seam
//
// [Source] is the single interface that isolates StudyRover from whichever
// concrete knowledge backend is in use. It has three concrete implementations
// (a Gemini-direct adapter, a NotebookLM-MCP adapter, and a deterministic fake
// for tests) plus a selector constructor (knowledge.New) that picks one at
// wiring time. Everything LLM-, OCR-, and grounding-related flows through this
// interface, so handlers and orchestration code never import a vendor SDK
// directly.
//
// OCR is the backend's responsibility: adapters read scanned PDFs and images
// natively. StudyRover performs no OCR itself.
//
// # Async by contract
//
// Ingestion, syllabus derivation, and question generation are long-running, so
// the corresponding methods return a [JobID] rather than a finished result. The
// caller persists the job (package jobs / the Postgres-backed queue) and the
// worker later fills in the result, driving the job from queued → processing →
// ready/error. Clients poll for completion. AnswerGrounded is the exception: the
// tutor chat streams tokens back over a channel of [AnswerChunk] in real time.
//
// # Types live here, OpenAPI types live at the edge
//
// The request/response structs in this file are the internal domain shapes the
// adapters speak. They are deliberately decoupled from the generated OpenAPI
// types: HTTP handlers translate between the wire types and these at the edge,
// so the knowledge package stays free of transport concerns.
//
// This file is pure contract — it makes no network calls and has no concrete
// behavior. Implementations satisfy [Source] in their own files.
package knowledge

import "context"

// JobID identifies an asynchronous knowledge job (ingest, syllabus derivation,
// or question generation). It mirrors Job.id on the wire (2-C03) but is kept as
// a distinct domain type so callers thread it through the job queue without
// depending on transport types.
type JobID string

// String returns the raw identifier.
func (j JobID) String() string { return string(j) }

// Source is the swappable knowledge backend (spec §4). All LLM, OCR, and
// grounding work is reached through this interface so the concrete backend
// (Gemini-direct, NotebookLM-MCP, or the test fake) can be chosen at wiring time
// without touching feature code.
//
// Implementations must degrade gracefully: when an external dependency is
// unavailable they return an error rather than panicking, and they hold no
// hidden global state. The fake implementation is fully deterministic and needs
// no network.
type Source interface {
	// Ingest accepts an uploaded document or NotebookLM link and kicks off
	// asynchronous processing (extraction, OCR, chunking, embedding). It
	// returns a JobID the caller persists and polls; the processed result is
	// not available synchronously.
	Ingest(ctx context.Context, req IngestRequest) (JobID, error)

	// DeriveSyllabus inspects the ingested sources for a subject and proposes a
	// hierarchical topic outline. It is async on the wire (returns a JobID via
	// the queue), but the Source method returns the suggestions directly so the
	// worker can persist them as the job result.
	DeriveSyllabus(ctx context.Context, req SyllabusRequest) ([]TopicSuggestion, error)

	// GenerateQuestions drafts multiple-choice questions grounded in the
	// subject's sources. The results are drafts requiring parent approval before
	// they enter the live question bank (§6 anti-gaming).
	GenerateQuestions(ctx context.Context, req GenRequest) ([]QuestionDraft, error)

	// GenerateStudyGuide produces a grounded, citation-bearing study guide for a
	// subject (optionally scoped to a topic).
	GenerateStudyGuide(ctx context.Context, req GuideRequest) (StudyGuide, error)

	// AnswerGrounded powers the tutor chat. It streams the answer back as a
	// sequence of AnswerChunk values over the returned channel, with citations
	// attached. The channel is closed when the answer is complete (the final
	// chunk has Done set true) or when ctx is cancelled. Any setup error (for
	// example an unreachable backend) is returned synchronously and the channel
	// is nil.
	AnswerGrounded(ctx context.Context, req AskRequest) (<-chan AnswerChunk, error)
}

// IngestRequest describes a document or link to process into a subject's
// knowledge base. Exactly one of the content fields is populated: inline bytes
// (Data) with a MIMEType, a reference to already-stored content (StorageKey via
// the storage.Store), or a NotebookLM link (NotebookLMURL).
type IngestRequest struct {
	// SubjectID is the subject the ingested content belongs to.
	SubjectID string
	// Filename is the original upload name, used for display and to help the
	// backend infer the format. Optional for link ingestion.
	Filename string
	// MIMEType is the content type of Data (for example "application/pdf").
	// Empty when ingesting a NotebookLM link.
	MIMEType string
	// Data holds the raw document bytes when ingesting inline. Mutually
	// exclusive with StorageKey and NotebookLMURL.
	Data []byte
	// StorageKey references content already placed in the storage.Store, used to
	// avoid carrying large payloads through the queue. Mutually exclusive with
	// Data.
	StorageKey string
	// NotebookLMURL is a NotebookLM notebook/source link to import. Mutually
	// exclusive with Data/StorageKey.
	NotebookLMURL string
}

// SyllabusRequest scopes syllabus derivation to a subject.
type SyllabusRequest struct {
	// SubjectID is the subject whose ingested sources are analysed.
	SubjectID string
}

// GenRequest parameterises question generation grounded in a subject's sources.
type GenRequest struct {
	// SubjectID is the subject to draw source material from.
	SubjectID string
	// TopicID optionally narrows generation to a single topic; empty means the
	// whole subject.
	TopicID string
	// Count is the desired number of question drafts.
	Count int
	// Difficulty is an optional target difficulty hint (for example "easy",
	// "medium", "hard"); empty lets the backend choose a spread.
	Difficulty string
}

// GuideRequest parameterises study-guide generation (2-C02).
type GuideRequest struct {
	// SubjectID is the subject the guide covers.
	SubjectID string
	// TopicID optionally scopes the guide to a single topic; empty covers the
	// whole subject.
	TopicID string
}

// AskRequest is a single tutor turn (2-C01). The backend assembles its grounded
// answer from the subject's sources and the conversation context.
type AskRequest struct {
	// ConversationID identifies the chat thread for context continuity.
	ConversationID string
	// SubjectID scopes grounding to the subject's knowledge base.
	SubjectID string
	// TopicID optionally focuses the answer on a topic.
	TopicID string
	// Text is the student's question.
	Text string
	// SystemPrompt is the assembled tutor instruction block (syllabus + student
	// progress + per-subject TutorInstructions + parent Guidance, per 2-L01).
	// Adapters prepend it to the request to the underlying model.
	SystemPrompt string
}

// AnswerChunk is one streamed fragment of a tutor answer (SSE AnswerChunk,
// 2-C01). Deltas are concatenated in order to form the full reply; the final
// chunk has Done set true and may carry the accumulated citations.
type AnswerChunk struct {
	// Delta is the next piece of answer text. May be empty on the terminal
	// chunk.
	Delta string
	// Citations are the grounding references for the answer. They are typically
	// attached to the final chunk but adapters may surface them incrementally.
	Citations []Citation
	// Done is true on the last chunk of the stream.
	Done bool
}

// Citation grounds generated content in a specific source location (2-C01).
type Citation struct {
	// SourceID identifies the ingested source the claim is grounded in.
	SourceID string
	// Label is a human-readable reference (for example a document title).
	Label string
	// Locator pins the location within the source (for example a page or
	// section). Format is backend-defined and treated as opaque.
	Locator string
}

// TopicSuggestion is a proposed syllabus node (2-C04). Suggestions form a tree
// via Children and carry optional provenance back to the source pages they were
// derived from.
type TopicSuggestion struct {
	// Name is the proposed topic title.
	Name string
	// SourceID optionally records which ingested source this topic came from.
	SourceID string
	// PageStart and PageEnd optionally bound the source pages the topic covers.
	PageStart int
	PageEnd   int
	// Order is the topic's position among its siblings.
	Order int
	// Children are nested sub-topics.
	Children []TopicSuggestion
}

// QuestionDraft is a generated, unapproved multiple-choice question (2-C05).
// Drafts require parent approval before becoming live questions.
type QuestionDraft struct {
	// ID is the draft identifier.
	ID string
	// SubjectID is the subject the question belongs to.
	SubjectID string
	// TopicID optionally associates the question with a topic.
	TopicID string
	// Text is the question stem.
	Text string
	// Options are the answer choices, in display order.
	Options []QuestionOption
	// CorrectOptionIndex is the index into Options of the correct answer.
	CorrectOptionIndex int
	// Difficulty is the generated difficulty label.
	Difficulty string
	// Citations ground the question (and its correct answer) in source material.
	Citations []Citation
}

// QuestionOption is a single answer choice for a QuestionDraft.
type QuestionOption struct {
	// Text is the option's display text.
	Text string
}

// StudyGuide is a grounded study guide (2-C02).
type StudyGuide struct {
	// SubjectID is the subject the guide covers.
	SubjectID string
	// TopicID optionally scopes the guide to a topic.
	TopicID string
	// Markdown is the rendered guide body.
	Markdown string
	// Citations ground the guide's claims in source material.
	Citations []Citation
}
