create extension if not exists pgcrypto;

alter table newsletter_drafts
  add column if not exists session_id text;

update newsletter_drafts
set session_id = coalesce(session_id, owner_id::text, gen_random_uuid()::text)
where session_id is null;

alter table newsletter_drafts
  alter column session_id set not null;

alter table newsletter_drafts
  alter column owner_id drop not null;

create index if not exists idx_newsletter_drafts_session_updated
  on newsletter_drafts(session_id, updated_at desc);
