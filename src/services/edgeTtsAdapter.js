const { EdgeTTS } = require('@travisvn/edge-tts');

/**
 * Generates audio buffer from text using Microsoft Edge TTS (Premwadee)
 * @param {string} text - Text to speak
 * @returns {Promise<Buffer>} - Audio buffer (MP3)
 */
const generateSpeech = async (text) => {
    try {
        if (!text) return null;

        const tts = new EdgeTTS({
            voice: 'th-TH-PremwadeeNeural',
            lang: 'th-TH',
            outputFormat: 'audio-24khz-48kbitrate-mono-mp3'
        });

        // EdgeTTS library 'synthesize' method returns an object with 'audio' (Blob/ArrayBuffer-like)
        // Wait, checking the library usage again from my memory of 'agent.js' fix:
        // agent.js used: new EdgeTTS(text, voice).synthesize()

        // Re-aligning with the Agent.js successful implementation:
        const ttsClient = new EdgeTTS(text, 'th-TH-PremwadeeNeural');
        const result = await ttsClient.synthesize();

        // Convert to Buffer for Node.js usage (sending to Storage/LINE)
        const buffer = Buffer.from(await result.audio.arrayBuffer());

        return buffer;
    } catch (error) {
        console.error('[EdgeTTS] Error generating speech:', error);
        return null;
    }
};

module.exports = { generateSpeech };
