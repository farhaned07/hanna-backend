-- Migration: Add PDPA consent columns to chronic_patients table
-- Run this on production database to fix onboarding errors

-- Add consent_pdpa column (default FALSE for existing users)
ALTER TABLE chronic_patients 
ADD COLUMN IF NOT EXISTS consent_pdpa BOOLEAN DEFAULT FALSE;

-- Add consent_medical_share column (default FALSE for existing users)
ALTER TABLE chronic_patients 
ADD COLUMN IF NOT EXISTS consent_medical_share BOOLEAN DEFAULT FALSE;

-- Add consent_date column (nullable for existing users)
ALTER TABLE chronic_patients 
ADD COLUMN IF NOT EXISTS consent_date TIMESTAMP;

-- For existing users who are already active, set consent to TRUE
-- (they implicitly consented by using the service)
UPDATE chronic_patients 
SET consent_pdpa = TRUE, 
    consent_medical_share = TRUE,
    consent_date = created_at
WHERE enrollment_status IN ('trial', 'active', 'expired')
  AND consent_pdpa IS NULL OR consent_pdpa = FALSE;

-- Verify the migration
SELECT 
    COUNT(*) as total_users,
    COUNT(CASE WHEN consent_pdpa = TRUE THEN 1 END) as consented_users,
    COUNT(CASE WHEN consent_pdpa = FALSE OR consent_pdpa IS NULL THEN 1 END) as pending_consent
FROM chronic_patients;
