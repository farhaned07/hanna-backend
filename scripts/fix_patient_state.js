require('dotenv').config();
const path = require('path');
const db = require(path.join(__dirname, '../src/services/db'));

async function fixSchema() {
    try {
        console.log('Checking patient_state schema...');

        // Check current patient_state columns
        const cols = await db.query("SELECT column_name FROM information_schema.columns WHERE table_name = 'patient_state'");
        console.log('Current columns:', cols.rows.map(r => r.column_name).join(', '));

        // Add missing columns if needed
        const columnDefs = {
            'risk_score': 'INTEGER DEFAULT 0',
            'assigned_nurse': 'VARCHAR(255)',
            'last_assessment': 'TIMESTAMP DEFAULT NOW()',
            'status': "VARCHAR(50) DEFAULT 'active'"
        };

        for (const [col, def] of Object.entries(columnDefs)) {
            if (!cols.rows.find(r => r.column_name === col)) {
                console.log('Adding column:', col);
                await db.query(`ALTER TABLE patient_state ADD COLUMN ${col} ${def}`);
            }
        }

        console.log('Schema fixed!');
        const newCols = await db.query("SELECT column_name FROM information_schema.columns WHERE table_name = 'patient_state'");
        console.log('Updated columns:', newCols.rows.map(r => r.column_name).join(', '));

        process.exit(0);
    } catch (e) {
        console.error('Error:', e.message);
        process.exit(1);
    }
}
fixSchema();
