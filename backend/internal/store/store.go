package store

import "context"

// Store is the data-access contract the HTTP handlers (A-tasks) and the seed
// command depend on. It is deliberately the seam between business code and the
// concrete pgx/sqlc implementation: handlers accept a Store, not a *DB, so they
// can be exercised against a fake in unit tests while production wires in *DB.
//
// Store embeds the sqlc-generated Querier (so every generated query method is
// part of the contract) and adds Tx for atomic multi-statement work. The
// concrete *DB returned by Open / NewDB satisfies Store; the compile-time
// assertion below guarantees it.
type Store interface {
	Querier

	// Tx runs fn inside a database transaction, passing it a transaction-scoped
	// *Queries. It commits when fn returns nil and rolls back otherwise
	// (including on panic). Use it when a single request must perform several
	// writes atomically.
	Tx(ctx context.Context, fn func(q *Queries) error) error
}

// Ensure *DB implements Store. This fails to compile if the generated Querier
// interface and *DB ever drift apart (e.g. a query is added but the pool wrapper
// no longer satisfies it), turning an integration bug into a build error.
var _ Store = (*DB)(nil)
