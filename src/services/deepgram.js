const { createClient } = require('@deepgram/sdk');
const { getAllMedicalTerms, getBoostedTerms } = require('./medicalTerms');

// Lazy initialization - only create client when API key is available
let deepgram = null;

const getDeepgramClient = () => {
    if (!deepgram) {
        const apiKey = process.env.DEEPGRAM_API_KEY;
        if (!apiKey) {
            console.warn('⚠️ [Deepgram] No API key provided - transcription will be disabled');
            return null;
        }
        deepgram = createClient(apiKey);
    }
    return deepgram;
};

/**
 * 🎤 Transcribe Audio using Deepgram
 * Model: nova-2 (General) - supports 30+ languages
 * Features:
 * - True multilingual detection (auto-detects language)
 * - Code-switching support (mixing languages in one sentence)
 * - 200+ medical terms across 8 languages
 * - Boosted recognition for common medical terms
 * 
 * Supported Languages:
 * 🇹🇭 Thai (th) | 🇧🇩 Bangla (bn) | 🇬🇧 English (en)
 * 🇮🇳 Hindi (hi) | 🇵🇰 Urdu (ur) | 🇪🇸 Spanish (es)
 * 🇫🇷 French (fr) | 🇸🇦 Arabic (ar)
 */
const transcribeAudio = async (audioBuffer) => {
    try {
        console.log('🎤 [Deepgram] Transcribing audio...');

        const client = getDeepgramClient();
        if (!client) {
            console.error('❌ [Deepgram] Client not initialized - no API key');
            return '';
        }

        // Get comprehensive medical terminology
        const allMedicalTerms = getAllMedicalTerms();
        const boostedTerms = getBoostedTerms();

        console.log(`📚 [Deepgram] Loaded ${allMedicalTerms.length} medical terms`);
        console.log(`🚀 [Deepgram] Boosted ${boostedTerms.length} high-priority terms`);

        // Use Deepgram's most advanced multilingual model
        const result = await client.listen.prerecorded.transcribeFile(
            audioBuffer,
            {
                // Model: nova-2 supports 30+ languages with auto-detection
                model: 'nova-2',
                
                // True multilingual mode - no language bias
                language: null, // Auto-detect from 30+ languages
                detect_language: true, // Enable language ID
                multilingual: true, // Enable code-switching support
                
                // Get multiple alternatives for better accuracy
                alternatives: 2,
                
                // Smart formatting for medical text
                smart_format: true,
                utterances: true,
                filler_words: false,
                punctuate: true,
                paragraphs: true,
                diarize: false, // Not needed for medical notes
                
                // Comprehensive medical terminology (200+ terms)
                keywords: allMedicalTerms,
                
                // Boost recognition for most common terms
                boost: boostedTerms,
                
                // Additional optimizations
                numerals: true, // Convert numbers to digits
                search: boostedTerms, // Search for key terms
                replace: [], // No replacements needed
                profanity_filter: false, // Don't filter medical terms
            }
        );

        console.log('🎤 [Deepgram] Raw response:', JSON.stringify(result, null, 2).substring(0, 500));

        // Get the best transcript (first alternative)
        const transcript = result.result?.results?.channels?.[0]?.alternatives?.[0]?.transcript || '';
        
        // Get detected language (if available)
        const detectedLanguage = result.result?.results?.channels?.[0]?.detected_language || 'unknown';
        console.log(`🌍 [Deepgram] Detected language: ${detectedLanguage}`);
        
        console.log(`🎤 [Deepgram] Transcript: "${transcript}"`);
        return transcript.trim();

    } catch (error) {
        console.error('❌ [Deepgram] Transcription Error:', error.message);
        console.error('❌ [Deepgram] Error details:', JSON.stringify(error, null, 2));
        
        // Check for specific error types
        if (error.message.includes('corrupt or unsupported')) {
            console.error('❌ [Deepgram] Audio format issue - expected WebM/MP4 with Opus codec');
        } else if (error.message.includes('400')) {
            console.error('❌ [Deepgram] Bad Request - check audio format and API key');
        } else if (error.message.includes('401')) {
            console.error('❌ [Deepgram] Authentication failed - check API key');
        }
        
        // Fallback: Return empty string instead of null
        // This prevents the entire flow from breaking
        return '';
    }
};

module.exports = { transcribeAudio };
