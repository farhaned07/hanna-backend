const db = require('./db');
const line = require('./line');
const OneBrain = require('./OneBrain');

/**
 * Follow-up Message Scheduler
 * 
 * Automated scheduler for sending Day 1/3/7/14 follow-up messages via LINE.
 * Runs every hour via the main scheduler.
 * 
 * Features:
 * - Sends scheduled messages based on follow-up start date
 * - Tracks message delivery status
 * - Handles retries for failed messages
 * - Processes patient responses through OneBrain
 * 
 * @module services/followupScheduler
 */

// ─── Message Templates ───

const MESSAGE_TEMPLATES = {
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

// ─── Helper Functions ───

/**
 * Get message template by ID
 * @param {string} templateId - Template identifier
 * @returns {Object} LINE message object
 */
function getMessageTemplate(templateId) {
    return MESSAGE_TEMPLATES[templateId] || MESSAGE_TEMPLATES.welcome;
}

/**
 * Calculate which day of follow-up a patient is on
 * @param {Date} startDate - Follow-up start date
 * @returns {number} Day number (0-14)
 */
function calculateFollowupDay(startDate) {
    const now = new Date();
    const start = new Date(startDate);
    const diffMs = now - start;
    const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
    return diffDays;
}

/**
 * Send a follow-up message via LINE
 * @param {Object} followup - Follow-up record from database
 * @param {number} day - Day number (0=welcome, 1, 3, 7, 14)
 * @param {string} templateId - Message template ID
 */
async function sendFollowupMessage(followup, day, templateId) {
    if (!followup.line_user_id) {
        console.log(`[Followup] Patient ${followup.id} has no LINE ID - skipping Day ${day}`);
        return false;
    }

    const template = getMessageTemplate(templateId);

    try {
        console.log(`[Followup] Sending ${templateId} to LINE user ${followup.line_user_id}`);
        
        await line.pushMessage(followup.line_user_id, template);

        // Log sent message
        await db.query(`
            INSERT INTO followup_messages (
                followup_id, 
                scheduled_day, 
                message_template_id, 
                sent_at, 
                status
            )
            VALUES ($1, $2, $3, NOW(), 'sent')
        `, [followup.id, day, templateId]);

        console.log(`[Followup] ✓ Sent ${templateId} (Day ${day}) to follow-up ${followup.id}`);
        return true;

    } catch (err) {
        console.error(`[Followup] ✗ Failed to send ${templateId} (Day ${day}):`, err.message);

        // Log failed message with retry tracking
        await db.query(`
            INSERT INTO followup_messages (
                followup_id, 
                scheduled_day, 
                message_template_id, 
                status, 
                error_message,
                retry_count
            )
            VALUES ($1, $2, $3, 'failed', $4, 0)
        `, [followup.id, day, templateId, err.message]);

        return false;
    }
}

/**
 * Retry failed messages
 * @param {Object} failedMessage - Failed message record
 */
async function retryFailedMessage(failedMessage) {
    const maxRetries = 3;

    if (failedMessage.retry_count >= maxRetries) {
        console.log(`[Followup] Max retries reached for message ${failedMessage.id}`);
        return;
    }

    const followup = await db.query(
        'SELECT * FROM followups WHERE id = $1',
        [failedMessage.followup_id]
    );

    if (followup.rows.length === 0) {
        console.log(`[Followup] Follow-up ${failedMessage.followup_id} not found`);
        return;
    }

    const success = await sendFollowupMessage(
        followup.rows[0],
        failedMessage.scheduled_day,
        failedMessage.message_template_id
    );

    if (success) {
        // Update retry count on success
        await db.query(`
            UPDATE followup_messages 
            SET retry_count = retry_count + 1
            WHERE id = $1
        `, [failedMessage.id]);
    }
}

// ─── Main Scheduler Functions ───

/**
 * Send scheduled messages for all active follow-ups
 * Called hourly by main scheduler
 */
async function runFollowupScheduler() {
    console.log('[Followup] Running scheduler...');

    try {
        // Get all active follow-ups with LINE user IDs
        const followups = await db.query(`
            SELECT * FROM followups
            WHERE status = 'active'
              AND line_user_id IS NOT NULL
              AND end_date IS NULL
            ORDER BY start_date
        `);

        console.log(`[Followup] Found ${followups.rows.length} active follow-ups`);

        let messagesSent = 0;
        let messagesSkipped = 0;

        for (const followup of followups.rows) {
            const currentDay = calculateFollowupDay(followup.start_date);
            const maxDay = Math.min(currentDay, followup.duration_days);

            console.log(`[Followup] Processing follow-up ${followup.id} - Day ${currentDay}/${followup.duration_days}`);

            // Send messages for all due days (0, 1, 3, 7, 14)
            const dueDays = [0, 1, 3, 7, 14].filter(day => day <= maxDay);

            for (const day of dueDays) {
                // Determine template ID based on day
                let templateId;
                switch (day) {
                    case 0:
                        templateId = 'welcome';
                        break;
                    case 1:
                        templateId = 'day1_checkin';
                        break;
                    case 3:
                        templateId = 'day3_medication';
                        break;
                    case 7:
                        templateId = 'day7_symptoms';
                        break;
                    case 14:
                        templateId = 'day14_final';
                        break;
                    default:
                        continue;
                }

                // Check if message already sent
                const alreadySent = await db.query(`
                    SELECT id FROM followup_messages
                    WHERE followup_id = $1 AND scheduled_day = $2 AND status = 'sent'
                `, [followup.id, day]);

                if (alreadySent.rows.length > 0) {
                    messagesSkipped++;
                    continue; // Already sent
                }

                // Send message
                const success = await sendFollowupMessage(followup, day, templateId);
                if (success) {
                    messagesSent++;
                }
            }

            // Mark follow-up as completed if past end date
            if (currentDay >= followup.duration_days) {
                await db.query(`
                    UPDATE followups
                    SET 
                        status = 'completed',
                        end_date = NOW(),
                        updated_at = NOW()
                    WHERE id = $1
                `, [followup.id]);

                console.log(`[Followup] ✓ Completed follow-up ${followup.id}`);
            }
        }

        // Retry failed messages from previous runs
        const failedMessages = await db.query(`
            SELECT * FROM followup_messages
            WHERE status = 'failed'
              AND retry_count < 3
            ORDER BY created_at
            LIMIT 10
        `);

        for (const failedMessage of failedMessages.rows) {
            await retryFailedMessage(failedMessage);
        }

        console.log(`[Followup] Scheduler complete. Sent: ${messagesSent}, Skipped: ${messagesSkipped}`);

    } catch (err) {
        console.error('[Followup] Scheduler error:', err);
        throw err;
    }
}

/**
 * Process patient response from LINE
 * Called by webhook handler when patient responds
 * 
 * @param {string} lineUserId - LINE user ID
 * @param {string} responseText - Patient's response text
 * @param {string} postData - Postback data (if button click)
 */
async function processPatientResponse(lineUserId, responseText, postData = null) {
    console.log('[Followup] Processing patient response:', { lineUserId, responseText, postData });

    try {
        // Find follow-up by LINE user ID
        const followup = await db.query(`
            SELECT * FROM followups
            WHERE line_user_id = $1 AND status = 'active'
            ORDER BY created_at DESC
            LIMIT 1
        `, [lineUserId]);

        if (followup.rows.length === 0) {
            console.log('[Followup] No active follow-up found for LINE user', lineUserId);
            return null;
        }

        const followupId = followup.rows[0].id;

        // Save patient response
        const response = await db.query(`
            INSERT INTO patient_responses (
                followup_id,
                patient_response,
                response_type,
                received_at
            )
            VALUES ($1, $2, $3, NOW())
            RETURNING *
        `, [followupId, responseText || postData, postData ? 'postback' : 'text']);

        console.log('[Followup] Saved response:', response.rows[0].id);

        // Calculate risk score from response using OneBrain
        // This will trigger alert if needed
        try {
            // Get chronic_patients record linked to this follow-up
            const patient = await db.query(`
                SELECT cp.id, cp.line_user_id
                FROM chronic_patients cp
                WHERE cp.line_user_id = $1
                LIMIT 1
            `, [lineUserId]);

            if (patient.rows.length > 0) {
                // Trigger OneBrain analysis
                const onebrain = new OneBrain();
                await onebrain.analyzePatient(patient.rows[0].id, 'followup_response');

                // Update response with risk score
                const patientState = await db.query(`
                    SELECT current_risk_score FROM patient_state
                    WHERE patient_id = $1
                `, [patient.rows[0].id]);

                if (patientState.rows.length > 0) {
                    const riskScore = patientState.rows[0].current_risk_score;
                    const alertTriggered = riskScore >= 6; // High or critical

                    await db.query(`
                        UPDATE patient_responses
                        SET 
                            risk_score = $1,
                            alert_triggered = $2,
                            processed_by_onebrain = true,
                            onebrain_processed_at = NOW()
                        WHERE id = $3
                    `, [riskScore, alertTriggered, response.rows[0].id]);

                    console.log('[Followup] OneBrain processed response. Risk:', riskScore, 'Alert:', alertTriggered);
                }
            }
        } catch (onebrainErr) {
            console.error('[Followup] OneBrain processing error:', onebrainErr.message);
            // Don't fail the response if OneBrain fails
        }

        return response.rows[0];

    } catch (err) {
        console.error('[Followup] Response processing error:', err);
        throw err;
    }
}

/**
 * Get follow-up statistics
 */
async function getFollowupStats() {
    const stats = await db.query(`
        SELECT 
            (SELECT count(*) FROM followups WHERE status = 'active') as active_followups,
            (SELECT count(*) FROM followups WHERE status = 'completed') as completed_followups,
            (SELECT count(*) FROM followups WHERE status = 'cancelled') as cancelled_followups,
            (SELECT count(*) FROM followup_messages WHERE status = 'sent') as messages_sent,
            (SELECT count(*) FROM followup_messages WHERE status = 'failed') as messages_failed,
            (SELECT count(*) FROM patient_responses) as total_responses,
            (SELECT count(*) FROM patient_responses WHERE alert_triggered = true) as alerts_triggered
    `);

    return stats.rows[0];
}

// ─── Exports ───

module.exports = {
    runFollowupScheduler,
    processPatientResponse,
    getFollowupStats,
    sendFollowupMessage,
    MESSAGE_TEMPLATES
};
