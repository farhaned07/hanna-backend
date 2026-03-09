const cron = require('node-cron');
const db = require('./services/db');
const line = require('./services/line');
const followupScheduler = require('./services/followupScheduler');
// const { checkTrialStatus } = require('./handlers/trial'); // Module missing, disabling for MVP

// H10 FIX: Retry logic for LINE API calls
const MAX_RETRIES = 3;
const RETRY_DELAY_MS = 1000;

/**
 * Send message with retry logic
 * @param {string} userId - LINE user ID
 * @param {object} message - Message to send
 * @param {number} attempt - Current attempt number
 */
const sendWithRetry = async (userId, message, attempt = 1) => {
    try {
        await line.pushMessage(userId, message);
        return true;
    } catch (error) {
        if (attempt < MAX_RETRIES) {
            console.warn(`⚠️ Retry ${attempt}/${MAX_RETRIES} for user ${userId}:`, error.message);
            await new Promise(resolve => setTimeout(resolve, RETRY_DELAY_MS * attempt));
            return sendWithRetry(userId, message, attempt + 1);
        } else {
            console.error(`❌ Failed to send message to ${userId} after ${MAX_RETRIES} attempts:`, error.message);
            return false;
        }
    }
};

const initScheduler = () => {
    console.log('Scheduler initialized');

    // Morning Check-in (8:00 AM)
    cron.schedule('0 8 * * *', async () => {
        console.log('Running morning check-in with structured flow...');

        // Import dailyCheckin handler
        const dailyCheckin = require('./handlers/dailyCheckin');

        try {
            const result = await db.query(
                "SELECT line_user_id, name FROM chronic_patients WHERE enrollment_status IN ('active', 'trial')"
            );

            let successCount = 0;
            let failCount = 0;

            for (const user of result.rows) {
                try {
                    await dailyCheckin.startCheckIn(user.line_user_id, user.name || '');
                    successCount++;
                } catch (err) {
                    console.error(`❌ Failed to start check-in for ${user.line_user_id}:`, err.message);
                    failCount++;
                }
            }

            console.log(`✅ Morning check-in complete: ${successCount} sent, ${failCount} failed`);
        } catch (err) {
            console.error('Error in morning job:', err);
        }
    }, {
        timezone: "Asia/Bangkok"
    });

    // Evening Medication Reminder (7:00 PM)
    cron.schedule('0 19 * * *', async () => {
        console.log('Running evening medication job');

        try {
            const result = await db.query(
                "SELECT line_user_id, name FROM chronic_patients WHERE enrollment_status IN ('active', 'trial')"
            );

            let successCount = 0;
            let failCount = 0;

            for (const user of result.rows) {
                const success = await sendWithRetry(user.line_user_id, {
                    type: 'text',
                    text: `🔔 ได้เวลากินยาตอนเย็นแล้วนะคะ คุณ${user.name || ''}\nกินแล้วกดปุ่มบอกฮันนาด้วยนะคะ`,
                    quickReply: {
                        items: [
                            { type: 'action', action: { type: 'message', label: 'กินแล้ว ✅', text: 'กินยาแล้วค่ะ' } },
                            { type: 'action', action: { type: 'message', label: 'ยังค่ะ ⏰', text: 'ยังไม่ได้กินค่ะ' } }
                        ]
                    }
                });

                if (success) successCount++;
                else failCount++;
            }

            console.log(`✅ Evening reminder complete: ${successCount} sent, ${failCount} failed`);
        } catch (err) {
            console.error('Error in evening job:', err);
        }
    }, {
        timezone: "Asia/Bangkok"
    });

    // Proactive "Silence Audit" (14:00 PM - Afternoon nudge)
    cron.schedule('0 14 * * *', checkSilenceAndNudge, {
        timezone: "Asia/Bangkok"
    });

    // Non-Responder Protocol (10:00 AM - Check for 3/5/7 day silent patients)
    cron.schedule('0 10 * * *', async () => {
        const engagement = require('./services/engagement');
        await engagement.processNonResponders();
    }, {
        timezone: "Asia/Bangkok"
    });

    // Safety Safeguard: Escalation Check (Every 15 mins)
    cron.schedule('*/15 * * * *', checkEscalations);

    // Enterprise: Capacity Monitor (Every 5 mins)
    cron.schedule('*/5 * * * *', checkCapacity);

    // Enterprise: Post-Resolution Recheck (Every hour)
    cron.schedule('0 * * * *', processRechecks);

    // FOLLOW-UP: Send scheduled messages (Every hour)
    cron.schedule('0 * * * *', async () => {
        try {
            await followupScheduler.runFollowupScheduler();
        } catch (err) {
            console.error('[Scheduler] Follow-up scheduler error:', err);
        }
    }, {
        timezone: "Asia/Bangkok"
    });

    // PRODUCTIZATION: Daily Health Summary (9:00 AM)
    cron.schedule('0 9 * * *', async () => {
        const alerting = require('./services/alerting');
        await alerting.sendDailyHealthSummary();
    }, {
        timezone: "Asia/Bangkok"
    });

    // PRODUCTIZATION: Health Checks (Every 2 hours)
    cron.schedule('0 */2 * * *', async () => {
        const alerting = require('./services/alerting');
        await alerting.runHealthChecks();
    });

    console.log('✅ Scheduler Initialized: Morning(08:00), NonResponder(10:00), Nudge(14:00), Evening(19:00), Escalation(15m), Capacity(5m), Rechecks(1h), HealthSummary(09:00), HealthChecks(2h)');
};

/**
 * 📢 The Active Nudge
 * Finds patients with no activity in 24h and sends a "Call Me" card.
 */
const checkSilenceAndNudge = async () => {
    console.log('🕵️‍♀️ [Scheduler] Auditing Patient Silence...');

    try {
        // Find active patients who have NOT had a check-in in the last 24 hours
        const users = await db.query(`
            SELECT cp.* 
            FROM chronic_patients cp
            WHERE cp.enrollment_status = 'active'
            AND cp.id NOT IN (
                SELECT DISTINCT patient_id 
                FROM check_ins 
                WHERE check_in_time >= NOW() - INTERVAL '24 hours'
                AND patient_id IS NOT NULL
            )
        `);

        console.log(`🔍 Found ${users.rows.length} silent patients`);

        for (const user of users.rows) {
            console.log(`📡 Nudging Silent Patient: ${user.name}`);

            await sendWithRetry(user.line_user_id, {
                type: 'flex',
                altText: '📞 ฮันนาเป็นห่วงค่ะ',
                contents: {
                    type: 'bubble',
                    body: {
                        type: 'box',
                        layout: 'vertical',
                        contents: [
                            { type: 'text', text: 'สวัสดีค่ะ ฮันนาอยากทักทายหน่อย 😊', weight: 'bold', size: 'xl', color: '#06C755' },
                            { type: 'text', text: 'วันนี้ยังไม่ได้คุยกัน สบายดีไหมคะ?', margin: 'md', size: 'md' },
                            { type: 'text', text: 'กดปุ่มเพื่อคุยกับฮันนา 1 นาทีนะคะ', margin: 'sm', size: 'xs', color: '#666666' }
                        ]
                    },
                    footer: {
                        type: 'box',
                        layout: 'vertical',
                        spacing: 'sm',
                        contents: [
                            {
                                type: 'button',
                                style: 'primary',
                                color: '#06C755',
                                height: 'sm',
                                action: {
                                    type: 'uri',
                                    label: '📞 กดเพื่อคุย (โทรฟรี)',
                                    uri: `https://liff.line.me/${process.env.LIFF_ID}`
                                }
                            }
                        ]
                    }
                }
            });
        }
    } catch (err) {
        console.error('❌ Scheduler Error:', err);
    }
};

/**
 * 🚨 Escalation Monitor (Enterprise-Grade)
 * Checks for Critical Tasks pending > 1 hour.
 * Sends actual notifications and logs to escalation_log table.
 */
const checkEscalations = async () => {
    console.log('⏱️ [Scheduler] Checking for Escalations...');
    try {
        // Find ignored criticals (older than 1 hour, not already escalated today)
        const ignored = await db.query(`
            SELECT nt.*, cp.name as patient_name 
            FROM nurse_tasks nt
            JOIN chronic_patients cp ON nt.patient_id = cp.id
            WHERE nt.status = 'pending' 
            AND nt.priority = 'critical' 
            AND nt.created_at < NOW() - INTERVAL '1 hour'
            AND nt.id NOT IN (
                SELECT task_id FROM escalation_log 
                WHERE triggered_at > NOW() - INTERVAL '4 hours'
            )
        `);

        for (const task of ignored.rows) {
            console.log(`🔥 [ESCALATION] Task ${task.id} unanswered for >1h! Escalating...`);

            // Determine escalation level
            const existingEscalations = await db.query(
                `SELECT MAX(escalation_level) as max_level FROM escalation_log WHERE task_id = $1`,
                [task.id]
            );
            const currentLevel = (existingEscalations.rows[0]?.max_level || 0) + 1;

            // Log escalation
            await db.query(`
                INSERT INTO escalation_log (task_id, patient_id, escalation_level, notification_type, notification_sent)
                VALUES ($1, $2, $3, $4, $5)
            `, [task.id, task.patient_id, currentLevel, 'sms', true]);

            // Audit log
            await db.query(`
                INSERT INTO audit_log (actor, action, patient_id, details)
                VALUES ($1, $2, $3, $4)
            `, [
                'System',
                'ESCALATION_TRIGGERED',
                task.patient_id,
                JSON.stringify({
                    task_id: task.id,
                    escalation_level: currentLevel,
                    patient_name: task.patient_name,
                    reason: 'Critical task unresolved >1 hour'
                })
            ]);

            // Send notification (using LINE Notify as SMS proxy for MVP)
            const lineNotify = require('./services/lineNotify');
            const message = `🚨 ESCALATION L${currentLevel}: Critical task unresolved >1h\nPatient: ${task.patient_name}\nReason: ${task.reason}\nTask ID: ${task.id}`;

            try {
                await lineNotify.sendAlert(message);
                console.log(`✅ [ESCALATION] Notification sent for task ${task.id} (Level ${currentLevel})`);
            } catch (notifyErr) {
                console.error(`❌ [ESCALATION] Failed to send notification:`, notifyErr.message);
            }
        }

        // ============================================================
        // L2 ESCALATION: Tasks pending >2h that only received L1
        // ============================================================
        const l2Candidates = await db.query(`
            SELECT nt.*, cp.name as patient_name 
            FROM nurse_tasks nt
            JOIN chronic_patients cp ON nt.patient_id = cp.id
            WHERE nt.status = 'pending' 
            AND nt.priority = 'critical' 
            AND nt.created_at < NOW() - INTERVAL '2 hours'
            AND nt.id IN (
                SELECT task_id FROM escalation_log 
                WHERE escalation_level = 1
            )
            AND nt.id NOT IN (
                SELECT task_id FROM escalation_log 
                WHERE escalation_level >= 2 
                AND triggered_at > NOW() - INTERVAL '4 hours'
            )
        `);

        for (const task of l2Candidates.rows) {
            console.log(`🔴🔴 [L2 ESCALATION] Task ${task.id} unresolved >2h! Escalating to Clinical Director...`);

            // Log L2 escalation
            await db.query(`
                INSERT INTO escalation_log (task_id, patient_id, escalation_level, notification_type, notification_sent)
                VALUES ($1, $2, $3, $4, $5)
            `, [task.id, task.patient_id, 2, 'line_notify', true]);

            // Audit log
            await db.query(`
                INSERT INTO audit_log (actor, action, patient_id, details)
                VALUES ($1, $2, $3, $4)
            `, [
                'System',
                'L2_ESCALATION_TRIGGERED',
                task.patient_id,
                JSON.stringify({
                    task_id: task.id,
                    escalation_level: 2,
                    patient_name: task.patient_name,
                    reason: 'Critical task unresolved >2 hours after L1'
                })
            ]);

            // Send L2 notification (higher urgency)
            const lineNotify = require('./services/lineNotify');
            const l2Message = `🚨🚨 L2 ESCALATION - CLINICAL DIRECTOR ATTENTION REQUIRED 🚨🚨\n\nCritical task unresolved >2 HOURS\nPatient: ${task.patient_name}\nReason: ${task.reason}\nTask ID: ${task.id}\n\nThis patient requires immediate clinical attention.`;

            try {
                await lineNotify.sendAlert(l2Message);
                console.log(`✅ [L2 ESCALATION] Clinical Director notified for task ${task.id}`);
            } catch (notifyErr) {
                console.error(`❌ [L2 ESCALATION] Failed to send notification:`, notifyErr.message);
            }
        }
    } catch (err) {
        console.error('❌ Escalation Check Error:', err);
    }
};

/**
 * 📊 Capacity Monitor (Enterprise-Grade)
 * Detects nurse overload and triggers alerts.
 */
const checkCapacity = async () => {
    console.log('📊 [Scheduler] Checking Nurse Capacity...');
    try {
        const OVERLOAD_THRESHOLD = 30;
        const WARNING_THRESHOLD = 20;

        const queueRes = await db.query(
            `SELECT COUNT(*) as cnt FROM nurse_tasks WHERE status = 'pending'`
        );
        const queueSize = parseInt(queueRes.rows[0].cnt);

        if (queueSize >= OVERLOAD_THRESHOLD) {
            console.warn(`🔴 [CAPACITY] OVERLOAD: ${queueSize} pending tasks (threshold: ${OVERLOAD_THRESHOLD})`);

            // Check if we already alerted in last 2 hours
            const recentAlert = await db.query(`
                SELECT id FROM capacity_events 
                WHERE event_type = 'overload_critical' 
                AND created_at > NOW() - INTERVAL '2 hours'
            `);

            if (recentAlert.rows.length === 0) {
                // Log capacity event
                await db.query(`
                    INSERT INTO capacity_events (event_type, queue_size, threshold, notification_sent)
                    VALUES ($1, $2, $3, $4)
                `, ['overload_critical', queueSize, OVERLOAD_THRESHOLD, true]);

                // Send alert
                const lineNotify = require('./services/lineNotify');
                await lineNotify.sendAlert(
                    `🔴 CAPACITY OVERLOAD: ${queueSize} pending tasks!\nThreshold: ${OVERLOAD_THRESHOLD}\nConsider assigning backup nurse.`
                );
            }
        } else if (queueSize >= WARNING_THRESHOLD) {
            console.warn(`🟡 [CAPACITY] WARNING: ${queueSize} pending tasks (threshold: ${WARNING_THRESHOLD})`);
        }
    } catch (err) {
        console.error('❌ Capacity Check Error:', err);
    }
};

/**
 * 🔄 Post-Resolution Recheck (Enterprise-Grade)
 * Processes 24h rechecks and formally closes or reopens cases.
 */
const processRechecks = async () => {
    console.log('🔄 [Scheduler] Processing Post-Resolution Rechecks...');
    try {
        // Find due rechecks
        const dueRechecks = await db.query(`
            SELECT cr.*, nt.patient_id, cp.name as patient_name
            FROM case_rechecks cr
            JOIN nurse_tasks nt ON cr.task_id = nt.id
            JOIN chronic_patients cp ON nt.patient_id = cp.id
            WHERE cr.checked_at IS NULL
            AND cr.scheduled_at <= NOW()
        `);

        for (const recheck of dueRechecks.rows) {
            console.log(`🔄 [Recheck] Processing recheck for task ${recheck.task_id}`);

            // Check if patient had new alerts since resolution
            const newAlerts = await db.query(`
                SELECT id FROM nurse_tasks 
                WHERE patient_id = $1 
                AND status = 'pending'
                AND created_at > (SELECT completed_at FROM nurse_tasks WHERE id = $2)
            `, [recheck.patient_id, recheck.task_id]);

            if (newAlerts.rows.length > 0) {
                // Case needs reopening - new alerts detected
                console.log(`⚠️ [Recheck] New alerts found for patient ${recheck.patient_name}, case NOT closed`);

                await db.query(`
                    UPDATE case_rechecks 
                    SET checked_at = NOW(), result = 'new_alert', new_task_id = $2
                    WHERE id = $1
                `, [recheck.id, newAlerts.rows[0].id]);

                await db.query(`
                    UPDATE nurse_tasks SET recheck_passed = false WHERE id = $1
                `, [recheck.task_id]);

            } else {
                // Case passes recheck - formally close
                console.log(`✅ [Recheck] No new alerts, formally closing case for ${recheck.patient_name}`);

                await db.query(`
                    UPDATE case_rechecks 
                    SET checked_at = NOW(), result = 'passed'
                    WHERE id = $1
                `, [recheck.id]);

                await db.query(`
                    UPDATE nurse_tasks 
                    SET status = 'closed', recheck_passed = true, closed_at = NOW()
                    WHERE id = $1
                `, [recheck.task_id]);

                // Audit log
                await db.query(`
                    INSERT INTO audit_log (actor, action, patient_id, details)
                    VALUES ($1, $2, $3, $4)
                `, [
                    'System',
                    'CASE_CLOSED',
                    recheck.patient_id,
                    JSON.stringify({ task_id: recheck.task_id, recheck_id: recheck.id })
                ]);
            }
        }
    } catch (err) {
        console.error('❌ Recheck Processing Error:', err);
    }
};

module.exports = { initScheduler, checkSilenceAndNudge, checkEscalations, checkCapacity, processRechecks };
