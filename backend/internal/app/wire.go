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
	"syscall"
	"time"

	"github.com/shafqat/studyrover/backend/internal/auth"
	"github.com/shafqat/studyrover/backend/internal/config"
	httpapi "github.com/shafqat/studyrover/backend/internal/http"
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

	handler, err := buildHandler(cfg, db)
	if err != nil {
		return err
	}

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

// buildHandler assembles auth dependencies and the HTTP handler set, then mounts
// them on the chi router owned by internal/http (W02). The store is passed as the
// Store interface so the handlers depend on the contract, not the concrete pool.
func buildHandler(cfg *config.Config, db store.Store) (http.Handler, error) {
	sessions := auth.NewSessionManager(cfg.SessionSecret, cfg.RPOrigin)

	authn, err := auth.NewAuthenticator(cfg.RPID, cfg.RPOrigin, "StudyRover")
	if err != nil {
		return nil, fmt.Errorf("app: build authenticator: %w", err)
	}

	h := &httpapi.Handlers{
		Store:    db,
		Sessions: sessions,
		Auth:     authn,
	}

	return httpapi.NewRouter(h), nil
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
