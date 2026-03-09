const express = require('express');
const router = express.Router();
const db = require('../services/db');
const line = require('../services/line');
const OneBrain = require('../services/OneBrain');

/**
 * Follow-up Enrollment API
 * 
 * Enables doctors to enroll patients from Scribe into LINE-based follow-up programs.
 * Supports chronic disease management, post-op monitoring, and medication reviews.
 * 
 * @module routes/followup
 */

// ─── Helper: Get Message Template ───

/**
 * Get LINE message template by day
 * @param {string} templateId - Template identifier (welcome, day1_checkin, etc.)
 * @returns {Object} LINE message object
 */
function getMessageTemplate(templateId) {
    const templates = {
        welcome: {
            type: 'flex',
            altText: 'Welcome to Hanna Follow-up Program',
            contents: {
                type: 'bubble',
                size: 'nano',
                body: {
                    type: 'box',
                    layout: 'vertical',
                    contents: [
                        {
                            type: 'text',
                            text: '🏥 Welcome to Hanna!',
                            weight: 'bold',
                            size: 'xl',
                            color: '#6366F1',
                            margin: 'md'
                        },
                        {
                            type: 'text',
                            text: 'We will monitor your recovery for the next 14 days.',
                            wrap: true,
                            margin: 'md',
                            size: 'sm',
                            color: '#6B7280'
                        },
                        {
                            type: 'separator',
                            margin: 'lg'
                        },
                        {
                            type: 'button',
                            style: 'primary',
                            color: '#6366F1',
                            height: 'sm',
                            action: {
                                type: 'postback',
                                label: '✓ I Understand',
                                data: 'action=followup_welcome'
                            }
                        }
                    ]
                }
            }
        },

        day1_checkin: {
            type: 'flex',
            altText: 'Day 1 Check-in',
            contents: {
                type: 'bubble',
                size: 'nano',
                body: {
                    type: 'box',
                    layout: 'vertical',
                    contents: [
                        {
                            type: 'text',
                            text: '📅 Day 1 Check-in',
                            weight: 'bold',
                            size: 'lg',
                            color: '#6366F1'
                        },
                        {
                            type: 'text',
                            text: 'How are you feeling today?',
                            wrap: true,
                            margin: 'md',
                            size: 'sm'
                        },
                        {
                            type: 'box',
                            layout: 'vertical',
                            margin: 'lg',
                            spacing: 'sm',
                            contents: [
                                {
                                    type: 'button',
                                    style: 'primary',
                                    color: '#10B981',
                                    height: 'sm',
                                    action: {
                                        type: 'postback',
                                        label: '😊 Feeling Great',
                                        data: 'action=day1_response&status=great'
                                    }
                                },
                                {
                                    type: 'button',
                                    style: 'primary',
                                    color: '#F59E0B',
                                    height: 'sm',
                                    action: {
                                        type: 'postback',
                                        label: '😐 Okay',
                                        data: 'action=day1_response&status=okay'
                                    }
                                },
                                {
                                    type: 'button',
                                    style: 'primary',
                                    color: '#EF4444',
                                    height: 'sm',
                                    action: {
                                        type: 'postback',
                                        label: '😟 Not Good',
                                        data: 'action=day1_response&status=bad'
                                    }
                                }
                            ]
                        }
                    ]
                }
            }
        },

        day3_medication: {
            type: 'flex',
            altText: 'Day 3 Medication Check',
            contents: {
                type: 'bubble',
                size: 'nano',
                body: {
                    type: 'box',
                    layout: 'vertical',
                    contents: [
                        {
                            type: 'text',
                            text: '💊 Day 3 Medication Check',
                            weight: 'bold',
                            size: 'lg',
                            color: '#6366F1'
                        },
                        {
                            type: 'text',
                            text: 'Have you been taking your medication as prescribed?',
                            wrap: true,
                            margin: 'md',
                            size: 'sm'
                        },
                        {
                            type: 'box',
                            layout: 'vertical',
                            margin: 'lg',
                            spacing: 'sm',
                            contents: [
                                {
                                    type: 'button',
                                    style: 'primary',
                                    color: '#10B981',
                                    height: 'sm',
                                    action: {
                                        type: 'postback',
                                        label: '✓ Yes, All Doses',
                                        data: 'action=day3_response&adherence=full'
                                    }
                                },
                                {
                                    type: 'button',
                                    style: 'primary',
                                    color: '#F59E0B',
                                    height: 'sm',
                                    action: {
                                        type: 'postback',
                                        label: '~ Some Doses',
                                        data: 'action=day3_response&adherence=partial'
                                    }
                                },
                                {
                                    type: 'button',
                                    style: 'primary',
                                    color: '#EF4444',
                                    height: 'sm',
                                    action: {
                                        type: 'postback',
                                        label: '✗ No Doses',
                                        data: 'action=day3_response&adherence=none'
                                    }
                                }
                            ]
                        }
                    ]
                }
            }
        },

        day7_symptoms: {
            type: 'flex',
            altText: 'Day 7 Symptoms Check',
            contents: {
                type: 'bubble',
                size: 'nano',
                body: {
                    type: 'box',
                    layout: 'vertical',
                    contents: [
                        {
                            type: 'text',
                            text: '🏥 Day 7 Symptoms Check',
                            weight: 'bold',
                            size: 'lg',
                            color: '#6366F1'
                        },
                        {
                            type: 'text',
                            text: 'Any new or worsening symptoms?',
                            wrap: true,
                            margin: 'md',
                            size: 'sm'
                        },
                        {
                            type: 'box',
                            layout: 'vertical',
                            margin: 'lg',
                            spacing: 'sm',
                            contents: [
                                {
                                    type: 'button',
                                    style: 'primary',
                                    color: '#10B981',
                                    height: 'sm',
                                    action: {
                                        type: 'postback',
                                        label: 'No Symptoms',
                                        data: 'action=day7_response&symptoms=none'
                                    }
                                },
                                {
                                    type: 'button',
                                    style: 'primary',
                                    color: '#F59E0B',
                                    height: 'sm',
                                    action: {
                                        type: 'postback',
                                        label: 'Yes, Mild',
                                        data: 'action=day7_response&symptoms=mild'
                                    }
                                },
                                {
                                    type: 'button',
                                    style: 'primary',
                                    color: '#EF4444',
                                    height: 'sm',
                                    action: {
                                        type: 'postback',
                                        label: 'Yes, Severe',
                                        data: 'action=day7_response&symptoms=severe'
                                    }
                                }
                            ]
                        }
                    ]
                }
            }
        },

        day14_final: {
            type: 'flex',
            altText: 'Day 14 Final Check-in',
            contents: {
                type: 'bubble',
                size: 'nano',
                body: {
                    type: 'box',
                    layout: 'vertical',
                    contents: [
                        {
                            type: 'text',
                            text: '🎉 Day 14 - Final Check-in',
                            weight: 'bold',
                            size: 'lg',
                            color: '#6366F1'
                        },
                        {
                            type: 'text',
                            text: 'Congratulations on completing the follow-up program!\n\nPlease rate your overall recovery:',
                            wrap: true,
                            margin: 'md',
                            size: 'sm'
                        },
                        {
                            type: 'box',
                            layout: 'vertical',
                            margin: 'lg',
                            spacing: 'xs',
                            contents: [
                                {
                                    type: 'button',
                                    style: 'primary',
                                    color: '#EF4444',
                                    height: 'sm',
                                    action: {
                                        type: 'postback',
                                        label: '1️⃣ Poor',
                                        data: 'action=day14_response&rating=1'
                                    }
                                },
                                {
                                    type: 'button',
                                    style: 'primary',
                                    color: '#F97316',
                                    height: 'sm',
                                    action: {
                                        type: 'postback',
                                        label: '2️⃣ Fair',
                                        data: 'action=day14_response&rating=2'
                                    }
                                },
                                {
                                    type: 'button',
                                    style: 'primary',
                                    color: '#F59E0B',
                                    height: 'sm',
                                    action: {
                                        type: 'postback',
                                        label: '3️⃣ Good',
                                        data: 'action=day14_response&rating=3'
                                    }
                                },
                                {
                                    type: 'button',
                                    style: 'primary',
                                    color: '#10B981',
                                    height: 'sm',
                                    action: {
                                        type: 'postback',
                                        label: '4️⃣ Very Good',
                                        data: 'action=day14_response&rating=4'
                                    }
                                },
                                {
                                    type: 'button',
                                    style: 'primary',
                                    color: '#059669',
                                    height: 'sm',
                                    action: {
                                        type: 'postback',
                                        label: '5️⃣ Excellent',
                                        data: 'action=day14_response&rating=5'
                                    }
                                }
                            ]
                        }
                    ]
                }
            }
        }
    };

    return templates[templateId] || templates.welcome;
}

// ─── API ENDPOINTS ───

/**
 * POST /api/followup/enroll
 * Enroll a patient in the follow-up program
 * 
 * Request body:
 * - patient_name (required): Patient's full name
 * - patient_hn: Hospital number
 * - phone (required): Phone number for LINE friend addition
 * - line_consent (required): Boolean - patient consented to LINE messages
 * - type: Follow-up type (chronic/post-op/medication/general)
 * - duration_days: Duration in days (7/14/30)
 * - scribe_session_id: Link to Scribe session (optional)
 */
router.post('/enroll', async (req, res) => {
    try {
        const {
            patient_name,
            patient_hn,
            phone,
            line_consent,
            type = 'chronic',
            duration_days = 14,
            scribe_session_id
        } = req.body;

        // Input validation
        if (!patient_name || !patient_name.trim()) {
            return res.status(400).json({ error: 'Patient name is required' });
        }

        if (!phone || !phone.trim()) {
            return res.status(400).json({ error: 'Phone number is required' });
        }

        if (line_consent === undefined) {
            return res.status(400).json({ error: 'LINE consent is required' });
        }

        // Validate follow-up type
        const validTypes = ['chronic', 'post-op', 'medication', 'general'];
        if (!validTypes.includes(type)) {
            return res.status(400).json({ 
                error: `Invalid follow-up type. Must be one of: ${validTypes.join(', ')}` 
            });
        }

        // Validate duration
        const validDurations = [7, 14, 30];
        if (!validDurations.includes(duration_days)) {
            return res.status(400).json({ 
                error: `Invalid duration. Must be one of: ${validDurations.join(', ')}` 
            });
        }

        console.log('[Followup] Enrolling patient:', { 
            patient_name, 
            phone, 
            type, 
            duration_days,
            line_consent 
        });

        // Create follow-up record
        const followup = await db.query(`
            INSERT INTO followups (
                patient_name, 
                patient_hn, 
                phone, 
                line_consent,
                type, 
                duration_days, 
                scribe_session_id,
                status,
                start_date
            )
            VALUES ($1, $2, $3, $4, $5, $6, $7, 'active', NOW())
            RETURNING *
        `, [
            patient_name.trim(),
            patient_hn?.trim() || null,
            phone.trim(),
            line_consent,
            type,
            duration_days,
            scribe_session_id || null
        ]);

        // Update Scribe session with follow-up link (if provided)
        if (scribe_session_id) {
            await db.query(`
                UPDATE scribe_sessions 
                SET followup_id = $1 
                WHERE id = $2
            `, [followup.rows[0].id, scribe_session_id]);

            console.log('[Followup] Linked Scribe session', scribe_session_id, 'to follow-up', followup.rows[0].id);
        }

        // Send LINE welcome message (if consent given and LINE user ID exists)
        if (line_consent && followup.rows[0].line_user_id) {
            try {
                const welcomeMessage = getMessageTemplate('welcome');
                await line.pushMessage(followup.rows[0].line_user_id, welcomeMessage);

                // Log welcome message
                await db.query(`
                    INSERT INTO followup_messages (
                        followup_id, 
                        scheduled_day, 
                        message_template_id, 
                        sent_at, 
                        status
                    )
                    VALUES ($1, 0, 'welcome', NOW(), 'sent')
                `, [followup.rows[0].id]);

                console.log('[Followup] Sent welcome message to LINE user', followup.rows[0].line_user_id);
            } catch (lineError) {
                console.error('[Followup] Failed to send LINE welcome message:', lineError.message);
                // Don't fail enrollment if LINE message fails
            }
        } else if (line_consent) {
            console.log('[Followup] LINE consent given but no LINE user ID yet - pending friend addition');
        }

        console.log('[Followup] Enrollment successful:', followup.rows[0].id);

        res.json({
            success: true,
            followup: followup.rows[0],
            message: line_consent 
                ? 'Patient enrolled. LINE welcome message sent.' 
                : 'Patient enrolled. LINE messages disabled.'
        });

    } catch (err) {
        console.error('[Followup] Enrollment error:', err);
        res.status(500).json({ 
            error: 'Failed to enroll patient in follow-up program',
            details: err.message 
        });
    }
});

/**
 * GET /api/followup/:id
 * Get follow-up details by ID
 */
router.get('/:id', async (req, res) => {
    try {
        const followup = await db.query(`
            SELECT * FROM followups WHERE id = $1
        `, [req.params.id]);

        if (followup.rows.length === 0) {
            return res.status(404).json({ error: 'Follow-up not found' });
        }

        res.json(followup.rows[0]);

    } catch (err) {
        console.error('[Followup] Get follow-up error:', err);
        res.status(500).json({ error: 'Failed to get follow-up details' });
    }
});

/**
 * GET /api/followup/:id/messages
 * Get all scheduled messages for a follow-up
 */
router.get('/:id/messages', async (req, res) => {
    try {
        const messages = await db.query(`
            SELECT * FROM followup_messages 
            WHERE followup_id = $1 
            ORDER BY scheduled_day, created_at
        `, [req.params.id]);

        res.json({
            followup_id: req.params.id,
            messages: messages.rows
        });

    } catch (err) {
        console.error('[Followup] Get messages error:', err);
        res.status(500).json({ error: 'Failed to get messages' });
    }
});

/**
 * GET /api/followup/:id/responses
 * Get all patient responses for a follow-up
 */
router.get('/:id/responses', async (req, res) => {
    try {
        const responses = await db.query(`
            SELECT pr.*, fm.scheduled_day, fm.message_template_id
            FROM patient_responses pr
            JOIN followup_messages fm ON pr.message_id = fm.id
            WHERE pr.followup_id = $1
            ORDER BY pr.received_at
        `, [req.params.id]);

        res.json({
            followup_id: req.params.id,
            responses: responses.rows
        });

    } catch (err) {
        console.error('[Followup] Get responses error:', err);
        res.status(500).json({ error: 'Failed to get responses' });
    }
});

/**
 * POST /api/followup/:id/complete
 * Mark a follow-up as completed
 */
router.post('/:id/complete', async (req, res) => {
    try {
        const { outcome_notes } = req.body;

        const result = await db.query(`
            UPDATE followups 
            SET 
                status = 'completed',
                end_date = NOW(),
                updated_at = NOW()
            WHERE id = $1
            RETURNING *
        `, [req.params.id]);

        if (result.rows.length === 0) {
            return res.status(404).json({ error: 'Follow-up not found' });
        }

        console.log('[Followup] Completed follow-up:', req.params.id);

        res.json({
            success: true,
            followup: result.rows[0]
        });

    } catch (err) {
        console.error('[Followup] Complete follow-up error:', err);
        res.status(500).json({ error: 'Failed to complete follow-up' });
    }
});

/**
 * POST /api/followup/:id/cancel
 * Cancel a follow-up program
 */
router.post('/:id/cancel', async (req, res) => {
    try {
        const { reason } = req.body;

        const result = await db.query(`
            UPDATE followups 
            SET 
                status = 'cancelled',
                end_date = NOW(),
                updated_at = NOW()
            WHERE id = $1
            RETURNING *
        `, [req.params.id]);

        if (result.rows.length === 0) {
            return res.status(404).json({ error: 'Follow-up not found' });
        }

        console.log('[Followup] Cancelled follow-up:', req.params.id, 'Reason:', reason);

        res.json({
            success: true,
            followup: result.rows[0]
        });

    } catch (err) {
        console.error('[Followup] Cancel follow-up error:', err);
        res.status(500).json({ error: 'Failed to cancel follow-up' });
    }
});

/**
 * POST /api/followup/:id/link-line
 * Link a LINE user ID to an existing follow-up (when patient adds friend)
 */
router.post('/:id/link-line', async (req, res) => {
    try {
        const { line_user_id } = req.body;

        if (!line_user_id) {
            return res.status(400).json({ error: 'LINE user ID is required' });
        }

        const result = await db.query(`
            UPDATE followups 
            SET 
                line_user_id = $1,
                line_pending = false,
                line_added_at = NOW(),
                updated_at = NOW()
            WHERE id = $1
            RETURNING *
        `, [line_user_id, req.params.id]);

        if (result.rows.length === 0) {
            return res.status(404).json({ error: 'Follow-up not found' });
        }

        // Send welcome message now that LINE is linked
        try {
            const welcomeMessage = getMessageTemplate('welcome');
            await line.pushMessage(line_user_id, welcomeMessage);

            // Log welcome message
            await db.query(`
                INSERT INTO followup_messages (
                    followup_id, 
                    scheduled_day, 
                    message_template_id, 
                    sent_at, 
                    status
                )
                VALUES ($1, 0, 'welcome', NOW(), 'sent')
            `, [req.params.id]);

            console.log('[Followup] Linked LINE and sent welcome to', line_user_id);
        } catch (lineError) {
            console.error('[Followup] Failed to send LINE welcome after link:', lineError.message);
        }

        console.log('[Followup] Linked LINE user', line_user_id, 'to follow-up', req.params.id);

        res.json({
            success: true,
            followup: result.rows[0]
        });

    } catch (err) {
        console.error('[Followup] Link LINE error:', err);
        res.status(500).json({ error: 'Failed to link LINE user' });
    }
});

module.exports = router;
