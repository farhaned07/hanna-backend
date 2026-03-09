-- Migration: Multi-Tenant Core Architecture
-- Description: Adds tenants, programs, care_teams, staff tables and updates chronic_patients for isolation

-- 1. Create Tenants Table
CREATE TABLE IF NOT EXISTS tenants (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name VARCHAR(255) NOT NULL,
    type VARCHAR(50) NOT NULL CHECK (type IN ('hospital', 'insurer', 'clinic')),
    code VARCHAR(50) UNIQUE NOT NULL, -- Short tenant code for URLs/reports
    settings JSONB DEFAULT '{}',
    logo_url TEXT,
    contact_email VARCHAR(255),
    status VARCHAR(50) DEFAULT 'active',
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

-- 2. Create Programs Table (Tenant-scoped)
CREATE TABLE IF NOT EXISTS programs (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id UUID NOT NULL REFERENCES tenants(id),
    name VARCHAR(255) NOT NULL,
    description TEXT,
    config JSONB DEFAULT '{}',
    status VARCHAR(50) DEFAULT 'active',
    created_at TIMESTAMP DEFAULT NOW(),
    UNIQUE(tenant_id, name)
);

-- 3. Create Care Teams Table
CREATE TABLE IF NOT EXISTS care_teams (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    program_id UUID NOT NULL REFERENCES programs(id),
    name VARCHAR(255) NOT NULL,
    settings JSONB DEFAULT '{}',
    created_at TIMESTAMP DEFAULT NOW()
);

-- 4. Create Staff Table
CREATE TABLE IF NOT EXISTS staff (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id UUID NOT NULL REFERENCES tenants(id),
    care_team_id UUID REFERENCES care_teams(id),
    email VARCHAR(255) NOT NULL,
    name VARCHAR(255) NOT NULL,
    role VARCHAR(50) NOT NULL CHECK (role IN ('nurse', 'supervisor', 'admin', 'viewer')),
    permissions JSONB DEFAULT '{}',
    auth_token_hash VARCHAR(255), -- For API authentication
    status VARCHAR(50) DEFAULT 'active',
    created_at TIMESTAMP DEFAULT NOW(),
    last_login TIMESTAMP,
    UNIQUE(tenant_id, email) -- SCOPED TO TENANT: Allows same email in different hospitals
);

-- Indexes for tenant-scoped queries
CREATE INDEX IF NOT EXISTS idx_programs_tenant ON programs(tenant_id);
CREATE INDEX IF NOT EXISTS idx_care_teams_program ON care_teams(program_id);
CREATE INDEX IF NOT EXISTS idx_staff_tenant ON staff(tenant_id);
CREATE INDEX IF NOT EXISTS idx_staff_care_team ON staff(care_team_id);

-- 5. Update Chronic Patients for Tenancy
ALTER TABLE chronic_patients ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES tenants(id);
ALTER TABLE chronic_patients ADD COLUMN IF NOT EXISTS program_id UUID REFERENCES programs(id);
ALTER TABLE chronic_patients ADD COLUMN IF NOT EXISTS care_team_id UUID REFERENCES care_teams(id);

-- Create indexes for the new columns
CREATE INDEX IF NOT EXISTS idx_patients_tenant ON chronic_patients(tenant_id);
CREATE INDEX IF NOT EXISTS idx_patients_program ON chronic_patients(program_id);

-- NOTE: We cannot enforce NOT NULL on tenant_id yet if there is existing data.
-- Data migration steps should happen before enabling this constraint.
-- ALTER TABLE chronic_patients ALTER COLUMN tenant_id SET NOT NULL;

-- 6. Enable Row Level Security (RLS) Template
-- (Disabled by default until policies function is ready)
ALTER TABLE chronic_patients ENABLE ROW LEVEL SECURITY;

-- Policy template (commented out until tenant context is available in DB session)
-- CREATE POLICY tenant_isolation_patients ON chronic_patients
--     FOR ALL
--     USING (tenant_id = current_setting('app.current_tenant_id')::uuid)
--     WITH CHECK (tenant_id = current_setting('app.current_tenant_id')::uuid);
