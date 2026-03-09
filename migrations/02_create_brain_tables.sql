-- Migration: 02_create_brain_tables.sql

-- 1. Patient State (The AI's Live Memory)
-- This table stores the current snapshot of a patient's risk and status.
-- One row per patient.
CREATE TABLE IF NOT EXISTS patient_state (
    patient_id UUID PRIMARY KEY REFERENCES chronic_patients(id) ON DELETE CASCADE,
    
    -- Risk Score (0-10)
    current_risk_score INTEGER DEFAULT 0,
    risk_level VARCHAR(20) DEFAULT 'low', -- 'low', 'medium', 'high', 'critical'
    
    -- Context
    last_interaction_at TIMESTAMP,
    last_checkin_at TIMESTAMP,
    
    -- Status
    is_silent_for_48h BOOLEAN DEFAULT FALSE,
    requires_nurse_attention BOOLEAN DEFAULT FALSE,
    
    updated_at TIMESTAMP DEFAULT NOW()
);

-- 2. Nurse Tasks (The Superhuman Queue)
-- This table stores the specific jobs the AI generates for the nurse.
CREATE TABLE IF NOT EXISTS nurse_tasks (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    patient_id UUID REFERENCES chronic_patients(id) ON DELETE CASCADE,
    
    -- Task Details
    task_type VARCHAR(50) NOT NULL, -- 'review_red_flag', 'call_silent_patient', 'routine_check'
    priority VARCHAR(10) DEFAULT 'normal', -- 'low', 'normal', 'high', 'critical'
    reason TEXT, -- "Glucose > 400 mg/dL"
    
    -- Status
    status VARCHAR(20) DEFAULT 'pending', -- 'pending', 'in_progress', 'completed', 'dismissed'
    assigned_to VARCHAR(255), -- Nurse ID or Name
    
    -- Timestamps
    created_at TIMESTAMP DEFAULT NOW(),
    completed_at TIMESTAMP
);

-- 3. Nurse Logs (Completion History)
-- This table tracks the actual work done (Time Tracking).
CREATE TABLE IF NOT EXISTS nurse_logs (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    task_id UUID REFERENCES nurse_tasks(id), -- Optional link to a task
    patient_id UUID REFERENCES chronic_patients(id),
    nurse_id VARCHAR(255),
    
    action_type VARCHAR(50), -- 'call', 'message', 'other'
    duration_seconds INTEGER,
    notes TEXT,
    
    created_at TIMESTAMP DEFAULT NOW()
);

-- Index for fast queue retrieval
CREATE INDEX IF NOT EXISTS idx_nurse_tasks_status_priority ON nurse_tasks(status, priority);
