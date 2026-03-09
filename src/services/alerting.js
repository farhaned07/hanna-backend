/**
 * Alerting Service
 * Sends notifications to Slack and email when system issues are detected
 */

const db = require('./db');

// Slack webhook configuration
const SLACK_WEBHOOK_URL = process.env.SLACK_WEBHOOK_URL;
const ALERT_EMAIL = process.env.ALERT_EMAIL || 'alerts@hanna.care';

/**
 * Send a Slack alert
 * @param {Object} options
 * @param {string} options.type - Alert type: 'info', 'warning', 'critical'
 * @param {string} options.title - Alert title
 * @param {string} options.message - Alert message
 * @param {Object} options.fields - Additional fields to display
 * @param {string} options.tenantId - Optional tenant ID for context
 */
async function sendSlackAlert({ type, title, message, fields = {}, tenantId = null }) {
    if (!SLACK_WEBHOOK_URL) {
        console.log(`[Alerting] Slack not configured. Alert: ${type} - ${title}`);
        return;
    }

    try {
        const color = {
            'info': '#36a64f',
            'warning': '#ffcc00',
            'critical': '#ff0000'
        }[type] || '#808080';

        const emoji = {
            'info': 'ℹ️',
            'warning': '⚠️',
            'critical': '🚨'
        }[type] || '📢';

        const payload = {
            attachments: [{
                color,
                pretext: `${emoji} *${title}*`,
                text: message,
                fields: Object.entries(fields).map(([key, value]) => ({
                    title: key,
                    value: String(value),
                    short: true
                })),
                footer: 'Hanna Alerting System',
                ts: Math.floor(Date.now() / 1000)
            }]
        };

        const response = await fetch(SLACK_WEBHOOK_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });

        if (!response.ok) {
            console.error('[Alerting] Slack send failed:', response.status);
        }

        // Log alert to database
        await logAlert({ type, title, message, fields, tenantId, channel: 'slack' });

    } catch (error) {
        console.error('[Alerting] Slack error:', error.message);
    }
}

/**
 * Send an email alert (placeholder - implement with your email provider)
 */
async function sendEmailAlert({ to, subject, body, tenantId = null }) {
    // Placeholder for email implementation
    // Can integrate with SendGrid, SES, etc.
    console.log(`[Alerting] Email alert would be sent to ${to}: ${subject}`);

    await logAlert({
        type: 'email',
        title: subject,
        message: body,
        fields: { recipient: to },
        tenantId,
        channel: 'email'
    });
}

/**
 * Log alert to database for tracking
 */
async function logAlert({ type, title, message, fields, tenantId, channel }) {
    try {
        await db.query(`
            INSERT INTO system_alerts (tenant_id, type, severity, message, metadata)
            VALUES ($1, $2, $3, $4, $5)
        `, [
            tenantId,
            channel,
            type,
            `${title}: ${message}`,
            JSON.stringify(fields || {})
        ]);
    } catch (error) {
        console.error('[Alerting] Failed to log alert:', error.message);
    }
}

/**
 * Alert: Low engagement for tenant
 */
async function alertLowEngagement(tenant, engagementRate) {
    await sendSlackAlert({
        type: 'warning',
        title: 'Low Patient Engagement',
        message: `${tenant.name} has low engagement (${engagementRate}% in last 7 days)`,
        fields: {
            'Hospital': tenant.name,
            'Engagement Rate': `${engagementRate}%`,
            'Threshold': '< 30%'
        },
        tenantId: tenant.id
    });
}

/**
 * Alert: Overdue critical task
 */
async function alertOverdueCriticalTask(task, tenant) {
    await sendSlackAlert({
        type: 'critical',
        title: 'Overdue Critical Task',
        message: `Critical task has been pending for > 4 hours`,
        fields: {
            'Hospital': tenant?.name || 'Unknown',
            'Task ID': task.id,
            'Patient': task.patient_name || 'N/A',
            'Created': new Date(task.created_at).toISOString()
        },
        tenantId: tenant?.id
    });
}

/**
 * Alert: System error rate spike
 */
async function alertErrorRateSpike(errorRate, threshold) {
    await sendSlackAlert({
        type: 'critical',
        title: 'Error Rate Spike',
        message: `API error rate has exceeded threshold`,
        fields: {
            'Current Rate': `${errorRate}%`,
            'Threshold': `${threshold}%`,
            'Time': new Date().toISOString()
        }
    });
}

/**
 * Alert: LINE API failure
 */
async function alertLineAPIFailure(error) {
    await sendSlackAlert({
        type: 'critical',
        title: 'LINE API Failure',
        message: `LINE API is not responding correctly`,
        fields: {
            'Error': error.message || 'Unknown',
            'Time': new Date().toISOString()
        }
    });
}

/**
 * Alert: Database connection issues
 */
async function alertDatabaseIssue(error) {
    await sendSlackAlert({
        type: 'critical',
        title: 'Database Connection Issue',
        message: `Database connection problems detected`,
        fields: {
            'Error': error.message || 'Unknown',
            'Time': new Date().toISOString()
        }
    });
}

/**
 * Daily health summary (scheduled)
 */
async function sendDailyHealthSummary() {
    try {
        const result = await db.query(`
            SELECT 
                (SELECT count(*) FROM tenants WHERE status = 'active') as active_tenants,
                (SELECT count(*) FROM chronic_patients WHERE enrollment_status = 'active') as active_patients,
                (SELECT count(*) FROM nurse_tasks WHERE status = 'pending') as pending_tasks,
                (SELECT count(*) FROM nurse_tasks 
                 WHERE status = 'pending' AND priority = 'critical' 
                 AND created_at < NOW() - INTERVAL '4 hours') as overdue_critical,
                (SELECT count(*) FROM check_ins WHERE check_in_time >= CURRENT_DATE - INTERVAL '1 day') as checkins_24h,
                (SELECT count(*) FROM system_alerts 
                 WHERE acknowledged_at IS NULL 
                 AND severity = 'critical') as unacked_critical_alerts
        `);

        const stats = result.rows[0];

        await sendSlackAlert({
            type: 'info',
            title: 'Daily Health Summary',
            message: `System status for ${new Date().toISOString().split('T')[0]}`,
            fields: {
                'Active Tenants': stats.active_tenants,
                'Active Patients': stats.active_patients,
                'Pending Tasks': stats.pending_tasks,
                'Overdue Critical': stats.overdue_critical,
                'Check-ins (24h)': stats.checkins_24h,
                'Unacked Critical Alerts': stats.unacked_critical_alerts
            }
        });

        // Send email if there are critical issues
        if (parseInt(stats.overdue_critical) > 0 || parseInt(stats.unacked_critical_alerts) > 0) {
            await sendEmailAlert({
                to: ALERT_EMAIL,
                subject: `⚠️ Hanna: ${stats.overdue_critical} overdue critical tasks`,
                body: `
Daily Summary - ${new Date().toISOString().split('T')[0]}

⚠️ ISSUES REQUIRING ATTENTION:
- Overdue Critical Tasks: ${stats.overdue_critical}
- Unacknowledged Critical Alerts: ${stats.unacked_critical_alerts}

📊 System Stats:
- Active Tenants: ${stats.active_tenants}
- Active Patients: ${stats.active_patients}
- Check-ins (24h): ${stats.checkins_24h}

Please review the admin dashboard for details.
                `
            });
        }

    } catch (error) {
        console.error('[Alerting] Failed to send daily summary:', error.message);
    }
}

/**
 * Run health checks and send alerts
 */
async function runHealthChecks() {
    console.log('[Alerting] Running health checks...');

    try {
        // Check for tenants with low engagement
        const engagementRes = await db.query(`
            SELECT 
                t.id, t.name, t.code,
                (SELECT count(*) FROM chronic_patients cp 
                 WHERE cp.tenant_id = t.id AND cp.enrollment_status = 'active') as active_patients,
                (SELECT count(DISTINCT cp.id)
                 FROM chronic_patients cp
                 JOIN check_ins ci ON cp.line_user_id = ci.line_user_id
                 WHERE cp.tenant_id = t.id 
                   AND ci.check_in_time >= CURRENT_DATE - INTERVAL '7 days') as engaged_7d
            FROM tenants t
            WHERE t.status = 'active'
        `);

        for (const tenant of engagementRes.rows) {
            const activePatients = parseInt(tenant.active_patients);
            const engaged = parseInt(tenant.engaged_7d);

            if (activePatients > 10) { // Only check tenants with meaningful patient counts
                const engagementRate = Math.round((engaged / activePatients) * 100);
                if (engagementRate < 30) {
                    await alertLowEngagement(tenant, engagementRate);
                }
            }
        }

        // Check for overdue critical tasks
        const overdueRes = await db.query(`
            SELECT nt.*, cp.name as patient_name, cp.tenant_id, t.name as tenant_name
            FROM nurse_tasks nt
            JOIN chronic_patients cp ON nt.patient_id = cp.id
            JOIN tenants t ON cp.tenant_id = t.id
            WHERE nt.status = 'pending'
              AND nt.priority = 'critical'
              AND nt.created_at < NOW() - INTERVAL '4 hours'
        `);

        for (const task of overdueRes.rows) {
            await alertOverdueCriticalTask(task, {
                id: task.tenant_id,
                name: task.tenant_name
            });
        }

        console.log('[Alerting] Health checks complete');

    } catch (error) {
        console.error('[Alerting] Health check failed:', error.message);
    }
}

module.exports = {
    sendSlackAlert,
    sendEmailAlert,
    alertLowEngagement,
    alertOverdueCriticalTask,
    alertErrorRateSpike,
    alertLineAPIFailure,
    alertDatabaseIssue,
    sendDailyHealthSummary,
    runHealthChecks
};
