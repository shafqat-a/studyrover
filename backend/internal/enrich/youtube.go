package enrich

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"html"
	"net/http"
	"net/url"
	"strconv"
	"strings"
)

// DefaultYouTubeAPIBase is the YouTube Data API v3 root.
const DefaultYouTubeAPIBase = "https://www.googleapis.com/youtube/v3"

// youTubeMaxResults is the most the search endpoint returns per page; we ask
// for up to twice the wanted count (capped here) so a few non-embeddable or
// duplicate hits still leave enough to fill the request.
const youTubeMaxResults = 10

// YouTube searches videos through the YouTube Data API v3 (search.list). It
// needs an API key (YOUTUBE_API_KEY); every search costs 100 quota units of
// the default 10,000/day, so callers keep result counts small.
type YouTube struct {
	key     string
	client  *http.Client
	baseURL string
}

// NewYouTube builds a YouTube provider. client may be nil (a 10s-timeout
// default is used) and baseURL may be empty (DefaultYouTubeAPIBase); tests pass
// an httptest server URL.
func NewYouTube(apiKey string, client *http.Client, baseURL string) *YouTube {
	if baseURL == "" {
		baseURL = DefaultYouTubeAPIBase
	}
	return &YouTube{key: apiKey, client: httpClient(client), baseURL: strings.TrimRight(baseURL, "/")}
}

// ErrNoYouTubeKey is returned by Search when the provider has no API key.
var ErrNoYouTubeKey = errors.New("youtube: YOUTUBE_API_KEY not configured")

// Search returns up to max embeddable, safe-search-filtered videos for query,
// most relevant first. A non-2xx response surfaces the API's own error
// message (typically "quotaExceeded").
func (y *YouTube) Search(ctx context.Context, query string, max int) ([]Resource, error) {
	if y.key == "" {
		return nil, ErrNoYouTubeKey
	}
	query = strings.TrimSpace(query)
	if query == "" {
		return nil, errors.New("youtube: empty query")
	}
	if max <= 0 {
		max = 3
	}
	want := max * 2
	if want > youTubeMaxResults {
		want = youTubeMaxResults
	}

	q := url.Values{}
	q.Set("part", "snippet")
	q.Set("type", "video")
	q.Set("safeSearch", "strict")
	q.Set("videoEmbeddable", "true")
	q.Set("relevanceLanguage", "en")
	q.Set("maxResults", strconv.Itoa(want))
	q.Set("q", query)
	q.Set("key", y.key)

	var wire youTubeSearchResponse
	if err := getJSON(ctx, y.client, y.baseURL+"/search?"+q.Encode(), &wire); err != nil {
		var se *StatusError
		if errors.As(err, &se) {
			return nil, fmt.Errorf("youtube: %s", youTubeErrorMessage(se))
		}
		return nil, fmt.Errorf("youtube: %w", err)
	}

	out := make([]Resource, 0, max)
	for _, it := range wire.Items {
		if it.ID.VideoID == "" {
			continue
		}
		thumb := it.Snippet.Thumbnails.Medium.URL
		if thumb == "" {
			thumb = it.Snippet.Thumbnails.Default.URL
		}
		out = append(out, Resource{
			Kind:         KindYouTube,
			Title:        html.UnescapeString(it.Snippet.Title),
			URL:          YouTubeWatchURL(it.ID.VideoID),
			Description:  truncate(html.UnescapeString(it.Snippet.Description), descriptionLimit),
			ThumbnailURL: httpsURL(thumb),
			ExternalID:   it.ID.VideoID,
		})
		if len(out) == max {
			break
		}
	}
	return out, nil
}

// youTubeErrorMessage digs the human-readable message out of a Data API error
// envelope ({"error":{"code":403,"message":"…","errors":[{"reason":"quotaExceeded"}]}}),
// falling back to the HTTP status.
func youTubeErrorMessage(se *StatusError) string {
	var env struct {
		Error struct {
			Message string `json:"message"`
			Errors  []struct {
				Reason string `json:"reason"`
			} `json:"errors"`
		} `json:"error"`
	}
	if err := json.Unmarshal(se.Body, &env); err == nil && env.Error.Message != "" {
		msg := strings.TrimSpace(env.Error.Message)
		if len(env.Error.Errors) > 0 && env.Error.Errors[0].Reason != "" {
			return fmt.Sprintf("HTTP %d (%s): %s", se.Status, env.Error.Errors[0].Reason, msg)
		}
		return fmt.Sprintf("HTTP %d: %s", se.Status, msg)
	}
	return se.Error()
}

// --- wire shapes -----------------------------------------------------------

type youTubeSearchResponse struct {
	Items []struct {
		ID struct {
			VideoID string `json:"videoId"`
		} `json:"id"`
		Snippet struct {
			Title       string `json:"title"`
			Description string `json:"description"`
			Thumbnails  struct {
				Default youTubeThumb `json:"default"`
				Medium  youTubeThumb `json:"medium"`
				High    youTubeThumb `json:"high"`
			} `json:"thumbnails"`
		} `json:"snippet"`
	} `json:"items"`
}

type youTubeThumb struct {
	URL string `json:"url"`
}
