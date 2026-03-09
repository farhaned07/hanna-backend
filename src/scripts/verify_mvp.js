// Inject Mock Env for Testing
process.env.LINE_CHANNEL_ACCESS_TOKEN = 'mock_token';
process.env.LINE_CHANNEL_SECRET = 'mock_secret';
require('dotenv').config();

// 1. Setup Mock DB BEFORE requiring other modules
const mockDb = {
    query: async (text, params) => {
        // console.log(`[MockDB] Query: ${text}`); 

        // Mock User Lookup
        if (text.includes('SELECT * FROM chronic_patients')) {
            return { rows: [{ id: 'test-patient-uuid', name: 'Mock Patient', line_user_id: 'U_TEST_123' }] };
        }

        // Mock Health Summary (for OneBrain)
        if (text.includes('FROM check_ins') || text.includes('getHealthSummary')) {
            // Return "bad" summary to force logic? Or clean?
            // Actually OneBrain calls healthData.getHealthSummary. 
            // We might need to mock healthData module too if we want full control, 
            // but assuming DB returns empty check-ins is fine (Risk = Medium).
            // But we want Emergency Keyword trigger to override everything!
            return { rows: [] };
        }

        // Mock Task Creation
        if (text.includes('INSERT INTO nurse_tasks')) {
            const priority = params[2]; // 3rd param is priority
            console.log(`✅ [MockDB] Nurse Task Inserted! Priority: ${priority}`);
            if (priority === 'critical') {
                console.log('   -> CRITICAL Priority Confirmed.');
            } else {
                console.error('   -> FAIL: Expected critical priority.');
            }
            return { rows: [] };
        }

        // Mock Task Check
        if (text.includes('SELECT * FROM nurse_tasks')) {
            return { rows: [] }; // No dupes
        }

        return { rows: [] };
    }
};

// Patch require cache
try {
    require.cache[require.resolve('../services/db')] = { exports: mockDb };
} catch (e) {
    // If not resolved yet, it's fine
}

// 2. Import Modules (they will use MockDb)
const { handleMessage } = require('../handlers/router');
const OneBrain = require('../services/OneBrain');

// Mock Event
const mockEvent = {
    replyToken: 'test_token',
    source: { userId: 'U_TEST_123' },
    message: { type: 'text', id: 'msg_1', text: 'I have chest pain' }
};

// Mock LINE Reply
const line = require('../services/line');
line.replyMessage = async (token, msg) => {
    console.log(`🤖 [Bot Reply] ${msg.text}`);
    return Promise.resolve();
};

async function verifyLogic() {
    console.log('🧪 Starting Logic Verification (Mock DB)...');

    // Trigger
    console.log('🗣 Sending "I have chest pain"...');
    await handleMessage(mockEvent);

    // If handleMessage calls OneBrain, and OneBrain calls DB.query(INSERT...), we see the log.

    console.log('🎉 Verification Complete.');
}

verifyLogic();
