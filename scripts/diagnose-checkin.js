require('dotenv').config();
const db = require('./src/services/db');
const line = require('./src/services/line');

console.log('🔍 Hanna Daily Check-in Diagnostic Tool\n');

(async () => {
    try {
        // Step 1: Check database connection
        console.log('1️⃣  Checking database connection...');
        await db.query('SELECT 1');
        console.log('   ✅ Database connected\n');

        // Step 2: Check all users
        console.log('2️⃣  Checking all users in database...');
        const allUsers = await db.query(
            `SELECT 
                line_user_id, 
                name, 
                enrollment_status, 
                onboarding_step,
                trial_start_date,
                trial_end_date,
                created_at
            FROM chronic_patients 
            ORDER BY created_at DESC`
        );

        console.log(`   Found ${allUsers.rows.length} total users:\n`);
        allUsers.rows.forEach((user, index) => {
            console.log(`   User ${index + 1}:`);
            console.log(`     Name: ${user.name || '(not set)'}`);
            console.log(`     LINE ID: ${user.line_user_id}`);
            console.log(`     Status: ${user.enrollment_status}`);
            console.log(`     Onboarding Step: ${user.onboarding_step}`);
            console.log(`     Trial Start: ${user.trial_start_date || '(not set)'}`);
            console.log(`     Trial End: ${user.trial_end_date || '(not set)'}`);
            console.log(`     Created: ${user.created_at}`);
            console.log('');
        });

        // Step 3: Check eligible users for check-ins
        console.log('3️⃣  Checking users eligible for daily check-ins...');
        const eligibleUsers = await db.query(
            "SELECT line_user_id, name, enrollment_status FROM chronic_patients WHERE enrollment_status IN ('active', 'trial')"
        );

        if (eligibleUsers.rows.length === 0) {
            console.log('   ❌ NO USERS ELIGIBLE FOR CHECK-INS!');
            console.log('   \n   🔧 PROBLEM FOUND:');
            console.log('      Your enrollment_status is likely still "onboarding"');
            console.log('      It needs to be "trial" or "active" to receive check-ins\n');

            // Check if there are users in onboarding status
            const onboardingUsers = await db.query(
                "SELECT line_user_id, name, enrollment_status, onboarding_step FROM chronic_patients WHERE enrollment_status = 'onboarding'"
            );

            if (onboardingUsers.rows.length > 0) {
                console.log('   Users stuck in onboarding:');
                onboardingUsers.rows.forEach(user => {
                    console.log(`     - ${user.name || user.line_user_id} (step ${user.onboarding_step})`);
                });
                console.log('\n   💡 SOLUTION:');
                console.log('      Complete the onboarding flow in LINE, or manually update the database:\n');
                console.log('      UPDATE chronic_patients');
                console.log("      SET enrollment_status = 'trial',");
                console.log('          trial_start_date = NOW(),');
                console.log("          trial_end_date = NOW() + INTERVAL '14 days'");
                console.log(`      WHERE line_user_id = '${onboardingUsers.rows[0].line_user_id}';\n`);
            }
        } else {
            console.log(`   ✅ Found ${eligibleUsers.rows.length} eligible users:\n`);
            eligibleUsers.rows.forEach(user => {
                console.log(`     - ${user.name || user.line_user_id} (${user.enrollment_status})`);
            });
            console.log('');

            // Step 4: Test sending a message
            console.log('4️⃣  Testing message delivery...\n');
            console.log('   Would you like to send a TEST check-in message now? (y/n)');
            console.log('   (Skipping automatic send to avoid spam)\n');

            console.log('   To manually send, uncomment the code below and run again:\n');
            console.log('   /*');
            console.log('   for (const user of eligibleUsers.rows) {');
            console.log('       await line.pushMessage(user.line_user_id, {');
            console.log('           type: "text",');
            console.log('           text: `[TEST] สวัสดีค่ะ คุณ${user.name || ""} ☀️\\nนี่คือการทดสอบระบบเช็คอินนะคะ`');
            console.log('       });');
            console.log('       console.log(`   ✅ Sent to ${user.name}`);');
            console.log('   }');
            console.log('   */\n');
        }

        // Step 5: Summary
        console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
        console.log('📊 DIAGNOSTIC SUMMARY\n');
        console.log(`Total users: ${allUsers.rows.length}`);
        console.log(`Eligible for check-ins: ${eligibleUsers.rows.length}`);
        console.log('');

        if (eligibleUsers.rows.length === 0) {
            console.log('🚨 ISSUE: No users eligible for daily check-ins');
            console.log('   Reason: enrollment_status is not "trial" or "active"');
            console.log('   Fix: Complete onboarding or update database manually');
        } else {
            console.log('✅ Users are eligible for check-ins');
            console.log('');
            console.log('⚠️  If you still didn\'t receive messages, check:');
            console.log('   1. Is the server running 24/7? (locally or Railway)');
            console.log('   2. Check server logs for "Running morning check-in..." at 8 AM');
            console.log('   3. Verify LINE_CHANNEL_ACCESS_TOKEN is correct');
        }
        console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

    } catch (error) {
        console.error('❌ Error:', error.message);
        console.error(error);
    } finally {
        process.exit(0);
    }
})();
