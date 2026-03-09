-- Migration 04b: Fix Case Closure Tables (Corrected Types)
-- The original nurse_tasks uses INTEGER id, not UUID
-- Date: 2025-12-22

-- ============================================================
-- 1. case_rechecks WITH INTEGER FK
-- ============================================================
CREATE TABLE IF NOT EXISTS case_rechecks (
    id SERIAL PRIMARY KEY,
    task_id INTEGER REFERENCES nurse_tasks(id) ON DELETE CASCADE,
    patient_id UUID REFERENCES chronic_patients(id) ON DELETE CASCADE,
    scheduled_at TIMESTAMP NOT NULL,
    checked_at TIMESTAMP,
    result VARCHAR(20),
    new_task_id INTEGER REFERENCES nurse_tasks(id),
    notes TEXT,
    created_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_rechecks_pending 
ON case_rechecks(scheduled_at) 
WHERE checked_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_rechecks_patient 
ON case_rechecks(patient_id);

-- ============================================================
-- 2. escalation_log WITH INTEGER FK
-- ============================================================
CREATE TABLE IF NOT EXISTS escalation_log (
    id SERIAL PRIMARY KEY,
    task_id INTEGER REFERENCES nurse_tasks(id),
    patient_id UUID REFERENCES chronic_patients(id),
    escalation_level INTEGER NOT NULL,
    triggered_at TIMESTAMP DEFAULT NOW(),
    notification_type VARCHAR(20),
    notification_sent BOOLEAN DEFAULT FALSE,
    acknowledged_by VARCHAR(100),
    acknowledged_at TIMESTAMP,
    notes TEXT
);

CREATE INDEX IF NOT EXISTS idx_escalation_pending 
ON escalation_log(triggered_at) 
WHERE acknowledged_at IS NULL;

-- ============================================================
-- 3. Fix nurse_tasks columns (reopened_from as INTEGER)
-- ============================================================
ALTER TABLE nurse_tasks 
ADD COLUMN IF NOT EXISTS reopened_from INTEGER REFERENCES nurse_tasks(id);

-- ============================================================
-- VERIFICATION
-- ============================================================
DO $$ 
BEGIN
    RAISE NOTICE 'Migration 04b completed successfully';
END $$;
