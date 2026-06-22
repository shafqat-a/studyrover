# StudyRover — Screen & Input Inventory

*Frontend build reference. Companion to `StudyRover-Spec-and-Plan.md`.*

**Assumptions:** responsive web app · two roles, **Parent/Admin** and **Student**, with separate views · the captive-portal gate is a web page served on the network · every config field has a sensible **default** so the app works without setup.

**Phase tags:** **P1** = tutoring core (the standalone product) · **P2** = intelligence & depth · **P3** = the optional Guardian. Input control types are noted in *(parentheses)*; defaults in **bold**.

---

## 1. Auth & Setup

### 1.1 Parent setup *(Parent · P1)*
First-run account creation.
- Parent display name *(text)*
- Email *(text)*
- Register passkey / FIDO2 authenticator *(WebAuthn ceremony — button)*
- Register **backup** authenticator *(WebAuthn ceremony — button; flagged strongly so a lost key can't lock the parent out)*

### 1.2 Student sign-in *(Student · P1)*
- Student picker or simple PIN/passkey *(select / WebAuthn)* — lightweight; the student isn't managing secrets

---

## 2. Admin — Study Administration *(Parent)*

### 2.1 Student profile *(P1)*
Create and manage the student.
- Name *(text)*
- Grade / level *(select or text)*
- Avatar *(optional image upload)*
- Notes / learning preferences *(textarea)* — feeds the tutor
- Linked device(s) *(read-only summary; managed in 4.1)*

### 2.2 Subjects list *(P1)*
- **Add subject** *(button)*
- Per subject: name *(text)*, color/icon *(picker)*, description *(text)* — all optional except name
- Row actions: edit, archive, delete *(buttons)*

### 2.3 Subject detail *(P1)*
Hub for one subject; tabs into sources, syllabus, exams, tutor instructions.
- Subject name / description *(inline edit)*
- Tabs/links to: Sources (2.4), Syllabus (2.5), Exam definitions (2.6), Tutor instructions (2.7)

### 2.4 Sources / books *(P1 manual · P2 ingestion)*
Add the material a subject is built from.
- Add source *(button → choose type)*:
  - Upload file *(file upload: PDF / Word / text; PDF may be scanned — OCR handled by the backend)*
  - Link a **NotebookLM project** *(text: project URL/ID)*
  - Paste text *(textarea)*
- Knowledge backend *(select: **NotebookLM** / Gemini-direct — defaulted from Settings)*
- Source list with status *(processing / ready)* and remove action

### 2.5 Syllabus builder *(P1 manual · P2 AI-assisted)*
Structure sources into topics.
- **Auto-suggest topics** from sources *(button — P2; default proposes a topic tree the parent edits)*
- Per topic: name *(text)*, source + page range *(reference picker)*, order *(drag / number)*
- Mark topic active / covered *(toggle)*

### 2.6 Exam definitions *(P1)*
Define an exam = scope + size + thresholds. Gate quizzes and midterms are the same object, different settings.
- Exam name *(text — e.g., "Midterm")*
- Type *(select: gate quiz / formal exam)*
- Scope *(multi-select of topics and/or page ranges; **default = whole subject**)*
- Size *(number of questions; **default 20** ≈ 60 min; presets 5 ≈ 15 min / 10 ≈ 30 min)*
- Pass bar *(number %, **default 70**)*
- Cooldown after fail *(minutes, **default 10**)*
- Reward style *(select: **flat** / scaled — see spec §7; flat for v1)*

### 2.7 Per-subject tutor instructions *(P2)*
- Custom instructions *(textarea — e.g., "show every step in Math")*
- Quick toggles *(tone, target language, difficulty)* — all optional with defaults

### 2.8 Question bank *(P1 manual · P2 generated)*
- **Generate questions** from sources *(button — P2)*
- Add question manually *(button)*: question text *(text)*, options *(repeatable text inputs, ≥4)*, correct option *(radio)*, topic tag *(select)*, difficulty *(select)*
- Edit / disable / delete per question

### 2.9 Settings *(P1)*
Global defaults; everything configurable.
- Reward rate *(number, min/question, **default 3**)* — *(Guardian-side; shown disabled until Guardian enabled)*
- Daily internet cap *(number hours, **default 3**)* — *(Guardian-side)*
- Default exam size / pass bar / cooldown *(numbers, defaults as above)*
- Knowledge backend *(select, **default NotebookLM via MCP**)*
- Difficulty ramp *(toggle, **off**)*

### 2.10 Parent dashboard *(P2)*
View progress and steer the tutor.
- Display: mastery per subject/topic, exam history, scores, streaks; time earned/used *(if Guardian on)*
- Guidance to tutor *(textarea, per subject or global — e.g., "focus on fractions this week")* *(input)*

---

## 3. Student — Study & Exams

### 3.1 Student home *(P1)*
- Pick subject *(cards/select)*
- "Study" and "Take an exam" *(buttons)*
- Display: streak, recommended next topic; earned/remaining time *(if Guardian on)*

### 3.2 Study / tutor *(P2)*
AI tutor grounded in the subject's sources.
- Topic selector *(select)*
- Chat / ask a question *(text input)*
- Quick actions *(buttons: "explain this," "give me an example," "I'm ready for a quiz")*
- Display: study guide, grounded answers with citations

### 3.3 Start exam *(P1)*
The "how much to invest" choice.
- Exam / scope *(select — from 2.6, or "current topic")*
- Size *(select: 5 ≈ 15 min · 10 ≈ 30 min · **20 ≈ 60 min**)* — time shown per option only when Guardian is on
- "Start" *(button)*

### 3.4 Exam in progress *(P1)*
- Question + options *(radio select, one per question)*
- Navigation *(next / previous / jump)*
- Submit *(button, with confirm)*
- Optional timer display

### 3.5 Exam result *(P1)*
- Display: score, pass/fail, per-topic breakdown, what to review; earned time + cooldown *(if Guardian on)*
- Actions *(buttons: review answers, study weak topics, retry — disabled during cooldown, "go online" if access granted)*

---

## 4. Guardian *(optional add-on · P3)*

### 4.1 Device registry *(Parent · P3)*
Targeted, allow-by-default — only listed devices are gated.
- Add device *(button)*: name *(text)*, **MAC address** *(text — primary key)*, IP / hostname *(text — optional helpers)*, bind to student *(select)*
- **Scan network** to discover devices *(button — helper that fills MAC/IP)*
- Device list with gated/active status

### 4.2 Reward policy *(Parent · P3)*
The score → minutes policy (Guardian-side; mirrors the config in 2.9 but lives here once Guardian is on).
- Rate *(min/question, **3**)*, pass bar *(%, **70**)*, daily cap *(hours, **3**)*
- Reward style *(flat / scaled toggle)*, diminishing returns *(toggle)*, cooldown *(minutes, **10**)*

### 4.3 Override *(Parent · P3)*
Manual / emergency grant, always logged.
- Device *(select)*, duration *(number minutes)*, reason *(optional text)*
- Authorize *(WebAuthn / FIDO2 ceremony — button)*
- Display: override log *(timestamp, duration, who)*

### 4.4 Captive-portal gate *(Student-facing, on device · P3)*
What the daughter's device shows when it has no internet time.
- Message + "Take a quiz to get online" *(button → launches 3.3/3.4)*
- When time is active: remaining time display, no input needed

### 4.5 Guardian status / logs *(Parent · P3)*
- Display: active sessions + remaining time, grant/override history
- Actions *(buttons: revoke now, grant)*

---

## Build order summary

- **P1 (frontend MVP):** 1.1, 1.2, 2.1–2.6, 2.8 (manual), 2.9, 3.1, 3.3, 3.4, 3.5 — a complete study + exam tool with scores, no Guardian.
- **P2:** 2.4 ingestion, 2.5 auto-topics, 2.7, 2.8 generation, 2.10, 3.2 tutor.
- **P3 (Guardian):** all of §4, plus the time displays that light up across §3.
