# 2-C04 — SyllabusSuggestion contract

- **Wave:** 2-contract · **Module:** contract · **Lang:** OpenAPI YAML · **Depends on:** F06

## Owns
- `contracts/components/syllabusSuggestion.yaml`

## Steps
1. `TopicSuggestion{name, sourceId?, pageStart?, pageEnd?, order, children?}` (recursive), `ApplySyllabusRequest{topics: TopicSuggestion[]}`.

## Acceptance
- [ ] Valid 3.1; recursive children supported; codegen emits types.
