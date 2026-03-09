-- Migration: 11_false_negative_audit.sql
-- FALSE NEGATIVE MITIGATION: Post-mortem tracking for regulatory compliance
-- When clinical events occur, we can check if OneBrain flagged the patient beforehand

-- Clinical Events Table (for post-mortem analysis)
CREATE TABLE IF NOT EXISTS clinical_events (
    id SERIAL PRIMARY KEY,
    patient_id INTEGER REFERENCES chronic_patients(id) ON DELETE CASCADE,
    
    -- Event details
    event_type VARCHAR(50) NOT NULL, -- 'hospitalization', 'er_visit', 'adverse_event', 'death'
    event_date TIMESTAMP NOT NULL,
    severity VARCHAR(20), -- 'mild', 'moderate', 'severe', 'critical'
    
    -- System performance tracking
    was_flagged_by_system BOOLEAN DEFAULT FALSE,
    days_before_flag INTEGER, -- How many days before event did we flag (NULL if not flagged)
    risk_score_at_event INTEGER, -- OneBrain risk score when event was recorded
    
    -- Context
    notes TEXT,
    reported_by VARCHAR(100),
    
    created_at TIMESTAMP DEFAULT NOW()
);

-- Index for quick lookups
CREATE INDEX IF NOT EXISTS idx_clinical_events_patient ON clinical_events(patient_id);
CREATE INDEX IF NOT EXISTS idx_clinical_events_date ON clinical_events(event_date);
CREATE INDEX IF NOT EXISTS idx_clinical_events_flagged ON clinical_events(was_flagged_by_system);

-- Function to auto-check if patient was flagged before event
-- Called when a clinical event is inserted
CREATE OR REPLACE FUNCTION check_prior_flag()
RETURNS TRIGGER AS $$
DECLARE
    prior_task_count INTEGER;
    prior_risk INTEGER;
BEGIN
    -- Check if there was a pending/high-priority task in the 7 days before event
    SELECT COUNT(*) INTO prior_task_count
    FROM nurse_tasks
    WHERE patient_id = NEW.patient_id
    AND priority IN ('high', 'critical')
    AND created_at BETWEEN NEW.event_date - INTERVAL '7 days' AND NEW.event_date;
    
    -- Get the risk score at time of event
    SELECT current_risk_score INTO prior_risk
    FROM patient_state
    WHERE patient_id = NEW.patient_id;
    
    -- Update the record
    NEW.was_flagged_by_system := (prior_task_count > 0);
    NEW.risk_score_at_event := prior_risk;
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger to auto-populate flagging status
DROP TRIGGER IF EXISTS trigger_check_prior_flag ON clinical_events;
CREATE TRIGGER trigger_check_prior_flag
    BEFORE INSERT ON clinical_events
    FOR EACH ROW
    EXECUTE FUNCTION check_prior_flag();

-- Comment for documentation
COMMENT ON TABLE clinical_events IS 'Tracks clinical events for false negative post-mortem analysis. Regulatory compliance for healthcare AI.';
