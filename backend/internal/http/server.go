// Package http hosts the StudyRover HTTP layer: the Handlers dependency struct
// and the chi router. A-task handler methods are attached to *Handlers across
// this package, each in its own file. W02 expands NewRouter to mount the full
// /api surface (the generated chi-server interface) behind auth middleware and to
// serve the built SPA from ./frontend/dist when present.
package http

import (
	"net/http"
	"os"
	"path/filepath"
	"strings"

	"github.com/go-chi/chi/v5"
	"github.com/go-chi/chi/v5/middleware"

	"github.com/shafqat/studyrover/backend/internal/auth"
	"github.com/shafqat/studyrover/backend/internal/contracts"
	"github.com/shafqat/studyrover/backend/internal/jobs"
	"github.com/shafqat/studyrover/backend/internal/knowledge"
	"github.com/shafqat/studyrover/backend/internal/storage"
	"github.com/shafqat/studyrover/backend/internal/store"
)

// Handlers carries the dependencies every HTTP handler needs. It is the single
// shared definition for the package; A-task handlers add methods on *Handlers in
// their own files and read these fields. The store is held as the Store
// interface so handlers depend on the contract, not the concrete pool.
//
// contracts.Unimplemented is embedded so *Handlers always satisfies the full
// generated ServerInterface: any endpoint an A-task has not implemented yet falls
// through to a 501 stub, while implemented methods on *Handlers shadow the
// embedded ones via Go method promotion. This lets HandlerFromMux compile and the
// surface grow incrementally without W02 owning the A-task files.
type Handlers struct {
	contracts.Unimplemented

	Store    store.Store
	Sessions *auth.SessionManager
	Auth     *auth.Authenticator

	// Phase-2 foundation dependencies (wired in internal/app). Handlers read
	// these for the AI tutor, async ingestion jobs, and uploaded-file storage.
	Knowledge knowledge.Source
	Jobs      *jobs.Queue
	Storage   storage.Store
}

// spaDir is the built frontend served for non-API routes (client-side routing).
const spaDir = "./frontend/dist"

// NewRouter builds the chi router: baseline middleware, a health probe, the
// generated /api surface guarded by session auth, and the SPA fallback.
func NewRouter(h *Handlers) http.Handler {
	r := chi.NewRouter()
	r.Use(middleware.RequestID)
	r.Use(middleware.RealIP)
	r.Use(middleware.Logger)
	r.Use(middleware.Recoverer)
	r.Use(corsMiddleware)

	r.Get("/healthz", func(w http.ResponseWriter, _ *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusOK)
		_, _ = w.Write([]byte(`{"status":"ok"}`))
	})

	// Mount the generated API surface under /api. The sub-router carries the
	// path-aware auth middleware so each endpoint gets the session role it
	// requires (parent by default; student for the exam loop; public for the
	// auth ceremonies). BaseURL is empty because Mount strips the /api prefix.
	api := chi.NewRouter()
	if h.Sessions != nil {
		api.Use(authMiddleware(h.Sessions))
	}
	contracts.HandlerFromMux(h, api)
	r.Mount("/api", api)

	// Everything else is the SPA (or a 404 when no build is present).
	r.NotFound(spaHandler())

	return r
}

// authMiddleware enforces the session role required by each API route, keyed by
// the request path (with the /api prefix already stripped by Mount):
//   - /auth/login, /auth/register, /auth/student  → public (no session)
//   - /attempts..., /tutor...                     → student session
//   - everything else                            → parent session
func authMiddleware(sessions *auth.SessionManager) func(http.Handler) http.Handler {
	requireParent := sessions.RequireParent
	requireStudent := sessions.RequireStudent

	return func(next http.Handler) http.Handler {
		parent := requireParent(next)
		student := requireStudent(next)

		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			path := apiPath(r)
			switch {
			case isPublicPath(path):
				next.ServeHTTP(w, r)
			case strings.HasPrefix(path, "/attempts"), strings.HasPrefix(path, "/tutor"):
				student.ServeHTTP(w, r)
			default:
				parent.ServeHTTP(w, r)
			}
		})
	}
}

// apiPath returns the request path relative to the /api mount point.
func apiPath(r *http.Request) string {
	p := r.URL.Path
	p = strings.TrimPrefix(p, "/api")
	if p == "" {
		p = "/"
	}
	return p
}

// isPublicPath reports whether the path is reachable without a session (the
// WebAuthn parent ceremonies and the student sign-in).
func isPublicPath(path string) bool {
	switch path {
	case "/auth/login", "/auth/register", "/auth/student":
		return true
	default:
		return false
	}
}

// corsMiddleware allows the dev SPA origin to call the API with credentials.
// The allowed origin echoes the request Origin so cookies (credentials: include)
// are honoured; in production the SPA is same-origin so this is a no-op.
func corsMiddleware(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		origin := r.Header.Get("Origin")
		if origin != "" {
			w.Header().Set("Access-Control-Allow-Origin", origin)
			w.Header().Set("Vary", "Origin")
			w.Header().Set("Access-Control-Allow-Credentials", "true")
			w.Header().Set("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS")
			w.Header().Set("Access-Control-Allow-Headers", "Content-Type, Authorization")
		}
		if r.Method == http.MethodOptions {
			w.WriteHeader(http.StatusNoContent)
			return
		}
		next.ServeHTTP(w, r)
	})
}

// spaHandler serves the built SPA from ./frontend/dist, falling back to
// index.html for unknown paths (client-side routing). When no build is present
// it returns 404 so the binary still runs without a frontend bundle. go:embed is
// deliberately avoided to keep the build independent of the frontend dir.
func spaHandler() http.HandlerFunc {
	index := filepath.Join(spaDir, "index.html")
	fileServer := http.FileServer(http.Dir(spaDir))

	return func(w http.ResponseWriter, r *http.Request) {
		if _, err := os.Stat(index); err != nil {
			http.NotFound(w, r)
			return
		}

		// Serve a concrete asset if it exists; otherwise hand back index.html so
		// the client router can resolve the route.
		clean := filepath.Clean(r.URL.Path)
		candidate := filepath.Join(spaDir, clean)
		if clean != "/" && clean != "." {
			if info, err := os.Stat(candidate); err == nil && !info.IsDir() {
				fileServer.ServeHTTP(w, r)
				return
			}
		}
		http.ServeFile(w, r, index)
	}
}
