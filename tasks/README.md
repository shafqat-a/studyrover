# StudyRover — Parallel Task Plan (Phase 1)

> Phase 1 = the **tutoring core**: parent sets up subjects/topics/questions/exams, the student takes exams, the system produces **scores + mastery**. No Guardian, no internet gating yet (Phase 3). See `../docs/spec/StudyRover-Spec-and-Plan.md` §14.

This folder decomposes Phase 1 into **~120 micro-tasks**, each sized for a *simple* AI agent and designed to run **in parallel**. One file per task: `tasks/<ID>-<slug>.md`.

---

## Tech stack (decided)

**Node.js is build-time only — never the production server runtime.**

| Layer | Choice |
|---|---|
| **Backend (prod runtime)** | **Go** — chi router, `sqlc` + `pgx`, `go-webauthn` (FIDO2), `golang-migrate`. Compiles to a single static binary that serves the API **and** the built SPA (`go:embed`). |
| **Frontend** | **React + Vite SPA** (TypeScript, Tailwind, React Router, TanStack Query, `@simplewebauthn/browser`). Built with Node → static assets. No Node in prod. |
| **DB** | PostgreSQL. Schema via SQL migrations; queries via `sqlc` (generates type-safe Go). |
| **Contract** | **OpenAPI 3.1** as the single frozen source of truth. Multi-file via `$ref` (one schema per entity). Codegen: `oapi-codegen` → Go types + chi server interface; `openapi-typescript` → TS client. |
| **Build orchestration** | Makefile/Taskfile. Go for backend; pnpm+Vite for frontend; codegen step for both. |

### Repo layout
```
contracts/                OpenAPI 3.1 (the frozen contract)
  openapi.yaml            root (refs everything)            ← W01 owns
  components/*.yaml       one schema file per entity        ← C-tasks own
  oapi-codegen.yaml, openapi-ts config                      ← F06 owns
backend/                  Go module (prod runtime)
  cmd/server/main.go      minimal entrypoint                ← F02 owns
  cmd/seed/main.go        seed command                      ← F12 owns
  internal/core/          pure domain logic (one file/fn)   ← L-tasks own
  internal/http/          handlers (one file per endpoint)  ← A-tasks own
  internal/http/server.go chi router + middleware + static  ← W02 owns
  internal/store/         sqlc-generated + pool             ← W04 owns
  internal/contracts/     oapi-codegen output               ← W01 owns
  internal/auth/          sessions + webauthn               ← F09 owns
  db/migrations/*.sql     golang-migrate (one per table)    ← D-tasks own
  db/queries/*.sql        sqlc queries (one per table)      ← D-tasks own
frontend/                 React + Vite SPA (build-time Node only)
  src/api/                generated TS client               ← W01/W03 own
  src/components/*         presentational components         ← U-tasks own
  src/hooks/*             TanStack Query hooks              ← H-tasks own
  src/pages/*             routed pages                      ← P-tasks own
  src/app/                shell, router, providers          ← F11 own
tasks/                    these files
```

---

## The parallelism model (read this first)

100+ agents work at once **only because of three rules**. Do not break them.

1. **Frozen contract.** The OpenAPI spec (`contracts/`) is the one source of truth for every request/response shape, plus the `ScoreEvent`. Codegen produces Go types **and** the TS client from it, so backend and frontend never drift and neither waits on the other. A contract change is its own task that pauses dependents.
2. **Disjoint file ownership.** Every task lists the exact files it **OWNS**; no two overlap. Shared-file hotspots are pre-assigned to single owner tasks: OpenAPI is **multi-file `$ref`** (one schema/file), migrations are **one file per table** (fixed numeric prefixes — no collisions), Go handlers are **one file per endpoint** (methods on a `Handlers` struct whose definition lives in W02), components/hooks/pages are **one file each**. The chi router, the DI wiring, and codegen are owned by W-tasks.
3. **Build against the generated types, not your neighbor.** A handler or hook imports the generated type and works against it; nothing waits on another agent's running code. Frontend hooks mock fetch until the API is live.

---

## Wave structure

| Wave | Name | Tasks | Gate |
|---|---|---|---|
| **0** | Scaffold & foundation | `F01–F12` | Mostly serial. Must complete first. |
| **1** | Contract & schema | `C01–C11`, `D01–D12` | Parallel. Freezes interfaces. Gates 2–4. |
| **2a** | Core domain logic (Go) | `L01–L12` | Parallel. Pure funcs in `internal/core`. |
| **2b** | API handlers (Go) | `A01–A21` | Parallel. Need D + generated contract types. |
| **2c** | UI components (React) | `U01–U20` | Parallel. Need only Tailwind (F07). |
| **2d** | Client data hooks (React) | `H01–H10` | Parallel. Need generated TS client (W01). |
| **3** | Pages / screens (React) | `P01–P14` | Parallel. Compose U + H. |
| **4** | Tests & wiring | `T01–T08`, `W01–W04` | Some run continuously (W01 codegen, W02 router). |

**Critical path:** `F*` → (`C*`+`D*`) → W01 codegen → (`L*` ∥ `A*` ∥ `U*` ∥ `H*`) → `P*` → `T*`. UI (2c) and core (2a) start the instant Wave 1 freezes. Peak simultaneous work ≈ 60–80 tasks.

---

## How to dispatch an agent on a task

```
Read tasks/<ID>-<slug>.md and tasks/CONTRACTS.md. Implement ONLY the task.
Edit ONLY the files under "Owns". Import generated types from internal/contracts (Go)
or src/api (TS) — never redefine a contract shape. Do not edit any other file.
When done, ensure the task's Acceptance checks pass.
```
Suggested agent: `coder-agent` (foundation/contract tasks → stronger model; leaf `U*`/`L*` → simple-model-friendly). A task is **done** when Acceptance passes and only owned files changed.

---

## Full task index

### Wave 0 — Scaffold & foundation (serial)
| ID | Title | Owns (root) | Depends |
|---|---|---|---|
| F01 | Repo layout + Makefile + tooling | root configs | — |
| F02 | Go module init (`backend/`) + chi + config | backend base | F01 |
| F03 | Postgres + golang-migrate + sqlc setup | backend/db, sqlc.yaml | F02 |
| F04 | Go `internal/core` package + test conv. | backend/internal/core base | F02 |
| F05 | Frontend Vite + React + TS init | frontend base | F01 |
| F06 | OpenAPI scaffold + codegen pipeline | contracts/ config | F02,F05 |
| F07 | Tailwind + design tokens (frontend) | frontend tailwind | F05 |
| F08 | Test harness (Go test + Vitest + Playwright) | test config | F02–F05 |
| F09 | Backend auth: sessions + go-webauthn + mw | backend/internal/auth | F02 |
| F10 | CI + lint/format (golangci-lint, eslint) | .github, configs | F01 |
| F11 | Frontend app shell: router + providers | frontend/src/app | F05,F07 |
| F12 | Seed command (`cmd/seed`) | backend/cmd/seed | F03 |

### Wave 1 — Contract schemas (`contracts/components/*.yaml`, one file each)
| ID | Title | Owns | Depends |
|---|---|---|---|
| C01 | Subject schema | components/subject.yaml | F06 |
| C02 | Source schema | components/source.yaml | F06 |
| C03 | Topic schema | components/topic.yaml | F06 |
| C04 | ExamDefinition schema | components/examDefinition.yaml | F06 |
| C05 | Question + Option schema | components/question.yaml | F06 |
| C06 | ExamAttempt + Answer schema | components/attempt.yaml | F06 |
| C07 | Student schema | components/student.yaml | F06 |
| C08 | Parent/auth schema | components/auth.yaml | F06 |
| C09 | Settings schema | components/settings.yaml | F06 |
| C10 | **ScoreEvent** schema (cross-boundary) | components/scoreEvent.yaml | F06 |
| C11 | Error (problem) + pagination params | components/common.yaml | F06 |

### Wave 1 — DB schema (migrations + sqlc queries, one table each)
| ID | Title | Owns | Depends |
|---|---|---|---|
| D12 | Init migration (extensions, helpers) `0001` | db/migrations/0001_init.* | F03 |
| D10 | Parent + Credential `0002` | db/migrations/0002_parent.*, db/queries/parent.sql | F03,C08 |
| D09 | Student `0003` | 0003_student.*, queries/student.sql | F03,C07 |
| D11 | Settings `0004` | 0004_settings.*, queries/settings.sql | F03,C09 |
| D01 | Subject `0005` | 0005_subject.*, queries/subject.sql | F03,C01 |
| D02 | Source `0006` | 0006_source.*, queries/source.sql | F03,C02 |
| D03 | Topic `0007` | 0007_topic.*, queries/topic.sql | F03,C03 |
| D04 | ExamDefinition `0008` | 0008_exam_definition.*, queries/exam_definition.sql | F03,C04 |
| D05 | Question `0009` | 0009_question.*, queries/question.sql | F03,C05 |
| D06 | Option `0010` | 0010_option.*, queries/option.sql | F03,C05 |
| D07 | ExamAttempt `0011` | 0011_exam_attempt.*, queries/exam_attempt.sql | F03,C06 |
| D08 | Answer `0012` | 0012_answer.*, queries/answer.sql | F03,C06 |

### Wave 2a — Core domain logic (`backend/internal/core/*.go`)
| ID | Title | Owns | Depends |
|---|---|---|---|
| L01 | `ScoreAttempt` | core/score.go | C06 |
| L02 | `DidPass` | core/pass.go | C04,C06 |
| L03 | `PerTopicBreakdown` | core/breakdown.go | C03,C06 |
| L04 | `AssembleExam` | core/assemble.go | C04,C05 |
| L05 | `ShuffleOptions` | core/shuffle.go | C05 |
| L06 | `CooldownUntil` / `IsInCooldown` | core/cooldown.go | C04 |
| L07 | `UpdateMastery` | core/mastery.go | C03,C06 |
| L08 | `SelectFromBank` | core/bank.go | C05 |
| L09 | `SizePresets` / `MinutesForSize` | core/presets.go | C04 |
| L10 | `ResolveSettings` (defaults) | core/settings.go | C09 |
| L11 | `BuildScoreEvent` | core/scoreevent.go | C06,C10 |
| L12 | `ComputeStreak` | core/streak.go | C06 |

### Wave 2b — API handlers (`backend/internal/http/*.go`, one endpoint each)
| ID | Title | Owns | Depends |
|---|---|---|---|
| A01 | `GET/POST /subjects` | http/subjects.go | D01,W04 |
| A02 | `GET/PUT/DELETE /subjects/{id}` | http/subjects_id.go | D01 |
| A03 | `GET/POST /sources` | http/sources.go | D02 |
| A04 | `GET/DELETE /sources/{id}` | http/sources_id.go | D02 |
| A05 | `GET/POST /topics` | http/topics.go | D03 |
| A06 | `GET/PUT/DELETE /topics/{id}` | http/topics_id.go | D03 |
| A07 | `GET/POST /exam-definitions` | http/examdefs.go | D04 |
| A08 | `GET/PUT/DELETE /exam-definitions/{id}` | http/examdefs_id.go | D04 |
| A09 | `GET/POST /questions` | http/questions.go | D05,D06 |
| A10 | `GET/PUT/DELETE /questions/{id}` | http/questions_id.go | D05,D06 |
| A11 | `GET/PUT /student` | http/student.go | D09 |
| A12 | `GET/PUT /settings` | http/settings.go | D11,L10 |
| A13 | `POST /attempts` (start) | http/attempts_start.go | D07,L04,L08 |
| A14 | `GET /attempts/{id}` | http/attempts_get.go | D07 |
| A15 | `POST /attempts/{id}/submit` (grade) | http/attempts_submit.go | D07,D08,L01,L02,L03,L06,L07,L11 |
| A16 | `GET /attempts/{id}/result` | http/attempts_result.go | D07 |
| A17 | `GET /attempts` (history) | http/attempts_history.go | D07 |
| A18 | Parent WebAuthn register | http/auth_register.go | D10,F09 |
| A19 | Parent login | http/auth_login.go | D10,F09 |
| A20 | Student sign-in | http/auth_student.go | D09,F09 |
| A21 | `GET /progress` | http/progress.go | D07,L07,L12 |

### Wave 2c — UI components (`frontend/src/components/*.tsx`)
`U01 Button · U02 TextInput · U03 Select · U04 Textarea · U05 RadioGroup(MCQ) · U06 Card · U07 Dialog · U08 Table · U09 Tabs · U10 Badge · U11 ColorIconPicker · U12 FileUpload · U13 NumberStepper · U14 Toggle · U15 ProgressBar · U16 Toast · U17 Avatar · U18 EmptyState · U19 ConfirmDialog · U20 PageHeader` — each owns `frontend/src/components/<Name>.tsx`; depend on F07 (U19 → U07).

### Wave 2d — Client data hooks (`frontend/src/hooks/*.ts`, TanStack Query over generated client)
`H01 useSubjects · H02 useSources · H03 useTopics · H04 useExamDefinitions · H05 useQuestions · H06 useStudentProfile · H07 useSettings · H08 useExamAttempt · H09 useExamHistory · H10 useAuth` — each owns `frontend/src/hooks/<name>.ts`; depend on W01 (generated client).

### Wave 3 — Pages (`frontend/src/pages/*`, React Router)
| ID | Screen | Owns | Depends |
|---|---|---|---|
| P01 | Parent setup 1.1 | pages/ParentSetup.tsx | H10,A18 |
| P02 | Student sign-in 1.2 | pages/StudentSignIn.tsx | H10,A20 |
| P03 | Student profile 2.1 | pages/StudentProfile.tsx | H06 |
| P04 | Subjects list 2.2 | pages/Subjects.tsx | H01 |
| P05 | Subject detail + tabs 2.3 | pages/SubjectDetail.tsx | H01,U09 |
| P06 | Sources tab 2.4 | pages/SubjectSources.tsx | H02,U12 |
| P07 | Syllabus builder 2.5 | pages/SubjectSyllabus.tsx | H03 |
| P08 | Exam definitions 2.6 | pages/SubjectExams.tsx | H04 |
| P09 | Question bank 2.8 | pages/SubjectQuestions.tsx | H05,U05 |
| P10 | Settings 2.9 | pages/Settings.tsx | H07 |
| P11 | Student home 3.1 | pages/StudentHome.tsx | H01,H09 |
| P12 | Start exam 3.3 | pages/ExamStart.tsx | H08,H04 |
| P13 | Exam in progress 3.4 | pages/ExamRun.tsx | H08,U05 |
| P14 | Exam result 3.5 | pages/ExamResult.tsx | H08,U15 |

### Wave 4 — Tests & wiring
| ID | Title | Owns | Depends |
|---|---|---|---|
| T01 | Core scoring/pass/breakdown tests | core/score_test.go … | L01–L03 |
| T02 | Assembly/shuffle/bank tests | core/assemble_test.go … | L04,L05,L08 |
| T03 | Cooldown/presets/settings tests | core/cooldown_test.go … | L06,L09,L10 |
| T04 | Mastery/streak/scoreEvent tests | core/mastery_test.go … | L07,L11,L12 |
| T05 | API integration: exam flow | backend/internal/http/exam_flow_test.go | A13,A15,A16 |
| T06 | E2E: parent builds subject→exam | frontend/e2e/build.spec.ts | P04,P08,P09 |
| T07 | E2E: student takes exam→result | frontend/e2e/take.spec.ts | P12,P13,P14 |
| T08 | Contract lint + codegen-compiles | contracts/tests | C01–C11 |
| W01 | OpenAPI root + codegen (Go + TS) | contracts/openapi.yaml, gen output | C01–C11 |
| W02 | Go chi router + middleware + static SPA | backend/internal/http/server.go | A01–A21 |
| W03 | Frontend api-client + providers + barrels | frontend/src/api/client.ts, barrels | U*,H*,W01 |
| W04 | sqlc gen + pgx pool + store wiring + DI | backend/internal/store, internal/app/wire.go | D01–D12 |

---

## Conventions
- **Go:** `gofmt`/`golangci-lint` clean. Handlers are methods on `*Handlers` (struct defined in W02); they validate input against generated types, call `internal/core` + `internal/store`, return generated response types. No business logic in handlers.
- **Errors:** RFC-7807-style problem JSON (C11) with correct HTTP status. Lists return `Page<T>` with `?page&pageSize` (defaults 1/50, max 200).
- **Frontend:** components presentational; data lives in hooks over the generated client. No business logic in components.
- **Defaults everywhere** (spec §6/§10): size 20, pass bar 70, cooldown 10, rate 3 min/q, daily cap 3h — defined once in C09 + L10.
- **Guardian-absent:** Phase 1 emits a `ScoreEvent` (C10) and stops. No "minutes" anywhere; time UI stays dark until Phase 3.
- **Node is build-only.** Nothing in `backend/` depends on a Node runtime; the prod artifact is the Go binary embedding the built SPA.

See `CONTRACTS.md` for the frozen shapes and `_TEMPLATE.md` for the task file format.

---

# Phase 2 — Intelligence & Depth (`2-*` tasks)

> Inside the Study Platform. Adds the AI tutor, the swappable knowledge backend (NotebookLM / Gemini), async ingestion + OCR offload, AI question/syllabus generation, and the parent dashboard. Frozen shapes: `CONTRACTS-P2.md`. Same stack, same rules. IDs are prefixed `2-`.

**Waves:** `2-F*` foundation (knowledge adapter, jobs, storage) → `2-C*`/`2-D*` contract+schema → (`2-L*` ∥ `2-A*` ∥ `2-U*` ∥ `2-H*`) → `2-P*` pages → `2-T*` tests · `2-W*` wiring continuous.

| Group | IDs | Owns (root) |
|---|---|---|
| **Foundation** | 2-F01 knowledge `Source` interface · 2-F02 Gemini-direct impl · 2-F03 NotebookLM-MCP impl · 2-F04 fake adapter · 2-F05 adapter selector+config · 2-F06 job queue+worker · 2-F07 file storage · 2-F08 SSE helper · 2-F09 prompt templates | `backend/internal/{knowledge,jobs,storage,llm}` |
| **Contract** | 2-C01 tutorChat · 2-C02 studyGuide · 2-C03 job · 2-C04 syllabusSuggestion · 2-C05 questionDraft · 2-C06 tutorInstructions · 2-C07 guidance · 2-C08 dashboard | `contracts/components/*.yaml` |
| **DB** | 2-D01 conversation+message · 2-D02 study_guide · 2-D03 jobs · 2-D04 tutor_instructions · 2-D05 parent_guidance · 2-D06 question_draft · 2-D07 mastery_snapshot · 2-D08 file_blob | `backend/db/{migrations,queries}` |
| **Core** | 2-L01 promptAssembly · 2-L02 studyGuideComposer · 2-L03 draftValidator · 2-L04 syllabusNormalizer · 2-L05 dashboardAgg · 2-L06 citationFormat | `backend/internal/core/*.go` |
| **API** | 2-A01..2-A13 (tutor, study-guide, ingest, jobs, syllabus suggest/apply, question gen/drafts, tutor-instructions, guidance, dashboard) | `backend/internal/http/*.go` |
| **UI** | 2-U01 ChatThread · 2-U02 ChatComposer · 2-U03 CitationChip · 2-U04 StudyGuideView · 2-U05 JobStatus · 2-U06 TopicTreeEditor · 2-U07 QuestionDraftCard · 2-U08 MasteryTimeline · 2-U09 GuidanceEditor · 2-U10 MarkdownRenderer | `frontend/src/components/*.tsx` |
| **Hooks** | 2-H01 useTutorChat(SSE) · 2-H02 useStudyGuide · 2-H03 useJobs · 2-H04 useSyllabusSuggest · 2-H05 useQuestionGen · 2-H06 useTutorInstructions · 2-H07 useGuidance · 2-H08 useDashboard | `frontend/src/hooks/*.ts` |
| **Pages** | 2-P01 Tutor chat (3.2) · 2-P02 Sources ingestion (2.4) · 2-P03 Syllabus auto-suggest (2.5) · 2-P04 Tutor instructions (2.7) · 2-P05 Question gen+review (2.8) · 2-P06 Parent dashboard (2.10) | `frontend/src/pages/*.tsx` |
| **Tests** | 2-T01 adapter contract · 2-T02 prompt/validator · 2-T03 job worker · 2-T04 ingestion integ · 2-T05 tutor SSE integ · 2-T06 E2E ingest→syllabus→gen→approve · 2-T07 E2E student tutor chat | mixed |
| **Wiring** | 2-W01 OpenAPI+codegen · 2-W02 router+worker startup · 2-W03 frontend routes+barrels · 2-W04 DI (adapter+worker) | shared owners |

**Phase 2 total: 79 tasks.**

---

# Phase 3 — The Guardian (`3-*` tasks)

> Optional, decoupled add-on: Reward Engine + Network Wall, as a **separate Go binary** (`guardian/`). Consumes only the `ScoreEvent` (C10). Frozen shapes: `CONTRACTS-P3.md`. IDs prefixed `3-`.

**Waves:** `3-F*` foundation (guardian module, wall adapter, session mgr, score subscription) → `3-C*`/`3-D*` → (`3-R*` reward engine ∥ `3-L*` ∥ `3-A*` ∥ `3-U*` ∥ `3-H*`) → `3-P*` → `3-T*` · `3-W*` wiring.

| Group | IDs | Owns (root) |
|---|---|---|
| **Foundation** | 3-F01 guardian module init · 3-F02 ScoreEvent subscription (inbox/cursor) · 3-F03 `Wall` interface · 3-F04 RouterOS v7 impl · 3-F05 fake wall · 3-F06 session manager (timers/persist) · 3-F07 guardian auth (FIDO2) · 3-F08 captive portal server | `guardian/internal/*` |
| **Contract** | 3-C01 device · 3-C02 rewardPolicy · 3-C03 grant/session · 3-C04 override · 3-C05 guardianStatus · 3-C06 scoreEvent intake | `contracts/components/guardian/*.yaml` |
| **DB** | 3-D01 device · 3-D02 reward_policy · 3-D03 grant/session · 3-D04 override_log · 3-D05 daily_usage · 3-D06 score_event_inbox · 3-D07 init | `guardian/db/{migrations,queries}` |
| **Reward Engine** | 3-R01 score→minutes (flat/scaled) · 3-R02 diminishing returns · 3-R03 daily cap · 3-R04 reward ramp · 3-R05 grant decision | `guardian/internal/reward/*.go` |
| **Core** | 3-L01 session countdown/expiry · 3-L02 device/MAC matching | `guardian/internal/core/*.go` |
| **API** | 3-A01..3-A12 (devices CRUD+scan, reward-policy, sessions+revoke, override+log, status, manual grant, captive portal, score intake) | `guardian/internal/http/*.go` |
| **UI** | 3-U01 DeviceList/Form · 3-U02 RewardPolicyForm · 3-U03 SessionList · 3-U04 OverridePanel(FIDO2) · 3-U05 CaptivePortalGate · 3-U06 GuardianTimeSlot · 3-U07 CountdownTimer | `frontend/src/components/guardian/*.tsx` |
| **Hooks** | 3-H01 useDevices · 3-H02 useRewardPolicy · 3-H03 useSessions · 3-H04 useOverride · 3-H05 useGuardianStatus · 3-H06 useEarnedTime | `frontend/src/hooks/guardian/*.ts` |
| **Pages** | 3-P01 Device registry (4.1) · 3-P02 Reward policy (4.2) · 3-P03 Override (4.3) · 3-P04 Captive-portal gate (4.4) · 3-P05 Guardian status/logs (4.5) · 3-P06 Enable-Guardian + time UI | `frontend/src/pages/guardian/*.tsx` |
| **Tests** | 3-T01 reward engine · 3-T02 session expiry · 3-T03 wall adapter (fake) · 3-T04 score→grant integ · 3-T05 device+override API · 3-T06 E2E pass→grant→time · 3-T07 RouterOS smoke (optional, real/CHR) | mixed |
| **Wiring** | 3-W01 OpenAPI (guardian ns)+codegen · 3-W02 guardian router+portal+static · 3-W03 frontend guardian routes+gating · 3-W04 guardian DI (wall+session+reward+subscription) | shared owners |

**Phase 3 total: 70 tasks.**

---

## Grand total & parallelism across all phases

| Phase | Tasks | Peak concurrent (the big fan-out wave) |
|---|---|---|
| Phase 1 | 124 | ~63 |
| Phase 2 | 79 | ~37 (`2-L`+`2-A`+`2-U`+`2-H`) |
| Phase 3 | 70 | ~32 (`3-R`+`3-L`+`3-A`+`3-U`+`3-H`) |
| **Total** | **273** | **~100+ when phases overlap** |

Phase 2's foundation can start as soon as Phase 1's contract is frozen (it doesn't need Phase 1 fully done). Phase 3 only needs the frozen `ScoreEvent` (C10) — it can be built in parallel with Phase 2 against the fake wall. So with all three phases dispatched and contracts frozen, **a genuine ~100-agent peak is reachable** because there's enough independent work to fill it. See `CONTRACTS-P2.md` / `CONTRACTS-P3.md`.
