const express = require('express');
const router = express.Router();
const multer = require('multer');
const csv = require('csv-parser');
const { Readable } = require('stream');
const crypto = require('crypto');
const line = require('../services/line');
const db = require('../services/db');
const tenantContext = require('../middleware/tenantContext');

// Configure multer for file uploads
const upload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: 5 * 1024 * 1024 }, // 5MB limit
    fileFilter: (req, file, cb) => {
        if (file.mimetype === 'text/csv' || file.originalname.endsWith('.csv')) {
            cb(null, true);
        } else {
            cb(new Error('Only CSV files are allowed'), false);
        }
    }
});

// Legacy AUTH MIDDLEWARE (for backward compatibility with system admin)
const checkAdminAuth = (req, res, next) => {
    const token = req.headers['authorization'];
    if (!token) {
        return res.status(401).json({ error: 'Missing Authorization Header' });
    }
    // Use the same token as Nurse Dashboard, or a separate ADMIN_API_TOKEN
    const expected = `Bearer ${process.env.NURSE_DASHBOARD_TOKEN || process.env.ADMIN_API_TOKEN}`;
    if (token !== expected) {
        return res.status(403).json({ error: 'Invalid Token' });
    }
    req.isSystemAdmin = true;
    next();
};

// Debug endpoint to check current image file (PUBLIC)
router.get('/debug/richmenu', (req, res) => {
    const path = require('path');
    const imagePath = path.join(__dirname, '../../assets/richmenu.jpg');
    res.sendFile(imagePath);
});

// Force Setup Rich Menu (Web Trigger)
router.get('/force-setup-richmenu', async (req, res) => {
    const secret = req.query.secret;
    const expectedSecret = process.env.ADMIN_SECRET || 'CHANGE_ME_IN_PRODUCTION';

    if (secret !== expectedSecret) {
        return res.status(403).json({ error: 'Invalid Secret' });
    }

    try {
        const { createRichMenu, setDefaultRichMenu, listRichMenus, deleteRichMenu, uploadRichMenuImage, unlinkDefaultRichMenu } = require('../services/richMenu');
        const { generateRichMenuImage } = require('../utils/imageGenerator');
        const path = require('path');

        // 1. Unlink
        await unlinkDefaultRichMenu().catch(e => console.warn('Unlink failed:', e.message));

        // 2. Cleanup old
        const existing = await listRichMenus();
        for (const menu of existing) {
            await deleteRichMenu(menu.richMenuId);
        }

        // 3. Generate Image Path (Static Asset)
        // ensure generator uses correct logic (it does now)
        const imagePath = generateRichMenuImage();

        // 4. Create & Upload
        const richMenuId = await createRichMenu();
        await uploadRichMenuImage(richMenuId, imagePath);
        await setDefaultRichMenu(richMenuId);

        res.json({ success: true, message: 'Rich Menu Force Setup Complete', richMenuId });
    } catch (error) {
        console.error('Force setup failed:', error);
        res.status(500).json({ error: error.message });
    }
});

// Legacy route - protected by checkAdminAuth (system admin only)
router.post('/notify-activation', checkAdminAuth, async (req, res) => {
    const { userId, name } = req.body;

    if (!userId) {
        return res.status(400).json({ error: 'Missing userId' });
    }

    try {
        await line.pushMessage(userId, {
            type: 'text',
            text: `🎉 ยินดีด้วยค่ะ คุณ${name || ''}! \n\nการชำระเงินได้รับการอนุมัติแล้ว ✅\nตอนนี้คุณสามารถใช้งานฟีเจอร์ Premium ได้เต็มรูปแบบเลยค่ะ\n\nเริ่มจากการวัดน้ำตาลวันนี้ได้เลยนะคะ 💪`
        });

        res.json({ success: true });
    } catch (error) {
        console.error('Error sending activation message:', error);
        res.status(500).json({ error: 'Failed to send message' });
    }
});

// ============================================================
// MULTI-TENANT ADMIN ROUTES (Protected by tenantContext)
// ============================================================

// Switch to tenant context middleware for remaining routes
router.use(tenantContext);

// Helper: Check if user has admin role
const requireAdmin = (req, res, next) => {
    if (req.isSystemAdmin) return next();
    if (req.auth?.role !== 'admin') {
        return res.status(403).json({ error: 'Admin role required' });
    }
    next();
};

// ============================================================
// BULK PATIENT UPLOAD
// ============================================================

// GET /api/admin/patients/template — Download CSV template
router.get('/patients/template', (req, res) => {
    const template = `line_user_id,name,age,condition,phone_number
U1234567890abcdef,สมชาย ใจดี,65,diabetes,0891234567
U0987654321fedcba,สมหญิง รักดี,58,hypertension,0812345678`;

    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', 'attachment; filename=patient_upload_template.csv');
    res.send(template);
});

// POST /api/admin/patients/bulk-upload — Bulk upload patients from CSV
router.post('/patients/bulk-upload', requireAdmin, upload.single('file'), async (req, res) => {
    if (!req.file) {
        return res.status(400).json({ error: 'No CSV file uploaded' });
    }

    // Get tenant context
    const tenantId = req.tenant?.id || null;
    const programId = req.tenant?.programId || null;
    const careTeamId = req.tenant?.careTeamId || null;

    // For system admin, require explicit tenant_id in body
    if (req.isSystemAdmin && !tenantId && !req.body.tenant_id) {
        return res.status(400).json({
            error: 'System admin must specify tenant_id in request body'
        });
    }

    const effectiveTenantId = tenantId || req.body.tenant_id;

    // Parse CSV from buffer
    const patients = [];
    const errors = [];
    let rowNum = 0;

    try {
        await new Promise((resolve, reject) => {
            const stream = Readable.from(req.file.buffer.toString('utf-8'));
            stream
                .pipe(csv())
                .on('data', (row) => {
                    rowNum++;

                    // Validate required fields
                    if (!row.line_user_id) {
                        errors.push({ row: rowNum, error: 'Missing line_user_id' });
                        return;
                    }
                    if (!row.name) {
                        errors.push({ row: rowNum, error: 'Missing name' });
                        return;
                    }

                    // Validate LINE user ID format (starts with U, 33 chars)
                    if (!/^U[a-f0-9]{32}$/i.test(row.line_user_id)) {
                        errors.push({ row: rowNum, error: 'Invalid line_user_id format' });
                        return;
                    }

                    patients.push({
                        line_user_id: row.line_user_id.trim(),
                        name: row.name.trim(),
                        age: row.age ? parseInt(row.age) : null,
                        condition: row.condition?.trim() || null,
                        phone_number: row.phone_number?.trim() || null
                    });
                })
                .on('end', resolve)
                .on('error', reject);
        });

        if (patients.length === 0) {
            return res.status(400).json({
                error: 'No valid patients in CSV',
                validationErrors: errors
            });
        }

        // Lookup program and care team for tenant if not provided
        let effectiveProgramId = programId;
        let effectiveCareTeamId = careTeamId;

        if (!effectiveProgramId) {
            const programRes = await db.query(
                'SELECT id FROM programs WHERE tenant_id = $1 LIMIT 1',
                [effectiveTenantId]
            );
            effectiveProgramId = programRes.rows[0]?.id;
        }

        if (!effectiveCareTeamId && effectiveProgramId) {
            const teamRes = await db.query(
                'SELECT id FROM care_teams WHERE program_id = $1 LIMIT 1',
                [effectiveProgramId]
            );
            effectiveCareTeamId = teamRes.rows[0]?.id;
        }

        // Bulk insert with ON CONFLICT
        let inserted = 0;
        let skipped = 0;

        for (const patient of patients) {
            try {
                const result = await db.query(`
                    INSERT INTO chronic_patients 
                        (line_user_id, name, age, condition, phone_number, 
                         tenant_id, program_id, care_team_id, 
                         enrollment_status, created_at, updated_at)
                    VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'active', NOW(), NOW())
                    ON CONFLICT (line_user_id) DO NOTHING
                    RETURNING id
                `, [
                    patient.line_user_id,
                    patient.name,
                    patient.age,
                    patient.condition,
                    patient.phone_number,
                    effectiveTenantId,
                    effectiveProgramId,
                    effectiveCareTeamId
                ]);

                if (result.rows.length > 0) {
                    inserted++;
                } else {
                    skipped++;
                }
            } catch (err) {
                errors.push({
                    row: patients.indexOf(patient) + 2,
                    line_user_id: patient.line_user_id,
                    error: err.message
                });
            }
        }

        // Audit log
        await db.query(`
            INSERT INTO audit_log (actor, action, details, timestamp)
            VALUES ($1, $2, $3, NOW())
        `, [
            req.auth?.staffId || 'system_admin',
            'BULK_PATIENT_UPLOAD',
            JSON.stringify({
                tenant_id: effectiveTenantId,
                inserted,
                skipped,
                errors: errors.length,
                filename: req.file.originalname
            })
        ]);

        res.json({
            success: true,
            inserted,
            skipped,
            errors: errors.length,
            validationErrors: errors.slice(0, 10) // Return first 10 errors only
        });

    } catch (error) {
        console.error('Bulk upload error:', error);
        res.status(500).json({ error: 'Failed to process CSV: ' + error.message });
    }
});

// ============================================================
// STAFF MANAGEMENT
// ============================================================

// GET /api/admin/staff — List staff for tenant
router.get('/staff', requireAdmin, async (req, res) => {
    try {
        const tenantId = req.tenant?.id;

        let query = `
            SELECT id, email, name, role, status, created_at, last_login
            FROM staff
            WHERE status = 'active'
        `;
        const params = [];

        if (tenantId) {
            query += ' AND tenant_id = $1';
            params.push(tenantId);
        }

        query += ' ORDER BY created_at DESC';

        const result = await db.query(query, params);
        res.json(result.rows);
    } catch (error) {
        console.error('Error fetching staff:', error);
        res.status(500).json({ error: 'Database Error' });
    }
});

// POST /api/admin/staff — Create new staff member
router.post('/staff', requireAdmin, async (req, res) => {
    const { email, name, role } = req.body;
    const tenantId = req.tenant?.id || req.body.tenant_id;

    if (!email || !name || !role) {
        return res.status(400).json({ error: 'Missing required fields: email, name, role' });
    }

    const validRoles = ['nurse', 'supervisor', 'admin', 'viewer'];
    if (!validRoles.includes(role)) {
        return res.status(400).json({ error: 'Invalid role. Must be: ' + validRoles.join(', ') });
    }

    if (!tenantId) {
        return res.status(400).json({ error: 'Tenant context required' });
    }

    try {
        // Check for existing staff with same email in tenant
        const existing = await db.query(
            'SELECT id FROM staff WHERE tenant_id = $1 AND email = $2',
            [tenantId, email]
        );

        if (existing.rows.length > 0) {
            return res.status(409).json({ error: 'Staff with this email already exists' });
        }

        // Get default care team for tenant
        const teamRes = await db.query(`
            SELECT ct.id FROM care_teams ct
            JOIN programs p ON ct.program_id = p.id
            WHERE p.tenant_id = $1
            LIMIT 1
        `, [tenantId]);

        const careTeamId = teamRes.rows[0]?.id;

        // Generate auth token
        const tenantCode = req.tenant?.code || 'hnn';
        const authToken = `${tenantCode.toLowerCase()}_${crypto.randomBytes(32).toString('hex')}`;

        // Create staff
        const result = await db.query(`
            INSERT INTO staff (tenant_id, care_team_id, email, name, role, auth_token_hash, status)
            VALUES ($1, $2, $3, $4, $5, $6, 'active')
            RETURNING id, email, name, role, created_at
        `, [tenantId, careTeamId, email, name, role, authToken]);

        const staff = result.rows[0];

        // Audit log
        await db.query(`
            INSERT INTO audit_log (actor, action, details, timestamp)
            VALUES ($1, $2, $3, NOW())
        `, [
            req.auth?.staffId || 'system_admin',
            'STAFF_CREATED',
            JSON.stringify({ staff_id: staff.id, email, role, tenant_id: tenantId })
        ]);

        res.status(201).json({
            ...staff,
            authToken // Return token ONCE - client should display and warn user to save it
        });

    } catch (error) {
        console.error('Error creating staff:', error);
        res.status(500).json({ error: 'Database Error' });
    }
});

// PUT /api/admin/staff/:id — Update staff member
router.put('/staff/:id', requireAdmin, async (req, res) => {
    const { id } = req.params;
    const { name, role } = req.body;
    const tenantId = req.tenant?.id;

    try {
        // Verify staff belongs to tenant
        const existing = await db.query(
            'SELECT id FROM staff WHERE id = $1 AND ($2::uuid IS NULL OR tenant_id = $2)',
            [id, tenantId]
        );

        if (existing.rows.length === 0) {
            return res.status(404).json({ error: 'Staff not found' });
        }

        const updates = [];
        const params = [];
        let paramIndex = 1;

        if (name) {
            updates.push(`name = $${paramIndex++}`);
            params.push(name);
        }
        if (role) {
            const validRoles = ['nurse', 'supervisor', 'admin', 'viewer'];
            if (!validRoles.includes(role)) {
                return res.status(400).json({ error: 'Invalid role' });
            }
            updates.push(`role = $${paramIndex++}`);
            params.push(role);
        }

        if (updates.length === 0) {
            return res.status(400).json({ error: 'No fields to update' });
        }

        params.push(id);

        const result = await db.query(`
            UPDATE staff SET ${updates.join(', ')}
            WHERE id = $${paramIndex}
            RETURNING id, email, name, role
        `, params);

        res.json(result.rows[0]);

    } catch (error) {
        console.error('Error updating staff:', error);
        res.status(500).json({ error: 'Database Error' });
    }
});

// DELETE /api/admin/staff/:id — Deactivate staff member (soft delete)
router.delete('/staff/:id', requireAdmin, async (req, res) => {
    const { id } = req.params;
    const tenantId = req.tenant?.id;

    try {
        // Verify staff belongs to tenant
        const existing = await db.query(
            'SELECT id FROM staff WHERE id = $1 AND ($2::uuid IS NULL OR tenant_id = $2)',
            [id, tenantId]
        );

        if (existing.rows.length === 0) {
            return res.status(404).json({ error: 'Staff not found' });
        }

        await db.query(
            `UPDATE staff SET status = 'inactive', auth_token_hash = NULL WHERE id = $1`,
            [id]
        );

        // Audit log
        await db.query(`
            INSERT INTO audit_log (actor, action, details, timestamp)
            VALUES ($1, $2, $3, NOW())
        `, [
            req.auth?.staffId || 'system_admin',
            'STAFF_DEACTIVATED',
            JSON.stringify({ staff_id: id, tenant_id: tenantId })
        ]);

        res.json({ success: true, message: 'Staff deactivated' });

    } catch (error) {
        console.error('Error deactivating staff:', error);
        res.status(500).json({ error: 'Database Error' });
    }
});

// POST /api/admin/staff/:id/regenerate-token — Generate new auth token
router.post('/staff/:id/regenerate-token', requireAdmin, async (req, res) => {
    const { id } = req.params;
    const tenantId = req.tenant?.id;

    try {
        // Verify staff belongs to tenant
        const existing = await db.query(
            'SELECT id FROM staff WHERE id = $1 AND ($2::uuid IS NULL OR tenant_id = $2) AND status = $3',
            [id, tenantId, 'active']
        );

        if (existing.rows.length === 0) {
            return res.status(404).json({ error: 'Staff not found or inactive' });
        }

        // Generate new token
        const tenantCode = req.tenant?.code || 'hnn';
        const authToken = `${tenantCode.toLowerCase()}_${crypto.randomBytes(32).toString('hex')}`;

        await db.query(
            'UPDATE staff SET auth_token_hash = $1 WHERE id = $2',
            [authToken, id]
        );

        // Audit log
        await db.query(`
            INSERT INTO audit_log (actor, action, details, timestamp)
            VALUES ($1, $2, $3, NOW())
        `, [
            req.auth?.staffId || 'system_admin',
            'STAFF_TOKEN_REGENERATED',
            JSON.stringify({ staff_id: id, tenant_id: tenantId })
        ]);

        res.json({
            success: true,
            authToken // Return new token ONCE
        });

    } catch (error) {
        console.error('Error regenerating token:', error);
        res.status(500).json({ error: 'Database Error' });
    }
});

// ============================================================
// AUDIT LOG
// ============================================================

// GET /api/admin/audit-log — View audit log entries
router.get('/audit-log', requireAdmin, async (req, res) => {
    const { action, from, to, limit = 100 } = req.query;
    const tenantId = req.tenant?.id;

    try {
        let query = `
            SELECT id, actor, action, patient_id, details, timestamp
            FROM audit_log
            WHERE 1=1
        `;
        const params = [];
        let paramIndex = 1;

        if (action) {
            query += ` AND action = $${paramIndex++}`;
            params.push(action);
        }

        if (from) {
            query += ` AND timestamp >= $${paramIndex++}`;
            params.push(from);
        }

        if (to) {
            query += ` AND timestamp <= $${paramIndex++}`;
            params.push(to);
        }

        // Filter by tenant if not system admin
        if (tenantId) {
            query += ` AND (details->>'tenant_id' = $${paramIndex++} OR patient_id IN (
                SELECT id FROM chronic_patients WHERE tenant_id = $${paramIndex++}
            ))`;
            params.push(tenantId, tenantId);
        }

        query += ` ORDER BY timestamp DESC LIMIT $${paramIndex}`;
        params.push(parseInt(limit));

        const result = await db.query(query, params);
        res.json(result.rows);

    } catch (error) {
        console.error('Error fetching audit log:', error);
        res.status(500).json({ error: 'Database Error' });
    }
});

module.exports = router;
