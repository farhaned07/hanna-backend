const OpenAI = require('openai');
const { EdgeTTS } = require('@travisvn/edge-tts');
const fs = require('fs');
const path = require('path');
const os = require('os');

// Initialize Groq (Llama 3.1 70B -> 3.3 Versatile)
const groq = new OpenAI({
    apiKey: process.env.GROQ_API_KEY || 'mock-key',
    baseURL: 'https://api.groq.com/openai/v1'
});

/**
 * Process Voice Chat Interaction
 * @param {string} userText 
 * @param {string} userId 
 * @returns {Promise<Object>} { text, audioBase64 }
 */
async function processVoiceQuery(userText, userId) {
    let aiText = "";

    const { HANNA_SYSTEM_PROMPT } = require('../config/prompts');

    // 1. LLM Generation (Groq/Llama)
    try {
        console.log(`[VoiceAgent] Processing: "${userText}" for ${userId}`);
        const completion = await groq.chat.completions.create({
            messages: [
                { role: "system", content: HANNA_SYSTEM_PROMPT },
                { role: "user", content: userText }
            ],
            model: "llama-3.3-70b-versatile",
            temperature: 0.7,
            max_tokens: 150,
        });
        aiText = completion.choices[0]?.message?.content || "ขอโทษค่ะ ฮันนาไม่เข้าใจ";
    } catch (llmError) {
        console.error("[VoiceAgent] LLM Error:", llmError);
        return { text: "ระบบสมองกำลังปรับปรุงค่ะ (LLM Error)", audio: null };
    }

    // 2. TTS Generation (EdgeTTS - Premwadee)
    try {
        const tts = new EdgeTTS(aiText, 'th-TH-PremwadeeNeural');
        const result = await tts.synthesize();
        const audioBase64 = Buffer.from(await result.audio.arrayBuffer()).toString('base64');

        return { text: aiText, audio: audioBase64 };

    } catch (ttsError) {
        console.warn("[VoiceAgent] EdgeTTS Error:", ttsError);
        return { text: aiText, audio: null };
    }
}

module.exports = { processVoiceQuery };
