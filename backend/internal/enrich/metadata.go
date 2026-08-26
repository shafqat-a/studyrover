package enrich

import (
	"context"
	"errors"
	"fmt"
	"net/http"
	"net/url"
	"strings"
)

// DefaultYouTubeOEmbedBase is the origin of YouTube's keyless oEmbed endpoint.
const DefaultYouTubeOEmbedBase = "https://www.youtube.com"

// Metadata resolves a title, description and thumbnail for a URL the parent
// pasted by hand. Both lookups are best-effort and keyless: YouTube oEmbed and
// the Wikipedia page-summary REST endpoint.
type Metadata struct {
	client        *http.Client
	youTubeBase   string
	wikipediaBase string // empty = https://{lang}.wikipedia.org
}

// NewMetadata builds a resolver over client (nil = 10s-timeout default) that
// talks to the public endpoints.
func NewMetadata(client *http.Client) *Metadata {
	return &Metadata{client: httpClient(client), youTubeBase: DefaultYouTubeOEmbedBase}
}

// WithBaseURLs returns a copy pointed at alternative origins for the YouTube
// oEmbed endpoint and Wikipedia (one origin for every language). Tests use it
// with httptest servers; an empty argument keeps the default.
func (m *Metadata) WithBaseURLs(youTube, wikipedia string) *Metadata {
	cp := *m
	if youTube != "" {
		cp.youTubeBase = strings.TrimRight(youTube, "/")
	}
	if wikipedia != "" {
		cp.wikipediaBase = strings.TrimRight(wikipedia, "/")
	}
	return &cp
}

// YouTubeOEmbed fetches the title and thumbnail of a video via oEmbed. The
// returned Resource has Kind/URL/ExternalID set even when the lookup fails,
// so callers can fall back gracefully.
func (m *Metadata) YouTubeOEmbed(ctx context.Context, videoID string) (Resource, error) {
	r := Resource{Kind: KindYouTube, URL: YouTubeWatchURL(videoID), ExternalID: videoID}

	q := url.Values{}
	q.Set("url", r.URL)
	q.Set("format", "json")

	var wire struct {
		Title        string `json:"title"`
		AuthorName   string `json:"author_name"`
		ThumbnailURL string `json:"thumbnail_url"`
	}
	if err := getJSON(ctx, m.client, m.youTubeBase+"/oembed?"+q.Encode(), &wire); err != nil {
		return r, fmt.Errorf("youtube oembed: %w", err)
	}
	r.Title = strings.TrimSpace(wire.Title)
	r.ThumbnailURL = httpsURL(wire.ThumbnailURL)
	if a := strings.TrimSpace(wire.AuthorName); a != "" {
		r.Description = truncate("By "+a, descriptionLimit)
	}
	return r, nil
}

// WikipediaSummary fetches the summary of an article (title, short
// description, extract, thumbnail). As with YouTubeOEmbed, Kind/URL/ExternalID
// are populated on the returned value even on error.
func (m *Metadata) WikipediaSummary(ctx context.Context, lang, key string) (Resource, error) {
	lang = strings.ToLower(strings.TrimSpace(lang))
	if lang == "" {
		lang = "en"
	}
	r := Resource{Kind: KindWikipedia, URL: WikipediaArticleURL(lang, key), ExternalID: key}

	base := m.wikipediaBase
	if base == "" {
		base = wikipediaBase(lang)
	}
	endpoint := base + "/api/rest_v1/page/summary/" + url.PathEscape(key)

	var wire struct {
		Type        string `json:"type"`
		Title       string `json:"title"`
		Description string `json:"description"`
		Extract     string `json:"extract"`
		Thumbnail   *struct {
			Source string `json:"source"`
		} `json:"thumbnail"`
	}
	if err := getJSON(ctx, m.client, endpoint, &wire); err != nil {
		var se *StatusError
		if errors.As(err, &se) && se.Status == http.StatusNotFound {
			return r, fmt.Errorf("wikipedia summary: no such article %q", key)
		}
		return r, fmt.Errorf("wikipedia summary: %w", err)
	}
	r.Title = strings.TrimSpace(wire.Title)
	r.Description = joinDescription(wire.Description, wire.Extract)
	if wire.Thumbnail != nil {
		r.ThumbnailURL = httpsURL(wire.Thumbnail.Source)
	}
	return r, nil
}
