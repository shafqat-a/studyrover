# StudyRover — Product Spec & Build Plan

*studyrover.com. A system that gates internet access behind study: a student earns timed internet by completing study activities and passing short quizzes. Internet access is the reward; learning is the price of admission.*

---

## 0. Confirmed Decisions

| Decision | Resolution |
|---|---|
| **Network scope** | WiFi-only, by design. No attempt to control mobile data, other networks, or second devices. |
| **Hardware** | MikroTik (RouterOS). Hotspot = captive portal; RouterOS API for timed grants. |
| **Quiz format** | Multiple choice, with anti-guessing tuning (see §6, §9, §13). |
| **Parent override** | Yes — authenticated via FIDO2 / WebAuthn. Every override logged. |
| **Student** | The user's daughter. Subjects are entered by the parent in the admin screen — not pre-seeded, not a blocker. |
| **Architecture** | Study Platform (Admin + Tutor + Exam) is the product; the Guardian (Reward Engine + Network Wall) is an optional add-on. The contract between them is the exam **score**. |
| **Independence** | The Study Platform runs fully standalone — study, tutor, exams, scores — with or without the Guardian. The Guardian subscribes to scores and decides internet access; remove it and the platform still works, just without gating. |
| **Enforcement** | Targeted & allow-by-default: only the daughter's registered device(s) are walled; the rest of the household passes freely. |
| **Configuration** | Many tunable inputs, but every one ships with a sensible default — works out of the box. |
| **Content** | Admin enters subjects and adds sources — uploaded books (PDF/Word/text) or a linked NotebookLM project; sources define the syllabus; pages/topics can be scoped to exams (e.g., midterms). |
| **Knowledge backend** | Content, OCR, and grounding offloaded to NotebookLM (or Gemini direct) behind a swappable Knowledge-Source adapter. Connection: unofficial MCP now, official API later. See §4. |
| **Tutor config** | Per-subject custom instructions for the AI tutor, on top of general parent guidance. |
| **Atomic study unit** | Resolved — a configurable-size exam → internet time (default 20 q ≈ 60 min; min 5 q ≈ 15 min). See §7 / §10. |
| **Reward-curve stress-test** | Done — 70% pass bar + post-fail cooldown contain MCQ guessing (§10). |
| **Build order** | Value-first: the tutoring core (the product) is built first; the optional Guardian add-on is built last. See §14. |

---

## 1. Problem Statement

A student with a strong pull toward the internet studies too little and goes online too much. Blunt parental blocks (internet on/off) create conflict and don't build any study habit. The opportunity is to invert the dynamic: instead of *blocking* the internet, make *studying the path to earning it*. The student stays motivated (the reward is the thing she wants most), and over time the study itself becomes a habit rather than a chore.

---

## 2. Goals

1. **Make starting easy.** Lower the activation barrier so the student begins studying with minimal friction — small, near-certain early wins.
2. **Tie internet time to genuine learning.** Internet minutes are earned through real recall, not guessable clicking.
3. **Build a sustainable study habit.** Favor frequent short study→unlock cycles over rare large sessions, so reinforcement happens often.
4. **Resist gaming.** The student should not be able to farm unlimited internet through minimum effort (diminishing returns + daily caps + genuine-recall quizzes).
5. **Give the parent visibility and control** without requiring them to police every session manually.

---

## 3. Non-Goals (v1)

- **Not a cure for internet overuse.** This is a behavioral scaffold, not treatment. If the underlying issue is severe, it should be paired with other support.
- **Not a full LMS.** No grading rubrics, classrooms, or multi-teacher workflows. One student, one parent.
- **Not cross-network enforcement (by design).** v1 controls the **one MikroTik-managed WiFi network** — this is the agreed scope. It makes no attempt to stop mobile data, another network, or a second device.
- **Not AI-generated everything on day one.** The first version can use manually entered questions; AI generation comes later.
- **No mobile-data / cellular control.** Out of scope — this is a router-level system.

---

## 4. System Architecture

Two independent halves. The **Study Platform** (Study Administration + AI Tutor + Exam System) is the actual product and runs fully standalone. The **Guardian** (Reward Engine + Network Wall) is an *optional add-on* that converts exam scores into enforced internet time. The only thing crossing between them is the exam **score** — so you can study, get tutored, and take exams with or without the Guardian attached. Remove the Guardian and nothing about studying changes; it just stops gating the internet.

**A. Study Administration** — *parent-facing control plane.* Student profile management; **content ingestion** (add subjects; upload books as PDF — including scanned PDFs via OCR — Word docs, or text); **syllabus** structured from those books (topics and pages); **exam scopes** (tag specific pages/topics as "midterm," "final," etc.); **per-subject tutor instructions**; parent settings (caps, reward config, overrides); and the progress dashboard with the channel for steering the tutor. Everything ships with defaults and is configurable.

**B. AI Tutor** — generates study guides and helps her study, shaped by syllabus, her progress, and parent guidance.

**C. Exam System** — question banks, gate quizzes and formal exams, delivery and grading. Emits scores.

> **A + B + C = the Study Platform.** They share data and are built/deployed together.

**The Guardian (optional add-on) = Reward Engine + Network Wall.**

- **Reward Engine** — subscribes to exam scores from C and converts them to internet minutes (the score → minutes policy). This is *internet-access* logic, so it lives with the Guardian, not the education side.
- **Network Wall** — targets specific devices (the daughter's, by MAC/IP/hostname), enforces the captive-portal gate on MikroTik, manages sessions/timers, and lets the rest of the household pass untouched.

**The contract is the score.** The Study Platform emits scores; the Guardian consumes them. That single, narrow interface is what lets either side be built, run, or replaced without disturbing the other — and lets the Study Platform exist as a complete product with no Guardian at all.

### Detailed components (within the systems above)

| # | Component | System | Responsibility |
|---|-----------|--------|----------------|
| 1 | **Identity & Devices** | A + Guardian | Student/parent accounts + profile (A); device→student registry, MAC-keyed (Guardian/Wall). |
| 2 | **Curriculum** | A | Admin-entered subjects; multi-format book ingestion (PDF / scanned-OCR / Word / text) → syllabus (topics & pages) → exam scopes. |
| 3 | **AI Study Assistant** | B | Study guide from syllabus + progress + parent guidance. |
| 4 | **Assessment Engine** | C | Generate, deliver, grade questions; gate quizzes + formal exams. |
| 5 | **Access Control / Network** | Guardian | The Network Wall: captive portal + MikroTik integration + session manager. |
| 6 | **Reward Policy Engine** | Guardian | Subscribes to scores, converts to minutes. Part of the optional Guardian — not the Study Platform. |
| 7 | **Progress & Analytics** | A | Mastery, history, time earned/used; feeds B and the dashboard. |

**Platform plumbing:** backend API, database, student app/portal UI, parent dashboard.

### Knowledge backend — NotebookLM / Gemini  *(content, OCR & grounding)*

Rather than build document parsing, OCR, and retrieval in-house, StudyRover leans on an external **knowledge backend**. The admin can point a subject at a **NotebookLM project**: its sources become the syllabus, and the AI Tutor (B) draws on those sources and the backend's generated outputs (study guides, quizzes, flashcards). NotebookLM/Gemini ingest PDFs (including scanned), Word, text, and images and read them with Gemini — so **OCR is offloaded** and StudyRover needs none of its own.

All of this sits behind a single **Knowledge-Source adapter**, isolated the same way the Network Wall is isolated behind the Reward Engine — so the backend is swappable. Connection options:

- **NotebookLM Enterprise API** — official and documented, but enterprise-only (Google Cloud org, Agentspace/Gemini Enterprise, IAM). Robust; heavyweight for a home project.
- **Unofficial MCP / Python libs** (e.g., `notebooklm-mcp`, `notebooklm-py`) — already provide the MCP server, including source ingestion and quiz/flashcard generation. They use undocumented endpoints and can break without notice; ToS-gray. Fine for a personal prototype, not a long-term dependency.
- **Gemini API direct** — official and stable; does document understanding (incl. scanned-PDF OCR) and grounded generation natively. Skips the NotebookLM product but gets the same capability cleanly. The robust path if the NotebookLM UI isn't needed.
- **Official consumer API** — acknowledged as in the works, not yet available.

The adapter means you can start on the unofficial MCP now and swap to the consumer API or Gemini-direct later without touching the Tutor or Curriculum.

---

## 5. The Core Loop

```
Device connects to WiFi
   → Captive portal intercepts the connection
   → Student is shown a gate quiz (tied to a syllabus topic)
   → Assessment Engine grades it
   → Reward Policy Engine converts score → N minutes (N scaled by score, ramped, capped)
   → Controller unlocks the device's MAC for N minutes
   → Session manager counts down ("28 min left")
   → Time expires → access revoked → back to the portal
```

---

## 6. Key Design Principles

These are the behavioral decisions that make or break the product.

- **Small to start, then shaped.** Begin with tiny, near-guaranteed wins to build the habit and a sense of competence; quietly raise the bar over days/weeks. Lives in the Reward Policy Engine as a ramping curve, not a flat formula.
- **Frequent short cycles > one big block.** Many study→unlock loops through the day suit a fragmented attention span and give more reinforcement points.
- **Hard-to-guess multiple choice.** Quizzes are multiple choice (simple to auto-grade), but tuned so guessing doesn't pay: enough questions, a high enough pass bar, randomized option order, and a large rotating question bank. See §9 and §13 for the math.
- **Diminishing returns + daily cap.** The 5th quiz of the day pays less than the 1st, and total earnable time is capped, so "small goals" can't become "infinite internet."
- **Make progress visible.** Streaks, mastery bars, and immediate feedback so the studying starts to carry some reward of its own — the long game is that internet isn't the *only* thing worth working for.
- **Configurable, but works out of the box.** Many inputs are tunable (reward curve, caps, quiz dials, parent guidance, curriculum), but every one ships with a sensible default so the system runs without configuring anything. The parent tunes only what they care about.

---

## 7. The Atomic Study Unit  *(resolved)*

The rewardable unit is **an exam**: a set of multiple-choice questions on the studied material. Its **size is configurable**, and size maps to internet time at a fixed rate (default **3 minutes per question**):

| Exam size | Internet earned (on pass) | Role |
|---|---|---|
| 5 questions | 15 min | quick top-up — the low-friction start |
| 10 questions | 30 min | medium session |
| **20 questions (default)** | **60 min** | **the standard full session** |

The student chooses how much to invest, at a fair flat rate. The small option serves the "easy to start" principle; the 20-question default is the standard session and the system's out-of-the-box behaviour.

**One sub-decision — flat vs. scaled reward:**
- **Flat (recommended for v1):** pass the exam (≥ 70%) → earn the full time for that size. Simple; matches the table above.
- **Scaled (P1 upgrade):** earn *score% × max time* once past the pass bar, so acing pays more than barely passing — rewards mastery, not just clearing the gate.

Either way, **failing earns nothing and triggers a cooldown** (§10) — which is what keeps the small exams from being gamed.

---

## 8. User Stories

**Student**
- As a student, I want to earn internet by answering a few questions so that getting online is quick when I've actually studied.
- As a student, I want to see how much time I've earned and how much is left so that I can plan my session.
- As a student, I want my early questions to be easy so that I'm not discouraged from starting.
- As a student, I want to see my streak and progress so that studying feels rewarding on its own.

**Parent**
- As a parent, I want to set which subjects and topics count so that the study maps to what she actually needs.
- As a parent, I want to set daily caps and the score→time rules so that I control how generous the system is.
- As a parent, I want a dashboard of what she studied and how she scored so that I can see it's working without policing each session.
- As a parent, I want to grant emergency/override access so that the system never blocks something genuinely needed.

---

## 9. Requirements

### Must-Have (P0) — the core loop

- **Student profile**: parent creates and manages the student (the daughter) — identity plus profile attributes (grade/level, subjects, preferences) that seed the curriculum and tutor.
- **Device registry (targeted, allow-by-default)**: register the daughter's device(s) by MAC (IP/hostname as helpers) and bind to the student. Only registered devices are gated; every other household device passes.
  - *Given* a registered target device, *when* it connects, *then* it is gated; *given* an unregistered device, *then* it passes freely.
- **Captive portal**: intercept a new connection and serve the gate quiz instead of internet.
- **Gate quiz delivery + grading**: serve a topic's questions and produce a score.
  - **Multiple choice**, configurable size (default **20 questions ≈ 60 min**; smallest **5 ≈ 15 min**), pass bar ≥ 70%, randomized option order, drawn from a large rotating bank; **cooldown after a fail** so attempts can't be cheaply re-rolled.
- **Reward Policy Engine v1**: convert score → minutes, with a daily cap and basic diminishing returns.
- **Controller integration**: programmatically grant and revoke a device's internet for N minutes.
  - *Given* a passing score of X, *when* graded, *then* the device gets the mapped minutes and access opens.
- **Session manager**: count down the granted time and auto-revoke on expiry.
- **Admin content (minimal)**: from the admin screen, add subjects, topics, and a question bank, and set an exam's scope (default = the whole subject). Multi-format book upload + OCR + AI syllabus derivation are the P1 upgrade.
- **Parent settings**: set daily cap and the score→time mapping.
- **Parent override (FIDO2)**: parent authenticates with a FIDO2 / WebAuthn authenticator to grant manual or emergency access, bypassing the quiz. Every override is logged (timestamp, duration).

### Nice-to-Have (P1) — learning depth

- AI Study Assistant: generate a study guide from syllabus + progress.
- **Parent guidance to tutor**: parent views progress and injects guidance (e.g., "focus on fractions this week") that shapes the generated study guide.
- Formal exams (longer, mastery-measuring, feed the study guide).
- Progress tracking + mastery per topic; spaced repetition scheduling.
- **Document ingestion**: add sources as PDF/Word/text *or a linked NotebookLM project*; OCR and grounding are offloaded to the knowledge backend (§4); AI derives the syllabus (topics/pages); admin curates.
- **Tutor grounded in sources**: the tutor draws on the linked sources and the backend's generated study guides/quizzes, behind the Knowledge-Source adapter.
- **Exam-scope tagging**: mark specific pages/topics as belonging to an exam (e.g., "midterm," "final"); default scope = the whole subject.
- **Per-subject tutor instructions**: attach custom guidance per subject (e.g., "show every step in Math") that the tutor follows.
- AI-generated questions from the ingested material.
- Streaks and visible progress UI.
- Parent dashboard with history.

### Future Considerations (P2) — design for, don't build yet

- Multiple students / multiple devices per student.
- Site-level allowances (e.g., always allow educational sites).
- Adaptive difficulty driven by mastery model.
- Per-app or per-site control rather than all-or-nothing internet.

---

## 10. Reward Policy v1  *(concrete starting defaults — tunable)*

Internet time is a function of **exam size**, gated by a **pass threshold**:

- **Rate:** 3 minutes of internet per question (default).
- **Pass bar:** ≥ 70%. Below it → **0 minutes + cooldown**; the retry pulls fresh questions.
- **On pass (v1, flat):** earn the full time for the exam's size (5 q → 15 min, 20 q → 60 min).
- **Cooldown after a fail:** ~10 min default — the main anti-gaming lever (see below).
- **Daily cap:** total earnable internet ≤ a parent-set maximum (e.g., 3 hours/day).
- *(Optional, P1)* **Scaled reward:** score% × max time, so mastery pays more than barely passing.
- *(Optional)* **Difficulty ramp:** the standard of the question pool rises over days as the habit forms.

**Why this resists gaming.** A 20-question exam is effectively un-guessable (≈ 0% chance of fluking 14 of 20). The only mildly luck-friendly case is the smallest 5-question exam, where a 70% bar means getting 4 of 5 — about a **1.6%** chance by pure guessing. Add the post-fail cooldown and a rotating bank, and farming 15 minutes by re-rolling would cost *hours* of waiting per lucky pass. The 70% bar plus the cooldown together close the exploit; no extra mechanism is needed.

*All numbers are starting defaults to tune against real behaviour.*

---

## 11. Network / Hardware Approach  *(decided: MikroTik)*

The platform is **MikroTik (RouterOS)**, which ships the building blocks natively:

- **Hotspot** is the captive portal: it intercepts unauthenticated devices and redirects them to a login page. The StudyRover quiz *is* that login page — the device gets internet only after the quiz "logs it in."
- **Walled garden** lets the quiz/portal backend load while the device is otherwise blocked.
- **Timed grants:** on a passing score, the backend authorizes the device's session with a `session-timeout` / uptime limit equal to the earned minutes. RouterOS enforces expiry and re-prompts automatically — exactly the loop we want.
- **Targeted, allow-by-default:** only the daughter's registered device(s) are subject to the gate; every other household device passes freely. On MikroTik this is done with hotspot **IP-bindings** (bypass everyone except the target MAC) or firewall/address-list redirection of just the target device. **MAC is the primary key** (stable); IP and hostname are secondary helpers (IP changes via DHCP; hostname is optional and spoofable).

Two integration paths to choose between in Phase 0:

- **RouterOS API** (REST API on RouterOS v7, or the legacy binary API on v6): the backend directly manages hotspot sessions/users and their time limits. Lighter for a single-home setup.
- **RADIUS**: the hotspot authenticates against a RADIUS server that returns the time grant (`Session-Timeout`). Cleaner time handling but more infrastructure.

> Verify the box's **RouterOS version** first — v7's REST API is far easier to work with than v6's binary API. Confirm exact API calls during the Phase 0 spike rather than trusting this doc.

---

## 12. Success Metrics

**Leading (days–weeks)**
- Study cycles started per day (the activation metric).
- Quiz pass rate and average score trend (is real learning happening?).
- Ratio of study effort to internet earned (is the exchange healthy, not gamed?).
- Voluntary cycles — sessions started without an immediate "I want internet now" trigger.

**Lagging (weeks–months)**
- Mastery growth across the syllabus.
- Reduction in gate-bypass / gaming attempts.
- Sustained habit: study cycles maintained without parental prompting.

*Targets to be set once a baseline exists.*

---

## 13. Risks & Open Questions

**Resolved**
- ~~Bypass risk~~ → **Accepted.** WiFi-only control is the agreed scope.
- ~~Which hardware~~ → **MikroTik.**
- ~~Quiz format~~ → **Multiple choice** (guessing handled by the 70% bar + cooldown, §10).
- ~~Override~~ → **Yes, via FIDO2 / WebAuthn**, logged.
- ~~Atomic study unit~~ → **A configurable-size exam → internet time** (§7).
- ~~MCQ guessing~~ → **Contained.** 70% pass bar + post-fail cooldown + rotating bank; even the 5-question exam is ~1.6% guessable and not worth farming (§10).
- ~~Reward-curve stress-test~~ → **Done** in §10.

**Still open**
- **[Design] Flat vs. scaled reward.** §7 — pass = full time (v1) or score% × max (P1)? Pick the v1 behaviour.
- **[Design] FIDO2 recovery.** Register a backup authenticator so a lost/forgotten key doesn't lock the parent out of their own override.
- **[Build] Knowledge-backend connection.** OCR and retrieval are offloaded to NotebookLM / Gemini (they read scanned PDFs and images directly) — no in-house OCR needed. The open question is *which connection*: unofficial NotebookLM MCP (works today, but reverse-engineered and may break without notice), NotebookLM **Enterprise** API (official but enterprise-only), or **Gemini API direct** (official, stable, no NotebookLM UI). Isolate behind the Knowledge-Source adapter (§4) and choose when building ingestion. *(Subjects are entered by the admin in-app — not a blocker.)*

---

## 14. Build Plan (Phased)

*The AI tutoring system is the product; the Network Wall is a decoupled guardian layer that comes last. Build the value first, enforce it last.*

**Optional smoke test (anytime, ~15 min — not a phase).** Confirm the one load-bearing assumption of the Wall: that you can grant and revoke a device's internet for N minutes via the MikroTik API. A throwaway script that opens device X for 5 minutes and auto-revokes is enough. Cheap insurance so the last phase holds no surprise; blocks nothing and can run in parallel.

**Phase 1 — The tutoring core (the product, standalone).**
Student profile, curriculum/content (subjects, topics, question bank), and the Exam System (gate quizzes + formal exams, grading). Output is **scores and mastery** — no concept of internet time yet. *Exit criterion: she can study and take exams and see her scores/mastery — a complete, useful study tool with no Guardian attached.*

**Phase 2 — Intelligence & depth.**
AI Tutor (study guides grounded in sources via the knowledge backend), NotebookLM/Gemini integration, progress + mastery tracking, per-subject tutor instructions, parent dashboard + guidance, streaks.

**Phase 3 — The Guardian (optional add-on, last).**
The Reward Engine (score → minutes policy) **plus** the Network Wall: MikroTik hotspot, targeted/allow-by-default device control, session timers, FIDO2 parent override. The Guardian subscribes to the scores Phase 1 already produces and turns them into enforced internet time. *Exit criterion: passing an exam now actually opens her device for the earned time — and detaching the Guardian leaves the study system fully working.*

**Phase 4 — Polish & tuning.**
Reward-curve tuning against real behaviour, anti-gaming refinements, multi-device/student, analytics depth.

*Dependency logic: the Exam produces scores → the Reward Engine converts them → the Wall enforces. The Wall is the last consumer in the chain; building it earlier would only mean testing against stubbed scores.*

---

*This is v1 of the spec — meant to be argued with. The starred items (atomic study unit, hardware, reward numbers) are deliberate defaults, not final decisions.*
