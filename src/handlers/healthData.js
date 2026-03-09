const db = require('../services/db');
const OneBrain = require('../services/OneBrain');

/**
 * CLINICAL DATA SCHEMA REFERENCE (B2B Pilot)
 * 
 * Table: nurse_alerts
 * - id: uuid
 * - patient_id: uuid
 * - alert_type: string ('missed_meds', 'high_vitals', 'silent', 'voice_risk')
 * - severity: string ('yellow', 'red')
 * - status: string ('open', 'investigating', 'resolved', 'false_positive')
 * - created_at: timestamp
 * 
 * Table: nurse_action_logs (Time Tracking)
 * - id: uuid
 * - alert_id: uuid (fk)
 * - nurse_id: uuid
 * - action_type: string ('message', 'call', 'escalate', 'mark_false')
 * - started_at: timestamp
 * - completed_at: timestamp
 * - duration_seconds: integer (CRITICAL metrics)
 * - notes: text
 */

const lineNotify = require('../services/lineNotify');

/**
 * Red Flag Keywords (Emergency Symptoms)
 */
const RED_FLAG_KEYWORDS = [
    'เจ็บหน้าอก', 'chest pain', 'pain chest',
    'หน้ามืด', 'faint', 'dizzy',
    'หายใจไม่ออก', 'breathing', 'breath',
    'เลือดออก', 'bleeding', 'blood',
    'ช็อก', 'shock',
    'ชัก', 'seizure', 'convulsion'
];

/**
 * Log a health check-in response with Red Flag detection
 * @param {string} userId - LINE user ID
 * @param {string} mood - User's mood (good, bad, etc.)
 * @param {string} symptoms - Any symptoms reported
 * @param {number} glucoseLevel - Optional glucose reading
 * @returns {object} { success: boolean, alertLevel: string, alertMessage: string }
 */
const logCheckIn = async (userId, mood, symptoms = null, glucoseLevel = null) => {
    let alertLevel = 'green';
    let alertMessage = '';
    let shouldNotifyStaff = false;

    // 0. Look up patient_id from line_user_id (required for FK constraint)
    let patientId = null;
    try {
        const patientRes = await db.query('SELECT id FROM chronic_patients WHERE line_user_id = $1', [userId]);
        patientId = patientRes.rows[0]?.id;
        if (!patientId) {
            console.warn(`⚠️ No patient found for LINE user ${userId}`);
            return { success: false, alertLevel: 'error', alertMessage: 'Patient not found' };
        }
    } catch (err) {
        console.error('❌ Error looking up patient:', err);
        return { success: false, alertLevel: 'error', alertMessage: 'Database error' };
    }

    // 1. Check Glucose Levels (Critical Thresholds)
    if (glucoseLevel) {
        const glucose = parseInt(glucoseLevel);

        if (glucose > 400) {
            alertLevel = 'red';
            alertMessage = `🚨 CRITICAL HIGH GLUCOSE: ${glucose} mg/dL`;
            shouldNotifyStaff = true;
        } else if (glucose < 70) {
            alertLevel = 'red';
            alertMessage = `🚨 CRITICAL LOW GLUCOSE: ${glucose} mg/dL`;
            shouldNotifyStaff = true;
        } else if (glucose > 250) {
            alertLevel = 'yellow';
            alertMessage = `⚠️ High glucose: ${glucose} mg/dL`;
        } else if (glucose < 90) {
            alertLevel = 'yellow';
            alertMessage = `⚠️ Low glucose: ${glucose} mg/dL`;
        }
    }

    // 2. Check for Emergency Symptoms (Red Flag Keywords)
    if (symptoms) {
        const symptomsLower = symptoms.toLowerCase();

        for (const keyword of RED_FLAG_KEYWORDS) {
            if (symptomsLower.includes(keyword.toLowerCase())) {
                alertLevel = 'red';
                alertMessage = `🚨 EMERGENCY SYMPTOM DETECTED: "${symptoms}"`;
                shouldNotifyStaff = true;
                break;
            }
        }
    }

    // 3. Send Alert to Staff (LINE Notify) if Red Flag
    if (shouldNotifyStaff) {
        try {
            // Get patient name from database
            const userResult = await db.query(
                'SELECT name FROM chronic_patients WHERE line_user_id = $1',
                [userId]
            );
            const patientName = userResult.rows[0]?.name || 'Unknown Patient';

            const notifyMessage = `${alertMessage}\n\nPatient: ${patientName}\nUser ID: ${userId}\nTime: ${new Date().toLocaleString('th-TH', { timeZone: 'Asia/Bangkok' })}`;

            await lineNotify.sendAlert(notifyMessage);
            console.log(`🚨 RED FLAG ALERT sent for ${userId}`);
        } catch (error) {
            console.error('❌ Error sending alert:', error);
        }
    }

    // 4. Save to Database (using patient_id, not line_user_id)
    try {
        await db.query(
            `INSERT INTO check_ins (patient_id, mood, symptoms, glucose_level, alert_level, check_in_time)
             VALUES ($1, $2, $3, $4, $5, NOW())`,
            [patientId, mood, symptoms, glucoseLevel, alertLevel]
        );
        console.log(`✅ Check-in logged for patient ${patientId} (Alert Level: ${alertLevel})`);

        // 5. Trigger Brain Analysis (Async) - we already have patientId
        OneBrain.analyzePatient(patientId, 'check_in').catch(err => console.error('OneBrain Trigger Error:', err));

        return {
            success: true,
            alertLevel,
            alertMessage: alertMessage || 'Check-in recorded successfully'
        };
    } catch (error) {
        console.error('❌ Error logging check-in:', error);
        return {
            success: false,
            alertLevel: 'error',
            alertMessage: 'Failed to save check-in'
        };
    }
};

/**
 * Log medication adherence
 * @param {string} userId - LINE user ID
 * @param {boolean} taken - Whether medication was taken
 * @param {string} notes - Optional notes
 */
const logMedication = async (userId, taken, notes = null) => {
    try {
        // Look up patient_id first
        const patientRes = await db.query('SELECT id FROM chronic_patients WHERE line_user_id = $1', [userId]);
        const patientId = patientRes.rows[0]?.id;
        if (!patientId) {
            console.warn(`⚠️ No patient found for LINE user ${userId}`);
            return false;
        }

        // Get today's check-in record if exists
        const existing = await db.query(
            `SELECT id FROM check_ins 
             WHERE patient_id = $1 
             AND DATE(check_in_time) = CURRENT_DATE
             LIMIT 1`,
            [patientId]
        );

        if (existing.rows.length > 0) {
            // Update existing check-in
            await db.query(
                `UPDATE check_ins 
                 SET medication_taken = $1, medication_notes = $2
                 WHERE id = $3`,
                [taken, notes, existing.rows[0].id]
            );
        } else {
            // Create new check-in just for medication
            await db.query(
                `INSERT INTO check_ins (patient_id, medication_taken, medication_notes, check_in_time)
                 VALUES ($1, $2, $3, CURRENT_TIMESTAMP)`,
                [patientId, taken, notes]
            );
        }

        console.log(`✅ Medication logged for ${userId}: ${taken ? 'Taken' : 'Missed'}`);
        return true;
    } catch (error) {
        console.error('❌ Error logging medication:', error);
        return false;
    }
};

/**
 * Get health summary for a user
 * @param {string} userId - LINE user ID
 * @param {number} days - Number of days to look back
 */
const getHealthSummary = async (userId, days = 7) => {
    try {
        // Look up patient_id first
        const patientRes = await db.query('SELECT id FROM chronic_patients WHERE line_user_id = $1', [userId]);
        const patientId = patientRes.rows[0]?.id;
        if (!patientId) return null;

        const result = await db.query(
            `SELECT 
                COUNT(*) as total_checkins,
                SUM(CASE WHEN medication_taken = true THEN 1 ELSE 0 END) as meds_taken,
                SUM(CASE WHEN medication_taken = false THEN 1 ELSE 0 END) as meds_missed,
                AVG(glucose_level) as avg_glucose,
                SUM(CASE WHEN mood = 'good' OR mood = 'สบายดี' THEN 1 ELSE 0 END) as good_mood_days,
                SUM(CASE WHEN mood = 'bad' OR mood = 'ไม่สบาย' THEN 1 ELSE 0 END) as bad_mood_days
             FROM check_ins
             WHERE patient_id = $1
             AND check_in_time >= CURRENT_TIMESTAMP - ($2 || ' days')::INTERVAL`,
            [patientId, days]
        );

        if (result.rows.length === 0) {
            return null;
        }

        const summary = result.rows[0];

        // Parse strings to integers (pg returns BigInt/Count as strings)
        const medsTaken = parseInt(summary.meds_taken || 0);
        const medsMissed = parseInt(summary.meds_missed || 0);
        const totalCheckIns = parseInt(summary.total_checkins || 0);
        const goodMoodDays = parseInt(summary.good_mood_days || 0);
        const badMoodDays = parseInt(summary.bad_mood_days || 0);

        // Calculate adherence percentage
        const totalMedDays = medsTaken + medsMissed;
        const adherencePercent = totalMedDays > 0
            ? Math.round((medsTaken / totalMedDays) * 100)
            : 0;

        return {
            totalCheckIns,
            medicationsTaken: medsTaken,
            medicationsMissed: medsMissed,
            adherencePercent,
            averageGlucose: summary.avg_glucose ? Math.round(summary.avg_glucose) : null,
            goodMoodDays,
            badMoodDays,
            days
        };
    } catch (error) {
        console.error('❌ Error getting health summary:', error);
        return null;
    }
};

/**
 * Get recent check-ins for a user
 * @param {string} userId - LINE user ID
 * @param {number} limit - Number of records to retrieve
 */
const getRecentCheckIns = async (userId, limit = 7) => {
    try {
        // Look up patient_id first
        const patientRes = await db.query('SELECT id FROM chronic_patients WHERE line_user_id = $1', [userId]);
        const patientId = patientRes.rows[0]?.id;
        if (!patientId) return [];

        const result = await db.query(
            `SELECT 
                DATE(check_in_time) as date,
                mood,
                symptoms,
                glucose_level,
                medication_taken,
                medication_notes
             FROM check_ins
             WHERE patient_id = $1
             ORDER BY check_in_time DESC
             LIMIT $2`,
            [patientId, limit]
        );

        return result.rows;
    } catch (error) {
        console.error('❌ Error getting recent check-ins:', error);
        return [];
    }
};

/**
 * Calculate risk score based on recent data
 * @param {string} userId - LINE user ID
 * @returns {string} Risk level: 'low', 'medium', 'high'
 */
const calculateRiskScore = async (userId) => {
    try {
        const summary = await getHealthSummary(userId, 7);

        if (!summary) {
            return 'unknown';
        }

        let riskPoints = 0;

        // Medication adherence (weighted heavily)
        if (summary.adherencePercent < 70) {
            riskPoints += 3;
        } else if (summary.adherencePercent < 85) {
            riskPoints += 1;
        }

        // Missed medications in last week
        if (summary.medicationsMissed >= 3) {
            riskPoints += 2;
        }

        // Bad mood days
        if (summary.badMoodDays >= 3) {
            riskPoints += 1;
        }

        // Glucose levels (if tracked)
        if (summary.averageGlucose) {
            if (summary.averageGlucose > 200) {
                riskPoints += 2;
            } else if (summary.averageGlucose > 160) {
                riskPoints += 1;
            }
        }

        // Determine risk level
        if (riskPoints >= 4) {
            return 'high';
        } else if (riskPoints >= 2) {
            return 'medium';
        } else {
            return 'low';
        }
    } catch (error) {
        console.error('❌ Error calculating risk score:', error);
        return 'unknown';
    }
};

module.exports = {
    logCheckIn,
    logMedication,
    getHealthSummary,
    getRecentCheckIns,
    calculateRiskScore
};
