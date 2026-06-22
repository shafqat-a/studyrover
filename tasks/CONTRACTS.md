# StudyRover — Frozen Contracts (Phase 1)

> The **OpenAPI 3.1 spec in `contracts/`** is the single source of truth. Every task reads it; none redefines a shape. Codegen turns it into Go types + a chi server interface (`oapi-codegen` → `backend/internal/contracts`) and a TS client (`openapi-typescript` → `frontend/src/api`). This file is the human-readable mirror; the YAML in `contracts/components/*.yaml` (one `C##` task each) is authoritative.

**Cross-language rule:** define a shape **once** in OpenAPI. Go and TS both consume the generated output. Field names are `camelCase` in JSON (Go structs use `json:"..."` tags from codegen). IDs are `string` (UUID/cuid). Timestamps are RFC 3339 `string`.

Each `components/*.yaml` declares schemas under `#/components/schemas`. W01 assembles them into `openapi.yaml` and runs codegen.

---

## Entities

### C01 Subject — `components/subject.yaml`
```
Subject:        { id, name(req), color?, icon?, description?, archived(bool, default false), createdAt }
CreateSubject:  { name(req), color?, icon?, description? }
```

### C02 Source — `components/source.yaml`
```
SourceType:   enum[file, notebooklm, text]
SourceStatus: enum[processing, ready]
Source:       { id, subjectId, type(SourceType), title, status(default ready), fileRef?, url?, text?, createdAt }
CreateSource: { subjectId, type, title, fileRef?, url?, text? }
```
Phase 1 manual: `text`/`notebooklm`/`file` accepted; file stores `fileRef` only (ingestion/OCR = P2).

### C03 Topic — `components/topic.yaml`
```
Topic:        { id, subjectId, name, sourceId?, pageStart?(int), pageEnd?(int), order(int), active(bool default true) }
CreateTopic:  { subjectId, name, sourceId?, pageStart?, pageEnd?, order? }
```
Constraint: if both pages present, `pageEnd >= pageStart` (validated in handler/core).

### C04 ExamDefinition — `components/examDefinition.yaml`
```
ExamType:    enum[gate, formal]
RewardStyle: enum[flat, scaled]
ExamDefinition: { id, subjectId, name, type(default gate),
                  scopeTopicIds(string[] default []),   # [] = whole subject
                  size(int default 20), passBar(int default 70),
                  cooldownMin(int default 10), rewardStyle(default flat), createdAt }
CreateExamDefinition: same minus id/createdAt; server applies defaults.
```
Defaults are spec §10. `size>=1`, `0<=passBar<=100`.

### C05 Question + Option — `components/question.yaml`
```
Difficulty: enum[easy, medium, hard]
Option:     { id, text }
Question:   { id, subjectId, topicId?, text, options(Option[] minItems 4),
              correctOptionId(must match an option id), difficulty(default medium), enabled(default true) }
CreateQuestion:    { subjectId, topicId?, text, options:[{text}](min 4), correctOptionIndex(int), difficulty? }
DeliveredQuestion: Question WITHOUT correctOptionId   # what the student receives
```
Server assigns option ids; grading is server-side only.

### C06 ExamAttempt + Answer — `components/attempt.yaml`
```
AttemptStatus: enum[in_progress, submitted]
Answer:        { questionId, selectedOptionId?, correct?(bool) }
PerTopicScore: { topicId, correct(int), total(int) }
ExamAttempt:   { id, examDefinitionId, studentId, status(default in_progress),
                 questionIds(string[]), answers(Answer[] default []),
                 scorePct?(int), passed?(bool), perTopic?(PerTopicScore[]),
                 cooldownUntil?, startedAt, submittedAt? }
StartAttempt:  { examDefinitionId, studentId }
SubmitAttempt: { answers: [{ questionId, selectedOptionId }] }
```

### C07 Student — `components/student.yaml`
```
Student:       { id, name, gradeLevel?, avatarUrl?, notes?, createdAt }
CreateStudent: { name, gradeLevel?, avatarUrl?, notes? }
```

### C08 Parent / Auth — `components/auth.yaml`
```
Parent:       { id, displayName, email, createdAt }
Credential:   { id, parentId, credentialId, publicKey, counter(int), isBackup(bool default false) }
RegisterBegin:{ displayName, email }
Session:      { role: enum[parent, student], id }
```
WebAuthn ceremony payloads are passed through as opaque JSON (handled by `go-webauthn` / `@simplewebauthn`); typed `object` in OpenAPI.

### C09 Settings (singleton) — `components/settings.yaml`
```
KnowledgeBackend: enum[notebooklm, gemini]
Settings: { id, rewardRateMinPerQ(int default 3),   # Guardian-side, stored now, unused until P3
            dailyCapHours(int default 3),            # Guardian-side
            defaultExamSize(int default 20), defaultPassBar(int default 70),
            defaultCooldownMin(int default 10),
            knowledgeBackend(default notebooklm), difficultyRamp(bool default false) }
```
Single source of the spec defaults. `L10 ResolveSettings` fills any missing field from these.

### C10 ScoreEvent — `components/scoreEvent.yaml`  *(the cross-boundary seam)*
> The **only** thing the future Guardian (Phase 3) consumes. Phase 1 produces it and stops. Get it right (spec §4, §14).
```
ScoreEvent: { attemptId, studentId, subjectId, examDefinitionId,
              scopeTopicIds(string[]), size(int), scorePct(int), passed(bool),
              perTopic(PerTopicScore[]), timestamp }
```
Contains **no** minutes/reward fields — that logic is Guardian-only.

### C11 Common — `components/common.yaml`
```
Problem:  { type, title, status(int), detail?, code }   # RFC 7807-ish error body
Code:     enum[VALIDATION, NOT_FOUND, UNAUTHORIZED, CONFLICT, INTERNAL]
Page<T>:  { items: T[], total(int), page(int), pageSize(int) }   # expressed per-resource (PageOfSubject, …)
PaginationParams: query page(default 1), pageSize(default 50, max 200)
```
Success responses return the resource / page directly with 2xx; errors return `Problem` with the matching HTTP status.

---

## REST API surface (Phase 1) — base path `/api`

JSON. Parent session required except student exam + student-auth endpoints. Validate bodies against the generated `Create*` types.

| Method + path | Body → Returns | Task |
|---|---|---|
| `GET /subjects` · `POST /subjects` | — → `PageOfSubject` · `CreateSubject` → `Subject` | A01 |
| `GET/PUT/DELETE /subjects/{id}` | `Subject` partial → `Subject` | A02 |
| `GET/POST /sources` (`?subjectId`) | `CreateSource` → `Source` | A03 |
| `GET/DELETE /sources/{id}` | → `Source` | A04 |
| `GET/POST /topics` (`?subjectId`) | `CreateTopic` → `Topic` | A05 |
| `GET/PUT/DELETE /topics/{id}` | partial → `Topic` | A06 |
| `GET/POST /exam-definitions` (`?subjectId`) | `CreateExamDefinition` → `ExamDefinition` | A07 |
| `GET/PUT/DELETE /exam-definitions/{id}` | partial → `ExamDefinition` | A08 |
| `GET/POST /questions` (`?subjectId&topicId`) | `CreateQuestion` → `Question` | A09 |
| `GET/PUT/DELETE /questions/{id}` | partial → `Question` | A10 |
| `GET/PUT /student` | `Student` partial → `Student` | A11 |
| `GET/PUT /settings` | `Settings` partial → `Settings` | A12 |
| `POST /attempts` | `StartAttempt` → `ExamAttempt` + `DeliveredQuestion[]` | A13 |
| `GET /attempts/{id}` | → `ExamAttempt` (delivered, no answers) | A14 |
| `POST /attempts/{id}/submit` | `SubmitAttempt` → `ExamAttempt` + `ScoreEvent` | A15 |
| `GET /attempts/{id}/result` | → graded `ExamAttempt` (answers revealed) | A16 |
| `GET /attempts` (`?studentId`) | → `PageOfExamAttempt` | A17 |
| `POST /auth/register` | begin/finish ceremony → `Session` | A18 |
| `POST /auth/login` | begin/finish ceremony → `Session` | A19 |
| `POST /auth/student` | `{studentId, pin?}` → `Session` | A20 |
| `GET /progress` (`?studentId`) | → mastery + streak + history | A21 |

---

## The exam loop (the Phase-1 spine)

```
P12 ExamStart → H08 → A13 POST /attempts
   → L04 AssembleExam (L08 SelectFromBank picks `size`, L05 ShuffleOptions) → persist ExamAttempt(in_progress)
   → return DeliveredQuestion[] (NO correctOptionId)
P13 ExamRun → answer → H08 → A15 POST /attempts/{id}/submit
   → L01 ScoreAttempt, L02 DidPass, L03 PerTopicBreakdown
   → fail ⇒ L06 CooldownUntil; L07 UpdateMastery; L11 BuildScoreEvent (C10)
   → persist + return graded attempt + ScoreEvent
P14 ExamResult → H08 → A16 GET result → score / pass / breakdown (time + cooldown UI only if Guardian on)
```

`L01–L11` (Go) + `A13/A15/A16` (Go) + `H08`/`P12–P14` (React) implement this and are built in parallel against the generated types.
