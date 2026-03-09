const db = require('./db');

/**
 * Conversation History Service
 * Manages persistent conversation memory for contextual AI responses
 * 
 * Retention Policy: 30 days or 200 messages per patient (whichever is more)
 */
class ConversationHistory {
    /**
     * Save a message to conversation history
     * @param {Object} params
     * @param {number} params.patientId - Patient ID
     * @param {string} params.role - 'user' | 'assistant' | 'system'
     * @param {string} params.content - Message content
     * @param {string} params.messageType - 'text' | 'voice' | 'audio'
     * @param {Object} params.metadata - Additional context
     */
    async saveMessage({ patientId, role, content, messageType = 'text', metadata = {} }) {
        try {
            await db.query(`
                INSERT INTO conversation_history (patient_id, role, content, message_type, metadata)
                VALUES ($1, $2, $3, $4, $5)
            `, [patientId, role, content, messageType, JSON.stringify(metadata)]);

            console.log(`💾 [ConversationHistory] Saved ${role} message for patient ${patientId}`);
        } catch (error) {
            console.error('❌ [ConversationHistory] Error saving message:', error);
            // Non-blocking - don't fail the conversation if logging fails
        }
    }

    /**
     * Get recent conversation history for context injection
     * @param {number} patientId 
     * @param {number} limit - Number of messages (default 20 = last 10 exchanges)
     * @returns {Promise<Array>} Array of {role, content, created_at}
     */
    async getRecentMessages(patientId, limit = 20) {
        try {
            const result = await db.query(`
                SELECT role, content, message_type, metadata, created_at
                FROM conversation_history
                WHERE patient_id = $1
                ORDER BY created_at DESC
                LIMIT $2
            `, [patientId, limit]);

            // Reverse to chronological order (oldest first for LLM context)
            return result.rows.reverse();
        } catch (error) {
            console.error('❌ [ConversationHistory] Error fetching messages:', error);
            return []; // Return empty array on error (graceful degradation)
        }
    }

    /**
     * Format conversation history for LLM injection
     * @param {Array} messages - Raw messages from DB
     * @returns {Array} Formatted for Groq API
     */
    formatForLLM(messages) {
        return messages
            .filter(msg => msg.role !== 'system') // Exclude system messages
            .map(msg => ({
                role: msg.role,
                content: msg.content
            }));
    }

    /**
     * Get conversation summary statistics
     * @param {number} patientId 
     * @param {number} days - Number of days to look back
     * @returns {Promise<Object>} Stats
     */
    async getConversationStats(patientId, days = 7) {
        try {
            const result = await db.query(`
                SELECT 
                    COUNT(*) as total_messages,
                    COUNT(CASE WHEN role = 'user' THEN 1 END) as user_messages,
                    COUNT(CASE WHEN role = 'assistant' THEN 1 END) as assistant_messages,
                    COUNT(CASE WHEN message_type = 'voice' THEN 1 END) as voice_messages,
                    MIN(created_at) as first_message,
                    MAX(created_at) as last_message
                FROM conversation_history
                WHERE patient_id = $1
                AND created_at > NOW() - INTERVAL '${days} days'
            `, [patientId]);

            return result.rows[0];
        } catch (error) {
            console.error('❌ [ConversationHistory] Error fetching stats:', error);
            return null;
        }
    }

    /**
     * Delete all conversation history for a patient
     * (GDPR/PDPA compliance - right to be forgotten)
     * @param {number} patientId 
     */
    async deletePatientHistory(patientId) {
        try {
            await db.query(`
                DELETE FROM conversation_history WHERE patient_id = $1
            `, [patientId]);

            console.log(`🗑️ [ConversationHistory] Deleted all history for patient ${patientId}`);
        } catch (error) {
            console.error('❌ [ConversationHistory] Error deleting history:', error);
            throw error;
        }
    }

    /**
     * Run cleanup (should be called daily via scheduler)
     * Deletes messages older than 30 days that are not in the last 200 per patient
     */
    async runCleanup() {
        try {
            await db.query(`SELECT cleanup_old_conversations()`);
            console.log('🧹 [ConversationHistory] Cleanup completed');
        } catch (error) {
            console.error('❌ [ConversationHistory] Error running cleanup:', error);
        }
    }
}

module.exports = new ConversationHistory();
