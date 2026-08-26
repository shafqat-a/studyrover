package http

import (
	"context"
	"errors"
	"net/http"
	"net/url"
	"strings"
	"time"

	"github.com/jackc/pgx/v5"

	"github.com/shafqat/studyrover/backend/internal/auth"
	"github.com/shafqat/studyrover/backend/internal/contracts"
	"github.com/shafqat/studyrover/backend/internal/enrich"
	"github.com/shafqat/studyrover/backend/internal/store"
)

// metadataTimeout bounds the best-effort title/thumbnail lookup when a parent
// attaches a URL by hand; the request must not hang on YouTube or Wikipedia.
const metadataTimeout = 5 * time.Second

// AddLessonResource handles POST /lessons/{id}/resources: attaches a resource
// by URL. YouTube links (watch / youtu.be / shorts / embed) become kind
// youtube with the canonical watch URL and the video id, and Wikipedia
// article links become kind wikipedia with the page key; both get a title and
// thumbnail from the provider best-effort (oEmbed / page summary). Anything
// else is a plain link titled with its host. An explicit body.kind overrides
// detection. Duplicate URLs on the same lesson are a 409. Parent-guarded.
func (h *Handlers) AddLessonResource(w http.ResponseWriter, r *http.Request, id contracts.IdPath) {
	if _, ok := auth.ParentFromCtx(r.Context()); !ok {
		unauthorized(w)
		return
	}

	lesson, ok := h.loadLesson(w, r, id)
	if !ok {
		return
	}

	var body contracts.AddLessonResource
	if !decodeJSON(w, r, &body) {
		return
	}
	rawURL := strings.TrimSpace(body.Url)
	if rawURL == "" {
		badRequest(w, "url is required")
		return
	}
	if body.Kind != nil && !body.Kind.Valid() {
		badRequest(w, "kind must be youtube, wikipedia or link")
		return
	}

	res, problem := h.resolveLessonResource(r.Context(), rawURL, body)
	if problem != "" {
		badRequest(w, problem)
		return
	}

	// (lesson_id, url) is unique; check first for a clean 409.
	if _, err := h.Store.GetLessonResourceByURL(r.Context(), store.GetLessonResourceByURLParams{LessonID: lesson.ID, Url: res.URL}); err == nil {
		conflict(w, "that URL is already attached to the lesson")
		return
	} else if !errors.Is(err, pgx.ErrNoRows) {
		internalError(w, err.Error())
		return
	}

	pos, err := h.Store.NextLessonResourcePosition(r.Context(), lesson.ID)
	if err != nil {
		internalError(w, err.Error())
		return
	}
	created, err := h.Store.CreateLessonResource(r.Context(), store.CreateLessonResourceParams{
		LessonID:     lesson.ID,
		Kind:         res.Kind,
		Title:        res.Title,
		Url:          res.URL,
		Description:  nullable(res.Description),
		ThumbnailUrl: nullable(res.ThumbnailURL),
		ExternalID:   nullable(res.ExternalID),
		Position:     pos,
		Source:       string(contracts.Manual),
	})
	if err != nil {
		internalError(w, err.Error())
		return
	}
	writeJSON(w, http.StatusCreated, toContractLessonResource(created))
}

// resolveLessonResource turns a pasted URL (plus the optional explicit kind,
// title and description) into the resource to store. It returns a non-empty
// problem string for a 400.
func (h *Handlers) resolveLessonResource(ctx context.Context, rawURL string, body contracts.AddLessonResource) (enrich.Resource, string) {
	videoID, isVideo := enrich.ParseYouTubeID(rawURL)
	lang, key, isArticle := enrich.ParseWikipedia(rawURL)

	kind := enrich.KindLink
	switch {
	case body.Kind != nil:
		kind = string(*body.Kind)
	case isVideo:
		kind = enrich.KindYouTube
	case isArticle:
		kind = enrich.KindWikipedia
	}
	title := optStr(body.Title)

	var res enrich.Resource
	switch kind {
	case enrich.KindYouTube:
		if !isVideo {
			return res, "url is not a YouTube video link"
		}
		mctx, cancel := context.WithTimeout(ctx, metadataTimeout)
		defer cancel()
		// Best-effort: on failure the resource still has the canonical URL and
		// id, just a generic title.
		res, _ = h.lessonMetadata().YouTubeOEmbed(mctx, videoID)
		if title == "" {
			title = res.Title
		}
		if title == "" {
			title = "YouTube video"
		}

	case enrich.KindWikipedia:
		if !isArticle {
			return res, "url is not a Wikipedia article link"
		}
		if lang == "" {
			lang = h.lessonWikipediaLang()
		}
		mctx, cancel := context.WithTimeout(ctx, metadataTimeout)
		defer cancel()
		res, _ = h.lessonMetadata().WikipediaSummary(mctx, lang, key)
		if title == "" {
			title = res.Title
		}
		if title == "" {
			title = strings.ReplaceAll(key, "_", " ")
		}

	default:
		u, ok := parseHTTPURL(rawURL)
		if !ok {
			return res, "url must be an http(s) link"
		}
		res = enrich.Resource{Kind: enrich.KindLink, URL: u.String()}
		if title == "" {
			title = u.Host
		}
	}

	res.Title = title
	if d := optStr(body.Description); d != "" {
		res.Description = d
	}
	return res, ""
}

// parseHTTPURL parses a user-supplied link, tolerating a missing scheme, and
// accepts only http(s) URLs with a host.
func parseHTTPURL(raw string) (*url.URL, bool) {
	if !strings.Contains(raw, "://") {
		raw = "https://" + raw
	}
	u, err := url.Parse(raw)
	if err != nil || u.Host == "" || (u.Scheme != "http" && u.Scheme != "https") {
		return nil, false
	}
	return u, true
}

// nullable maps an empty string to a NULL column value.
func nullable(s string) *string {
	s = strings.TrimSpace(s)
	if s == "" {
		return nil
	}
	return &s
}

// DeleteLessonResource handles DELETE /lessons/{id}/resources/{resourceId}:
// detaches the resource. 404 when the lesson is missing or the resource is
// not attached to that lesson; 204 on success. Parent-guarded.
func (h *Handlers) DeleteLessonResource(w http.ResponseWriter, r *http.Request, id contracts.IdPath, resourceId string) {
	if _, ok := auth.ParentFromCtx(r.Context()); !ok {
		unauthorized(w)
		return
	}

	if _, ok := h.loadLesson(w, r, id); !ok {
		return
	}

	n, err := h.Store.DeleteLessonResource(r.Context(), store.DeleteLessonResourceParams{ID: resourceId, LessonID: id})
	if err != nil {
		internalError(w, err.Error())
		return
	}
	if n == 0 {
		notFound(w, "resource not found")
		return
	}
	w.WriteHeader(http.StatusNoContent)
}
