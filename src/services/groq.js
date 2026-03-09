const Groq = require('groq-sdk');
const fs = require('fs');
const path = require('path');
const os = require('os');
const db = require('./db');
const { transcribeAudio } = require('./deepgram'); // Use Deepgram instead of OpenAI

const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });

/**
 * 🎤 Transcribe Audio using Deepgram
 * Already imported from ./deepgram
 */
// transcribeAudio function is imported from ./deepgram.js

/**
 * 🧠 Speaking: Generate Response using Llama 3 (Open Weights)
 * Model: llama-3.3-70b-versatile
 * 
 * @param {string} userText - User's message
 * @param {object} riskProfile - Risk analysis from OneBrain
 * @param {number|null} patientId - Patient ID for context injection
 * @param {Array} conversationHistory - Recent conversation messages from DB
 */
const generateChatResponse = async (userText, riskProfile = {}, patientId = null, conversationHistory = []) => {
    try {
        // ============================================================
        // PATIENT CONTEXT INJECTION (NEW - Tier 1, Task 1.3)
        // ============================================================
        let patientContext = '';

        if (patientId) {
            try {
                // Fetch patient profile
                const patientResult = await db.query(
                    'SELECT * FROM chronic_patients WHERE id = $1',
                    [patientId]
                );
                const patient = patientResult.rows[0];

                if (patient) {
                    const healthData = require('../handlers/healthData');
                    const summary = await healthData.getHealthSummary(patient.line_user_id, 7);

                    // Build rich patient context
                    patientContext = buildPatientContext(patient, summary, riskProfile);
                }
            } catch (contextError) {
                console.warn('⚠️ [Groq] Could not fetch patient context:', contextError.message);
                // Continue without context (graceful degradation)
            }
        }

        // ============================================================
        // TONE CALIBRATION (Based on Risk)
        // ============================================================
        let toneInstruction = "Be friendly, warm, and encouraging. Like a caring granddaughter (Thai: หลานสาว).";
        if (riskProfile.level === 'high' || riskProfile.level === 'critical') {
            toneInstruction = "Be calm but URGENT. Keep sentences short. Show concern. Advise professional help immediately.";
        }

        const riskContext = riskProfile.reasons && riskProfile.reasons.length > 0
            ? `\nRISK ALERT: ${riskProfile.level.toUpperCase()} (${riskProfile.reasons.join(', ')})`
            : '';

        const positiveContext = riskProfile.positiveSignals && riskProfile.positiveSignals.length > 0
            ? `\nPOSITIVE STATUS: ${riskProfile.positiveSignals.join(', ')}`
            : '';

        // ============================================================
        // CONSTRUCT MESSAGES FOR LLM
        // ============================================================
        const { HANNA_SYSTEM_PROMPT } = require('../config/prompts');

        const messages = [
            { role: 'system', content: HANNA_SYSTEM_PROMPT }
        ];

        // Add patient context if available
        if (patientContext) {
            messages.push({ role: 'system', content: patientContext });
        }

        // Add dynamic tone and risk context
        messages.push({
            role: 'system',
            content: `Current Situation:\n${toneInstruction}\n${riskContext}${positiveContext}`
        });

        // Add conversation history (last 20 messages)
        if (conversationHistory && conversationHistory.length > 0) {
            const formattedHistory = conversationHistory
                .filter(msg => msg.role !== 'system')
                .map(msg => ({ role: msg.role, content: msg.content }));

            messages.push(...formattedHistory);
        }

        // Add current user message
        messages.push({ role: 'user', content: userText });

        // ============================================================
        // CALL GROQ API
        // ============================================================
        const completion = await groq.chat.completions.create({
            messages,
            model: "llama-3.3-70b-versatile",
            temperature: 0.6,
            max_tokens: 300,
        });

        const reply = completion.choices[0]?.message?.content || "ขออภัยค่ะ ฮันนากำลังคิดนิดนึงค่ะ";
        console.log(`🧠 [Groq] Reply: "${reply}"`);

        return reply;

    } catch (error) {
        console.error('❌ [Groq] Chat Error:', error);

        // Rule-based fallback when AI is unavailable
        return generateFallbackResponse(userText, riskProfile);
    }
};

/**
 * Build patient context message for LLM injection
 * @private
 */
function buildPatientContext(patient, summary, riskProfile) {
    const age = patient.age || 'Unknown';
    const condition = patient.condition || 'Not specified';
    const name = patient.name || 'Patient';

    let context = `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
PATIENT CONTEXT (Use this to personalize your response)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Patient: ${name}, Age: ${age}
Condition: ${condition}
Current Risk Level: ${riskProfile.level?.toUpperCase() || 'UNKNOWN'} (Score: ${riskProfile.score || 0}/10)
`;

    if (riskProfile.reasons && riskProfile.reasons.length > 0) {
        context += `Risk Reasons: ${riskProfile.reasons.join(', ')}\n`;
    }

    if (summary) {
        context += `\nRecent Health Data (Last 7 Days):
- Check-ins: ${summary.totalCheckIns || 0} times
- Medication Adherence: ${summary.adherencePercent || 0}% (${summary.medicationsTaken || 0}/${(summary.medicationsTaken || 0) + (summary.medicationsMissed || 0)})
`;

        if (summary.averageGlucose) {
            context += `- Average Glucose: ${Math.round(summary.averageGlucose)} mg/dL\n`;
        }

        if (summary.latestBP) {
            context += `- Latest Blood Pressure: ${summary.latestBP.systolic}/${summary.latestBP.diastolic} mmHg\n`;
        }

        if (summary.goodMoodDays) {
            context += `- Good Mood Days: ${summary.goodMoodDays}/${summary.totalCheckIns}\n`;
        }
    }

    if (riskProfile.positiveSignals && riskProfile.positiveSignals.length > 0) {
        context += `\nPositive Signals: ${riskProfile.positiveSignals.join(', ')}\n`;
    }

    context += `
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Instructions:
- Reference this context naturally in your response
- Acknowledge improvements or concerns based on their data
- Personalize advice to their specific condition
- Be encouraging if you see positive trends
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
`;

    return context;
}

/**
 * Rule-based fallback response when Groq API is unavailable
 * Provides safe, contextual responses based on detected intent
 */
const generateFallbackResponse = (userText, riskProfile = {}) => {
    const text = userText.toLowerCase();

    // Emergency phrases - always prioritize safety
    const emergencyPhrases = ['chest pain', 'เจ็บหน้าอก', 'breathe', 'หายใจไม่ออก', 'faint', 'จะเป็นลม'];
    if (emergencyPhrases.some(p => text.includes(p))) {
        return '🚨 ได้ยินอาการของคุณแล้วค่ะ! กรุณาโทร 1669 ทันที หรือไปห้องฉุกเฉินใกล้บ้านนะคะ พยาบาลจะติดต่อกลับเร็วที่สุดค่ะ';
    }

    // High risk patient - be cautious
    if (riskProfile.level === 'critical' || riskProfile.level === 'high') {
        return 'ขอบคุณที่บอกนะคะ ฮันนาได้แจ้งพยาบาลให้ทราบแล้ว จะติดต่อกลับโดยเร็วค่ะ 💚';
    }

    // Medication-related
    if (text.includes('ยา') || text.includes('กิน') || text.includes('medication')) {
        return 'อย่าลืมกินยาตรงเวลานะคะ 💊 หากมีคำถามเรื่องยา สามารถปรึกษาเภสัชกรหรือหมอของคุณได้ค่ะ';
    }

    // Glucose/sugar-related
    if (text.includes('น้ำตาล') || text.includes('glucose') || text.includes('sugar')) {
        return 'การวัดน้ำตาลสม่ำเสมอช่วยควบคุมได้ดีค่ะ 📊 หากค่าสูงหรือต่ำผิดปกติ กรุณาแจ้งหมอนะคะ';
    }

    // Feeling unwell
    if (text.includes('ไม่สบาย') || text.includes('เจ็บ') || text.includes('ปวด') || text.includes('sick')) {
        return 'เสียใจที่ไม่สบายนะคะ 😔 พักผ่อนเยอะๆ ดื่มน้ำมากๆ หากอาการไม่ดีขึ้นใน 24 ชม. ควรพบแพทย์ค่ะ';
    }

    // Positive/greetings
    if (text.includes('ดี') || text.includes('สบาย') || text.includes('good') || text.includes('fine')) {
        return 'ดีใจที่สบายดีค่ะ! 💚 ขอให้วันนี้เป็นวันที่ดีต่อไปนะคะ อย่าลืมดูแลสุขภาพ';
    }

    // Default fallback
    return 'ขอบคุณที่ส่งข้อความมาค่ะ 💚 ขณะนี้ระบบกำลังปรับปรุง หากต้องการพูดคุยกับพยาบาล กรุณากดปุ่มโทรได้เลยนะคะ';
};

/**
 * 📋 Scribe: Generate Clinical Note from Transcript
 * Takes raw transcript + template type → structured clinical note
 */
const generateClinicalNote = async (transcript, templateType, promptTemplate) => {
    try {
        console.log(`📋 [Groq] Generating ${templateType} note from transcript...`);

        // Build the prompt from template or use default
        let prompt;
        if (promptTemplate) {
            prompt = promptTemplate.replace('{transcript}', transcript);
        } else {
            prompt = `You are a clinical documentation AI. Given this transcript of a patient encounter, generate a structured ${templateType.toUpperCase()} note.

Transcript:
${transcript}

Generate JSON output with appropriate clinical sections. Return valid JSON only.`;
        }

        const chatCompletion = await groq.chat.completions.create({
            messages: [
                {
                    role: 'system',
                    content: 'You are a medical documentation AI assistant. You generate structured clinical notes from patient encounter transcripts. Always output valid JSON only, no markdown, no explanation text.'
                },
                {
                    role: 'user',
                    content: prompt
                }
            ],
            model: 'llama-3.3-70b-versatile',
            temperature: 0.3,
            max_tokens: 2000,
            response_format: { type: 'json_object' }
        });

        const responseText = chatCompletion.choices[0]?.message?.content || '{}';
        console.log(`📋 [Groq] Note generated: ${responseText.substring(0, 100)}...`);

        // Parse JSON response
        try {
            return JSON.parse(responseText);
        } catch (parseErr) {
            console.error('📋 [Groq] JSON parse error, returning raw:', parseErr);
            return { text: responseText };
        }
    } catch (error) {
        console.error('❌ [Groq] Clinical note generation error:', error);
        throw new Error('Failed to generate clinical note');
    }
};

/**
 * 📋 Scribe: Generate Handover Summary from Day's Notes
 * Combines all notes from a shift into a handover summary
 */
const generateHandoverSummary = async (notes) => {
    try {
        console.log(`📋 [Groq] Generating handover from ${notes.length} notes...`);

        const noteSummaries = notes.map((n, i) => {
            const content = typeof n.content === 'string' ? JSON.parse(n.content) : n.content;
            return `Patient ${i + 1}: ${n.patient_name || 'Unknown'}${n.patient_hn ? ` (HN: ${n.patient_hn})` : ''}
${n.content_text || JSON.stringify(content)}`;
        }).join('\n\n---\n\n');

        const chatCompletion = await groq.chat.completions.create({
            messages: [
                {
                    role: 'system',
                    content: 'You are a clinical documentation AI. Generate a concise shift handover summary from the provided clinical notes. Output valid JSON only.'
                },
                {
                    role: 'user',
                    content: `Given these clinical notes from today's shift, generate a handover summary.

${noteSummaries}

Generate JSON in this format:
{
  "patients": [
    {
      "name": "Patient name",
      "summary": "Brief summary of condition, treatment, and follow-up needed",
      "urgent": false
    }
  ]
}

Mark patients as "urgent": true if they need immediate attention from the next shift.
Return valid JSON only.`
                }
            ],
            model: 'llama-3.3-70b-versatile',
            temperature: 0.3,
            max_tokens: 2000,
            response_format: { type: 'json_object' }
        });

        const responseText = chatCompletion.choices[0]?.message?.content || '{}';
        console.log(`📋 [Groq] Handover generated: ${responseText.substring(0, 100)}...`);

        try {
            return JSON.parse(responseText);
        } catch (parseErr) {
            console.error('📋 [Groq] Handover JSON parse error:', parseErr);
            return { patients: [] };
        }
    } catch (error) {
        console.error('❌ [Groq] Handover generation error:', error);
        throw new Error('Failed to generate handover summary');
    }
};

/**
 * 🔄 Scribe: Regenerate Specific Section
 * Re-writes one SOAP section based on transcript + instruction
 */
const regenerateSection = async (transcript, sectionKey, currentContent, instruction) => {
    try {
        console.log(`🔄 [Groq] Regenerating section ${sectionKey}...`);

        const prompt = `You are a clinical documentation AI. 
The user wants to rewrite the "${sectionKey.toUpperCase()}" section of a clinical note.

Transcript:
${transcript}

Current Content:
${currentContent || '(Empty)'}

Instruction: ${instruction || 'Improve accuracy and professional tone.'}

Generate ONLY the new content for the "${sectionKey}" section. 
Do not include keys, markdown formatting, or explanations. Just the text.`;

        const chatCompletion = await groq.chat.completions.create({
            messages: [
                { role: 'system', content: 'You are an expert medical scribe. Output only the requested section text.' },
                { role: 'user', content: prompt }
            ],
            model: 'llama-3.3-70b-versatile',
            temperature: 0.3,
            max_tokens: 1000
        });

        const newContent = chatCompletion.choices[0]?.message?.content || currentContent;
        console.log(`🔄 [Groq] Section regenerated.`);
        return newContent;

    } catch (error) {
        console.error('❌ [Groq] Section regeneration error:', error);
        throw new Error('Failed to regenerate section');
    }
};

/**
 * 🪄 Scribe: Apply Natural Language Command
 * Edits the entire note based on user instruction (e.g. "Make it more concise")
 */
const applyNoteCommand = async (currentSections, command, transcript) => {
    try {
        console.log(`🪄 [Groq] Applying command: "${command}"...`);

        const prompt = `You are a clinical documentation AI.
Current Note Sections:
${JSON.stringify(currentSections, null, 2)}

Transcript Context:
${transcript ? transcript.substring(0, 2000) + '...' : '(No transcript available)'}

User Command: "${command}"

Task: Update the clinical note sections based on the user's command.
Maintain the JSON structure { "subjective": "...", "objective": "...", "assessment": "...", "plan": "..." }.
Only modify what is necessary. Return valid JSON only.`;

        const chatCompletion = await groq.chat.completions.create({
            messages: [
                { role: 'system', content: 'You are a medical AI. Output valid JSON only. Key names must be lowercase.' },
                { role: 'user', content: prompt }
            ],
            model: 'llama-3.3-70b-versatile',
            temperature: 0.3,
            max_tokens: 2000,
            response_format: { type: 'json_object' }
        });

        const responseText = chatCompletion.choices[0]?.message?.content || '{}';
        return JSON.parse(responseText);

    } catch (error) {
        console.error('❌ [Groq] Command application error:', error);
        throw new Error('Failed to apply command');
    }
};

module.exports = {
    transcribeAudio,
    generateChatResponse,
    generateClinicalNote,
    generateHandoverSummary,
    regenerateSection,
    applyNoteCommand
};
