-- One canonical family budget per couple: first finisher wins

ALTER TABLE projects ADD COLUMN IF NOT EXISTS family_established_at TIMESTAMP;
ALTER TABLE projects ADD COLUMN IF NOT EXISTS family_established_by BIGINT REFERENCES users(id);

-- Backfill: oldest completed family project becomes canonical
UPDATE projects p
SET family_established_at = COALESCE(p.family_established_at, p.created_at),
    family_established_by = COALESCE(p.family_established_by, p.owner_id)
WHERE p.is_family_budget = TRUE
  AND p.onboarding_completed = TRUE
  AND p.family_established_at IS NULL
  AND p.id = (
    SELECT id FROM projects
    WHERE is_family_budget = TRUE AND onboarding_completed = TRUE
    ORDER BY created_at ASC
    LIMIT 1
  );
