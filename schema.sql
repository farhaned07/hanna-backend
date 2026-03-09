-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Patients table
CREATE TABLE IF NOT EXISTS chronic_patients (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    line_user_id VARCHAR(255) UNIQUE NOT NULL,
    display_name VARCHAR(255),
    name VARCHAR(255),
    age INTEGER,
    condition VARCHAR(50), -- 'Type 1', 'Type 2'
    
    -- PDPA Consent
    consent_pdpa BOOLEAN DEFAULT FALSE,
    consent_medical_share BOOLEAN DEFAULT FALSE,
    consent_date TIMESTAMP,
    phone_number VARCHAR(20),
    
    -- Status
    enrollment_status VARCHAR(20) DEFAULT 'onboarding', -- 'onboarding', 'trial', 'active', 'expired'
    onboarding_step INTEGER DEFAULT 0,
    
    -- Subscription
    subscription_plan VARCHAR(20), -- 'monthly', 'quarterly', 'yearly'
    trial_start_date TIMESTAMP,
    trial_end_date TIMESTAMP,
    subscription_start_date TIMESTAMP,
    subscription_end_date TIMESTAMP,
    
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

-- Check-ins table
CREATE TABLE IF NOT EXISTS check_ins (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    patient_id UUID REFERENCES chronic_patients(id),
    date DATE DEFAULT CURRENT_DATE,
    time_of_day VARCHAR(20), -- 'morning', 'evening'
    
    -- Vitals
    glucose INTEGER,
    systolic INTEGER,
    diastolic INTEGER,
    medication_taken BOOLEAN,
    symptoms TEXT,
    
    created_at TIMESTAMP DEFAULT NOW()
);

-- Payments table
CREATE TABLE IF NOT EXISTS payments (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    patient_id UUID REFERENCES chronic_patients(id),
    amount DECIMAL(10, 2) NOT NULL,
    currency VARCHAR(3) DEFAULT 'THB',
    method VARCHAR(20), -- 'promptpay', 'line_pay'
    status VARCHAR(20) DEFAULT 'pending', -- 'pending', 'completed', 'failed'
    transaction_id VARCHAR(255),
    
    created_at TIMESTAMP DEFAULT NOW()
);

-- Performance Index for Health Summary Queries
CREATE INDEX IF NOT EXISTS idx_checkins_patient_time ON check_ins(patient_id, created_at DESC);
