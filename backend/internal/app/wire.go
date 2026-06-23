// Package app composes StudyRover's backend dependencies into a runnable server.
// It is the single dependency-injection seam: config (env) → pgx pool + store →
// auth (sessions + WebAuthn) → HTTP handlers → chi router → http.Server with
// graceful shutdown. The cmd/server entrypoint (F02) calls Run and does nothing
// else, keeping main thin.
package app

import (
	"context"
	"errors"
	"fmt"
	"log"
	"net/http"
	"os"
	"os/signal"
	"path/filepath"
	"syscall"
	"time"

	"github.com/shafqat/studyrover/backend/internal/auth"
	"github.com/shafqat/studyrover/backend/internal/config"
	"github.com/shafqat/studyrover/backend/internal/contracts"
	httpapi "github.com/shafqat/studyrover/backend/internal/http"
	"github.com/shafqat/studyrover/backend/internal/jobs"
	"github.com/shafqat/studyrover/backend/internal/knowledge"
	"github.com/shafqat/studyrover/backend/internal/knowledge/fake"
	"github.com/shafqat/studyrover/backend/internal/knowledge/gemini"
	"github.com/shafqat/studyrover/backend/internal/knowledge/notebooklm"
	"github.com/shafqat/studyrover/backend/internal/knowledge/ollama"
	"github.com/shafqat/studyrover/backend/internal/storage"
	"github.com/shafqat/studyrover/backend/internal/store"
)

const (
	// openTimeout bounds opening + pinging the database pool at startup.
	openTimeout = 30 * time.Second
	// shutdownTimeout bounds the graceful drain of in-flight requests.
	shutdownTimeout = 15 * time.Second
	// readHeaderTimeout guards against slow-header (Slowloris) clients.
	readHeaderTimeout = 10 * time.Second
)

// Run loads configuration, builds every dependency, and serves HTTP until a
// SIGINT/SIGTERM is received, then shuts down gracefully. It returns the first
// error that prevents the server from running (or a non-clean shutdown).
//
// It owns the lifecycle of the resources it creates: the database pool is closed
// on the way out regardless of how Run returns.
func Run() error {
	cfg, err := config.Load()
	if err != nil {
		return err
	}

	// Root context cancelled on SIGINT/SIGTERM so startup work (pool open) and
	// the serve loop both observe the shutdown signal.
	ctx, stop := signal.NotifyContext(context.Background(), os.Interrupt, syscall.SIGTERM)
	defer stop()

	db, err := openStore(ctx, cfg.DatabaseURL)
	if err != nil {
		return err
	}
	defer db.Close()

	handler, worker, err := buildHandler(cfg, db)
	if err != nil {
		return err
	}

	// Start the job worker pool. Worker.Run blocks until ctx is cancelled (the
	// shutdown signal) and then drains in-flight jobs, so running it on a
	// goroutine bound to the root context gives a clean, signal-driven shutdown.
	go func() {
		if err := worker.Run(ctx); err != nil {
			log.Printf("app: job worker stopped: %v", err)
		}
	}()

	return serve(ctx, cfg, handler)
}

// openStore opens the single pgx pool and returns the store facade over it.
func openStore(ctx context.Context, databaseURL string) (*store.DB, error) {
	openCtx, cancel := context.WithTimeout(ctx, openTimeout)
	defer cancel()

	db, err := store.Open(openCtx, databaseURL)
	if err != nil {
		return nil, fmt.Errorf("app: open store: %w", err)
	}
	return db, nil
}

// defaultStorageSubdir is the directory name appended to os.TempDir() for
// uploaded source files when no STORAGE_DIR is configured.
const defaultStorageSubdir = "studyrover-files"

// buildHandler assembles auth dependencies, the Phase-2 foundation infra
// (storage, job queue, knowledge backend, job worker), and the HTTP handler set,
// then mounts them on the chi router owned by internal/http (W02). The store is
// passed as the Store interface so the handlers depend on the contract, not the
// concrete pool. It returns the constructed *jobs.Worker so Run can start it on a
// goroutine and stop it on shutdown; no job handlers are registered yet.
func buildHandler(cfg *config.Config, db store.Store) (http.Handler, *jobs.Worker, error) {
	sessions := auth.NewSessionManager(cfg.SessionSecret, cfg.RPOrigin)

	authn, err := auth.NewAuthenticator(cfg.RPID, cfg.RPOrigin, "StudyRover")
	if err != nil {
		return nil, nil, fmt.Errorf("app: build authenticator: %w", err)
	}

	// Local-filesystem object store for uploaded sources. Default to a temp dir
	// when no STORAGE_DIR is configured so the binary runs without extra setup.
	storageDir := cfg.StorageDir
	if storageDir == "" {
		storageDir = filepath.Join(os.TempDir(), defaultStorageSubdir)
	}
	files, err := storage.NewLocal(storageDir, 0)
	if err != nil {
		return nil, nil, fmt.Errorf("app: build storage: %w", err)
	}

	// Knowledge backend selected at wiring time. The adapters are constructed
	// unconditionally and injected into the selector; a missing Gemini key /
	// NotebookLM endpoint leaves those adapters unprovisioned, and New falls back
	// to the deterministic fake. The ACTIVE backend is read from the stored
	// (parent-set) settings — changing it takes effect on restart — defaulting to
	// NotebookLM when settings are unset.
	backend := contracts.KnowledgeBackendNotebooklm
	if set, err := db.GetSettings(context.Background()); err == nil && set.KnowledgeBackend != "" {
		backend = contracts.KnowledgeBackend(set.KnowledgeBackend)
	}
	knowledgeSrc := knowledge.New(
		contracts.Settings{KnowledgeBackend: backend},
		knowledge.Config{
			Gemini:     gemini.New(gemini.Config{APIKey: cfg.GeminiAPIKey, Model: cfg.GeminiModel}),
			NotebookLM: notebooklm.New(notebooklm.Config{}),
			Ollama:     ollama.New(ollama.Config{APIKey: cfg.OllamaAPIKey, BaseURL: cfg.OllamaBaseURL, Model: cfg.OllamaModel}),
			Fake:       fake.New(0),
		},
	)

	// Postgres-backed job queue and its draining worker. The registry maps each
	// Phase-2 job type to the feature handler that processes it, wired with the
	// deps each handler needs (knowledge source, store, storage). Registering the
	// handlers before the worker starts ensures enqueued jobs are actually
	// processed rather than failing as an unknown type.
	queue := jobs.NewQueue(db)
	registry := jobs.NewRegistry()
	registry.Register(jobs.TypeIngest, jobs.NewIngestHandler(knowledgeSrc, db, files))
	registry.Register(jobs.TypeSyllabus, jobs.NewSyllabusHandler(knowledgeSrc))
	registry.Register(jobs.TypeQuestions, jobs.NewQuestionGenHandler(knowledgeSrc, db))
	worker := jobs.NewWorker(queue, registry, jobs.Config{})

	h := &httpapi.Handlers{
		Store:     db,
		Sessions:  sessions,
		Auth:      authn,
		Knowledge: knowledgeSrc,
		Jobs:      queue,
		Storage:   files,
	}

	return httpapi.NewRouter(h), worker, nil
}

// serve runs the HTTP server until ctx is cancelled (shutdown signal) or the
// listener fails, then drains in-flight requests within shutdownTimeout.
func serve(ctx context.Context, cfg *config.Config, handler http.Handler) error {
	srv := &http.Server{
		Addr:              cfg.Addr(),
		Handler:           handler,
		ReadHeaderTimeout: readHeaderTimeout,
	}

	errCh := make(chan error, 1)
	go func() {
		log.Printf("app: listening on %s (rp_id=%s)", cfg.Addr(), cfg.RPID)
		if err := srv.ListenAndServe(); err != nil && !errors.Is(err, http.ErrServerClosed) {
			errCh <- err
			return
		}
		errCh <- nil
	}()

	select {
	case err := <-errCh:
		return err
	case <-ctx.Done():
		log.Print("app: shutdown signal received")
	}

	shutdownCtx, cancel := context.WithTimeout(context.Background(), shutdownTimeout)
	defer cancel()
	if err := srv.Shutdown(shutdownCtx); err != nil {
		return fmt.Errorf("app: graceful shutdown: %w", err)
	}
	log.Print("app: stopped")
	return nil
}
