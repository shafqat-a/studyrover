// Package testutil provides shared helpers for backend integration tests.
//
// The headline helper is NewDB, which hands a test an isolated, fully migrated
// PostgreSQL database backed by a pgx connection pool. Two backends are
// supported:
//
//   - If TEST_DATABASE_URL is set, that database is used directly. This is the
//     fast path for CI/dev where a Postgres is already running (for example the
//     docker-compose service from F03). The schema is (re)created by running the
//     golang-migrate migrations from db/migrations.
//   - Otherwise a throwaway Postgres container is spun up via testcontainers-go
//     and torn down when the test finishes. This keeps `go test ./...` working
//     on a machine with only Docker available and no standing database.
//
// Tests obtain a pool with NewDB, then use TruncateAll (or Truncate) between
// sub-tests to reset state without paying the cost of re-migrating.
package testutil

import (
	"context"
	"fmt"
	"os"
	"path/filepath"
	"runtime"
	"strings"
	"testing"
	"time"

	"github.com/golang-migrate/migrate/v4"
	"github.com/golang-migrate/migrate/v4/database"
	migratepgx "github.com/golang-migrate/migrate/v4/database/pgx/v5"
	_ "github.com/golang-migrate/migrate/v4/source/file" // file:// migration source
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/testcontainers/testcontainers-go"
	tcpostgres "github.com/testcontainers/testcontainers-go/modules/postgres"
	"github.com/testcontainers/testcontainers-go/wait"
)

// envTestDatabaseURL names the environment variable that, when set, points the
// test harness at an already-running PostgreSQL instance.
const envTestDatabaseURL = "TEST_DATABASE_URL"

// DB bundles a ready-to-use connection pool with the database URL it connects
// to. The embedded pool is what most tests interact with.
type DB struct {
	*pgxpool.Pool
	// URL is the connection string the pool was opened against. Useful for
	// tests that need to construct a second connection or run migrate directly.
	URL string
}

// NewDB returns an isolated, migrated database for the duration of the test.
//
// Cleanup (closing the pool and, when used, terminating the container) is
// registered via t.Cleanup, so callers do not need to tear anything down. The
// returned pool is ready for immediate use and the full migration set has been
// applied.
func NewDB(t *testing.T) *DB {
	t.Helper()

	ctx := context.Background()

	url := envOrEmpty(envTestDatabaseURL)
	if url == "" {
		url = startContainer(t, ctx)
	}

	if err := Migrate(url); err != nil {
		t.Fatalf("testutil: migrate: %v", err)
	}

	pool, err := pgxpool.New(ctx, url)
	if err != nil {
		t.Fatalf("testutil: open pool: %v", err)
	}
	t.Cleanup(pool.Close)

	if err := pool.Ping(ctx); err != nil {
		t.Fatalf("testutil: ping: %v", err)
	}

	db := &DB{Pool: pool, URL: url}

	// Start every test from a clean slate when reusing an external database.
	db.TruncateAll(t)

	return db
}

// startContainer launches a throwaway Postgres container and returns its
// connection URL. The container is terminated via t.Cleanup.
func startContainer(t *testing.T, ctx context.Context) string {
	t.Helper()

	container, err := tcpostgres.Run(ctx,
		"postgres:16-alpine",
		tcpostgres.WithDatabase("studyrover_test"),
		tcpostgres.WithUsername("studyrover"),
		tcpostgres.WithPassword("studyrover"),
		testcontainers.WithWaitStrategy(
			wait.ForLog("database system is ready to accept connections").
				WithOccurrence(2).
				WithStartupTimeout(60*time.Second),
		),
	)
	if err != nil {
		t.Skipf("testutil: no %s set and could not start Postgres container: %v", envTestDatabaseURL, err)
	}
	t.Cleanup(func() {
		if err := container.Terminate(ctx); err != nil {
			t.Logf("testutil: terminate container: %v", err)
		}
	})

	url, err := container.ConnectionString(ctx, "sslmode=disable")
	if err != nil {
		t.Fatalf("testutil: container connection string: %v", err)
	}
	return url
}

// Migrate applies every up-migration in db/migrations against the database at
// url. It is idempotent: an already-current database reports no change.
func Migrate(url string) error {
	m, err := newMigrator(url)
	if err != nil {
		return err
	}
	defer m.Close()

	if err := m.Up(); err != nil && err != migrate.ErrNoChange {
		return fmt.Errorf("migrate up: %w", err)
	}
	return nil
}

// newMigrator builds a golang-migrate instance wired to the file:// source and
// the pgx/v5 database driver. The migration directory is resolved relative to
// this source file so tests work regardless of the process working directory.
func newMigrator(url string) (*migrate.Migrate, error) {
	src := "file://" + migrationsDir()

	cfg, err := pgxConfig(url)
	if err != nil {
		return nil, err
	}

	m, err := migrate.NewWithDatabaseInstance(src, "pgx5", cfg)
	if err != nil {
		return nil, fmt.Errorf("new migrator: %w", err)
	}
	return m, nil
}

// pgxConfig opens a database/sql-style driver for golang-migrate's pgx/v5
// driver from a connection URL.
func pgxConfig(url string) (database.Driver, error) {
	d := &migratepgx.Postgres{}
	return d.Open(url)
}

// migrationsDir returns the absolute path to backend/db/migrations.
func migrationsDir() string {
	_, thisFile, _, _ := runtime.Caller(0)
	// thisFile = backend/internal/testutil/db.go
	backendDir := filepath.Dir(filepath.Dir(filepath.Dir(thisFile)))
	return filepath.Join(backendDir, "db", "migrations")
}

// TruncateAll empties every application table, resetting identity sequences and
// cascading to dependents. System tables and golang-migrate's bookkeeping
// (schema_migrations) are left intact so the schema itself is preserved.
//
// Use this between sub-tests to reset state cheaply instead of re-migrating.
func (db *DB) TruncateAll(t *testing.T) {
	t.Helper()

	ctx := context.Background()
	tables, err := db.userTables(ctx)
	if err != nil {
		t.Fatalf("testutil: list tables: %v", err)
	}
	if len(tables) == 0 {
		return
	}
	db.Truncate(t, tables...)
}

// Truncate empties the named tables in a single statement, restarting identity
// sequences and cascading to foreign-key dependents.
func (db *DB) Truncate(t *testing.T, tables ...string) {
	t.Helper()
	if len(tables) == 0 {
		return
	}

	quoted := make([]string, len(tables))
	for i, tbl := range tables {
		quoted[i] = pgQuoteIdent(tbl)
	}
	stmt := fmt.Sprintf("TRUNCATE TABLE %s RESTART IDENTITY CASCADE", strings.Join(quoted, ", "))

	if _, err := db.Exec(context.Background(), stmt); err != nil {
		t.Fatalf("testutil: truncate %v: %v", tables, err)
	}
}

// userTables returns all base tables in the public schema except golang-migrate's
// schema_migrations bookkeeping table.
func (db *DB) userTables(ctx context.Context) ([]string, error) {
	const q = `
		SELECT tablename
		FROM pg_tables
		WHERE schemaname = 'public'
		  AND tablename <> 'schema_migrations'
		ORDER BY tablename`

	rows, err := db.Query(ctx, q)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var tables []string
	for rows.Next() {
		var name string
		if err := rows.Scan(&name); err != nil {
			return nil, err
		}
		tables = append(tables, name)
	}
	return tables, rows.Err()
}

// pgQuoteIdent quotes a PostgreSQL identifier, escaping embedded double quotes.
func pgQuoteIdent(ident string) string {
	return `"` + strings.ReplaceAll(ident, `"`, `""`) + `"`
}

// envOrEmpty is a tiny indirection so the env lookup is easy to read at call
// sites and trivial to stub in the future if needed.
func envOrEmpty(key string) string {
	return strings.TrimSpace(os.Getenv(key))
}
