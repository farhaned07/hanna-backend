-- Add admin role support if not exists
ALTER TABLE chronic_patients ADD COLUMN IF NOT EXISTS role TEXT DEFAULT 'patient';

-- Create admin user (you)
-- UPDATE chronic_patients SET role = 'admin' WHERE line_user_id = 'YOUR_LINE_ID';

