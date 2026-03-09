const db = require('./db');

/**
 * Chat History Service
 * Provides persistent storage for conversation memory (replaces global.conversationHistory)
 */

const MAX_MESSAGES_PER_USER = 5;

/**
 * Get recent chat history for a patient
 * @param {string} patientId - Patient UUID
 * @param {number} limit - Max messages to retrieve (default 5)
 * @returns {Promise<Array>} Array of { role, message } objects
 */
const getHistory = async (patientId, limit = MAX_MESSAGES_PER_USER) => {
    try {
        const result = await db.query(`
            SELECT role, message 
            FROM chat_history 
            WHERE patient_id = $1 
            ORDER BY created_at DESC 
            LIMIT $2
        `, [patientId, limit]);

        // Reverse to get chronological order
        return result.rows.reverse().map(row => ({
            role: row.role,
            text: row.message
        }));
    } catch (error) {
        console.error('[ChatHistory] Error getting history:', error);
        return [];
    }
};

/**
 * Add a message to chat history
 * @param {string} patientId - Patient UUID
 * @param {string} role - 'user' or 'assistant'
 * @param {string} message - The message text
 */
const addMessage = async (patientId, role, message) => {
    try {
        await db.query(`
            INSERT INTO chat_history (patient_id, role, message)
            VALUES ($1, $2, $3)
        `, [patientId, role, message]);

        // Cleanup old messages (keep only last N)
        await db.query(`
            DELETE FROM chat_history 
            WHERE id IN (
                SELECT id FROM chat_history 
                WHERE patient_id = $1 
                ORDER BY created_at DESC 
                OFFSET $2
            )
        `, [patientId, MAX_MESSAGES_PER_USER]);

    } catch (error) {
        console.error('[ChatHistory] Error adding message:', error);
        // Non-fatal: log and continue
    }
};

/**
 * Clear history for a patient
 * @param {string} patientId - Patient UUID
 */
const clearHistory = async (patientId) => {
    try {
        await db.query('DELETE FROM chat_history WHERE patient_id = $1', [patientId]);
    } catch (error) {
        console.error('[ChatHistory] Error clearing history:', error);
    }
};

module.exports = { getHistory, addMessage, clearHistory };
