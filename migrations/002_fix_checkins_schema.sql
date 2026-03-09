-- Migration: Fix check_ins schema to match application code
-- Adds missing columns that the code expects

-- Add line_user_id column for direct user lookup (code uses this instead of patient_id FK)
ALTER TABLE check_ins 
ADD COLUMN IF NOT EXISTS line_user_id VARCHAR(255);

-- Add mood column
ALTER TABLE check_ins 
ADD COLUMN IF NOT EXISTS mood VARCHAR(50);

-- Add alert_level column for red flag tracking
ALTER TABLE check_ins 
ADD COLUMN IF NOT EXISTS alert_level VARCHAR(20) DEFAULT 'green';

-- Add check_in_time column (code uses this, schema uses created_at)
ALTER TABLE check_ins 
ADD COLUMN IF NOT EXISTS check_in_time TIMESTAMP DEFAULT NOW();

-- Add medication_notes column
ALTER TABLE check_ins 
ADD COLUMN IF NOT EXISTS medication_notes TEXT;

-- Add glucose_level column (rename from glucose INTEGER)
ALTER TABLE check_ins 
ADD COLUMN IF NOT EXISTS glucose_level INTEGER;

-- Create index for efficient queries by line_user_id and time
CREATE INDEX IF NOT EXISTS idx_checkins_line_user_time 
ON check_ins(line_user_id, check_in_time DESC);

-- Create index for date-based queries
CREATE INDEX IF NOT EXISTS idx_checkins_date 
ON check_ins(DATE(check_in_time));

-- Backfill check_in_time from created_at where null
UPDATE check_ins 
SET check_in_time = created_at 
WHERE check_in_time IS NULL AND created_at IS NOT NULL;

-- Verify migration
SELECT 
    column_name, 
    data_type, 
    is_nullable
FROM information_schema.columns 
WHERE table_name = 'check_ins'
ORDER BY ordinal_position;
