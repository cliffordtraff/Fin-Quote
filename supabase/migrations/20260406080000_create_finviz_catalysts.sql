-- Dedicated table for FinViz "Why Is It Moving" catalysts.
-- One row per symbol/date, upserted on each scrape.
-- Stores the scrape timestamp so we know when the data was captured.

CREATE TABLE IF NOT EXISTS finviz_catalysts (
  symbol TEXT NOT NULL,
  summary_date DATE NOT NULL,
  catalyst_text TEXT NOT NULL,
  scraped_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (symbol, summary_date)
);
CREATE INDEX idx_finviz_catalysts_date ON finviz_catalysts (summary_date);
