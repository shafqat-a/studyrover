package enrich

import (
	"net/url"
	"regexp"
	"strings"
)

// youTubeIDRE matches a YouTube video id: 11 URL-safe base64 characters.
var youTubeIDRE = regexp.MustCompile(`^[A-Za-z0-9_-]{11}$`)

// YouTubeWatchURL returns the canonical watch-page URL for a video id.
func YouTubeWatchURL(id string) string {
	return "https://www.youtube.com/watch?v=" + id
}

// WikipediaArticleURL returns the canonical desktop article URL for a page key
// on the given language edition. The key is path-escaped so titles with
// spaces, parentheses or non-ASCII letters produce a valid URL.
func WikipediaArticleURL(lang, key string) string {
	if lang == "" {
		lang = "en"
	}
	u := url.URL{Scheme: "https", Host: lang + ".wikipedia.org", Path: "/wiki/" + key}
	// url.URL escapes parentheses in paths; Wikipedia's own canonical links keep
	// them literal ("Earth_(planet)"), so restore them for readability. Either
	// form resolves, and every code path canonicalises through here, so the
	// (lesson_id, url) uniqueness check stays consistent.
	return wikiParens.Replace(u.String())
}

var wikiParens = strings.NewReplacer("%28", "(", "%29", ")")

// parseURL parses raw, tolerating a missing scheme ("youtu.be/abc" → https).
func parseURL(raw string) (*url.URL, bool) {
	raw = strings.TrimSpace(raw)
	if raw == "" {
		return nil, false
	}
	if !strings.Contains(raw, "://") {
		raw = "https://" + raw
	}
	u, err := url.Parse(raw)
	if err != nil || u.Host == "" {
		return nil, false
	}
	if u.Scheme != "http" && u.Scheme != "https" {
		return nil, false
	}
	return u, true
}

// ParseYouTubeID extracts the video id from the common YouTube URL shapes:
//
//	https://www.youtube.com/watch?v=ID   (also youtube.com, m.youtube.com, music.youtube.com)
//	https://youtu.be/ID
//	https://www.youtube.com/shorts/ID
//	https://www.youtube.com/embed/ID     (also youtube-nocookie.com)
//	https://www.youtube.com/live/ID
//
// It returns ok=false for anything else, including YouTube URLs that are not
// a single video (channels, playlists without a video).
func ParseYouTubeID(raw string) (id string, ok bool) {
	u, ok := parseURL(raw)
	if !ok {
		return "", false
	}
	host := strings.ToLower(strings.TrimPrefix(u.Hostname(), "www."))

	var candidate string
	switch host {
	case "youtu.be":
		candidate = firstSegment(u.Path)
	case "youtube.com", "m.youtube.com", "music.youtube.com", "youtube-nocookie.com":
		segs := strings.Split(strings.Trim(u.Path, "/"), "/")
		switch {
		case len(segs) >= 1 && segs[0] == "watch":
			candidate = u.Query().Get("v")
		case len(segs) >= 2 && (segs[0] == "shorts" || segs[0] == "embed" || segs[0] == "live" || segs[0] == "v"):
			candidate = segs[1]
		}
	default:
		return "", false
	}
	if !youTubeIDRE.MatchString(candidate) {
		return "", false
	}
	return candidate, true
}

// firstSegment returns the first path segment of p without slashes.
func firstSegment(p string) string {
	p = strings.Trim(p, "/")
	if i := strings.IndexByte(p, '/'); i >= 0 {
		p = p[:i]
	}
	return p
}

// ParseWikipedia recognises a Wikipedia article URL and returns the language
// edition and page key:
//
//	https://en.wikipedia.org/wiki/Photosynthesis        → ("en", "Photosynthesis")
//	https://en.m.wikipedia.org/wiki/Photosynthesis      → ("en", "Photosynthesis")
//	https://de.wikipedia.org/w/index.php?title=Berlin   → ("de", "Berlin")
//	https://wikipedia.org/wiki/Earth                    → ("",   "Earth")
//
// lang is empty when the host carries no edition (the caller substitutes its
// configured default). Keys are percent-decoded with spaces normalised to
// underscores, the form the REST API expects.
func ParseWikipedia(raw string) (lang, key string, ok bool) {
	u, ok := parseURL(raw)
	if !ok {
		return "", "", false
	}
	host := strings.ToLower(u.Hostname())
	if host != "wikipedia.org" && !strings.HasSuffix(host, ".wikipedia.org") {
		return "", "", false
	}

	// Language is the first host label unless it is a generic prefix. The
	// mobile edition inserts ".m." after the language ("en.m.wikipedia.org").
	labels := strings.Split(strings.TrimSuffix(host, ".wikipedia.org"), ".")
	if host != "wikipedia.org" && labels[0] != "www" && labels[0] != "m" && labels[0] != "" {
		lang = labels[0]
	}

	switch {
	case strings.HasPrefix(u.Path, "/wiki/"):
		key = strings.TrimPrefix(u.Path, "/wiki/")
	case u.Path == "/w/index.php":
		key = u.Query().Get("title")
	default:
		return "", "", false
	}
	// u.Path is already percent-decoded by url.Parse; a trailing "#section" was
	// split off into u.Fragment. Normalise spaces the way MediaWiki does.
	key = strings.ReplaceAll(strings.TrimSpace(key), " ", "_")
	key = strings.Trim(key, "/")
	if key == "" || (strings.Contains(key, ":") && isSpecialNamespace(key)) {
		return "", "", false
	}
	return lang, key, true
}

// isSpecialNamespace reports whether a page key points at a non-article
// namespace (Special:, File:, Talk:, …) which makes no sense as a lesson
// resource.
func isSpecialNamespace(key string) bool {
	ns := strings.ToLower(key[:strings.IndexByte(key, ':')])
	switch ns {
	case "special", "file", "talk", "user", "user_talk", "wikipedia", "help", "category", "template", "portal", "draft", "mediawiki":
		return true
	}
	return false
}
