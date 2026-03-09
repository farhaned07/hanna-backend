-- Migration 04: Case Closure & Accountability Schema
-- Enterprise Upgrade: Mandatory outcome tracking, post-resolution monitoring, re-entry logic
-- Date: 2025-12-22

-- ============================================================
-- 1. OUTCOME CODE LOOKUP TABLE
-- Provides standardized, claims-defensible resolution codes
-- ============================================================
CREATE TABLE IF NOT EXISTS outcome_codes (
    code VARCHAR(30) PRIMARY KEY,
    category VARCHAR(20) NOT NULL, -- 'positive', 'neutral', 'escalation', 'emergency', 'dismissal'
    description TEXT NOT NULL,
    claims_mapping VARCHAR(100),
    created_at TIMESTAMP DEFAULT NOW()
);

-- Seed outcome codes
INSERT INTO outcome_codes (code, category, description, claims_mapping) VALUES
    ('REACHED_STABLE', 'positive', 'Patient contacted, condition stable', 'Routine monitoring'),
    ('REACHED_IMPROVED', 'positive', 'Patient contacted, condition improved', 'Treatment effective'),
    ('REACHED_REFERRED', 'neutral', 'Patient contacted, referred for further care', 'Appropriate escalation'),
    ('NOT_REACHED_RETRY', 'pending', 'Unable to contact, retry scheduled', 'Documented attempt'),
    ('NOT_REACHED_ESCALATED', 'escalation', 'Unable to contact, escalated to supervisor', 'Appropriate escalation'),
    ('EMERGENCY_CONFIRMED', 'emergency', 'Emergency services involved', 'Critical incident'),
    ('FALSE_POSITIVE', 'dismissal', 'Alert was incorrect; documented rationale', 'System learning')
ON CONFLICT (code) DO NOTHING;

-- ============================================================
-- 2. NURSE_TASKS: Add case closure fields
-- Adds mandatory outcome tracking and recheck scheduling
-- ============================================================
ALTER TABLE nurse_tasks 
ADD COLUMN IF NOT EXISTS outcome_code VARCHAR(30) REFERENCES outcome_codes(code),
ADD COLUMN IF NOT EXISTS action_taken VARCHAR(50),
ADD COLUMN IF NOT EXISTS clinical_notes TEXT,
ADD COLUMN IF NOT EXISTS follow_up_date DATE,
ADD COLUMN IF NOT EXISTS recheck_scheduled_at TIMESTAMP,
ADD COLUMN IF NOT EXISTS recheck_passed BOOLEAN,
ADD COLUMN IF NOT EXISTS closed_at TIMESTAMP,
ADD COLUMN IF NOT EXISTS reopened_from UUID;

-- Add self-referential FK after column exists
DO $$ 
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.table_constraints 
        WHERE constraint_name = 'fk_nurse_tasks_reopened_from'
    ) THEN
        ALTER TABLE nurse_tasks 
        ADD CONSTRAINT fk_nurse_tasks_reopened_from 
        FOREIGN KEY (reopened_from) REFERENCES nurse_tasks(id);
    END IF;
END $$;

-- ============================================================
-- 3. CASE RECHECKS: Post-resolution monitoring table
-- Schedules 24h follow-up checks after task resolution
-- ============================================================
CREATE TABLE IF NOT EXISTS case_rechecks (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    task_id UUID REFERENCES nurse_tasks(id) ON DELETE CASCADE,
    patient_id UUID REFERENCES chronic_patients(id) ON DELETE CASCADE,
    scheduled_at TIMESTAMP NOT NULL,
    checked_at TIMESTAMP,
    result VARCHAR(20), -- 'passed', 'failed', 'new_alert', 'manual_review'
    new_task_id UUID REFERENCES nurse_tasks(id),
    notes TEXT,
    created_at TIMESTAMP DEFAULT NOW()
);

-- Index for efficient recheck scheduling
CREATE INDEX IF NOT EXISTS idx_rechecks_pending 
ON case_rechecks(scheduled_at) 
WHERE checked_at IS NULL;

-- Index for patient lookup
CREATE INDEX IF NOT EXISTS idx_rechecks_patient 
ON case_rechecks(patient_id);

-- ============================================================
-- 4. ESCALATION LOG: Track all escalations with notifications
-- ============================================================
CREATE TABLE IF NOT EXISTS escalation_log (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    task_id UUID REFERENCES nurse_tasks(id),
    patient_id UUID REFERENCES chronic_patients(id),
    escalation_level INTEGER NOT NULL, -- 1=supervisor, 2=clinical_director
    triggered_at TIMESTAMP DEFAULT NOW(),
    notification_type VARCHAR(20), -- 'sms', 'email', 'push'
    notification_sent BOOLEAN DEFAULT FALSE,
    acknowledged_by VARCHAR(100),
    acknowledged_at TIMESTAMP,
    notes TEXT
);

CREATE INDEX IF NOT EXISTS idx_escalation_pending 
ON escalation_log(triggered_at) 
WHERE acknowledged_at IS NULL;

-- ============================================================
-- 5. NURSE OVERLOAD EVENTS: Capacity tracking
-- ============================================================
CREATE TABLE IF NOT EXISTS capacity_events (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    event_type VARCHAR(30) NOT NULL, -- 'overload_warning', 'overload_critical', 'normalized'
    queue_size INTEGER NOT NULL,
    threshold INTEGER NOT NULL,
    notification_sent BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMP DEFAULT NOW()
);

-- ============================================================
-- 6. UPDATE AUDIT_LOG: Add new action types
-- ============================================================
-- No schema change needed, but document new action types:
-- 'ESCALATION_SMS_SENT' - SMS notification dispatched
-- 'CASE_RECHECK_SCHEDULED' - 24h recheck scheduled
-- 'CASE_RECHECK_PASSED' - Recheck passed, case closed
-- 'CASE_RECHECK_FAILED' - Recheck failed, case reopened
-- 'CAPACITY_WARNING' - Nurse overload detected

-- ============================================================
-- 7. MIGRATION VERIFICATION
-- ============================================================
DO $$ 
BEGIN
    RAISE NOTICE 'Migration 04_case_closure completed successfully';
    RAISE NOTICE 'New tables: outcome_codes, case_rechecks, escalation_log, capacity_events';
    RAISE NOTICE 'Modified tables: nurse_tasks (7 new columns)';
END $$;
