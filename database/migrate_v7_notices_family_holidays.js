/**
 * Migration V7: Non-destructive update for:
 * 1. Homepage scrolling announcements / notices table
 * 2. Appointments package_type, original_price, adjusted_price, is_price_overridden, per_patient_price columns
 * 3. Family Package service entry in services table
 * 4. Flexible weekly holiday setting in availability_settings
 * 
 * IDEMPOTENT & PRESERVES 100% OF EXISTING PATIENT / CLINICAL DATA
 */

let localDb = null;

function runMigrationV7(dbInstance) {
  const db = dbInstance || localDb || require('./db');
  console.log('[Migration V7] Starting idempotent non-destructive migration...');

  // 1. Announcements / Notice table
  db.exec(`
    CREATE TABLE IF NOT EXISTS announcements (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      title_bn TEXT,
      title_en TEXT,
      content_bn TEXT NOT NULL,
      content_en TEXT,
      is_active INTEGER DEFAULT 1,
      display_order INTEGER DEFAULT 0,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );
  `);

  // Seed default active notice if table is empty
  const noticeCount = db.prepare('SELECT COUNT(*) as count FROM announcements').get().count;
  if (noticeCount === 0) {
    db.prepare(`
      INSERT INTO announcements (title_bn, title_en, content_bn, content_en, is_active)
      VALUES (?, ?, ?, ?, 1)
    `).run(
      'জরুরি বিজ্ঞপ্তি',
      'Important Notice',
      'রুকইয়াহ সাপোর্ট অ্যান্ড হিজামা সেন্টার (ফেনী শাখা) – পবিত্র কুরআন ও সহীহ সুন্নাহ মোতাবেক রুকইয়াহ শারঈয়্যাহ ও সুন্নাতী হিজামা চিকিৎসা প্রদান করা হয়। শনি-বৃহস্পতিবার সকাল ৯:০০ থেকে রাত ৮:০০ পর্যন্ত সেবা খোলা থাকে। অগ্রিম অ্যাপয়েন্টমেন্টের জন্য অনলাইনে বুকিং করুন বা কল করুন: ০১৭৫৮-৩৫৪৯২০',
      'Ruqyah Support & Cupping Center (Feni Branch) - Authentic Quran & Sunnah-based Ruqyah and prophetic Hijama therapy. Open Sat-Thu 9 AM - 8 PM. Book online or call: 01758-354920.'
    );
    console.log('[Migration V7] Seeded initial active announcement.');
  }

  // 2. Safe Column Additions to appointments
  const apptColumns = db.prepare('PRAGMA table_info(appointments)').all().map(c => c.name);

  if (!apptColumns.includes('package_type')) {
    db.exec("ALTER TABLE appointments ADD COLUMN package_type TEXT DEFAULT 'standard';");
    console.log('[Migration V7] Added package_type column to appointments.');
  }
  if (!apptColumns.includes('original_price')) {
    db.exec("ALTER TABLE appointments ADD COLUMN original_price REAL DEFAULT NULL;");
    console.log('[Migration V7] Added original_price column to appointments.');
  }
  if (!apptColumns.includes('adjusted_price')) {
    db.exec("ALTER TABLE appointments ADD COLUMN adjusted_price REAL DEFAULT NULL;");
    console.log('[Migration V7] Added adjusted_price column to appointments.');
  }
  if (!apptColumns.includes('is_price_overridden')) {
    db.exec("ALTER TABLE appointments ADD COLUMN is_price_overridden INTEGER DEFAULT 0;");
    console.log('[Migration V7] Added is_price_overridden column to appointments.');
  }
  if (!apptColumns.includes('per_patient_price')) {
    db.exec("ALTER TABLE appointments ADD COLUMN per_patient_price REAL DEFAULT NULL;");
    console.log('[Migration V7] Added per_patient_price column to appointments.');
  }

  // 3. Family Package Service in services table
  const familyService = db.prepare("SELECT id FROM services WHERE code = 'family' OR code = 'ruqyah-family'").get();
  if (!familyService) {
    db.prepare(`
      INSERT INTO services (code, name, category, description, duration_minutes, price, discount_price, is_active, display_order)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      'family',
      'ফ্যামিলি প্যাকেজ (রুকইয়াহ)',
      'ruqyah',
      'সর্বোচ্চ ৬ জন রোগীর জন্য বিশেষ পারিবারিক রুকইয়াহ প্যাকেজ। মোট মূল্য ফিক্সড ৬,০০০ টাকা।',
      60,
      6000,
      null,
      1,
      2
    );
    console.log('[Migration V7] Seeded Family Package (6,000 BDT) into services table.');
  }

  // 4. Flexible weekly holiday column in availability_settings
  const availColumns = db.prepare('PRAGMA table_info(availability_settings)').all().map(c => c.name);
  if (!availColumns.includes('weekly_holiday_enabled')) {
    db.exec("ALTER TABLE availability_settings ADD COLUMN weekly_holiday_enabled INTEGER DEFAULT 1;");
    console.log('[Migration V7] Added weekly_holiday_enabled column to availability_settings.');
  }

  console.log('[Migration V7] Migration completed successfully.');
}

if (require.main === module) {
  runMigrationV7();
}

module.exports = { runMigrationV7 };
