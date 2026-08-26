// Package enrich finds and describes external learning resources (YouTube
// videos, Wikipedia articles) for a class lesson.
//
// It has two halves:
//
//   - Search providers ([YouTube], [Wikipedia]) implement [Provider] and back the
//     asynchronous "enrich" job: given a query they return ranked [Resource]s
//     the job attaches to the lesson.
//   - URL helpers ([ParseYouTubeID], [ParseWikipedia]) and the [Metadata]
//     fetchers (YouTube oEmbed, Wikipedia page summary) back the synchronous
//     "attach a resource by URL" endpoint: they recognise a pasted link and
//     fill in a title/thumbnail best-effort.
//
// Every outbound call is context-aware and bounded by a timeout; nothing here
// touches the database. Base URLs are overridable so tests run against
// httptest servers rather than the public APIs.
package enrich

import (
	"context"
	"encoding/json"
	"fmt"
	"html"
	"io"
	"net/http"
	"regexp"
	"strings"
	"time"
	"unicode"
)

// Resource kinds, matching the LessonResourceKind contract enum and the
// lesson_resource.kind CHECK constraint.
const (
	KindYouTube   = "youtube"
	KindWikipedia = "wikipedia"
	KindLink      = "link"
)

// UserAgent identifies StudyRover to the public APIs. Wikipedia in particular
// rejects (403) requests that carry no descriptive User-Agent.
const UserAgent = "StudyRover/1.0 (home study app; contact via repo)"

const (
	// requestTimeout bounds every outbound HTTP call made by this package.
	requestTimeout = 10 * time.Second
	// descriptionLimit caps the stored blurb so the lesson card stays short.
	descriptionLimit = 240
	// maxBody caps how much of a response body is read, guarding against a
	// misbehaving upstream.
	maxBody = 1 << 20
)

// Resource is a single external learning resource found by a Provider or
// resolved from a pasted URL. It is the provider-neutral shape the enrich job
// and the resource endpoint map onto lesson_resource rows.
type Resource struct {
	// Kind is one of KindYouTube, KindWikipedia or KindLink.
	Kind string
	// Title is the display title (video title / article title).
	Title string
	// URL is the canonical link (YouTube watch page, Wikipedia article URL).
	URL string
	// Description is a short blurb, already truncated to descriptionLimit.
	Description string
	// ThumbnailURL is an https image URL when the provider offers one.
	ThumbnailURL string
	// ExternalID is the YouTube video id or the Wikipedia page key; the UI uses
	// it to embed the video or link the mobile edition.
	ExternalID string
}

// Provider searches one source for resources matching a free-text query. max
// is the number of results wanted; implementations may return fewer.
type Provider interface {
	Search(ctx context.Context, query string, max int) ([]Resource, error)
}

// httpClient returns c, or a default client bounded by requestTimeout.
func httpClient(c *http.Client) *http.Client {
	if c != nil {
		return c
	}
	return &http.Client{Timeout: requestTimeout}
}

// getJSON performs a GET with the package User-Agent, decodes a 2xx JSON body
// into out and returns the status code plus the raw body for non-2xx responses
// (so callers can surface the API's own error message).
func getJSON(ctx context.Context, client *http.Client, url string, out any) error {
	ctx, cancel := context.WithTimeout(ctx, requestTimeout)
	defer cancel()

	req, err := http.NewRequestWithContext(ctx, http.MethodGet, url, nil)
	if err != nil {
		return err
	}
	req.Header.Set("User-Agent", UserAgent)
	req.Header.Set("Accept", "application/json")

	resp, err := client.Do(req)
	if err != nil {
		return err
	}
	defer resp.Body.Close()

	body, err := io.ReadAll(io.LimitReader(resp.Body, maxBody))
	if err != nil {
		return fmt.Errorf("read response: %w", err)
	}
	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		return &StatusError{Status: resp.StatusCode, Body: body}
	}
	if err := json.Unmarshal(body, out); err != nil {
		return fmt.Errorf("decode response: %w", err)
	}
	return nil
}

// StatusError is returned by the fetchers for a non-2xx upstream response. Body
// holds the raw response so provider-specific error messages can be extracted.
type StatusError struct {
	Status int
	Body   []byte
}

func (e *StatusError) Error() string {
	return fmt.Sprintf("upstream returned HTTP %d", e.Status)
}

// truncate shortens s to at most limit runes on a word boundary, appending an
// ellipsis when anything was cut. Whitespace is collapsed first so multi-line
// excerpts become a single tidy sentence.
func truncate(s string, limit int) string {
	s = strings.Join(strings.Fields(s), " ")
	if limit <= 0 {
		return s
	}
	runes := []rune(s)
	if len(runes) <= limit {
		return s
	}
	cut := runes[:limit]
	// Back up to the last space so we do not cut a word in half, unless that
	// would throw away most of the text.
	if i := lastSpace(cut); i > limit/2 {
		cut = cut[:i]
	}
	return strings.TrimRightFunc(string(cut), func(r rune) bool {
		return unicode.IsSpace(r) || unicode.IsPunct(r)
	}) + "…"
}

func lastSpace(rs []rune) int {
	for i := len(rs) - 1; i >= 0; i-- {
		if unicode.IsSpace(rs[i]) {
			return i
		}
	}
	return -1
}

var tagRE = regexp.MustCompile(`<[^>]*>`)

// stripHTML removes tags (Wikipedia's <span class="searchmatch"> highlights)
// and unescapes HTML entities.
func stripHTML(s string) string {
	return html.UnescapeString(tagRE.ReplaceAllString(s, ""))
}

// joinDescription combines a short description and a longer excerpt into one
// blurb ("description — excerpt"), skipping whichever half is empty.
func joinDescription(description, excerpt string) string {
	description = strings.TrimSpace(description)
	excerpt = strings.TrimSpace(excerpt)
	switch {
	case description == "":
		return truncate(excerpt, descriptionLimit)
	case excerpt == "":
		return truncate(description, descriptionLimit)
	default:
		return truncate(description+" — "+excerpt, descriptionLimit)
	}
}

// httpsURL normalises a protocol-relative ("//upload.wikimedia.org/…") or
// bare-host image URL to https.
func httpsURL(u string) string {
	u = strings.TrimSpace(u)
	switch {
	case u == "":
		return ""
	case strings.HasPrefix(u, "//"):
		return "https:" + u
	case strings.HasPrefix(u, "http://"):
		return "https://" + strings.TrimPrefix(u, "http://")
	default:
		return u
	}
}
