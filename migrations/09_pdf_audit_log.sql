-- PDF Summary Generation Audit Log
-- Migration: 09_pdf_audit_log.sql
-- Purpose: Track all PDF summary generations for audit compliance

CREATE TABLE IF NOT EXISTS pdf_audit_log (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    patient_id UUID NOT NULL REFERENCES chronic_patients(id) ON DELETE CASCADE,
    audit_id VARCHAR(20) UNIQUE NOT NULL,
    generated_by VARCHAR(255) NOT NULL, -- Nurse/staff identifier
    time_range_days INTEGER NOT NULL CHECK (time_range_days IN (7, 15, 30)),
    language VARCHAR(5) NOT NULL CHECK (language IN ('th', 'en')),
    file_path TEXT NOT NULL,
    file_size_bytes INTEGER,
    checksum VARCHAR(64) NOT NULL, -- SHA-256 for tamper detection
    generation_time_ms INTEGER, -- Performance tracking
    accessed_count INTEGER DEFAULT 0,
    last_accessed_at TIMESTAMP,
    created_at TIMESTAMP DEFAULT NOW()
);

-- Indexes for common queries
CREATE INDEX IF NOT EXISTS idx_pdf_audit_patient ON pdf_audit_log(patient_id);
CREATE INDEX IF NOT EXISTS idx_pdf_audit_id ON pdf_audit_log(audit_id);
CREATE INDEX IF NOT EXISTS idx_pdf_audit_created ON pdf_audit_log(created_at DESC);

-- Comment for documentation
COMMENT ON TABLE pdf_audit_log IS 'Audit trail for patient health summary PDF generations. Each PDF is identified by a unique audit_id and includes checksum for tamper detection.';
