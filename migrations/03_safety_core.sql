-- Migration 03: Safety Core & Data Completeness

-- 1. Vitals Log (For Risk Calculation)
CREATE TABLE IF NOT EXISTS vitals_log (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    patient_id UUID REFERENCES chronic_patients(id),
    type VARCHAR(20) NOT NULL, -- 'glucose', 'bp', 'weight'
    value JSONB NOT NULL, -- e.g. {"level": 120}, {"systolic": 120, "diastolic": 80}
    source VARCHAR(20) DEFAULT 'manual', -- 'manual', 'voice'
    created_at TIMESTAMP DEFAULT NOW()
);

-- 2. Medication Log (For Adherence Tracking)
CREATE TABLE IF NOT EXISTS medication_log (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    patient_id UUID REFERENCES chronic_patients(id),
    med_name VARCHAR(100),
    taken BOOLEAN DEFAULT FALSE,
    reason_skipped TEXT,
    created_at TIMESTAMP DEFAULT NOW()
);

-- 3. Audit Log (Legal Requirement)
CREATE TABLE IF NOT EXISTS audit_log (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    timestamp TIMESTAMP DEFAULT NOW(),
    actor VARCHAR(100) NOT NULL, -- 'OneBrain', 'Nurse_ID', 'Patient'
    action VARCHAR(100) NOT NULL, -- 'CALCULATE_RISK', 'RESOLVE_TASK'
    patient_id UUID REFERENCES chronic_patients(id),
    details JSONB
);

-- 4. Update Patient State (Add Reasoning)
ALTER TABLE patient_state 
ADD COLUMN IF NOT EXISTS risk_reasoning JSONB;

-- 5. Update Nurse Tasks (Add Context & Escalation)
ALTER TABLE nurse_tasks 
ADD COLUMN IF NOT EXISTS context JSONB,
ADD COLUMN IF NOT EXISTS dismissal_reason VARCHAR(50),
ADD COLUMN IF NOT EXISTS escalation_level INTEGER DEFAULT 0;

-- 6. Alerts/Safeguards Indexing
CREATE INDEX IF NOT EXISTS idx_vitals_patient ON vitals_log(patient_id);
CREATE INDEX IF NOT EXISTS idx_audit_patient ON audit_log(patient_id);
