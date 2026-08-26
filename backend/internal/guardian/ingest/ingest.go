// Package ingest consumes the platform's score_event outbox and turns each
// event into a grant decision (tasks 3-F02, 3-A12).
//
// The score_event table is the outbox (CONTRACTS-P3 "the seam"); the
// guardian_score_inbox table is the consumer-side ledger. The subscriber reads
// forward from the inbox cursor (max consumed score_event id), runs the
// pipeline for each unseen row, and writes the inbox row LAST so an event is
// never silently dropped: a crash mid-pipeline re-runs that one event on the
// next poll (at-least-once; the double-count window is one event and is
// accepted — see process).
package ingest

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"log/slog"
	"strings"
	"sync"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgtype"

	"github.com/shafqat/studyrover/backend/internal/contracts"
	"github.com/shafqat/studyrover/backend/internal/guardian/reward"
	"github.com/shafqat/studyrover/backend/internal/guardian/session"
	"github.com/shafqat/studyrover/backend/internal/store"
)

const (
	defaultPoll  = 2 * time.Second
	defaultBatch = 50
)

// Spec defaults used when the settings singleton has never been written
// (mirrors core.DefaultSettings; the platform's core package is not imported
// to keep the Guardian's dependency surface to store + contracts).
const (
	defaultRateMinPerQ   = 3
	defaultPassBar       = 70
	defaultDailyCapHours = 3
)

// Config tunes the subscriber.
type Config struct {
	// Poll interval for new score_event rows (default 2s).
	Poll time.Duration
	// Batch size per poll (default 50).
	Batch  int
	Now    func() time.Time
	Logger *slog.Logger
}

func (c Config) withDefaults() Config {
	if c.Poll <= 0 {
		c.Poll = defaultPoll
	}
	if c.Batch <= 0 {
		c.Batch = defaultBatch
	}
	if c.Now == nil {
		c.Now = time.Now
	}
	if c.Logger == nil {
		c.Logger = slog.Default()
	}
	return c
}

// repo is the slice of store.Store the pipeline uses. Narrow so tests can run
// against an in-memory fake (store.Store satisfies it).
type repo interface {
	GetGuardianInboxCursor(ctx context.Context) (int64, error)
	ListScoreEventsAfter(ctx context.Context, arg store.ListScoreEventsAfterParams) ([]store.ScoreEvent, error)
	GetGuardianInboxEntry(ctx context.Context, scoreEventID int64) (store.GuardianScoreInbox, error)
	GetSettings(ctx context.Context) (store.Setting, error)
	GetGuardianPolicy(ctx context.Context) (store.GuardianPolicy, error)
	GetGuardianDailyUsage(ctx context.Context, arg store.GetGuardianDailyUsageParams) (store.GuardianDailyUsage, error)
	ListGuardianDevicesByStudent(ctx context.Context, studentID string) ([]store.GuardianDevice, error)
	AddGuardianDailyUsage(ctx context.Context, arg store.AddGuardianDailyUsageParams) (store.GuardianDailyUsage, error)
	InsertGuardianInboxEntry(ctx context.Context, arg store.InsertGuardianInboxEntryParams) (store.GuardianScoreInbox, error)
}

// granter is the slice of *session.Manager the pipeline uses.
type granter interface {
	Grant(ctx context.Context, req session.Request) (store.GuardianGrant, error)
}

// decideFunc is the reward decision (reward.Decide); injectable for tests.
type decideFunc func(ev contracts.ScoreEvent, usage reward.Usage, p reward.Policy) reward.Decision

// Subscriber polls score_event forward from the inbox cursor and runs the
// pipeline for each unseen event exactly once.
type Subscriber struct {
	db       repo
	sessions granter
	cfg      Config
	decide   decideFunc
	kick     chan struct{}
	mu       sync.Mutex // serialises ProcessOnce (ticker vs Kick vs tests)
}

// NewSubscriber wires the pipeline dependencies.
func NewSubscriber(db store.Store, sessions *session.Manager, cfg Config) *Subscriber {
	return newSubscriber(db, sessions, cfg)
}

// newSubscriber is the interface-typed constructor tests use with fakes.
func newSubscriber(db repo, sessions granter, cfg Config) *Subscriber {
	return &Subscriber{
		db:       db,
		sessions: sessions,
		cfg:      cfg.withDefaults(),
		decide:   reward.Decide,
		kick:     make(chan struct{}, 1),
	}
}

// Run polls until ctx is cancelled. Blocks.
func (s *Subscriber) Run(ctx context.Context) error {
	log := s.cfg.Logger
	log.Info("guardian ingest: starting", "poll", s.cfg.Poll, "batch", s.cfg.Batch)
	ticker := time.NewTicker(s.cfg.Poll)
	defer ticker.Stop()

	for {
		if n, err := s.ProcessOnce(ctx); err != nil {
			if ctx.Err() != nil {
				log.Info("guardian ingest: stopped")
				return nil
			}
			log.Error("guardian ingest: poll failed", "err", err, "processed", n)
		} else if n > 0 {
			log.Info("guardian ingest: processed score events", "count", n)
		}

		select {
		case <-ctx.Done():
			log.Info("guardian ingest: stopped")
			return nil
		case <-ticker.C:
		case <-s.kick:
		}
	}
}

// ProcessOnce drains everything currently unseen (used by tests and by the
// submit handler's optional "kick" so grants land within milliseconds). It
// returns the number of events processed; on error it stops at the failing
// event, which is retried on the next call because its inbox row was never
// written.
func (s *Subscriber) ProcessOnce(ctx context.Context) (processed int, err error) {
	s.mu.Lock()
	defer s.mu.Unlock()

	for {
		cursor, err := s.db.GetGuardianInboxCursor(ctx)
		if err != nil {
			return processed, fmt.Errorf("ingest: read cursor: %w", err)
		}
		events, err := s.db.ListScoreEventsAfter(ctx, store.ListScoreEventsAfterParams{
			AfterID:  cursor,
			RowLimit: int32(s.cfg.Batch),
		})
		if err != nil {
			return processed, fmt.Errorf("ingest: list score events after %d: %w", cursor, err)
		}
		if len(events) == 0 {
			return processed, nil
		}
		for _, ev := range events {
			if ctx.Err() != nil {
				return processed, ctx.Err()
			}
			if err := s.process(ctx, ev); err != nil {
				return processed, fmt.Errorf("ingest: score event %d (attempt %s): %w", ev.ID, ev.AttemptID, err)
			}
			processed++
		}
		if len(events) < s.cfg.Batch {
			return processed, nil
		}
	}
}

// Kick nudges the subscriber to poll now (non-blocking, coalesced).
func (s *Subscriber) Kick() {
	select {
	case s.kick <- struct{}{}:
	default:
	}
}

// process is the 3-A12 pipeline for one score event:
//
//  1. skip when the inbox already has the event (idempotency);
//  2. load the effective policy (settings + guardian_policy) and today's usage;
//  3. paused policy → inbox row with 0 minutes, nothing else;
//  4. reward.Decide → minutes;
//  5. minutes > 0 → one grant per gated device of the student;
//  6. add today's usage (minutes actually granted; +1 pass when the exam passed);
//  7. write the inbox row last.
//
// Returned errors are infrastructure failures (DB reads/writes) that leave
// the inbox row unwritten so the event is retried on the next poll. Wall /
// grant failures are NOT returned: they are recorded in the inbox note with
// minutes=0 so the loop never wedges on a broken wall and the failure stays
// visible. A crash between steps 6 and 7 re-runs the event once (usage may
// be double-counted by one exam); accepted for a single-household deployment.
func (s *Subscriber) process(ctx context.Context, ev store.ScoreEvent) error {
	log := s.cfg.Logger.With("scoreEvent", ev.ID, "attempt", ev.AttemptID, "student", ev.StudentID)

	// 1. Idempotency.
	if _, err := s.db.GetGuardianInboxEntry(ctx, ev.ID); err == nil {
		return nil
	} else if !errors.Is(err, pgx.ErrNoRows) {
		return fmt.Errorf("read inbox: %w", err)
	}

	// 2. Policy + usage.
	policy, enabled, err := s.loadPolicy(ctx)
	if err != nil {
		return err
	}
	today := s.today()
	usage, err := s.loadUsage(ctx, ev.StudentID, today)
	if err != nil {
		return err
	}

	// 3. Paused.
	if !enabled {
		log.Info("guardian ingest: policy paused, no grant")
		return s.writeInbox(ctx, ev.ID, 0, nil, "guardian paused")
	}

	// 4. Decide.
	d := s.decide(contractScoreEvent(ev), usage, policy)
	note := d.Reason
	granted := 0
	var grantID *string

	// 5. Grant.
	if d.Minutes > 0 {
		devices, err := s.db.ListGuardianDevicesByStudent(ctx, ev.StudentID)
		if err != nil {
			return fmt.Errorf("list devices: %w", err)
		}
		var gated []store.GuardianDevice
		for _, dev := range devices {
			if dev.Gated {
				gated = append(gated, dev)
			}
		}
		if len(gated) == 0 {
			note = appendNote(note, "no gated device registered")
			log.Warn("guardian ingest: pass earned minutes but the student has no gated device", "minutes", d.Minutes)
		}
		var failures []string
		for _, dev := range gated {
			g, err := s.sessions.Grant(ctx, session.Request{
				Device:    dev,
				Minutes:   d.Minutes,
				Source:    session.SourceExam,
				AttemptID: ev.AttemptID,
			})
			if err != nil {
				log.Error("guardian ingest: grant failed", "device", dev.ID, "mac", dev.Mac, "err", err)
				failures = append(failures, fmt.Sprintf("%s: %v", dev.Name, err))
				continue
			}
			if grantID == nil {
				id := g.ID
				grantID = &id
			}
			log.Info("guardian ingest: granted", "device", dev.ID, "mac", dev.Mac, "minutes", d.Minutes, "grant", g.ID)
		}
		if grantID != nil {
			granted = d.Minutes
		}
		if len(failures) > 0 {
			note = appendNote(note, "grant failed: "+strings.Join(failures, "; "))
		}
	}

	// 6. Usage.
	passes := int32(0)
	if ev.Passed {
		passes = 1
	}
	if _, err := s.db.AddGuardianDailyUsage(ctx, store.AddGuardianDailyUsageParams{
		StudentID: ev.StudentID,
		Day:       today,
		Minutes:   int32(granted),
		Passes:    passes,
	}); err != nil {
		return fmt.Errorf("add daily usage: %w", err)
	}

	// 7. Inbox row last.
	return s.writeInbox(ctx, ev.ID, granted, grantID, note)
}

// loadPolicy merges the settings singleton (rate, pass bar, daily cap) with the
// guardian_policy row (style, diminishing returns) and reports the parent
// switch separately. Missing settings fall back to the spec defaults.
func (s *Subscriber) loadPolicy(ctx context.Context) (reward.Policy, bool, error) {
	p := reward.Policy{
		RateMinPerQ:     defaultRateMinPerQ,
		PassBar:         defaultPassBar,
		DailyCapMinutes: defaultDailyCapHours * 60,
		Style:           reward.StyleFlat,
	}
	set, err := s.db.GetSettings(ctx)
	switch {
	case err == nil:
		if set.RewardRateMinPerQ > 0 {
			p.RateMinPerQ = int(set.RewardRateMinPerQ)
		}
		if set.DefaultPassBar > 0 {
			p.PassBar = int(set.DefaultPassBar)
		}
		p.DailyCapMinutes = int(set.DailyCapHours) * 60
	case errors.Is(err, pgx.ErrNoRows):
		// defaults
	default:
		return p, false, fmt.Errorf("read settings: %w", err)
	}

	gp, err := s.db.GetGuardianPolicy(ctx)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			// Migration 0027 seeds the row; treat a missing one as the defaults.
			p.DiminishingReturns = true
			return p, true, nil
		}
		return p, false, fmt.Errorf("read guardian policy: %w", err)
	}
	if gp.RewardStyle != "" {
		p.Style = reward.Style(gp.RewardStyle)
	}
	p.DiminishingReturns = gp.DiminishingReturns
	return p, gp.Enabled, nil
}

// loadUsage returns today's earned minutes/passes for the student (zero when
// no row exists yet).
func (s *Subscriber) loadUsage(ctx context.Context, studentID string, day pgtype.Date) (reward.Usage, error) {
	u, err := s.db.GetGuardianDailyUsage(ctx, store.GetGuardianDailyUsageParams{StudentID: studentID, Day: day})
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return reward.Usage{}, nil
		}
		return reward.Usage{}, fmt.Errorf("read daily usage: %w", err)
	}
	return reward.Usage{MinutesToday: int(u.Minutes), PassesToday: int(u.Passes)}, nil
}

// writeInbox records the outcome. The insert is ON CONFLICT DO NOTHING, so a
// concurrent duplicate simply yields no row (pgx.ErrNoRows), which is fine.
func (s *Subscriber) writeInbox(ctx context.Context, eventID int64, minutes int, grantID *string, note string) error {
	var notePtr *string
	if note != "" {
		notePtr = &note
	}
	_, err := s.db.InsertGuardianInboxEntry(ctx, store.InsertGuardianInboxEntryParams{
		ScoreEventID: eventID,
		Minutes:      int32(minutes),
		GrantID:      grantID,
		Note:         notePtr,
	})
	if err != nil && !errors.Is(err, pgx.ErrNoRows) {
		return fmt.Errorf("write inbox: %w", err)
	}
	return nil
}

// today is the server-local calendar day (daily usage is per household day).
func (s *Subscriber) today() pgtype.Date {
	return DayOf(s.cfg.Now())
}

// DayOf converts a timestamp to the pgtype.Date for its local calendar day.
func DayOf(t time.Time) pgtype.Date {
	t = t.In(time.Local)
	return pgtype.Date{Time: time.Date(t.Year(), t.Month(), t.Day(), 0, 0, 0, 0, time.UTC), Valid: true}
}

// contractScoreEvent maps the outbox row to the C10 contract shape the reward
// engine consumes (per_topic jsonb → []PerTopicScore).
func contractScoreEvent(ev store.ScoreEvent) contracts.ScoreEvent {
	out := contracts.ScoreEvent{
		AttemptId:        ev.AttemptID,
		StudentId:        ev.StudentID,
		SubjectId:        ev.SubjectID,
		ExamDefinitionId: ev.ExamDefinitionID,
		ScopeTopicIds:    ev.ScopeTopicIds,
		Size:             int(ev.Size),
		ScorePct:         int(ev.ScorePct),
		Passed:           ev.Passed,
		PerTopic:         []contracts.PerTopicScore{},
		Timestamp:        ev.CreatedAt,
	}
	if out.ScopeTopicIds == nil {
		out.ScopeTopicIds = []string{}
	}
	if len(ev.PerTopic) > 0 {
		var pt []contracts.PerTopicScore
		if err := json.Unmarshal(ev.PerTopic, &pt); err == nil && pt != nil {
			out.PerTopic = pt
		}
	}
	return out
}

func appendNote(note, extra string) string {
	if note == "" {
		return extra
	}
	return note + " · " + extra
}
