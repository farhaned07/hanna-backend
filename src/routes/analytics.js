const express = require('express');
const router = express.Router();
const db = require('../services/db');
const tenantContext = require('../middleware/tenantContext');

// All analytics routes require tenant context
router.use(tenantContext);

/**
 * Analytics Routes
 * Provides engagement metrics, trend data, and export capabilities for hospital dashboards
 */

// GET /api/analytics/summary — Key metrics for dashboard cards
router.get('/summary', async (req, res) => {
    try {
        const tenantId = req.tenant?.id;
        const tenantFilter = tenantId ? 'AND cp.tenant_id = $1' : '';
        const params = tenantId ? [tenantId] : [];

        // Active patients
        const activeRes = await db.query(
            `SELECT count(*) FROM chronic_patients cp 
             WHERE enrollment_status = 'active' ${tenantFilter}`,
            params
        );

        // Engagement this week (patients who responded in last 7 days)
        const engagedRes = await db.query(
            `SELECT count(DISTINCT cp.id) 
             FROM chronic_patients cp
             JOIN check_ins ci ON cp.line_user_id = ci.line_user_id
             WHERE cp.enrollment_status = 'active' 
               AND ci.check_in_time >= CURRENT_DATE - INTERVAL '7 days'
               ${tenantFilter}`,
            params
        );

        // Medication adherence (check-ins with positive medication response this week)
        const adherenceRes = await db.query(
            `SELECT 
                count(*) FILTER (WHERE ci.medication_taken = true) as took_med,
                count(*) as total
             FROM check_ins ci
             JOIN chronic_patients cp ON ci.line_user_id = cp.line_user_id
             WHERE ci.check_in_time >= CURRENT_DATE - INTERVAL '7 days'
               AND ci.medication_taken IS NOT NULL
               ${tenantFilter}`,
            params
        );

        // Red flags this week
        const flagsRes = await db.query(
            `SELECT count(*) 
             FROM nurse_tasks nt
             JOIN chronic_patients cp ON nt.patient_id = cp.id
             WHERE nt.created_at >= CURRENT_DATE - INTERVAL '7 days'
               AND nt.priority IN ('critical', 'high')
               ${tenantFilter.replace('cp.tenant_id', 'cp.tenant_id')}`,
            params
        );

        // Average risk score
        const riskRes = await db.query(
            `SELECT AVG(ps.current_risk_score) as avg_risk
             FROM patient_state ps
             JOIN chronic_patients cp ON ps.patient_id = cp.id
             WHERE cp.enrollment_status = 'active'
               ${tenantFilter}`,
            params
        );

        // Tasks resolved this week
        const resolvedRes = await db.query(
            `SELECT count(*)
             FROM nurse_tasks nt
             JOIN chronic_patients cp ON nt.patient_id = cp.id
             WHERE nt.status = 'completed'
               AND nt.completed_at >= CURRENT_DATE - INTERVAL '7 days'
               ${tenantFilter.replace('cp.tenant_id', 'cp.tenant_id')}`,
            params
        );

        const activePatients = parseInt(activeRes.rows[0].count);
        const engagedPatients = parseInt(engagedRes.rows[0].count);
        const tookMed = parseInt(adherenceRes.rows[0].took_med) || 0;
        const totalMedCheckins = parseInt(adherenceRes.rows[0].total) || 1;

        res.json({
            activePatients,
            weeklyEngagement: {
                engaged: engagedPatients,
                total: activePatients,
                percentage: activePatients > 0
                    ? Math.round((engagedPatients / activePatients) * 100)
                    : 0
            },
            medicationAdherence: {
                adherent: tookMed,
                total: totalMedCheckins,
                percentage: Math.round((tookMed / totalMedCheckins) * 100)
            },
            redFlagsThisWeek: parseInt(flagsRes.rows[0].count),
            averageRiskScore: parseFloat(riskRes.rows[0].avg_risk) || 0,
            tasksResolvedThisWeek: parseInt(resolvedRes.rows[0].count)
        });

    } catch (error) {
        console.error('Error fetching analytics summary:', error);
        res.status(500).json({ error: 'Database Error' });
    }
});

// GET /api/analytics/engagement — 30-day engagement trend
router.get('/engagement', async (req, res) => {
    try {
        const tenantId = req.tenant?.id;
        const days = parseInt(req.query.days) || 30;

        const result = await db.query(`
            WITH days AS (
                SELECT generate_series(
                    CURRENT_DATE - INTERVAL '${days - 1} days',
                    CURRENT_DATE,
                    '1 day'::interval
                )::date AS date
            ),
            daily_engaged AS (
                SELECT 
                    ci.check_in_time::date as date,
                    count(DISTINCT cp.id) as engaged_count
                FROM check_ins ci
                JOIN chronic_patients cp ON ci.line_user_id = cp.line_user_id
                WHERE cp.enrollment_status = 'active'
                  ${tenantId ? 'AND cp.tenant_id = $1' : ''}
                GROUP BY ci.check_in_time::date
            ),
            daily_active AS (
                SELECT 
                    $${tenantId ? '2' : '1'}::date as ref_date,
                    (SELECT count(*) FROM chronic_patients 
                     WHERE enrollment_status = 'active' 
                     ${tenantId ? 'AND tenant_id = $1' : ''}) as total_active
            )
            SELECT 
                d.date,
                COALESCE(de.engaged_count, 0) as engaged,
                da.total_active as total
            FROM days d
            CROSS JOIN daily_active da
            LEFT JOIN daily_engaged de ON d.date = de.date
            ORDER BY d.date ASC
        `, tenantId ? [tenantId, new Date()] : [new Date()]);

        res.json({
            period: `${days} days`,
            data: result.rows.map(row => ({
                date: row.date,
                engaged: parseInt(row.engaged),
                total: parseInt(row.total),
                rate: parseInt(row.total) > 0
                    ? Math.round((parseInt(row.engaged) / parseInt(row.total)) * 100)
                    : 0
            }))
        });

    } catch (error) {
        console.error('Error fetching engagement trend:', error);
        res.status(500).json({ error: 'Database Error' });
    }
});

// GET /api/analytics/risk-distribution — Current risk level breakdown
router.get('/risk-distribution', async (req, res) => {
    try {
        const tenantId = req.tenant?.id;
        const tenantFilter = tenantId ? 'AND cp.tenant_id = $1' : '';
        const params = tenantId ? [tenantId] : [];

        const result = await db.query(`
            SELECT 
                COALESCE(ps.risk_level, 'unknown') as risk_level,
                count(*) as count
            FROM chronic_patients cp
            LEFT JOIN patient_state ps ON cp.id = ps.patient_id
            WHERE cp.enrollment_status = 'active'
              ${tenantFilter}
            GROUP BY COALESCE(ps.risk_level, 'unknown')
        `, params);

        const distribution = {
            low: 0,
            medium: 0,
            high: 0,
            critical: 0,
            unknown: 0,
            total: 0
        };

        result.rows.forEach(row => {
            const level = row.risk_level;
            const count = parseInt(row.count);
            if (distribution.hasOwnProperty(level)) {
                distribution[level] = count;
            }
            distribution.total += count;
        });

        res.json(distribution);

    } catch (error) {
        console.error('Error fetching risk distribution:', error);
        res.status(500).json({ error: 'Database Error' });
    }
});

// GET /api/analytics/daily-checkins — Daily check-in volume
router.get('/daily-checkins', async (req, res) => {
    try {
        const tenantId = req.tenant?.id;
        const days = parseInt(req.query.days) || 14;

        const result = await db.query(`
            WITH days AS (
                SELECT generate_series(
                    CURRENT_DATE - INTERVAL '${days - 1} days',
                    CURRENT_DATE,
                    '1 day'::interval
                )::date AS date
            )
            SELECT 
                d.date,
                COALESCE(
                    (SELECT count(*) 
                     FROM check_ins ci
                     JOIN chronic_patients cp ON ci.line_user_id = cp.line_user_id
                     WHERE ci.check_in_time::date = d.date
                       ${tenantId ? 'AND cp.tenant_id = $1' : ''}), 
                    0
                ) as count
            FROM days d
            ORDER BY d.date ASC
        `, tenantId ? [tenantId] : []);

        res.json({
            period: `${days} days`,
            data: result.rows.map(row => ({
                date: row.date,
                count: parseInt(row.count)
            }))
        });

    } catch (error) {
        console.error('Error fetching daily check-ins:', error);
        res.status(500).json({ error: 'Database Error' });
    }
});

// GET /api/analytics/top-risk-patients — Top N highest risk patients
router.get('/top-risk-patients', async (req, res) => {
    try {
        const tenantId = req.tenant?.id;
        const limit = parseInt(req.query.limit) || 10;

        const result = await db.query(`
            SELECT 
                cp.id,
                cp.name,
                cp.condition,
                ps.current_risk_score,
                ps.risk_level,
                ps.last_checkin_at
            FROM chronic_patients cp
            JOIN patient_state ps ON cp.id = ps.patient_id
            WHERE cp.enrollment_status = 'active'
              ${tenantId ? 'AND cp.tenant_id = $1' : ''}
            ORDER BY ps.current_risk_score DESC NULLS LAST
            LIMIT $${tenantId ? '2' : '1'}
        `, tenantId ? [tenantId, limit] : [limit]);

        res.json(result.rows);

    } catch (error) {
        console.error('Error fetching top risk patients:', error);
        res.status(500).json({ error: 'Database Error' });
    }
});

// GET /api/analytics/export/patients-csv — Export patient list as CSV
router.get('/export/patients-csv', async (req, res) => {
    try {
        const tenantId = req.tenant?.id;
        const tenantFilter = tenantId ? 'AND cp.tenant_id = $1' : '';
        const params = tenantId ? [tenantId] : [];

        const result = await db.query(`
            SELECT 
                cp.name,
                cp.age,
                cp.condition,
                cp.phone_number,
                cp.enrollment_status,
                ps.current_risk_score,
                ps.risk_level,
                ps.last_checkin_at,
                cp.created_at as enrolled_at
            FROM chronic_patients cp
            LEFT JOIN patient_state ps ON cp.id = ps.patient_id
            WHERE 1=1 ${tenantFilter}
            ORDER BY cp.name ASC
        `, params);

        // Generate CSV
        const headers = ['Name', 'Age', 'Condition', 'Phone', 'Status', 'Risk Score', 'Risk Level', 'Last Check-in', 'Enrolled'];
        const rows = result.rows.map(r => [
            r.name,
            r.age || '',
            r.condition || '',
            r.phone_number || '',
            r.enrollment_status,
            r.current_risk_score || '',
            r.risk_level || '',
            r.last_checkin_at ? new Date(r.last_checkin_at).toISOString() : '',
            new Date(r.enrolled_at).toISOString()
        ]);

        const csv = [headers.join(','), ...rows.map(r => r.map(c => `"${c}"`).join(','))].join('\n');

        const tenantCode = req.tenant?.code || 'hanna';
        const filename = `${tenantCode}_patients_${new Date().toISOString().split('T')[0]}.csv`;

        res.setHeader('Content-Type', 'text/csv');
        res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
        res.send(csv);

    } catch (error) {
        console.error('Error exporting patients CSV:', error);
        res.status(500).json({ error: 'Export failed' });
    }
});

// GET /api/analytics/export/weekly-summary — Export weekly summary as JSON (PDF generation later)
router.get('/export/weekly-summary', async (req, res) => {
    try {
        const tenantId = req.tenant?.id;
        const tenantFilter = tenantId ? 'AND cp.tenant_id = $1' : '';
        const params = tenantId ? [tenantId] : [];

        // Get summary data
        const summaryRes = await db.query(`
            SELECT 
                (SELECT count(*) FROM chronic_patients cp WHERE enrollment_status = 'active' ${tenantFilter}) as active_patients,
                (SELECT count(DISTINCT cp.id) 
                 FROM chronic_patients cp
                 JOIN check_ins ci ON cp.line_user_id = ci.line_user_id
                 WHERE cp.enrollment_status = 'active' 
                   AND ci.check_in_time >= CURRENT_DATE - INTERVAL '7 days'
                   ${tenantFilter}) as engaged_this_week,
                (SELECT count(*) 
                 FROM nurse_tasks nt
                 JOIN chronic_patients cp ON nt.patient_id = cp.id
                 WHERE nt.created_at >= CURRENT_DATE - INTERVAL '7 days'
                   ${tenantFilter.replace('cp.tenant_id', 'cp.tenant_id')}) as flags_this_week,
                (SELECT count(*) 
                 FROM nurse_tasks nt
                 JOIN chronic_patients cp ON nt.patient_id = cp.id
                 WHERE nt.status = 'completed'
                   AND nt.completed_at >= CURRENT_DATE - INTERVAL '7 days'
                   ${tenantFilter.replace('cp.tenant_id', 'cp.tenant_id')}) as resolved_this_week
        `, params);

        // Top 10 high risk
        const topRiskRes = await db.query(`
            SELECT 
                cp.name,
                cp.condition,
                ps.current_risk_score,
                ps.risk_level
            FROM chronic_patients cp
            JOIN patient_state ps ON cp.id = ps.patient_id
            WHERE cp.enrollment_status = 'active'
              ${tenantFilter}
            ORDER BY ps.current_risk_score DESC NULLS LAST
            LIMIT 10
        `, params);

        const summary = summaryRes.rows[0];

        res.json({
            reportPeriod: {
                from: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
                to: new Date().toISOString().split('T')[0]
            },
            tenant: {
                name: req.tenant?.name || 'All Hospitals',
                code: req.tenant?.code || 'SYSTEM'
            },
            metrics: {
                activePatients: parseInt(summary.active_patients),
                engagedThisWeek: parseInt(summary.engaged_this_week),
                engagementRate: parseInt(summary.active_patients) > 0
                    ? Math.round((parseInt(summary.engaged_this_week) / parseInt(summary.active_patients)) * 100)
                    : 0,
                flagsGenerated: parseInt(summary.flags_this_week),
                flagsResolved: parseInt(summary.resolved_this_week)
            },
            topRiskPatients: topRiskRes.rows,
            generatedAt: new Date().toISOString()
        });

    } catch (error) {
        console.error('Error generating weekly summary:', error);
        res.status(500).json({ error: 'Summary generation failed' });
    }
});

module.exports = router;
