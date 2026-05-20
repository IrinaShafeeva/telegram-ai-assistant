-- Family budget (Lumik) schema — run in Supabase SQL Editor

-- Users
ALTER TABLE users ADD COLUMN IF NOT EXISTS lumik_update_seen BOOLEAN DEFAULT FALSE;
ALTER TABLE users ADD COLUMN IF NOT EXISTS last_morning_sent_date DATE;
ALTER TABLE users ADD COLUMN IF NOT EXISTS last_insight_sent_date DATE;

-- Projects
ALTER TABLE projects ADD COLUMN IF NOT EXISTS is_family_budget BOOLEAN DEFAULT FALSE;
ALTER TABLE projects ADD COLUMN IF NOT EXISTS budget_currency VARCHAR(3);
ALTER TABLE projects ADD COLUMN IF NOT EXISTS onboarding_completed BOOLEAN DEFAULT FALSE;
ALTER TABLE projects ADD COLUMN IF NOT EXISTS last_insight_sent_at TIMESTAMP;

-- Planned mandatory payments (monthly)
CREATE TABLE IF NOT EXISTS planned_payments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  title VARCHAR(200) NOT NULL,
  amount DECIMAL(12,2) NOT NULL,
  day_of_month INTEGER NOT NULL CHECK (day_of_month >= 1 AND day_of_month <= 31),
  category VARCHAR(100),
  created_by BIGINT REFERENCES users(id),
  updated_by BIGINT REFERENCES users(id),
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- Planned expected incomes (monthly)
CREATE TABLE IF NOT EXISTS planned_incomes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  title VARCHAR(200) NOT NULL,
  amount DECIMAL(12,2) NOT NULL,
  day_of_month INTEGER NOT NULL CHECK (day_of_month >= 1 AND day_of_month <= 31),
  category VARCHAR(100),
  created_by BIGINT REFERENCES users(id),
  updated_by BIGINT REFERENCES users(id),
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- Starting / listed debts
CREATE TABLE IF NOT EXISTS debts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  description VARCHAR(200) NOT NULL,
  amount DECIMAL(12,2) NOT NULL,
  created_by BIGINT REFERENCES users(id),
  updated_by BIGINT REFERENCES users(id),
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- Debt top-ups (no loan transfers — only increase counter)
CREATE TABLE IF NOT EXISTS debt_adjustments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  amount DECIMAL(12,2) NOT NULL,
  note VARCHAR(300),
  created_by BIGINT REFERENCES users(id),
  created_at TIMESTAMP DEFAULT NOW()
);

-- Floating (irregular) actual income for current month
CREATE TABLE IF NOT EXISTS floating_incomes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  amount DECIMAL(12,2) NOT NULL,
  description VARCHAR(200),
  income_date DATE NOT NULL DEFAULT CURRENT_DATE,
  created_by BIGINT REFERENCES users(id),
  created_at TIMESTAMP DEFAULT NOW()
);

-- Audit trail for plan list changes
CREATE TABLE IF NOT EXISTS budget_changelog (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  user_id BIGINT REFERENCES users(id),
  entity_type VARCHAR(50) NOT NULL,
  entity_id UUID,
  action VARCHAR(20) NOT NULL,
  summary TEXT NOT NULL,
  old_value JSONB,
  new_value JSONB,
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_planned_payments_project ON planned_payments(project_id);
CREATE INDEX IF NOT EXISTS idx_planned_incomes_project ON planned_incomes(project_id);
CREATE INDEX IF NOT EXISTS idx_debts_project ON debts(project_id);
CREATE INDEX IF NOT EXISTS idx_floating_incomes_project_date ON floating_incomes(project_id, income_date);
CREATE INDEX IF NOT EXISTS idx_budget_changelog_project ON budget_changelog(project_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_projects_family_owner ON projects(owner_id) WHERE is_family_budget = TRUE;
