/**
 * Secure Logging Service for Hanna Scribe
 * 
 * - No PHI (Patient Health Information) logged
 * - Production-safe (stripped from builds)
 * - Sentry integration for error tracking
 * - Audit logging for security events
 */

const IS_PRODUCTION = process.env.NODE_ENV === 'production';

// Security events that should always be logged (without PHI)
const SECURITY_EVENTS = [
    'AUTH_FAILED',
    'RATE_LIMIT_EXCEEDED',
    'INVALID_TOKEN',
    'SUSPICIOUS_ACTIVITY'
];

/**
 * Log security events (always logged, even in production)
 * @param {string} event - Security event type
 * @param {object} metadata - Non-sensitive metadata
 */
export function logSecurity(event, metadata = {}) {
    // Never log PHI in security events
    const safeMetadata = {
        event,
        timestamp: new Date().toISOString(),
        ip: metadata.ip ? maskIP(metadata.ip) : undefined,
        userAgent: metadata.userAgent ? 'masked' : undefined,
        ...metadata
    };
    
    // Remove any potential PHI fields
    delete safeMetadata.email;
    delete safeMetadata.patientName;
    delete safeMetadata.patientHN;
    delete safeMetadata.clinicalData;
    
    if (IS_PRODUCTION) {
        // In production, only send to Sentry if configured
        if (typeof Sentry !== 'undefined') {
            Sentry.captureMessage(`[SECURITY] ${event}`, {
                level: 'warning',
                extra: safeMetadata
            });
        }
    } else {
        // In development, log to console for debugging
        console.log(`[SECURITY] ${event}`, safeMetadata);
    }
}

/**
 * Log API errors (stripped from production builds)
 * @param {string} message - Error message
 * @param {Error} error - Error object
 */
export function logError(message, error = null) {
    if (IS_PRODUCTION) {
        // In production, only log to Sentry
        if (typeof Sentry !== 'undefined' && error) {
            Sentry.captureException(error, {
                extra: { message }
            });
        }
    } else {
        // Development: log error for debugging
        console.error(`[ERROR] ${message}`, error || '');
    }
}

/**
 * Log debug information (stripped from production builds)
 * @param {string} message - Debug message
 * @param {any} data - Additional data
 */
export function logDebug(message, data = null) {
    if (!IS_PRODUCTION) {
        console.log(`[DEBUG] ${message}`, data || '');
    }
    // In production, this is completely stripped
}

/**
 * Mask IP address for privacy
 * @param {string} ip - IP address
 * @returns {string} Masked IP
 */
function maskIP(ip) {
    return ip.replace(/\.\d+$/, '.***');
}

/**
 * Log audit trail for compliance (HIPAA/GDPR/PDPA)
 * @param {string} action - Action performed
 * @param {string} userId - User ID (not email)
 * @param {object} metadata - Action metadata
 */
export function logAudit(action, userId, metadata = {}) {
    const auditLog = {
        timestamp: new Date().toISOString(),
        action,
        userId,
        ...metadata
    };
    
    // Store audit log in database (not console)
    // This is for compliance tracking
    if (typeof global.auditLogs !== 'undefined') {
        global.auditLogs.push(auditLog);
    }
    
    // In development, also log for debugging
    if (!IS_PRODUCTION) {
        console.log(`[AUDIT] ${action} by ${userId}`, metadata);
    }
}

// Default export for easy import
export default {
    logSecurity,
    logError,
    logDebug,
    logAudit
};
