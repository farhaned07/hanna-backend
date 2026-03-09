/**
 * Sentiment Analysis Service
 * Detects hedging/underreporting language in patient messages.
 * 
 * FALSE NEGATIVE MITIGATION:
 * Patients often minimize symptoms. This service flags hedging language
 * so OneBrain can boost risk scores for suspected underreporting.
 */

// Thai hedging patterns (minimizing language)
const THAI_HEDGING = [
    { pattern: /นิดหน่อย|นิดนึง|หน่อย/i, weight: 1 },
    { pattern: /ไม่ค่อย|ไม่มาก/i, weight: 1 },
    { pattern: /เบาๆ|แค่นิด/i, weight: 1 },
    { pattern: /พอทน|ทนได้/i, weight: 1 },
    { pattern: /ไม่หนัก|ไม่รุนแรง/i, weight: 1 }
];

// English hedging patterns
const ENGLISH_HEDGING = [
    { pattern: /a (little|bit|tiny)/i, weight: 1 },
    { pattern: /not (too|that|very) bad/i, weight: 2 },
    { pattern: /kind of|sort of|kinda/i, weight: 1 },
    { pattern: /just a slight/i, weight: 1 },
    { pattern: /barely|hardly/i, weight: 1 },
    { pattern: /i('m| am) (fine|okay|ok)/i, weight: 1 }
];

// Symptom keywords that increase concern when paired with hedging
const SYMPTOM_KEYWORDS = [
    // Thai
    'ปวด', 'เจ็บ', 'เหนื่อย', 'มึน', 'ใจสั่น', 'คลื่นไส้', 'อาเจียน',
    'วิงเวียน', 'ชา', 'บวม', 'หายใจ', 'แน่น', 'เมื่อย', 'หน้ามืด',
    // English
    'pain', 'hurt', 'ache', 'tired', 'dizzy', 'nausea', 'vomit',
    'numbness', 'swelling', 'breathing', 'chest', 'fatigue', 'weak'
];

/**
 * Analyze text for hedging patterns that suggest underreporting
 * @param {string} text - Patient message
 * @returns {object} { concernScore: 0-3, hedgingDetected: boolean, patterns: [], hasSymptomWithHedging: boolean }
 */
function analyzeHedging(text) {
    if (!text || typeof text !== 'string') {
        return { concernScore: 0, hedgingDetected: false, patterns: [], hasSymptomWithHedging: false };
    }

    const textLower = text.toLowerCase();
    let hedgingScore = 0;
    const detectedPatterns = [];

    // Check Thai hedging
    for (const { pattern, weight } of THAI_HEDGING) {
        if (pattern.test(text)) {
            hedgingScore += weight;
            detectedPatterns.push(pattern.source);
        }
    }

    // Check English hedging
    for (const { pattern, weight } of ENGLISH_HEDGING) {
        if (pattern.test(text)) {
            hedgingScore += weight;
            detectedPatterns.push(pattern.source);
        }
    }

    // Check for symptom keywords
    const hasSymptom = SYMPTOM_KEYWORDS.some(kw => textLower.includes(kw.toLowerCase()));
    const hasSymptomWithHedging = hasSymptom && hedgingScore > 0;

    // Boost concern if hedging + symptom detected together
    let concernScore = Math.min(hedgingScore, 2);
    if (hasSymptomWithHedging) {
        concernScore = Math.min(concernScore + 1, 3);
    }

    return {
        concernScore,
        hedgingDetected: hedgingScore > 0,
        patterns: detectedPatterns,
        hasSymptomWithHedging
    };
}

/**
 * Analyze recent chat history for underreporting patterns
 * @param {Array} chatHistory - Array of { role, content } messages
 * @returns {object} { maxConcern: 0-3, totalHedging: number, flaggedMessages: [] }
 */
function analyzeChatHistory(chatHistory) {
    if (!chatHistory || !Array.isArray(chatHistory)) {
        return { maxConcern: 0, totalHedging: 0, flaggedMessages: [] };
    }

    let maxConcern = 0;
    let totalHedging = 0;
    const flaggedMessages = [];

    // Only analyze patient (user) messages
    const userMessages = chatHistory.filter(msg => msg.role === 'user');

    for (const msg of userMessages) {
        const analysis = analyzeHedging(msg.content);
        if (analysis.hedgingDetected) {
            totalHedging++;
            if (analysis.concernScore >= 2 || analysis.hasSymptomWithHedging) {
                flaggedMessages.push({
                    content: msg.content.substring(0, 100),
                    ...analysis
                });
            }
        }
        maxConcern = Math.max(maxConcern, analysis.concernScore);
    }

    return { maxConcern, totalHedging, flaggedMessages };
}

module.exports = {
    analyzeHedging,
    analyzeChatHistory,
    THAI_HEDGING,
    ENGLISH_HEDGING,
    SYMPTOM_KEYWORDS
};
