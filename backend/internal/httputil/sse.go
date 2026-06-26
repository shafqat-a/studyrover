// Package httputil holds small, reusable HTTP transport helpers that sit between
// the net/http layer and the rest of the backend. It contains no business logic
// and no database access; it only deals with the mechanics of speaking HTTP.
//
// The headline helper is [Stream], a Server-Sent Events (SSE) writer used to
// stream AI tutor answers (2-A02) and, optionally, async job progress (2-A06)
// to clients incrementally.
package httputil

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"net/http"
	"time"
)

// DefaultHeartbeatInterval is how often [Stream] emits an SSE comment line to
// keep idle connections (and intermediary proxies) alive when no events are
// flowing. A zero or negative interval in [StreamOptions] disables heartbeats.
const DefaultHeartbeatInterval = 15 * time.Second

// ErrStreamUnsupported is returned by [Stream] when the supplied
// http.ResponseWriter cannot be flushed, which is required for SSE: each event
// must be pushed to the client immediately rather than buffered.
var ErrStreamUnsupported = errors.New("httputil: response writer does not support flushing")

// Event is a single Server-Sent Event. Data is JSON-encoded and written as the
// event's `data:` field; the other fields are optional SSE metadata.
//
// For the tutor stream, Data is a contracts.AnswerChunk; for job progress it is
// a contracts.Job. Callers may set Event to namespace client-side listeners
// (e.g. "chunk", "progress", "error") and ID to support Last-Event-ID resume.
type Event struct {
	// Data is the event payload. It is marshalled to JSON and emitted as the
	// SSE `data:` field. It must be non-nil and JSON-serialisable.
	Data any

	// Event is the optional SSE event name (the `event:` field). When empty,
	// clients receive the default "message" event.
	Event string

	// ID is the optional SSE event id (the `id:` field). When empty, no id
	// line is written.
	ID string

	// Retry, when > 0, sets the client's reconnection time in milliseconds
	// via the SSE `retry:` field. It is typically only sent once.
	Retry time.Duration
}

// StreamOptions tunes [Stream]'s behaviour. The zero value is valid and uses
// [DefaultHeartbeatInterval].
type StreamOptions struct {
	// HeartbeatInterval controls how often a keep-alive comment is sent while
	// the event channel is idle. Negative disables heartbeats; zero falls back
	// to [DefaultHeartbeatInterval].
	HeartbeatInterval time.Duration
}

// Stream writes events from ch to w as a Server-Sent Events response until the
// channel is closed, the request context is cancelled (client disconnect), or a
// write fails.
//
// It sets the appropriate SSE response headers, flushes after every event so
// chunks reach the client incrementally, and emits periodic heartbeats so idle
// connections are not dropped by proxies. When the client disconnects, the
// derived request context is cancelled; producers should select on
// r.Context().Done() (or the context Stream is observing) and stop sending.
//
// Stream returns nil on a clean close (channel drained or closed), the context
// error on client disconnect, [ErrStreamUnsupported] if w cannot flush, or a
// write/encode error otherwise. Callers own ch and must close it when done;
// Stream never closes ch.
func Stream(w http.ResponseWriter, r *http.Request, ch <-chan Event, opts ...StreamOptions) error {
	flusher, ok := w.(http.Flusher)
	if !ok {
		return ErrStreamUnsupported
	}

	var opt StreamOptions
	if len(opts) > 0 {
		opt = opts[0]
	}
	interval := opt.HeartbeatInterval
	if interval == 0 {
		interval = DefaultHeartbeatInterval
	}

	h := w.Header()
	h.Set("Content-Type", "text/event-stream")
	h.Set("Cache-Control", "no-cache")
	h.Set("Connection", "keep-alive")
	// Disable proxy buffering (e.g. nginx) so events are not held back.
	h.Set("X-Accel-Buffering", "no")
	w.WriteHeader(http.StatusOK)
	flusher.Flush()

	ctx := r.Context()

	var heartbeat <-chan time.Time
	if interval > 0 {
		ticker := time.NewTicker(interval)
		defer ticker.Stop()
		heartbeat = ticker.C
	}

	for {
		select {
		case <-ctx.Done():
			// Client disconnected or the handler's deadline elapsed.
			return ctx.Err()

		case <-heartbeat:
			if err := writeComment(w, "heartbeat"); err != nil {
				return err
			}
			flusher.Flush()

		case ev, open := <-ch:
			if !open {
				// Producer finished cleanly.
				return nil
			}
			if err := writeEvent(w, ev); err != nil {
				return err
			}
			flusher.Flush()
		}
	}
}

// writeEvent serialises a single SSE event to w following the text/event-stream
// framing: optional id/event/retry lines, a JSON data line, then a blank line.
func writeEvent(w http.ResponseWriter, ev Event) error {
	payload, err := json.Marshal(ev.Data)
	if err != nil {
		return fmt.Errorf("httputil: marshal sse data: %w", err)
	}

	if ev.ID != "" {
		if _, err := fmt.Fprintf(w, "id: %s\n", ev.ID); err != nil {
			return err
		}
	}
	if ev.Event != "" {
		if _, err := fmt.Fprintf(w, "event: %s\n", ev.Event); err != nil {
			return err
		}
	}
	if ev.Retry > 0 {
		if _, err := fmt.Fprintf(w, "retry: %d\n", ev.Retry.Milliseconds()); err != nil {
			return err
		}
	}
	// A JSON payload never contains a newline, so a single data: line suffices.
	if _, err := fmt.Fprintf(w, "data: %s\n\n", payload); err != nil {
		return err
	}
	return nil
}

// writeComment writes an SSE comment line (a line beginning with ':'), used for
// keep-alive heartbeats. Comments are ignored by clients.
func writeComment(w http.ResponseWriter, text string) error {
	_, err := fmt.Fprintf(w, ": %s\n\n", text)
	return err
}

// StreamChan adapts a typed channel of values into an [Event] channel suitable
// for [Stream], wrapping each value as an Event with the given event name. It is
// a convenience for the common case where a producer emits plain payloads (e.g.
// contracts.AnswerChunk) without per-event SSE metadata.
//
// The returned channel is closed when src is closed or ctx is cancelled. A
// background goroutine performs the copy; it exits on either condition, so
// callers must ensure src is eventually closed or ctx eventually cancelled to
// avoid leaking it.
func StreamChan[T any](ctx context.Context, src <-chan T, eventName string) <-chan Event {
	out := make(chan Event)
	go func() {
		defer close(out)
		for {
			select {
			case <-ctx.Done():
				return
			case v, open := <-src:
				if !open {
					return
				}
				select {
				case <-ctx.Done():
					return
				case out <- Event{Data: v, Event: eventName}:
				}
			}
		}
	}()
	return out
}
