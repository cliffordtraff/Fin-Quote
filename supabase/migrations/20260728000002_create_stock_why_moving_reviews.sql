-- Persist editorial decisions separately from the fetched catalyst cache.

CREATE TABLE IF NOT EXISTS stock_why_moving_reviews (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  review_key text NOT NULL UNIQUE,
  symbol text NOT NULL,
  market_date date NOT NULL,
  session text NOT NULL CHECK (session IN ('premarket', 'cash', 'afterhours', 'closed')),
  direction text NOT NULL CHECK (direction IN ('gainer', 'loser')),
  status text NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'approved', 'needs_work', 'dismissed')),
  notes text NOT NULL DEFAULT '',
  reviewer_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  reviewed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_stock_why_moving_reviews_market_status
  ON stock_why_moving_reviews(market_date DESC, status, updated_at DESC);

CREATE INDEX IF NOT EXISTS idx_stock_why_moving_reviews_symbol
  ON stock_why_moving_reviews(symbol, market_date DESC);

ALTER TABLE stock_why_moving_reviews ENABLE ROW LEVEL SECURITY;

DROP TRIGGER IF EXISTS stock_why_moving_reviews_updated_at
  ON stock_why_moving_reviews;
CREATE TRIGGER stock_why_moving_reviews_updated_at
  BEFORE UPDATE ON stock_why_moving_reviews
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

COMMENT ON TABLE stock_why_moving_reviews IS
  'Admin-only editorial review state for daily stock-move catalysts.';
