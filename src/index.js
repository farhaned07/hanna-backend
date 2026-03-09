require('dotenv').config();
const dns = require('dns');
// Force IPv4 to avoid ENETUNREACH errors on Railway/Supabase
if (dns.setDefaultResultOrder) {
    dns.setDefaultResultOrder('ipv4first');
}
const express = require('express');
const { middleware } = require('@line/bot-sdk');
const { handleEvent } = require('./handlers/webhook');
const { config } = require('./config');
const { initScheduler } = require('./scheduler');
const cors = require('cors');
const path = require('path');

const app = express();

// ─── SECURITY: CORS Configuration ───
const allowedOrigins = [
    'https://hanna.care',
    'https://www.hanna.care',
    'https://hanna-line-bot-production.up.railway.app',
    process.env.NODE_ENV === 'development' && 'http://localhost:3000',
    process.env.NODE_ENV === 'development' && 'http://localhost:5174',
    process.env.NODE_ENV === 'development' && 'http://localhost:5173'
].filter(Boolean);

app.use(cors({
    origin: function(origin, callback) {
        // Allow requests with no origin (mobile apps, curl, Postman, etc.)
        if (!origin) return callback(null, true);
        
        if (allowedOrigins.indexOf(origin) !== -1) {
            callback(null, true);
        } else {
            console.warn(`⚠️ CORS blocked request from: ${origin}`);
            callback(new Error('Not allowed by CORS'));
        }
    },
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With', 'Accept-Version', 'Content-Length', 'Content-MD5', 'Date', 'X-Api-Version']
}));

// ─── SECURITY: Security Headers Middleware ───
app.use((req, res, next) => {
    // Prevent clickjacking
    res.setHeader('X-Frame-Options', 'DENY');
    // Prevent MIME type sniffing
    res.setHeader('X-Content-Type-Options', 'nosniff');
    // XSS protection
    res.setHeader('X-XSS-Protection', '1; mode=block');
    // Referrer policy
    res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
    // Feature policy
    res.setHeader('Permissions-Policy', 'geolocation=(), microphone=(), camera=()');
    
    // HSTS (only in production)
    if (process.env.NODE_ENV === 'production') {
        res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains; preload');
    }
    
    next();
});

// H5 FIX: Rate Limiting
const rateLimit = {};
const RATE_LIMIT_WINDOW_MS = 60 * 1000; // 1 minute
const RATE_LIMIT_MAX_REQUESTS = 100; // 100 requests per minute

const rateLimitMiddleware = (req, res, next) => {
    const ip = req.ip || req.connection.remoteAddress;
    const now = Date.now();

    if (!rateLimit[ip]) {
        rateLimit[ip] = { count: 1, startTime: now };
    } else if (now - rateLimit[ip].startTime > RATE_LIMIT_WINDOW_MS) {
        rateLimit[ip] = { count: 1, startTime: now };
    } else {
        rateLimit[ip].count++;
        if (rateLimit[ip].count > RATE_LIMIT_MAX_REQUESTS) {
            console.warn(`⚠️ Rate limit exceeded for IP: ${ip}`);
            return res.status(429).json({ error: 'Too many requests. Please try again later.' });
        }
    }
    next();
};

// Apply rate limiting to API routes
app.use('/api', rateLimitMiddleware);

// ─── SECURITY: Stricter rate limiting for auth endpoints ───
const authRateLimit = {};
const AUTH_RATE_LIMIT_WINDOW_MS = 15 * 60 * 1000; // 15 minutes
const AUTH_RATE_LIMIT_MAX_REQUESTS = 10; // 10 attempts per 15 minutes

const authRateLimitMiddleware = (req, res, next) => {
    const ip = req.ip || req.connection.remoteAddress;
    const now = Date.now();
    const key = `auth:${ip}`;

    if (!authRateLimit[key]) {
        authRateLimit[key] = { count: 1, startTime: now };
    } else if (now - authRateLimit[key].startTime > AUTH_RATE_LIMIT_WINDOW_MS) {
        authRateLimit[key] = { count: 1, startTime: now };
    } else {
        authRateLimit[key].count++;
        if (authRateLimit[key].count > AUTH_RATE_LIMIT_MAX_REQUESTS) {
            console.warn(`⚠️ Auth rate limit exceeded for IP: ${ip}`);
            return res.status(429).json({ 
                error: 'Too many authentication attempts. Please try again in 15 minutes.' 
            });
        }
    }
    next();
};

// Apply stricter rate limiting to auth routes
app.use('/api/auth', authRateLimitMiddleware);
app.use('/api/scribe/auth', authRateLimitMiddleware);

// Cleanup auth rate limit entries every 5 minutes
setInterval(() => {
    const now = Date.now();
    for (const key in authRateLimit) {
        if (now - authRateLimit[key].startTime > AUTH_RATE_LIMIT_WINDOW_MS * 2) {
            delete authRateLimit[key];
        }
    }
}, 300000);

// Admin API Routes
app.use('/api/admin', express.json(), require('./routes/admin'));
app.use('/api/auth', express.json(), require('./routes/auth'));
app.use('/api/nurse', express.json(), require('./routes/nurse'));
app.use('/api/analytics', express.json(), require('./routes/analytics'));
app.use('/api/superadmin', express.json(), require('./routes/superadmin'));
app.use('/api/patient', require('./routes/patient')); // PDPA Right-to-Erasure
app.use('/api/scribe', express.json(), require('./routes/scribe')); // Scribe Clinical Documentation
app.use('/api/followup', express.json(), require('./routes/followup')); // Follow-up Enrollment & Management

// Serve Scribe PWA
const scribeBuildPath = path.join(__dirname, '../scribe/dist');
app.use('/scribe', express.static(scribeBuildPath));
app.get('/scribe/*', (req, res) => {
    res.sendFile(path.join(scribeBuildPath, 'index.html'));
});

// Serve React Dashboard (Admin Panel)
const clientBuildPath = path.join(__dirname, '../client/dist');
app.use('/dashboard', express.static(clientBuildPath));
app.use('/login', express.static(clientBuildPath)); // Handle direct login access
// Fallback for React Router (SPA) - simplified for specific routes
app.get(['/dashboard/*', '/login'], (req, res) => {
    res.sendFile(path.join(clientBuildPath, 'index.html'));
});

// Logging Middleware

// N1 FIX: Cleanup stale rate limit entries every minute to prevent memory leak
setInterval(() => {
    const now = Date.now();
    let cleanedCount = 0;
    for (const ip in rateLimit) {
        if (now - rateLimit[ip].startTime > RATE_LIMIT_WINDOW_MS * 2) {
            delete rateLimit[ip];
            cleanedCount++;
        }
    }
    if (cleanedCount > 0) {
        console.log(`🧹 Cleaned ${cleanedCount} stale rate limit entries`);
    }
}, 60000);

// Logging Middleware
app.use((req, res, next) => {
    console.log(`Incoming ${req.method} request to ${req.url}`);
    next();
});

// Serve Static Files (Hanna Live Frontend)
// M1 FIX: Removed duplicate static middleware (was at line 44)
app.use(express.static(path.join(__dirname, '../public')));

// LINE Webhook (MUST be before express.json() for raw body signature verification)
// Guard: Only register webhook if LINE credentials are configured
if (config.line.channelSecret && config.line.channelAccessToken) {
    app.post('/webhook', middleware(config.line), (req, res) => {
        console.log('Webhook received events:', JSON.stringify(req.body.events));
        Promise.all(req.body.events.map(handleEvent))
            .then((result) => res.json(result))
            .catch((err) => {
                console.error(err);
                res.status(500).end();
            });
    });
    console.log('✅ LINE Webhook registered');
} else {
    console.warn('⚠️ LINE credentials missing — webhook route disabled');
    app.post('/webhook', (req, res) => {
        res.status(503).json({ error: 'LINE webhook not configured' });
    });
}

// Scribe Stripe Webhook (MUST be before express.json() for raw body verification)
const stripeWebhookHandler = require('./webhooks/stripe');
app.post('/api/scribe/billing/webhook', express.raw({ type: 'application/json' }), stripeWebhookHandler);

// JSON parsing for non-webhook routes (AFTER webhook routes)
app.use(express.json());

// Webhooks (Resend, etc.)
app.use('/api/webhooks', require('./webhooks/resend'));

// Voice API (Project VoiceLess)
const voiceRoutes = require('./routes/voice');
app.use('/api/voice', express.json(), voiceRoutes);

// Report Generation Endpoint (Protected)
const reportService = require('./services/report');
app.get('/api/report/:userId', async (req, res) => {
    // Auth check - require same token as Nurse Dashboard
    const token = req.headers['authorization'];
    const expected = `Bearer ${process.env.NURSE_DASHBOARD_TOKEN}`;
    if (!token || token !== expected) {
        return res.status(401).json({ error: 'Unauthorized' });
    }

    try {
        const pdfBuffer = await reportService.generateReport(req.params.userId);
        res.set({
            'Content-Type': 'application/pdf',
            'Content-Disposition': `attachment; filename=health_report_${req.params.userId}.pdf`,
        });
        res.send(pdfBuffer);
    } catch (error) {
        console.error('Report generation error:', error);
        res.status(500).send('Error generating report');
    }
});

// Health check
app.get('/health', async (req, res) => {
    // Return 200 immediately to prevent hitting Railway's timeout limit
    // while the 5-second DB fallback finishes in the background.
    res.status(200).send('OK (MockDB)');
});

const port = process.env.PORT || 3000;
const http = require('http');
// Create HTTP server
const server = http.createServer(app);

// Legacy Gemini Live WebSocket replaced by LiveKit
// const wss = new WebSocket.Server({ server, path: '/api/voice/live' });
// ... (code removed) ...

server.listen(port, '0.0.0.0', () => {
    console.log(`Server listening on port ${port} (0.0.0.0)`);
    console.log(`WebSocket endpoint: ws://localhost:${port}/api/voice/live`);
    initScheduler();
});
