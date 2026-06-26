package http

import (
	"encoding/json"
	"errors"
	"net/http"
	"strings"

	"github.com/jackc/pgx/v5"

	"github.com/shafqat/studyrover/backend/internal/auth"
	"github.com/shafqat/studyrover/backend/internal/contracts"
	"github.com/shafqat/studyrover/backend/internal/knowledge"
	"github.com/shafqat/studyrover/backend/internal/store"
)

// GenerateStudyGuide handles POST /subjects/{id}/study-guide: it calls the
// knowledge backend to compose a grounded, citation-bearing study guide (2-L02),
// upserts it for the (subject, topic) pair, and returns the persisted guide
// (CONTRACTS-P2 §2-C02 / API 2-A04). Accessible to an authenticated parent or
// student session.
func (h *Handlers) GenerateStudyGuide(w http.ResponseWriter, r *http.Request, id contracts.IdPath) {
	if !sessionPresent(r) {
		unauthorized(w)
		return
	}

	// The body is optional; when present it may carry a topic scope. The path id
	// is authoritative for the subject, so a mismatched body subjectId is a 400.
	var body contracts.GuideRequest
	if r.Body != nil && r.ContentLength != 0 {
		if !decodeJSON(w, r, &body) {
			return
		}
		if body.SubjectId != "" && body.SubjectId != id {
			badRequest(w, "body subjectId does not match path id")
			return
		}
	}

	topicID := trimmedTopicID(body.TopicId)

	// Confirm the subject exists so generation against a missing subject yields a
	// 404 envelope rather than a backend error.
	if _, err := h.Store.GetSubject(r.Context(), id); err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			notFound(w, "subject not found")
			return
		}
		internalError(w, err.Error())
		return
	}

	guide, err := h.Knowledge.GenerateStudyGuide(r.Context(), knowledge.GuideRequest{
		SubjectID: id,
		TopicID:   topicID,
	})
	if err != nil {
		internalError(w, err.Error())
		return
	}

	citations, err := marshalGuideCitations(guide.Citations)
	if err != nil {
		internalError(w, err.Error())
		return
	}

	var saved store.StudyGuide
	if topicID == "" {
		saved, err = h.Store.UpsertSubjectStudyGuide(r.Context(), store.UpsertSubjectStudyGuideParams{
			SubjectID: id,
			Markdown:  guide.Markdown,
			Citations: citations,
		})
	} else {
		tid := topicID
		saved, err = h.Store.UpsertStudyGuide(r.Context(), store.UpsertStudyGuideParams{
			SubjectID: id,
			TopicID:   &tid,
			Markdown:  guide.Markdown,
			Citations: citations,
		})
	}
	if err != nil {
		internalError(w, err.Error())
		return
	}

	out, err := toContractStudyGuide(saved)
	if err != nil {
		internalError(w, err.Error())
		return
	}

	writeJSON(w, http.StatusOK, out)
}

// GetStudyGuide handles GET /subjects/{id}/study-guide: it returns the cached
// guide for the (subject, optional topic) pair, or a 404 when none has been
// generated yet (CONTRACTS-P2 §2-C02 / API 2-A04). Accessible to an
// authenticated parent or student session.
func (h *Handlers) GetStudyGuide(w http.ResponseWriter, r *http.Request, id contracts.IdPath, params contracts.GetStudyGuideParams) {
	if !sessionPresent(r) {
		unauthorized(w)
		return
	}

	topicID := trimmedTopicID(params.TopicId)

	arg := store.GetStudyGuideParams{SubjectID: id}
	if topicID != "" {
		tid := topicID
		arg.TopicID = &tid
	}

	saved, err := h.Store.GetStudyGuide(r.Context(), arg)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			notFound(w, "study guide not found")
			return
		}
		internalError(w, err.Error())
		return
	}

	out, err := toContractStudyGuide(saved)
	if err != nil {
		internalError(w, err.Error())
		return
	}

	writeJSON(w, http.StatusOK, out)
}

// sessionPresent reports whether the request carries an authenticated parent or
// student session. Study-guide endpoints are usable by either role: a parent
// curating material or a student reading it.
func sessionPresent(r *http.Request) bool {
	if _, ok := auth.ParentFromCtx(r.Context()); ok {
		return true
	}
	_, ok := auth.StudentFromCtx(r.Context())
	return ok
}

// trimmedTopicID normalises an optional topic id pointer to a trimmed string,
// treating a nil pointer or whitespace-only value as "no topic" (subject-level).
func trimmedTopicID(p *string) string {
	if p == nil {
		return ""
	}
	return strings.TrimSpace(*p)
}

// marshalGuideCitations encodes the backend citations into the JSONB column
// shape persisted by the store, normalising the optional locator.
func marshalGuideCitations(cs []knowledge.Citation) ([]byte, error) {
	items := make([]contracts.Citation, 0, len(cs))
	for _, c := range cs {
		items = append(items, toContractCitation(c))
	}
	return json.Marshal(items)
}

// toContractCitation maps a knowledge.Citation to the generated contract type,
// omitting an empty locator.
func toContractCitation(c knowledge.Citation) contracts.Citation {
	out := contracts.Citation{
		SourceId: c.SourceID,
		Label:    c.Label,
	}
	if c.Locator != "" {
		loc := c.Locator
		out.Locator = &loc
	}
	return out
}

// toContractStudyGuide maps a stored study guide row to the contract type,
// decoding the JSONB citations column.
func toContractStudyGuide(s store.StudyGuide) (contracts.StudyGuide, error) {
	citations := []contracts.Citation{}
	if len(s.Citations) > 0 {
		if err := json.Unmarshal(s.Citations, &citations); err != nil {
			return contracts.StudyGuide{}, err
		}
	}

	return contracts.StudyGuide{
		Id:          s.ID,
		SubjectId:   s.SubjectID,
		TopicId:     s.TopicID,
		Markdown:    s.Markdown,
		Citations:   citations,
		GeneratedAt: s.GeneratedAt,
	}, nil
}
