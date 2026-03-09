/**
 * Patient Data Aggregator Service
 * Collects and aggregates patient data for PDF summary generation
 * 
 * Set USE_MOCK_DATA=true environment variable to use mock data for local testing
 */

const db = require('./db');
const { generateMockData } = require('./mockDataGenerator');

/**
 * Helper to generate date labels for a time range
 * @param {Date} startDate 
 * @param {number} days 
 * @returns {Array<string>}
 */
const generateDateLabels = (startDate, days) => {
    const labels = [];
    const date = new Date(startDate);
    for (let i = 0; i < days; i++) {
        labels.push(date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }));
        date.setDate(date.getDate() + 1);
    }
    return labels;
};

/**
 * Format date for display
 * @param {Date} date 
 * @returns {string}
 */
const formatDate = (date) => {
    return new Date(date).toLocaleDateString('en-US', {
        month: 'short',
        day: 'numeric'
    });
};

/**
 * Aggregate all patient data for PDF summary
 * @param {string} patientId - Patient UUID
 * @param {number} timeRangeDays - Number of days (7, 15, or 30)
 * @returns {Promise<Object>} Aggregated data
 */
const aggregatePatientData = async (patientId, timeRangeDays, tenantId = null) => {
    // Use mock data for local testing when USE_MOCK_DATA=true
    if (process.env.USE_MOCK_DATA === 'true') {
        console.log('[DataAggregator] Using mock data for local testing');
        return generateMockData(patientId, timeRangeDays);
    }

    const startDate = new Date();
    startDate.setDate(startDate.getDate() - timeRangeDays);
    startDate.setHours(0, 0, 0, 0);

    // 1. Patient Info (works without multi-tenant tables)
    let patientQuery = `
        SELECT 
            cp.id, cp.name, cp.age, cp.condition, 
            cp.phone_number, cp.enrollment_status,
            cp.created_at,
            cp.line_user_id
        FROM chronic_patients cp
        WHERE cp.id = $1
    `;
    const patientParams = [patientId];

    const patientRes = await db.query(patientQuery, patientParams);

    if (!patientRes.rows[0]) {
        throw new Error('Patient not found');
    }
    const patient = patientRes.rows[0];

    // 2. Check-ins and Vitals
    // Note: check_ins uses line_user_id, not patient_id
    const checkinsRes = await db.query(`
        SELECT 
            id, 
            check_in_time,
            glucose_level as glucose,
            medication_taken, 
            symptoms,
            mood
        FROM check_ins
        WHERE line_user_id = $1 
        AND check_in_time >= $2
        ORDER BY check_in_time ASC
    `, [patient.line_user_id, startDate]);

    const checkins = checkinsRes.rows;

    // 3. Calculate Engagement
    const dailyEngagement = [];
    const dailyVitals = [];
    const dailyAdherence = [];

    // Create a map of dates with check-ins
    const checkinsByDate = {};
    checkins.forEach(c => {
        const dateKey = new Date(c.check_in_time).toDateString();
        if (!checkinsByDate[dateKey]) {
            checkinsByDate[dateKey] = [];
        }
        checkinsByDate[dateKey].push(c);
    });

    // Iterate through each day in the range
    const currentDate = new Date(startDate);
    let totalMedsTaken = 0;
    let totalMedsExpected = 0;
    let daysWithResponse = 0;

    for (let i = 0; i < timeRangeDays; i++) {
        const dateKey = currentDate.toDateString();
        const dayCheckins = checkinsByDate[dateKey] || [];
        const hasResponse = dayCheckins.length > 0;

        if (hasResponse) daysWithResponse++;

        // Engagement data
        dailyEngagement.push({
            date: formatDate(currentDate),
            responded: hasResponse
        });

        // Vitals data (use last reading of the day)
        // Note: systolic/diastolic from vitals_log, glucose from check_ins
        const lastVital = dayCheckins[dayCheckins.length - 1];
        dailyVitals.push({
            date: formatDate(currentDate),
            glucose: lastVital?.glucose || null,
            systolic: null, // BP data would come from vitals_log if needed
            diastolic: null
        });

        // Adherence data
        const dayMedsTaken = dayCheckins.filter(c => c.medication_taken === true).length;
        const dayMedsTotal = dayCheckins.filter(c => c.medication_taken !== null).length;
        totalMedsTaken += dayMedsTaken;
        totalMedsExpected += Math.max(dayMedsTotal, hasResponse ? 1 : 0);

        dailyAdherence.push({
            date: formatDate(currentDate),
            adherencePercent: dayMedsTotal > 0 ? Math.round((dayMedsTaken / dayMedsTotal) * 100) : (hasResponse ? 0 : null)
        });

        currentDate.setDate(currentDate.getDate() + 1);
    }

    // 4. Aggregate symptoms
    const symptomsAgg = {};
    checkins.forEach(c => {
        if (c.symptoms && c.symptoms !== 'none' && c.symptoms.trim() !== '') {
            const symptom = c.symptoms.toLowerCase().trim();
            symptomsAgg[symptom] = (symptomsAgg[symptom] || 0) + 1;
        }
    });
    const symptoms = Object.entries(symptomsAgg)
        .map(([name, count]) => ({ name, count }))
        .sort((a, b) => b.count - a.count);

    // 5. Calculate Trend (improving / stable / worsening)
    let trend = 'stable';
    const recentGlucose = dailyVitals.slice(-7).filter(v => v.glucose).map(v => v.glucose);
    if (recentGlucose.length >= 3) {
        const firstHalf = recentGlucose.slice(0, Math.floor(recentGlucose.length / 2));
        const secondHalf = recentGlucose.slice(Math.floor(recentGlucose.length / 2));
        const firstAvg = firstHalf.reduce((a, b) => a + b, 0) / firstHalf.length;
        const secondAvg = secondHalf.reduce((a, b) => a + b, 0) / secondHalf.length;

        if (secondAvg < firstAvg - 10) trend = 'improving';
        else if (secondAvg > firstAvg + 10) trend = 'worsening';
    }

    // 6. Nurse Tasks & Escalations
    const tasksRes = await db.query(`
        SELECT 
            id, task_type, priority, status,
            reason, title, resolved_by, resolved_at,
            created_at
        FROM nurse_tasks
        WHERE patient_id = $1 
        AND created_at >= $2
        ORDER BY created_at DESC
    `, [patientId, startDate]);

    const tasks = tasksRes.rows;
    const escalations = tasks.filter(t => t.priority === 'critical' || t.priority === 'high');
    const resolvedTasks = tasks.filter(t => t.status === 'completed' || t.resolved_at);

    // 7. Calculate overall metrics
    const engagementPercent = Math.round((daysWithResponse / timeRangeDays) * 100);
    const adherencePercent = totalMedsExpected > 0
        ? Math.round((totalMedsTaken / totalMedsExpected) * 100)
        : null;

    // 8. Detect patterns
    let adherencePattern = null;
    const weekendIndices = dailyAdherence
        .map((d, i) => ({ ...d, dayOfWeek: new Date(startDate.getTime() + i * 86400000).getDay() }))
        .filter(d => d.dayOfWeek === 0 || d.dayOfWeek === 6);

    const weekdayIndices = dailyAdherence
        .map((d, i) => ({ ...d, dayOfWeek: new Date(startDate.getTime() + i * 86400000).getDay() }))
        .filter(d => d.dayOfWeek >= 1 && d.dayOfWeek <= 5);

    const weekendAvg = weekendIndices.filter(d => d.adherencePercent !== null).length > 0
        ? weekendIndices.filter(d => d.adherencePercent !== null).reduce((a, b) => a + b.adherencePercent, 0) / weekendIndices.filter(d => d.adherencePercent !== null).length
        : null;
    const weekdayAvg = weekdayIndices.filter(d => d.adherencePercent !== null).length > 0
        ? weekdayIndices.filter(d => d.adherencePercent !== null).reduce((a, b) => a + b.adherencePercent, 0) / weekdayIndices.filter(d => d.adherencePercent !== null).length
        : null;

    if (weekendAvg !== null && weekdayAvg !== null && weekdayAvg - weekendAvg > 20) {
        adherencePattern = 'Lower adherence observed on weekends';
    }

    return {
        patient: {
            id: patient.id,
            name: patient.name,
            age: patient.age,
            condition: patient.condition,
            phone: patient.phone_number,
            status: patient.enrollment_status,
            enrolledSince: patient.created_at
        },
        timeRange: {
            days: timeRangeDays,
            startDate: startDate.toISOString(),
            endDate: new Date().toISOString()
        },
        engagement: {
            totalDays: timeRangeDays,
            daysResponded: daysWithResponse,
            missedDays: timeRangeDays - daysWithResponse,
            percentage: engagementPercent
        },
        adherence: {
            percentage: adherencePercent,
            totalTaken: totalMedsTaken,
            totalExpected: totalMedsExpected,
            pattern: adherencePattern
        },
        vitals: {
            trend,
            latestGlucose: dailyVitals.filter(v => v.glucose).pop()?.glucose || null,
            latestBP: dailyVitals.filter(v => v.systolic).pop() || null
        },
        symptoms: {
            list: symptoms,
            total: symptoms.reduce((a, b) => a + b.count, 0)
        },
        escalations: {
            total: escalations.length,
            critical: escalations.filter(e => e.priority === 'critical').length,
            high: escalations.filter(e => e.priority === 'high').length
        },
        nurseActions: {
            totalTasks: tasks.length,
            resolved: resolvedTasks.length,
            recentTasks: tasks.slice(0, 5)
        },
        // Chart data
        dailyEngagement,
        dailyVitals,
        dailyAdherence: dailyAdherence.map(d => ({
            ...d,
            adherencePercent: d.adherencePercent ?? 0
        }))
    };
};

module.exports = {
    aggregatePatientData,
    generateDateLabels
};
