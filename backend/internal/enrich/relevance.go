package enrich

import (
	"regexp"
	"strings"
	"unicode"
)

// Plan is what the enrich job searches for one lesson, and how it decides
// whether a hit is about the lesson's topic. Search engines rank loosely (a
// Wikipedia full-text search for "Integers, powers and roots" returns "Plastic
// ratio"), so every hit must pass [Plan.Relevant] before it is attached.
type Plan struct {
	// Concepts are the topic's own ideas, e.g. "Computational thinking:
	// Decomposition and abstraction" → ["Decomposition", "abstraction"].
	Concepts []string
	// Strand is the label before a colon ("Computational thinking"), or "".
	Strand string
	// Field is the subject area used to steer searches ("computer science",
	// "mathematics"), or "" when it cannot be told from the subject name.
	Field string

	// WikipediaQueries are run one by one: one per concept, plus the strand.
	WikipediaQueries []string
	// YouTubeQuery is a single search (each one costs 100 quota units).
	YouTubeQuery string
}

// maxConcepts bounds the per-concept searches for a long topic name.
const maxConcepts = 5

// NewPlan derives the searches and relevance terms for a lesson. topic is the
// syllabus topic name and subject the subject name ("Math Class VII"). A
// non-empty override (the parent's own query) replaces the topic.
func NewPlan(topic, subject, override string) Plan {
	p := Plan{Field: fieldOf(subject)}

	text := strings.TrimSpace(override)
	if text == "" {
		text = strings.TrimSpace(topic)
		// "Strand: concepts" — the strand is broad; the concepts after the colon
		// are what the lesson is about.
		if i := strings.Index(text, ":"); i > 0 && strings.TrimSpace(text[i+1:]) != "" {
			p.Strand = strings.TrimSpace(text[:i])
			text = strings.TrimSpace(text[i+1:])
		}
	}
	for _, c := range conceptSplitRE.Split(text, -1) {
		c = strings.Trim(strings.TrimSpace(c), ".-–— ")
		if len(stems(c)) > 0 && len(p.Concepts) < maxConcepts {
			p.Concepts = append(p.Concepts, c)
		}
	}

	ctx := p.Field
	if ctx == "" {
		ctx = cleanSubject(subject)
	}
	for _, c := range p.Concepts {
		p.WikipediaQueries = append(p.WikipediaQueries, strings.TrimSpace(c+" "+ctx))
	}
	if len(stems(p.Strand)) > 1 {
		// A multi-word strand ("Computational thinking") is usually an article.
		p.WikipediaQueries = append(p.WikipediaQueries, p.Strand)
	}

	if override != "" {
		p.YouTubeQuery = strings.TrimSpace(override)
	} else {
		p.YouTubeQuery = strings.TrimSpace(strings.Join(p.Concepts, " ") + " " + cleanSubject(subject) + " lesson")
	}
	return p
}

// maxExtraWords is how many words a Wikipedia title may add to the concept it
// names: "Square root" and "Functional decomposition" are about the concept,
// "Euler's sum of powers conjecture" is not.
const maxExtraWords = 2

// Relevant reports whether a found resource is about the lesson's topic; see
// [Plan.Score].
func (p Plan) Relevant(r Resource) bool {
	return p.Score(r) >= 0
}

// Score rates how closely a found resource is about the lesson's topic: 0 is
// the concept itself ("Integer" for "Integers"), higher is further away, and
// -1 is not about the topic at all. A resource is about the topic when:
//   - its title names one of the concepts (every significant word of the
//     concept appears in the title), or the title is a multi-word strand
//     ("Computational thinking");
//   - for Wikipedia, the title adds at most maxExtraWords words to the concept,
//     and a bracketed qualifier, "Abstraction (philosophy)", matches the
//     subject field when the field is known;
//   - it is not a list/glossary/index page.
//
// YouTube titles are long ("Decomposition | Computational Thinking | KS3"), so
// they only need to name a concept and always score 0.
func (p Plan) Score(r Resource) int {
	title := strings.TrimSpace(r.Title)
	if title == "" {
		return -1
	}
	lower := strings.ToLower(title)
	for _, pre := range []string{"list of ", "lists of ", "glossary of ", "index of ", "outline of "} {
		if strings.HasPrefix(lower, pre) {
			return -1
		}
	}

	wiki := r.Kind == KindWikipedia
	base, qualifier := splitQualifier(title)
	if wiki && qualifier != "" && p.Field != "" && !qualifierFits(qualifier, p.Field) {
		return -1
	}

	words := stems(base)
	have := map[string]bool{}
	for _, s := range words {
		have[s] = true
	}
	best := -1
	for _, c := range p.Concepts {
		want := stems(c)
		if !containsAll(have, want) {
			continue
		}
		extra := len(have) - len(want)
		if !wiki {
			extra = 0
		}
		if extra <= maxExtraWords && (best < 0 || extra < best) {
			best = extra
		}
	}
	if strand := stems(p.Strand); len(strand) > 1 && strings.Join(words, " ") == strings.Join(strand, " ") {
		best = 0
	}
	return best
}

// conceptSplitRE splits "Integers, powers and roots" into its ideas.
var conceptSplitRE = regexp.MustCompile(`(?i)\s*(?:,|;|/|&|\band\b|\bor\b)\s*`)

// gradeRE drops school-year noise from a subject name ("Math Class VII").
var gradeRE = regexp.MustCompile(`(?i)\b(class|grade|year|form|standard|std|level|o|a|igcse|gcse|ks[1-4])\b|\b[ivx]+\b|\b\d+\b`)

// cleanSubject returns the subject name without class/grade words.
func cleanSubject(subject string) string {
	return strings.Join(strings.Fields(gradeRE.ReplaceAllString(subject, " ")), " ")
}

// fields maps subject words to the field Wikipedia uses in its bracketed
// qualifiers, "Decomposition (computer science)".
var fields = []struct {
	words []string
	field string
}{
	{[]string{"computing", "computer", "computers", "ict", "programming", "coding", "informatics"}, "computer science"},
	{[]string{"math", "maths", "mathematics", "algebra", "geometry", "arithmetic"}, "mathematics"},
	{[]string{"physics"}, "physics"},
	{[]string{"chemistry"}, "chemistry"},
	{[]string{"biology"}, "biology"},
	{[]string{"geography"}, "geography"},
	{[]string{"history"}, "history"},
	{[]string{"economics"}, "economics"},
}

// fieldOf names the subject's field, or "" when the subject is not known.
func fieldOf(subject string) string {
	for _, w := range strings.Fields(strings.ToLower(subject)) {
		w = strings.Trim(w, ".,()")
		for _, f := range fields {
			for _, fw := range f.words {
				if w == fw {
					return f.field
				}
			}
		}
	}
	return ""
}

// qualifierFits reports whether a bracketed qualifier belongs to the field:
// "(computer science)", "(programming)" and "(computing)" fit computer science.
func qualifierFits(qualifier, field string) bool {
	q := strings.ToLower(qualifier)
	if strings.Contains(q, field) {
		return true
	}
	for _, f := range fields {
		if f.field != field {
			continue
		}
		for _, w := range f.words {
			if strings.Contains(q, w) {
				return true
			}
		}
	}
	return false
}

// splitQualifier splits "Abstraction (computer science)" into the base title
// and the bracketed qualifier.
func splitQualifier(title string) (string, string) {
	if i := strings.LastIndex(title, " ("); i > 0 && strings.HasSuffix(title, ")") {
		return title[:i], title[i+2 : len(title)-1]
	}
	return title, ""
}

// stopWords carry no topic meaning on their own.
var stopWords = map[string]bool{
	"a": true, "an": true, "the": true, "of": true, "in": true, "on": true, "to": true,
	"for": true, "and": true, "or": true, "with": true, "by": true, "from": true,
	"at": true, "as": true, "is": true, "are": true, "its": true, "their": true,
	"introduction": true, "basic": true, "basics": true, "simple": true, "using": true,
}

// stems returns the significant words of s, lowercased and singularised.
func stems(s string) []string {
	words := strings.FieldsFunc(strings.ToLower(s), func(r rune) bool {
		return !unicode.IsLetter(r) && !unicode.IsDigit(r)
	})
	out := make([]string, 0, len(words))
	for _, w := range words {
		if stopWords[w] || len([]rune(w)) < 2 {
			continue
		}
		out = append(out, stem(w))
	}
	return out
}

// stem singularises a word so "integers", "roots" and "powers" match the
// article titles "Integer", "Nth root" and "Power".
func stem(w string) string {
	switch {
	case len(w) > 4 && strings.HasSuffix(w, "ies"):
		return w[:len(w)-3] + "y"
	case len(w) > 4 && (strings.HasSuffix(w, "ches") || strings.HasSuffix(w, "shes") || strings.HasSuffix(w, "xes") || strings.HasSuffix(w, "sses")):
		return w[:len(w)-2]
	case len(w) > 3 && strings.HasSuffix(w, "s") && !strings.HasSuffix(w, "ss") && !strings.HasSuffix(w, "us") && !strings.HasSuffix(w, "is"):
		return w[:len(w)-1]
	}
	return w
}

func containsAll(have map[string]bool, want []string) bool {
	if len(want) == 0 {
		return false
	}
	for _, w := range want {
		if !have[w] {
			return false
		}
	}
	return true
}
