package knowledge

import (
	"github.com/shafqat/studyrover/backend/internal/contracts"
)

// Config carries the candidate backend implementations and the runaway-protection
// limits the selector needs to choose and wrap the active knowledge backend
// (2-F05).
//
// The concrete adapters live in sub-packages (knowledge/gemini, knowledge/notebooklm,
// knowledge/fake) that import this package for the [Source] interface and its
// domain types. To avoid an import cycle, the selector does NOT construct those
// adapters itself; the wiring step builds them (it can import every sub-package)
// and injects them here as ready-to-use [Source] values. Any candidate may be
// nil — a nil candidate simply means that backend is unavailable and selecting it
// falls back to Fake.
//
// Config separates the per-subject choice (which backend, taken from
// contracts.Settings.KnowledgeBackend) from operator-supplied infrastructure
// (the wired adapters and the cost guard).
type Config struct {
	// Gemini is the constructed Gemini-direct adapter (2-F04), or nil when the
	// Gemini API key is absent / the backend is not provisioned. Selecting
	// "gemini" with a nil Gemini falls back to Fake.
	Gemini Source
	// NotebookLM is the constructed NotebookLM-MCP adapter (2-F03), or nil when
	// the bridge endpoint is absent. Selecting "notebooklm" with a nil NotebookLM
	// falls back to Fake.
	NotebookLM Source
	// Fake is the deterministic fallback backend (2-F02). It must be non-nil:
	// selectBackend returns it whenever the chosen backend is unavailable, so the
	// platform keeps working without external services. When nil, New substitutes
	// a nil-safe noopSource that fails every call cleanly rather than panicking.
	Fake Source

	// Guard sets the per-day call/cost caps applied to whichever backend is
	// selected. The zero value disables all caps (the guard still wraps the
	// backend, so behaviour is identical to the bare adapter).
	Guard GuardLimits
}

// New selects the active knowledge backend from settings.KnowledgeBackend and the
// candidates in cfg, wraps it in the cost/rate [Guard], and returns it as a
// [Source] for DI (2-F05). Selection rules:
//
//   - "notebooklm" → cfg.NotebookLM when non-nil (2-F03); otherwise the fake.
//   - "gemini"     → cfg.Gemini when non-nil (2-F04); otherwise the fake.
//   - anything else (an unset/unknown backend, or a selected backend whose
//     adapter was not provisioned) → the fake (2-F02), so the platform keeps
//     working without external services.
//
// The returned Source is always non-nil and always guarded.
func New(settings contracts.Settings, cfg Config) Source {
	return NewGuard(selectBackend(settings, cfg), cfg.Guard)
}

// selectBackend resolves the concrete (unguarded) backend for the configured
// choice, applying the graceful-degradation fallbacks documented on New. It never
// returns nil: a missing Fake becomes a noopSource so the guard never wraps nil.
func selectBackend(settings contracts.Settings, cfg Config) Source {
	fallback := cfg.Fake
	if fallback == nil {
		fallback = noopSource{}
	}

	switch settings.KnowledgeBackend {
	case contracts.KnowledgeBackendNotebooklm:
		if cfg.NotebookLM != nil {
			return cfg.NotebookLM
		}
		return fallback

	case contracts.KnowledgeBackendGemini:
		if cfg.Gemini != nil {
			return cfg.Gemini
		}
		return fallback

	default:
		return fallback
	}
}
