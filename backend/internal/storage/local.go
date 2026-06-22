package storage

import (
	"context"
	"crypto/sha256"
	"encoding/hex"
	"errors"
	"io"
	"os"
	"path/filepath"
	"regexp"
)

// DefaultMaxSize is the per-object size limit used when NewLocal is given a
// non-positive maxSize. 50 MiB comfortably covers textbook-sized PDFs while
// bounding disk and memory use.
const DefaultMaxSize int64 = 50 << 20 // 50 MiB

// refPattern matches a well-formed local ref: a lowercase hex SHA-256 digest
// (64 hex characters). Validating against this before touching the filesystem
// guarantees a ref can never contain "/", "..", or any other path-traversal
// payload.
var refPattern = regexp.MustCompile(`^[0-9a-f]{64}$`)

// Local is a content-addressed filesystem implementation of Store. Each object
// is named by the hex SHA-256 of its contents and sharded into a two-level
// directory tree (root/ab/cd/abcd...) to keep directory sizes manageable.
//
// Because refs are content-addressed, Put is idempotent: storing identical bytes
// repeatedly yields the same ref and leaves a single copy on disk.
//
// Local is safe for concurrent use: writes go to a temporary file and are
// atomically renamed into place, so concurrent Puts of the same content cannot
// observe a partially written object.
type Local struct {
	root    string
	maxSize int64
}

// NewLocal returns a Store backed by the directory at root, creating it if
// necessary. Objects larger than maxSize bytes are rejected with ErrTooLarge; a
// non-positive maxSize selects DefaultMaxSize.
func NewLocal(root string, maxSize int64) (*Local, error) {
	if root == "" {
		return nil, errors.New("storage: root path is required")
	}
	if maxSize <= 0 {
		maxSize = DefaultMaxSize
	}
	if err := os.MkdirAll(root, 0o755); err != nil {
		return nil, err
	}
	return &Local{root: root, maxSize: maxSize}, nil
}

// Put streams r to a temp file (hashing as it goes), enforces the size limit,
// then atomically renames the file to its content-addressed location.
func (l *Local) Put(ctx context.Context, r io.Reader) (string, error) {
	if err := ctx.Err(); err != nil {
		return "", err
	}

	tmp, err := os.CreateTemp(l.root, ".put-*.tmp")
	if err != nil {
		return "", err
	}
	tmpName := tmp.Name()
	// Best-effort cleanup of the temp file on any error path; on success the
	// file has already been renamed away so the Remove is a harmless no-op.
	committed := false
	defer func() {
		tmp.Close()
		if !committed {
			os.Remove(tmpName)
		}
	}()

	h := sha256.New()
	// LimitReader caps reads at maxSize+1 so we can distinguish "exactly at the
	// limit" from "over the limit".
	limited := io.LimitReader(r, l.maxSize+1)
	n, err := io.Copy(io.MultiWriter(tmp, h), limited)
	if err != nil {
		return "", err
	}
	if n > l.maxSize {
		return "", ErrTooLarge
	}
	if err := tmp.Sync(); err != nil {
		return "", err
	}
	if err := tmp.Close(); err != nil {
		return "", err
	}

	ref := hex.EncodeToString(h.Sum(nil))
	dst, err := l.pathFor(ref)
	if err != nil {
		return "", err
	}
	if err := os.MkdirAll(filepath.Dir(dst), 0o755); err != nil {
		return "", err
	}

	// If an object with this content already exists, the upload de-duplicates:
	// leave the existing object untouched and let the deferred cleanup discard
	// the temp file.
	if _, statErr := os.Stat(dst); statErr == nil {
		return ref, nil
	}

	if err := os.Rename(tmpName, dst); err != nil {
		return "", err
	}
	committed = true
	return ref, nil
}

// Get opens the object for ref and returns it as an *Object. The caller must
// Close the returned Object.
func (l *Local) Get(ctx context.Context, ref string) (*Object, error) {
	if err := ctx.Err(); err != nil {
		return nil, err
	}
	p, err := l.pathFor(ref)
	if err != nil {
		return nil, err
	}
	f, err := os.Open(p)
	if err != nil {
		if errors.Is(err, os.ErrNotExist) {
			return nil, ErrNotFound
		}
		return nil, err
	}
	fi, err := f.Stat()
	if err != nil {
		f.Close()
		return nil, err
	}
	return &Object{Ref: ref, Size: fi.Size(), ReadCloser: f}, nil
}

// Delete removes the object stored under ref.
func (l *Local) Delete(ctx context.Context, ref string) error {
	if err := ctx.Err(); err != nil {
		return err
	}
	p, err := l.pathFor(ref)
	if err != nil {
		return err
	}
	if err := os.Remove(p); err != nil {
		if errors.Is(err, os.ErrNotExist) {
			return ErrNotFound
		}
		return err
	}
	return nil
}

// pathFor validates ref and maps it to a safe, sharded on-disk path. It returns
// ErrInvalidRef for any ref that is not a well-formed hex digest, which prevents
// path traversal because the result can only ever live under root.
func (l *Local) pathFor(ref string) (string, error) {
	if !refPattern.MatchString(ref) {
		return "", ErrInvalidRef
	}
	return filepath.Join(l.root, ref[0:2], ref[2:4], ref), nil
}

// Local implements Store.
var _ Store = (*Local)(nil)
