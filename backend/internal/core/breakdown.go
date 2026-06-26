package core

import "github.com/shafqat/studyrover/backend/internal/contracts"

// UntopicedKey is the stable topic id used to group answers whose question is
// not associated with any topic.
const UntopicedKey = "untopiced"

// PerTopicBreakdown groups answers by topic and returns per-topic correct/total
// counts. qTopic maps a questionID to its topicID; questions absent from the map
// (or mapped to an empty topic) are grouped under the stable key "untopiced".
//
// An answer counts as correct when its Correct flag is set and true. The summed
// Total across all returned entries equals len(answers), and the summed Correct
// equals the number of answers flagged correct. Topics appear in the order their
// first answer is encountered, making the output deterministic.
//
// PerTopicBreakdown is pure: it reads its inputs and mutates nothing.
func PerTopicBreakdown(answers []contracts.Answer, qTopic map[string]string) []contracts.PerTopicScore {
	idx := make(map[string]int)
	out := make([]contracts.PerTopicScore, 0)

	for _, a := range answers {
		topic := qTopic[a.QuestionId]
		if topic == "" {
			topic = UntopicedKey
		}

		i, ok := idx[topic]
		if !ok {
			i = len(out)
			idx[topic] = i
			out = append(out, contracts.PerTopicScore{TopicId: topic})
		}

		out[i].Total++
		if a.Correct != nil && *a.Correct {
			out[i].Correct++
		}
	}

	return out
}
