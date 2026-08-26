package enrich

import (
	"context"
	"errors"
	"fmt"
	"net/http"
	"net/url"
	"strconv"
	"strings"
)

// Wikipedia searches articles through the MediaWiki REST API
// (/w/rest.php/v1/search/page). No key is needed, but Wikimedia requires a
// descriptive User-Agent, which every request in this package carries.
type Wikipedia struct {
	lang    string
	client  *http.Client
	baseURL string
}

// NewWikipedia builds a provider for the given language edition ("en" when
// empty). client may be nil; baseURL overrides https://{lang}.wikipedia.org
// for tests.
func NewWikipedia(lang string, client *http.Client, baseURL string) *Wikipedia {
	lang = strings.ToLower(strings.TrimSpace(lang))
	if lang == "" {
		lang = "en"
	}
	if baseURL == "" {
		baseURL = wikipediaBase(lang)
	}
	return &Wikipedia{lang: lang, client: httpClient(client), baseURL: strings.TrimRight(baseURL, "/")}
}

// wikipediaBase is the public origin of a language edition.
func wikipediaBase(lang string) string {
	return "https://" + lang + ".wikipedia.org"
}

// Lang returns the edition this provider searches.
func (w *Wikipedia) Lang() string { return w.lang }

// Search returns up to max articles for query, best match first, skipping
// disambiguation pages.
func (w *Wikipedia) Search(ctx context.Context, query string, max int) ([]Resource, error) {
	query = strings.TrimSpace(query)
	if query == "" {
		return nil, errors.New("wikipedia: empty query")
	}
	if max <= 0 {
		max = 3
	}
	// Ask for a couple of spares so a skipped disambiguation page does not
	// leave the result short.
	limit := max + 2
	if limit > 20 {
		limit = 20
	}

	q := url.Values{}
	q.Set("q", query)
	q.Set("limit", strconv.Itoa(limit))

	var wire wikipediaSearchResponse
	if err := getJSON(ctx, w.client, w.baseURL+"/w/rest.php/v1/search/page?"+q.Encode(), &wire); err != nil {
		var se *StatusError
		if errors.As(err, &se) {
			return nil, fmt.Errorf("wikipedia: search returned HTTP %d", se.Status)
		}
		return nil, fmt.Errorf("wikipedia: %w", err)
	}

	out := make([]Resource, 0, max)
	for _, p := range wire.Pages {
		if p.Key == "" || isDisambiguation(p.Description) {
			continue
		}
		title := strings.TrimSpace(p.Title)
		if title == "" {
			title = strings.ReplaceAll(p.Key, "_", " ")
		}
		r := Resource{
			Kind:        KindWikipedia,
			Title:       title,
			URL:         WikipediaArticleURL(w.lang, p.Key),
			Description: joinDescription(p.Description, stripHTML(p.Excerpt)),
			ExternalID:  p.Key,
		}
		if p.Thumbnail != nil {
			r.ThumbnailURL = httpsURL(p.Thumbnail.URL)
		}
		out = append(out, r)
		if len(out) == max {
			break
		}
	}
	return out, nil
}

// isDisambiguation reports whether a page's short description marks it as a
// disambiguation page ("Topics referred to by the same term").
func isDisambiguation(description string) bool {
	d := strings.ToLower(description)
	return strings.Contains(d, "disambiguation") || strings.Contains(d, "referred to by the same term")
}

// --- wire shapes -----------------------------------------------------------

type wikipediaSearchResponse struct {
	Pages []struct {
		Key         string `json:"key"`
		Title       string `json:"title"`
		Excerpt     string `json:"excerpt"`
		Description string `json:"description"`
		Thumbnail   *struct {
			URL string `json:"url"`
		} `json:"thumbnail"`
	} `json:"pages"`
}
