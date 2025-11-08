-- Create evaluation_annotations table for storing user feedback on test failures
CREATE TABLE IF NOT EXISTS evaluation_annotations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  evaluation_file TEXT NOT NULL,
  question_id INTEGER NOT NULL,
  action TEXT CHECK (action IN ('fix_bug', 'update_golden_test', 'add_alias', 'update_prompt', 'skip')),
  comment TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),

  -- Unique constraint: one annotation per question per evaluation file
  UNIQUE(evaluation_file, question_id)
);

-- Add index for faster lookups
CREATE INDEX idx_evaluation_annotations_file ON evaluation_annotations(evaluation_file);
CREATE INDEX idx_evaluation_annotations_question ON evaluation_annotations(question_id);

-- Add RLS policies
ALTER TABLE evaluation_annotations ENABLE ROW LEVEL SECURITY;

-- Allow all operations for authenticated users (admins only in practice)
CREATE POLICY "Allow all operations for authenticated users"
  ON evaluation_annotations
  FOR ALL
  TO authenticated
  USING (true)
  WITH CHECK (true);

-- Create updated_at trigger
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_evaluation_annotations_updated_at
  BEFORE UPDATE ON evaluation_annotations
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- Add comment
COMMENT ON TABLE evaluation_annotations IS 'Stores user annotations/feedback on evaluation test failures';
