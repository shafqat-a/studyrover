package knowledge

import (
	"context"
	"errors"
	"sync"
	"time"
)

// ErrNoBackend is returned by the nil-safe noopSource — the backend used when no
// real adapter and no fake were provisioned. It signals that the knowledge
// platform is unconfigured rather than that a call genuinely failed.
var ErrNoBackend = errors.New("knowledge: no backend configured")

// noopSource is a Source that always fails cleanly with ErrNoBackend. It exists
// so the selector never wraps a nil backend (which would panic on first call):
// when even the fake fallback is absent, callers get a clear, non-panicking error.
type noopSource struct{}

// compile-time assertion that noopSource satisfies the knowledge seam.
var _ Source = noopSource{}

func (noopSource) Ingest(context.Context, IngestRequest) (JobID, error) {
	return "", ErrNoBackend
}

func (noopSource) DeriveSyllabus(context.Context, SyllabusRequest) ([]TopicSuggestion, error) {
	return nil, ErrNoBackend
}

func (noopSource) GenerateQuestions(context.Context, GenRequest) ([]QuestionDraft, error) {
	return nil, ErrNoBackend
}

func (noopSource) GenerateStudyGuide(context.Context, GuideRequest) (StudyGuide, error) {
	return StudyGuide{}, ErrNoBackend
}

func (noopSource) AnswerGrounded(context.Context, AskRequest) (<-chan AnswerChunk, error) {
	return nil, ErrNoBackend
}

// ErrQuotaExceeded is returned by a guarded Source once the per-day call cap has
// been reached. It is a sentinel so callers (handlers, the worker) can detect the
// condition and surface a friendly "AI quota reached for today" message rather
// than treating it as a backend failure.
var ErrQuotaExceeded = errors.New("knowledge: daily call quota exceeded")

// GuardLimits configures the cost/rate guard that wraps the selected Source. The
// guard is a coarse runaway-protection mechanism, not a billing system: it counts
// calls per UTC day and refuses further work once a cap is hit. A zero or
// negative limit disables that particular cap.
type GuardLimits struct {
	// MaxCallsPerDay caps the total number of guarded Source calls (across all
	// methods) within a single UTC day. Zero or negative disables the cap.
	MaxCallsPerDay int
	// MaxAskPerDay separately caps AnswerGrounded (tutor chat) calls per UTC day,
	// since chat is the highest-volume, lowest-cost path and is often metered
	// differently from generation. Zero or negative disables this sub-cap.
	MaxAskPerDay int
}

// Guard wraps a Source and enforces GuardLimits, returning ErrQuotaExceeded
// instead of forwarding a call once a cap is reached for the current day. It is
// safe for concurrent use: counters are protected by a mutex and roll over
// automatically at the UTC day boundary.
//
// Guard is itself a Source, so it composes transparently: selector.New wraps the
// chosen concrete adapter in a Guard before handing it to DI.
type Guard struct {
	inner  Source
	limits GuardLimits

	// now is the clock, injectable for deterministic tests. nil uses time.Now.
	now func() time.Time

	mu       sync.Mutex
	day      string // UTC date ("2006-01-02") the counters belong to.
	calls    int    // total guarded calls made on day.
	askCalls int    // AnswerGrounded calls made on day.
}

// compile-time assertion that *Guard satisfies the knowledge seam.
var _ Source = (*Guard)(nil)

// NewGuard wraps inner with the given limits. inner must be non-nil. The returned
// Guard counts calls per UTC day using the real clock; use the unexported clock
// hook (set via newGuardWithClock) in tests for determinism.
func NewGuard(inner Source, limits GuardLimits) *Guard {
	return newGuardWithClock(inner, limits, time.Now)
}

// newGuardWithClock is the testable constructor: it lets a test inject a clock so
// day-boundary rollover and counting are deterministic without sleeping.
func newGuardWithClock(inner Source, limits GuardLimits, now func() time.Time) *Guard {
	if now == nil {
		now = time.Now
	}
	return &Guard{inner: inner, limits: limits, now: now}
}

// reserve charges one call (and, when isAsk, one ask call) against the current
// day's budget. It rolls the counters over when the UTC day has changed. It
// returns ErrQuotaExceeded if either applicable cap would be exceeded, in which
// case no charge is recorded.
func (g *Guard) reserve(isAsk bool) error {
	g.mu.Lock()
	defer g.mu.Unlock()

	today := g.now().UTC().Format("2006-01-02")
	if today != g.day {
		g.day = today
		g.calls = 0
		g.askCalls = 0
	}

	if g.limits.MaxCallsPerDay > 0 && g.calls >= g.limits.MaxCallsPerDay {
		return ErrQuotaExceeded
	}
	if isAsk && g.limits.MaxAskPerDay > 0 && g.askCalls >= g.limits.MaxAskPerDay {
		return ErrQuotaExceeded
	}

	g.calls++
	if isAsk {
		g.askCalls++
	}
	return nil
}

// Ingest charges the daily budget then delegates.
func (g *Guard) Ingest(ctx context.Context, req IngestRequest) (JobID, error) {
	if err := g.reserve(false); err != nil {
		return "", err
	}
	return g.inner.Ingest(ctx, req)
}

// DeriveSyllabus charges the daily budget then delegates.
func (g *Guard) DeriveSyllabus(ctx context.Context, req SyllabusRequest) ([]TopicSuggestion, error) {
	if err := g.reserve(false); err != nil {
		return nil, err
	}
	return g.inner.DeriveSyllabus(ctx, req)
}

// GenerateQuestions charges the daily budget then delegates.
func (g *Guard) GenerateQuestions(ctx context.Context, req GenRequest) ([]QuestionDraft, error) {
	if err := g.reserve(false); err != nil {
		return nil, err
	}
	return g.inner.GenerateQuestions(ctx, req)
}

// GenerateStudyGuide charges the daily budget then delegates.
func (g *Guard) GenerateStudyGuide(ctx context.Context, req GuideRequest) (StudyGuide, error) {
	if err := g.reserve(false); err != nil {
		return StudyGuide{}, err
	}
	return g.inner.GenerateStudyGuide(ctx, req)
}

// AnswerGrounded charges both the global and the ask sub-cap before delegating.
// On quota exhaustion it returns ErrQuotaExceeded with a nil channel, matching
// the Source contract for setup errors.
func (g *Guard) AnswerGrounded(ctx context.Context, req AskRequest) (<-chan AnswerChunk, error) {
	if err := g.reserve(true); err != nil {
		return nil, err
	}
	return g.inner.AnswerGrounded(ctx, req)
}
