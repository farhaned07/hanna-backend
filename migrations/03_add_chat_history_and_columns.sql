-- Migration: 03_add_chat_history_and_columns.sql
-- Adds chat_history table for persistent conversation memory
-- Also adds missing columns to check_ins table for healthData.js compatibility

-- 1. Chat History Table (for persistent conversation memory)
CREATE TABLE IF NOT EXISTS chat_history (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    patient_id UUID REFERENCES chronic_patients(id) ON DELETE CASCADE,
    role VARCHAR(20) NOT NULL, -- 'user', 'assistant'
    message TEXT NOT NULL,
    created_at TIMESTAMP DEFAULT NOW()
);

-- Index for fast retrieval of recent messages
CREATE INDEX IF NOT EXISTS idx_chat_history_patient_time 
ON chat_history(patient_id, created_at DESC);

-- 2. Add missing columns to check_ins if they don't exist
-- These columns are used by healthData.js but may not be in original schema
DO $$
BEGIN
    -- Add mood column if not exists
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                   WHERE table_name='check_ins' AND column_name='mood') THEN
        ALTER TABLE check_ins ADD COLUMN mood VARCHAR(50);
    END IF;
    
    -- Add glucose_level column if not exists (different from 'glucose' integer)
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                   WHERE table_name='check_ins' AND column_name='glucose_level') THEN
        ALTER TABLE check_ins ADD COLUMN glucose_level INTEGER;
    END IF;
    
    -- Add alert_level column if not exists
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                   WHERE table_name='check_ins' AND column_name='alert_level') THEN
        ALTER TABLE check_ins ADD COLUMN alert_level VARCHAR(20);
    END IF;
    
    -- Add check_in_time column if not exists
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                   WHERE table_name='check_ins' AND column_name='check_in_time') THEN
        ALTER TABLE check_ins ADD COLUMN check_in_time TIMESTAMP DEFAULT NOW();
    END IF;
    
    -- Add medication_notes column if not exists
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                   WHERE table_name='check_ins' AND column_name='medication_notes') THEN
        ALTER TABLE check_ins ADD COLUMN medication_notes TEXT;
    END IF;
    
    -- Add risk_reasoning column to patient_state if not exists
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                   WHERE table_name='patient_state' AND column_name='risk_reasoning') THEN
        ALTER TABLE patient_state ADD COLUMN risk_reasoning JSONB;
    END IF;
END $$;

-- 3. Audit Log table (for legal compliance)
CREATE TABLE IF NOT EXISTS audit_log (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    actor VARCHAR(100) NOT NULL, -- 'OneBrain', 'Nurse:123', 'System'
    action VARCHAR(100) NOT NULL, -- 'CALCULATE_RISK', 'RESOLVE_TASK', etc.
    patient_id UUID REFERENCES chronic_patients(id) ON DELETE SET NULL,
    details JSONB,
    created_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_audit_log_patient_time 
ON audit_log(patient_id, created_at DESC);
