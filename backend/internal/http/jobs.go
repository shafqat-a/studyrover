package http

import (
	"encoding/json"
	"errors"
	"net/http"

	"github.com/jackc/pgx/v5"

	"github.com/shafqat/studyrover/backend/internal/auth"
	"github.com/shafqat/studyrover/backend/internal/contracts"
	"github.com/shafqat/studyrover/backend/internal/jobs"
)

// GetJob handles GET /jobs/{id}: returns the current status, progress, result and
// error of a single async job (contract 2-C03). Parents poll this endpoint while
// an ingest/syllabus/questions job progresses through queued → processing →
// ready|error. Returns a 404 Problem when the job does not exist. Parent-guarded.
func (h *Handlers) GetJob(w http.ResponseWriter, r *http.Request, id contracts.IdPath) {
	if _, ok := auth.ParentFromCtx(r.Context()); !ok {
		unauthorized(w)
		return
	}

	job, err := h.Jobs.Get(r.Context(), id)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			notFound(w, "job not found")
			return
		}
		internalError(w, err.Error())
		return
	}

	writeJSON(w, http.StatusOK, toContractJob(job))
}

// ListJobs handles GET /jobs: a parent-guarded, paginated list of async jobs,
// newest first, optionally scoped to a single subject via ?subjectId (contract
// 2-C03). Parent-guarded.
func (h *Handlers) ListJobs(w http.ResponseWriter, r *http.Request, params contracts.ListJobsParams) {
	if _, ok := auth.ParentFromCtx(r.Context()); !ok {
		unauthorized(w)
		return
	}

	page, pageSize, limit, offset := pagination(r)

	rows, err := h.Jobs.List(r.Context(), params.SubjectId, int32(limit), int32(offset))
	if err != nil {
		internalError(w, err.Error())
		return
	}

	items := make([]contracts.Job, 0, len(rows))
	for i := range rows {
		items = append(items, toContractJob(rows[i]))
	}

	// No COUNT query exists for jobs; report a lower-bound total derived from the
	// current window so the page metadata stays consistent (offset + items on
	// this page).
	total := offset + len(items)

	writeJSON(w, http.StatusOK, contracts.PageOfJob{
		Items:    items,
		Total:    total,
		Page:     page,
		PageSize: pageSize,
	})
}

// toContractJob maps a sqlc store.Job (aliased as jobs.Job) to the generated
// contracts.Job (contract 2-C03). It is the shared mapper for every job-surfacing
// endpoint (2-A06 here, plus the job-creating 2-A05/2-A07/2-A09 responses). Both
// sides use string ids; the store's nullable subject is *string while the contract
// carries SubjectId as a bare string (jobs are always created scoped to a subject,
// so a missing value maps to ""). Status and Type are constrained string enums on
// the contract. Result is the raw jsonb payload, decoded into the contract's open
// object shape only when present and object-shaped.
func toContractJob(j jobs.Job) contracts.Job {
	out := contracts.Job{
		Id:        j.ID,
		Type:      contracts.JobType(j.Type),
		Status:    contracts.JobStatus(j.Status),
		Progress:  int(j.Progress),
		Error:     j.Error,
		CreatedAt: j.CreatedAt,
		UpdatedAt: j.UpdatedAt,
	}
	if j.SubjectID != nil {
		out.SubjectId = *j.SubjectID
	}
	if len(j.Result) > 0 {
		var m map[string]interface{}
		if err := json.Unmarshal(j.Result, &m); err == nil && m != nil {
			out.Result = &m
		}
	}
	return out
}
