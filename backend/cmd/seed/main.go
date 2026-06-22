// Command seed populates a StudyRover database with the deterministic demo
// dataset defined in internal/seed: the singleton Settings row (C09 defaults)
// plus one complete subject → topic → 25 question → gate exam chain and one
// demo student. It exists so that local development and end-to-end tests always
// have a working data set.
//
// The command is idempotent: every row is keyed on a fixed UUID and inserted
// with ON CONFLICT DO UPDATE, so running `make seed` against a fresh database
// populates it, and running it again simply refreshes the same rows without
// creating duplicates.
//
// It reads DATABASE_URL from the environment (see internal/config). Run with:
//
//	go run ./cmd/seed
package main

import (
	"context"
	"fmt"
	"log"
	"os"
	"os/signal"
	"syscall"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/shafqat/studyrover/backend/internal/seed"
)

const connectTimeout = 30 * time.Second

func main() {
	if err := run(); err != nil {
		log.Fatalf("seed: %v", err)
	}
	log.Print("seed: done")
}

func run() error {
	dsn := os.Getenv("DATABASE_URL")
	if dsn == "" {
		return fmt.Errorf("DATABASE_URL is required")
	}

	ctx, stop := signal.NotifyContext(context.Background(), os.Interrupt, syscall.SIGTERM)
	defer stop()

	connectCtx, cancel := context.WithTimeout(ctx, connectTimeout)
	defer cancel()

	pool, err := pgxpool.New(connectCtx, dsn)
	if err != nil {
		return fmt.Errorf("connect: %w", err)
	}
	defer pool.Close()

	if err := pool.Ping(connectCtx); err != nil {
		return fmt.Errorf("ping: %w", err)
	}

	fx := seed.Default()

	// Run everything in one transaction so the demo data is inserted
	// atomically; either the whole fixture set lands or none of it does.
	tx, err := pool.Begin(ctx)
	if err != nil {
		return fmt.Errorf("begin: %w", err)
	}
	defer func() { _ = tx.Rollback(ctx) }()

	if err := seedAll(ctx, tx, fx); err != nil {
		return err
	}

	if err := tx.Commit(ctx); err != nil {
		return fmt.Errorf("commit: %w", err)
	}

	log.Printf("seed: upserted settings, 1 subject, 1 topic, %d question, 1 gate exam, 1 student",
		len(fx.Questions))
	return nil
}

// seedAll inserts every fixture in dependency order (settings + student are
// independent; subject → topic → question/option → exam are chained).
func seedAll(ctx context.Context, tx pgx.Tx, fx seed.Fixtures) error {
	if err := upsertSettings(ctx, tx, fx.Settings); err != nil {
		return fmt.Errorf("settings: %w", err)
	}
	if err := upsertStudent(ctx, tx, fx.Student); err != nil {
		return fmt.Errorf("student: %w", err)
	}
	if err := upsertSubject(ctx, tx, fx.Subject); err != nil {
		return fmt.Errorf("subject: %w", err)
	}
	if err := upsertTopic(ctx, tx, fx.Topic); err != nil {
		return fmt.Errorf("topic: %w", err)
	}
	for _, q := range fx.Questions {
		if err := upsertQuestion(ctx, tx, q); err != nil {
			return fmt.Errorf("question %s: %w", q.ID, err)
		}
	}
	if err := upsertExam(ctx, tx, fx.Exam); err != nil {
		return fmt.Errorf("exam: %w", err)
	}
	return nil
}

func upsertSettings(ctx context.Context, tx pgx.Tx, s seed.Settings) error {
	const q = `
INSERT INTO settings (
	id, reward_rate_min_per_q, daily_cap_hours, default_exam_size,
	default_pass_bar, default_cooldown_min, knowledge_backend, difficulty_ramp
) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
ON CONFLICT (id) DO UPDATE SET
	reward_rate_min_per_q = EXCLUDED.reward_rate_min_per_q,
	daily_cap_hours       = EXCLUDED.daily_cap_hours,
	default_exam_size     = EXCLUDED.default_exam_size,
	default_pass_bar      = EXCLUDED.default_pass_bar,
	default_cooldown_min  = EXCLUDED.default_cooldown_min,
	knowledge_backend     = EXCLUDED.knowledge_backend,
	difficulty_ramp       = EXCLUDED.difficulty_ramp`
	_, err := tx.Exec(ctx, q,
		s.ID, s.RewardRateMinPerQ, s.DailyCapHours, s.DefaultExamSize,
		s.DefaultPassBar, s.DefaultCooldownMin, s.KnowledgeBackend, s.DifficultyRamp,
	)
	return err
}

func upsertStudent(ctx context.Context, tx pgx.Tx, s seed.Student) error {
	const q = `
INSERT INTO student (id, name, grade_level, notes)
VALUES ($1, $2, $3, $4)
ON CONFLICT (id) DO UPDATE SET
	name        = EXCLUDED.name,
	grade_level = EXCLUDED.grade_level,
	notes       = EXCLUDED.notes`
	_, err := tx.Exec(ctx, q, s.ID, s.Name, s.GradeLevel, s.Notes)
	return err
}

func upsertSubject(ctx context.Context, tx pgx.Tx, s seed.Subject) error {
	const q = `
INSERT INTO subject (id, name, color, icon, description, archived)
VALUES ($1, $2, $3, $4, $5, $6)
ON CONFLICT (id) DO UPDATE SET
	name        = EXCLUDED.name,
	color       = EXCLUDED.color,
	icon        = EXCLUDED.icon,
	description = EXCLUDED.description,
	archived    = EXCLUDED.archived`
	_, err := tx.Exec(ctx, q, s.ID, s.Name, s.Color, s.Icon, s.Description, s.Archived)
	return err
}

func upsertTopic(ctx context.Context, tx pgx.Tx, t seed.Topic) error {
	const q = `
INSERT INTO topic (id, subject_id, name, "order", active)
VALUES ($1, $2, $3, $4, $5)
ON CONFLICT (id) DO UPDATE SET
	subject_id = EXCLUDED.subject_id,
	name       = EXCLUDED.name,
	"order"    = EXCLUDED."order",
	active     = EXCLUDED.active`
	_, err := tx.Exec(ctx, q, t.ID, t.SubjectID, t.Name, t.Order, t.Active)
	return err
}

func upsertQuestion(ctx context.Context, tx pgx.Tx, qn seed.Question) error {
	const insertQuestion = `
INSERT INTO question (id, subject_id, topic_id, text, correct_option_id, difficulty, enabled)
VALUES ($1, $2, $3, $4, $5, $6, $7)
ON CONFLICT (id) DO UPDATE SET
	subject_id        = EXCLUDED.subject_id,
	topic_id          = EXCLUDED.topic_id,
	text              = EXCLUDED.text,
	correct_option_id = EXCLUDED.correct_option_id,
	difficulty        = EXCLUDED.difficulty,
	enabled           = EXCLUDED.enabled`

	const insertOption = `
INSERT INTO option (id, question_id, text)
VALUES ($1, $2, $3)
ON CONFLICT (id) DO UPDATE SET
	question_id = EXCLUDED.question_id,
	text        = EXCLUDED.text`

	// Insert option first so the question's correct_option_id FK is satisfied
	// regardless of constraint timing.
	for _, opt := range qn.Options {
		if _, err := tx.Exec(ctx, insertOption, opt.ID, qn.ID, opt.Text); err != nil {
			return fmt.Errorf("option %s: %w", opt.ID, err)
		}
	}
	if _, err := tx.Exec(ctx, insertQuestion,
		qn.ID, qn.SubjectID, qn.TopicID, qn.Text, qn.CorrectOptionID, qn.Difficulty, qn.Enabled,
	); err != nil {
		return err
	}
	return nil
}

func upsertExam(ctx context.Context, tx pgx.Tx, e seed.ExamDefinition) error {
	const q = `
INSERT INTO exam_definition (
	id, subject_id, name, type, scope_topic_ids, size, pass_bar, cooldown_min, reward_style
) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
ON CONFLICT (id) DO UPDATE SET
	subject_id      = EXCLUDED.subject_id,
	name            = EXCLUDED.name,
	type            = EXCLUDED.type,
	scope_topic_ids = EXCLUDED.scope_topic_ids,
	size            = EXCLUDED.size,
	pass_bar        = EXCLUDED.pass_bar,
	cooldown_min    = EXCLUDED.cooldown_min,
	reward_style    = EXCLUDED.reward_style`
	_, err := tx.Exec(ctx, q,
		e.ID, e.SubjectID, e.Name, e.Type, e.ScopeTopicIDs,
		e.Size, e.PassBar, e.CooldownMin, e.RewardStyle,
	)
	return err
}
