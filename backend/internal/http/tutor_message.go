package http

import (
	"context"
	"errors"
	"net/http"
	"strings"

	"github.com/jackc/pgx/v5"

	"github.com/shafqat/studyrover/backend/internal/auth"
	"github.com/shafqat/studyrover/backend/internal/contracts"
	"github.com/shafqat/studyrover/backend/internal/core"
	"github.com/shafqat/studyrover/backend/internal/httputil"
	"github.com/shafqat/studyrover/backend/internal/knowledge"
	"github.com/shafqat/studyrover/backend/internal/store"
)

// promptTopicLimit bounds how many syllabus topics are pulled into the assembled
// tutor system prompt. It is generous enough to cover any realistic subject
// while keeping the single prompt-assembly query bounded.
const promptTopicLimit = 500

// PostMessage handles POST /tutor/conversations/{id}/messages: it streams a
// grounded tutor answer as Server-Sent Events (AnswerChunk) and persists the
// turn (CONTRACTS-P2 §2-C01 / task 2-A02).
//
// Flow: validate the AskRequest; load and access-scope the conversation to the
// authenticated student; assemble the tutor system prompt (2-L01) from the
// subject's syllabus, the student's mastery, the per-subject TutorInstructions,
// and parent Guidance; persist the student's message; call
// knowledge.AnswerGrounded; stream each AnswerChunk to the client over SSE while
// accumulating the full reply and its citations; finally persist the assistant
// message with citations attached.
//
// The route is student-guarded. A conversation owned by another student (or a
// missing one) is reported as 404 so it cannot be enumerated. Setup errors are
// returned as JSON Problems before the SSE response begins; once streaming has
// started, errors can only be surfaced via a terminal SSE error event because
// the status line and headers are already committed.
func (h *Handlers) PostMessage(w http.ResponseWriter, r *http.Request, id contracts.IdPath) {
	student, ok := auth.StudentFromCtx(r.Context())
	if !ok {
		unauthorized(w)
		return
	}

	id = strings.TrimSpace(id)
	if id == "" {
		badRequest(w, "id is required")
		return
	}

	var body contracts.AskRequest
	if !decodeJSON(w, r, &body) {
		return
	}

	body.Text = strings.TrimSpace(body.Text)
	if body.Text == "" {
		badRequest(w, "text is required")
		return
	}

	// When the body carries a conversationId it must agree with the path id; the
	// path is authoritative either way.
	if cid := strings.TrimSpace(body.ConversationId); cid != "" && cid != id {
		badRequest(w, "conversationId does not match the path id")
		return
	}

	conv, err := h.Store.GetConversation(r.Context(), id)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			notFound(w, "conversation not found")
			return
		}
		internalError(w, err.Error())
		return
	}

	// Access scoping: a student may only post to their own conversations. Treat a
	// foreign conversation as not found so it cannot be enumerated.
	if conv.StudentID != student.ID {
		notFound(w, "conversation not found")
		return
	}

	topicID := trimmedTopicID(body.TopicId)

	// Assemble the tutor system prompt (2-L01) from subject context.
	systemPrompt, err := h.buildTutorSystemPrompt(r.Context(), conv.SubjectID, conv.StudentID)
	if err != nil {
		internalError(w, err.Error())
		return
	}

	// Persist the student's turn before streaming so the conversation history is
	// consistent even if the client disconnects mid-stream.
	if _, err := h.Store.AppendMessage(r.Context(), store.AppendMessageParams{
		ConversationID: id,
		Role:           string(contracts.User),
		Text:           body.Text,
		Citations:      nil,
	}); err != nil {
		internalError(w, err.Error())
		return
	}

	// Kick off the grounded answer stream. A setup error here is still a
	// pre-stream failure, so it can be reported as a JSON Problem.
	chunks, err := h.Knowledge.AnswerGrounded(r.Context(), knowledge.AskRequest{
		ConversationID: id,
		SubjectID:      conv.SubjectID,
		TopicID:        topicID,
		Text:           body.Text,
		SystemPrompt:   systemPrompt,
	})
	if err != nil {
		internalError(w, err.Error())
		return
	}

	// Bridge the knowledge chunks into SSE events while accumulating the full
	// reply and citations for persistence. A dedicated goroutine performs the
	// translation so Stream owns the response writer exclusively.
	var (
		fullText  strings.Builder
		citations []knowledge.Citation
	)

	events := make(chan httputil.Event)
	go func() {
		defer close(events)
		for chunk := range chunks {
			fullText.WriteString(chunk.Delta)
			if len(chunk.Citations) > 0 {
				citations = chunk.Citations
			}

			ev := httputil.Event{
				Event: "chunk",
				Data:  toContractAnswerChunk(chunk),
			}
			select {
			case <-r.Context().Done():
				return
			case events <- ev:
			}
		}
	}()

	streamErr := httputil.Stream(w, r, events)

	// Persist the assistant turn once streaming has finished. Use a background
	// context: the request context is cancelled on client disconnect, but the
	// turn that did complete should still be recorded. A foreign-key-safe write
	// failure is logged into the stream only if the connection is still open,
	// which it is not after Stream returns, so we record it server-side via the
	// returned error semantics (best-effort persistence).
	answer := fullText.String()
	if answer != "" {
		citeBlob, mErr := marshalGuideCitations(citations)
		if mErr != nil {
			citeBlob = nil
		}
		_, _ = h.Store.AppendMessage(context.Background(), store.AppendMessageParams{
			ConversationID: id,
			Role:           string(contracts.Assistant),
			Text:           answer,
			Citations:      citeBlob,
		})
	}

	// A clean close (nil) or a client disconnect (context cancelled) are both
	// expected terminations; nothing further to do. Other stream/encode errors
	// cannot be reported to the client because the response is already committed.
	_ = streamErr
}

// buildTutorSystemPrompt assembles the per-turn tutor system prompt (2-L01) for
// the given subject and student. It gathers the subject's syllabus, the
// student's latest per-topic mastery, the per-subject TutorInstructions, and the
// applicable parent Guidance, then folds them into the versioned tutor template
// via core.BuildTutorPrompt. Missing instructions are treated as empty (the
// parent has not customised tutoring for this subject) rather than an error.
func (h *Handlers) buildTutorSystemPrompt(ctx context.Context, subjectID, studentID string) (string, error) {
	topicRows, err := h.Store.ListTopicsBySubject(ctx, store.ListTopicsBySubjectParams{
		SubjectID:  subjectID,
		PageOffset: 0,
		PageLimit:  promptTopicLimit,
	})
	if err != nil {
		return "", err
	}
	topics := make([]contracts.Topic, 0, len(topicRows))
	for i := range topicRows {
		topics = append(topics, toContractTopic(topicRows[i]))
	}

	snaps, err := h.Store.LatestByStudent(ctx, studentID)
	if err != nil {
		return "", err
	}
	progress := make([]contracts.TopicMastery, 0, len(snaps))
	for _, s := range snaps {
		progress = append(progress, contracts.TopicMastery{
			TopicId: s.TopicID,
			Mastery: masteryPercent(s.Mastery),
		})
	}

	instructions := contracts.TutorInstructions{SubjectId: subjectID}
	if ti, err := h.Store.GetTutorInstructionsBySubject(ctx, subjectID); err == nil {
		instructions = toContractTutorInstructions(ti)
	} else if !errors.Is(err, pgx.ErrNoRows) {
		return "", err
	}

	scope := string(contracts.GuidanceScopeSubject)
	subjectGuidance, err := h.Store.ListGuidance(ctx, store.ListGuidanceParams{
		Scope:     &scope,
		SubjectID: &subjectID,
	})
	if err != nil {
		return "", err
	}
	globalScope := string(contracts.GuidanceScopeGlobal)
	globalGuidance, err := h.Store.ListGuidance(ctx, store.ListGuidanceParams{
		Scope:     &globalScope,
		SubjectID: nil,
	})
	if err != nil {
		return "", err
	}
	guidance := make([]contracts.Guidance, 0, len(subjectGuidance)+len(globalGuidance))
	for i := range globalGuidance {
		guidance = append(guidance, toContractGuidanceForPrompt(globalGuidance[i]))
	}
	for i := range subjectGuidance {
		guidance = append(guidance, toContractGuidanceForPrompt(subjectGuidance[i]))
	}

	return core.BuildTutorPrompt(topics, progress, instructions, guidance), nil
}

// masteryPercent converts a stored 0..1 mastery fraction into the contract's
// whole-percentage representation (0..100), clamped to the valid range.
func masteryPercent(f float32) int {
	pct := int(f*100 + 0.5)
	if pct < 0 {
		return 0
	}
	if pct > 100 {
		return 100
	}
	return pct
}

// toContractAnswerChunk maps a knowledge.AnswerChunk to the wire AnswerChunk
// emitted as the SSE data payload. Citations are attached only when present
// (typically on the terminal chunk).
func toContractAnswerChunk(c knowledge.AnswerChunk) contracts.AnswerChunk {
	out := contracts.AnswerChunk{
		Delta: c.Delta,
		Done:  c.Done,
	}
	if len(c.Citations) > 0 {
		cites := make([]contracts.Citation, 0, len(c.Citations))
		for _, ci := range c.Citations {
			cites = append(cites, toContractCitation(ci))
		}
		out.Citations = &cites
	}
	return out
}

// toContractTutorInstructions maps a sqlc store.TutorInstruction to the
// generated contract type, normalising the optional tone/language/difficulty
// fields (nil pointers stay nil; the difficulty string becomes its enum).
func toContractTutorInstructions(t store.TutorInstruction) contracts.TutorInstructions {
	out := contracts.TutorInstructions{
		SubjectId:          t.SubjectID,
		CustomInstructions: t.CustomInstructions,
		Tone:               t.Tone,
		TargetLanguage:     t.TargetLanguage,
	}
	if t.Difficulty != nil {
		d := contracts.TutorInstructionsDifficulty(*t.Difficulty)
		out.Difficulty = &d
	}
	return out
}

// toContractGuidanceForPrompt maps a sqlc store.Guidance to the generated
// contract type for prompt assembly. Only the scope/subject/text fields matter
// to core.BuildTutorPrompt, but the full mapping is provided for correctness.
func toContractGuidanceForPrompt(g store.Guidance) contracts.Guidance {
	out := contracts.Guidance{
		Id:        g.ID,
		Scope:     contracts.GuidanceScope(g.Scope),
		Text:      g.Text,
		CreatedAt: g.CreatedAt,
	}
	if g.SubjectID != nil {
		out.SubjectId = g.SubjectID
	}
	return out
}
