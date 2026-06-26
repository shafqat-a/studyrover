// Package fake provides a deterministic, in-memory implementation of
// [knowledge.Source] so every Phase 2 feature and test can run offline with no
// API key, no hardware, and no network access (task 2-F04).
//
// The adapter derives all of its output from the request inputs and a fixed
// seed, so the same request always yields the same result. This makes it
// suitable both for local development (knowledge.New selecting the fake backend)
// and for unit tests of the orchestration, jobs, and HTTP layers (2-T01/04/05),
// which need a Source that behaves predictably without external dependencies.
//
// It intentionally produces plausible-looking but canned study guides,
// citations, syllabus suggestions, and question drafts. It never reaches the
// real LLM/OCR backends and never panics on malformed input — degrading to safe
// defaults instead, mirroring the graceful-degradation contract that the real
// adapters must honour.
package fake

import (
	"context"
	"crypto/sha256"
	"encoding/binary"
	"fmt"
	"math/rand/v2"
	"strings"

	"github.com/shafqat/studyrover/backend/internal/knowledge"
)

// Source is a deterministic, network-free implementation of
// [knowledge.Source]. The zero value is usable; use [New] to control the base
// seed used for jitter-free reproducibility across processes.
type Source struct {
	// seed is mixed into every per-request RNG so a given Source instance is
	// fully reproducible. Two Sources created with the same seed produce
	// identical output for identical requests.
	seed uint64
}

// compile-time assertion that *Source satisfies the knowledge seam.
var _ knowledge.Source = (*Source)(nil)

// New returns a fake Source seeded with seed. The same seed and the same
// request always produce the same result, which is what tests rely on. Passing
// a different seed shifts the canned-but-deterministic output (useful when a
// test wants two distinguishable fake backends).
func New(seed uint64) *Source {
	return &Source{seed: seed}
}

// rngFor builds a deterministic RNG keyed on the Source seed plus an arbitrary
// number of request fields. Determinism comes entirely from the inputs: no
// wall-clock, no global state, no entropy source.
func (s *Source) rngFor(parts ...string) *rand.Rand {
	h := sha256.New()
	var seedBuf [8]byte
	binary.LittleEndian.PutUint64(seedBuf[:], s.seed)
	_, _ = h.Write(seedBuf[:])
	for _, p := range parts {
		_, _ = h.Write([]byte{0}) // separator so ("a","b") != ("ab","")
		_, _ = h.Write([]byte(p))
	}
	sum := h.Sum(nil)
	lo := binary.LittleEndian.Uint64(sum[0:8])
	hi := binary.LittleEndian.Uint64(sum[8:16])
	return rand.New(rand.NewPCG(lo, hi))
}

// hashID produces a short, stable, opaque identifier from the given parts. It is
// used for synthetic job and draft IDs so callers get stable references without
// any randomness that varies between runs.
func hashID(prefix string, parts ...string) string {
	h := sha256.New()
	for _, p := range parts {
		_, _ = h.Write([]byte{0})
		_, _ = h.Write([]byte(p))
	}
	sum := h.Sum(nil)
	return fmt.Sprintf("%s_%x", prefix, sum[:8])
}

// keywords extracts up to n salient-looking words from text for use in canned
// output, so the generated material visibly relates to the input. It is purely
// lexical: it lowercases, splits on non-letters, drops stop words and very short
// tokens, and returns them in first-seen order (deterministic). When the input
// yields nothing usable it returns a single placeholder so downstream output is
// never empty.
func keywords(text string, n int) []string {
	if n <= 0 {
		n = 1
	}
	seen := make(map[string]struct{})
	var out []string
	var b strings.Builder
	flush := func() {
		if b.Len() == 0 {
			return
		}
		w := b.String()
		b.Reset()
		if len(w) < 4 {
			return
		}
		if _, stop := stopWords[w]; stop {
			return
		}
		if _, dup := seen[w]; dup {
			return
		}
		seen[w] = struct{}{}
		if len(out) < n {
			out = append(out, w)
		}
	}
	for _, r := range text {
		switch {
		case r >= 'a' && r <= 'z':
			b.WriteRune(r)
		case r >= 'A' && r <= 'Z':
			b.WriteRune(r - 'A' + 'a')
		default:
			flush()
			if len(out) >= n {
				return out
			}
		}
	}
	flush()
	if len(out) == 0 {
		return []string{"topic"}
	}
	return out
}

// stopWords is a tiny English stop list kept inline so the package has no data
// dependencies. It need not be exhaustive — it just keeps the canned output
// reading naturally.
var stopWords = map[string]struct{}{
	"this": {}, "that": {}, "with": {}, "from": {}, "have": {}, "will": {},
	"your": {}, "what": {}, "when": {}, "which": {}, "their": {}, "there": {},
	"about": {}, "would": {}, "could": {}, "should": {}, "these": {}, "those": {},
	"into": {}, "they": {}, "them": {}, "then": {}, "than": {}, "been": {},
}

// title upper-cases the first rune of a word for display in headings.
func title(w string) string {
	if w == "" {
		return w
	}
	r := []rune(w)
	if r[0] >= 'a' && r[0] <= 'z' {
		r[0] = r[0] - 'a' + 'A'
	}
	return string(r)
}

// requestText returns whatever free-text the IngestRequest carries, so syllabus
// and question derivation can key canned output off the same material a real
// backend would have extracted. For inline byte uploads it treats the data as
// text (the fake performs no real OCR/parsing); for link ingestion it falls back
// to the URL/filename.
func ingestText(req knowledge.IngestRequest) string {
	switch {
	case len(req.Data) > 0:
		return string(req.Data)
	case req.NotebookLMURL != "":
		return req.NotebookLMURL
	default:
		return req.Filename
	}
}

// Ingest accepts a document or link and returns a stable, deterministic JobID
// derived from the request. It performs no processing and never blocks on I/O —
// the worker that owns the job will later call the derivation methods to fill in
// results. The returned ID is reproducible for a given request so tests can
// assert on it.
func (s *Source) Ingest(ctx context.Context, req knowledge.IngestRequest) (knowledge.JobID, error) {
	if err := ctx.Err(); err != nil {
		return "", err
	}
	id := hashID("job", "ingest", req.SubjectID, req.Filename, req.StorageKey, req.NotebookLMURL, ingestText(req))
	return knowledge.JobID(id), nil
}

// DeriveSyllabus returns a small, deterministic topic tree for the subject. The
// node names are drawn from keywords found in the subject ID (and are stable for
// a given subject), and each top-level topic gets a couple of synthetic
// sub-topics so callers exercising the tree shape have realistic data.
func (s *Source) DeriveSyllabus(ctx context.Context, req knowledge.SyllabusRequest) ([]knowledge.TopicSuggestion, error) {
	if err := ctx.Err(); err != nil {
		return nil, err
	}
	kws := keywords(req.SubjectID+" introduction fundamentals methods analysis review", 4)
	rng := s.rngFor("syllabus", req.SubjectID)

	out := make([]knowledge.TopicSuggestion, 0, len(kws))
	page := 1
	for i, kw := range kws {
		span := 3 + rng.IntN(5) // 3..7 pages
		topic := knowledge.TopicSuggestion{
			Name:      title(kw),
			SourceID:  hashID("src", req.SubjectID),
			PageStart: page,
			PageEnd:   page + span,
			Order:     i,
		}
		// Two deterministic children per top-level topic.
		childKws := keywords(kw+" concepts examples practice", 2)
		cp := page
		for j, ck := range childKws {
			cspan := 1 + rng.IntN(3)
			topic.Children = append(topic.Children, knowledge.TopicSuggestion{
				Name:      title(ck) + " of " + title(kw),
				SourceID:  topic.SourceID,
				PageStart: cp,
				PageEnd:   cp + cspan,
				Order:     j,
			})
			cp += cspan + 1
		}
		out = append(out, topic)
		page += span + 1
	}
	return out, nil
}

// GenerateQuestions returns req.Count deterministic multiple-choice drafts
// grounded (synthetically) in the subject. Each draft has four options with one
// correct answer; the correct index, difficulty spread, and stem all derive
// deterministically from the request and the draft index, so a given request
// always yields the same drafts. Count is clamped to a sane range.
func (s *Source) GenerateQuestions(ctx context.Context, req knowledge.GenRequest) ([]knowledge.QuestionDraft, error) {
	if err := ctx.Err(); err != nil {
		return nil, err
	}
	count := req.Count
	if count <= 0 {
		count = 1
	}
	if count > 50 {
		count = 50
	}
	kws := keywords(req.SubjectID+" "+req.TopicID+" definition cause effect comparison application", count+3)

	difficulties := []string{"easy", "medium", "hard"}
	cite := knowledge.Citation{
		SourceID: hashID("src", req.SubjectID),
		Label:    "Study material for " + subjectLabel(req.SubjectID),
		Locator:  "p.1",
	}

	out := make([]knowledge.QuestionDraft, 0, count)
	for i := 0; i < count; i++ {
		rng := s.rngFor("question", req.SubjectID, req.TopicID, fmt.Sprintf("%d", i))
		kw := title(kws[i%len(kws)])

		diff := req.Difficulty
		if diff == "" {
			diff = difficulties[rng.IntN(len(difficulties))]
		}

		correct := rng.IntN(4)
		options := make([]knowledge.QuestionOption, 4)
		for o := 0; o < 4; o++ {
			if o == correct {
				options[o] = knowledge.QuestionOption{Text: fmt.Sprintf("The correct characterisation of %s", kw)}
			} else {
				options[o] = knowledge.QuestionOption{Text: fmt.Sprintf("A plausible but incorrect view of %s (#%d)", kw, o+1)}
			}
		}

		c := cite
		c.Locator = fmt.Sprintf("p.%d", 1+rng.IntN(20))
		out = append(out, knowledge.QuestionDraft{
			ID:                 hashID("draft", req.SubjectID, req.TopicID, fmt.Sprintf("%d", i)),
			SubjectID:          req.SubjectID,
			TopicID:            req.TopicID,
			Text:               fmt.Sprintf("Which statement best describes %s?", kw),
			Options:            options,
			CorrectOptionIndex: correct,
			Difficulty:         diff,
			Citations:          []knowledge.Citation{c},
		})
	}
	return out, nil
}

// GenerateStudyGuide returns a deterministic, citation-bearing markdown study
// guide for the subject (optionally a topic). The headings are derived from the
// subject/topic so the output visibly relates to the request, and it always
// carries at least one citation.
func (s *Source) GenerateStudyGuide(ctx context.Context, req knowledge.GuideRequest) (knowledge.StudyGuide, error) {
	if err := ctx.Err(); err != nil {
		return knowledge.StudyGuide{}, err
	}
	label := subjectLabel(req.SubjectID)
	scope := label
	if req.TopicID != "" {
		scope = subjectLabel(req.TopicID) + " (" + label + ")"
	}
	kws := keywords(req.SubjectID+" "+req.TopicID+" overview key concepts summary practice", 4)

	var md strings.Builder
	fmt.Fprintf(&md, "# Study Guide: %s\n\n", scope)
	md.WriteString("## Overview\n\n")
	fmt.Fprintf(&md, "This guide reviews the essentials of %s. Work through each section and check your understanding with the practice prompts.\n\n", scope)
	md.WriteString("## Key Concepts\n\n")
	for i, kw := range kws {
		fmt.Fprintf(&md, "%d. **%s** — a core idea you should be able to explain in your own words.\n", i+1, title(kw))
	}
	md.WriteString("\n## Summary\n\n")
	fmt.Fprintf(&md, "Mastering %s means connecting these concepts and applying them to new problems.\n", scope)

	srcID := hashID("src", req.SubjectID)
	citations := []knowledge.Citation{
		{SourceID: srcID, Label: "Course notes — " + label, Locator: "p.1"},
		{SourceID: srcID, Label: "Course notes — " + label, Locator: "p.7"},
	}

	return knowledge.StudyGuide{
		SubjectID: req.SubjectID,
		TopicID:   req.TopicID,
		Markdown:  md.String(),
		Citations: citations,
	}, nil
}

// AnswerGrounded streams a deterministic tutor answer over the returned channel.
// The reply is split into word-level deltas so callers (and the SSE helper,
// 2-F08) can exercise true incremental streaming; citations are attached to the
// terminal chunk. The stream respects ctx cancellation: if ctx is done the
// goroutine stops and the channel is closed. Any setup error is returned
// synchronously with a nil channel — the fake never has one, so err is always
// nil here.
func (s *Source) AnswerGrounded(ctx context.Context, req knowledge.AskRequest) (<-chan knowledge.AnswerChunk, error) {
	if err := ctx.Err(); err != nil {
		return nil, err
	}

	answer := s.cannedAnswer(req)
	srcID := hashID("src", req.SubjectID)
	citations := []knowledge.Citation{
		{SourceID: srcID, Label: "Course material — " + subjectLabel(req.SubjectID), Locator: "p.3"},
	}

	out := make(chan knowledge.AnswerChunk)
	go func() {
		defer close(out)
		words := strings.Fields(answer)
		for i, w := range words {
			delta := w
			if i < len(words)-1 {
				delta += " "
			}
			select {
			case <-ctx.Done():
				return
			case out <- knowledge.AnswerChunk{Delta: delta}:
			}
		}
		select {
		case <-ctx.Done():
		case out <- knowledge.AnswerChunk{Citations: citations, Done: true}:
		}
	}()
	return out, nil
}

// cannedAnswer builds a deterministic, plausible tutor reply that echoes the
// student's question and references the subject, so the streamed output is both
// reproducible and visibly relevant.
func (s *Source) cannedAnswer(req knowledge.AskRequest) string {
	q := strings.TrimSpace(req.Text)
	if q == "" {
		q = "your question"
	}
	kws := keywords(req.Text+" "+req.SubjectID, 3)
	focus := strings.Join(mapTitle(kws), ", ")
	return fmt.Sprintf(
		"Great question about %s. In short: the key idea here involves %s. "+
			"Think of it step by step, and connect it back to what you already know. "+
			"Let me know if you would like a worked example.",
		strings.TrimSuffix(q, "?"), focus,
	)
}

// mapTitle title-cases each word in a slice (small helper for canned text).
func mapTitle(ws []string) []string {
	out := make([]string, len(ws))
	for i, w := range ws {
		out[i] = title(w)
	}
	return out
}

// subjectLabel renders an identifier into a friendlier display label for canned
// text. It strips common id punctuation and title-cases the remaining words; an
// empty id falls back to a generic label.
func subjectLabel(id string) string {
	id = strings.TrimSpace(id)
	if id == "" {
		return "this subject"
	}
	repl := strings.NewReplacer("-", " ", "_", " ", ".", " ", "/", " ")
	parts := strings.Fields(repl.Replace(id))
	if len(parts) == 0 {
		return id
	}
	for i, p := range parts {
		parts[i] = title(p)
	}
	return strings.Join(parts, " ")
}
