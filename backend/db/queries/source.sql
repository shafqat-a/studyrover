-- name: CreateSource :one
insert into source (subject_id, type, title, status, file_ref, url, text)
values ($1, $2, $3, $4, $5, $6, $7)
returning *;

-- name: GetSource :one
select * from source
where id = $1;

-- name: ListSourcesBySubject :many
select * from source
where subject_id = $1
order by created_at desc, id
limit $2 offset $3;

-- name: CountSourcesBySubject :one
select count(*) from source
where subject_id = $1;

-- name: DeleteSource :exec
delete from source
where id = $1;
