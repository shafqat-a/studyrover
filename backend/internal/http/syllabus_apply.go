package http

import (
	"errors"
	"net/http"
	"strings"

	"github.com/jackc/pgx/v5"

	"github.com/shafqat/studyrover/backend/internal/auth"
	"github.com/shafqat/studyrover/backend/internal/contracts"
	"github.com/shafqat/studyrover/backend/internal/core"
	"github.com/shafqat/studyrover/backend/internal/store"
)

// ApplySyllabus handles POST /subjects/{id}/syllabus/apply (2-A08, CONTRACTS-P2
// §2-C04/§2-A08). It materializes a (possibly parent-edited) suggested topic
// tree into real Topics for the subject.
//
// The recursive TopicSuggestion tree is flattened and ordered by core's
// NormalizeSyllabus (2-L04): depth-first, parent-before-children, with a single
// global zero-based Order. Each normalized topic is stamped with the path
// subject id and bulk-inserted inside one transaction so the apply is atomic —
// either every new topic lands or none do.
//
// The operation is idempotent-ish: topics whose (case-insensitive, trimmed)
// name already exists for the subject are skipped rather than re-created, so
// re-applying an edited syllabus does not duplicate previously-applied topics.
// Created topics are returned in syllabus order. Parent-guarded.
func (h *Handlers) ApplySyllabus(w http.ResponseWriter, r *http.Request, id contracts.IdPath) {
	if _, ok := auth.ParentFromCtx(r.Context()); !ok {
		unauthorized(w)
		return
	}

	subjectID := strings.TrimSpace(id)
	if subjectID == "" {
		badRequest(w, "subject id is required")
		return
	}

	var body contracts.ApplySyllabusRequest
	if !decodeJSON(w, r, &body) {
		return
	}

	// The subject must exist before we attach topics to it.
	if _, err := h.Store.GetSubject(r.Context(), subjectID); err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			notFound(w, "subject not found")
			return
		}
		internalError(w, err.Error())
		return
	}

	// Validate the suggestion tree: every node must carry a non-empty name.
	if !validSuggestions(body.Topics) {
		badRequest(w, "every topic must have a non-empty name")
		return
	}

	// Flatten the (possibly nested, possibly parent-edited) tree into an ordered,
	// flat list of CreateTopic shapes (2-L04). Order is reassigned globally.
	normalized := core.NormalizeSyllabus(body.Topics)

	// Build a set of names already present for this subject so re-applying a
	// syllabus skips topics that were applied before (idempotent-ish, dedupe by
	// case-insensitive trimmed name).
	existing, err := h.Store.ListTopicsBySubject(r.Context(), store.ListTopicsBySubjectParams{
		SubjectID:  subjectID,
		PageOffset: 0,
		PageLimit:  int32(maxApplyTopics),
	})
	if err != nil {
		internalError(w, err.Error())
		return
	}
	seen := make(map[string]struct{}, len(existing))
	for i := range existing {
		seen[dedupeKey(existing[i].Name)] = struct{}{}
	}

	// Bulk-create the new topics atomically, in syllabus order, skipping any that
	// collide (within the existing set or with an earlier sibling in this batch).
	created := make([]contracts.Topic, 0, len(normalized))
	txErr := h.Store.Tx(r.Context(), func(q *store.Queries) error {
		for i := range normalized {
			ct := normalized[i]
			key := dedupeKey(ct.Name)
			if _, dup := seen[key]; dup {
				continue
			}
			seen[key] = struct{}{}

			var order int32
			if ct.Order != nil {
				order = *ct.Order
			}

			topic, err := q.CreateTopic(r.Context(), store.CreateTopicParams{
				SubjectID: subjectID,
				Name:      ct.Name,
				SourceID:  ct.SourceId,
				PageStart: ct.PageStart,
				PageEnd:   ct.PageEnd,
				SortOrder: order,
				Active:    nil, // COALESCE($7, true): nil -> active = true
			})
			if err != nil {
				return err
			}
			created = append(created, toContractTopic(topic))
		}
		return nil
	})
	if txErr != nil {
		internalError(w, txErr.Error())
		return
	}

	writeJSON(w, http.StatusOK, contracts.ApplySyllabus200JSONResponse(created))
}

// maxApplyTopics bounds how many existing topics we load for dedupe. The
// syllabus for a single subject is small; this cap keeps the lookup bounded.
const maxApplyTopics = 1000

// validSuggestions reports whether every node in the suggestion tree carries a
// non-empty (after trimming) name, recursing into children.
func validSuggestions(nodes []contracts.TopicSuggestion) bool {
	for i := range nodes {
		if strings.TrimSpace(nodes[i].Name) == "" {
			return false
		}
		if nodes[i].Children != nil && !validSuggestions(*nodes[i].Children) {
			return false
		}
	}
	return true
}

// dedupeKey normalizes a topic name for case-insensitive, whitespace-insensitive
// duplicate detection.
func dedupeKey(name string) string {
	return strings.ToLower(strings.TrimSpace(name))
}
