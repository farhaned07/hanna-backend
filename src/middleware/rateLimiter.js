/**
 * Rate Limiting Middleware for Hanna Scribe
 * 
 * Prevents API abuse by limiting requests per user
 * - 100 requests per minute (adjustable)
 * - Returns 429 Too Many Requests when exceeded
 * - HIPAA-compliant (no PHI logged)
 */

const rateLimitStore = new Map();

const DEFAULT_WINDOW_MS = 60000; // 1 minute
const DEFAULT_MAX_REQUESTS = 100;

/**
 * Rate limiting middleware
 * @param {object} options - Configuration
 * @param {number} options.windowMs - Time window in milliseconds
 * @param {number} options.maxRequests - Max requests per window
 * @returns {function} Express middleware
 */
function rateLimit(options = {}) {
    const windowMs = options.windowMs || DEFAULT_WINDOW_MS;
    const maxRequests = options.maxRequests || DEFAULT_MAX_REQUESTS;

    // Cleanup old entries periodically
    setInterval(() => {
        const now = Date.now();
        for (const [key, value] of rateLimitStore.entries()) {
            if (now - value.windowStart > windowMs) {
                rateLimitStore.delete(key);
            }
        }
    }, windowMs);

    return function rateLimitMiddleware(req, res, next) {
        // Use IP + user agent as key (anonymized)
        const ip = req.ip || req.connection.remoteAddress || 'unknown';
        const key = `ratelimit:${ip}`;

        const now = Date.now();
        let record = rateLimitStore.get(key);

        // Create new record or reset if window expired
        if (!record || now - record.windowStart > windowMs) {
            record = {
                windowStart: now,
                count: 0
            };
        }

        // Increment counter
        record.count++;
        rateLimitStore.set(key, record);

        // Calculate remaining requests
        const remaining = Math.max(0, maxRequests - record.count);
        const resetTime = record.windowStart + windowMs;

        // Set rate limit headers
        res.setHeader('X-RateLimit-Limit', maxRequests);
        res.setHeader('X-RateLimit-Remaining', remaining);
        res.setHeader('X-RateLimit-Reset', resetTime);

        // Check if limit exceeded
        if (record.count > maxRequests) {
            const retryAfter = Math.ceil((resetTime - now) / 1000);
            res.setHeader('Retry-After', retryAfter);
            
            // Log rate limit violation (no PHI)
            if (typeof global.logSecurity !== 'undefined') {
                global.logSecurity('RATE_LIMIT_EXCEEDED', {
                    ip: ip,
                    path: req.path,
                    retryAfter: retryAfter
                });
            }

            return res.status(429).json({
                error: 'Too many requests',
                message: 'Rate limit exceeded. Please try again later.',
                retryAfter: retryAfter
            });
        }

        next();
    };
}

// Apply rate limiter to specific routes
function applyRateLimiter(router, options = {}) {
    const limiter = rateLimit(options);
    router.use(limiter);
}

module.exports = {
    rateLimit,
    applyRateLimiter,
    DEFAULT_WINDOW_MS,
    DEFAULT_MAX_REQUESTS
};
