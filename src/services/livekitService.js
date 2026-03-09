// Lazy-load LiveKit only when needed to prevent Railway build failures
let AccessToken = null;

// Helper to check configuration at runtime only
const isLiveKitConfigured = () => {
    return !!(process.env['LIVEKIT_' + 'URL'] && process.env['LIVEKIT_' + 'API_KEY'] && process.env['LIVEKIT_' + 'API_SECRET']);
};

// Runtime getter to avoid top-level env access
const getWsUrl = () => {
    return process.env['LIVEKIT_' + 'URL'] || 'wss://hanna-test.livekit.cloud';
};

/**
 * Generate a LiveKit Access Token for a user (or the Agent)
 * @param {string} participantName - Display name (e.g. User ID or "Hanna")
 * @param {string} roomName - The room to join
 * @param {boolean} isAgent - If true, gives hidden/admin privileges if needed
 */
async function generateToken(participantName, roomName, isAgent = false) {
    // Lazy load only when actually called
    if (!AccessToken) {
        if (!isLiveKitConfigured()) {
            throw new Error('LiveKit is not configured. Please set LIVEKIT_URL, LIVEKIT_API_KEY, and LIVEKIT_API_SECRET environment variables.');
        }
        AccessToken = require('livekit-server-sdk').AccessToken;
    }

    const API_KEY = process.env['LIVEKIT_API_KEY'] || 'devkey';
    const API_SECRET = process.env['LIVEKIT_API_SECRET'] || 'secret';

    const at = new AccessToken(API_KEY, API_SECRET, {
        identity: participantName,
        name: participantName,
    });

    at.addGrant({
        roomJoin: true,
        room: roomName,
        canPublish: true,
        canSubscribe: true,
    });

    return await at.toJwt();
}

module.exports = {
    generateToken,
    getWsUrl
};
