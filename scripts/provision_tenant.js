#!/usr/bin/env node
/**
 * Tenant Provisioning Script
 * 
 * Creates a new hospital tenant with default program, care team, and admin staff.
 * 
 * Usage:
 *   node scripts/provision_tenant.js \
 *     --name "Thainakarin Hospital" \
 *     --code "THNK" \
 *     --type "hospital" \
 *     --admin-email "cno@thainakarin.com" \
 *     --admin-name "Nurse Supatra"
 * 
 * Options:
 *   --name         Required. Full hospital name
 *   --code         Required. Short unique code (3-10 chars, used in URLs/reports)
 *   --type         Optional. Type: hospital, insurer, clinic (default: hospital)
 *   --admin-email  Required. Admin user email
 *   --admin-name   Required. Admin user display name
 *   --program      Optional. Program name (default: "Chronic Care Program")
 *   --dry-run      Optional. Preview without creating
 * 
 * Output:
 *   Prints tenant credentials for onboarding.
 */

require('dotenv').config();
const crypto = require('crypto');
const { Pool } = require('pg');

// Parse command line arguments
function parseArgs() {
    const args = process.argv.slice(2);
    const parsed = {};

    for (let i = 0; i < args.length; i++) {
        const arg = args[i];
        if (arg.startsWith('--')) {
            const key = arg.slice(2);
            const value = args[i + 1] && !args[i + 1].startsWith('--') ? args[i + 1] : true;
            parsed[key] = value;
            if (value !== true) i++;
        }
    }

    return parsed;
}

// Validate required arguments
function validateArgs(args) {
    const required = ['name', 'code', 'admin-email', 'admin-name'];
    const missing = required.filter(key => !args[key]);

    if (missing.length > 0) {
        console.error('❌ Missing required arguments:', missing.join(', '));
        console.error('\nUsage:');
        console.error('  node scripts/provision_tenant.js \\');
        console.error('    --name "Hospital Name" \\');
        console.error('    --code "CODE" \\');
        console.error('    --admin-email "email@hospital.com" \\');
        console.error('    --admin-name "Admin Name"');
        process.exit(1);
    }

    // Validate code format
    const code = args.code.toUpperCase();
    if (!/^[A-Z0-9]{3,10}$/.test(code)) {
        console.error('❌ Code must be 3-10 alphanumeric characters');
        process.exit(1);
    }

    // Validate type
    const validTypes = ['hospital', 'insurer', 'clinic'];
    const type = args.type || 'hospital';
    if (!validTypes.includes(type)) {
        console.error('❌ Type must be one of:', validTypes.join(', '));
        process.exit(1);
    }

    return {
        name: args.name,
        code: code,
        type: type,
        adminEmail: args['admin-email'],
        adminName: args['admin-name'],
        programName: args.program || 'Chronic Care Program',
        dryRun: args['dry-run'] === true
    };
}

// Generate secure auth token
function generateAuthToken(prefix) {
    const token = crypto.randomBytes(32).toString('hex');
    return `${prefix.toLowerCase()}_${token}`;
}

// Main provisioning function
async function provisionTenant(config) {
    const pool = new Pool({
        connectionString: process.env.DATABASE_URL,
        ssl: { rejectUnauthorized: false }
    });

    const client = await pool.connect();

    try {
        console.log('\n🏥 Provisioning Tenant:', config.name);
        console.log('━'.repeat(50));

        if (config.dryRun) {
            console.log('🔍 DRY RUN - No changes will be made\n');
        }

        // Start transaction
        await client.query('BEGIN');

        // 1. Check if tenant code already exists
        const existing = await client.query(
            'SELECT id FROM tenants WHERE code = $1',
            [config.code]
        );

        if (existing.rows.length > 0) {
            throw new Error(`Tenant code "${config.code}" already exists`);
        }

        // 2. Create Tenant
        console.log('📝 Creating tenant...');
        const tenantResult = await client.query(`
            INSERT INTO tenants (name, code, type, status, settings)
            VALUES ($1, $2, $3, 'active', '{}')
            RETURNING id, name, code
        `, [config.name, config.code, config.type]);

        const tenant = tenantResult.rows[0];
        console.log(`   ✅ Tenant ID: ${tenant.id}`);

        // 3. Create Default Program
        console.log('📋 Creating program...');
        const programResult = await client.query(`
            INSERT INTO programs (tenant_id, name, description, status, config)
            VALUES ($1, $2, $3, 'active', '{}')
            RETURNING id, name
        `, [tenant.id, config.programName, `Default program for ${config.name}`]);

        const program = programResult.rows[0];
        console.log(`   ✅ Program: ${program.name}`);

        // 4. Create Default Care Team
        console.log('👥 Creating care team...');
        const careTeamResult = await client.query(`
            INSERT INTO care_teams (program_id, name, settings)
            VALUES ($1, $2, '{}')
            RETURNING id, name
        `, [program.id, 'Default Care Team']);

        const careTeam = careTeamResult.rows[0];
        console.log(`   ✅ Care Team: ${careTeam.name}`);

        // 5. Generate Admin Auth Token
        const authToken = generateAuthToken(config.code);

        // 6. Create Admin Staff
        console.log('👤 Creating admin staff...');
        const staffResult = await client.query(`
            INSERT INTO staff (tenant_id, care_team_id, email, name, role, auth_token_hash, status)
            VALUES ($1, $2, $3, $4, 'admin', $5, 'active')
            RETURNING id, name, email, role
        `, [tenant.id, careTeam.id, config.adminEmail, config.adminName, authToken]);

        const staff = staffResult.rows[0];
        console.log(`   ✅ Admin: ${staff.name} (${staff.email})`);

        if (config.dryRun) {
            // Rollback for dry run
            await client.query('ROLLBACK');
            console.log('\n🔍 DRY RUN - Changes rolled back');
        } else {
            // Commit transaction
            await client.query('COMMIT');
            console.log('\n✅ Tenant provisioned successfully!');
        }

        // Output credentials
        console.log('\n' + '━'.repeat(50));
        console.log('📋 CREDENTIALS (Save these!)');
        console.log('━'.repeat(50));
        console.log(`
Hospital:      ${tenant.name}
Tenant Code:   ${tenant.code}
Tenant ID:     ${tenant.id}

Dashboard URL: https://dashboard.hanna.care
Auth Token:    ${authToken}

Admin User:    ${staff.name}
Admin Email:   ${staff.email}
Admin Role:    ${staff.role}

Program:       ${program.name}
Care Team:     ${careTeam.name}
`);
        console.log('━'.repeat(50));

        if (!config.dryRun) {
            console.log('\n📧 Next Steps:');
            console.log('   1. Send credentials to hospital admin');
            console.log('   2. Hospital uploads patient CSV');
            console.log('   3. Verify dashboard access');
            console.log('   4. Confirm LINE bot responds to enrolled patients\n');
        }

        return {
            tenant,
            program,
            careTeam,
            staff,
            authToken
        };

    } catch (error) {
        await client.query('ROLLBACK');
        console.error('\n❌ Provisioning failed:', error.message);
        throw error;
    } finally {
        client.release();
        await pool.end();
    }
}

// Run the script
async function main() {
    const args = parseArgs();

    // Show help if no args
    if (Object.keys(args).length === 0 || args.help) {
        console.log(`
Tenant Provisioning Script
==========================

Creates a new hospital tenant with default program, care team, and admin staff.

Usage:
  node scripts/provision_tenant.js \\
    --name "Hospital Name" \\
    --code "CODE" \\
    --admin-email "admin@hospital.com" \\
    --admin-name "Admin Name"

Required Arguments:
  --name          Full hospital name
  --code          Short unique code (3-10 alphanumeric chars)
  --admin-email   Admin user email
  --admin-name    Admin user display name

Optional Arguments:
  --type          Type: hospital, insurer, clinic (default: hospital)
  --program       Program name (default: "Chronic Care Program")
  --dry-run       Preview without creating

Examples:
  # Create hospital tenant
  node scripts/provision_tenant.js \\
    --name "Thainakarin Hospital" \\
    --code "THNK" \\
    --admin-email "cno@thainakarin.com" \\
    --admin-name "Nurse Supatra"

  # Dry run to preview
  node scripts/provision_tenant.js \\
    --name "Test Hospital" \\
    --code "TEST" \\
    --admin-email "test@example.com" \\
    --admin-name "Test Admin" \\
    --dry-run
`);
        process.exit(0);
    }

    const config = validateArgs(args);

    try {
        await provisionTenant(config);
        process.exit(0);
    } catch (error) {
        process.exit(1);
    }
}

main();
