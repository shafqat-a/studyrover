package core

import "github.com/shafqat/studyrover/backend/internal/contracts"

// DefaultSettings holds the spec defaults for the settings singleton (CONTRACTS
// C09 / spec §10): reward rate 3 min/question, daily cap 3 hours, default exam
// size 20, pass bar 70%, cooldown 10 minutes, NotebookLM knowledge backend, and
// difficulty ramp off. The Id is intentionally empty so it is never imposed on a
// stored row.
var DefaultSettings = contracts.Settings{
	RewardRateMinPerQ:  3,
	DailyCapHours:      3,
	DefaultExamSize:    20,
	DefaultPassBar:     70,
	DefaultCooldownMin: 10,
	KnowledgeBackend:   contracts.KnowledgeBackendNotebooklm,
	DifficultyRamp:     false,
}

// ResolveSettings returns an effective Settings value, filling any missing or
// zero-valued field from DefaultSettings. Passing nil yields DefaultSettings
// (with an empty Id). When stored is provided, each numeric field that is zero
// and the knowledge backend when empty are replaced by the default; non-zero
// stored values win. DifficultyRamp is a real boolean preference and is taken
// from stored as-is. Id is preserved from stored.
//
// ResolveSettings is pure: it does not mutate stored.
func ResolveSettings(stored *contracts.Settings) contracts.Settings {
	if stored == nil {
		return DefaultSettings
	}
	out := *stored
	if out.RewardRateMinPerQ == 0 {
		out.RewardRateMinPerQ = DefaultSettings.RewardRateMinPerQ
	}
	if out.DailyCapHours == 0 {
		out.DailyCapHours = DefaultSettings.DailyCapHours
	}
	if out.DefaultExamSize == 0 {
		out.DefaultExamSize = DefaultSettings.DefaultExamSize
	}
	if out.DefaultPassBar == 0 {
		out.DefaultPassBar = DefaultSettings.DefaultPassBar
	}
	if out.DefaultCooldownMin == 0 {
		out.DefaultCooldownMin = DefaultSettings.DefaultCooldownMin
	}
	if out.KnowledgeBackend == "" {
		out.KnowledgeBackend = DefaultSettings.KnowledgeBackend
	}
	return out
}
