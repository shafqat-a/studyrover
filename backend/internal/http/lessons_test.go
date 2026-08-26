package http

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"net/http/httptest"
	"sort"
	"strings"
	"sync"
	"testing"
	"time"

	"github.com/jackc/pgx/v5"

	"github.com/shafqat/studyrover/backend/internal/auth"
	"github.com/shafqat/studyrover/backend/internal/contracts"
	"github.com/shafqat/studyrover/backend/internal/enrich"
	"github.com/shafqat/studyrover/backend/internal/jobs"
	"github.com/shafqat/studyrover/backend/internal/knowledge/fake"
	"github.com/shafqat/studyrover/backend/internal/store"
)

// --- fake store --------------------------------------------------------------

// lessonStore implements just the store.Store slice the lesson handlers (and
// the job queue's Enqueue) use. The embedded nil interface makes any other
// call panic loudly.
type lessonStore struct {
	store.Store
	mu        sync.Mutex
	subjects  map[string]store.Subject
	topics    map[string]store.Topic
	student   *store.Student
	lessons   map[string]store.Lesson
	resources map[string]store.LessonResource
	jobs      []store.Job
	seq       int
}

var lessonNow = time.Date(2026, 8, 26, 12, 0, 0, 0, time.UTC)

func newLessonStore() *lessonStore {
	grade := "Grade 5"
	return &lessonStore{
		subjects: map[string]store.Subject{
			"sub-1": {ID: "sub-1", Name: "Maths"},
			"sub-2": {ID: "sub-2", Name: "Science"},
		},
		topics: map[string]store.Topic{
			"top-1": {ID: "top-1", SubjectID: "sub-1", Name: "Fractions", Order: 0, Active: true},
			"top-2": {ID: "top-2", SubjectID: "sub-1", Name: "Decimals", Order: 1, Active: true},
			"top-3": {ID: "top-3", SubjectID: "sub-2", Name: "Cells", Order: 0, Active: true},
		},
		student:   &store.Student{ID: "stu-1", Name: "Maya", GradeLevel: &grade},
		lessons:   map[string]store.Lesson{},
		resources: map[string]store.LessonResource{},
	}
}

func (f *lessonStore) nextID(prefix string) string {
	f.seq++
	return fmt.Sprintf("%s-%d", prefix, f.seq)
}

func (f *lessonStore) GetSubject(_ context.Context, id string) (store.Subject, error) {
	if s, ok := f.subjects[id]; ok {
		return s, nil
	}
	return store.Subject{}, pgx.ErrNoRows
}

func (f *lessonStore) GetTopic(_ context.Context, id string) (store.Topic, error) {
	if t, ok := f.topics[id]; ok {
		return t, nil
	}
	return store.Topic{}, pgx.ErrNoRows
}

func (f *lessonStore) GetStudent(context.Context) (store.Student, error) {
	if f.student == nil {
		return store.Student{}, pgx.ErrNoRows
	}
	return *f.student, nil
}

func (f *lessonStore) GetLesson(_ context.Context, id string) (store.Lesson, error) {
	f.mu.Lock()
	defer f.mu.Unlock()
	if l, ok := f.lessons[id]; ok {
		return l, nil
	}
	return store.Lesson{}, pgx.ErrNoRows
}

func (f *lessonStore) GetLessonByTopic(_ context.Context, topicID string) (store.Lesson, error) {
	f.mu.Lock()
	defer f.mu.Unlock()
	for _, l := range f.lessons {
		if l.TopicID == topicID {
			return l, nil
		}
	}
	return store.Lesson{}, pgx.ErrNoRows
}

// sortedLessons mirrors the SQL ORDER BY t."order", t.name, l.id.
func (f *lessonStore) sortedLessons(subjectID string, publishedOnly bool) []store.Lesson {
	out := []store.Lesson{}
	for _, l := range f.lessons {
		if l.SubjectID != subjectID || (publishedOnly && l.Status != "published") {
			continue
		}
		out = append(out, l)
	}
	sort.Slice(out, func(i, j int) bool {
		ti, tj := f.topics[out[i].TopicID], f.topics[out[j].TopicID]
		if ti.Order != tj.Order {
			return ti.Order < tj.Order
		}
		return out[i].ID < out[j].ID
	})
	return out
}

func (f *lessonStore) ListLessonsBySubject(_ context.Context, subjectID string) ([]store.Lesson, error) {
	f.mu.Lock()
	defer f.mu.Unlock()
	return f.sortedLessons(subjectID, false), nil
}

func (f *lessonStore) ListPublishedLessonsBySubject(_ context.Context, subjectID string) ([]store.Lesson, error) {
	f.mu.Lock()
	defer f.mu.Unlock()
	return f.sortedLessons(subjectID, true), nil
}

func (f *lessonStore) CreateLesson(_ context.Context, arg store.CreateLessonParams) (store.Lesson, error) {
	f.mu.Lock()
	defer f.mu.Unlock()
	l := store.Lesson{ID: f.nextID("les"), SubjectID: arg.SubjectID, TopicID: arg.TopicID, Title: arg.Title, Markdown: arg.Markdown, Status: arg.Status, GeneratedAt: arg.GeneratedAt, CreatedAt: lessonNow, UpdatedAt: lessonNow}
	f.lessons[l.ID] = l
	return l, nil
}

func (f *lessonStore) UpdateLesson(_ context.Context, arg store.UpdateLessonParams) (store.Lesson, error) {
	f.mu.Lock()
	defer f.mu.Unlock()
	l, ok := f.lessons[arg.ID]
	if !ok {
		return store.Lesson{}, pgx.ErrNoRows
	}
	if arg.Title != nil {
		l.Title = *arg.Title
	}
	if arg.Markdown != nil {
		l.Markdown = *arg.Markdown
	}
	if arg.Status != nil {
		l.Status = *arg.Status
	}
	if arg.GeneratedAt.Valid {
		l.GeneratedAt = arg.GeneratedAt
	}
	l.UpdatedAt = lessonNow.Add(time.Minute)
	f.lessons[arg.ID] = l
	return l, nil
}

func (f *lessonStore) DeleteLesson(_ context.Context, id string) (int64, error) {
	f.mu.Lock()
	defer f.mu.Unlock()
	if _, ok := f.lessons[id]; !ok {
		return 0, nil
	}
	delete(f.lessons, id)
	for rid, r := range f.resources {
		if r.LessonID == id {
			delete(f.resources, rid)
		}
	}
	return 1, nil
}

func (f *lessonStore) sortedResources(match func(store.LessonResource) bool) []store.LessonResource {
	out := []store.LessonResource{}
	for _, r := range f.resources {
		if match(r) {
			out = append(out, r)
		}
	}
	sort.Slice(out, func(i, j int) bool {
		if out[i].LessonID != out[j].LessonID {
			return out[i].LessonID < out[j].LessonID
		}
		return out[i].Position < out[j].Position
	})
	return out
}

func (f *lessonStore) ListLessonResources(_ context.Context, lessonID string) ([]store.LessonResource, error) {
	f.mu.Lock()
	defer f.mu.Unlock()
	return f.sortedResources(func(r store.LessonResource) bool { return r.LessonID == lessonID }), nil
}

func (f *lessonStore) ListLessonResourcesBySubject(_ context.Context, subjectID string) ([]store.LessonResource, error) {
	f.mu.Lock()
	defer f.mu.Unlock()
	return f.sortedResources(func(r store.LessonResource) bool {
		l, ok := f.lessons[r.LessonID]
		return ok && l.SubjectID == subjectID
	}), nil
}

func (f *lessonStore) GetLessonResourceByURL(_ context.Context, arg store.GetLessonResourceByURLParams) (store.LessonResource, error) {
	f.mu.Lock()
	defer f.mu.Unlock()
	for _, r := range f.resources {
		if r.LessonID == arg.LessonID && r.Url == arg.Url {
			return r, nil
		}
	}
	return store.LessonResource{}, pgx.ErrNoRows
}

func (f *lessonStore) NextLessonResourcePosition(_ context.Context, lessonID string) (int32, error) {
	f.mu.Lock()
	defer f.mu.Unlock()
	next := int32(0)
	for _, r := range f.resources {
		if r.LessonID == lessonID && r.Position >= next {
			next = r.Position + 1
		}
	}
	return next, nil
}

func (f *lessonStore) CreateLessonResource(_ context.Context, arg store.CreateLessonResourceParams) (store.LessonResource, error) {
	f.mu.Lock()
	defer f.mu.Unlock()
	r := store.LessonResource{ID: f.nextID("res"), LessonID: arg.LessonID, Kind: arg.Kind, Title: arg.Title, Url: arg.Url, Description: arg.Description, ThumbnailUrl: arg.ThumbnailUrl, ExternalID: arg.ExternalID, Position: arg.Position, Source: arg.Source, CreatedAt: lessonNow}
	f.resources[r.ID] = r
	return r, nil
}

func (f *lessonStore) DeleteLessonResource(_ context.Context, arg store.DeleteLessonResourceParams) (int64, error) {
	f.mu.Lock()
	defer f.mu.Unlock()
	r, ok := f.resources[arg.ID]
	if !ok || r.LessonID != arg.LessonID {
		return 0, nil
	}
	delete(f.resources, arg.ID)
	return 1, nil
}

func (f *lessonStore) EnqueueJob(_ context.Context, arg store.EnqueueJobParams) (store.Job, error) {
	f.mu.Lock()
	defer f.mu.Unlock()
	j := store.Job{ID: f.nextID("job"), Type: arg.Type, Status: "queued", SubjectID: arg.SubjectID, CreatedAt: lessonNow, UpdatedAt: lessonNow}
	if b, ok := arg.Payload.([]byte); ok {
		j.Payload = b
	}
	f.jobs = append(f.jobs, j)
	return j, nil
}

// --- harness -----------------------------------------------------------------

type lessonEnv struct {
	st  *lessonStore
	h   *Handlers
	srv http.Handler
}

// newLessonEnv wires the handlers over the fake store, the deterministic fake
// knowledge backend and an httptest server standing in for the YouTube oEmbed
// and Wikipedia summary endpoints (so no test touches the network).
func newLessonEnv(t *testing.T) *lessonEnv {
	t.Helper()
	meta := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		switch {
		case r.URL.Path == "/oembed":
			_, _ = w.Write([]byte(`{"title":"Fractions for kids","author_name":"Maths Channel","thumbnail_url":"https://i.ytimg.com/vi/dQw4w9WgXcQ/hqdefault.jpg"}`))
		case r.URL.Path == "/api/rest_v1/page/summary/Fraction":
			_, _ = w.Write([]byte(`{"type":"standard","title":"Fraction","description":"Ratio of two numbers","extract":"A fraction represents a part of a whole.","thumbnail":{"source":"https://upload.wikimedia.org/cake.png"}}`))
		default:
			w.WriteHeader(http.StatusNotFound)
		}
	}))
	t.Cleanup(meta.Close)

	st := newLessonStore()
	e := &lessonEnv{st: st}
	e.h = &Handlers{
		Store:     st,
		Sessions:  auth.NewSessionManager("test-secret", "http://localhost"),
		Knowledge: fake.New(0),
		Jobs:      jobs.NewQueue(st),
		Lessons: &LessonDeps{
			WikipediaLang: "en",
			Metadata:      enrich.NewMetadata(meta.Client()).WithBaseURLs(meta.URL, meta.URL),
		},
	}
	e.srv = NewRouter(e.h)
	return e
}

// do performs a request as the given role ("" = anonymous) and decodes the
// JSON body into out when non-nil.
func (e *lessonEnv) do(t *testing.T, method, path string, body any, role auth.Role, out any) *httptest.ResponseRecorder {
	t.Helper()
	var buf bytes.Buffer
	if body != nil {
		if err := json.NewEncoder(&buf).Encode(body); err != nil {
			t.Fatal(err)
		}
	}
	req := httptest.NewRequest(method, "/api"+path, &buf)
	req.Header.Set("Content-Type", "application/json")
	if role != "" {
		cookieRec := httptest.NewRecorder()
		if err := e.h.Sessions.Issue(cookieRec, auth.Identity{Role: role, ID: "id-" + string(role)}); err != nil {
			t.Fatal(err)
		}
		for _, c := range cookieRec.Result().Cookies() {
			req.AddCookie(c)
		}
	}
	rec := httptest.NewRecorder()
	e.srv.ServeHTTP(rec, req)
	if out != nil && rec.Code < 300 && rec.Body.Len() > 0 {
		if err := json.Unmarshal(rec.Body.Bytes(), out); err != nil {
			t.Fatalf("%s %s: decode %q: %v", method, path, rec.Body.String(), err)
		}
	}
	return rec
}

func (e *lessonEnv) createLesson(t *testing.T, subjectID, topicID string, generate bool) contracts.Lesson {
	t.Helper()
	var out contracts.Lesson
	rec := e.do(t, http.MethodPost, "/subjects/"+subjectID+"/lessons", map[string]any{"topicId": topicID, "generate": generate}, auth.RoleParent, &out)
	if rec.Code != http.StatusCreated {
		t.Fatalf("create lesson: %d %s", rec.Code, rec.Body.String())
	}
	return out
}

func problemCode(t *testing.T, rec *httptest.ResponseRecorder) contracts.Code {
	t.Helper()
	var p contracts.Problem
	if err := json.Unmarshal(rec.Body.Bytes(), &p); err != nil {
		t.Fatalf("decode problem %q: %v", rec.Body.String(), err)
	}
	return p.Code
}

// --- tests -------------------------------------------------------------------

func TestCreateLessonGeneratesBody(t *testing.T) {
	e := newLessonEnv(t)

	var out contracts.Lesson
	rec := e.do(t, http.MethodPost, "/subjects/sub-1/lessons", map[string]any{"topicId": "top-1", "instructions": "keep it short"}, auth.RoleParent, &out)
	if rec.Code != http.StatusCreated {
		t.Fatalf("status %d: %s", rec.Code, rec.Body.String())
	}
	if out.SubjectId != "sub-1" || out.TopicId != "top-1" || out.Title != "Fractions" || out.Status != contracts.Draft {
		t.Errorf("lesson = %+v", out)
	}
	if out.GeneratedAt == nil {
		t.Error("generatedAt should be set when generated")
	}
	for _, section := range []string{"## Learning objectives", "## Introduction", "## Explanation", "## Worked examples", "## Key terms", "## Quick check", "<details>", "## Summary"} {
		if !strings.Contains(out.Markdown, section) {
			t.Errorf("markdown missing %q", section)
		}
	}
	// Names (not ids) and the student's grade reach the generator.
	if !strings.Contains(out.Markdown, "Fractions") || !strings.Contains(out.Markdown, "Maths") || !strings.Contains(out.Markdown, "Grade 5") || !strings.Contains(out.Markdown, "keep it short") {
		t.Errorf("markdown should mention topic, subject, grade and instructions: %q", out.Markdown)
	}
	if out.Resources == nil || len(out.Resources) != 0 {
		t.Errorf("resources should be an empty array, got %v", out.Resources)
	}
}

func TestCreateLessonValidation(t *testing.T) {
	e := newLessonEnv(t)

	// generate=false stores an empty body with no generatedAt.
	var out contracts.Lesson
	rec := e.do(t, http.MethodPost, "/subjects/sub-1/lessons", map[string]any{"topicId": "top-1", "generate": false, "title": "  My fractions  "}, auth.RoleParent, &out)
	if rec.Code != http.StatusCreated || out.Markdown != "" || out.GeneratedAt != nil || out.Title != "My fractions" {
		t.Errorf("generate=false: %d %+v", rec.Code, out)
	}

	// Second lesson for the same topic → 409.
	rec = e.do(t, http.MethodPost, "/subjects/sub-1/lessons", map[string]any{"topicId": "top-1"}, auth.RoleParent, nil)
	if rec.Code != http.StatusConflict || problemCode(t, rec) != contracts.CONFLICT {
		t.Errorf("duplicate: %d %s", rec.Code, rec.Body.String())
	}
	// Topic from another subject → 400.
	rec = e.do(t, http.MethodPost, "/subjects/sub-1/lessons", map[string]any{"topicId": "top-3"}, auth.RoleParent, nil)
	if rec.Code != http.StatusBadRequest {
		t.Errorf("foreign topic: %d %s", rec.Code, rec.Body.String())
	}
	// Unknown topic / subject → 404.
	if rec = e.do(t, http.MethodPost, "/subjects/sub-1/lessons", map[string]any{"topicId": "nope"}, auth.RoleParent, nil); rec.Code != http.StatusNotFound {
		t.Errorf("missing topic: %d", rec.Code)
	}
	if rec = e.do(t, http.MethodPost, "/subjects/nope/lessons", map[string]any{"topicId": "top-1"}, auth.RoleParent, nil); rec.Code != http.StatusNotFound {
		t.Errorf("missing subject: %d", rec.Code)
	}
	// Missing topicId → 400; student → 401; anonymous → 401.
	if rec = e.do(t, http.MethodPost, "/subjects/sub-1/lessons", map[string]any{}, auth.RoleParent, nil); rec.Code != http.StatusBadRequest {
		t.Errorf("no topicId: %d", rec.Code)
	}
	if rec = e.do(t, http.MethodPost, "/subjects/sub-1/lessons", map[string]any{"topicId": "top-2"}, auth.RoleStudent, nil); rec.Code != http.StatusUnauthorized {
		t.Errorf("student create: %d", rec.Code)
	}
	if rec = e.do(t, http.MethodPost, "/subjects/sub-1/lessons", map[string]any{"topicId": "top-2"}, "", nil); rec.Code != http.StatusUnauthorized {
		t.Errorf("anonymous create: %d", rec.Code)
	}
}

func TestListAndGetLessonsVisibility(t *testing.T) {
	e := newLessonEnv(t)
	l1 := e.createLesson(t, "sub-1", "top-2", false) // Decimals (order 1)
	l2 := e.createLesson(t, "sub-1", "top-1", false) // Fractions (order 0)
	e.createLesson(t, "sub-2", "top-3", false)

	// Publish Fractions and give it a resource.
	rec := e.do(t, http.MethodPut, "/lessons/"+l2.Id, map[string]any{"status": "published"}, auth.RoleParent, nil)
	if rec.Code != http.StatusOK {
		t.Fatalf("publish: %d %s", rec.Code, rec.Body.String())
	}
	rec = e.do(t, http.MethodPost, "/lessons/"+l2.Id+"/resources", map[string]any{"url": "https://example.com/notes", "title": "Notes"}, auth.RoleParent, nil)
	if rec.Code != http.StatusCreated {
		t.Fatalf("add resource: %d %s", rec.Code, rec.Body.String())
	}

	// Parent: both lessons in topic order, resources grouped.
	var list []contracts.Lesson
	if rec = e.do(t, http.MethodGet, "/subjects/sub-1/lessons", nil, auth.RoleParent, &list); rec.Code != http.StatusOK {
		t.Fatalf("parent list: %d", rec.Code)
	}
	if len(list) != 2 || list[0].Id != l2.Id || list[1].Id != l1.Id {
		t.Fatalf("parent list order: %+v", list)
	}
	if len(list[0].Resources) != 1 || list[0].Resources[0].Title != "Notes" || len(list[1].Resources) != 0 {
		t.Errorf("resources grouping: %+v", list)
	}

	// Student: only the published one.
	list = nil
	if rec = e.do(t, http.MethodGet, "/subjects/sub-1/lessons", nil, auth.RoleStudent, &list); rec.Code != http.StatusOK {
		t.Fatalf("student list: %d", rec.Code)
	}
	if len(list) != 1 || list[0].Id != l2.Id || list[0].Status != contracts.Published {
		t.Errorf("student list: %+v", list)
	}

	// Get: parent sees the draft; student gets 404 for it, 200 for published.
	if rec = e.do(t, http.MethodGet, "/lessons/"+l1.Id, nil, auth.RoleParent, nil); rec.Code != http.StatusOK {
		t.Errorf("parent get draft: %d", rec.Code)
	}
	if rec = e.do(t, http.MethodGet, "/lessons/"+l1.Id, nil, auth.RoleStudent, nil); rec.Code != http.StatusNotFound {
		t.Errorf("student get draft: %d", rec.Code)
	}
	var got contracts.Lesson
	if rec = e.do(t, http.MethodGet, "/lessons/"+l2.Id, nil, auth.RoleStudent, &got); rec.Code != http.StatusOK || len(got.Resources) != 1 {
		t.Errorf("student get published: %d %+v", rec.Code, got)
	}

	if rec = e.do(t, http.MethodGet, "/subjects/nope/lessons", nil, auth.RoleParent, nil); rec.Code != http.StatusNotFound {
		t.Errorf("missing subject list: %d", rec.Code)
	}
	if rec = e.do(t, http.MethodGet, "/subjects/sub-1/lessons", nil, "", nil); rec.Code != http.StatusUnauthorized {
		t.Errorf("anonymous list: %d", rec.Code)
	}
}

func TestUpdateAndDeleteLesson(t *testing.T) {
	e := newLessonEnv(t)
	l := e.createLesson(t, "sub-1", "top-1", true)

	var out contracts.Lesson
	rec := e.do(t, http.MethodPut, "/lessons/"+l.Id, map[string]any{"title": "Fractions 101", "markdown": "# hand written"}, auth.RoleParent, &out)
	if rec.Code != http.StatusOK || out.Title != "Fractions 101" || out.Markdown != "# hand written" || out.Status != contracts.Draft {
		t.Errorf("partial update: %d %+v", rec.Code, out)
	}
	if out.GeneratedAt == nil {
		t.Error("generatedAt must survive a partial update")
	}
	if rec = e.do(t, http.MethodPut, "/lessons/"+l.Id, map[string]any{"title": "   "}, auth.RoleParent, nil); rec.Code != http.StatusBadRequest {
		t.Errorf("empty title: %d", rec.Code)
	}
	if rec = e.do(t, http.MethodPut, "/lessons/"+l.Id, map[string]any{"status": "live"}, auth.RoleParent, nil); rec.Code != http.StatusBadRequest {
		t.Errorf("bad status: %d", rec.Code)
	}
	if rec = e.do(t, http.MethodPut, "/lessons/nope", map[string]any{"title": "x"}, auth.RoleParent, nil); rec.Code != http.StatusNotFound {
		t.Errorf("update missing: %d", rec.Code)
	}
	if rec = e.do(t, http.MethodPut, "/lessons/"+l.Id, map[string]any{"title": "x"}, auth.RoleStudent, nil); rec.Code != http.StatusUnauthorized {
		t.Errorf("student update: %d", rec.Code)
	}

	if rec = e.do(t, http.MethodDelete, "/lessons/"+l.Id, nil, auth.RoleStudent, nil); rec.Code != http.StatusUnauthorized {
		t.Errorf("student delete: %d", rec.Code)
	}
	if rec = e.do(t, http.MethodDelete, "/lessons/"+l.Id, nil, auth.RoleParent, nil); rec.Code != http.StatusNoContent {
		t.Errorf("delete: %d", rec.Code)
	}
	if rec = e.do(t, http.MethodDelete, "/lessons/"+l.Id, nil, auth.RoleParent, nil); rec.Code != http.StatusNotFound {
		t.Errorf("delete again: %d", rec.Code)
	}
}

func TestGenerateLesson(t *testing.T) {
	e := newLessonEnv(t)
	l := e.createLesson(t, "sub-1", "top-1", false)
	e.do(t, http.MethodPost, "/lessons/"+l.Id+"/resources", map[string]any{"url": "https://example.com/a", "title": "A"}, auth.RoleParent, nil)

	var out contracts.Lesson
	rec := e.do(t, http.MethodPost, "/lessons/"+l.Id+"/generate", map[string]any{"instructions": "focus on halves"}, auth.RoleParent, &out)
	if rec.Code != http.StatusOK {
		t.Fatalf("generate: %d %s", rec.Code, rec.Body.String())
	}
	if out.GeneratedAt == nil || !strings.Contains(out.Markdown, "## Learning objectives") || !strings.Contains(out.Markdown, "focus on halves") {
		t.Errorf("generated lesson: %+v", out)
	}
	if len(out.Resources) != 1 {
		t.Errorf("resources must be kept: %+v", out.Resources)
	}

	// Empty body is fine too.
	if rec = e.do(t, http.MethodPost, "/lessons/"+l.Id+"/generate", nil, auth.RoleParent, nil); rec.Code != http.StatusOK {
		t.Errorf("generate without body: %d %s", rec.Code, rec.Body.String())
	}
	if rec = e.do(t, http.MethodPost, "/lessons/nope/generate", nil, auth.RoleParent, nil); rec.Code != http.StatusNotFound {
		t.Errorf("generate missing: %d", rec.Code)
	}
	if rec = e.do(t, http.MethodPost, "/lessons/"+l.Id+"/generate", nil, auth.RoleStudent, nil); rec.Code != http.StatusUnauthorized {
		t.Errorf("student generate: %d", rec.Code)
	}
}

func TestEnrichLessonEnqueuesJob(t *testing.T) {
	e := newLessonEnv(t)
	l := e.createLesson(t, "sub-1", "top-1", false)

	var job contracts.Job
	rec := e.do(t, http.MethodPost, "/lessons/"+l.Id+"/enrich", map[string]any{"youtube": false, "maxPerKind": 5, "query": " fractions basics "}, auth.RoleParent, &job)
	if rec.Code != http.StatusAccepted {
		t.Fatalf("enrich: %d %s", rec.Code, rec.Body.String())
	}
	if job.Type != contracts.JobTypeEnrich || job.Status != contracts.JobStatusQueued || job.SubjectId != "sub-1" {
		t.Errorf("job = %+v", job)
	}
	if len(e.st.jobs) != 1 {
		t.Fatalf("jobs enqueued: %d", len(e.st.jobs))
	}
	var payload jobs.EnrichPayload
	if err := json.Unmarshal(e.st.jobs[0].Payload, &payload); err != nil {
		t.Fatalf("payload: %v", err)
	}
	if payload.LessonID != l.Id || payload.YouTube || !payload.Wikipedia || payload.MaxPerKind != 5 || payload.Query != "fractions basics" {
		t.Errorf("payload = %+v", payload)
	}

	// Defaults with no body.
	job = contracts.Job{}
	if rec = e.do(t, http.MethodPost, "/lessons/"+l.Id+"/enrich", nil, auth.RoleParent, &job); rec.Code != http.StatusAccepted {
		t.Fatalf("enrich default: %d %s", rec.Code, rec.Body.String())
	}
	payload = jobs.EnrichPayload{}
	_ = json.Unmarshal(e.st.jobs[1].Payload, &payload)
	if !payload.YouTube || !payload.Wikipedia || payload.MaxPerKind != 3 || payload.Query != "" {
		t.Errorf("default payload = %+v", payload)
	}

	if rec = e.do(t, http.MethodPost, "/lessons/"+l.Id+"/enrich", map[string]any{"maxPerKind": 11}, auth.RoleParent, nil); rec.Code != http.StatusBadRequest {
		t.Errorf("maxPerKind 11: %d", rec.Code)
	}
	if rec = e.do(t, http.MethodPost, "/lessons/"+l.Id+"/enrich", map[string]any{"youtube": false, "wikipedia": false}, auth.RoleParent, nil); rec.Code != http.StatusBadRequest {
		t.Errorf("no providers: %d", rec.Code)
	}
	if rec = e.do(t, http.MethodPost, "/lessons/nope/enrich", nil, auth.RoleParent, nil); rec.Code != http.StatusNotFound {
		t.Errorf("enrich missing: %d", rec.Code)
	}
	if rec = e.do(t, http.MethodPost, "/lessons/"+l.Id+"/enrich", nil, auth.RoleStudent, nil); rec.Code != http.StatusUnauthorized {
		t.Errorf("student enrich: %d", rec.Code)
	}
}

func TestAddLessonResourceDetectsKinds(t *testing.T) {
	e := newLessonEnv(t)
	l := e.createLesson(t, "sub-1", "top-1", false)
	path := "/lessons/" + l.Id + "/resources"

	// YouTube: canonical URL, id, oEmbed title + thumbnail.
	var res contracts.LessonResource
	rec := e.do(t, http.MethodPost, path, map[string]any{"url": "https://youtu.be/dQw4w9WgXcQ?si=xyz"}, auth.RoleParent, &res)
	if rec.Code != http.StatusCreated {
		t.Fatalf("youtube: %d %s", rec.Code, rec.Body.String())
	}
	if res.Kind != contracts.Youtube || res.Url != "https://www.youtube.com/watch?v=dQw4w9WgXcQ" || res.ExternalId == nil || *res.ExternalId != "dQw4w9WgXcQ" ||
		res.Title != "Fractions for kids" || res.ThumbnailUrl == nil || *res.ThumbnailUrl != "https://i.ytimg.com/vi/dQw4w9WgXcQ/hqdefault.jpg" ||
		res.Source != contracts.Manual || res.Position != 0 || res.LessonId != l.Id {
		t.Errorf("youtube resource = %+v", res)
	}
	// Same video via the watch URL → 409 (canonicalised).
	if rec = e.do(t, http.MethodPost, path, map[string]any{"url": "https://www.youtube.com/watch?v=dQw4w9WgXcQ&t=10"}, auth.RoleParent, nil); rec.Code != http.StatusConflict {
		t.Errorf("duplicate youtube: %d %s", rec.Code, rec.Body.String())
	}

	// Wikipedia: key, summary title/description/thumbnail; position increments.
	res = contracts.LessonResource{}
	rec = e.do(t, http.MethodPost, path, map[string]any{"url": "https://en.m.wikipedia.org/wiki/Fraction#History"}, auth.RoleParent, &res)
	if rec.Code != http.StatusCreated {
		t.Fatalf("wikipedia: %d %s", rec.Code, rec.Body.String())
	}
	if res.Kind != contracts.Wikipedia || res.Url != "https://en.wikipedia.org/wiki/Fraction" || *res.ExternalId != "Fraction" || res.Title != "Fraction" ||
		res.Description == nil || *res.Description != "Ratio of two numbers — A fraction represents a part of a whole." ||
		*res.ThumbnailUrl != "https://upload.wikimedia.org/cake.png" || res.Position != 1 {
		t.Errorf("wikipedia resource = %+v", res)
	}

	// Wikipedia article the summary endpoint does not know: falls back to the key.
	res = contracts.LessonResource{}
	rec = e.do(t, http.MethodPost, path, map[string]any{"url": "https://en.wikipedia.org/wiki/Mixed_number"}, auth.RoleParent, &res)
	if rec.Code != http.StatusCreated || res.Title != "Mixed number" || res.ThumbnailUrl != nil {
		t.Errorf("wikipedia fallback: %d %+v", rec.Code, res)
	}

	// Plain link: host title unless provided; explicit description kept.
	res = contracts.LessonResource{}
	rec = e.do(t, http.MethodPost, path, map[string]any{"url": "https://www.bbc.co.uk/bitesize/fractions", "description": "BBC page"}, auth.RoleParent, &res)
	if rec.Code != http.StatusCreated || res.Kind != contracts.Link || res.Title != "www.bbc.co.uk" || res.Description == nil || *res.Description != "BBC page" || res.ExternalId != nil {
		t.Errorf("link resource: %d %+v", rec.Code, res)
	}

	// Explicit kind wins over detection: a YouTube URL stored as a plain link.
	res = contracts.LessonResource{}
	rec = e.do(t, http.MethodPost, path, map[string]any{"url": "https://www.youtube.com/watch?v=aaaaaaaaaaa", "kind": "link", "title": "Just a link"}, auth.RoleParent, &res)
	if rec.Code != http.StatusCreated || res.Kind != contracts.Link || res.Title != "Just a link" || res.ExternalId != nil {
		t.Errorf("explicit link kind: %d %+v", rec.Code, res)
	}

	// Validation.
	if rec = e.do(t, http.MethodPost, path, map[string]any{"url": "https://example.com/x", "kind": "youtube"}, auth.RoleParent, nil); rec.Code != http.StatusBadRequest {
		t.Errorf("kind youtube with non-video url: %d", rec.Code)
	}
	if rec = e.do(t, http.MethodPost, path, map[string]any{"url": "https://example.com/x", "kind": "wikipedia"}, auth.RoleParent, nil); rec.Code != http.StatusBadRequest {
		t.Errorf("kind wikipedia with non-article url: %d", rec.Code)
	}
	if rec = e.do(t, http.MethodPost, path, map[string]any{"url": "   "}, auth.RoleParent, nil); rec.Code != http.StatusBadRequest {
		t.Errorf("empty url: %d", rec.Code)
	}
	if rec = e.do(t, http.MethodPost, path, map[string]any{"url": "https://example.com/x", "kind": "pdf"}, auth.RoleParent, nil); rec.Code != http.StatusBadRequest {
		t.Errorf("bad kind: %d", rec.Code)
	}
	if rec = e.do(t, http.MethodPost, "/lessons/nope/resources", map[string]any{"url": "https://example.com/x"}, auth.RoleParent, nil); rec.Code != http.StatusNotFound {
		t.Errorf("missing lesson: %d", rec.Code)
	}
	if rec = e.do(t, http.MethodPost, path, map[string]any{"url": "https://example.com/y"}, auth.RoleStudent, nil); rec.Code != http.StatusUnauthorized {
		t.Errorf("student add: %d", rec.Code)
	}

	// Everything is listed on the lesson in position order.
	var got contracts.Lesson
	if rec = e.do(t, http.MethodGet, "/lessons/"+l.Id, nil, auth.RoleParent, &got); rec.Code != http.StatusOK || len(got.Resources) != 5 {
		t.Fatalf("lesson resources: %d %+v", rec.Code, got.Resources)
	}
	for i, r := range got.Resources {
		if r.Position != i {
			t.Errorf("resource %d position %d", i, r.Position)
		}
	}
}

func TestDeleteLessonResource(t *testing.T) {
	e := newLessonEnv(t)
	l1 := e.createLesson(t, "sub-1", "top-1", false)
	l2 := e.createLesson(t, "sub-1", "top-2", false)

	var res contracts.LessonResource
	if rec := e.do(t, http.MethodPost, "/lessons/"+l1.Id+"/resources", map[string]any{"url": "https://example.com/a"}, auth.RoleParent, &res); rec.Code != http.StatusCreated {
		t.Fatalf("add: %d", rec.Code)
	}

	// Wrong lesson → 404 and the resource survives.
	if rec := e.do(t, http.MethodDelete, "/lessons/"+l2.Id+"/resources/"+res.Id, nil, auth.RoleParent, nil); rec.Code != http.StatusNotFound {
		t.Errorf("delete via other lesson: %d", rec.Code)
	}
	if rec := e.do(t, http.MethodDelete, "/lessons/"+l1.Id+"/resources/"+res.Id, nil, auth.RoleStudent, nil); rec.Code != http.StatusUnauthorized {
		t.Errorf("student delete: %d", rec.Code)
	}
	if rec := e.do(t, http.MethodDelete, "/lessons/"+l1.Id+"/resources/"+res.Id, nil, auth.RoleParent, nil); rec.Code != http.StatusNoContent {
		t.Errorf("delete: %d", rec.Code)
	}
	if rec := e.do(t, http.MethodDelete, "/lessons/"+l1.Id+"/resources/"+res.Id, nil, auth.RoleParent, nil); rec.Code != http.StatusNotFound {
		t.Errorf("delete again: %d", rec.Code)
	}
	if rec := e.do(t, http.MethodDelete, "/lessons/nope/resources/"+res.Id, nil, auth.RoleParent, nil); rec.Code != http.StatusNotFound {
		t.Errorf("missing lesson: %d", rec.Code)
	}
}
