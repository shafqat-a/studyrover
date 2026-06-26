// Package storage persists uploaded source files (PDFs, Word docs, plain text,
// images for OCR) and resolves the opaque "fileRef" strings that the rest of the
// system passes around. Phase-2 ingestion (the knowledge.Source adapters and the
// jobs worker) stores an uploaded file once via [Store.Put], records the returned
// ref on the source/job, then later streams the bytes back via [Store.Get].
//
// # The Store seam
//
// Storage lives behind the [Store] interface so the backend is swappable: the
// Phase-2 default is a content-addressed local filesystem ([NewLocal]); an
// S3-compatible impl can be added later behind the same interface without
// touching callers. Handlers and jobs depend only on [Store], never on a
// concrete backend.
//
// # Refs are opaque and content-addressed
//
// A ref returned by [Store.Put] is an opaque token; callers must treat it as
// such and never construct one by hand. The local impl makes refs
// content-addressed (the SHA-256 of the bytes), so identical uploads de-duplicate
// to the same ref and a ref can be validated/sharded into a safe on-disk path
// with no filesystem traversal risk.
package storage

import (
	"context"
	"errors"
	"io"
)

// Errors returned by Store implementations. Callers should compare with
// errors.Is rather than matching on strings.
var (
	// ErrNotFound is returned by Get and Delete when no object exists for the
	// given ref.
	ErrNotFound = errors.New("storage: object not found")

	// ErrInvalidRef is returned when a ref is malformed (empty, wrong length, or
	// containing characters that are not part of a well-formed ref). This guards
	// against path-traversal and similar attacks.
	ErrInvalidRef = errors.New("storage: invalid ref")

	// ErrTooLarge is returned by Put when the input exceeds the configured size
	// limit.
	ErrTooLarge = errors.New("storage: object exceeds size limit")
)

// Object carries the bytes of a stored file plus the metadata callers need to
// serve or process it. Callers must Close the embedded reader.
type Object struct {
	// Ref is the opaque, content-addressed identifier of this object.
	Ref string
	// Size is the length of the content in bytes.
	Size int64
	// ReadCloser streams the content. The caller owns it and must Close it.
	io.ReadCloser
}

// Store persists opaque blobs and resolves them by ref. Implementations must be
// safe for concurrent use by multiple goroutines.
//
// The interface is intentionally minimal — Put/Get/Delete round-trip — so that
// alternative backends (local FS now, S3 later) are easy to provide.
type Store interface {
	// Put reads all bytes from r and stores them, returning an opaque ref that
	// can later be passed to Get or Delete. Implementations may content-address
	// the data, in which case storing identical bytes twice yields the same ref.
	// Put returns ErrTooLarge if the content exceeds the backend's size limit.
	Put(ctx context.Context, r io.Reader) (ref string, err error)

	// Get resolves ref and returns an Object whose ReadCloser streams the stored
	// bytes. The caller must Close the returned Object. Get returns
	// ErrInvalidRef for a malformed ref and ErrNotFound if nothing is stored
	// under a well-formed ref.
	Get(ctx context.Context, ref string) (*Object, error)

	// Delete removes the object stored under ref. Delete returns ErrInvalidRef
	// for a malformed ref and ErrNotFound if nothing is stored under a
	// well-formed ref.
	Delete(ctx context.Context, ref string) error
}
