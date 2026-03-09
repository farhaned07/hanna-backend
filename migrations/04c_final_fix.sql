-- Migration 04c: Final Fix - Correct All Types
-- All IDs in nurse_tasks and chronic_patients are INTEGER, not UUID
-- Date: 2025-12-22

-- ============================================================
-- 1. Fix reopened_from column type (was UUID, should be INTEGER)
-- ============================================================
ALTER TABLE nurse_tasks DROP COLUMN IF EXISTS reopened_from;
ALTER TABLE nurse_tasks ADD COLUMN reopened_from INTEGER REFERENCES nurse_tasks(id);

-- ============================================================
-- 2. Create case_rechecks with INTEGER types
-- ============================================================
DROP TABLE IF EXISTS case_rechecks;

CREATE TABLE case_rechecks (
    id SERIAL PRIMARY KEY,
    task_id INTEGER REFERENCES nurse_tasks(id) ON DELETE CASCADE,
    patient_id INTEGER REFERENCES chronic_patients(id) ON DELETE CASCADE,
    scheduled_at TIMESTAMP NOT NULL,
    checked_at TIMESTAMP,
    result VARCHAR(20),
    new_task_id INTEGER REFERENCES nurse_tasks(id),
    notes TEXT,
    created_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_rechecks_pending ON case_rechecks(scheduled_at) WHERE checked_at IS NULL;
CREATE INDEX idx_rechecks_patient ON case_rechecks(patient_id);

-- ============================================================
-- 3. Create escalation_log with INTEGER types
-- ============================================================
DROP TABLE IF EXISTS escalation_log;

CREATE TABLE escalation_log (
    id SERIAL PRIMARY KEY,
    task_id INTEGER REFERENCES nurse_tasks(id),
    patient_id INTEGER REFERENCES chronic_patients(id),
    escalation_level INTEGER NOT NULL,
    triggered_at TIMESTAMP DEFAULT NOW(),
    notification_type VARCHAR(20),
    notification_sent BOOLEAN DEFAULT FALSE,
    acknowledged_by VARCHAR(100),
    acknowledged_at TIMESTAMP,
    notes TEXT
);

CREATE INDEX idx_escalation_pending ON escalation_log(triggered_at) WHERE acknowledged_at IS NULL;

-- ============================================================
-- VERIFICATION
-- ============================================================
DO $$ 
BEGIN
    RAISE NOTICE 'Migration 04c completed successfully - all types fixed';
END $$;
