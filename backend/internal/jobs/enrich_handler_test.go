package jobs

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"log"
	"strings"
	"testing"

	"github.com/jackc/pgx/v5"

	"github.com/shafqat/studyrover/backend/internal/enrich"
	"github.com/shafqat/studyrover/backend/internal/store"
)

// --- fakes -------------------------------------------------------------------

type enrichFakeStore struct {
	lesson    store.Lesson
	topic     store.Topic
	subject   store.Subject
	resources []store.LessonResource
}

func newEnrichFakeStore() *enrichFakeStore {
	return &enrichFakeStore{
		lesson:  store.Lesson{ID: "les-1", SubjectID: "sub-1", TopicID: "top-1", Title: "Fractions"},
		topic:   store.Topic{ID: "top-1", SubjectID: "sub-1", Name: "Fractions"},
		subject: store.Subject{ID: "sub-1", Name: "Maths"},
	}
}

func (f *enrichFakeStore) GetLesson(_ context.Context, id string) (store.Lesson, error) {
	if id != f.lesson.ID {
		return store.Lesson{}, pgx.ErrNoRows
	}
	return f.lesson, nil
}

func (f *enrichFakeStore) GetTopic(_ context.Context, id string) (store.Topic, error) {
	if id != f.topic.ID {
		return store.Topic{}, pgx.ErrNoRows
	}
	return f.topic, nil
}

func (f *enrichFakeStore) GetSubject(_ context.Context, id string) (store.Subject, error) {
	if id != f.subject.ID {
		return store.Subject{}, pgx.ErrNoRows
	}
	return f.subject, nil
}

func (f *enrichFakeStore) GetLessonResourceByURL(_ context.Context, arg store.GetLessonResourceByURLParams) (store.LessonResource, error) {
	for _, r := range f.resources {
		if r.LessonID == arg.LessonID && r.Url == arg.Url {
			return r, nil
		}
	}
	return store.LessonResource{}, pgx.ErrNoRows
}

func (f *enrichFakeStore) NextLessonResourcePosition(_ context.Context, lessonID string) (int32, error) {
	next := int32(0)
	for _, r := range f.resources {
		if r.LessonID == lessonID && r.Position >= next {
			next = r.Position + 1
		}
	}
	return next, nil
}

func (f *enrichFakeStore) CreateLessonResource(_ context.Context, arg store.CreateLessonResourceParams) (store.LessonResource, error) {
	r := store.LessonResource{
		ID: fmt.Sprintf("res-%d", len(f.resources)+1), LessonID: arg.LessonID, Kind: arg.Kind, Title: arg.Title,
		Url: arg.Url, Description: arg.Description, ThumbnailUrl: arg.ThumbnailUrl, ExternalID: arg.ExternalID,
		Position: arg.Position, Source: arg.Source,
	}
	f.resources = append(f.resources, r)
	return r, nil
}

// fakeProvider records the query it was asked and returns canned results.
type fakeProvider struct {
	kind    string
	results []enrich.Resource
	err     error
	queries []string
	maxes   []int
}

func (p *fakeProvider) Search(_ context.Context, query string, max int) ([]enrich.Resource, error) {
	p.queries = append(p.queries, query)
	p.maxes = append(p.maxes, max)
	if p.err != nil {
		return nil, p.err
	}
	return p.results, nil
}

func videos(ids ...string) []enrich.Resource {
	out := make([]enrich.Resource, 0, len(ids))
	for _, id := range ids {
		out = append(out, enrich.Resource{Kind: enrich.KindYouTube, Title: "Equivalent fractions explained " + id, URL: enrich.YouTubeWatchURL(id), ExternalID: id, ThumbnailURL: "https://i.ytimg.com/" + id})
	}
	return out
}

func articles(keys ...string) []enrich.Resource {
	out := make([]enrich.Resource, 0, len(keys))
	for _, k := range keys {
		out = append(out, enrich.Resource{Kind: enrich.KindWikipedia, Title: k, URL: enrich.WikipediaArticleURL("en", k), ExternalID: k, Description: "About " + k})
	}
	return out
}

func runEnrich(t *testing.T, h *EnrichHandler, p EnrichPayload) (EnrichResult, error) {
	t.Helper()
	payload, err := json.Marshal(p)
	if err != nil {
		t.Fatal(err)
	}
	sid := "sub-1"
	raw, err := h.Handle(context.Background(), Job{ID: "job-1", Type: TypeEnrich, SubjectID: &sid, Payload: payload}, noopProgress)
	if err != nil {
		return EnrichResult{}, err
	}
	var res EnrichResult
	if err := json.Unmarshal(raw, &res); err != nil {
		t.Fatalf("decode result %s: %v", raw, err)
	}
	return res, nil
}

var quietLog = log.New(io.Discard, "", 0)

// --- tests -------------------------------------------------------------------

func TestEnrichAddsFromBothProviders(t *testing.T) {
	st := newEnrichFakeStore()
	yt := &fakeProvider{kind: "youtube", results: videos("aaaaaaaaaaa", "bbbbbbbbbbb")}
	wp := &fakeProvider{kind: "wikipedia", results: articles("Fraction", "Equivalent fractions", "Fraction (mathematics)")}
	h := NewEnrichHandler(st, yt, wp, quietLog)

	res, err := runEnrich(t, h, EnrichPayload{LessonID: "les-1", YouTube: true, Wikipedia: true, MaxPerKind: 3})
	if err != nil {
		t.Fatalf("Handle: %v", err)
	}
	if res.LessonID != "les-1" || res.Added != 5 || res.YouTube != 2 || res.Wikipedia != 3 || len(res.Warnings) != 0 {
		t.Errorf("result = %+v", res)
	}
	// Derived queries: the topic with the educational bias for YouTube, and the
	// topic in its Wikipedia field. Searches over-fetch for the relevance filter.
	if len(yt.queries) != 1 || yt.queries[0] != "Fractions Maths lesson" || yt.maxes[0] != enrichSearchMax {
		t.Errorf("youtube query = %v max=%v", yt.queries, yt.maxes)
	}
	if len(wp.queries) != 1 || wp.queries[0] != "Fractions mathematics" {
		t.Errorf("wikipedia query = %v", wp.queries)
	}
	if len(st.resources) != 5 {
		t.Fatalf("stored %d resources", len(st.resources))
	}
	for i, r := range st.resources {
		if r.Source != "enrich" || int(r.Position) != i || r.LessonID != "les-1" {
			t.Errorf("resource %d = %+v", i, r)
		}
	}
	if st.resources[0].Kind != "youtube" || *st.resources[0].ExternalID != "aaaaaaaaaaa" || *st.resources[0].ThumbnailUrl != "https://i.ytimg.com/aaaaaaaaaaa" {
		t.Errorf("first resource = %+v", st.resources[0])
	}
	if st.resources[2].Kind != "wikipedia" || *st.resources[2].Description != "About Fraction" {
		t.Errorf("third resource = %+v", st.resources[2])
	}
}

func TestEnrichDedupesExistingURLs(t *testing.T) {
	st := newEnrichFakeStore()
	// Already attached by hand at position 0.
	st.resources = append(st.resources, store.LessonResource{ID: "res-manual", LessonID: "les-1", Kind: "youtube", Url: enrich.YouTubeWatchURL("aaaaaaaaaaa"), Position: 0, Source: "manual"})
	yt := &fakeProvider{results: videos("aaaaaaaaaaa", "bbbbbbbbbbb")}
	wp := &fakeProvider{results: articles("Fraction")}
	h := NewEnrichHandler(st, yt, wp, quietLog)

	res, err := runEnrich(t, h, EnrichPayload{LessonID: "les-1", YouTube: true, Wikipedia: true})
	if err != nil {
		t.Fatalf("Handle: %v", err)
	}
	if res.Added != 2 || res.YouTube != 1 || res.Wikipedia != 1 {
		t.Errorf("result = %+v", res)
	}
	if len(st.resources) != 3 || st.resources[1].Position != 1 || st.resources[2].Position != 2 {
		t.Errorf("positions continue after existing rows: %+v", st.resources)
	}

	// A second run adds nothing more.
	res, err = runEnrich(t, h, EnrichPayload{LessonID: "les-1", YouTube: true, Wikipedia: true})
	if err != nil || res.Added != 0 || len(st.resources) != 3 {
		t.Errorf("rerun: res=%+v err=%v stored=%d", res, err, len(st.resources))
	}
}

func TestEnrichMissingYouTubeKeyWarns(t *testing.T) {
	st := newEnrichFakeStore()
	wp := &fakeProvider{results: articles("Fraction")}
	h := NewEnrichHandler(st, nil, wp, quietLog)

	res, err := runEnrich(t, h, EnrichPayload{LessonID: "les-1", YouTube: true, Wikipedia: true})
	if err != nil {
		t.Fatalf("Handle: %v", err)
	}
	if res.Added != 1 || res.YouTube != 0 || res.Wikipedia != 1 {
		t.Errorf("result = %+v", res)
	}
	if len(res.Warnings) != 1 || res.Warnings[0] != "YouTube skipped: YOUTUBE_API_KEY not configured" {
		t.Errorf("warnings = %v", res.Warnings)
	}
}

func TestEnrichOneProviderFailingIsAWarning(t *testing.T) {
	st := newEnrichFakeStore()
	yt := &fakeProvider{err: errors.New("youtube: HTTP 403 (quotaExceeded): quota")}
	wp := &fakeProvider{results: articles("Fraction", "Fraction (mathematics)")}
	h := NewEnrichHandler(st, yt, wp, quietLog)

	res, err := runEnrich(t, h, EnrichPayload{LessonID: "les-1", YouTube: true, Wikipedia: true})
	if err != nil {
		t.Fatalf("one failing provider must not fail the job: %v", err)
	}
	if res.Added != 2 || res.Wikipedia != 2 || res.YouTube != 0 {
		t.Errorf("result = %+v", res)
	}
	if len(res.Warnings) != 1 || !strings.Contains(res.Warnings[0], "quotaExceeded") {
		t.Errorf("warnings = %v", res.Warnings)
	}
}

func TestEnrichAllProvidersFailingFailsJob(t *testing.T) {
	st := newEnrichFakeStore()
	yt := &fakeProvider{err: errors.New("yt down")}
	wp := &fakeProvider{err: errors.New("wiki down")}
	h := NewEnrichHandler(st, yt, wp, quietLog)

	_, err := runEnrich(t, h, EnrichPayload{LessonID: "les-1", YouTube: true, Wikipedia: true})
	if err == nil || !strings.Contains(err.Error(), "yt down") || !strings.Contains(err.Error(), "wiki down") {
		t.Errorf("expected combined failure, got %v", err)
	}
	if len(st.resources) != 0 {
		t.Errorf("nothing should be stored")
	}
}

func TestEnrichQueryOverrideAndDisabledProviders(t *testing.T) {
	st := newEnrichFakeStore()
	yt := &fakeProvider{results: videos("aaaaaaaaaaa")}
	wp := &fakeProvider{results: articles("Fraction")}
	h := NewEnrichHandler(st, yt, wp, quietLog)

	res, err := runEnrich(t, h, EnrichPayload{LessonID: "les-1", YouTube: true, Wikipedia: false, MaxPerKind: 50, Query: "  equivalent fractions  "})
	if err != nil {
		t.Fatalf("Handle: %v", err)
	}
	if res.Added != 1 || res.Wikipedia != 0 || len(wp.queries) != 0 {
		t.Errorf("wikipedia should not run: res=%+v queries=%v", res, wp.queries)
	}
	// An explicit query is used verbatim (no " lesson" suffix).
	if yt.queries[0] != "equivalent fractions" || yt.maxes[0] != enrichSearchMax {
		t.Errorf("youtube query=%q max=%d", yt.queries[0], yt.maxes[0])
	}
}

func TestEnrichMissingLesson(t *testing.T) {
	h := NewEnrichHandler(newEnrichFakeStore(), nil, &fakeProvider{}, quietLog)
	if _, err := runEnrich(t, h, EnrichPayload{LessonID: "nope", Wikipedia: true}); err == nil || !strings.Contains(err.Error(), "not found") {
		t.Errorf("expected not-found error, got %v", err)
	}
	if _, err := runEnrich(t, h, EnrichPayload{}); err == nil {
		t.Error("expected missing lesson id error")
	}
}

// TestEnrichKeepsOnlyOnTopicHits replays what prod attached before the
// relevance filter: off-topic Wikipedia hits must be dropped, on-topic ones kept,
// and each concept of the topic searched on its own.
func TestEnrichKeepsOnlyOnTopicHits(t *testing.T) {
	st := newEnrichFakeStore()
	st.topic.Name = "Computational thinking: Decomposition and abstraction"
	st.subject.Name = "Computing Class VII"
	wp := &fakeProvider{results: articles(
		"General relativity", "Herbert A. Simon", "LU decomposition (mathematics)",
		"Abstraction (philosophy)", "List of abstractions (computer science)",
		"Decomposition (computer science)", "Abstraction (computer science)", "Computational thinking",
	)}
	yt := &fakeProvider{results: []enrich.Resource{
		{Kind: enrich.KindYouTube, Title: "Top 10 goals of the season", URL: enrich.YouTubeWatchURL("ccccccccccc")},
		{Kind: enrich.KindYouTube, Title: "Decomposition | Computational Thinking", URL: enrich.YouTubeWatchURL("ddddddddddd")},
	}}
	h := NewEnrichHandler(st, yt, wp, quietLog)

	res, err := runEnrich(t, h, EnrichPayload{LessonID: "les-1", YouTube: true, Wikipedia: true, MaxPerKind: 5})
	if err != nil {
		t.Fatalf("Handle: %v", err)
	}
	var titles []string
	for _, r := range st.resources {
		titles = append(titles, r.Title)
	}
	want := "Decomposition | Computational Thinking, Decomposition (computer science), Abstraction (computer science), Computational thinking"
	if got := strings.Join(titles, ", "); got != want {
		t.Errorf("attached %q\nwant     %q", got, want)
	}
	if res.YouTube != 1 || res.Wikipedia != 3 {
		t.Errorf("result = %+v", res)
	}
	wantQ := "Decomposition computer science|abstraction computer science|Computational thinking"
	if got := strings.Join(wp.queries, "|"); got != wantQ {
		t.Errorf("wikipedia queries = %q, want %q", got, wantQ)
	}
	if yt.queries[0] != "Decomposition abstraction Computing lesson" {
		t.Errorf("youtube query = %q", yt.queries[0])
	}
}

// TestEnrichNothingRelevantAddsNothing: a search that only finds off-topic
// pages attaches nothing rather than filling the lesson with noise.
func TestEnrichNothingRelevantAddsNothing(t *testing.T) {
	st := newEnrichFakeStore()
	st.topic.Name = "Number: Integers, powers and roots"
	st.subject.Name = "Math Class VII"
	wp := &fakeProvider{results: articles("Plastic ratio", "Group (mathematics)", "Real number", "Prime number", "List of unsolved problems in mathematics")}
	h := NewEnrichHandler(st, nil, wp, quietLog)

	res, err := runEnrich(t, h, EnrichPayload{LessonID: "les-1", Wikipedia: true})
	if err != nil {
		t.Fatalf("Handle: %v", err)
	}
	if res.Added != 0 || len(st.resources) != 0 {
		t.Errorf("off-topic pages attached: %+v", st.resources)
	}
	if got := strings.Join(wp.queries, "|"); got != "Integers mathematics|powers mathematics|roots mathematics" {
		t.Errorf("wikipedia queries = %q", got)
	}
}
