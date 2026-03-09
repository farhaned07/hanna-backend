/**
 * Run database migration for conversation_history table
 * Run: node scripts/migrate_conversation_history.js
 */

const fs = require('fs');
const db = require('../src/services/db');

async function runMigration() {
    console.log('🔄 Running Database Migration: conversation_history table\n');

    try {
        // Read SQL file
        const sql = fs.readFileSync('./migrations/006_conversation_history.sql', 'utf8');

        console.log('📝 Executing SQL migration...');
        await db.query(sql);

        console.log('✅ Migration completed successfully!\n');
        console.log('Created:');
        console.log('  • conversation_history table');
        console.log('  • Indexes for performance (patient_id, created_at)');
        console.log('  • cleanup_old_conversations() function');
        console.log('  • Retention policy: 30 days or 200 messages per patient\n');

    } catch (error) {
        if (error.message.includes('already exists')) {
            console.log('⚠️  Table already exists. Skipping migration.\n');
        } else {
            console.error('❌ Migration failed:', error);
            throw error;
        }
    } finally {
        await db.end();
    }
}

runMigration();
