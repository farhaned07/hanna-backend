-- Migration: Add Conversation History Table
-- Purpose: Enable persistent conversation memory for contextual AI responses
-- Date: 2025-12-29

-- Create conversation_history table
CREATE TABLE IF NOT EXISTS conversation_history (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    patient_id INTEGER NOT NULL REFERENCES chronic_patients(id) ON DELETE CASCADE,
    role VARCHAR(20) NOT NULL CHECK (role IN ('user', 'assistant', 'system')),
    content TEXT NOT NULL,
    message_type VARCHAR(20) DEFAULT 'text' CHECK (message_type IN ('text', 'voice', 'audio')),
    metadata JSONB DEFAULT '{}',
    created_at TIMESTAMP DEFAULT NOW()
);

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_conversation_patient ON conversation_history(patient_id);
CREATE INDEX IF NOT EXISTS idx_conversation_created ON conversation_history(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_conversation_patient_created ON conversation_history(patient_id, created_at DESC);

-- Retention policy function: Keep last 30 days or 200 messages per patient (whichever is more)
CREATE OR REPLACE FUNCTION cleanup_old_conversations()
RETURNS void AS $$
BEGIN
    -- Delete conversations older than 30 days that are not in the last 200 messages
    DELETE FROM conversation_history
    WHERE created_at < NOW() - INTERVAL '30 days'
    AND id NOT IN (
        SELECT id FROM (
            SELECT id,
                   ROW_NUMBER() OVER (PARTITION BY patient_id ORDER BY created_at DESC) as rn
            FROM conversation_history
        ) sub
        WHERE rn <= 200
    );
END;
$$ LANGUAGE plpgsql;

-- Comment the table
COMMENT ON TABLE conversation_history IS 'Stores patient conversation history for contextual AI responses. Retention: 30 days or 200 messages per patient.';
COMMENT ON COLUMN conversation_history.role IS 'Message sender: user (patient), assistant (Hanna), or system (context injection)';
COMMENT ON COLUMN conversation_history.message_type IS 'Source of message: text (LINE chat), voice (LIFF), or audio (LINE audio message)';
COMMENT ON COLUMN conversation_history.metadata IS 'Additional context: {source: "line"|"liff", risk_level: "low"|"high"|"critical", model: "llama-3.3-70b-versatile"}';

-- Grant permissions (adjust based on your Supabase setup)
-- GRANT SELECT, INSERT ON conversation_history TO authenticated;
-- GRANT DELETE ON conversation_history TO service_role;
