-- Add source_type_boosts_json column to ranker_config_versions
-- Stores per-sourceType scoring boosts for the event ranker (e.g. earnings_data: 12, sec_filing: 10)

ALTER TABLE ranker_config_versions
ADD COLUMN IF NOT EXISTS source_type_boosts_json jsonb DEFAULT '{"earnings_data":12,"sec_filing":10,"analyst_rating":8,"press_release":5,"polygon_news":0,"news":0}'::jsonb;
COMMENT ON COLUMN ranker_config_versions.source_type_boosts_json IS 'Per-sourceType scoring boosts applied after composite score calculation';
