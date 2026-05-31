-- Preserve Supabase Data API access explicitly before automatic grants are removed.
grant usage on schema public to anon, authenticated, service_role;

grant select, insert, update, delete
  on all tables in schema public
  to anon, authenticated, service_role;

grant usage, select, update
  on all sequences in schema public
  to anon, authenticated, service_role;

grant execute
  on all functions in schema public
  to anon, authenticated, service_role;

alter default privileges in schema public
  grant select, insert, update, delete
  on tables
  to anon, authenticated, service_role;

alter default privileges in schema public
  grant usage, select, update
  on sequences
  to anon, authenticated, service_role;

alter default privileges in schema public
  grant execute
  on functions
  to anon, authenticated, service_role;
