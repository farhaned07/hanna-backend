require('dotenv').config();
const path = require('path');
const db = require(path.join(__dirname, '../src/services/db'));

async function fixNurseTasks() {
    try {
        console.log('Checking nurse_tasks schema...');

        const cols = await db.query("SELECT column_name FROM information_schema.columns WHERE table_name = 'nurse_tasks'");
        console.log('Current columns:', cols.rows.map(r => r.column_name).join(', '));

        const columnDefs = {
            'title': 'VARCHAR(255)',
            'description': 'TEXT',
            'created_by': 'VARCHAR(100)',
            'resolved_by': 'VARCHAR(100)',
            'resolved_at': 'TIMESTAMP'
        };

        for (const [col, def] of Object.entries(columnDefs)) {
            if (!cols.rows.find(r => r.column_name === col)) {
                console.log('Adding column:', col);
                await db.query(`ALTER TABLE nurse_tasks ADD COLUMN ${col} ${def}`);
            }
        }

        console.log('nurse_tasks schema fixed!');
        const newCols = await db.query("SELECT column_name FROM information_schema.columns WHERE table_name = 'nurse_tasks'");
        console.log('Updated columns:', newCols.rows.map(r => r.column_name).join(', '));

        process.exit(0);
    } catch (e) {
        console.error('Error:', e.message);
        process.exit(1);
    }
}
fixNurseTasks();
