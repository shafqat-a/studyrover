package core

import "github.com/shafqat/studyrover/backend/internal/contracts"

// AssembleExam builds the list of questions delivered to a student for a single
// attempt at def. It filters the supplied bank to the eligible pool, selects
// def.Size questions from it (rotating the bank via SelectFromBank), shuffles
// each question's options (L05) and strips the answer key so the correct option
// is never leaked to the client.
//
// Eligibility: a question is eligible when it is enabled and in scope. Scope is
// def.ScopeTopicIds; an empty scope means the whole subject (every enabled
// question qualifies). A scoped exam only includes questions whose TopicId is
// present in the scope set.
//
// The result holds at most def.Size DeliveredQuestion values. AssembleExam is
// deterministic for a given rng and is pure: it does not mutate def or bank.
func AssembleExam(def contracts.ExamDefinition, bank []contracts.Question, rng RNG) []contracts.DeliveredQuestion {
	scope := make(map[string]bool, len(def.ScopeTopicIds))
	for _, id := range def.ScopeTopicIds {
		scope[id] = true
	}
	wholeSubject := len(def.ScopeTopicIds) == 0

	pool := make([]contracts.Question, 0, len(bank))
	for _, q := range bank {
		if !q.Enabled {
			continue
		}
		if !wholeSubject {
			if q.TopicId == nil || !scope[*q.TopicId] {
				continue
			}
		}
		pool = append(pool, q)
	}

	selected := SelectFromBank(pool, def.Size, nil, rng)

	delivered := make([]contracts.DeliveredQuestion, 0, len(selected))
	for _, q := range selected {
		shuffled := ShuffleOptions(q, rng)
		delivered = append(delivered, contracts.DeliveredQuestion{
			Id:         shuffled.Id,
			SubjectId:  shuffled.SubjectId,
			TopicId:    shuffled.TopicId,
			Text:       shuffled.Text,
			Options:    shuffled.Options,
			Difficulty: shuffled.Difficulty,
			Enabled:    shuffled.Enabled,
		})
	}
	return delivered
}
