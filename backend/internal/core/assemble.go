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
	selected := AssembleExamKeyed(def, bank, rng)
	delivered := make([]contracts.DeliveredQuestion, 0, len(selected))
	for _, q := range selected {
		delivered = append(delivered, StripKey(q))
	}
	return delivered
}

// AssembleExamKeyed is like AssembleExam but returns full Questions with the
// answer key intact (options shuffled). It backs both AssembleExam (which then
// strips the key for students) and the parent-only exam preview (where the
// parent is allowed to see the answers). It is pure and deterministic for a
// given rng.
func AssembleExamKeyed(def contracts.ExamDefinition, bank []contracts.Question, rng RNG) []contracts.Question {
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
	out := make([]contracts.Question, 0, len(selected))
	for _, q := range selected {
		out = append(out, ShuffleOptions(q, rng))
	}
	return out
}

// StripKey converts a full Question into a DeliveredQuestion, dropping the
// answer key (correctOptionId) so it is never leaked to a student client.
func StripKey(q contracts.Question) contracts.DeliveredQuestion {
	return contracts.DeliveredQuestion{
		Id:         q.Id,
		SubjectId:  q.SubjectId,
		TopicId:    q.TopicId,
		Text:       q.Text,
		Options:    q.Options,
		Difficulty: q.Difficulty,
		Enabled:    q.Enabled,
	}
}
