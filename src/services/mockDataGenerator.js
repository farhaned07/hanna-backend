/**
 * Mock Data Generator for PDF Testing
 * Use this to test PDF generation locally without database
 */

/**
 * Generate mock patient data for PDF testing
 * @param {string} patientId 
 * @param {number} timeRangeDays 
 * @returns {Object} Mock aggregated data
 */
const generateMockData = (patientId, timeRangeDays) => {
    const now = new Date();
    const startDate = new Date(now.getTime() - timeRangeDays * 24 * 60 * 60 * 1000);

    // Generate daily data arrays
    const dailyEngagement = [];
    const dailyVitals = [];
    const dailyAdherence = [];

    let daysResponded = 0;
    let totalMedsTaken = 0;
    let totalMedsExpected = 0;

    for (let i = 0; i < timeRangeDays; i++) {
        const date = new Date(startDate.getTime() + i * 24 * 60 * 60 * 1000);
        const dateStr = date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });

        // 80% chance of responding
        const responded = Math.random() > 0.2;
        if (responded) daysResponded++;

        dailyEngagement.push({ date: dateStr, responded });

        // Generate realistic vitals (with some missing days)
        const hasVitals = responded && Math.random() > 0.3;
        dailyVitals.push({
            date: dateStr,
            glucose: hasVitals ? Math.floor(90 + Math.random() * 80) : null, // 90-170
            systolic: hasVitals ? Math.floor(110 + Math.random() * 40) : null, // 110-150
            diastolic: hasVitals ? Math.floor(70 + Math.random() * 20) : null // 70-90
        });

        // Adherence data
        const tookMeds = responded && Math.random() > 0.15;
        if (responded) {
            totalMedsExpected++;
            if (tookMeds) totalMedsTaken++;
        }
        dailyAdherence.push({
            date: dateStr,
            adherencePercent: responded ? (tookMeds ? 100 : 0) : 0
        });
    }

    // Mock symptoms
    const symptomPool = ['headache', 'fatigue', 'dizziness', 'nausea', 'joint pain'];
    const symptoms = symptomPool
        .slice(0, Math.floor(Math.random() * 3) + 1)
        .map(name => ({ name, count: Math.floor(Math.random() * 5) + 1 }));

    // Mock nurse tasks
    const taskTypes = ['follow_up', 'medication_review', 'vital_check', 'symptom_assessment'];
    const priorities = ['normal', 'high', 'critical'];
    const recentTasks = Array.from({ length: Math.floor(Math.random() * 4) + 1 }, (_, i) => ({
        id: `task-${i}`,
        task_type: taskTypes[Math.floor(Math.random() * taskTypes.length)],
        priority: priorities[Math.floor(Math.random() * priorities.length)],
        reason: 'Routine monitoring and patient follow-up',
        title: 'Patient Care Task',
        resolved_at: Math.random() > 0.3 ? new Date().toISOString() : null,
        created_at: new Date(now.getTime() - Math.random() * 7 * 24 * 60 * 60 * 1000).toISOString()
    }));

    const engagementPercent = Math.round((daysResponded / timeRangeDays) * 100);
    const adherencePercent = totalMedsExpected > 0
        ? Math.round((totalMedsTaken / totalMedsExpected) * 100)
        : null;

    return {
        patient: {
            id: patientId,
            name: 'สมชาย ใจดี (Mock Patient)',
            age: 58,
            condition: 'Type 2 Diabetes, Hypertension',
            phone: '081-234-5678',
            status: 'active',
            enrolledSince: new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000).toISOString()
        },
        timeRange: {
            days: timeRangeDays,
            startDate: startDate.toISOString(),
            endDate: now.toISOString()
        },
        engagement: {
            totalDays: timeRangeDays,
            daysResponded,
            missedDays: timeRangeDays - daysResponded,
            percentage: engagementPercent
        },
        adherence: {
            percentage: adherencePercent,
            totalTaken: totalMedsTaken,
            totalExpected: totalMedsExpected,
            pattern: Math.random() > 0.7 ? 'Lower adherence observed on weekends' : null
        },
        vitals: {
            trend: ['improving', 'stable', 'worsening'][Math.floor(Math.random() * 3)],
            latestGlucose: dailyVitals.filter(v => v.glucose).pop()?.glucose || null,
            latestBP: dailyVitals.filter(v => v.systolic).pop() || null
        },
        symptoms: {
            list: symptoms,
            total: symptoms.reduce((a, b) => a + b.count, 0)
        },
        escalations: {
            total: Math.floor(Math.random() * 3),
            critical: Math.floor(Math.random() * 2),
            high: Math.floor(Math.random() * 2)
        },
        nurseActions: {
            totalTasks: recentTasks.length,
            resolved: recentTasks.filter(t => t.resolved_at).length,
            recentTasks
        },
        dailyEngagement,
        dailyVitals,
        dailyAdherence
    };
};

module.exports = { generateMockData };
