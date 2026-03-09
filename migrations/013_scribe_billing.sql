-- ==================================================
-- Scribe Billing Migration
-- ==================================================

-- 1. Add billing fields to clinicians
ALTER TABLE clinicians
ADD COLUMN IF NOT EXISTS plan VARCHAR(50) DEFAULT 'free',
ADD COLUMN IF NOT EXISTS notes_count_this_month INTEGER DEFAULT 0,
ADD COLUMN IF NOT EXISTS billing_cycle_reset TIMESTAMPTZ DEFAULT NOW() + INTERVAL '30 days';

-- 2. Add an index for billing queries
CREATE INDEX IF NOT EXISTS idx_clinicians_plan ON clinicians(plan);
