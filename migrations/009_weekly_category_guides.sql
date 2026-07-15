-- Weekly category guides: soft weekly spending orientations by category group.

CREATE TABLE IF NOT EXISTS weekly_category_guides (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  title VARCHAR(100) NOT NULL,
  amount DECIMAL(12,2) NOT NULL CHECK (amount >= 0),
  categories TEXT[] NOT NULL DEFAULT '{}',
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_by BIGINT REFERENCES users(id),
  updated_by BIGINT REFERENCES users(id),
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_weekly_category_guides_project
  ON weekly_category_guides(project_id, is_active);
