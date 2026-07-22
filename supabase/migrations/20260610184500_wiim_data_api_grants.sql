-- Ensure WIIM tables created after explicit Data API grants still have API access.
grant select, insert, update, delete
  on table public.wiim_runs
  to anon, authenticated, service_role;

grant select, insert, update, delete
  on table public.wiim_run_candidates
  to anon, authenticated, service_role;

revoke insert, update, delete
  on table public.wiim_summary_runs
  from anon, authenticated;

revoke insert, update, delete
  on table public.stock_summaries
  from anon, authenticated;

grant select
  on table public.wiim_summary_runs, public.stock_summaries
  to anon, authenticated, service_role;

grant insert, update, delete
  on table public.wiim_summary_runs, public.stock_summaries
  to service_role;
