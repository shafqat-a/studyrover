package core

import "github.com/shafqat/studyrover/backend/internal/contracts"

// ScoreAttempt grades a set of answers against an answer key and returns the
// number of correct answers, the total number of answers, and the rounded
// percentage score (0–100).
//
// key maps a questionID to its correct optionID. An answer counts as correct
// only when it has a selected option that matches the key for its question.
// Answers whose question is absent from the key, or that have no selected
// option, count as incorrect.
//
// scorePct is round(correct/total*100). When total is 0 the score is 0.
// ScoreAttempt is pure: it reads its inputs and mutates nothing.
func ScoreAttempt(answers []contracts.Answer, key map[string]string) (correct, total int, scorePct int) {
	total = len(answers)
	for _, a := range answers {
		if a.SelectedOptionId == nil {
			continue
		}
		want, ok := key[a.QuestionId]
		if ok && want == *a.SelectedOptionId {
			correct++
		}
	}
	if total == 0 {
		return 0, 0, 0
	}
	scorePct = int((float64(correct)/float64(total))*100.0 + 0.5)
	return correct, total, scorePct
}
