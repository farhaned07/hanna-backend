-- ==================================================
-- Scribe Tables Migration
-- ==================================================
-- These tables support the Hanna Scribe PWA for
-- clinical documentation via voice recording.
-- ==================================================

-- 1. Clinician accounts (Scribe users)
CREATE TABLE IF NOT EXISTS clinicians (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    email VARCHAR(255) UNIQUE NOT NULL,
    phone VARCHAR(20),
    display_name VARCHAR(255) NOT NULL,
    role VARCHAR(50) DEFAULT 'nurse',
    hospital_name VARCHAR(255),
    license_number VARCHAR(100),
    pin_hash VARCHAR(255) NOT NULL,
    language VARCHAR(5) DEFAULT 'en',
    preferences JSONB DEFAULT '{}',
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 2. Recording sessions (one per patient encounter)
CREATE TABLE IF NOT EXISTS scribe_sessions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    clinician_id UUID NOT NULL REFERENCES clinicians(id),
    patient_name VARCHAR(255) DEFAULT 'Unknown Patient',
    patient_hn VARCHAR(100),
    template_type VARCHAR(50) DEFAULT 'soap',
    transcript TEXT,
    audio_duration_seconds INTEGER,
    status VARCHAR(20) DEFAULT 'recording',
    metadata JSONB DEFAULT '{}',
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 3. Generated clinical notes
CREATE TABLE IF NOT EXISTS scribe_notes (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    session_id UUID NOT NULL REFERENCES scribe_sessions(id) ON DELETE CASCADE,
    clinician_id UUID NOT NULL REFERENCES clinicians(id),
    template_type VARCHAR(50) NOT NULL,
    content JSONB NOT NULL DEFAULT '{}',
    content_text TEXT,
    is_final BOOLEAN DEFAULT false,
    finalized_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 4. Note templates (system + user-defined)
CREATE TABLE IF NOT EXISTS scribe_templates (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(100) NOT NULL,
    template_type VARCHAR(50) NOT NULL UNIQUE,
    description TEXT,
    prompt_template TEXT NOT NULL,
    fields JSONB NOT NULL DEFAULT '[]',
    is_system BOOLEAN DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_sessions_clinician ON scribe_sessions(clinician_id);
CREATE INDEX IF NOT EXISTS idx_sessions_created ON scribe_sessions(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_notes_session ON scribe_notes(session_id);
CREATE INDEX IF NOT EXISTS idx_notes_clinician ON scribe_notes(clinician_id);

-- Seed system templates
INSERT INTO scribe_templates (name, template_type, description, prompt_template, fields) VALUES
(
    'SOAP Note',
    'soap',
    'Standard SOAP note format for clinical encounters',
    'You are a clinical documentation AI assistant. Given the following transcript of a patient encounter, generate a structured SOAP note with four sections: Subjective, Objective, Assessment, and Plan.

Transcript:
{transcript}

Generate a clinical SOAP note in the following JSON format:
{
  "subjective": "Patient''s reported symptoms, history, and complaints...",
  "objective": "Clinical findings, vital signs, examination results...",
  "assessment": "Clinical assessment, diagnosis or differential...",
  "plan": "Treatment plan, medications, follow-up instructions..."
}

Rules:
- Be concise and use standard medical terminology
- If information is not in the transcript, write "Not documented"
- Output language should match the primary language of the transcript
- Return valid JSON only',
    '["subjective", "objective", "assessment", "plan"]'
),
(
    'Progress Note',
    'progress',
    'Brief progress note for ongoing patient care',
    'You are a clinical documentation AI assistant. Given the following transcript, generate a brief progress note summarizing the patient encounter.

Transcript:
{transcript}

Generate a progress note in the following JSON format:
{
  "summary": "Brief summary of the encounter...",
  "changes": "Any changes to treatment or condition...",
  "followUp": "Next steps and follow-up plans..."
}

Rules:
- Keep it brief and focused
- Output language should match the transcript
- Return valid JSON only',
    '["summary", "changes", "followUp"]'
),
(
    'Free Note',
    'free',
    'Unstructured free-form clinical note',
    'You are a clinical documentation AI assistant. Given the following transcript, generate a clean, structured version of the clinical notes mentioned.

Transcript:
{transcript}

Generate a note in the following JSON format:
{
  "text": "The cleaned up, well-organized clinical note..."
}

Rules:
- Organize the content logically
- Remove filler words and repetitions
- Output language should match the transcript
- Return valid JSON only',
    '["text"]'
)
ON CONFLICT (template_type) DO NOTHING;
