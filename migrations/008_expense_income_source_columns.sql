-- Backfill columns used by planned payment/income confirmations.
-- Run this small migration if an older database already has expenses/incomes
-- but was created before the source column existed.

ALTER TABLE expenses
  ADD COLUMN IF NOT EXISTS source VARCHAR(20) DEFAULT 'bot';

ALTER TABLE incomes
  ADD COLUMN IF NOT EXISTS source VARCHAR(20) DEFAULT 'bot';
