-- project_invites table — was defined in src/services/supabase.js setupDatabase()
-- but that bootstrap is short-circuited ("Skipping table creation - please
-- create tables manually in Supabase"), so the table was never created on the
-- live database. The code tried to insert into it silently and the partner
-- got "Ссылка не найдена в базе".
--
-- Apply this migration in the Supabase SQL Editor, then generate a fresh
-- invite link and try again.

CREATE TABLE IF NOT EXISTS project_invites (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  token VARCHAR(64) UNIQUE NOT NULL,
  expires_at TIMESTAMP NOT NULL,
  created_at TIMESTAMP DEFAULT NOW()
);

-- Lookup by token is the hot path (every /start with a deep-link parameter).
CREATE INDEX IF NOT EXISTS project_invites_token_idx
  ON project_invites (token);

-- Clean-up / reporting helper.
CREATE INDEX IF NOT EXISTS project_invites_project_id_idx
  ON project_invites (project_id);

-- If you use Row Level Security on the Supabase project, the bot must be
-- authenticated with the service_role key (not anon) so it can both INSERT
-- new invite rows AND SELECT them when the partner clicks the deep link.
-- Check `.env` → SUPABASE_KEY should be the service_role key for the bot.
--
-- Alternatively, you can leave RLS off for this table (it stores only random
-- tokens that expire in 7 days, no PII):
--   ALTER TABLE project_invites DISABLE ROW LEVEL SECURITY;
