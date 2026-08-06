-- Human feedback on generated WIIM summaries
alter table stock_summaries add column if not exists feedback text;
alter table stock_summaries add column if not exists feedback_at timestamptz;
