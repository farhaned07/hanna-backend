require('dotenv').config();
const db = require('../src/services/db');

const runMigration = async () => {
  console.log('🚀 Starting PostgreSQL Migration...\n');

  try {
    // Create chronic_patients table
    console.log('📝 Creating chronic_patients table...');
    await db.query(`
      CREATE TABLE IF NOT EXISTS chronic_patients (
        id SERIAL PRIMARY KEY,
        line_user_id TEXT UNIQUE NOT NULL,
        display_name TEXT,
        name TEXT,
        age INTEGER,
        condition TEXT,
        phone_number TEXT,
        enrollment_status TEXT DEFAULT 'onboarding',
        onboarding_step INTEGER DEFAULT 0,
        subscription_plan TEXT,
        trial_start_date TIMESTAMP,
        trial_end_date TIMESTAMP,
        subscription_start_date TIMESTAMP,
        subscription_end_date TIMESTAMP,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);
    console.log('✅ chronic_patients table created\n');

    // Create check_ins table
    console.log('📝 Creating check_ins table...');
    await db.query(`
      CREATE TABLE IF NOT EXISTS check_ins (
        id SERIAL PRIMARY KEY,
        line_user_id TEXT NOT NULL,
        check_in_time TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        mood TEXT,
        symptoms TEXT,
        glucose_level INTEGER,
        medication_taken BOOLEAN DEFAULT FALSE,
        medication_notes TEXT,
        FOREIGN KEY(line_user_id) REFERENCES chronic_patients(line_user_id) ON DELETE CASCADE
      )
    `);
    console.log('✅ check_ins table created\n');

    // Create indexes for performance
    console.log('📝 Creating indexes...');
    await db.query(`
      CREATE INDEX IF NOT EXISTS idx_patients_line_id ON chronic_patients(line_user_id)
    `);
    await db.query(`
      CREATE INDEX IF NOT EXISTS idx_patients_status ON chronic_patients(enrollment_status)
    `);
    await db.query(`
      CREATE INDEX IF NOT EXISTS idx_checkins_line_id ON check_ins(line_user_id)
    `);
    await db.query(`
      CREATE INDEX IF NOT EXISTS idx_checkins_time ON check_ins(check_in_time DESC)
    `);
    console.log('✅ Indexes created\n');

    // Verify tables
    console.log('🔍 Verifying migration...');
    const result = await db.query(`
      SELECT table_name 
      FROM information_schema.tables 
      WHERE table_schema = 'public'
      ORDER BY table_name
    `);

    console.log('Tables in database:');
    result.rows.forEach(row => {
      console.log(`  - ${row.table_name}`);
    });

    console.log('\n✅ Migration completed successfully! 🎉\n');
    process.exit(0);

  } catch (error) {
    console.error('\n❌ Migration failed:', error.message);
    console.error(error);
    process.exit(1);
  }
};

runMigration();
