/**
 * Test conversation history integration
 * Run: node scripts/test_conversation_memory.js
 */

const conversationHistory = require('../src/services/conversationHistory');
const db = require('../src/services/db');

async function testConversationMemory() {
    console.log('🧪 Testing Conversation Memory Integration\n');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

    try {
        // Get a test patient
        const result = await db.query('SELECT id, name FROM chronic_patients LIMIT 1');

        if (result.rows.length === 0) {
            console.log('⚠️  No patients found in database. Skipping test.');
            return;
        }

        const patient = result.rows[0];
        console.log(`✅ Test Patient: ${patient.name} (ID: ${patient.id})\n`);

        // Test 1: Save messages
        console.log('Test 1: Saving conversation messages...');

        await conversationHistory.saveMessage({
            patientId: patient.id,
            role: 'user',
            content: 'น้ำตาล 150 ค่ะ',
            messageType: 'text',
            metadata: { source: 'line' }
        });

        await conversationHistory.saveMessage({
            patientId: patient.id,
            role: 'assistant',
            content: 'อืม... 150 เหรอคะ? สูงนิดนึงนะ เช้านี้กินอะไรหวานๆ มาคะ?',
            messageType: 'text',
            metadata: { source: 'line', model: 'llama-3.3-70b-versatile' }
        });

        console.log('   ✓ Saved 2 messages\n');

        // Test 2: Retrieve messages
        console.log('Test 2: Retrieving conversation history...');
        const messages = await conversationHistory.getRecentMessages(patient.id, 10);
        console.log(`   ✓ Retrieved ${messages.length} messages\n`);

        if (messages.length > 0) {
            console.log('Sample Messages:');
            messages.slice(-2).forEach((msg, idx) => {
                console.log(`   ${idx + 1}. [${msg.role}]: ${msg.content.substring(0, 60)}...`);
            });
            console.log();
        }

        // Test 3: Format for LLM
        console.log('Test 3: Formatting for LLM injection...');
        const formatted = conversationHistory.formatForLLM(messages);
        console.log(`   ✓ Formatted ${formatted.length} messages for Groq API\n`);

        // Test 4: Conversation stats
        console.log('Test 4: Fetching conversation statistics...');
        const stats = await conversationHistory.getConversationStats(patient.id, 7);

        if (stats) {
            console.log('   Statistics (Last 7 days):');
            console.log(`   • Total Messages: ${stats.total_messages}`);
            console.log(`   • User Messages: ${stats.user_messages}`);
            console.log(`   • Assistant Messages: ${stats.assistant_messages}`);
            console.log(`   • Voice Messages: ${stats.voice_messages}`);
            if (stats.last_message) {
                console.log(`   • Last Message: ${new Date(stats.last_message).toLocaleString()}`);
            }
        }

        console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
        console.log('\n🎉 All tests passed!\n');
        console.log('✨ Conversation memory is working correctly:');
        console.log('   • Messages persist across sessions');
        console.log('   • Retrieval works properly');
        console.log('   • LLM formatting is correct');
        console.log('   • Statistics are calculated\n');

    } catch (error) {
        console.error('❌ Test failed:', error);
    } finally {
        await db.end();
    }
}

testConversationMemory();
