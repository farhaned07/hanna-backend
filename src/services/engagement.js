const db = require('./db');
const line = require('./line');

/**
 * Streak & Engagement Service
 * 
 * Handles:
 * - Streak calculation (consecutive check-in days)
 * - Streak celebration messages (Day 7, 14, 30)
 * - Non-responder protocol (7-day escalation)
 */

// Streak celebration templates
const STREAK_CELEBRATIONS = {
    7: {
        emoji: '🔥',
        title: '7 วันติดต่อกัน!',
        message: 'สัปดาห์แรกสุดยอด! คุณเก่งมาก! 🎉\n\nต่อเนื่องอีกสิ! 💪',
        color: '#FF6B00'
    },
    14: {
        emoji: '🏆',
        title: '2 อาทิตย์แล้ว!',
        message: 'เก่ง! คุณมีวินัยสูง! 💯\n\nพยาบาลของคุณภูมิใจมาก ❤️',
        color: '#FFD700'
    },
    30: {
        emoji: '⭐',
        title: '1 เดือนเต็ม!',
        message: 'คุณเป็นแบบอย่างที่ดี 🌟\n\nสุขภาพของคุณกำลังดีขึ้น\nโรงพยาบาลภูมิใจ 🏥\n\nต่อเนื่องสิ! 💪',
        color: '#9B59B6'
    }
};

/**
 * Calculate consecutive check-in streak for a patient
 * @param {string} patientId - Patient UUID
 * @returns {number} Number of consecutive days
 */
const calculateStreak = async (patientId) => {
    try {
        // Get distinct check-in dates in descending order
        const result = await db.query(`
            SELECT DISTINCT DATE(check_in_time) as check_date
            FROM check_ins
            WHERE patient_id = $1
            ORDER BY check_date DESC
            LIMIT 60
        `, [patientId]);

        if (result.rows.length === 0) return 0;

        const dates = result.rows.map(r => new Date(r.check_date));
        let streak = 0;
        const today = new Date();
        today.setHours(0, 0, 0, 0);

        // Check if most recent check-in was today or yesterday
        const mostRecent = dates[0];
        mostRecent.setHours(0, 0, 0, 0);

        const dayDiff = Math.floor((today - mostRecent) / (1000 * 60 * 60 * 24));

        if (dayDiff > 1) {
            // Streak broken - no check-in for more than a day
            return 0;
        }

        // Count consecutive days
        streak = 1;
        for (let i = 1; i < dates.length; i++) {
            const current = dates[i];
            const previous = dates[i - 1];

            current.setHours(0, 0, 0, 0);
            previous.setHours(0, 0, 0, 0);

            const diff = Math.floor((previous - current) / (1000 * 60 * 60 * 24));

            if (diff === 1) {
                streak++;
            } else {
                break;
            }
        }

        return streak;
    } catch (error) {
        console.error('❌ Error calculating streak:', error);
        return 0;
    }
};

/**
 * Check if patient just hit a milestone and send celebration
 * @param {string} patientId - Patient UUID
 * @param {string} lineUserId - LINE user ID
 */
const checkAndCelebrateStreak = async (patientId, lineUserId) => {
    try {
        const streak = await calculateStreak(patientId);

        console.log(`[Streak] Patient ${patientId} has ${streak}-day streak`);

        // Check if this is a celebration milestone
        const celebration = STREAK_CELEBRATIONS[streak];

        if (celebration) {
            console.log(`🎉 [Streak] Celebrating ${streak}-day milestone for ${patientId}`);

            await line.pushMessage(lineUserId, {
                type: 'flex',
                altText: `${celebration.emoji} ${celebration.title}`,
                contents: {
                    type: 'bubble',
                    body: {
                        type: 'box',
                        layout: 'vertical',
                        contents: [
                            { type: 'text', text: `${celebration.emoji} ${celebration.title}`, weight: 'bold', size: 'xl', color: celebration.color },
                            { type: 'separator', margin: 'md' },
                            { type: 'text', text: celebration.message, margin: 'md', wrap: true, size: 'sm' }
                        ]
                    }
                }
            });

            // Log the celebration
            await db.query(`
                INSERT INTO audit_log (actor, action, patient_id, details)
                VALUES ('System', 'STREAK_CELEBRATION', $1, $2)
            `, [patientId, JSON.stringify({ streak, milestone: streak })]);

            return true;
        }

        return false;
    } catch (error) {
        console.error('❌ Error in streak celebration:', error);
        return false;
    }
};

/**
 * Non-responder protocol messages based on days missed
 */
const NON_RESPONDER_MESSAGES = {
    // Day 3-4: Concern message
    3: {
        type: 'concern',
        message: (name) => `สวัสดี ${name}! 👋\n\nเรากังวลเพราะคุณไม่ได้ตอบคำถามมา 3 วันแล้ว\n\nสบายดีไหมคะ?`,
        buttons: true
    },
    // Day 5-6: Personal appeal
    5: {
        type: 'appeal',
        message: (name) => `สวัสดี ${name}! 🤝\n\nเราคิดถึงคุณนะ! บอกเราได้ว่าเป็นยังไงบ้าง`,
        buttons: true,
        helpButton: true
    },
    // Day 7: Final choice
    7: {
        type: 'final',
        message: (name) => `${name}! 😟\n\nตั้งแต่ 7 วันที่ผ่านมา เราไม่ได้ข่าวจากคุณเลย\n\nคุณสามารถ:\n1️⃣ ตอบคำถามด้านล่าง\n2️⃣ ติดต่อพยาบาล`,
        buttons: true,
        nurseButton: true
    }
};

/**
 * Process non-responder protocol
 * Called by scheduler to check and escalate silent patients
 */
const processNonResponders = async () => {
    console.log('🔔 [NonResponder] Processing non-responder protocol...');

    try {
        // Find patients with no check-ins
        const patients = await db.query(`
            SELECT 
                cp.id,
                cp.line_user_id,
                cp.name,
                cp.consecutive_missed_days,
                cp.last_response_date,
                COALESCE(
                    CURRENT_DATE - cp.last_response_date,
                    (CURRENT_DATE - DATE(cp.created_at))
                ) as days_silent
            FROM chronic_patients cp
            WHERE cp.enrollment_status = 'active'
            AND (
                cp.last_response_date < CURRENT_DATE - INTERVAL '2 days'
                OR cp.last_response_date IS NULL
            )
        `);

        console.log(`[NonResponder] Found ${patients.rows.length} potentially silent patients`);

        for (const patient of patients.rows) {
            const daysSilent = parseInt(patient.days_silent) || 0;
            const name = patient.name || 'คุณ';

            // Determine which protocol stage
            let protocolStage = null;
            if (daysSilent >= 7) protocolStage = 7;
            else if (daysSilent >= 5) protocolStage = 5;
            else if (daysSilent >= 3) protocolStage = 3;

            if (!protocolStage) continue;

            // Check if we already sent this stage today
            const alreadySent = await db.query(`
                SELECT id FROM audit_log 
                WHERE patient_id = $1 
                AND action = 'NON_RESPONDER_PROTOCOL'
                AND details->>'stage' = $2
                AND created_at > CURRENT_DATE
            `, [patient.id, protocolStage.toString()]);

            if (alreadySent.rows.length > 0) continue;

            console.log(`📢 [NonResponder] Sending Day ${protocolStage} message to ${patient.name}`);

            const protocol = NON_RESPONDER_MESSAGES[protocolStage];

            // Build message
            const footerContents = [];

            if (protocol.buttons) {
                footerContents.push(
                    { type: 'button', style: 'primary', color: '#06C755', action: { type: 'message', label: 'ฉันโอเค 👍', text: 'สบายดี' } }
                );
            }

            if (protocol.helpButton) {
                footerContents.push(
                    { type: 'button', style: 'secondary', action: { type: 'message', label: 'ต้องการช่วยเหลือ', text: 'ต้องการช่วยเหลือ' } }
                );
            }

            if (protocol.nurseButton) {
                footerContents.push(
                    { type: 'button', style: 'secondary', color: '#FF6B6B', action: { type: 'message', label: 'ติดต่อพยาบาล 👩‍⚕️', text: 'ติดต่อพยาบาล' } }
                );
            }

            try {
                await line.pushMessage(patient.line_user_id, {
                    type: 'flex',
                    altText: protocol.message(name),
                    contents: {
                        type: 'bubble',
                        body: {
                            type: 'box',
                            layout: 'vertical',
                            contents: [
                                { type: 'text', text: protocol.message(name), wrap: true, size: 'md' }
                            ]
                        },
                        footer: footerContents.length > 0 ? {
                            type: 'box',
                            layout: 'vertical',
                            spacing: 'sm',
                            contents: footerContents
                        } : undefined
                    }
                });

                // Log the protocol action
                await db.query(`
                    INSERT INTO audit_log (actor, action, patient_id, details)
                    VALUES ('System', 'NON_RESPONDER_PROTOCOL', $1, $2)
                `, [patient.id, JSON.stringify({ stage: protocolStage, days_silent: daysSilent })]);

                // Update consecutive missed days
                await db.query(`
                    UPDATE chronic_patients 
                    SET consecutive_missed_days = $2 
                    WHERE id = $1
                `, [patient.id, daysSilent]);

                // Day 8+: Escalate to nurse dashboard
                if (daysSilent >= 8) {
                    console.log(`🚨 [NonResponder] Day 8+ Escalation for ${patient.name}`);

                    // Create nurse task
                    await db.query(`
                        INSERT INTO nurse_tasks (patient_id, task_type, priority, reason, status)
                        VALUES ($1, 'non_responder', 'high', $2, 'pending')
                    `, [patient.id, `ไม่ได้ตอบกลับ ${daysSilent} วัน - ต้องติดตาม`]);
                }

            } catch (sendError) {
                console.error(`❌ Failed to send non-responder message to ${patient.line_user_id}:`, sendError.message);
            }
        }

        console.log('✅ [NonResponder] Protocol processing complete');
    } catch (error) {
        console.error('❌ [NonResponder] Error processing:', error);
    }
};

/**
 * Symptom tracking for recurring symptoms
 */
const trackRecurringSymptom = async (patientId, symptom) => {
    try {
        // Check if same symptom was reported in last 3 days
        const recentSymptoms = await db.query(`
            SELECT symptoms, DATE(check_in_time) as check_date
            FROM check_ins
            WHERE patient_id = $1
            AND symptoms IS NOT NULL
            AND check_in_time >= CURRENT_DATE - INTERVAL '3 days'
            ORDER BY check_in_time DESC
        `, [patientId]);

        let consecutiveDays = 1;

        for (const row of recentSymptoms.rows) {
            if (row.symptoms && row.symptoms.toLowerCase().includes(symptom.toLowerCase())) {
                consecutiveDays++;
            } else {
                break;
            }
        }

        console.log(`[Symptom] Patient ${patientId} has ${symptom} for ${consecutiveDays} consecutive days`);

        // If 3+ consecutive days, trigger escalation
        if (consecutiveDays >= 3) {
            console.log(`🚨 [Symptom] Recurring symptom detected: ${symptom} for ${consecutiveDays} days`);

            // Create urgent nurse task
            await db.query(`
                INSERT INTO nurse_tasks (patient_id, task_type, priority, reason, status)
                VALUES ($1, 'recurring_symptom', 'critical', $2, 'pending')
                ON CONFLICT DO NOTHING
            `, [patientId, `อาการ "${symptom}" ต่อเนื่อง ${consecutiveDays} วัน - ต้องติดตามด่วน`]);

            return { recurring: true, days: consecutiveDays };
        }

        return { recurring: false, days: consecutiveDays };
    } catch (error) {
        console.error('❌ Error tracking recurring symptom:', error);
        return { recurring: false, days: 1 };
    }
};

module.exports = {
    calculateStreak,
    checkAndCelebrateStreak,
    processNonResponders,
    trackRecurringSymptom,
    STREAK_CELEBRATIONS,
    NON_RESPONDER_MESSAGES
};
