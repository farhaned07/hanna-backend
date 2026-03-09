/**
 * Structured Logger
 * 
 * Provides JSON-formatted logging for production environments.
 * Supports log levels, PII masking, and structured metadata.
 * 
 * Usage:
 *   const logger = require('./services/logger');
 *   logger.info('User logged in', { userId: 'U123' });
 *   logger.error('Database error', { error: err.message });
 */

const LOG_LEVELS = {
    DEBUG: 10,
    INFO: 20,
    WARN: 30,
    ERROR: 40,
};

// PII patterns to mask
const PII_PATTERNS = [
    { pattern: /U[a-f0-9]{32}/gi, replacement: 'U****' },           // LINE User ID
    { pattern: /\b\d{10}\b/g, replacement: '***-***-****' },        // Phone numbers
    { pattern: /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z]{2,}\b/gi, replacement: '***@***.***' }, // Emails
];

const currentLevel = LOG_LEVELS[process.env.LOG_LEVEL?.toUpperCase()] || LOG_LEVELS.INFO;
const enableJson = process.env.LOG_FORMAT === 'json' || process.env.NODE_ENV === 'production';

/**
 * Mask PII from a string
 */
const maskPII = (str) => {
    if (!str || typeof str !== 'string') return str;
    let masked = str;
    PII_PATTERNS.forEach(({ pattern, replacement }) => {
        masked = masked.replace(pattern, replacement);
    });
    return masked;
};

/**
 * Mask PII from an object recursively
 */
const maskObject = (obj) => {
    if (!obj) return obj;
    if (typeof obj === 'string') return maskPII(obj);
    if (Array.isArray(obj)) return obj.map(maskObject);
    if (typeof obj === 'object') {
        const masked = {};
        for (const key of Object.keys(obj)) {
            // Mask specific sensitive keys entirely
            if (['password', 'token', 'secret', 'apiKey', 'authorization'].includes(key.toLowerCase())) {
                masked[key] = '****';
            } else {
                masked[key] = maskObject(obj[key]);
            }
        }
        return masked;
    }
    return obj;
};

/**
 * Format log entry
 */
const formatLog = (level, message, meta = {}) => {
    const timestamp = new Date().toISOString();
    const maskedMeta = maskObject(meta);

    if (enableJson) {
        return JSON.stringify({
            timestamp,
            level,
            message,
            ...maskedMeta,
        });
    }

    // Human-readable format for development
    const metaStr = Object.keys(maskedMeta).length > 0
        ? ' ' + JSON.stringify(maskedMeta)
        : '';
    return `[${timestamp}] ${level.toUpperCase()}: ${message}${metaStr}`;
};

const log = (level, levelName, message, meta) => {
    if (level < currentLevel) return;
    const formatted = formatLog(levelName, message, meta);

    if (level >= LOG_LEVELS.ERROR) {
        console.error(formatted);
    } else if (level >= LOG_LEVELS.WARN) {
        console.warn(formatted);
    } else {
        console.log(formatted);
    }
};

module.exports = {
    debug: (message, meta) => log(LOG_LEVELS.DEBUG, 'debug', message, meta),
    info: (message, meta) => log(LOG_LEVELS.INFO, 'info', message, meta),
    warn: (message, meta) => log(LOG_LEVELS.WARN, 'warn', message, meta),
    error: (message, meta) => log(LOG_LEVELS.ERROR, 'error', message, meta),

    // Utilities
    maskPII,
    maskObject,
};
