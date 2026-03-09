// Inject Mock Env
process.env.LIFF_ID = '1234567890-AbCdEfGh';
process.env.LINE_CHANNEL_ACCESS_TOKEN = 'mock';

// Mock DB
const mockDb = {
    query: async () => ({ rows: [{ line_user_id: 'U_TEST_NUDGE', name: 'Grandma' }] })
};

// Mock LINE
const mockLine = {
    pushMessage: async (userId, msg) => {
        console.log(`📡 [LINE Push] To: ${userId}`);
        console.log(`   Content: ${JSON.stringify(msg)}`);
        if (msg.contents.footer.contents[0].action.uri.includes('liff.line.me')) {
            console.log('   ✅ verified: Contains Call Button');
        } else {
            console.error('   ❌ FAIL: No Call Button detected');
        }
    }
};

// Patch Requires
require.cache[require.resolve('../services/db')] = { exports: mockDb };
require.cache[require.resolve('../services/line')] = { exports: mockLine };
require('node-cron'); // Just to satisfy require

const lambda = require('../scheduler');

console.log('🧪 Testing "The Active Nudge"...');
lambda.checkSilenceAndNudge().then(() => {
    console.log('🎉 Nudge Test Complete');
});
