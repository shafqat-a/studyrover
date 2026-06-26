-- D03 — Topic queries (sqlc)
--
-- One file per table. Emits type-safe Go into internal/store (pgx/v5).
-- Matches CONTRACTS.md §C03.

-- name: CreateTopic :one
INSERT INTO topic (
    subject_id,
    name,
    source_id,
    page_start,
    page_end,
    "order",
    active
) VALUES (
    @subject_id,
    @name,
    @source_id,
    @page_start,
    @page_end,
    @sort_order,
    COALESCE(sqlc.narg('active'), true)
)
RETURNING *;

-- name: ListTopicsBySubject :many
SELECT * FROM topic
WHERE subject_id = @subject_id
ORDER BY "order" ASC, name ASC
LIMIT @page_limit OFFSET @page_offset;

-- name: CountTopicsBySubject :one
SELECT count(*) FROM topic
WHERE subject_id = @subject_id;

-- name: GetTopic :one
SELECT * FROM topic
WHERE id = @id;

-- name: UpdateTopic :one
UPDATE topic
SET
    name       = COALESCE(sqlc.narg('name'), name),
    source_id  = CASE WHEN @set_source_id::boolean THEN sqlc.narg('source_id') ELSE source_id END,
    page_start = CASE WHEN @set_page_start::boolean THEN sqlc.narg('page_start') ELSE page_start END,
    page_end   = CASE WHEN @set_page_end::boolean THEN sqlc.narg('page_end') ELSE page_end END,
    "order"    = COALESCE(sqlc.narg('sort_order'), "order"),
    active     = COALESCE(sqlc.narg('active'), active)
WHERE id = @id
RETURNING *;

-- name: DeleteTopic :exec
DELETE FROM topic
WHERE id = @id;
