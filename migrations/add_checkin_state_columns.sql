-- Migration: Add check-in state tracking columns for daily check-in flow
-- Run this migration before deploying the new dailyCheckin handler

-- Add preferred check-in time (for future personalization)
ALTER TABLE chronic_patients 
ADD COLUMN IF NOT EXISTS preferred_check_in_time TIME DEFAULT '08:00:00';

-- Add current check-in state (for state machine)
ALTER TABLE chronic_patients 
ADD COLUMN IF NOT EXISTS current_checkin_state VARCHAR(50) DEFAULT NULL;

-- Add last response date (for non-responder tracking)
ALTER TABLE chronic_patients 
ADD COLUMN IF NOT EXISTS last_response_date DATE;

-- Add consecutive missed days counter
ALTER TABLE chronic_patients 
ADD COLUMN IF NOT EXISTS consecutive_missed_days INTEGER DEFAULT 0;

-- Create index for efficient querying by check-in time
CREATE INDEX IF NOT EXISTS idx_patients_preferred_time 
ON chronic_patients(preferred_check_in_time);

-- Create index for non-responder queries
CREATE INDEX IF NOT EXISTS idx_patients_last_response 
ON chronic_patients(last_response_date);

COMMENT ON COLUMN chronic_patients.preferred_check_in_time IS 'Patient preferred check-in time, default 8:00 AM';
COMMENT ON COLUMN chronic_patients.current_checkin_state IS 'Current check-in flow state: greeting, medication, symptoms, symptom_picker';
COMMENT ON COLUMN chronic_patients.last_response_date IS 'Last date patient responded to any check-in';
COMMENT ON COLUMN chronic_patients.consecutive_missed_days IS 'Counter for non-responder protocol (7-day escalation)';
