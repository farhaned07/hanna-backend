-- Migration 015: Follow-up System Tables
-- Critical P0 fix for patient follow-up program enrollment and tracking
-- Created: March 6, 2026
-- Priority: P0 (Revenue Blocker)

-- ============================================================
-- 1. FOLLOW-UPS TABLE (Patient Enrollment)
-- ============================================================

CREATE TABLE IF NOT EXISTS followups (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    patient_name VARCHAR(255) NOT NULL,
    patient_hn VARCHAR(100),
    phone VARCHAR(20) NOT NULL,
    line_user_id VARCHAR(255),
    line_pending BOOLEAN DEFAULT false,
    line_added_at TIMESTAMP,
    type VARCHAR(50) NOT NULL DEFAULT 'chronic', -- chronic/post-op/medication/general
    duration_days INTEGER NOT NULL DEFAULT 14, -- 7/14/30
    status VARCHAR(50) DEFAULT 'active', -- active/completed/cancelled
    start_date TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    end_date TIMESTAMP WITH TIME ZONE,
    doctor_id UUID,
    tenant_id UUID,
    scribe_session_id UUID,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

COMMENT ON TABLE followups IS 'Patient follow-up program enrollments for LINE-based chronic care';
COMMENT ON COLUMN followups.type IS 'Type of follow-up: chronic (diabetes/HTN), post-op, medication review, general';
COMMENT ON COLUMN followups.duration_days IS 'Follow-up duration in days: 7 (post-op), 14 (chronic), 30 (medication)';
COMMENT ON COLUMN followups.line_pending IS 'True if patient has not yet added LINE friend';
COMMENT ON COLUMN followups.scribe_session_id IS 'Link to Scribe session that triggered enrollment';

-- ============================================================
-- 2. FOLLOWUP MESSAGES TABLE (Scheduled Message Tracking)
-- ============================================================

CREATE TABLE IF NOT EXISTS followup_messages (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    followup_id UUID REFERENCES followups(id) ON DELETE CASCADE,
    scheduled_day INTEGER NOT NULL, -- 0=welcome, 1, 3, 7, 14
    message_template_id VARCHAR(100), -- welcome/day1_checkin/day3_medication/etc.
    sent_at TIMESTAMP WITH TIME ZONE,
    delivered_at TIMESTAMP WITH TIME ZONE,
    read_at TIMESTAMP WITH TIME ZONE,
    status VARCHAR(50) DEFAULT 'pending', -- pending/sent/delivered/failed
    error_message TEXT,
    retry_count INTEGER DEFAULT 0,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

COMMENT ON TABLE followup_messages IS 'Scheduled follow-up messages sent via LINE';
COMMENT ON COLUMN followup_messages.scheduled_day IS 'Day of follow-up program (0=welcome, 1, 3, 7, 14)';
COMMENT ON COLUMN followup_messages.message_template_id IS 'Template identifier: welcome, day1_checkin, day3_medication, day7_symptoms, day14_final';

-- ============================================================
-- 3. PATIENT RESPONSES TABLE (Response Tracking)
-- ============================================================

CREATE TABLE IF NOT EXISTS patient_responses (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    message_id UUID REFERENCES followup_messages(id) ON DELETE CASCADE,
    followup_id UUID REFERENCES followups(id) ON DELETE CASCADE,
    patient_response TEXT NOT NULL,
    response_type VARCHAR(50) DEFAULT 'postback', -- postback/text/button
    received_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    risk_score INTEGER,
    alert_triggered BOOLEAN DEFAULT false,
    processed_by_onebrain BOOLEAN DEFAULT false,
    onebrain_processed_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

COMMENT ON TABLE patient_responses IS 'Patient responses to follow-up messages';
COMMENT ON COLUMN followup_messages.risk_score IS 'Risk score calculated from response (0-10)';
COMMENT ON COLUMN followup_messages.alert_triggered IS 'True if response triggered nurse alert';
COMMENT ON COLUMN followup_messages.processed_by_onebrain IS 'True if OneBrain has analyzed this response';

-- ============================================================
-- 4. LINK SCRIBE SESSIONS TO FOLLOW-UPS
-- ============================================================

ALTER TABLE scribe_sessions 
ADD COLUMN IF NOT EXISTS followup_id UUID REFERENCES followups(id) ON DELETE SET NULL;

COMMENT ON COLUMN scribe_sessions.followup_id IS 'Link to follow-up program if patient was enrolled';

-- ============================================================
-- 5. PERFORMANCE INDEXES
-- ============================================================

-- Followups indexes
CREATE INDEX IF NOT EXISTS idx_followups_line_user ON followups(line_user_id);
CREATE INDEX IF NOT EXISTS idx_followups_status ON followups(status);
CREATE INDEX IF NOT EXISTS idx_followups_end_date ON followups(end_date);
CREATE INDEX IF NOT EXISTS idx_followups_type ON followups(type);
CREATE INDEX IF NOT EXISTS idx_followups_tenant ON followups(tenant_id);
CREATE INDEX IF NOT EXISTS idx_followups_scribe_session ON followups(scribe_session_id);

-- Followup messages indexes
CREATE INDEX IF NOT EXISTS idx_followup_messages_followup ON followup_messages(followup_id);
CREATE INDEX IF NOT EXISTS idx_followup_messages_status ON followup_messages(status);
CREATE INDEX IF NOT EXISTS idx_followup_messages_scheduled ON followup_messages(sent_at) WHERE sent_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_followup_messages_retry ON followup_messages(retry_count) WHERE status = 'failed';

-- Patient responses indexes
CREATE INDEX IF NOT EXISTS idx_patient_responses_followup ON patient_responses(followup_id);
CREATE INDEX IF NOT EXISTS idx_patient_responses_message ON patient_responses(message_id);
CREATE INDEX IF NOT EXISTS idx_patient_responses_alert ON patient_responses(alert_triggered) WHERE alert_triggered = true;
CREATE INDEX IF NOT EXISTS idx_patient_responses_unprocessed ON patient_responses(processed_by_onebrain) WHERE processed_by_onebrain = false;

-- Scribe sessions index
CREATE INDEX IF NOT EXISTS idx_scribe_sessions_followup ON scribe_sessions(followup_id);

-- ============================================================
-- 6. UPDATED_AT TRIGGER
-- ============================================================

-- Create function if not exists
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Apply trigger to followups
DROP TRIGGER IF EXISTS update_followups_updated_at ON followups;
CREATE TRIGGER update_followups_updated_at
    BEFORE UPDATE ON followups
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- ============================================================
-- 7. ADD LINK COLUMN TO CHRONIC PATIENTS (Optional Bridge)
-- ============================================================

-- Add followup_id to chronic_patients for bidirectional linking
ALTER TABLE chronic_patients 
ADD COLUMN IF NOT EXISTS followup_id UUID REFERENCES followups(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_chronic_patients_followup ON chronic_patients(followup_id);

COMMENT ON COLUMN chronic_patients.followup_id IS 'Current or most recent follow-up program';

-- ============================================================
-- 8. SEED DEFAULT DATA (Optional)
-- ============================================================

-- Insert default message template configuration
INSERT INTO system_alerts (type, severity, message, metadata)
VALUES (
    'system',
    'info',
    'Follow-up system migration completed',
    '{"migration": "015_followup_linkage", "tables_created": ["followups", "followup_messages", "patient_responses"]}'
) ON CONFLICT DO NOTHING;

-- ============================================================
-- 9. VERIFICATION QUERY
-- ============================================================

-- Run this to verify migration succeeded:
-- SELECT 
--     (SELECT count(*) FROM followups) as followups_count,
--     (SELECT count(*) FROM followup_messages) as messages_count,
--     (SELECT count(*) FROM patient_responses) as responses_count;

COMMENT ON MIGRATION IS '015_followup_linkage: Critical P0 fix for patient follow-up enrollment and LINE message tracking';
