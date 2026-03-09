const fs = require('fs');
const path = require('path');

async function runTest() {
    const baseUrl = 'http://localhost:3000/api/scribe';
    console.log('--- Starting Scribe E2E Integration Test ---');

    try {
        // 1. Register a new user
        console.log('\n[1] Registering test user...');
        const uniqueSuffix = Date.now().toString().slice(-6);
        const email = `test_${uniqueSuffix}@hanna.care`;
        const pin = '123456';
        const displayName = `Dr. Test ${uniqueSuffix}`;

        const regRes = await fetch(`${baseUrl}/auth/register`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email, pin, displayName, role: 'doctor' })
        });

        let token;
        if (regRes.ok) {
            const regData = await regRes.json();
            console.log('✅ Registration successful');
            token = regData.token;
        } else {
            console.log('⚠️ Registration failed (might exist), falling back to login...');

            // 2. Login
            console.log('\n[2] Logging in...');
            const loginRes = await fetch(`${baseUrl}/auth/login`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ email, pin })
            });

            if (!loginRes.ok) {
                console.error('❌ Login failed:', await loginRes.text());
                return;
            }
            const loginData = await loginRes.json();
            console.log('✅ Login successful');
            token = loginData.token;
        }

        // 3. Create a Session
        console.log('\n[3] Creating session...');
        const sessionRes = await fetch(`${baseUrl}/sessions`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`
            },
            body: JSON.stringify({ patient_name: 'John Doe', patient_hn: 'HN-12345', template_type: 'soap' })
        });

        if (!sessionRes.ok) throw new Error(`Create session failed: ${await sessionRes.text()}`);
        const sessionData = await sessionRes.json();
        console.log('✅ Session created. ID:', sessionData.id);

        // 4. Update Session with mock transcript
        console.log('\n[4] Simulating transcription update...');
        const mockTranscript = "คนไข้ชายไทย อายุ 45 ปี มาด้วยอาการปวดหัวตื้อๆ บริเวณขมับทั้งสองข้าง เป็นมา 3 วัน ไม่มีไข้ ไม่คลื่นไส้อาเจียน กินพาราแล้วดีขึ้นชั่วคราว ความดัน 140/90 pulse 80. วินิจฉัยว่าเป็น Tension headache ให้ยา Paracetamol และ NSS กลับไปทาน แนะนำให้พักผ่อนให้เพียงพอ นัดติดตามอาการ 1 สัปดาห์ถ้าไม่ดีขึ้น";

        const updateRes = await fetch(`${baseUrl}/sessions/${sessionData.id}`, {
            method: 'PATCH',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`
            },
            body: JSON.stringify({ transcript: mockTranscript, status: 'transcribed' })
        });

        if (!updateRes.ok) throw new Error(`Update session failed: ${await updateRes.text()}`);
        console.log('✅ Session updated with transcript');

        // 5. Generate Note via AI
        console.log('\n[5] Generating Clinical Note via Groq (Llama 3)...');
        console.log('⏳ This usually takes 3-10 seconds...');
        const noteRes = await fetch(`${baseUrl}/sessions/${sessionData.id}/generate-note`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`
            },
            body: JSON.stringify({ templateType: 'soap' }) // use default generic soap prompt
        });

        if (!noteRes.ok) throw new Error(`Note generation failed: ${await noteRes.text()}`);
        const noteData = await noteRes.json();
        console.log('✅ Note generated successfully!');

        console.log('\n[Output JSON Document]:');
        console.log(JSON.stringify(noteData.content, null, 2));

        console.log('\n--- E2E Test Completed Successfully ---');

    } catch (error) {
        console.error('\n❌ Test Failed:', error.message);
    }
}

runTest();
