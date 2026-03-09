const fetch = require('node-fetch');

async function testBilling() {
    const baseUrl = 'http://localhost:3000/api/scribe';
    console.log('--- Testing Billing Limits ---');

    try {
        const uniqueSuffix = Date.now().toString().slice(-6);
        const email = `billing_${uniqueSuffix}@hanna.care`;
        const pin = '123456';

        // 1. Register
        const regRes = await fetch(`${baseUrl}/auth/register`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email, pin, displayName: 'Dr. Billing Test', role: 'doctor' })
        });
        const regData = await regRes.json();
        const token = regData.token;
        console.log('✅ Registered user. Plan:', regData.user.plan);

        // 2. Artificially bump usage to 10 via DB hack script side-channel
        const db = require('../src/services/db');
        await db.query(`UPDATE clinicians SET notes_count_this_month = 10 WHERE id = $1`, [regData.user.id]);
        console.log('✅ Forced notes_count_this_month = 10');

        // 3. Create Session
        const sessionRes = await fetch(`${baseUrl}/sessions`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
            body: JSON.stringify({ patient_name: 'Limit Test', template_type: 'soap' })
        });
        const sessionData = await sessionRes.json();

        // 4. Update Transcript
        await fetch(`${baseUrl}/sessions/${sessionData.id}`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
            body: JSON.stringify({ transcript: 'This should fail.' })
        });

        // 5. Try generating note
        console.log('\n[5] Attempting to generate 11th note...');
        const noteRes = await fetch(`${baseUrl}/sessions/${sessionData.id}/generate-note`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
            body: JSON.stringify({ templateType: 'soap' })
        });

        if (noteRes.status === 402) {
            console.log('✅ Success! Backend correctly returned 402 Payment Required:', await noteRes.json());
        } else {
            console.error('❌ Failed! Backend returned:', noteRes.status, await noteRes.text());
        }
        process.exit(0);
    } catch (err) {
        console.error(err);
        process.exit(1);
    }
}

testBilling();
