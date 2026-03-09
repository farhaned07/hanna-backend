-- Migration 07: Add disclaimer tracking columns for regulatory compliance
-- Required for pilot deployment

-- Disclaimer acceptance tracking
ALTER TABLE chronic_patients 
ADD COLUMN IF NOT EXISTS disclaimer_accepted BOOLEAN DEFAULT FALSE;

ALTER TABLE chronic_patients 
ADD COLUMN IF NOT EXISTS disclaimer_date TIMESTAMP;

-- Backfill existing active users (they implicitly accepted during previous onboarding)
UPDATE chronic_patients 
SET disclaimer_accepted = TRUE, disclaimer_date = consent_date
WHERE enrollment_status IN ('active', 'trial')
  AND consent_pdpa = TRUE
  AND disclaimer_accepted = FALSE;

-- Verification query
SELECT 
    COUNT(*) as total_patients,
    COUNT(CASE WHEN disclaimer_accepted = TRUE THEN 1 END) as disclaimer_accepted,
    COUNT(CASE WHEN disclaimer_accepted = FALSE OR disclaimer_accepted IS NULL THEN 1 END) as pending_disclaimer
FROM chronic_patients;
