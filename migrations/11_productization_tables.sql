-- Migration 11: Productization Tables
-- Adds tables for usage metering, support tickets, and case rechecks

-- ============================================================
-- USAGE METERING (For Billing)
-- ============================================================

CREATE TABLE IF NOT EXISTS usage_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID REFERENCES tenants(id) ON DELETE CASCADE,
    month DATE NOT NULL, -- First day of the month
    metric VARCHAR(50) NOT NULL, -- 'active_patients', 'check_ins', 'tasks_generated', etc.
    value INTEGER NOT NULL DEFAULT 0,
    recorded_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_usage_logs_tenant_month ON usage_logs(tenant_id, month);
CREATE INDEX IF NOT EXISTS idx_usage_logs_month ON usage_logs(month);

-- ============================================================
-- SUPPORT TICKETS
-- ============================================================

CREATE TABLE IF NOT EXISTS support_tickets (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID REFERENCES tenants(id) ON DELETE SET NULL,
    type VARCHAR(50) NOT NULL, -- 'bug', 'question', 'feature_request', 'urgent'
    status VARCHAR(50) NOT NULL DEFAULT 'open', -- 'open', 'in_progress', 'resolved', 'closed'
    priority VARCHAR(20) DEFAULT 'normal', -- 'low', 'normal', 'high', 'urgent'
    subject TEXT NOT NULL,
    description TEXT,
    created_by UUID REFERENCES staff(id) ON DELETE SET NULL,
    assigned_to UUID REFERENCES staff(id) ON DELETE SET NULL,
    resolved_at TIMESTAMP WITH TIME ZONE,
    resolution_notes TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_support_tickets_tenant ON support_tickets(tenant_id);
CREATE INDEX IF NOT EXISTS idx_support_tickets_status ON support_tickets(status);
CREATE INDEX IF NOT EXISTS idx_support_tickets_priority ON support_tickets(priority);

-- ============================================================
-- CASE RECHECKS (Post-Resolution Monitoring)
-- ============================================================

CREATE TABLE IF NOT EXISTS case_rechecks (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    task_id UUID REFERENCES nurse_tasks(id) ON DELETE CASCADE,
    patient_id INTEGER REFERENCES chronic_patients(id) ON DELETE CASCADE,
    scheduled_at TIMESTAMP WITH TIME ZONE NOT NULL,
    completed_at TIMESTAMP WITH TIME ZONE,
    outcome VARCHAR(50), -- 'stable', 'escalated', 'readmitted', 'missed'
    notes TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_case_rechecks_scheduled ON case_rechecks(scheduled_at) WHERE completed_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_case_rechecks_patient ON case_rechecks(patient_id);

-- ============================================================
-- ALERTS LOG (For Health Monitoring)
-- ============================================================

CREATE TABLE IF NOT EXISTS system_alerts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID REFERENCES tenants(id) ON DELETE SET NULL, -- NULL for system-wide
    type VARCHAR(50) NOT NULL, -- 'low_engagement', 'overdue_task', 'system_error', 'api_failure'
    severity VARCHAR(20) NOT NULL DEFAULT 'warning', -- 'info', 'warning', 'critical'
    message TEXT NOT NULL,
    metadata JSONB DEFAULT '{}',
    acknowledged_at TIMESTAMP WITH TIME ZONE,
    acknowledged_by UUID REFERENCES staff(id),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_system_alerts_type ON system_alerts(type);
CREATE INDEX IF NOT EXISTS idx_system_alerts_severity ON system_alerts(severity);
CREATE INDEX IF NOT EXISTS idx_system_alerts_unacked ON system_alerts(created_at) WHERE acknowledged_at IS NULL;

-- ============================================================
-- UPDATE EXISTING TABLES
-- ============================================================

-- Add last_login to staff if not exists
DO $$ 
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'staff' AND column_name = 'last_login'
    ) THEN
        ALTER TABLE staff ADD COLUMN last_login TIMESTAMP WITH TIME ZONE;
    END IF;
END $$;

-- Add code to tenants if not exists
DO $$ 
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'tenants' AND column_name = 'code'
    ) THEN
        ALTER TABLE tenants ADD COLUMN code VARCHAR(10) UNIQUE;
    END IF;
END $$;

-- Add permissions to staff if not exists
DO $$ 
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'staff' AND column_name = 'permissions'
    ) THEN
        ALTER TABLE staff ADD COLUMN permissions JSONB DEFAULT '{}';
    END IF;
END $$;

-- Add outcome fields to nurse_tasks if not exists
DO $$ 
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'nurse_tasks' AND column_name = 'outcome_code'
    ) THEN
        ALTER TABLE nurse_tasks ADD COLUMN outcome_code VARCHAR(50);
        ALTER TABLE nurse_tasks ADD COLUMN action_taken VARCHAR(50);
        ALTER TABLE nurse_tasks ADD COLUMN clinical_notes TEXT;
        ALTER TABLE nurse_tasks ADD COLUMN follow_up_date DATE;
        ALTER TABLE nurse_tasks ADD COLUMN recheck_scheduled_at TIMESTAMP WITH TIME ZONE;
    END IF;
END $$;

-- Add medication_taken to check_ins if not exists
DO $$ 
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'check_ins' AND column_name = 'medication_taken'
    ) THEN
        ALTER TABLE check_ins ADD COLUMN medication_taken BOOLEAN;
    END IF;
END $$;

-- ============================================================
-- CLEANUP / MAINTENANCE
-- ============================================================

-- Add updated_at trigger function if not exists
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

-- Apply trigger to support_tickets
DROP TRIGGER IF EXISTS update_support_tickets_updated_at ON support_tickets;
CREATE TRIGGER update_support_tickets_updated_at
    BEFORE UPDATE ON support_tickets
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

COMMENT ON TABLE usage_logs IS 'Monthly usage metrics per tenant for billing';
COMMENT ON TABLE support_tickets IS 'Hospital support requests and issue tracking';
COMMENT ON TABLE case_rechecks IS '24-hour post-resolution patient monitoring';
COMMENT ON TABLE system_alerts IS 'Automated system health alerts';
