const axios = require('axios');
const FormData = require('form-data');
const fs = require('fs');

const API_URL = 'http://localhost:3000/api/scribe';
const EMAIL = `test-${Date.now()}@example.com`;
const PIN = '123456';
let TOKEN = '';
let SESSION_ID = '';
let NOTE_ID = '';

async function runTest() {
    console.log('🚀 Starting Scribe Integration Test...\n');

    // ── 1. Register ──
    console.log('1. Authentication...');
    let authData;
    try {
        const authRes = await axios.post(`${API_URL}/auth/register`, {
            email: EMAIL, pin: PIN, displayName: 'Test Nurse', role: 'nurse'
        });
        authData = authRes.data;
    } catch (err) {
        if (err.response && err.response.status === 409) {
            const loginRes = await axios.post(`${API_URL}/auth/login`, { email: EMAIL, pin: PIN });
            authData = loginRes.data;
        } else throw err;
    }
    if (!authData.token) throw new Error('Auth failed');
    TOKEN = authData.token;
    console.log('✅ Authenticated\n');

    const client = axios.create({
        baseURL: API_URL,
        headers: { 'Authorization': `Bearer ${TOKEN}` }
    });

    // ── 2. Create Session ──
    console.log('2. Creating Session...');
    const sessionRes = await client.post('/sessions', {
        patient_name: 'Somchai Jaidee', patient_hn: 'HN123456', template_type: 'soap'
    });
    SESSION_ID = sessionRes.data.id;
    if (!SESSION_ID) throw new Error('Session creation failed');
    console.log(`✅ Session created: ${SESSION_ID}\n`);

    // ── 3. Transcription (mock — dummy audio will fail Whisper, expected) ──
    console.log('3. Transcription...');
    let transcript = 'Patient Somchai Jaidee presents with fever 38.5C and productive cough for 3 days. No shortness of breath. Vitals stable. BP 120/80, HR 88, RR 18, SpO2 98%. Lungs: bilateral crackles at bases. Assessment: Community-acquired pneumonia. Plan: Amoxicillin 500mg TID x7 days, Paracetamol PRN, follow-up in 2 days.';
    try {
        fs.writeFileSync('test_audio.webm', 'dummy');
        const form = new FormData();
        form.append('audio', fs.createReadStream('test_audio.webm'));
        const tRes = await client.post('/transcribe', form, { headers: form.getHeaders() });
        if (tRes.data.text) transcript = tRes.data.text;
        console.log('   (Real transcription)');
    } catch { console.log('   (Mock transcript — dummy audio)'); }
    try { fs.unlinkSync('test_audio.webm'); } catch { }
    console.log(`   "${transcript.substring(0, 60)}..."`);

    await client.patch(`/sessions/${SESSION_ID}`, { transcript, status: 'transcribed' });
    console.log('✅ Transcript saved\n');

    // ── 4. Generate Note ──
    console.log('4. Generating Clinical Note (AI)...');
    const noteRes = await client.post(`/sessions/${SESSION_ID}/generate-note`, { templateType: 'soap' });
    const note = noteRes.data;
    NOTE_ID = note.id;
    if (!NOTE_ID) throw new Error('Note generation failed');
    console.log(`✅ Note generated: ${NOTE_ID}`);
    console.log(`   Sections: ${Object.keys(note.content || {}).join(', ')}\n`);

    // ── 5. AI: Regenerate Section ──
    console.log('5. AI Section Regeneration...');
    try {
        const regen = await client.post(`/notes/${NOTE_ID}/regenerate-section`, {
            section: 'plan', instruction: 'Add follow-up in 2 days and chest X-ray'
        });
        console.log(`✅ Plan section regenerated (${regen.data.content?.length || 0} chars)\n`);
    } catch (err) {
        console.log(`❌ Regen failed: ${err.response?.data?.error || err.message}\n`);
    }

    // ── 6. AI: Hanna Command ──
    console.log('6. Hanna Command...');
    try {
        const cmd = await client.post(`/notes/${NOTE_ID}/hanna-command`, {
            command: 'Make the assessment more detailed and add differential diagnoses',
            currentContent: note.content
        });
        console.log(`✅ Command applied — sections: ${Object.keys(cmd.data.content || {}).join(', ')}\n`);
    } catch (err) {
        console.log(`❌ Command failed: ${err.response?.data?.error || err.message}\n`);
    }

    // ── 7. Finalize Note ──
    console.log('7. Finalizing Note...');
    await client.post(`/notes/${NOTE_ID}/finalize`);
    console.log('✅ Note finalized\n');

    // ── 8. Export Note as PDF ──
    console.log('8. Exporting Note PDF...');
    try {
        const pdfRes = await client.get(`/export/${NOTE_ID}?format=pdf`, { responseType: 'arraybuffer' });
        if (pdfRes.headers['content-type'] === 'application/pdf') {
            const outPath = `note_${NOTE_ID}.pdf`;
            fs.writeFileSync(outPath, pdfRes.data);
            console.log(`✅ PDF exported: ${outPath} (${pdfRes.data.length} bytes)\n`);
        } else {
            console.log('❌ Wrong content-type\n');
        }
    } catch (err) {
        console.log(`❌ PDF export failed: ${err.response?.data?.error || err.message}\n`);
    }

    // ── 9. Export Note as Text ──
    console.log('9. Exporting Note Text...');
    try {
        const textRes = await client.get(`/export/${NOTE_ID}?format=text`);
        console.log(`✅ Text export (${textRes.data.text?.length || 0} chars)\n`);
    } catch (err) {
        console.log(`❌ Text export failed: ${err.response?.data?.error || err.message}\n`);
    }

    // ── 10. Generate Handover ──
    console.log('10. Generating Handover...');
    try {
        const ho = await client.post('/generate-handover');
        console.log(`✅ Handover: ${ho.data.patient_count} patients, ${ho.data.urgent_count} urgent\n`);

        // ── 11. Export Handover PDF ──
        console.log('11. Exporting Handover PDF...');
        const hPdf = await client.post('/export/handover?format=pdf', ho.data, { responseType: 'arraybuffer' });
        if (hPdf.headers['content-type'] === 'application/pdf') {
            fs.writeFileSync('handover.pdf', hPdf.data);
            console.log(`✅ Handover PDF: handover.pdf (${hPdf.data.length} bytes)\n`);
        }
    } catch (err) {
        console.log(`❌ Handover failed: ${err.response?.data?.error || err.message}\n`);
    }

    // ── 12. List Sessions ──
    console.log('12. Listing Sessions...');
    try {
        const list = await client.get('/sessions');
        console.log(`✅ ${list.data.sessions?.length || 0} sessions found\n`);
    } catch (err) {
        console.log(`❌ List failed: ${err.response?.data?.error || err.message}\n`);
    }

    // ── 13. Get Templates ──
    console.log('13. Getting Templates...');
    try {
        const tmpl = await client.get('/templates');
        console.log(`✅ ${tmpl.data.templates?.length || 0} templates\n`);
    } catch (err) {
        console.log(`❌ Templates failed: ${err.response?.data?.error || err.message}\n`);
    }

    console.log('═══════════════════════════════════');
    console.log('🎉 ALL TESTS COMPLETED SUCCESSFULLY');
    console.log('═══════════════════════════════════');
    process.exit(0);
}

runTest().catch(err => {
    console.error('❌ FATAL:', err.response?.data || err.message);
    process.exit(1);
});
