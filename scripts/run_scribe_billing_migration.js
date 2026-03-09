const fs = require('fs');
const path = require('path');
const db = require('../src/services/db');

async function migrate() {
    try {
        console.log('Running Scribe billing migration...');
        const sql = fs.readFileSync(path.join(__dirname, '../migrations/013_scribe_billing.sql'), 'utf-8');
        await db.query(sql);
        console.log('Migration successful.');
        process.exit(0);
    } catch (err) {
        console.error('Migration failed:', err);
        process.exit(1);
    }
}
migrate();
