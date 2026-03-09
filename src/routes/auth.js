const express = require('express');
const router = express.Router();
const db = require('../services/db');

/**
 * Auth Routes
 * Handles token verification for dashboard login
 */

// POST /api/auth/verify — Verify auth token and return tenant/staff info
router.post('/verify', async (req, res) => {
    const { token } = req.body;

    if (!token) {
        return res.status(400).json({
            valid: false,
            error: 'Token is required'
        });
    }

    try {
        // Check for legacy system admin token
        const legacyToken = process.env.NURSE_DASHBOARD_TOKEN;
        if (legacyToken && token === legacyToken) {
            return res.json({
                valid: true,
                isSystemAdmin: true,
                tenant: null,
                staff: {
                    id: null,
                    name: 'System Administrator',
                    role: 'admin'
                }
            });
        }

        // Lookup staff by token
        const result = await db.query(`
            SELECT 
                s.id as staff_id,
                s.name as staff_name,
                s.email as staff_email,
                s.role,
                s.permissions,
                t.id as tenant_id,
                t.name as tenant_name,
                t.code as tenant_code,
                t.type as tenant_type,
                t.settings as tenant_settings,
                ct.id as care_team_id,
                ct.name as care_team_name,
                p.id as program_id,
                p.name as program_name
            FROM staff s
            JOIN tenants t ON s.tenant_id = t.id
            LEFT JOIN care_teams ct ON s.care_team_id = ct.id
            LEFT JOIN programs p ON ct.program_id = p.id
            WHERE s.auth_token_hash = $1 
              AND s.status = 'active'
              AND t.status = 'active'
        `, [token]);

        if (result.rows.length === 0) {
            return res.status(401).json({
                valid: false,
                error: 'Invalid or expired token'
            });
        }

        const row = result.rows[0];

        // Update last login
        await db.query(
            'UPDATE staff SET last_login = NOW() WHERE id = $1',
            [row.staff_id]
        );

        res.json({
            valid: true,
            isSystemAdmin: false,
            tenant: {
                id: row.tenant_id,
                name: row.tenant_name,
                code: row.tenant_code,
                type: row.tenant_type,
                settings: row.tenant_settings || {}
            },
            staff: {
                id: row.staff_id,
                name: row.staff_name,
                email: row.staff_email,
                role: row.role,
                permissions: row.permissions || {}
            },
            careTeam: row.care_team_id ? {
                id: row.care_team_id,
                name: row.care_team_name
            } : null,
            program: row.program_id ? {
                id: row.program_id,
                name: row.program_name
            } : null
        });

    } catch (error) {
        console.error('Token verification error:', error);
        res.status(500).json({
            valid: false,
            error: 'Verification failed'
        });
    }
});

// POST /api/auth/logout — Invalidate session (for future session tracking)
router.post('/logout', (req, res) => {
    // For token-based auth, logout is handled client-side
    // This endpoint is a placeholder for future session invalidation
    res.json({ success: true });
});

module.exports = router;
