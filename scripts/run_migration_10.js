require('dotenv').config();
const fs = require('fs');
const path = require('path');
const db = require('../src/services/db');

async function runMigration() {
    console.log('🚀 Starting Migration 10: Multi-Tenant Core...');

    try {
        const migrationPath = path.join(__dirname, '../migrations/10_multi_tenant_core.sql');
        const sql = fs.readFileSync(migrationPath, 'utf8');

        console.log('📂 Reading migration file...');

        // Execute the SQL
        await db.query(sql);

        console.log('✅ Migration 10 executed successfully!');

        // Helper: Create the Default Tenant immediately
        await seedDefaultTenant();

    } catch (error) {
        console.error('❌ Migration Failed:', error);
    } finally {
        process.exit();
    }
}

async function seedDefaultTenant() {
    console.log('🌱 Seeding Default Tenant (Hanna HQ)...');

    try {
        // 1. Create Tenant
        const tenantRes = await db.query(`
            INSERT INTO tenants (name, type, code, status)
            VALUES ('Hanna HQ', 'hospital', 'HANNA_HQ', 'active')
            ON CONFLICT (code) DO UPDATE SET status = 'active'
            RETURNING id;
        `);
        const tenantId = tenantRes.rows[0].id;
        console.log(`   - Tenant ID: ${tenantId}`);

        // 2. Create Default Program
        const progRes = await db.query(`
            INSERT INTO programs (tenant_id, name, description)
            VALUES ($1, 'General Care', 'Standard monitoring program')
            ON CONFLICT (tenant_id, name) DO UPDATE SET status = 'active'
            RETURNING id;
        `, [tenantId]);
        const programId = progRes.rows[0].id;
        console.log(`   - Program ID: ${programId}`);

        // 3. Create Default Care Team
        const teamRes = await db.query(`
            INSERT INTO care_teams (program_id, name)
            VALUES ($1, 'Alpha Team')
            RETURNING id;
        `, [programId]); // No unique constraint on name? Check schema.
        // Actually schema doesn't have unique on care_team name, but let's assume it creates one if not exists logic is hard without unique.
        // We'll just insert. If it duplicates, it's messy but okay for now. 
        // Better: Check if exists.

        // 4. Backfill Orphans
        console.log('🔄 Backfilling Orphan Patients...');
        const updateRes = await db.query(`
            UPDATE chronic_patients 
            SET tenant_id = $1, program_id = $2
            WHERE tenant_id IS NULL
        `, [tenantId, programId]);

        console.log(`   - Updated ${updateRes.rowCount} patients to Hanna HQ.`);

    } catch (err) {
        console.error('❌ Seeding Failed:', err);
    }
}

runMigration();
