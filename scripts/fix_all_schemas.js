require('dotenv').config();
const path = require('path');
const db = require(path.join(__dirname, '../src/services/db'));

async function fixAllSchemas() {
    try {
        console.log('=== Comprehensive Schema Fix ===\n');

        // Fix vitals_log
        console.log('Fixing vitals_log...');
        const vitalsColumns = {
            'vital_type': 'VARCHAR(50)',
            'value': 'DECIMAL(10,2)',
            'unit': 'VARCHAR(20)',
            'source': 'VARCHAR(50)',
            'recorded_at': 'TIMESTAMP DEFAULT NOW()'
        };
        await fixTable('vitals_log', vitalsColumns);

        // Fix chat_history
        console.log('\nFixing chat_history...');
        const chatColumns = {
            'role': 'VARCHAR(20)',
            'content': 'TEXT',
            'message_type': 'VARCHAR(20) DEFAULT \'text\'',
            'metadata': 'JSONB'
        };
        await fixTable('chat_history', chatColumns);

        // Fix audit_log
        console.log('\nFixing audit_log...');
        const auditColumns = {
            'action': 'VARCHAR(100)',
            'actor': 'VARCHAR(100)',
            'details': 'JSONB'
        };
        await fixTable('audit_log', auditColumns);

        console.log('\n=== All schemas fixed! ===');
        process.exit(0);
    } catch (e) {
        console.error('Error:', e.message);
        process.exit(1);
    }
}

async function fixTable(tableName, columnDefs) {
    const cols = await db.query(`SELECT column_name FROM information_schema.columns WHERE table_name = $1`, [tableName]);
    console.log(`  Current: ${cols.rows.map(r => r.column_name).join(', ')}`);

    for (const [col, def] of Object.entries(columnDefs)) {
        if (!cols.rows.find(r => r.column_name === col)) {
            console.log(`  Adding: ${col}`);
            await db.query(`ALTER TABLE ${tableName} ADD COLUMN ${col} ${def}`);
        }
    }
}

fixAllSchemas();
