package auth

import (
	"encoding/json"
	"net/http"
)

// problem is an RFC-7807-style error body matching the frozen contract shape
// (C11 Problem: { type, title, status, detail?, code }). It is written locally
// here so the auth middleware has no dependency on the generated handlers; the
// JSON field names match the generated Problem exactly.
type problem struct {
	Type   string `json:"type"`
	Title  string `json:"title"`
	Status int    `json:"status"`
	Detail string `json:"detail,omitempty"`
	Code   string `json:"code"`
}

// unauthorizedProblem is the canonical 401 body returned when a required
// session is missing or invalid. Code mirrors the C11 Code enum (UNAUTHORIZED).
func unauthorizedProblem(detail string) problem {
	return problem{
		Type:   "about:blank",
		Title:  "Unauthorized",
		Status: http.StatusUnauthorized,
		Detail: detail,
		Code:   "UNAUTHORIZED",
	}
}

// writeUnauthorized emits a 401 Problem response.
func writeUnauthorized(w http.ResponseWriter, detail string) {
	w.Header().Set("Content-Type", "application/problem+json")
	w.WriteHeader(http.StatusUnauthorized)
	_ = json.NewEncoder(w).Encode(unauthorizedProblem(detail))
}

// RequireParent is chi middleware that requires a valid parent session. On
// success it injects the parent identity into the request context (retrievable
// via ParentFromCtx); otherwise it returns 401 with a Problem body and does not
// call the next handler.
func (m *SessionManager) RequireParent(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		id, err := m.Read(r)
		if err != nil || id.Role != RoleParent {
			writeUnauthorized(w, "parent session required")
			return
		}
		next.ServeHTTP(w, r.WithContext(withParent(r.Context(), id)))
	})
}

// RequireStudent is chi middleware that requires a valid student session. On
// success it injects the student identity into the request context (retrievable
// via StudentFromCtx); otherwise it returns 401 with a Problem body.
func (m *SessionManager) RequireStudent(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		id, err := m.Read(r)
		if err != nil || id.Role != RoleStudent {
			writeUnauthorized(w, "student session required")
			return
		}
		next.ServeHTTP(w, r.WithContext(withStudent(r.Context(), id)))
	})
}

// RequireAny authenticates a session of EITHER role and injects the matching
// identity into the context (recoverable via ParentFromCtx or StudentFromCtx).
// It does NOT authorize — handlers decide which role(s) an endpoint accepts.
// Returns 401 when no valid session is present.
func (m *SessionManager) RequireAny(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		id, err := m.Read(r)
		if err != nil {
			writeUnauthorized(w, "session required")
			return
		}
		switch id.Role {
		case RoleParent:
			next.ServeHTTP(w, r.WithContext(withParent(r.Context(), id)))
		case RoleStudent:
			next.ServeHTTP(w, r.WithContext(withStudent(r.Context(), id)))
		default:
			writeUnauthorized(w, "session required")
		}
	})
}
