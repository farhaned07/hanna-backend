-- Migration 08: PDPA Erasure Log - Legal requirement to track data deletions
-- Implements Thailand PDPA Article 19 compliance

CREATE TABLE IF NOT EXISTS erasure_log (
    id SERIAL PRIMARY KEY,
    patient_id_original UUID NOT NULL,
    patient_name_hash VARCHAR(64),       -- MD5 hash for audit trail, not PII
    line_user_id_hash VARCHAR(64),       -- MD5 hash for audit trail, not PII
    reason TEXT NOT NULL,                -- Why data was erased
    requested_by VARCHAR(100) NOT NULL,  -- Who requested the erasure
    erased_at TIMESTAMP NOT NULL DEFAULT NOW()
);

-- Index for audit queries by date
CREATE INDEX IF NOT EXISTS idx_erasure_date ON erasure_log(erased_at);

-- Comment for documentation
COMMENT ON TABLE erasure_log IS 'PDPA Article 19 compliance - records all data erasure requests';
