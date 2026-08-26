package enrich

import (
	"context"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
)

// --- URL parsing -------------------------------------------------------------

func TestParseYouTubeID(t *testing.T) {
	cases := []struct {
		in   string
		want string
		ok   bool
	}{
		{"https://www.youtube.com/watch?v=dQw4w9WgXcQ", "dQw4w9WgXcQ", true},
		{"https://youtube.com/watch?v=dQw4w9WgXcQ&t=42s", "dQw4w9WgXcQ", true},
		{"https://m.youtube.com/watch?v=dQw4w9WgXcQ", "dQw4w9WgXcQ", true},
		{"https://youtu.be/dQw4w9WgXcQ", "dQw4w9WgXcQ", true},
		{"https://youtu.be/dQw4w9WgXcQ?si=abc", "dQw4w9WgXcQ", true},
		{"youtu.be/dQw4w9WgXcQ", "dQw4w9WgXcQ", true},
		{"https://www.youtube.com/shorts/dQw4w9WgXcQ", "dQw4w9WgXcQ", true},
		{"https://www.youtube.com/embed/dQw4w9WgXcQ", "dQw4w9WgXcQ", true},
		{"https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ", "dQw4w9WgXcQ", true},
		{"https://www.youtube.com/live/dQw4w9WgXcQ", "dQw4w9WgXcQ", true},
		{"https://www.youtube.com/channel/UCabc", "", false},
		{"https://www.youtube.com/playlist?list=PL123", "", false},
		{"https://www.youtube.com/watch?v=short", "", false},
		{"https://example.com/watch?v=dQw4w9WgXcQ", "", false},
		{"ftp://youtu.be/dQw4w9WgXcQ", "", false},
		{"", "", false},
	}
	for _, c := range cases {
		got, ok := ParseYouTubeID(c.in)
		if ok != c.ok || got != c.want {
			t.Errorf("ParseYouTubeID(%q) = (%q, %v), want (%q, %v)", c.in, got, ok, c.want, c.ok)
		}
	}
}

func TestParseWikipedia(t *testing.T) {
	cases := []struct {
		in       string
		lang     string
		key      string
		ok       bool
		wantURL  string
		checkURL bool
	}{
		{in: "https://en.wikipedia.org/wiki/Photosynthesis", lang: "en", key: "Photosynthesis", ok: true, wantURL: "https://en.wikipedia.org/wiki/Photosynthesis", checkURL: true},
		{in: "https://en.m.wikipedia.org/wiki/Photosynthesis", lang: "en", key: "Photosynthesis", ok: true},
		{in: "https://de.wikipedia.org/wiki/Berlin#Geschichte", lang: "de", key: "Berlin", ok: true},
		{in: "https://en.wikipedia.org/wiki/Earth_(planet)", lang: "en", key: "Earth_(planet)", ok: true, wantURL: "https://en.wikipedia.org/wiki/Earth_(planet)", checkURL: true},
		{in: "https://en.wikipedia.org/wiki/Sch%C3%B6nberg", lang: "en", key: "Schönberg", ok: true, wantURL: "https://en.wikipedia.org/wiki/Sch%C3%B6nberg", checkURL: true},
		{in: "https://en.wikipedia.org/w/index.php?title=Solar_System", lang: "en", key: "Solar_System", ok: true},
		{in: "https://wikipedia.org/wiki/Earth", lang: "", key: "Earth", ok: true},
		{in: "https://www.wikipedia.org/wiki/Earth", lang: "", key: "Earth", ok: true},
		{in: "https://en.wikipedia.org/wiki/Special:Random", ok: false},
		{in: "https://en.wikipedia.org/wiki/File:Earth.jpg", ok: false},
		{in: "https://en.wikipedia.org/", ok: false},
		{in: "https://en.wikipedia.org/wiki/", ok: false},
		{in: "https://example.org/wiki/Earth", ok: false},
		{in: "https://notwikipedia.org/wiki/Earth", ok: false},
	}
	for _, c := range cases {
		lang, key, ok := ParseWikipedia(c.in)
		if ok != c.ok || lang != c.lang || key != c.key {
			t.Errorf("ParseWikipedia(%q) = (%q, %q, %v), want (%q, %q, %v)", c.in, lang, key, ok, c.lang, c.key, c.ok)
		}
		if c.checkURL {
			if got := WikipediaArticleURL(lang, key); got != c.wantURL {
				t.Errorf("WikipediaArticleURL(%q, %q) = %q, want %q", lang, key, got, c.wantURL)
			}
		}
	}
}

// --- text helpers ------------------------------------------------------------

func TestTruncateAndStrip(t *testing.T) {
	long := strings.Repeat("word ", 100)
	got := truncate(long, 40)
	if len([]rune(got)) > 41 || !strings.HasSuffix(got, "…") {
		t.Errorf("truncate: got %q (len %d)", got, len([]rune(got)))
	}
	if got := truncate("short  text\nhere", 240); got != "short text here" {
		t.Errorf("truncate collapses whitespace: got %q", got)
	}
	if got := stripHTML(`The <span class="searchmatch">Earth</span> &amp; Moon`); got != "The Earth & Moon" {
		t.Errorf("stripHTML: got %q", got)
	}
	if got := httpsURL("//upload.wikimedia.org/x.jpg"); got != "https://upload.wikimedia.org/x.jpg" {
		t.Errorf("httpsURL: got %q", got)
	}
	if got := joinDescription("Planet", "Third rock"); got != "Planet — Third rock" {
		t.Errorf("joinDescription: got %q", got)
	}
	if got := joinDescription("", "Third rock"); got != "Third rock" {
		t.Errorf("joinDescription empty description: got %q", got)
	}
}

// --- YouTube provider --------------------------------------------------------

const youTubeFixture = `{"items":[
 {"id":{"kind":"youtube#video","videoId":"aaaaaaaaaaa"},
  "snippet":{"title":"Fractions &amp; Decimals","description":"` + longDescription + `",
   "thumbnails":{"default":{"url":"https://i.ytimg.com/vi/aaaaaaaaaaa/default.jpg"},"medium":{"url":"https://i.ytimg.com/vi/aaaaaaaaaaa/mqdefault.jpg"}}}},
 {"id":{"kind":"youtube#channel","channelId":"UCxyz"},"snippet":{"title":"A channel"}},
 {"id":{"kind":"youtube#video","videoId":"bbbbbbbbbbb"},
  "snippet":{"title":"Second","description":"d2","thumbnails":{"default":{"url":"http://i.ytimg.com/vi/bbbbbbbbbbb/default.jpg"}}}},
 {"id":{"kind":"youtube#video","videoId":"ccccccccccc"},"snippet":{"title":"Third","description":"d3","thumbnails":{}}}
]}`

const longDescription = "Learn how fractions work with lots of examples about pizza slices and chocolate bars and then move on to decimals and see how the two ideas are the same thing written differently and finally practise converting between the two forms with a short quiz at the end of the video for you to try"

func TestYouTubeSearch(t *testing.T) {
	var gotQuery, gotPath string
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		gotPath = r.URL.Path
		gotQuery = r.URL.RawQuery
		if r.Header.Get("User-Agent") != UserAgent {
			t.Errorf("User-Agent = %q", r.Header.Get("User-Agent"))
		}
		q := r.URL.Query()
		if q.Get("key") != "test-key" || q.Get("q") != "fractions lesson" || q.Get("part") != "snippet" ||
			q.Get("type") != "video" || q.Get("safeSearch") != "strict" || q.Get("videoEmbeddable") != "true" ||
			q.Get("relevanceLanguage") != "en" || q.Get("maxResults") != "4" {
			t.Errorf("unexpected query: %s", r.URL.RawQuery)
		}
		w.Header().Set("Content-Type", "application/json")
		_, _ = w.Write([]byte(youTubeFixture))
	}))
	defer srv.Close()

	yt := NewYouTube("test-key", srv.Client(), srv.URL)
	got, err := yt.Search(context.Background(), "fractions lesson", 2)
	if err != nil {
		t.Fatalf("Search: %v (path=%s query=%s)", err, gotPath, gotQuery)
	}
	if gotPath != "/search" {
		t.Errorf("path = %q", gotPath)
	}
	if len(got) != 2 {
		t.Fatalf("got %d results, want 2 (first `max`, channel skipped)", len(got))
	}
	first := got[0]
	if first.Kind != KindYouTube || first.ExternalID != "aaaaaaaaaaa" || first.URL != "https://www.youtube.com/watch?v=aaaaaaaaaaa" {
		t.Errorf("first mapping wrong: %+v", first)
	}
	if first.Title != "Fractions & Decimals" {
		t.Errorf("title not html-unescaped: %q", first.Title)
	}
	if first.ThumbnailURL != "https://i.ytimg.com/vi/aaaaaaaaaaa/mqdefault.jpg" {
		t.Errorf("thumbnail should prefer medium: %q", first.ThumbnailURL)
	}
	if n := len([]rune(first.Description)); n > descriptionLimit+1 || !strings.HasSuffix(first.Description, "…") {
		t.Errorf("description not truncated: len=%d %q", n, first.Description)
	}
	if got[1].ExternalID != "bbbbbbbbbbb" || got[1].ThumbnailURL != "https://i.ytimg.com/vi/bbbbbbbbbbb/default.jpg" {
		t.Errorf("second should fall back to default thumbnail (https): %+v", got[1])
	}
}

func TestYouTubeSearchMaxResultsCap(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if got := r.URL.Query().Get("maxResults"); got != "10" {
			t.Errorf("maxResults = %q, want 10 (cap)", got)
		}
		_, _ = w.Write([]byte(`{"items":[]}`))
	}))
	defer srv.Close()
	got, err := NewYouTube("k", srv.Client(), srv.URL).Search(context.Background(), "x", 8)
	if err != nil || len(got) != 0 {
		t.Fatalf("got %v, %v", got, err)
	}
}

func TestYouTubeSearchErrors(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusForbidden)
		_, _ = w.Write([]byte(`{"error":{"code":403,"message":"The request cannot be completed because you have exceeded your quota.","errors":[{"reason":"quotaExceeded","domain":"youtube.quota"}]}}`))
	}))
	defer srv.Close()

	_, err := NewYouTube("k", srv.Client(), srv.URL).Search(context.Background(), "x", 3)
	if err == nil || !strings.Contains(err.Error(), "quotaExceeded") || !strings.Contains(err.Error(), "exceeded your quota") {
		t.Errorf("expected quota error with API message, got %v", err)
	}

	if _, err := NewYouTube("", nil, srv.URL).Search(context.Background(), "x", 3); err != ErrNoYouTubeKey {
		t.Errorf("missing key: got %v", err)
	}
	if _, err := NewYouTube("k", srv.Client(), srv.URL).Search(context.Background(), "  ", 3); err == nil {
		t.Error("empty query should error")
	}
}

// --- Wikipedia provider ------------------------------------------------------

const wikipediaSearchFixture = `{"pages":[
 {"id":1,"key":"Fraction","title":"Fraction","excerpt":"A <span class=\"searchmatch\">fraction</span> represents a part of a whole &amp; more","description":"Ratio of two numbers","thumbnail":{"mimetype":"image/png","url":"//upload.wikimedia.org/wikipedia/commons/thumb/Cake.png"}},
 {"id":2,"key":"Fraction_(disambiguation)","title":"Fraction (disambiguation)","excerpt":"x","description":"Topics referred to by the same term","thumbnail":null},
 {"id":3,"key":"Rational_number","title":"Rational number","excerpt":"Quotient of two integers","description":null,"thumbnail":null},
 {"id":4,"key":"Decimal","title":"Decimal","excerpt":"Base ten","description":"Number system","thumbnail":null}
]}`

func TestWikipediaSearch(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.Header.Get("User-Agent") != UserAgent {
			t.Errorf("User-Agent = %q", r.Header.Get("User-Agent"))
		}
		if r.URL.Path != "/w/rest.php/v1/search/page" {
			t.Errorf("path = %q", r.URL.Path)
		}
		q := r.URL.Query()
		if q.Get("q") != "fractions" || q.Get("limit") != "4" {
			t.Errorf("unexpected query: %s", r.URL.RawQuery)
		}
		w.Header().Set("Content-Type", "application/json")
		_, _ = w.Write([]byte(wikipediaSearchFixture))
	}))
	defer srv.Close()

	wp := NewWikipedia("en", srv.Client(), srv.URL)
	got, err := wp.Search(context.Background(), "fractions", 2)
	if err != nil {
		t.Fatalf("Search: %v", err)
	}
	if len(got) != 2 {
		t.Fatalf("got %d results, want 2: %+v", len(got), got)
	}
	first := got[0]
	if first.Kind != KindWikipedia || first.ExternalID != "Fraction" || first.Title != "Fraction" ||
		first.URL != "https://en.wikipedia.org/wiki/Fraction" {
		t.Errorf("first mapping wrong: %+v", first)
	}
	if first.Description != "Ratio of two numbers — A fraction represents a part of a whole & more" {
		t.Errorf("description not cleaned: %q", first.Description)
	}
	if first.ThumbnailURL != "https://upload.wikimedia.org/wikipedia/commons/thumb/Cake.png" {
		t.Errorf("thumbnail prefix: %q", first.ThumbnailURL)
	}
	// Disambiguation page skipped; the next real article fills the slot.
	if got[1].ExternalID != "Rational_number" || got[1].Description != "Quotient of two integers" {
		t.Errorf("second mapping wrong: %+v", got[1])
	}
}

func TestWikipediaSearchError(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusForbidden)
	}))
	defer srv.Close()
	_, err := NewWikipedia("en", srv.Client(), srv.URL).Search(context.Background(), "x", 3)
	if err == nil || !strings.Contains(err.Error(), "403") {
		t.Errorf("expected HTTP 403 error, got %v", err)
	}
}

func TestWikipediaDefaults(t *testing.T) {
	w := NewWikipedia("", nil, "")
	if w.Lang() != "en" || w.baseURL != "https://en.wikipedia.org" {
		t.Errorf("defaults: lang=%q base=%q", w.Lang(), w.baseURL)
	}
	if got := NewWikipedia("DE", nil, "").baseURL; got != "https://de.wikipedia.org" {
		t.Errorf("lang base: %q", got)
	}
}

// --- Metadata fetchers -------------------------------------------------------

func TestMetadata(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		switch {
		case r.URL.Path == "/oembed":
			if r.URL.Query().Get("url") != "https://www.youtube.com/watch?v=dQw4w9WgXcQ" || r.URL.Query().Get("format") != "json" {
				t.Errorf("oembed query: %s", r.URL.RawQuery)
			}
			_, _ = w.Write([]byte(`{"title":"Never Gonna Give You Up","author_name":"Rick","thumbnail_url":"https://i.ytimg.com/vi/dQw4w9WgXcQ/hqdefault.jpg"}`))
		case r.URL.Path == "/api/rest_v1/page/summary/Earth_(planet)":
			_, _ = w.Write([]byte(`{"type":"standard","title":"Earth","description":"Third planet from the Sun","extract":"Earth is the third planet.","thumbnail":{"source":"https://upload.wikimedia.org/e.jpg"}}`))
		case strings.HasPrefix(r.URL.Path, "/api/rest_v1/page/summary/"):
			w.WriteHeader(http.StatusNotFound)
			_, _ = w.Write([]byte(`{"type":"https://mediawiki.org/wiki/HyperSwitch/errors/not_found"}`))
		default:
			w.WriteHeader(http.StatusNotFound)
		}
	}))
	defer srv.Close()

	m := NewMetadata(srv.Client()).WithBaseURLs(srv.URL, srv.URL)

	yt, err := m.YouTubeOEmbed(context.Background(), "dQw4w9WgXcQ")
	if err != nil {
		t.Fatalf("oembed: %v", err)
	}
	if yt.Title != "Never Gonna Give You Up" || yt.ThumbnailURL != "https://i.ytimg.com/vi/dQw4w9WgXcQ/hqdefault.jpg" ||
		yt.URL != "https://www.youtube.com/watch?v=dQw4w9WgXcQ" || yt.ExternalID != "dQw4w9WgXcQ" || yt.Description != "By Rick" {
		t.Errorf("oembed mapping: %+v", yt)
	}

	wp, err := m.WikipediaSummary(context.Background(), "en", "Earth_(planet)")
	if err != nil {
		t.Fatalf("summary: %v", err)
	}
	if wp.Title != "Earth" || wp.Description != "Third planet from the Sun — Earth is the third planet." ||
		wp.ThumbnailURL != "https://upload.wikimedia.org/e.jpg" || wp.URL != "https://en.wikipedia.org/wiki/Earth_(planet)" || wp.ExternalID != "Earth_(planet)" {
		t.Errorf("summary mapping: %+v", wp)
	}

	missing, err := m.WikipediaSummary(context.Background(), "en", "Nope_Nope")
	if err == nil || !strings.Contains(err.Error(), "no such article") {
		t.Errorf("missing article: err=%v", err)
	}
	if missing.URL != "https://en.wikipedia.org/wiki/Nope_Nope" || missing.Kind != KindWikipedia {
		t.Errorf("fallback fields should still be populated: %+v", missing)
	}
}
