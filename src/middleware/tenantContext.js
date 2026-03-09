const db = require('../services/db');

/**
 * Tenant Context Middleware
 * Enforces authentication and extracts tenant/staff context.
 * Supports legacy NURSE_DASHBOARD_TOKEN for backward compatibility/admin access.
 */
const tenantContext = async (req, res, next) => {
    const tokenHeader = req.headers['authorization'];
    if (!tokenHeader) {
        return res.status(401).json({ error: 'Missing Authorization Header' });
    }

    const token = tokenHeader.replace('Bearer ', '');
    const legacyToken = process.env.NURSE_DASHBOARD_TOKEN;

    // 1. Check for Legacy/System Admin Token
    if (legacyToken && token === legacyToken) {
        req.auth = {
            type: 'system',
            role: 'admin',
            staffId: null
        };
        // For legacy, we might not have a tenant. 
        // We can assign a 'wildcard' or handle it in the routes.
        // For now, we set a flag.
        req.isSystemAdmin = true;
        // req.tenant is undefined, implying "global" access if not handled strictly
        return next();
    }

    // 2. Check Database for Staff Token (Multi-Tenant)
    // Note: In a real prod environment, we should hash the token before lookup.
    // For this implementation plan, we assume the token sent IS the lookup key (or we hash it here).
    try {
        const query = `
            SELECT s.id, s.tenant_id, s.care_team_id, s.role, s.permissions, t.name as tenant_name
            FROM staff s
            JOIN tenants t ON s.tenant_id = t.id
            WHERE s.auth_token_hash = $1 AND s.status = 'active'
        `;
        const result = await db.query(query, [token]);

        if (result.rows.length === 0) {
            return res.status(403).json({ error: 'Invalid Token' });
        }

        const staff = result.rows[0];

        req.auth = {
            type: 'staff',
            staffId: staff.id,
            role: staff.role
        };

        req.tenant = {
            id: staff.tenant_id,
            name: staff.tenant_name,
            careTeamId: staff.care_team_id,
            permissions: staff.permissions || {}
        };

        next();

    } catch (err) {
        console.error('Auth Middleware Error:', err);
        return res.status(500).json({ error: 'Authentication Failed' });
    }
};

module.exports = tenantContext;
