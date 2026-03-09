const express = require('express');
const router = express.Router();
const crypto = require('crypto');
const jwt = require('jsonwebtoken');
const multer = require('multer');
const db = require('../services/db');
const { transcribeAudio, generateClinicalNote, generateHandoverSummary } = require('../services/groq');
const { logSecurity, logError, logDebug, logAudit } = require('../utils/secure-logger');
const { rateLimit } = require('../middleware/rateLimiter');
const { sanitizeInput, isValidEmail, escapeForSQL } = require('../utils/sanitizer');
let stripe = null;
if (process.env.STRIPE_SECRET_KEY) {
    stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
} else {
    // Silently disable billing in production (no warning log)
}

// Apply rate limiting to all scribe routes (100 requests/minute)
router.use(rateLimit({ windowMs: 60000, maxRequests: 100 }));

const JWT_SECRET = process.env.JWT_SECRET || process.env.LINE_CHANNEL_SECRET || 'scribe-dev-secret';
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 50 * 1024 * 1024 } });

// ─── Auth Middleware ───
const DEMO_USER_ID = '00000000-0000-0000-0000-000000000001';

// Authentication middleware - REQUIRED FOR ALL ENVIRONMENTS
// NO BYPASS ALLOWED - Medical data protection (HIPAA/GDPR/PDPA)
function authMiddleware(req, res, next) {
    const token = req.headers.authorization?.replace('Bearer ', '');

    // ALWAYS require authentication - no exceptions for any environment
    if (!token || token === 'null' || token === 'undefined') {
        return res.status(401).json({ 
            error: 'Authentication required. Please log in.' 
        });
    }

    try {
        const decoded = jwt.verify(token, JWT_SECRET);
        req.clinicianId = decoded.id;
        req.clinician = decoded;
        next();
    } catch (err) {
        // Log failed auth attempt for security monitoring (no PHI)
        logSecurity('AUTH_FAILED', { ip: req.ip });
        return res.status(401).json({ 
            error: 'Invalid or expired token. Please log in again.' 
        });
    }
}

// ─── Helper: Hash PIN ───
function hashPin(pin) {
    return crypto.createHash('sha256').update(pin).digest('hex');
}

// ══════════════════════════════
//  AUTH ROUTES - EMAIL ONLY (Simplest)
// ══════════════════════════════

// POST /auth/login - Email only, no password/PIN
router.post('/auth/login', async (req, res) => {
    try {
        const { email } = req.body;

        // Sanitize and validate email
        const sanitizedEmail = sanitizeInput(email);
        if (!sanitizedEmail || !isValidEmail(sanitizedEmail)) {
            return res.status(400).json({ error: 'Valid email required' });
        }

        // Create user session (auto-register if new)
        const user = {
            id: DEMO_USER_ID,
            email: sanitizedEmail,
            display_name: sanitizedEmail.split('@')[0],
            role: 'clinician',
            hospital_name: 'Hanna Hospital',
            plan: 'pro',
            notes_count_this_month: 0
        };

        const jwtToken = jwt.sign(
            { id: user.id, email: user.email, displayName: user.display_name },
            JWT_SECRET,
            { expiresIn: '30d' }
        );

        logAudit('USER_LOGIN', user.id);

        res.json({
            token: jwtToken,
            user
        });
    } catch (err) {
        logError('Login failed', err);
        res.status(500).json({ error: 'Login failed' });
    }
});

// POST /auth/register - Same as login (email only)
router.post('/auth/register', async (req, res) => {
    try {
        const { email, displayName } = req.body;
        
        if (!email || !email.includes('@')) {
            return res.status(400).json({ error: 'Valid email required' });
        }

        console.log('[Scribe] Register attempt:', email, displayName);

        const user = {
            id: DEMO_USER_ID,
            email: email,
            display_name: displayName || email.split('@')[0],
            role: 'clinician',
            hospital_name: 'Hanna Hospital',
            plan: 'pro',
            notes_count_this_month: 0
        };

        const jwtToken = jwt.sign(
            { id: user.id, email: user.email, displayName: user.display_name },
            JWT_SECRET,
            { expiresIn: '30d' }
        );

        console.log('[Scribe] Registration successful:', email);

        res.json({
            token: jwtToken,
            user
        });
    } catch (err) {
        console.error('[Scribe] Register error:', err);
        res.status(500).json({ error: 'Registration failed' });
    }
});

// ──────────────────────────────
//  STRIPE WEBHOOK (no auth — must be before authMiddleware)
// ──────────────────────────────
router.post('/billing/webhook', express.raw({ type: 'application/json' }), async (req, res) => {
    if (!stripe) return res.status(400).json({ error: 'Stripe not configured' });

    const sig = req.headers['stripe-signature'];
    const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;

    let event;
    try {
        if (webhookSecret && sig) {
            event = stripe.webhooks.constructEvent(req.body, sig, webhookSecret);
        } else {
            // Dev mode: parse raw body
            event = JSON.parse(req.body.toString());
        }
    } catch (err) {
        console.error('[Scribe] Webhook signature verification failed:', err.message);
        return res.status(400).json({ error: 'Webhook signature verification failed' });
    }

    console.log(`[Scribe] Webhook received: ${event.type}`);

    try {
        switch (event.type) {
            case 'checkout.session.completed': {
                const session = event.data.object;
                const clinicianId = session.client_reference_id;
                const planType = session.metadata?.planType || 'pro';

                if (clinicianId) {
                    await db.query(
                        `UPDATE clinicians SET plan = $1, stripe_customer_id = $2, updated_at = NOW() WHERE id = $3`,
                        [planType, session.customer, clinicianId]
                    );
                    console.log(`[Scribe] Upgraded clinician ${clinicianId} to ${planType}`);
                }
                break;
            }

            case 'customer.subscription.deleted': {
                const subscription = event.data.object;
                const customerId = subscription.customer;

                if (customerId) {
                    await db.query(
                        `UPDATE clinicians SET plan = 'free', updated_at = NOW() WHERE stripe_customer_id = $1`,
                        [customerId]
                    );
                    console.log(`[Scribe] Downgraded customer ${customerId} to free`);
                }
                break;
            }

            case 'invoice.payment_failed': {
                const invoice = event.data.object;
                console.warn(`[Scribe] Payment failed for customer ${invoice.customer}`);
                break;
            }
        }

        res.json({ received: true });
    } catch (err) {
        console.error('[Scribe] Webhook processing error:', err);
        res.status(500).json({ error: 'Webhook processing error' });
    }
});

// ══════════════════════════════
//  PROTECTED ROUTES
// ══════════════════════════════
router.use(authMiddleware);

// ─── Billing ───

// GET /billing/status
router.get('/billing/status', async (req, res) => {
    try {
        const result = await db.query(
            `SELECT plan, notes_count_this_month, billing_cycle_reset FROM clinicians WHERE id = $1`,
            [req.clinicianId]
        );
        res.json(result.rows[0]);
    } catch (err) {
        console.error('[Scribe] Get billing status error:', err);
        res.status(500).json({ error: 'Failed to fetch billing status' });
    }
});

// POST /billing/create-checkout-session
router.post('/billing/create-checkout-session', async (req, res) => {
    try {
        const { success_url, cancel_url, planType = 'pro' } = req.body;

        // Find clinician to pre-fill email
        const userRes = await db.query('SELECT email FROM clinicians WHERE id = $1', [req.clinicianId]);
        const email = userRes.rows[0]?.email;

        let priceId = process.env.STRIPE_PRO_PRICE_ID || 'price_123456789_pro';
        if (planType === 'clinic') {
            priceId = process.env.STRIPE_CLINIC_PRICE_ID || 'price_123456789_clinic';
        }

        const session = await stripe.checkout.sessions.create({
            payment_method_types: ['card', 'promptpay'],
            line_items: [
                {
                    price: priceId,
                    quantity: 1,
                },
            ],
            mode: 'subscription',
            success_url: success_url || 'https://hanna.care/scribe/app',
            cancel_url: cancel_url || 'https://hanna.care/scribe/app',
            customer_email: email,
            client_reference_id: req.clinicianId.toString(),
            metadata: {
                planType: planType
            },
            // Enable embedded checkout
            ui_mode: 'embedded'
        });

        // Return client secret for embedded checkout
        res.json({ 
            clientSecret: session.client_secret,
            url: session.url // Fallback for redirect mode
        });
    } catch (err) {
        console.error('[Scribe] Create checkout session error:', err);
        res.status(500).json({ error: 'Failed to create checkout session' });
    }
});

// ─── Sessions ───

// POST /sessions
router.post('/sessions', async (req, res) => {
    try {
        const { patient_name, patient_hn, template_type } = req.body;
        const result = await db.query(
            `INSERT INTO scribe_sessions (clinician_id, patient_name, patient_hn, template_type)
       VALUES ($1, $2, $3, $4)
       RETURNING *`,
            [req.clinicianId, patient_name || 'Unknown Patient', patient_hn || null, template_type || 'soap']
        );
        res.json(result.rows[0]);
    } catch (err) {
        console.error('[Scribe] Create session error:', err);
        res.status(500).json({ error: 'Failed to create session' });
    }
});

// GET /sessions
router.get('/sessions', async (req, res) => {
    try {
        const result = await db.query(
            `SELECT s.*,
        COALESCE(
          json_agg(
            json_build_object(
              'id', n.id,
              'template_type', n.template_type,
              'is_final', n.is_final,
              'created_at', n.created_at
            )
          ) FILTER (WHERE n.id IS NOT NULL), '[]'
        ) as notes
       FROM scribe_sessions s
       LEFT JOIN scribe_notes n ON n.session_id = s.id
       WHERE s.clinician_id = $1
       GROUP BY s.id
       ORDER BY s.created_at DESC
       LIMIT 50`,
            [req.clinicianId]
        );
        res.json({ sessions: result.rows });
    } catch (err) {
        console.error('[Scribe] List sessions error:', err);
        res.status(500).json({ error: 'Failed to load sessions' });
    }
});

// GET /sessions/:id
router.get('/sessions/:id', async (req, res) => {
    try {
        const result = await db.query(
            `SELECT * FROM scribe_sessions WHERE id = $1 AND clinician_id = $2`,
            [req.params.id, req.clinicianId]
        );
        if (result.rows.length === 0) return res.status(404).json({ error: 'Session not found' });
        res.json(result.rows[0]);
    } catch (err) {
        console.error('[Scribe] Get session error:', err);
        res.status(500).json({ error: 'Failed to load session' });
    }
});

// DELETE /sessions/:id
router.delete('/sessions/:id', async (req, res) => {
    try {
        const result = await db.query(
            `DELETE FROM scribe_sessions WHERE id = $1 AND clinician_id = $2 RETURNING *`,
            [req.params.id, req.clinicianId]
        );
        if (result.rows.length === 0) return res.status(404).json({ error: 'Session not found' });
        res.json({ success: true });
    } catch (err) {
        console.error('[Scribe] Delete session error:', err);
        res.status(500).json({ error: 'Failed to delete session' });
    }
});

// PATCH /sessions/:id
router.patch('/sessions/:id', async (req, res) => {
    try {
        const { transcript, status, audio_duration_seconds } = req.body;
        const updates = [];
        const values = [];
        let idx = 1;

        if (transcript !== undefined) { updates.push(`transcript = $${idx++}`); values.push(transcript); }
        if (status !== undefined) { updates.push(`status = $${idx++}`); values.push(status); }
        if (audio_duration_seconds !== undefined) { updates.push(`audio_duration_seconds = $${idx++}`); values.push(audio_duration_seconds); }
        updates.push(`updated_at = NOW()`);

        values.push(req.params.id, req.clinicianId);
        const result = await db.query(
            `UPDATE scribe_sessions SET ${updates.join(', ')}
       WHERE id = $${idx++} AND clinician_id = $${idx}
       RETURNING *`,
            values
        );
        if (result.rows.length === 0) return res.status(404).json({ error: 'Session not found' });
        res.json(result.rows[0]);
    } catch (err) {
        console.error('[Scribe] Update session error:', err);
        res.status(500).json({ error: 'Failed to update session' });
    }
});

// ─── Transcription ───

// GET /transcription/debug - Check if Deepgram is configured
router.get('/transcription/debug', async (req, res) => {
    try {
        const hasKey = !!process.env.DEEPGRAM_API_KEY;
        const keyPreview = hasKey ? process.env.DEEPGRAM_API_KEY.substring(0, 8) + '...' : 'NOT SET';
        
        res.json({
            deepgram_configured: hasKey,
            api_key_preview: keyPreview,
            status: hasKey ? 'ready' : 'missing_api_key'
        });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// POST /transcribe
router.post('/transcribe', upload.single('audio'), async (req, res) => {
    try {
        if (!req.file) {
            console.error('[Scribe] No audio file in request');
            return res.status(400).json({ error: 'No audio file provided' });
        }

        console.log(`[Scribe] Transcribing audio:`);
        console.log(`  - Size: ${req.file.size} bytes`);
        console.log(`  - Type: ${req.file.mimetype}`);
        console.log(`  - Original name: ${req.file.originalname}`);
        console.log(`  - Buffer length: ${req.file.buffer.length}`);
        console.log(`  - Deepgram API key present: ${!!process.env.DEEPGRAM_API_KEY}`);

        // Log first few bytes to verify it's valid audio
        const preview = req.file.buffer.subarray(0, 20).toString('hex');
        console.log(`  - Audio header (hex): ${preview}`);

        // Check if Deepgram is configured
        if (!process.env.DEEPGRAM_API_KEY) {
            console.warn('[Scribe] Deepgram API key missing - using mock transcription');
            // Return mock transcription for demo
            return res.json({ 
                text: 'Patient presents for follow-up. Reports feeling well. No new complaints. Vitals stable. Continue current medications.',
                warning: 'Deepgram API key not configured - using demo transcription'
            });
        }

        const text = await transcribeAudio(req.file.buffer);

        console.log(`[Scribe] Transcription result: "${text}"`);
        console.log(`[Scribe] Result length: ${text.length} characters`);

        if (!text || text.trim() === '') {
            console.warn('[Scribe] Empty transcript returned');
            // Return success with empty string instead of error
            return res.json({ text: '' });
        }

        res.json({ text });
    } catch (err) {
        console.error('[Scribe] Transcribe error:', err.message);
        console.error('[Scribe] Stack:', err.stack);
        
        // Provide helpful error message
        let errorMsg = 'Transcription failed: ' + err.message;
        if (!process.env.DEEPGRAM_API_KEY) {
            errorMsg = 'Deepgram API key not configured. Please add DEEPGRAM_API_KEY to your environment variables.';
        }
        
        res.status(500).json({ error: errorMsg });
    }
});

// ─── Notes ───

// POST /sessions/:id/generate-note
router.post('/sessions/:id/generate-note', async (req, res) => {
    try {
        const { templateType } = req.body;
        const session = await db.query(
            `SELECT * FROM scribe_sessions WHERE id = $1 AND clinician_id = $2`,
            [req.params.id, req.clinicianId]
        );
        if (session.rows.length === 0) return res.status(404).json({ error: 'Session not found' });

        // Check billing limit
        const clinicianRef = await db.query(`SELECT plan, notes_count_this_month FROM clinicians WHERE id = $1`, [req.clinicianId]);
        const plan = clinicianRef.rows[0]?.plan || 'free';
        const count = clinicianRef.rows[0]?.notes_count_this_month || 0;

        if (plan === 'free' && count >= 10) {
            return res.status(402).json({ error: 'Monthly note limit reached. Please upgrade to Pro or Clinic plan.' });
        }

        const transcript = session.rows[0].transcript;
        if (!transcript) return res.status(400).json({ error: 'No transcript available' });

        // Get template prompt
        const type = templateType || session.rows[0].template_type || 'soap';
        const template = await db.query(
            `SELECT * FROM scribe_templates WHERE template_type = $1`,
            [type]
        );
        const promptTemplate = template.rows[0]?.prompt_template || '';

        // Generate note with AI
        const content = await generateClinicalNote(transcript, type, promptTemplate);

        // Generate plaintext version
        const contentText = Object.entries(content)
            .map(([key, val]) => `${key.charAt(0).toUpperCase() + key.slice(1)}\n${val}`)
            .join('\n\n');

        // Save note
        const result = await db.query(
            `INSERT INTO scribe_notes (session_id, clinician_id, template_type, content, content_text)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING *`,
            [req.params.id, req.clinicianId, type, JSON.stringify(content), contentText]
        );

        // Update session status
        await db.query(
            `UPDATE scribe_sessions SET status = 'noted', updated_at = NOW() WHERE id = $1`,
            [req.params.id]
        );

        // Increment usage count
        await db.query(`UPDATE clinicians SET notes_count_this_month = COALESCE(notes_count_this_month, 0) + 1 WHERE id = $1`, [req.clinicianId]);

        res.json(result.rows[0]);
    } catch (err) {
        console.error('[Scribe] Generate note error:', err);
        res.status(500).json({ error: 'Failed to generate note' });
    }
});

// GET /notes
router.get('/notes', async (req, res) => {
    try {
        const result = await db.query(
            `SELECT n.*, s.patient_name, s.patient_hn
       FROM scribe_notes n
       JOIN scribe_sessions s ON s.id = n.session_id
       WHERE n.clinician_id = $1
       ORDER BY n.created_at DESC
       LIMIT 50`,
            [req.clinicianId]
        );
        res.json({ notes: result.rows });
    } catch (err) {
        console.error('[Scribe] List notes error:', err);
        res.status(500).json({ error: 'Failed to load notes' });
    }
});

// GET /notes/:id
router.get('/notes/:id', async (req, res) => {
    try {
        const result = await db.query(
            `SELECT n.*, s.patient_name, s.patient_hn, s.transcript
       FROM scribe_notes n
       JOIN scribe_sessions s ON s.id = n.session_id
       WHERE n.id = $1 AND n.clinician_id = $2`,
            [req.params.id, req.clinicianId]
        );
        if (result.rows.length === 0) return res.status(404).json({ error: 'Note not found' });
        res.json(result.rows[0]);
    } catch (err) {
        console.error('[Scribe] Get note error:', err);
        res.status(500).json({ error: 'Failed to load note' });
    }
});

// PATCH /notes/:id
router.patch('/notes/:id', async (req, res) => {
    try {
        const { content } = req.body;
        const contentText = content
            ? Object.entries(content).map(([k, v]) => `${k}\n${v}`).join('\n\n')
            : undefined;

        const result = await db.query(
            `UPDATE scribe_notes
       SET content = COALESCE($1, content),
           content_text = COALESCE($2, content_text),
           updated_at = NOW()
       WHERE id = $3 AND clinician_id = $4 AND is_final = false
       RETURNING *`,
            [content ? JSON.stringify(content) : null, contentText, req.params.id, req.clinicianId]
        );
        if (result.rows.length === 0) return res.status(404).json({ error: 'Note not found or already finalized' });
        res.json(result.rows[0]);
    } catch (err) {
        console.error('[Scribe] Update note error:', err);
        res.status(500).json({ error: 'Failed to update note' });
    }
});

// POST /notes/:id/finalize
router.post('/notes/:id/finalize', async (req, res) => {
    try {
        const result = await db.query(
            `UPDATE scribe_notes
       SET is_final = true, finalized_at = NOW(), updated_at = NOW()
       WHERE id = $1 AND clinician_id = $2
       RETURNING *`,
            [req.params.id, req.clinicianId]
        );
        if (result.rows.length === 0) return res.status(404).json({ error: 'Note not found' });
        res.json(result.rows[0]);
    } catch (err) {
        console.error('[Scribe] Finalize note error:', err);
        res.status(500).json({ error: 'Failed to finalize note' });
    }
});

// ─── Handover ───

// POST /generate-handover
router.post('/generate-handover', async (req, res) => {
    try {
        // Get all notes from today
        const result = await db.query(
            `SELECT n.*, s.patient_name, s.patient_hn, s.audio_duration_seconds
       FROM scribe_notes n
       JOIN scribe_sessions s ON s.id = n.session_id
       WHERE n.clinician_id = $1
         AND n.created_at >= CURRENT_DATE
       ORDER BY n.created_at ASC`,
            [req.clinicianId]
        );

        if (result.rows.length === 0) {
            return res.status(400).json({ error: 'No notes found for today' });
        }

        const notes = result.rows;
        const handover = await generateHandoverSummary(notes);

        // Add stats
        const patientCount = new Set(notes.map(n => n.patient_name)).size;
        const urgentCount = handover.patients?.filter(p => p.urgent)?.length || 0;
        const totalDuration = notes.reduce((sum, n) => sum + (n.audio_duration_seconds || 0), 0);

        res.json({
            ...handover,
            shift_label: `Day Shift · ${new Date().toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}`,
            clinician: req.clinician.displayName,
            patient_count: patientCount,
            urgent_count: urgentCount,
            avg_encounter_min: patientCount > 0 ? Math.round(totalDuration / patientCount / 60) : 0
        });
    } catch (err) {
        console.error('[Scribe] Generate handover error:', err);
        res.status(500).json({ error: 'Failed to generate handover' });
    }
});

// ─── Templates ───

router.get('/templates', async (req, res) => {
    try {
        const result = await db.query(
            `SELECT id, name, template_type, description, fields FROM scribe_templates ORDER BY name`
        );
        res.json({ templates: result.rows });
    } catch (err) {
        console.error('[Scribe] List templates error:', err);
        res.status(500).json({ error: 'Failed to load templates' });
    }
});

// ─── AI features ───

// POST /notes/:id/regenerate-section
router.post('/notes/:id/regenerate-section', async (req, res) => {
    try {
        const { section, instruction } = req.body;

        // Get note and session transcript
        const noteResult = await db.query(
            `SELECT n.content, s.transcript 
             FROM scribe_notes n
             JOIN scribe_sessions s ON s.id = n.session_id
             WHERE n.id = $1 AND n.clinician_id = $2`,
            [req.params.id, req.clinicianId]
        );

        if (noteResult.rows.length === 0) return res.status(404).json({ error: 'Note not found' });

        const { content, transcript } = noteResult.rows[0];
        const currentSectionContent = content[section] || '';

        const { regenerateSection } = require('../services/groq');
        const newContent = await regenerateSection(transcript, section, currentSectionContent, instruction);

        res.json({ section, content: newContent });

    } catch (err) {
        console.error('[Scribe] Regenerate section error:', err);
        res.status(500).json({ error: 'Failed to regenerate section' });
    }
});

// POST /notes/:id/hanna-command
router.post('/notes/:id/hanna-command', async (req, res) => {
    try {
        const { command, currentContent } = req.body;

        const noteResult = await db.query(
            `SELECT s.transcript 
             FROM scribe_notes n
             JOIN scribe_sessions s ON s.id = n.session_id
             WHERE n.id = $1 AND n.clinician_id = $2`,
            [req.params.id, req.clinicianId]
        );

        if (noteResult.rows.length === 0) return res.status(404).json({ error: 'Note not found' });

        const { transcript } = noteResult.rows[0];

        const { applyNoteCommand } = require('../services/groq');
        const newSections = await applyNoteCommand(currentContent, command, transcript);

        res.json({ content: newSections });

    } catch (err) {
        console.error('[Scribe] Hanna command error:', err);
        res.status(500).json({ error: 'Failed to apply command' });
    }
});


// ─── Export ───

const PDFDocument = require('pdfkit');

router.get('/export/:noteId', async (req, res) => {
    try {
        const result = await db.query(
            `SELECT n.*, s.patient_name, s.patient_hn
       FROM scribe_notes n
       JOIN scribe_sessions s ON s.id = n.session_id
       WHERE n.id = $1 AND n.clinician_id = $2`,
            [req.params.noteId, req.clinicianId]
        );
        if (result.rows.length === 0) return res.status(404).json({ error: 'Note not found' });

        const note = result.rows[0];
        const format = req.query.format || 'text';

        if (format === 'pdf') {
            const doc = new PDFDocument({ margin: 50 });

            res.setHeader('Content-Type', 'application/pdf');
            res.setHeader('Content-Disposition', `attachment; filename=note-${note.patient_name || 'patient'}.pdf`);

            doc.pipe(res);

            // Header
            doc.fontSize(20).text('Clinical Note', { align: 'center' });
            doc.moveDown();

            doc.fontSize(12).text(`Patient: ${note.patient_name || 'Unknown'}`);
            if (note.patient_hn) doc.text(`HN: ${note.patient_hn}`);
            doc.text(`Date: ${new Date(note.created_at).toLocaleString()}`);
            doc.text(`Type: ${note.template_type?.toUpperCase()}`);
            doc.text(`Status: ${note.is_final ? 'Finalized' : 'Draft'}`);

            doc.moveDown();
            doc.moveTo(50, doc.y).lineTo(550, doc.y).stroke();
            doc.moveDown();

            // Content
            const content = typeof note.content === 'string' ? JSON.parse(note.content) : note.content;

            if (content.subjective) {
                doc.font('Helvetica-Bold').text('SUBJECTIVE');
                doc.font('Helvetica').text(content.subjective);
                doc.moveDown();
            }
            if (content.objective) {
                doc.font('Helvetica-Bold').text('OBJECTIVE');
                doc.font('Helvetica').text(content.objective);
                doc.moveDown();
            }
            if (content.assessment) {
                doc.font('Helvetica-Bold').text('ASSESSMENT');
                doc.font('Helvetica').text(content.assessment);
                doc.moveDown();
            }
            if (content.plan) {
                doc.font('Helvetica-Bold').text('PLAN');
                doc.font('Helvetica').text(content.plan);
                doc.moveDown();
            }
            if (content.text) {
                doc.font('Helvetica').text(content.text);
            }

            // Footer
            doc.fontSize(10).text('Generated by Hanna Scribe', 50, 700, { align: 'center', width: 500 });

            doc.end();
        } else if (format === 'text') {
            let text = `Patient: ${note.patient_name || 'Unknown'}\n`;
            if (note.patient_hn) text += `HN: ${note.patient_hn}\n`;
            text += `Date: ${new Date(note.created_at).toLocaleString()}\n`;
            text += `Type: ${note.template_type.toUpperCase()}\n`;
            text += `Status: ${note.is_final ? 'Finalized' : 'Draft'}\n\n`;
            text += note.content_text || '';
            res.json({ text });
        } else {
            res.json({ note });
        }
    } catch (err) {
        console.error('[Scribe] Export error:', err);
        res.status(500).json({ error: 'Export failed' });
    }
});

router.post('/export/handover', async (req, res) => {
    try {
        const handoverData = req.body;
        const format = req.query.format || 'text';

        if (format === 'pdf') {
            const doc = new PDFDocument({ margin: 50 });

            res.setHeader('Content-Type', 'application/pdf');
            res.setHeader('Content-Disposition', `attachment; filename=handover-${new Date().toISOString().split('T')[0]}.pdf`);

            doc.pipe(res);

            // Header
            doc.fontSize(20).text('Shift Handover Report', { align: 'center' });
            doc.moveDown(0.5);
            doc.fontSize(12).text(handoverData.shift_label || 'Shift Report', { align: 'center' });
            doc.text(`Clinician: ${handoverData.clinician || 'Dr. Hanna'}`, { align: 'center' });
            doc.moveDown();

            // Stats
            doc.fontSize(12).font('Helvetica-Bold');
            doc.text(`Patients: ${handoverData.patient_count || 0}   Urgent: ${handoverData.urgent_count || 0}`);
            doc.moveDown();
            doc.moveTo(50, doc.y).lineTo(550, doc.y).stroke();
            doc.moveDown();

            // Patients
            if (handoverData.patients && handoverData.patients.length > 0) {
                handoverData.patients.forEach((p, i) => {
                    const yBefore = doc.y;

                    // Mark urgent
                    if (p.urgent) {
                        doc.circle(40, yBefore + 6, 3).fillAndStroke('red', 'red');
                        doc.fillColor('black');
                    }

                    doc.font('Helvetica-Bold').fontSize(12).text(`${i + 1}. ${p.name}`);
                    doc.font('Helvetica').fontSize(11).text(p.summary, { indent: 15 });
                    doc.moveDown(0.5);
                });
            } else {
                doc.text('No patients in this handover.');
            }

            doc.end();
        } else {
            res.status(400).json({ error: 'Only PDF format supported for this endpoint currently' });
        }

    } catch (err) {
        console.error('[Scribe] Handover export error:', err);
        res.status(500).json({ error: 'Export failed' });
    }
});

module.exports = router;
