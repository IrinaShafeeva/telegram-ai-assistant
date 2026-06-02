-- Inter-project transfers.
--
-- A transfer is a paired record: one expense in the source project and one
-- income in the target project. Both rows share the same transfer_id so we
-- can reconstruct the link, hide both halves from analytics totals, and
-- delete them together if needed.
--
-- Dedicated category TRANSFER_CATEGORY ('↔️ Перевод') is used so analytics
-- and reports can filter the rows out of "real" income/expense totals — they
-- cancel each other out across projects.

ALTER TABLE expenses
  ADD COLUMN IF NOT EXISTS transfer_id UUID;

ALTER TABLE incomes
  ADD COLUMN IF NOT EXISTS transfer_id UUID;

CREATE INDEX IF NOT EXISTS expenses_transfer_id_idx
  ON expenses (transfer_id)
  WHERE transfer_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS incomes_transfer_id_idx
  ON incomes (transfer_id)
  WHERE transfer_id IS NOT NULL;
