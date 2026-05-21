-- Per-partner onboarding / monthly plan review state

CREATE TABLE IF NOT EXISTS family_budget_member_state (
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  last_onboarding_month VARCHAR(7),
  last_monthly_prompt_month VARCHAR(7),
  updated_at TIMESTAMP DEFAULT NOW(),
  PRIMARY KEY (project_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_fb_member_state_user ON family_budget_member_state(user_id);
