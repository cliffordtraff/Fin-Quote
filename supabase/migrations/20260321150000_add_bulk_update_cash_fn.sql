-- Bulk update cash_and_cash_equivalents for a single symbol.
-- Accepts a JSON array of {period_end_date, period_type, cash_value} objects
-- and updates all matching rows in one statement. Called from the backfill script.
create or replace function public.bulk_update_cash(
  p_symbol text,
  p_rows jsonb
) returns integer
language plpgsql
as $$
declare
  updated_count integer;
begin
  update public.financials_std f
  set cash_and_cash_equivalents = (r.val->>'cash_value')::double precision
  from jsonb_array_elements(p_rows) as r(val)
  where f.symbol = p_symbol
    and f.period_end_date = (r.val->>'period_end_date')::date
    and f.period_type = r.val->>'period_type';

  get diagnostics updated_count = row_count;
  return updated_count;
end;
$$;
