// Shared HTTP helpers for the StudyRover API layer. A-task handlers MUST use
// these for JSON responses, error (RFC 7807 Problem) responses, request decoding,
// and pagination parsing — do not hand-roll equivalents (avoids duplicate symbols
// and keeps the wire format consistent with the frozen contract, CONTRACTS.md §C11).
package http

import (
	"encoding/json"
	"net/http"
	"strconv"

	"github.com/shafqat/studyrover/backend/internal/contracts"
)

const (
	defaultPage     = 1
	defaultPageSize = 50
	maxPageSize     = 200
)

// writeJSON encodes v as JSON with the given status code.
func writeJSON(w http.ResponseWriter, status int, v any) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	if v != nil {
		_ = json.NewEncoder(w).Encode(v)
	}
}

// writeProblem emits an RFC 7807-style Problem (contracts.Problem) with the
// matching HTTP status (CONTRACTS.md §C11).
func writeProblem(w http.ResponseWriter, status int, code contracts.Code, title, detail string) {
	p := contracts.Problem{
		Type:   "about:blank",
		Title:  title,
		Status: status,
		Code:   code,
	}
	if detail != "" {
		p.Detail = &detail
	}
	writeJSON(w, status, p)
}

// Convenience problem responses for the common cases.
func badRequest(w http.ResponseWriter, detail string) {
	writeProblem(w, http.StatusBadRequest, contracts.VALIDATION, "Invalid request", detail)
}
func notFound(w http.ResponseWriter, detail string) {
	writeProblem(w, http.StatusNotFound, contracts.NOTFOUND, "Not found", detail)
}
func unauthorized(w http.ResponseWriter) {
	writeProblem(w, http.StatusUnauthorized, contracts.UNAUTHORIZED, "Unauthorized", "")
}
func conflict(w http.ResponseWriter, detail string) {
	writeProblem(w, http.StatusConflict, contracts.CONFLICT, "Conflict", detail)
}
func internalError(w http.ResponseWriter, detail string) {
	writeProblem(w, http.StatusInternalServerError, contracts.INTERNAL, "Internal error", detail)
}

// decodeJSON decodes the request body into dst, rejecting unknown fields.
// Returns false (and writes a 400 Problem) when the body is invalid.
func decodeJSON(w http.ResponseWriter, r *http.Request, dst any) bool {
	dec := json.NewDecoder(r.Body)
	dec.DisallowUnknownFields()
	if err := dec.Decode(dst); err != nil {
		badRequest(w, "malformed JSON body: "+err.Error())
		return false
	}
	return true
}

// pagination parses ?page and ?pageSize with the contract defaults (1 / 50, max
// 200). Returns (limit, offset) ready for the sqlc list queries.
func pagination(r *http.Request) (page, pageSize, limit, offset int) {
	page = defaultPage
	pageSize = defaultPageSize
	if v, err := strconv.Atoi(r.URL.Query().Get("page")); err == nil && v > 0 {
		page = v
	}
	if v, err := strconv.Atoi(r.URL.Query().Get("pageSize")); err == nil && v > 0 {
		pageSize = v
	}
	if pageSize > maxPageSize {
		pageSize = maxPageSize
	}
	return page, pageSize, pageSize, (page - 1) * pageSize
}
