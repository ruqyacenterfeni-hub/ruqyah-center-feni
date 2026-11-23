/**
 * Migration V9: Unified Amal & Competition Enhancements
 * - Creates amal_categories table for Admin-controlled categories
 * - Creates pinned_monthly_winner table for Admin-pinned previous month winners
 * - Ensures profile_photo column exists on lifestyle_users
 * - Standardizes daily_amal_activities category slugs
 * - Seeds default categories idempotently
 */

function runMigrationV9(db) {
  console.log('[Migration V9] Starting idempotent unified Amal & Competition migration...');

  try {
    // 1. Create amal_categories table
    db.exec(`
      CREATE TABLE IF NOT EXISTS amal_categories (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        slug TEXT UNIQUE NOT NULL,
        title_bn TEXT NOT NULL,
        title_en TEXT,
        icon TEXT DEFAULT '✨',
        max_points INTEGER DEFAULT 10,
        sort_order INTEGER DEFAULT 0,
        is_active INTEGER DEFAULT 1,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
      );
    `);

    // 2. Create pinned_monthly_winner table (single row with id=1)
    db.exec(`
      CREATE TABLE IF NOT EXISTS pinned_monthly_winner (
        id INTEGER PRIMARY KEY CHECK (id = 1),
        user_id INTEGER,
        full_name TEXT,
        profile_photo TEXT,
        month_title TEXT,
        total_points INTEGER,
        level TEXT,
        blessing_message TEXT DEFAULT 'আল্লাহ উনার আমলগুলো কবুল করুন। আমিন।',
        is_active INTEGER DEFAULT 1,
        pinned_at DATETIME DEFAULT CURRENT_TIMESTAMP
      );
    `);

    // 3. Ensure profile_photo column in lifestyle_users
    const userColumns = db.prepare("PRAGMA table_info(lifestyle_users)").all().map(c => c.name);
    if (!userColumns.includes('profile_photo')) {
      db.exec("ALTER TABLE lifestyle_users ADD COLUMN profile_photo TEXT");
      console.log('[Migration V9] Added profile_photo column to lifestyle_users.');
    }

    // 4. Seed default categories if empty
    const catCount = db.prepare("SELECT COUNT(*) as count FROM amal_categories").get().count;
    if (catCount === 0) {
      const insertCat = db.prepare(`
        INSERT INTO amal_categories (slug, title_bn, title_en, icon, max_points, sort_order, is_active)
        VALUES (?, ?, ?, ?, ?, ?, 1)
      `);

      const defaults = [
        ['prayers', '৫ ওয়াক্ত ফরজ সালাত', '5 Daily Obligatory Prayers', '🕌', 50, 1],
        ['nafl', 'সুন্নাত ও নফল সালাত', 'Sunnah & Nafl Prayers', '🌙', 20, 2],
        ['quran_dhikr', 'কুরআন তিলাওয়াত ও মাসনুন জিকির', 'Quran Recitation & Adhkar', '📖', 10, 3],
        ['charity', 'দান-সদকা ও উত্তম আচরণ', 'Charity & Good Deeds', '🤝', 10, 4],
        ['sunnah_lifestyle', 'সুন্নাহ অভ্যাস ও সুস্থতা', 'Sunnah Habits & Wellness', '🌿', 10, 5]
      ];

      for (const [slug, bn, en, icon, maxPts, order] of defaults) {
        insertCat.run(slug, bn, en, icon, maxPts, order);
      }
      console.log('[Migration V9] Seeded 5 standard Amal categories.');
    }

    // 5. Standardize category slugs in daily_amal_activities
    db.exec(`
      UPDATE daily_amal_activities SET category = 'prayers' WHERE category = 'Five Daily Prayers';
      UPDATE daily_amal_activities SET category = 'nafl' WHERE category = 'Nafl Worship';
      UPDATE daily_amal_activities SET category = 'quran_dhikr' WHERE category = 'Quran & Dhikr';
      UPDATE daily_amal_activities SET category = 'charity' WHERE category = 'Charity & Giving';
      UPDATE daily_amal_activities SET category = 'sunnah_lifestyle' WHERE category = 'Sunnah Habits';
    `);

    // 6. Ensure default pinned winner seed if table empty
    const winnerCount = db.prepare("SELECT COUNT(*) as count FROM pinned_monthly_winner").get().count;
    if (winnerCount === 0) {
      // Find top participant or sample winner
      const topUser = db.prepare(`
        SELECT lu.id, lu.full_name, lu.profile_photo, cp.total_points, cp.current_level
        FROM competition_participants cp
        JOIN lifestyle_users lu ON cp.user_id = lu.id
        ORDER BY cp.total_points DESC LIMIT 1
      `).get();

      if (topUser) {
        db.prepare(`
          INSERT INTO pinned_monthly_winner (id, user_id, full_name, profile_photo, month_title, total_points, level, blessing_message, is_active)
          VALUES (1, ?, ?, ?, 'গত মাসের বিজয়ী!', ?, ?, 'আল্লাহ উনার আমলগুলো কবুল করুন। আমিন।', 1)
        `).run(topUser.id, topUser.full_name, topUser.profile_photo || '/images/default-avatar.svg', topUser.total_points || 3850, topUser.current_level || 'Platinum (মুহসিন)');
      } else {
        db.prepare(`
          INSERT INTO pinned_monthly_winner (id, user_id, full_name, profile_photo, month_title, total_points, level, blessing_message, is_active)
          VALUES (1, NULL, 'হাফেজ ক্বারী আব্দুল্লাহ আল-মামুন', '/images/default-avatar.svg', 'গত মাসের বিজয়ী!', 3920, 'Platinum (মুহসিন)', 'আল্লাহ উনার আমলগুলো কবুল করুন। আমিন।', 1)
        `).run();
      }
      console.log('[Migration V9] Seeded initial pinned monthly winner.');
    }

    console.log('[Migration V9] Migration completed successfully.');
  } catch (err) {
    console.error('[Migration V9] Error running migration:', err);
    throw err;
  }
}

module.exports = { runMigrationV9 };
