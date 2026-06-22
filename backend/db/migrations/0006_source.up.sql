-- 0006 source — a knowledge source attached to a subject (C02).
-- Convention (0001): text id + CHECK constraints for enums; child tables
-- reference subject_id ON DELETE CASCADE.
create table if not exists source (
    id text primary key default gen_random_uuid()::text,
    subject_id text not null references subject (id) on delete cascade,
    type text not null check (type in ('file', 'notebooklm', 'text')),
    title text not null,
    status text not null default 'ready' check (status in ('processing', 'ready')),
    file_ref text,
    url text,
    text text,
    created_at timestamptz not null default now()
);

create index if not exists idx_source_subject_id on source (subject_id);
