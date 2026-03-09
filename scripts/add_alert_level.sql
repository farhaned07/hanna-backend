-- Add alert_level column to check_ins table
ALTER TABLE check_ins ADD COLUMN IF NOT EXISTS alert_level VARCHAR(10) DEFAULT 'green';
