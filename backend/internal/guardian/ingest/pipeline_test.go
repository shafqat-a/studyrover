package ingest

import (
	"context"
	"errors"
	"fmt"
	"strings"
	"testing"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgtype"

	"github.com/shafqat/studyrover/backend/internal/contracts"
	"github.com/shafqat/studyrover/backend/internal/guardian/reward"
	"github.com/shafqat/studyrover/backend/internal/guardian/session"
	"github.com/shafqat/studyrover/backend/internal/store"
)

// --- in-memory fakes ---------------------------------------------------------

type fakeRepo struct {
	events   []store.ScoreEvent
	inbox    map[int64]store.GuardianScoreInbox
	settings *store.Setting        // nil = no row
	policy   *store.GuardianPolicy // nil = no row
	usage    map[string]store.GuardianDailyUsage
	devices  map[string][]store.GuardianDevice
	failAdd  error // injected AddGuardianDailyUsage failure
}

func newFakeRepo() *fakeRepo {
	return &fakeRepo{
		inbox:   map[int64]store.GuardianScoreInbox{},
		usage:   map[string]store.GuardianDailyUsage{},
		devices: map[string][]store.GuardianDevice{},
		policy:  &store.GuardianPolicy{ID: "default", Enabled: true, RewardStyle: "flat", DiminishingReturns: true},
	}
}

func usageKey(student string, day pgtype.Date) string {
	return student + "|" + day.Time.Format("2006-01-02")
}

func (r *fakeRepo) GetGuardianInboxCursor(context.Context) (int64, error) {
	var max int64
	for id := range r.inbox {
		if id > max {
			max = id
		}
	}
	return max, nil
}

func (r *fakeRepo) ListScoreEventsAfter(_ context.Context, arg store.ListScoreEventsAfterParams) ([]store.ScoreEvent, error) {
	out := []store.ScoreEvent{}
	for _, ev := range r.events {
		if ev.ID > arg.AfterID {
			out = append(out, ev)
			if len(out) == int(arg.RowLimit) {
				break
			}
		}
	}
	return out, nil
}

func (r *fakeRepo) GetGuardianInboxEntry(_ context.Context, id int64) (store.GuardianScoreInbox, error) {
	if e, ok := r.inbox[id]; ok {
		return e, nil
	}
	return store.GuardianScoreInbox{}, pgx.ErrNoRows
}

func (r *fakeRepo) GetSettings(context.Context) (store.Setting, error) {
	if r.settings == nil {
		return store.Setting{}, pgx.ErrNoRows
	}
	return *r.settings, nil
}

func (r *fakeRepo) GetGuardianPolicy(context.Context) (store.GuardianPolicy, error) {
	if r.policy == nil {
		return store.GuardianPolicy{}, pgx.ErrNoRows
	}
	return *r.policy, nil
}

func (r *fakeRepo) GetGuardianDailyUsage(_ context.Context, arg store.GetGuardianDailyUsageParams) (store.GuardianDailyUsage, error) {
	if u, ok := r.usage[usageKey(arg.StudentID, arg.Day)]; ok {
		return u, nil
	}
	return store.GuardianDailyUsage{}, pgx.ErrNoRows
}

func (r *fakeRepo) ListGuardianDevicesByStudent(_ context.Context, student string) ([]store.GuardianDevice, error) {
	return r.devices[student], nil
}

func (r *fakeRepo) AddGuardianDailyUsage(_ context.Context, arg store.AddGuardianDailyUsageParams) (store.GuardianDailyUsage, error) {
	if r.failAdd != nil {
		return store.GuardianDailyUsage{}, r.failAdd
	}
	k := usageKey(arg.StudentID, arg.Day)
	u := r.usage[k]
	u.StudentID = arg.StudentID
	u.Day = arg.Day
	u.Minutes += arg.Minutes
	u.Passes += arg.Passes
	r.usage[k] = u
	return u, nil
}

func (r *fakeRepo) InsertGuardianInboxEntry(_ context.Context, arg store.InsertGuardianInboxEntryParams) (store.GuardianScoreInbox, error) {
	if _, ok := r.inbox[arg.ScoreEventID]; ok {
		return store.GuardianScoreInbox{}, pgx.ErrNoRows // ON CONFLICT DO NOTHING
	}
	e := store.GuardianScoreInbox{ScoreEventID: arg.ScoreEventID, Minutes: arg.Minutes, GrantID: arg.GrantID, Note: arg.Note}
	r.inbox[arg.ScoreEventID] = e
	return e, nil
}

type fakeGranter struct {
	reqs []session.Request
	err  error
}

func (g *fakeGranter) Grant(_ context.Context, req session.Request) (store.GuardianGrant, error) {
	if g.err != nil {
		return store.GuardianGrant{}, g.err
	}
	g.reqs = append(g.reqs, req)
	return store.GuardianGrant{ID: fmt.Sprintf("grant-%d", len(g.reqs)), DeviceID: req.Device.ID, Minutes: int32(req.Minutes)}, nil
}

// --- helpers -------------------------------------------------------------------

var testNow = time.Date(2026, 8, 26, 10, 30, 0, 0, time.Local)

func newTestSub(r *fakeRepo, g *fakeGranter, decide decideFunc) *Subscriber {
	s := newSubscriber(r, g, Config{Now: func() time.Time { return testNow }})
	if decide != nil {
		s.decide = decide
	}
	return s
}

// fixedDecide grants `minutes` on a pass and records what it was called with.
func fixedDecide(minutes int, calls *[]reward.Usage, policies *[]reward.Policy) decideFunc {
	return func(ev contracts.ScoreEvent, usage reward.Usage, p reward.Policy) reward.Decision {
		if calls != nil {
			*calls = append(*calls, usage)
		}
		if policies != nil {
			*policies = append(*policies, p)
		}
		if !ev.Passed {
			return reward.Decision{Reason: "fail"}
		}
		return reward.Decision{Minutes: minutes, Base: minutes, Reason: fmt.Sprintf("pass %d min", minutes)}
	}
}

func scoreEvent(id int64, passed bool) store.ScoreEvent {
	return store.ScoreEvent{
		ID:               id,
		AttemptID:        fmt.Sprintf("attempt-%d", id),
		StudentID:        "stu-1",
		SubjectID:        "sub-1",
		ExamDefinitionID: "def-1",
		ScopeTopicIds:    []string{"t1"},
		Size:             20,
		ScorePct:         85,
		Passed:           passed,
		PerTopic:         []byte(`[{"topicId":"t1","correct":17,"total":20}]`),
		CreatedAt:        testNow.Add(-time.Minute),
	}
}

func device(id, student string, gated bool) store.GuardianDevice {
	return store.GuardianDevice{ID: id, StudentID: student, Name: "dev " + id, Mac: "aa:bb:cc:dd:ee:0" + id[len(id)-1:], Gated: gated}
}

func todayUsage(r *fakeRepo, student string) store.GuardianDailyUsage {
	return r.usage[usageKey(student, DayOf(testNow))]
}

// --- tests ---------------------------------------------------------------------

func TestProcess_PassGrantsMinutes(t *testing.T) {
	r := newFakeRepo()
	r.devices["stu-1"] = []store.GuardianDevice{device("d1", "stu-1", true)}
	g := &fakeGranter{}
	s := newTestSub(r, g, fixedDecide(30, nil, nil))

	if err := s.process(context.Background(), scoreEvent(1, true)); err != nil {
		t.Fatal(err)
	}
	if len(g.reqs) != 1 {
		t.Fatalf("grants = %d, want 1", len(g.reqs))
	}
	req := g.reqs[0]
	if req.Minutes != 30 || req.Source != session.SourceExam || req.AttemptID != "attempt-1" || req.Device.ID != "d1" {
		t.Fatalf("unexpected grant request %+v", req)
	}
	u := todayUsage(r, "stu-1")
	if u.Minutes != 30 || u.Passes != 1 {
		t.Fatalf("usage = %+v, want 30 min / 1 pass", u)
	}
	in := r.inbox[1]
	if in.Minutes != 30 || in.GrantID == nil || *in.GrantID != "grant-1" || in.Note == nil || *in.Note != "pass 30 min" {
		t.Fatalf("inbox = %+v", in)
	}
}

func TestProcess_FailGrantsNothing(t *testing.T) {
	r := newFakeRepo()
	r.devices["stu-1"] = []store.GuardianDevice{device("d1", "stu-1", true)}
	r.usage[usageKey("stu-1", DayOf(testNow))] = store.GuardianDailyUsage{StudentID: "stu-1", Minutes: 45, Passes: 2}
	g := &fakeGranter{}
	s := newTestSub(r, g, fixedDecide(30, nil, nil))

	if err := s.process(context.Background(), scoreEvent(2, false)); err != nil {
		t.Fatal(err)
	}
	if len(g.reqs) != 0 {
		t.Fatalf("fail must not grant, got %d", len(g.reqs))
	}
	u := todayUsage(r, "stu-1")
	if u.Minutes != 45 || u.Passes != 2 {
		t.Fatalf("usage changed on fail: %+v", u)
	}
	in := r.inbox[2]
	if in.Minutes != 0 || in.GrantID != nil {
		t.Fatalf("inbox = %+v", in)
	}
}

func TestProcess_PausedPolicy(t *testing.T) {
	r := newFakeRepo()
	r.policy.Enabled = false
	r.devices["stu-1"] = []store.GuardianDevice{device("d1", "stu-1", true)}
	g := &fakeGranter{}
	called := false
	s := newTestSub(r, g, func(contracts.ScoreEvent, reward.Usage, reward.Policy) reward.Decision {
		called = true
		return reward.Decision{Minutes: 99}
	})

	if err := s.process(context.Background(), scoreEvent(3, true)); err != nil {
		t.Fatal(err)
	}
	if called {
		t.Fatal("decide must not run while paused")
	}
	if len(g.reqs) != 0 {
		t.Fatal("paused must not grant")
	}
	if _, ok := r.usage[usageKey("stu-1", DayOf(testNow))]; ok {
		t.Fatal("paused must not touch usage")
	}
	in := r.inbox[3]
	if in.Minutes != 0 || in.Note == nil || *in.Note != "guardian paused" {
		t.Fatalf("inbox = %+v", in)
	}
}

func TestProcess_NoGatedDevice(t *testing.T) {
	r := newFakeRepo()
	r.devices["stu-1"] = []store.GuardianDevice{device("d1", "stu-1", false)}
	g := &fakeGranter{}
	s := newTestSub(r, g, fixedDecide(30, nil, nil))

	if err := s.process(context.Background(), scoreEvent(4, true)); err != nil {
		t.Fatal(err)
	}
	if len(g.reqs) != 0 {
		t.Fatal("ungated devices must not be granted")
	}
	u := todayUsage(r, "stu-1")
	if u.Minutes != 0 || u.Passes != 1 {
		t.Fatalf("usage = %+v, want 0 min / 1 pass", u)
	}
	in := r.inbox[4]
	if in.Minutes != 0 || in.GrantID != nil || in.Note == nil || !strings.Contains(*in.Note, "no gated device registered") {
		t.Fatalf("inbox = %+v", in)
	}
}

func TestProcess_GrantFailureIsRecordedNotRetried(t *testing.T) {
	r := newFakeRepo()
	r.devices["stu-1"] = []store.GuardianDevice{device("d1", "stu-1", true)}
	g := &fakeGranter{err: errors.New("router unreachable")}
	s := newTestSub(r, g, fixedDecide(30, nil, nil))

	if err := s.process(context.Background(), scoreEvent(5, true)); err != nil {
		t.Fatalf("wall failure must not bubble up (would wedge the loop): %v", err)
	}
	u := todayUsage(r, "stu-1")
	if u.Minutes != 0 || u.Passes != 1 {
		t.Fatalf("usage = %+v, want 0 min / 1 pass", u)
	}
	in, ok := r.inbox[5]
	if !ok {
		t.Fatal("inbox row must be written so the event is not re-run forever")
	}
	if in.Minutes != 0 || in.GrantID != nil || in.Note == nil || !strings.Contains(*in.Note, "grant failed") || !strings.Contains(*in.Note, "router unreachable") {
		t.Fatalf("inbox = %+v", in)
	}
}

func TestProcess_MultipleGatedDevices(t *testing.T) {
	r := newFakeRepo()
	r.devices["stu-1"] = []store.GuardianDevice{device("d1", "stu-1", true), device("d2", "stu-1", false), device("d3", "stu-1", true)}
	g := &fakeGranter{}
	s := newTestSub(r, g, fixedDecide(20, nil, nil))

	if err := s.process(context.Background(), scoreEvent(6, true)); err != nil {
		t.Fatal(err)
	}
	if len(g.reqs) != 2 || g.reqs[0].Device.ID != "d1" || g.reqs[1].Device.ID != "d3" {
		t.Fatalf("grants = %+v", g.reqs)
	}
	if u := todayUsage(r, "stu-1"); u.Minutes != 20 {
		t.Fatalf("minutes counted once per exam, got %d", u.Minutes)
	}
	if in := r.inbox[6]; in.GrantID == nil || *in.GrantID != "grant-1" {
		t.Fatalf("inbox should carry the first grant id: %+v", in)
	}
}

func TestProcess_Idempotent(t *testing.T) {
	r := newFakeRepo()
	r.devices["stu-1"] = []store.GuardianDevice{device("d1", "stu-1", true)}
	r.inbox[7] = store.GuardianScoreInbox{ScoreEventID: 7, Minutes: 30}
	g := &fakeGranter{}
	s := newTestSub(r, g, fixedDecide(30, nil, nil))

	if err := s.process(context.Background(), scoreEvent(7, true)); err != nil {
		t.Fatal(err)
	}
	if len(g.reqs) != 0 {
		t.Fatal("already-consumed event must be skipped")
	}
	if _, ok := r.usage[usageKey("stu-1", DayOf(testNow))]; ok {
		t.Fatal("skipped event must not touch usage")
	}
}

func TestProcess_PolicyAndUsageReachDecide(t *testing.T) {
	r := newFakeRepo()
	r.settings = &store.Setting{ID: "singleton", RewardRateMinPerQ: 5, DailyCapHours: 2, DefaultPassBar: 60}
	r.policy = &store.GuardianPolicy{ID: "default", Enabled: true, RewardStyle: "scaled", DiminishingReturns: false}
	r.usage[usageKey("stu-1", DayOf(testNow))] = store.GuardianDailyUsage{StudentID: "stu-1", Minutes: 100, Passes: 2}
	r.devices["stu-1"] = []store.GuardianDevice{device("d1", "stu-1", true)}
	var usages []reward.Usage
	var policies []reward.Policy
	s := newTestSub(r, &fakeGranter{}, fixedDecide(10, &usages, &policies))

	if err := s.process(context.Background(), scoreEvent(8, true)); err != nil {
		t.Fatal(err)
	}
	if len(usages) != 1 || usages[0] != (reward.Usage{MinutesToday: 100, PassesToday: 2}) {
		t.Fatalf("usage passed to decide = %+v", usages)
	}
	want := reward.Policy{RateMinPerQ: 5, PassBar: 60, DailyCapMinutes: 120, Style: reward.StyleScaled, DiminishingReturns: false}
	if len(policies) != 1 || policies[0] != want {
		t.Fatalf("policy passed to decide = %+v, want %+v", policies, want)
	}
	// Usage accumulates on top of what was there.
	if u := todayUsage(r, "stu-1"); u.Minutes != 110 || u.Passes != 3 {
		t.Fatalf("usage after = %+v", u)
	}
}

func TestProcess_DefaultsWithoutSettingsRow(t *testing.T) {
	r := newFakeRepo()
	r.settings = nil
	r.policy = nil
	var policies []reward.Policy
	s := newTestSub(r, &fakeGranter{}, fixedDecide(0, nil, &policies))

	if err := s.process(context.Background(), scoreEvent(9, false)); err != nil {
		t.Fatal(err)
	}
	want := reward.Policy{RateMinPerQ: 3, PassBar: 70, DailyCapMinutes: 180, Style: reward.StyleFlat, DiminishingReturns: true}
	if len(policies) != 1 || policies[0] != want {
		t.Fatalf("default policy = %+v, want %+v", policies, want)
	}
}

func TestProcess_InfraErrorLeavesInboxUnwritten(t *testing.T) {
	r := newFakeRepo()
	r.devices["stu-1"] = []store.GuardianDevice{device("d1", "stu-1", true)}
	r.failAdd = errors.New("db down")
	s := newTestSub(r, &fakeGranter{}, fixedDecide(30, nil, nil))

	err := s.process(context.Background(), scoreEvent(10, true))
	if err == nil || !strings.Contains(err.Error(), "db down") {
		t.Fatalf("expected db error, got %v", err)
	}
	if _, ok := r.inbox[10]; ok {
		t.Fatal("inbox must not be written when the pipeline failed (event must be retried)")
	}
}

func TestProcessOnce_DrainsFromCursorInBatches(t *testing.T) {
	r := newFakeRepo()
	r.devices["stu-1"] = []store.GuardianDevice{device("d1", "stu-1", true)}
	r.inbox[1] = store.GuardianScoreInbox{ScoreEventID: 1} // already consumed → cursor 1
	for id := int64(1); id <= 5; id++ {
		r.events = append(r.events, scoreEvent(id, id%2 == 0))
	}
	g := &fakeGranter{}
	s := newSubscriber(r, g, Config{Now: func() time.Time { return testNow }, Batch: 2})
	s.decide = fixedDecide(15, nil, nil)

	n, err := s.ProcessOnce(context.Background())
	if err != nil {
		t.Fatal(err)
	}
	if n != 4 {
		t.Fatalf("processed = %d, want 4 (events 2..5)", n)
	}
	for id := int64(2); id <= 5; id++ {
		if _, ok := r.inbox[id]; !ok {
			t.Fatalf("event %d not consumed", id)
		}
	}
	if len(g.reqs) != 2 { // events 2 and 4 passed
		t.Fatalf("grants = %d, want 2", len(g.reqs))
	}
	if u := todayUsage(r, "stu-1"); u.Minutes != 30 || u.Passes != 2 {
		t.Fatalf("usage = %+v", u)
	}
	if cur, _ := r.GetGuardianInboxCursor(context.Background()); cur != 5 {
		t.Fatalf("cursor = %d, want 5", cur)
	}

	n, err = s.ProcessOnce(context.Background())
	if err != nil || n != 0 {
		t.Fatalf("second drain = %d, %v; want 0, nil", n, err)
	}
}

func TestRunStopsOnCancelAndKickDoesNotBlock(t *testing.T) {
	r := newFakeRepo()
	s := newTestSub(r, &fakeGranter{}, fixedDecide(0, nil, nil))
	s.Kick()
	s.Kick() // coalesced, must not block

	ctx, cancel := context.WithCancel(context.Background())
	done := make(chan error, 1)
	go func() { done <- s.Run(ctx) }()
	cancel()
	select {
	case err := <-done:
		if err != nil {
			t.Fatalf("Run returned %v", err)
		}
	case <-time.After(5 * time.Second):
		t.Fatal("Run did not stop on cancel")
	}
}

func TestContractScoreEventMapping(t *testing.T) {
	ev := contractScoreEvent(scoreEvent(11, true))
	if ev.AttemptId != "attempt-11" || ev.Size != 20 || ev.ScorePct != 85 || !ev.Passed {
		t.Fatalf("mapped = %+v", ev)
	}
	if len(ev.PerTopic) != 1 || ev.PerTopic[0].TopicId != "t1" || ev.PerTopic[0].Correct != 17 || ev.PerTopic[0].Total != 20 {
		t.Fatalf("perTopic = %+v", ev.PerTopic)
	}
	if !ev.Timestamp.Equal(testNow.Add(-time.Minute)) {
		t.Fatalf("timestamp = %v", ev.Timestamp)
	}
	// Bad / empty jsonb degrades to an empty slice, never nil.
	bad := scoreEvent(12, true)
	bad.PerTopic = []byte(`nope`)
	bad.ScopeTopicIds = nil
	m := contractScoreEvent(bad)
	if m.PerTopic == nil || len(m.PerTopic) != 0 || m.ScopeTopicIds == nil {
		t.Fatalf("degraded mapping = %+v", m)
	}
}

// TestProcess_RealReward runs the pipeline through the real reward engine
// (flat: 20q × 3min = 60 on a pass) so diminishing returns and the daily cap
// are exercised end to end. Skipped while reward is still the stub.
func TestProcess_RealReward(t *testing.T) {
	policy := reward.Policy{RateMinPerQ: 3, PassBar: 70, DailyCapMinutes: 180, Style: reward.StyleFlat, DiminishingReturns: true}
	if d := reward.Decide(contractScoreEvent(scoreEvent(0, true)), reward.Usage{}, policy); d.Minutes == 0 {
		t.Skip("reward.Decide is still a stub (returns 0); pipeline semantics are covered with the injected decide")
	}

	r := newFakeRepo()
	r.settings = &store.Setting{ID: "singleton", RewardRateMinPerQ: 3, DailyCapHours: 3, DefaultPassBar: 70}
	r.policy = &store.GuardianPolicy{ID: "default", Enabled: true, RewardStyle: "flat", DiminishingReturns: true}
	r.devices["stu-1"] = []store.GuardianDevice{device("d1", "stu-1", true)}
	g := &fakeGranter{}
	s := newTestSub(r, g, nil) // real reward.Decide

	// 1st and 2nd pass: full 60 each (120 used). 3rd: 75% of 60 = 45 (165
	// used). 4th: 50% = 30 but only 15 minutes of the 180-minute day remain.
	wantMinutes := []int{60, 60, 45, 15}
	for i, want := range wantMinutes {
		if err := s.process(context.Background(), scoreEvent(int64(i+1), true)); err != nil {
			t.Fatal(err)
		}
		if got := int(r.inbox[int64(i+1)].Minutes); got != want {
			t.Fatalf("pass %d: minutes = %d, want %d (note %v)", i+1, got, want, derefNote(r.inbox[int64(i+1)].Note))
		}
	}
	if u := todayUsage(r, "stu-1"); u.Minutes != 180 || u.Passes != 4 {
		t.Fatalf("usage = %+v, want 180 min / 4 passes", u)
	}
	if len(g.reqs) != 4 {
		t.Fatalf("grants = %d, want 4", len(g.reqs))
	}
	// 5th pass: cap exhausted → nothing opened, pass still counted.
	if err := s.process(context.Background(), scoreEvent(5, true)); err != nil {
		t.Fatal(err)
	}
	if r.inbox[5].Minutes != 0 || len(g.reqs) != 4 {
		t.Fatalf("capped pass: inbox %+v grants %d", r.inbox[5], len(g.reqs))
	}
	if u := todayUsage(r, "stu-1"); u.Minutes != 180 || u.Passes != 5 {
		t.Fatalf("usage after capped pass = %+v", u)
	}
}

func derefNote(p *string) string {
	if p == nil {
		return ""
	}
	return *p
}
