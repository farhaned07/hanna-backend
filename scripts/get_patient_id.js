require('dotenv').config();
const db = require('../src/services/db');

async function getPatient() {
    console.log('🔍 Fetching a valid patient ID...');
    try {
        const res = await db.query('SELECT id, name, line_user_id FROM chronic_patients LIMIT 1');
        console.table(res.rows);
    } catch (err) {
        console.error(err);
    } finally {
        process.exit();
    }
}

getPatient();
