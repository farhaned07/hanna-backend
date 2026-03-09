const express = require('express');
const router = express.Router();
const db = require('../services/db');

/**
 * Super Admin Routes
 * Cross-tenant administration for Hanna operations team
 * 
 * Access: System admin token only (NURSE_DASHBOARD_TOKEN)
 */

// System admin authentication middleware
const requireSystemAdmin = (req, res, next) => {
    const token = req.headers['authorization']?.replace('Bearer ', '');
    const systemToken = process.env.NURSE_DASHBOARD_TOKEN || process.env.ADMIN_API_TOKEN;

    if (!token || token !== systemToken) {
        return res.status(403).json({
            error: 'System admin access required',
            hint: 'This endpoint requires the system admin token'
        });
    }

    req.isSystemAdmin = true;
    next();
};

router.use(requireSystemAdmin);

// GET /api/superadmin/tenants — List all tenants with summary stats
router.get('/tenants', async (req, res) => {
    try {
        const result = await db.query(`
            SELECT 
                t.id,
                t.name,
                t.code,
                t.type,
                t.status,
                t.created_at,
                (SELECT count(*) FROM chronic_patients cp 
                 WHERE cp.tenant_id = t.id AND cp.enrollment_status = 'active') as active_patients,
                (SELECT count(*) FROM staff s 
                 WHERE s.tenant_id = t.id AND s.status = 'active') as active_staff,
                (SELECT count(*) FROM nurse_tasks nt
                 JOIN chronic_patients cp ON nt.patient_id = cp.id
                 WHERE cp.tenant_id = t.id AND nt.status = 'pending') as pending_tasks,
                (SELECT count(DISTINCT cp.id)
                 FROM chronic_patients cp
                 JOIN check_ins ci ON cp.line_user_id = ci.line_user_id
                 WHERE cp.tenant_id = t.id 
                   AND ci.check_in_time >= CURRENT_DATE - INTERVAL '7 days') as engaged_this_week
            FROM tenants t
            ORDER BY t.created_at DESC
        `);

        const tenants = result.rows.map(t => ({
            ...t,
            active_patients: parseInt(t.active_patients),
            active_staff: parseInt(t.active_staff),
            pending_tasks: parseInt(t.pending_tasks),
            engaged_this_week: parseInt(t.engaged_this_week),
            engagement_rate: parseInt(t.active_patients) > 0
                ? Math.round((parseInt(t.engaged_this_week) / parseInt(t.active_patients)) * 100)
                : 0,
            health: getHealthStatus(parseInt(t.pending_tasks), parseInt(t.engaged_this_week), parseInt(t.active_patients))
        }));

        res.json({
            count: tenants.length,
            tenants
        });

    } catch (error) {
        console.error('Error fetching tenants:', error);
        res.status(500).json({ error: 'Database Error' });
    }
});

// GET /api/superadmin/tenants/:id — Detailed stats for one tenant
router.get('/tenants/:id', async (req, res) => {
    try {
        const { id } = req.params;

        // Tenant info
        const tenantRes = await db.query(`
            SELECT * FROM tenants WHERE id = $1
        `, [id]);

        if (tenantRes.rows.length === 0) {
            return res.status(404).json({ error: 'Tenant not found' });
        }

        const tenant = tenantRes.rows[0];

        // Detailed stats
        const statsRes = await db.query(`
            SELECT 
                (SELECT count(*) FROM chronic_patients WHERE tenant_id = $1 AND enrollment_status = 'active') as active_patients,
                (SELECT count(*) FROM chronic_patients WHERE tenant_id = $1) as total_patients,
                (SELECT count(*) FROM staff WHERE tenant_id = $1 AND status = 'active') as active_staff,
                (SELECT count(*) FROM nurse_tasks nt 
                 JOIN chronic_patients cp ON nt.patient_id = cp.id 
                 WHERE cp.tenant_id = $1 AND nt.status = 'pending') as pending_tasks,
                (SELECT count(*) FROM nurse_tasks nt 
                 JOIN chronic_patients cp ON nt.patient_id = cp.id 
                 WHERE cp.tenant_id = $1 AND nt.status = 'completed' 
                   AND nt.completed_at >= CURRENT_DATE - INTERVAL '7 days') as resolved_this_week,
                (SELECT count(*) FROM check_ins ci
                 JOIN chronic_patients cp ON ci.line_user_id = cp.line_user_id
                 WHERE cp.tenant_id = $1 
                   AND ci.check_in_time >= CURRENT_DATE - INTERVAL '7 days') as checkins_this_week
        `, [id]);

        // Risk distribution
        const riskRes = await db.query(`
            SELECT 
                COALESCE(ps.risk_level, 'unknown') as risk_level,
                count(*) as count
            FROM chronic_patients cp
            LEFT JOIN patient_state ps ON cp.id = ps.patient_id
            WHERE cp.tenant_id = $1 AND cp.enrollment_status = 'active'
            GROUP BY COALESCE(ps.risk_level, 'unknown')
        `, [id]);

        // Programs
        const programsRes = await db.query(`
            SELECT id, name, status FROM programs WHERE tenant_id = $1
        `, [id]);

        // Staff list
        const staffRes = await db.query(`
            SELECT id, name, email, role, last_login, status
            FROM staff WHERE tenant_id = $1
            ORDER BY last_login DESC NULLS LAST
        `, [id]);

        const stats = statsRes.rows[0];

        res.json({
            tenant,
            stats: {
                activePatients: parseInt(stats.active_patients),
                totalPatients: parseInt(stats.total_patients),
                activeStaff: parseInt(stats.active_staff),
                pendingTasks: parseInt(stats.pending_tasks),
                resolvedThisWeek: parseInt(stats.resolved_this_week),
                checkinsThisWeek: parseInt(stats.checkins_this_week)
            },
            riskDistribution: riskRes.rows.reduce((acc, row) => {
                acc[row.risk_level] = parseInt(row.count);
                return acc;
            }, {}),
            programs: programsRes.rows,
            staff: staffRes.rows
        });

    } catch (error) {
        console.error('Error fetching tenant details:', error);
        res.status(500).json({ error: 'Database Error' });
    }
});

// GET /api/superadmin/usage-summary — Billing-ready usage data
router.get('/usage-summary', async (req, res) => {
    try {
        const month = req.query.month || new Date().toISOString().substring(0, 7); // YYYY-MM

        const result = await db.query(`
            SELECT 
                t.id as tenant_id,
                t.name as tenant_name,
                t.code as tenant_code,
                (SELECT count(*) FROM chronic_patients cp 
                 WHERE cp.tenant_id = t.id AND cp.enrollment_status = 'active') as active_patients,
                (SELECT count(*) FROM check_ins ci
                 JOIN chronic_patients cp ON ci.line_user_id = cp.line_user_id
                 WHERE cp.tenant_id = t.id 
                   AND to_char(ci.check_in_time, 'YYYY-MM') = $1) as checkins_this_month,
                (SELECT count(*) FROM nurse_tasks nt
                 JOIN chronic_patients cp ON nt.patient_id = cp.id
                 WHERE cp.tenant_id = t.id 
                   AND to_char(nt.created_at, 'YYYY-MM') = $1) as tasks_this_month
            FROM tenants t
            WHERE t.status = 'active'
            ORDER BY t.name
        `, [month]);

        // Calculate estimated billing (example: ฿99/patient/month)
        const RATE_PER_PATIENT = 99;

        const usage = result.rows.map(row => ({
            tenantId: row.tenant_id,
            tenantName: row.tenant_name,
            tenantCode: row.tenant_code,
            activePatients: parseInt(row.active_patients),
            checkinsThisMonth: parseInt(row.checkins_this_month),
            tasksThisMonth: parseInt(row.tasks_this_month),
            estimatedBilling: parseInt(row.active_patients) * RATE_PER_PATIENT
        }));

        const totals = usage.reduce((acc, u) => ({
            totalPatients: acc.totalPatients + u.activePatients,
            totalCheckins: acc.totalCheckins + u.checkinsThisMonth,
            totalTasks: acc.totalTasks + u.tasksThisMonth,
            totalBilling: acc.totalBilling + u.estimatedBilling
        }), { totalPatients: 0, totalCheckins: 0, totalTasks: 0, totalBilling: 0 });

        res.json({
            month,
            ratePerPatient: RATE_PER_PATIENT,
            tenants: usage,
            totals
        });

    } catch (error) {
        console.error('Error fetching usage summary:', error);
        res.status(500).json({ error: 'Database Error' });
    }
});

// GET /api/superadmin/health-overview — System-wide health metrics
router.get('/health-overview', async (req, res) => {
    try {
        const result = await db.query(`
            SELECT 
                (SELECT count(*) FROM tenants WHERE status = 'active') as active_tenants,
                (SELECT count(*) FROM chronic_patients WHERE enrollment_status = 'active') as total_active_patients,
                (SELECT count(*) FROM staff WHERE status = 'active') as total_active_staff,
                (SELECT count(*) FROM nurse_tasks WHERE status = 'pending') as total_pending_tasks,
                (SELECT count(*) FROM nurse_tasks 
                 WHERE status = 'pending' 
                   AND priority = 'critical' 
                   AND created_at < NOW() - INTERVAL '4 hours') as overdue_critical_tasks,
                (SELECT count(*) FROM check_ins 
                 WHERE check_in_time >= CURRENT_DATE) as checkins_today,
                (SELECT count(*) FROM audit_log 
                 WHERE action = 'CALCULATE_RISK' 
                   AND timestamp >= CURRENT_DATE) as ai_analyses_today
        `);

        const stats = result.rows[0];

        // Tenants needing attention (low engagement or overdue tasks)
        const attentionRes = await db.query(`
            SELECT 
                t.id,
                t.name,
                t.code,
                (SELECT count(*) FROM chronic_patients cp 
                 WHERE cp.tenant_id = t.id AND cp.enrollment_status = 'active') as active_patients,
                (SELECT count(DISTINCT cp.id)
                 FROM chronic_patients cp
                 JOIN check_ins ci ON cp.line_user_id = ci.line_user_id
                 WHERE cp.tenant_id = t.id 
                   AND ci.check_in_time >= CURRENT_DATE - INTERVAL '3 days') as engaged_3d,
                (SELECT count(*) FROM nurse_tasks nt
                 JOIN chronic_patients cp ON nt.patient_id = cp.id
                 WHERE cp.tenant_id = t.id 
                   AND nt.status = 'pending'
                   AND nt.priority IN ('critical', 'high')
                   AND nt.created_at < NOW() - INTERVAL '24 hours') as overdue_high_priority
            FROM tenants t
            WHERE t.status = 'active'
        `);

        const needsAttention = attentionRes.rows
            .filter(t => {
                const activePatients = parseInt(t.active_patients);
                const engaged = parseInt(t.engaged_3d);
                const overdue = parseInt(t.overdue_high_priority);

                // Flag if engagement < 30% or has overdue high-priority tasks
                return (activePatients > 0 && (engaged / activePatients) < 0.3) || overdue > 0;
            })
            .map(t => ({
                id: t.id,
                name: t.name,
                code: t.code,
                activePatients: parseInt(t.active_patients),
                engaged3Days: parseInt(t.engaged_3d),
                engagementRate: parseInt(t.active_patients) > 0
                    ? Math.round((parseInt(t.engaged_3d) / parseInt(t.active_patients)) * 100)
                    : 0,
                overdueHighPriority: parseInt(t.overdue_high_priority),
                issues: []
            }))
            .map(t => {
                if (t.engagementRate < 30 && t.activePatients > 0) {
                    t.issues.push(`Low engagement (${t.engagementRate}%)`);
                }
                if (t.overdueHighPriority > 0) {
                    t.issues.push(`${t.overdueHighPriority} overdue high-priority tasks`);
                }
                return t;
            });

        res.json({
            overview: {
                activeTenants: parseInt(stats.active_tenants),
                totalActivePatients: parseInt(stats.total_active_patients),
                totalActiveStaff: parseInt(stats.total_active_staff),
                totalPendingTasks: parseInt(stats.total_pending_tasks),
                overdueCriticalTasks: parseInt(stats.overdue_critical_tasks),
                checkinsToday: parseInt(stats.checkins_today),
                aiAnalysesToday: parseInt(stats.ai_analyses_today)
            },
            needsAttention,
            serverTime: new Date().toISOString()
        });

    } catch (error) {
        console.error('Error fetching health overview:', error);
        res.status(500).json({ error: 'Database Error' });
    }
});

// POST /api/superadmin/tenants/:id/toggle-status — Activate/deactivate tenant
router.post('/tenants/:id/toggle-status', async (req, res) => {
    try {
        const { id } = req.params;
        const { status } = req.body;

        if (!['active', 'inactive', 'suspended'].includes(status)) {
            return res.status(400).json({
                error: 'Invalid status',
                validStatuses: ['active', 'inactive', 'suspended']
            });
        }

        const result = await db.query(`
            UPDATE tenants SET status = $1 WHERE id = $2 RETURNING *
        `, [status, id]);

        if (result.rows.length === 0) {
            return res.status(404).json({ error: 'Tenant not found' });
        }

        // Audit log
        await db.query(`
            INSERT INTO audit_log (actor, action, details, timestamp)
            VALUES ($1, $2, $3, NOW())
        `, [
            'system_admin',
            'TENANT_STATUS_CHANGED',
            JSON.stringify({ tenant_id: id, new_status: status })
        ]);

        res.json({
            success: true,
            tenant: result.rows[0]
        });

    } catch (error) {
        console.error('Error toggling tenant status:', error);
        res.status(500).json({ error: 'Database Error' });
    }
});

// Helper function to determine tenant health status
function getHealthStatus(pendingTasks, engagedThisWeek, activePatients) {
    if (pendingTasks > 10) return 'warning';
    if (activePatients > 0 && (engagedThisWeek / activePatients) < 0.3) return 'warning';
    if (activePatients === 0) return 'inactive';
    return 'healthy';
}

module.exports = router;
