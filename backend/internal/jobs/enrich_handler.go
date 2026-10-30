package jobs

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"log"
	"sort"
	"strings"

	"github.com/jackc/pgx/v5"

	"github.com/shafqat/studyrover/backend/internal/contracts"
	"github.com/shafqat/studyrover/backend/internal/enrich"
	"github.com/shafqat/studyrover/backend/internal/store"
)

// EnrichPayload is the queued request for an "enrich" job: search YouTube
// and/or Wikipedia for the lesson's topic and attach the best matches that are
// actually about the topic as resources. The HTTP handler encodes it; the worker decodes it here.
type EnrichPayload struct {
	LessonID   string `json:"lessonId"`
	YouTube    bool   `json:"youtube"`
	Wikipedia  bool   `json:"wikipedia"`
	MaxPerKind int    `json:"maxPerKind"`
	// Query overrides the lesson topic as the search text (and as the words a
	// hit must be about).
	Query string `json:"query,omitempty"`
}

// EnrichResult is the JSON result stored on a completed "enrich" job. It is
// the wire shape of the contract's EnrichResult schema (which oapi-codegen does
// not emit because no operation references it directly — the Job.result is an
// open object).
type EnrichResult struct {
	LessonID  string   `json:"lessonId"`
	Added     int      `json:"added"`
	YouTube   int      `json:"youtube"`
	Wikipedia int      `json:"wikipedia"`
	Warnings  []string `json:"warnings"`
}

const (
	enrichDefaultMax = 3
	enrichMaxPerKind = 10
	// enrichSearchMax is how many hits each search asks for, so enough remain
	// after the relevance filter drops the off-topic ones.
	enrichSearchMax = 20
)

// EnrichStore is the slice of store.Store the enrich handler needs. Keeping it
// narrow lets the unit test supply a small in-memory fake.
type EnrichStore interface {
	GetLesson(ctx context.Context, id string) (store.Lesson, error)
	GetTopic(ctx context.Context, id string) (store.Topic, error)
	GetSubject(ctx context.Context, id string) (store.Subject, error)
	GetLessonResourceByURL(ctx context.Context, arg store.GetLessonResourceByURLParams) (store.LessonResource, error)
	NextLessonResourcePosition(ctx context.Context, lessonID string) (int32, error)
	CreateLessonResource(ctx context.Context, arg store.CreateLessonResourceParams) (store.LessonResource, error)
}

// EnrichHandler processes "enrich" jobs. For each enabled provider it runs the
// searches of the lesson's [enrich.Plan], keeps only hits about the lesson's
// topic ([enrich.Plan.Relevant]), skips hits whose URL is already attached (the
// (lesson_id, url) uniqueness rule), and inserts the rest as source=enrich
// resources. A single
// provider failing is reported as a warning in the result so the other's
// resources still land; only when every attempted provider fails does the job
// itself fail.
type EnrichHandler struct {
	Store     EnrichStore
	YouTube   enrich.Provider // nil when YOUTUBE_API_KEY is not configured
	Wikipedia enrich.Provider
	Log       *log.Logger
}

// NewEnrichHandler builds an EnrichHandler. yt may be nil (YouTube is then
// skipped with a warning); logger may be nil (the standard logger is used).
func NewEnrichHandler(db EnrichStore, yt, wiki enrich.Provider, logger *log.Logger) *EnrichHandler {
	if logger == nil {
		logger = log.Default()
	}
	return &EnrichHandler{Store: db, YouTube: yt, Wikipedia: wiki, Log: logger}
}

// Handle runs the searches and returns an EnrichResult as the job result.
func (h *EnrichHandler) Handle(ctx context.Context, job Job, prog ProgressFunc) ([]byte, error) {
	if h.Store == nil {
		return nil, fmt.Errorf("enrich: store not configured")
	}

	var p EnrichPayload
	if len(job.Payload) > 0 {
		if err := json.Unmarshal(job.Payload, &p); err != nil {
			return nil, fmt.Errorf("enrich: decode payload: %w", err)
		}
	}
	if strings.TrimSpace(p.LessonID) == "" {
		return nil, fmt.Errorf("enrich: missing lesson id")
	}
	if p.MaxPerKind <= 0 {
		p.MaxPerKind = enrichDefaultMax
	}
	if p.MaxPerKind > enrichMaxPerKind {
		p.MaxPerKind = enrichMaxPerKind
	}

	lesson, err := h.Store.GetLesson(ctx, p.LessonID)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return nil, fmt.Errorf("enrich: lesson %s not found", p.LessonID)
		}
		return nil, fmt.Errorf("enrich: load lesson: %w", err)
	}

	// Names drive the searches and the relevance check; the lesson title is the
	// fallback when the topic row is gone (it defaults to the topic name at
	// creation).
	topicName := lesson.Title
	if t, err := h.Store.GetTopic(ctx, lesson.TopicID); err == nil && strings.TrimSpace(t.Name) != "" {
		topicName = t.Name
	}
	subjectName := ""
	if s, err := h.Store.GetSubject(ctx, lesson.SubjectID); err == nil {
		subjectName = s.Name
	}

	plan := enrich.NewPlan(topicName, subjectName, p.Query)

	_ = prog(ctx, 5)

	result := EnrichResult{LessonID: lesson.ID, Warnings: []string{}}
	var (
		attempted int
		failed    int
	)

	if p.YouTube {
		if h.YouTube == nil {
			result.Warnings = append(result.Warnings, "YouTube skipped: YOUTUBE_API_KEY not configured")
		} else {
			attempted++
			n, err := h.attach(ctx, lesson.ID, h.YouTube, plan, []string{plan.YouTubeQuery}, p.MaxPerKind)
			result.YouTube = n
			result.Added += n
			if err != nil {
				failed++
				h.Log.Printf("enrich: lesson %s: youtube: %v", lesson.ID, err)
				result.Warnings = append(result.Warnings, "YouTube: "+err.Error())
			}
		}
	}
	_ = prog(ctx, 50)

	if p.Wikipedia {
		if h.Wikipedia == nil {
			result.Warnings = append(result.Warnings, "Wikipedia skipped: provider not configured")
		} else {
			attempted++
			n, err := h.attach(ctx, lesson.ID, h.Wikipedia, plan, plan.WikipediaQueries, p.MaxPerKind)
			result.Wikipedia = n
			result.Added += n
			if err != nil {
				failed++
				h.Log.Printf("enrich: lesson %s: wikipedia: %v", lesson.ID, err)
				result.Warnings = append(result.Warnings, "Wikipedia: "+err.Error())
			}
		}
	}
	_ = prog(ctx, 95)

	// Every provider we actually tried failed: surface it as a job error so the
	// parent sees "error" rather than a quiet zero.
	if attempted > 0 && failed == attempted {
		return nil, fmt.Errorf("enrich: %s", strings.Join(result.Warnings, "; "))
	}

	_ = prog(ctx, 100)
	return json.Marshal(result)
}

// attach runs one provider's searches and inserts up to max new
// (not-yet-attached) hits that are about the lesson's topic. A failing search
// is skipped while another still answers; only when every search fails is the
// error returned. It returns how many were added; a store error is returned
// after any partial insert count so the caller can still report what landed.
func (h *EnrichHandler) attach(ctx context.Context, lessonID string, prov enrich.Provider, plan enrich.Plan, queries []string, max int) (int, error) {
	var (
		perQuery [][]enrich.Resource
		lastErr  error
		ok       int
	)
	for _, q := range queries {
		hits, err := prov.Search(ctx, q, enrichSearchMax)
		if err != nil {
			lastErr = err
			continue
		}
		ok++
		var keep []enrich.Resource
		for _, r := range hits {
			if r.URL != "" && plan.Relevant(r) {
				keep = append(keep, r)
			}
		}
		// Closest to the concept first ("Integer" before "Integer programming");
		// the search engine's order breaks ties.
		sort.SliceStable(keep, func(i, j int) bool { return plan.Score(keep[i]) < plan.Score(keep[j]) })
		perQuery = append(perQuery, keep)
	}
	if ok == 0 {
		if lastErr == nil {
			lastErr = errors.New("no search to run for this topic")
		}
		return 0, lastErr
	}

	// Take hits from each search in turn, so every concept of the topic gets a
	// share of the slots rather than the first one taking them all.
	var found []enrich.Resource
	seen := map[string]bool{}
	for i := 0; ; i++ {
		more := false
		for _, hits := range perQuery {
			if i >= len(hits) {
				continue
			}
			more = true
			if r := hits[i]; !seen[r.URL] {
				seen[r.URL] = true
				found = append(found, r)
			}
		}
		if !more {
			break
		}
	}

	added := 0
	for _, r := range found {
		if added == max {
			break
		}
		if _, err := h.Store.GetLessonResourceByURL(ctx, store.GetLessonResourceByURLParams{LessonID: lessonID, Url: r.URL}); err == nil {
			continue // already attached (by an earlier run or by hand)
		} else if !errors.Is(err, pgx.ErrNoRows) {
			return added, fmt.Errorf("check existing resource: %w", err)
		}
		pos, err := h.Store.NextLessonResourcePosition(ctx, lessonID)
		if err != nil {
			return added, fmt.Errorf("next position: %w", err)
		}
		title := strings.TrimSpace(r.Title)
		if title == "" {
			title = r.URL
		}
		if _, err := h.Store.CreateLessonResource(ctx, store.CreateLessonResourceParams{
			LessonID:     lessonID,
			Kind:         r.Kind,
			Title:        title,
			Url:          r.URL,
			Description:  optString(r.Description),
			ThumbnailUrl: optString(r.ThumbnailURL),
			ExternalID:   optString(r.ExternalID),
			Position:     pos,
			Source:       string(contracts.Enrich),
		}); err != nil {
			return added, fmt.Errorf("insert resource: %w", err)
		}
		added++
	}
	return added, nil
}

// optString maps an empty string to a NULL column value.
func optString(s string) *string {
	s = strings.TrimSpace(s)
	if s == "" {
		return nil
	}
	return &s
}
