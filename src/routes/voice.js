const express = require('express');
const router = express.Router();
const livekitService = require('../services/livekitService');
const voiceAgent = require('../worker/agent');

// Simple per-IP rate limiting for voice API
const voiceRateLimits = {};
const VOICE_RATE_LIMIT_WINDOW = 60 * 1000; // 1 minute
const VOICE_RATE_LIMIT_MAX = 10; // 10 requests per minute

const voiceRateLimiter = (req, res, next) => {
    const ip = req.ip || req.connection.remoteAddress;
    const now = Date.now();

    if (!voiceRateLimits[ip] || now - voiceRateLimits[ip].start > VOICE_RATE_LIMIT_WINDOW) {
        voiceRateLimits[ip] = { count: 1, start: now };
    } else {
        voiceRateLimits[ip].count++;
        if (voiceRateLimits[ip].count > VOICE_RATE_LIMIT_MAX) {
            console.warn(`⚠️ Voice API rate limit exceeded for IP: ${ip}`);
            return res.status(429).json({ error: 'Too many requests. Please try again later.' });
        }
    }
    next();
};

// Apply rate limiting to all voice routes
router.use(voiceRateLimiter);

// Debug endpoint to check LIVEKIT config
router.get('/debug', (req, res) => {
    res.json({
        LIVEKIT_URL: process.env.LIVEKIT_URL ? 'SET (' + process.env.LIVEKIT_URL.substring(0, 20) + '...)' : 'NOT SET',
        LIVEKIT_API_KEY: process.env.LIVEKIT_API_KEY ? 'SET' : 'NOT SET',
        LIVEKIT_API_SECRET: process.env.LIVEKIT_API_SECRET ? 'SET' : 'NOT SET',
        nodeEnv: process.env.NODE_ENV
    });
});

// GET /api/voice/token?userId=X&room=Y
router.get('/token', async (req, res) => {
    try {
        const userId = req.query.userId || 'guest';
        const roomName = req.query.room || 'consultation-room';
        const token = await livekitService.generateToken(userId, roomName);
        const wsUrl = livekitService.getWsUrl();
        res.json({ token, wsUrl });
    } catch (err) {
        console.error("Token Gen Error:", err);
        res.status(500).json({ error: "Failed to generate token", details: err.message });
    }
});

// POST /api/voice/chat { text, userId }
// AUDIT: Logs all voice conversations for compliance
router.post('/chat', async (req, res) => {
    try {
        const { text, userId } = req.body;
        const db = require('../services/db');

        // 1. Get patient ID from LINE user ID for logging
        let patientId = null;
        try {
            const patientRes = await db.query(
                'SELECT id FROM chronic_patients WHERE line_user_id = $1',
                [userId]
            );
            patientId = patientRes.rows[0]?.id;
        } catch (dbErr) {
            console.warn('Voice logging: Could not get patient ID:', dbErr.message);
        }

        // 2. LOG USER VOICE INPUT
        if (patientId) {
            await db.query(`
                INSERT INTO chat_history (patient_id, role, content, message_type, created_at)
                VALUES ($1, 'user', $2, 'voice', NOW())
            `, [patientId, text]).catch(e => console.warn('Voice log user failed:', e.message));
        }

        // 3. Process voice query
        const result = await voiceAgent.processVoiceQuery(text, userId);

        // 4. LOG AI VOICE RESPONSE
        if (patientId && result.text) {
            await db.query(`
                INSERT INTO chat_history (patient_id, role, content, message_type, created_at)
                VALUES ($1, 'assistant', $2, 'voice', NOW())
            `, [patientId, result.text]).catch(e => console.warn('Voice log AI failed:', e.message));
        }

        res.json(result);
    } catch (err) {
        console.error('Voice chat error:', err);
        res.status(500).json({ error: "Agent Error" });
    }
});

module.exports = router;
