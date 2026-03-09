/**
 * Input Sanitization Service for Hanna Scribe
 * 
 * Prevents XSS and injection attacks by sanitizing all user inputs
 * - HTML entity encoding
 * - Script tag removal
 * - SQL injection prevention
 * 
 * COMPLIANCE: HIPAA, GDPR, OWASP Guidelines
 */

/**
 * Sanitize string to prevent XSS attacks
 * @param {string} str - String to sanitize
 * @returns {string} Sanitized string
 */
export function sanitizeInput(str) {
    if (typeof str !== 'string') {
        return str;
    }

    // Remove null bytes
    str = str.replace(/\0/g, '');

    // Encode HTML entities
    const htmlEntities = {
        '&': '&amp;',
        '<': '&lt;',
        '>': '&gt;',
        '"': '&quot;',
        "'": '&#x27;',
        '/': '&#x2F;',
        '`': '&#x60;',
        '=': '&#x3D;'
    };

    str = str.replace(/[&<>"'`=/]/g, char => htmlEntities[char]);

    // Remove script tags and event handlers
    str = str.replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '');
    str = str.replace(/on\w+\s*=/gi, '');

    // Remove javascript: protocol
    str = str.replace(/javascript:/gi, '');

    return str.trim();
}

/**
 * Sanitize object with multiple fields
 * @param {object} obj - Object to sanitize
 * @param {string[]} fields - Fields to sanitize
 * @returns {object} Sanitized object
 */
export function sanitizeObject(obj, fields) {
    if (!obj || typeof obj !== 'object') {
        return obj;
    }

    const sanitized = { ...obj };

    for (const field of fields) {
        if (sanitized[field]) {
            sanitized[field] = sanitizeInput(sanitized[field]);
        }
    }

    return sanitized;
}

/**
 * Sanitize patient data (PHI protection)
 * @param {object} patientData - Patient data object
 * @returns {object} Sanitized patient data
 */
export function sanitizePatientData(patientData) {
    return sanitizeObject(patientData, [
        'patient_name',
        'patient_hn',
        'transcript',
        'chief_complaint'
    ]);
}

/**
 * Sanitize note content
 * @param {object} noteData - Note data object
 * @returns {object} Sanitized note data
 */
export function sanitizeNoteContent(noteData) {
    if (!noteData || !noteData.content) {
        return noteData;
    }

    const sanitized = { ...noteData };
    
    if (typeof noteData.content === 'object') {
        sanitized.content = {};
        for (const [key, value] of Object.entries(noteData.content)) {
            if (typeof value === 'string') {
                sanitized.content[key] = sanitizeInput(value);
            } else {
                sanitized.content[key] = value;
            }
        }
    }

    return sanitized;
}

/**
 * Validate email format
 * @param {string} email - Email to validate
 * @returns {boolean} Is valid email
 */
export function isValidEmail(email) {
    if (typeof email !== 'string') {
        return false;
    }
    
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(email);
}

/**
 * Validate hospital number (HN) format
 * @param {string} hn - HN to validate
 * @returns {boolean} Is valid HN format
 */
export function isValidHN(hn) {
    if (typeof hn !== 'string') {
        return false;
    }
    
    // Allow alphanumeric, hyphens, up to 20 characters
    const hnRegex = /^[a-zA-Z0-9\-]{1,20}$/;
    return hnRegex.test(hn);
}

/**
 * Escape string for safe SQL usage
 * @param {string} str - String to escape
 * @returns {string} Escaped string
 */
export function escapeForSQL(str) {
    if (typeof str !== 'string') {
        return str;
    }

    // Remove null bytes
    str = str.replace(/\0/g, '');

    // Escape single quotes
    str = str.replace(/'/g, "''");

    // Escape backslashes
    str = str.replace(/\\/g, '\\\\');

    return str;
}

export default {
    sanitizeInput,
    sanitizeObject,
    sanitizePatientData,
    sanitizeNoteContent,
    isValidEmail,
    isValidHN,
    escapeForSQL
};
