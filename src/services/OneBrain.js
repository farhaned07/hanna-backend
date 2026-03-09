const db = require('./db');
const healthData = require('../handlers/healthData');
const sentimentAnalysis = require('./sentimentAnalysis');

/**
 * OneBrain Service
 * The Central Intelligence Layer for Hanna.
 * 
 * Responsibilities:
 * 1. Analyze Patient State (Triggered by events or scheduler)
 * 2. Calculate Risk Score
 * 3. Generate & Prioritize Nurse Tasks
 */

class OneBrain {

    /**
     * The Main Loop: Analyze a specific patient
     * @param {string} patientId - UUID of the patient
     * @param {string} triggerEvent - 'check_in', 'voice_call', 'silent_timer'
     */
    async analyzePatient(patientId, triggerEvent) {
        console.log(`🧠 [OneBrain] Analyzing Patient ${patientId} (Trigger: ${triggerEvent})`);

        try {
            // 1. Get Patient Data & History
            const patient = await this.getPatientProfile(patientId);
            if (!patient) return; // Should not happen

            // 1b. Inject Trigger Context (for Risk Logic)
            if (triggerEvent && triggerEvent.startsWith('emergency_keyword:')) {
                patient._tempKeywordTrigger = triggerEvent.split(':')[1];
            }

            // 2. Calculate Live Risk Score
            const riskAnalysis = await this.calculateRisk(patient);

            // 3. Update State in DB
            await this.updatePatientState(patientId, riskAnalysis);

            // 4. Generate Tasks (The "Superhuman" Distributor)
            await this.generateTasks(patient, riskAnalysis);

            return riskAnalysis;

        } catch (error) {
            console.error(`❌ [OneBrain] Error analyzing patient ${patientId}:`, error);
        }
    }

    /**
     * Get basic profile + recent history
     */
    async getPatientProfile(patientId) {
        const res = await db.query(`SELECT * FROM chronic_patients WHERE id = $1`, [patientId]);
        return res.rows[0];
    }

    /**
     * Logic to determine Risk Score (0-10) - V4 FALSE NEGATIVE MITIGATION
     * Formula:
     * +3 Emergency Keyword
     * +2 Vital Danger (BP >180, Gluc >400/<70)
     * +2 Missed Meds > 3 days
     * +1 High Trend
     * +1 Silence > 48h
     * +1 Hedging/Underreporting detected (NEW)
     * +1 Worsening 7-day trend (NEW)
     */
    async calculateRisk(patient) {
        // Get LINE User ID for healthData lookups
        const lineUserId = patient.line_user_id;

        // Use existing healthData logic for base metrics
        const summary = await healthData.getHealthSummary(lineUserId, 7); // Last 7 days

        let score = 0;
        let reasons = [];

        // --- 1. Emergency Keywords (Immediate +3 or Trigger Critical) ---
        if (patient._tempKeywordTrigger) {
            const k = patient._tempKeywordTrigger.toLowerCase();
            if (k.includes('chest pain') || k.includes('breathe') || k.includes('faint')) {
                score += 3; // Base +3
                reasons.push(`📢 Emergency Keyword: "${k}"`);
                // Force Critical override if it's a known SOS
                return { score: 10, level: 'critical', reasons: [`🚨 SOS Trigger: "${k}"`] };
            }
        }

        if (!summary) {
            // No data + No emergency = Low/Medium
            return { score: 1, level: 'low', reasons: ['No data'] };
        }

        // --- 2. Vitals ---
        if (summary.averageGlucose > 400 || summary.averageGlucose < 70) {
            score += 2;
            reasons.push(`Glucose Critical (${summary.averageGlucose})`);
        } else if (summary.averageGlucose > 250) {
            score += 1;
            reasons.push(`Glucose High (${summary.averageGlucose})`);
        }

        // --- 3. Adherence ---
        if (summary.adherencePercent < 50) {
            score += 2; // Missed meds often
            reasons.push('Missed Meds > 3 days');
        }

        // --- 4. Silence ---
        if (summary.totalCheckIns === 0) {
            score += 1;
            reasons.push('Silent > 48h');
        }

        // --- 5. SENTIMENT ANALYSIS (FALSE NEGATIVE MITIGATION) ---
        // Detect hedging language that suggests underreporting
        try {
            const recentChat = await db.query(`
                SELECT content, role FROM chat_history 
                WHERE patient_id = $1 AND role = 'user'
                AND created_at > NOW() - INTERVAL '24 hours'
                ORDER BY created_at DESC LIMIT 10
            `, [patient.id]);

            if (recentChat.rows.length > 0) {
                const chatAnalysis = sentimentAnalysis.analyzeChatHistory(recentChat.rows);
                if (chatAnalysis.maxConcern >= 2 || chatAnalysis.flaggedMessages.length > 0) {
                    score += 1;
                    reasons.push('⚠️ Possible underreporting detected');
                }
            }
        } catch (err) {
            console.warn('[OneBrain] Sentiment analysis skipped:', err.message);
        }

        // --- 6. 7-DAY WORSENING TREND (FALSE NEGATIVE MITIGATION) ---
        // Compare this week vs previous week
        try {
            const prevWeekSummary = await this.getPreviousWeekSummary(lineUserId);
            if (prevWeekSummary && summary.averageGlucose && prevWeekSummary.averageGlucose) {
                const trendPct = ((summary.averageGlucose - prevWeekSummary.averageGlucose) / prevWeekSummary.averageGlucose) * 100;
                if (trendPct > 10) {
                    score += 1;
                    reasons.push(`📈 Worsening trend: +${Math.round(trendPct)}% glucose`);
                }
            }
        } catch (err) {
            console.warn('[OneBrain] Trend analysis skipped:', err.message);
        }

        // --- 7. Age Modifier ---
        if (patient.age && patient.age > 70) {
            score = Math.ceil(score * 1.2);
        }

        // Cap score
        score = Math.min(score, 10);

        // Determine Level
        let level = 'low';
        if (score >= 8) level = 'critical';
        else if (score >= 5) level = 'high'; // Tweaked: High starts at 5
        else level = 'low'; // 0-4 is Routine

        let positiveSignals = [];

        // --- 6. Positive Signal Injection (The "Reward" Logic) ---
        // Calculate Streak from recent history
        const history = await healthData.getRecentCheckIns(lineUserId, 14); // 2 weeks
        let streak = 0;
        if (history && history.length > 0) {
            // Simple daily consecutive check logic
            // (Assumes sorted DESC)
            let lastDate = new Date();
            lastDate.setHours(0, 0, 0, 0);

            // Check if checked in today
            const lastCheckIn = new Date(history[0].date);
            lastCheckIn.setHours(0, 0, 0, 0);

            if (lastCheckIn.getTime() === lastDate.getTime()) {
                streak = 1;
            }

            // Count backwards
            // Count backwards
            for (let i = 1; i < history.length; i++) {
                const d = new Date(history[i].date);
                d.setHours(0, 0, 0, 0);
                const diffDays = Math.round((lastDate.getTime() - d.getTime()) / (1000 * 3600 * 24));

                if (diffDays === streak) {
                    streak++;
                } else if (diffDays < streak) {
                    // Same day duplicate - ignore
                } else {
                    break;
                }
            }
        }

        if (streak > 2) {
            positiveSignals.push(`${streak}-Day Streak! 🔥`);
        }

        // Calculate Trend (Glucose)
        if (summary.averageGlucose) {
            // Need prev week data? simpler: compare recent vs average
            // If current (last checkin) is better than average
            const lastG = history.find(h => h.glucose_level)?.glucose_level;
            if (lastG && lastG < summary.averageGlucose && lastG < 140) {
                positiveSignals.push('Glucose trending down 📉');
            }
        }

        return { score, level, reasons, positiveSignals };
    }

    /**
     * Get previous week's summary for trend comparison
     * Days 8-14 ago
     */
    async getPreviousWeekSummary(lineUserId) {
        try {
            // Look up patient_id first
            const patientRes = await db.query('SELECT id FROM chronic_patients WHERE line_user_id = $1', [lineUserId]);
            const patientId = patientRes.rows[0]?.id;
            if (!patientId) return null;

            const result = await db.query(`
                SELECT 
                    AVG(glucose_level) as avg_glucose,
                    COUNT(*) as total_checkins
                FROM check_ins
                WHERE patient_id = $1
                AND check_in_time >= CURRENT_TIMESTAMP - INTERVAL '14 days'
                AND check_in_time < CURRENT_TIMESTAMP - INTERVAL '7 days'
            `, [patientId]);

            if (result.rows.length === 0 || !result.rows[0].avg_glucose) {
                return null;
            }

            return {
                averageGlucose: Math.round(result.rows[0].avg_glucose),
                totalCheckIns: parseInt(result.rows[0].total_checkins || 0)
            };
        } catch (error) {
            console.warn('[OneBrain] getPreviousWeekSummary error:', error.message);
            return null;
        }
    }

    /**
     * Update the persistent state table
     * SAFETY RULE: No Auto-Downgrade Calculation here? 
     * Actually, we store the *calculated* risk here. The *effective* risk is managed by open tasks.
     */
    async updatePatientState(patientId, risk) {
        // We just update the snapshot. The Nurse Dashboard will combine this with 'pending tasks' to show effective risk.
        await db.query(`
            INSERT INTO patient_state (patient_id, current_risk_score, risk_level, risk_reasoning, updated_at)
            VALUES ($1, $2, $3, $4, NOW())
            ON CONFLICT (patient_id) 
            DO UPDATE SET 
                current_risk_score = $2,
                risk_level = $3,
                risk_reasoning = $4,
                updated_at = NOW()
        `, [patientId, risk.score, risk.level, JSON.stringify({ reasons: risk.reasons, positive: risk.positiveSignals })]);

        // 🧾 LEGAL AUDIT LOG
        await db.query(`
            INSERT INTO audit_log (actor, action, patient_id, details)
            VALUES ($1, $2, $3, $4)
        `, ['OneBrain', 'CALCULATE_RISK', patientId, JSON.stringify(risk)]);
    }

    /**
     * The Task Generator
     * Decides if the Nurse needs to get involved.
     */
    async generateTasks(patient, risk) {
        if (risk.level === 'low') return;

        // --- SAFEGUARD: Alert Fatigue Cap ---
        // Check total active critical tasks
        if (risk.level === 'critical') {
            const activeCriticals = await db.query(`SELECT COUNT(*) FROM nurse_tasks WHERE status='pending' AND priority='critical'`);
            if (parseInt(activeCriticals.rows[0].count) >= 15) {
                console.warn(`🚧 [OneBrain] Critical Task Cap Reached (15). Suppressing new alert for ${patient.id}.`);

                // ENTERPRISE: Log suppression to audit_log (legal requirement)
                await db.query(`
                    INSERT INTO audit_log (actor, action, patient_id, details)
                    VALUES ($1, $2, $3, $4)
                `, [
                    'OneBrain',
                    'TASK_SUPPRESSED_CAP',
                    patient.id,
                    JSON.stringify({
                        reason: 'Critical task cap (15) reached',
                        suppressed_risk: risk.level,
                        suppressed_score: risk.score
                    })
                ]);

                // ENTERPRISE: Alert supervisor when cap is hit
                try {
                    const lineNotify = require('./lineNotify');
                    await lineNotify.sendAlert(
                        `⚠️ TASK CAP ALERT: Critical task cap (15) reached!\nNew alert for patient ${patient.id} was suppressed.\nSupervisor action required.`
                    );
                } catch (e) {
                    console.error('Failed to send cap alert:', e.message);
                }

                return; // Don't create task when cap reached
            }
        }

        // DEDUPLICATION: Check for recent tasks (last 4 hours)
        const recentTasks = await db.query(`
            SELECT * FROM nurse_tasks 
            WHERE patient_id = $1 
            AND (
                (created_at > NOW() - INTERVAL '4 hours') 
                OR 
                (status = 'pending' AND priority IN ('critical', 'high'))
            )
        `, [patient.id]);

        if (recentTasks.rows.length > 0) {
            const existingCritical = recentTasks.rows.find(t => t.priority === 'critical');
            // Escalation: High -> Critical allowed
            if (risk.level === 'critical' && !existingCritical) {
                console.log(`⚡️ [OneBrain] Escalating to CRITICAL for ${patient.id}`);
            } else {
                console.log(`✋ [OneBrain] Skipping task for ${patient.id} (Deduplication)`);

                // ENTERPRISE: Log dedup suppression to audit_log (legal requirement)
                await db.query(`
                    INSERT INTO audit_log (actor, action, patient_id, details)
                    VALUES ($1, $2, $3, $4)
                `, [
                    'OneBrain',
                    'TASK_SUPPRESSED_DEDUP',
                    patient.id,
                    JSON.stringify({
                        reason: 'Duplicate within 4h window or pending task exists',
                        suppressed_risk: risk.level,
                        suppressed_score: risk.score,
                        existing_task_id: recentTasks.rows[0]?.id
                    })
                ]);

                return;
            }
        }

        await this.createNurseTask({
            patientId: patient.id,
            type: risk.level === 'critical' ? 'emergency_alert' : 'risk_review',
            priority: risk.level,
            reason: risk.reasons.join(', ')
        });
    }

    /**
     * Helper to create a task in DB
     */
    async createNurseTask({ patientId, type, priority, reason }) {
        await db.query(`
            INSERT INTO nurse_tasks (patient_id, task_type, priority, reason, status)
            VALUES ($1, $2, $3, $4, 'pending')
        `, [patientId, type, priority, reason]);

        console.log(`🚨 [OneBrain] Nurse Task Generated: ${type} for ${patientId} (${priority})`);
    }
}

module.exports = new OneBrain();
