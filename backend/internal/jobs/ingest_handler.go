package jobs

import (
	"context"
	"encoding/json"
	"fmt"
	"io"

	"github.com/shafqat/studyrover/backend/internal/contracts"
	"github.com/shafqat/studyrover/backend/internal/knowledge"
	"github.com/shafqat/studyrover/backend/internal/storage"
	"github.com/shafqat/studyrover/backend/internal/store"
)

// maxIngestBytes bounds how much of a stored file the handler loads into memory
// to hand to the knowledge backend. It is a safety cap; the storage layer also
// enforces its own upload limit.
const maxIngestBytes = 64 << 20 // 64 MiB

// IngestPayload is the queued request for an "ingest" job (2-A05). The HTTP
// handler (POST /sources/ingest) creates the Source in the `processing` state
// and encodes this payload; the worker decodes it here and drives processing
// through the knowledge.Source seam before flipping the Source to `ready`.
type IngestPayload struct {
	// SourceID is the row to flip to ready/error once processing completes.
	SourceID string `json:"sourceId"`
	// SubjectID scopes the ingest to a subject.
	SubjectID string `json:"subjectId"`
	// Type is the source kind ("file" | "notebooklm" | "text").
	Type string `json:"type"`
	// Title is the human-readable source title (display/diagnostics).
	Title string `json:"title"`
	// FileRef is the storage ref for a `file` source (2-F07), resolved via the
	// storage.Store to the raw bytes handed to the backend.
	FileRef string `json:"fileRef,omitempty"`
	// URL is the NotebookLM link for a `notebooklm` source.
	URL string `json:"url,omitempty"`
	// Text is the inline content for a `text` source.
	Text string `json:"text,omitempty"`
}

// ingestResult is the JSON stored on the job (2-C03 Job.result) when an ingest
// completes, recording which source became ready and the backend's job id.
type ingestResult struct {
	SourceID     string `json:"sourceId"`
	Status       string `json:"status"`
	BackendJobID string `json:"backendJobId,omitempty"`
}

// IngestHandler processes "ingest" jobs (2-A05): it loads the uploaded content
// (file bytes from storage, a NotebookLM link, or inline text), runs it through
// the knowledge.Source backend (extraction/OCR/chunking/embedding), then flips
// the owning Source from `processing` to `ready`. A failure marks the job error
// (which the worker retries) and, once terminal, leaves the source recoverable.
//
// It implements the jobs.Handler interface and is registered under TypeIngest at
// wiring time (2-W04).
type IngestHandler struct {
	Knowledge knowledge.Source
	Store     store.Store
	Storage   storage.Store
}

// NewIngestHandler builds an IngestHandler over the knowledge backend, the store
// (to update the source's status) and the file storage (to resolve uploads).
func NewIngestHandler(src knowledge.Source, st store.Store, files storage.Store) *IngestHandler {
	return &IngestHandler{Knowledge: src, Store: st, Storage: files}
}

// Handle ingests the source referenced by the job payload and, on success, flips
// the source to `ready`. The returned JSON is stored as the job result.
func (h *IngestHandler) Handle(ctx context.Context, job Job, prog ProgressFunc) ([]byte, error) {
	if h.Knowledge == nil {
		return nil, fmt.Errorf("ingest: knowledge source not configured")
	}
	if h.Store == nil {
		return nil, fmt.Errorf("ingest: store not configured")
	}

	var payload IngestPayload
	if len(job.Payload) > 0 {
		if err := json.Unmarshal(job.Payload, &payload); err != nil {
			return nil, fmt.Errorf("ingest: decode payload: %w", err)
		}
	}

	subjectID := payload.SubjectID
	if subjectID == "" && job.SubjectID != nil {
		subjectID = *job.SubjectID
	}
	if subjectID == "" {
		return nil, fmt.Errorf("ingest: missing subject id")
	}
	if payload.SourceID == "" {
		return nil, fmt.Errorf("ingest: missing source id")
	}

	_ = prog(ctx, 5)

	req := knowledge.IngestRequest{
		SubjectID: subjectID,
		Filename:  payload.Title,
	}

	switch payload.Type {
	case string(contracts.SourceTypeFile):
		if payload.FileRef == "" {
			return nil, fmt.Errorf("ingest: file source missing fileRef")
		}
		if h.Storage == nil {
			return nil, fmt.Errorf("ingest: storage not configured for file source")
		}
		data, err := h.loadFile(ctx, payload.FileRef)
		if err != nil {
			return nil, fmt.Errorf("ingest: load file %q: %w", payload.FileRef, err)
		}
		req.Data = data
	case string(contracts.SourceTypeNotebooklm):
		if payload.URL == "" {
			return nil, fmt.Errorf("ingest: notebooklm source missing url")
		}
		req.NotebookLMURL = payload.URL
	case string(contracts.SourceTypeText):
		if payload.Text == "" {
			return nil, fmt.Errorf("ingest: text source missing text")
		}
		req.Data = []byte(payload.Text)
	default:
		return nil, fmt.Errorf("ingest: unknown source type %q", payload.Type)
	}

	_ = prog(ctx, 40)

	backendJobID, err := h.Knowledge.Ingest(ctx, req)
	if err != nil {
		return nil, fmt.Errorf("ingest: backend ingest: %w", err)
	}

	_ = prog(ctx, 90)

	// Flip the source to ready now that the backend has processed it.
	if err := h.setSourceStatus(ctx, payload.SourceID, string(contracts.SourceStatusReady)); err != nil {
		return nil, fmt.Errorf("ingest: mark source ready: %w", err)
	}

	result, err := json.Marshal(ingestResult{
		SourceID:     payload.SourceID,
		Status:       string(contracts.SourceStatusReady),
		BackendJobID: backendJobID.String(),
	})
	if err != nil {
		return nil, fmt.Errorf("ingest: marshal result: %w", err)
	}
	return result, nil
}

// loadFile resolves a storage ref to its raw bytes, bounded by maxIngestBytes.
func (h *IngestHandler) loadFile(ctx context.Context, ref string) ([]byte, error) {
	obj, err := h.Storage.Get(ctx, ref)
	if err != nil {
		return nil, err
	}
	defer obj.Close()

	data, err := io.ReadAll(io.LimitReader(obj, maxIngestBytes+1))
	if err != nil {
		return nil, err
	}
	if int64(len(data)) > maxIngestBytes {
		return nil, fmt.Errorf("file exceeds %d bytes", int64(maxIngestBytes))
	}
	return data, nil
}

// setSourceStatus updates a source row's status. The generated store exposes no
// dedicated query for this, so it uses the pgx pool directly via the *store.DB
// escape hatch the store documents for advanced callers needing raw queries.
func (h *IngestHandler) setSourceStatus(ctx context.Context, sourceID, status string) error {
	db, ok := h.Store.(*store.DB)
	if !ok || db.Pool == nil {
		return fmt.Errorf("ingest: store does not support raw source status update")
	}
	tag, err := db.Pool.Exec(ctx, `update source set status = $1 where id = $2`, status, sourceID)
	if err != nil {
		return err
	}
	if tag.RowsAffected() == 0 {
		return fmt.Errorf("ingest: source %q not found", sourceID)
	}
	return nil
}
