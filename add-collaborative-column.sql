-- Add is_collaborative column to projects table
-- Execute this SQL in Supabase SQL Editor

ALTER TABLE projects
ADD COLUMN IF NOT EXISTS is_collaborative BOOLEAN DEFAULT FALSE;

-- Verify the column was added
SELECT column_name, data_type, is_nullable, column_default
FROM information_schema.columns
WHERE table_name = 'projects'
AND column_name = 'is_collaborative';