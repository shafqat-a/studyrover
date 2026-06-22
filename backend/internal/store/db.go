// Package store is StudyRover's data-access layer. It combines the sqlc-generated
// type-safe query methods (emitted into this same package as querier_gen.go,
// models.go and *.sql.go) with a hand-written pgx/v5 connection pool and a small
// Store facade (store.go) that the HTTP handlers and the seed command depend on.
//
// The split of ownership is deliberate: sqlc owns the generated query code, while
// this file (and store.go) own the runtime plumbing — opening the pool from
// DATABASE_URL, exposing the generated Queries over it, and providing a
// transaction helper. There is exactly one pool per process.
package store

import (
	"context"
	"fmt"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
)

// pingTimeout bounds the initial connectivity check performed by Open so a
// misconfigured DATABASE_URL fails fast at startup instead of hanging.
const pingTimeout = 10 * time.Second

// DB wraps a pgx connection pool together with the sqlc-generated *Queries bound
// to that pool. It is the single owner of the database handle for the process:
// open it once in app.Run and Close it on shutdown.
//
// DB embeds *Queries so every generated query method (CreateSubject, GetSettings,
// …) is callable directly on a *DB value. For work that must run atomically,
// use Tx, which runs a function against a transaction-scoped *Queries.
type DB struct {
	*Queries
	// Pool is the underlying pgx connection pool. Exposed for advanced callers
	// (health checks, raw queries, the seed command) that need the pool itself.
	Pool *pgxpool.Pool
}

// Open creates a connection pool from a DATABASE_URL connection string, verifies
// connectivity with a bounded Ping, and returns a *DB that exposes the generated
// queries over the pool. The caller owns the returned *DB and must Close it.
func Open(ctx context.Context, databaseURL string) (*DB, error) {
	if databaseURL == "" {
		return nil, fmt.Errorf("store: DATABASE_URL is empty")
	}

	cfg, err := pgxpool.ParseConfig(databaseURL)
	if err != nil {
		return nil, fmt.Errorf("store: parse DATABASE_URL: %w", err)
	}

	pool, err := pgxpool.NewWithConfig(ctx, cfg)
	if err != nil {
		return nil, fmt.Errorf("store: create pool: %w", err)
	}

	pingCtx, cancel := context.WithTimeout(ctx, pingTimeout)
	defer cancel()
	if err := pool.Ping(pingCtx); err != nil {
		pool.Close()
		return nil, fmt.Errorf("store: ping: %w", err)
	}

	return NewDB(pool), nil
}

// NewDB wraps an already-open pgx pool in a *DB, binding the sqlc-generated
// queries to it. It is primarily useful in tests, which obtain a pool from
// testutil and want the generated queries over it without Open's own connection
// setup. Open is the normal startup entrypoint.
//
// It calls the generated New(DBTX) constructor; *pgxpool.Pool satisfies DBTX.
func NewDB(pool *pgxpool.Pool) *DB {
	return &DB{
		Queries: New(pool),
		Pool:    pool,
	}
}

// Close releases every connection in the pool. It is safe to call on a nil *DB
// (a no-op) so deferred cleanup in startup paths need not nil-check.
func (db *DB) Close() {
	if db == nil || db.Pool == nil {
		return
	}
	db.Pool.Close()
}

// Tx runs fn inside a database transaction, passing it a *Queries bound to that
// transaction. The transaction is committed if fn returns nil and rolled back
// otherwise (including on panic). This is the helper handlers use when a single
// request must perform several writes atomically (e.g. inserting a question and
// its options together).
func (db *DB) Tx(ctx context.Context, fn func(q *Queries) error) (err error) {
	tx, err := db.Pool.Begin(ctx)
	if err != nil {
		return fmt.Errorf("store: begin tx: %w", err)
	}

	defer func() {
		if p := recover(); p != nil {
			_ = tx.Rollback(ctx)
			panic(p)
		}
		if err != nil {
			if rbErr := tx.Rollback(ctx); rbErr != nil && rbErr != pgx.ErrTxClosed {
				err = fmt.Errorf("%w; rollback: %v", err, rbErr)
			}
		}
	}()

	if err = fn(db.Queries.WithTx(tx)); err != nil {
		return err
	}

	if err = tx.Commit(ctx); err != nil {
		return fmt.Errorf("store: commit tx: %w", err)
	}
	return nil
}
