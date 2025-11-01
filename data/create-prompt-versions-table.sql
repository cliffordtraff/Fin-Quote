-- Prompt Versions Table
-- Stores different versions of prompts for A/B testing and improvement tracking

CREATE TABLE prompt_versions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  prompt_type TEXT NOT NULL, -- 'tool_selection' or 'answer_generation'
  version_number INTEGER NOT NULL,
  prompt_content TEXT NOT NULL,
  change_description TEXT,
  is_active BOOLEAN DEFAULT false,
  created_at TIMESTAMP DEFAULT NOW(),
  created_by TEXT,

  -- Ensure unique version numbers per prompt type
  UNIQUE(prompt_type, version_number)
);

-- Indexes for quick lookups
CREATE INDEX idx_prompt_versions_active ON prompt_versions(prompt_type, is_active);
CREATE INDEX idx_prompt_versions_version ON prompt_versions(prompt_type, version_number);

-- Row Level Security (RLS)
-- For MVP: Allow all operations (adjust based on your auth setup)
ALTER TABLE prompt_versions ENABLE ROW LEVEL SECURITY;

-- Policy: Allow all operations for now (tighten in production)
CREATE POLICY "Allow all operations on prompt_versions"
  ON prompt_versions
  FOR ALL
  USING (true)
  WITH CHECK (true);
