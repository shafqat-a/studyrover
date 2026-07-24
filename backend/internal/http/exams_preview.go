package http

import (
	"errors"
	"net/http"

	"github.com/jackc/pgx/v5"

	"github.com/shafqat/studyrover/backend/internal/auth"
	"github.com/shafqat/studyrover/backend/internal/contracts"
)

// PreviewExam handles GET /exam-definitions/{id}/preview: it assembles the exam
// exactly as a student attempt would (pinned or scoped/shuffled) but keeps the
// answer key, so a parent can sit and self-check the exam ad-hoc from the parent
// view — no student account, saved attempt, cooldown or reward. Parent-guarded.
func (h *Handlers) PreviewExam(w http.ResponseWriter, r *http.Request, id contracts.IdPath) {
	if _, ok := auth.ParentFromCtx(r.Context()); !ok {
		unauthorized(w)
		return
	}

	def, err := h.Store.GetExamDefinition(r.Context(), id)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			notFound(w, "exam definition not found")
			return
		}
		internalError(w, err.Error())
		return
	}

	questions, err := h.assembleExamQuestions(r.Context(), examDefToContract(def))
	if err != nil {
		internalError(w, err.Error())
		return
	}
	if questions == nil {
		questions = []contracts.Question{}
	}

	writeJSON(w, http.StatusOK, contracts.ExamPreview{Questions: questions})
}
