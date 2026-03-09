require('dotenv').config();
const db = require('../src/services/db');

async function inspect() {
    console.log('🔍 Inspecting Schema Types...');
    try {
        const tables = ['check_ins', 'nurse_tasks', 'chronic_patients'];

        for (const table of tables) {
            console.log(`\n📋 Table: ${table}`);
            const res = await db.query(`
                SELECT column_name, data_type, udt_name
                FROM information_schema.columns 
                WHERE table_name = $1
            `, [table]);
            console.table(res.rows);
        }
    } catch (err) {
        console.error(err);
    } finally {
        process.exit();
    }
}

inspect();
