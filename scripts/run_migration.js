#!/usr/bin/env node
/**
 * Run Migration 11: Productization Tables
 * Uses the existing db.js connection
 */

require('dotenv').config();
const fs = require('fs');
const path = require('path');
const db = require('../src/services/db');

async function runMigration() {
    console.log('🔄 Running Migration 11: Productization Tables...\n');

    const migrationPath = path.join(__dirname, '..', 'migrations', '11_productization_tables.sql');
    const sql = fs.readFileSync(migrationPath, 'utf8');

    // Split by semicolons and filter empty statements
    const statements = sql
        .split(';')
        .map(s => s.trim())
        .filter(s => s.length > 0 && !s.startsWith('--'));

    console.log(`Found ${statements.length} SQL statements to execute\n`);

    let successCount = 0;
    let errorCount = 0;

    for (const statement of statements) {
        try {
            // Skip empty or comment-only statements
            if (!statement || statement.match(/^[\s-]*$/)) continue;

            await db.query(statement);
            successCount++;

            // Log CREATE statements
            if (statement.toUpperCase().includes('CREATE TABLE')) {
                const match = statement.match(/CREATE TABLE IF NOT EXISTS (\w+)/i);
                if (match) console.log(`  ✅ Created table: ${match[1]}`);
            } else if (statement.toUpperCase().includes('CREATE INDEX')) {
                const match = statement.match(/CREATE INDEX IF NOT EXISTS (\w+)/i);
                if (match) console.log(`  ✅ Created index: ${match[1]}`);
            } else if (statement.toUpperCase().includes('ALTER TABLE')) {
                const match = statement.match(/ALTER TABLE (\w+) ADD COLUMN IF NOT EXISTS (\w+)/i);
                if (match) console.log(`  ✅ Added column: ${match[1]}.${match[2]}`);
            }
        } catch (error) {
            // Ignore "already exists" errors
            if (error.message.includes('already exists')) {
                console.log(`  ⏭️  Skipped (already exists)`);
            } else {
                console.error(`  ❌ Error: ${error.message}`);
                errorCount++;
            }
        }
    }

    console.log(`\n✅ Migration complete: ${successCount} statements executed, ${errorCount} errors`);
    process.exit(errorCount > 0 ? 1 : 0);
}

runMigration().catch(err => {
    console.error('Migration failed:', err);
    process.exit(1);
});
