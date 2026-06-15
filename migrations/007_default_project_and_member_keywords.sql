-- Default project per user + per-member keywords.
--
-- 1) users.default_project_id — the project a user picks as their default.
--    When a transaction text matches no project keywords, the expense goes
--    here instead of always falling back to "Личные траты". Lets a user whose
--    spending is mostly shared route everything to the family budget by
--    default. Nullable; NULL means "use Личные траты / first project".
--
-- 2) project_members.keywords — per-member keywords for a shared (team/family)
--    project. The projects.keywords column is a single owner-set value shared
--    by everyone; this column lets each participant add their own trigger
--    words for the same project without touching the owner's list.
--
-- Apply in the Supabase SQL Editor.

ALTER TABLE users
  ADD COLUMN IF NOT EXISTS default_project_id UUID REFERENCES projects(id) ON DELETE SET NULL;

ALTER TABLE project_members
  ADD COLUMN IF NOT EXISTS keywords TEXT;
