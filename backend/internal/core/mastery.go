package core

import "github.com/shafqat/studyrover/backend/internal/contracts"

// DefaultMasteryAlpha is the exponential-moving-average smoothing factor used by
// UpdateMastery when the caller passes a non-positive alpha. Higher values weigh
// recent performance more heavily.
const DefaultMasteryAlpha = 0.4

// TopicMastery is the core domain view of a student's mastery of one topic.
// Mastery is a smoothed correct-ratio in [0,1]; Attempts counts how many graded
// attempts have contributed to it. This is distinct from contracts.TopicMastery,
// which exposes mastery as a whole percentage for API responses.
type TopicMastery struct {
	TopicID  string
	Mastery  float64
	Attempts int
}

// UpdateMastery folds a new per-topic result into the prior mastery estimates
// using an exponential moving average (EMA) of the correct ratio.
//
// For each PerTopicScore the observed ratio is Correct/Total (a topic with zero
// questions is ignored). When a topic has no prior, its mastery seeds to the
// observed ratio; otherwise it updates as
//
//	mastery = (1-alpha)*prior + alpha*ratio
//
// so the estimate trends toward recent performance. alpha defaults to
// DefaultMasteryAlpha when not positive and is clamped to [0,1]. Topics present
// in prior but not in perTopic are carried through unchanged. The result is
// ordered with prior topics first (in their original order) followed by any
// newly seen topics in perTopic order.
//
// UpdateMastery is pure: it returns a fresh slice and mutates no input.
func UpdateMastery(prior []TopicMastery, perTopic []contracts.PerTopicScore, alpha float64) []TopicMastery {
	if alpha <= 0 {
		alpha = DefaultMasteryAlpha
	}
	if alpha > 1 {
		alpha = 1
	}

	out := make([]TopicMastery, len(prior))
	copy(out, prior)

	idx := make(map[string]int, len(out))
	for i, tm := range out {
		idx[tm.TopicID] = i
	}

	for _, pt := range perTopic {
		if pt.Total <= 0 {
			continue
		}
		ratio := float64(pt.Correct) / float64(pt.Total)
		if i, ok := idx[pt.TopicId]; ok {
			out[i].Mastery = (1-alpha)*out[i].Mastery + alpha*ratio
			out[i].Attempts++
			continue
		}
		idx[pt.TopicId] = len(out)
		out = append(out, TopicMastery{TopicID: pt.TopicId, Mastery: ratio, Attempts: 1})
	}
	return out
}
