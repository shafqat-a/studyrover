package http

import (
	"errors"
	"net/http"
	"strings"

	"github.com/jackc/pgx/v5"

	"github.com/shafqat/studyrover/backend/internal/auth"
	"github.com/shafqat/studyrover/backend/internal/contracts"
	"github.com/shafqat/studyrover/backend/internal/jobs"
	"github.com/shafqat/studyrover/backend/internal/store"
)

// IngestSource handles POST /sources/ingest (2-A05): the Phase-2 asynchronous
// upgrade of source creation. It persists a new Source in the `processing`
// state, then enqueues an "ingest" job that the worker drains via the ingest job
// handler (jobs/ingest_handler.go) — OCR/extraction runs through the
// knowledge.Source seam and flips the Source to `ready` (or `error`) on
// completion. The endpoint returns 202 with the queued Job (contract 2-C03); the
// parent polls GET /jobs/{id} (2-A06) until it is ready.
//
// This replaces the Phase-1 synchronous create path (POST /sources) for `file`
// and `notebooklm` sources, which require backend processing. Inline `text`
// sources carry no external content, so they are still created immediately
// ready; the enqueued job is a no-op that completes at once for wire consistency.
//
// Parent-guarded: the default auth middleware requires a parent session, and the
// context check keeps the handler safe (401) in isolation.
func (h *Handlers) IngestSource(w http.ResponseWriter, r *http.Request) {
	if _, ok := auth.ParentFromCtx(r.Context()); !ok {
		unauthorized(w)
		return
	}

	var body contracts.CreateSource
	if !decodeJSON(w, r, &body) {
		return
	}

	body.SubjectId = strings.TrimSpace(body.SubjectId)
	if body.SubjectId == "" {
		badRequest(w, "subjectId is required")
		return
	}

	body.Title = strings.TrimSpace(body.Title)
	if body.Title == "" {
		badRequest(w, "title is required")
		return
	}

	if !validSourceType(body.Type) {
		badRequest(w, "type must be one of: file, notebooklm, text")
		return
	}

	// Validate the per-type content so the worker is never handed a job it cannot
	// process. file → fileRef (a 2-F07 storage ref), notebooklm → url, text →
	// inline text.
	switch body.Type {
	case contracts.SourceTypeFile:
		if body.FileRef == nil || strings.TrimSpace(*body.FileRef) == "" {
			badRequest(w, "fileRef is required for a file source")
			return
		}
	case contracts.SourceTypeNotebooklm:
		if body.Url == nil || strings.TrimSpace(*body.Url) == "" {
			badRequest(w, "url is required for a notebooklm source")
			return
		}
	case contracts.SourceTypeText:
		if body.Text == nil || strings.TrimSpace(*body.Text) == "" {
			badRequest(w, "text is required for a text source")
			return
		}
	}

	// Confirm the subject exists so we fail fast (404) rather than persisting a
	// source and enqueueing a job the worker would only reject later.
	if _, err := h.Store.GetSubject(r.Context(), body.SubjectId); err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			notFound(w, "subject not found")
			return
		}
		internalError(w, err.Error())
		return
	}

	// Persist the source in the processing state; the ingest job flips it to
	// ready/error once the knowledge backend finishes.
	src, err := h.Store.CreateSource(r.Context(), store.CreateSourceParams{
		SubjectID: body.SubjectId,
		Type:      string(body.Type),
		Title:     body.Title,
		Status:    string(contracts.SourceStatusProcessing),
		FileRef:   body.FileRef,
		Url:       body.Url,
		Text:      body.Text,
	})
	if err != nil {
		internalError(w, err.Error())
		return
	}

	subjectID := src.SubjectID
	payload := jobs.IngestPayload{
		SourceID:  src.ID,
		SubjectID: src.SubjectID,
		Type:      src.Type,
		Title:     src.Title,
	}
	if src.FileRef != nil {
		payload.FileRef = *src.FileRef
	}
	if src.Url != nil {
		payload.URL = *src.Url
	}
	if src.Text != nil {
		payload.Text = *src.Text
	}

	job, err := h.Jobs.Enqueue(r.Context(), jobs.EnqueueParams{
		Type:      jobs.TypeIngest,
		SubjectID: &subjectID,
		Payload:   payload,
	})
	if err != nil {
		internalError(w, err.Error())
		return
	}

	// toContractJob (2-A06, jobs.go) maps the queued store.Job to the contract.
	writeJSON(w, http.StatusAccepted, toContractJob(job))
}
