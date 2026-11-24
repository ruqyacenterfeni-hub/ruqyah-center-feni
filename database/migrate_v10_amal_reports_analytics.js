/**
 * Migration V10: Amal Reports, Winner Profiles & Admin Analytics
 * - Adds full address columns to lifestyle_users (village, union_name, upazila, district, address)
 * - Adds winner profile rich details to competition_winners (short_bio, achievement_details, trophy_title, winner_photo)
 * - Adds winner profile rich details to pinned_monthly_winner (short_bio, achievement_details, competition_name, winning_position)
 * - Seeds default winner profile fields idempotently
 */

function runMigrationV10(db) {
  console.log('[Migration V10] Starting idempotent Amal Reports, Winner Profiles & Analytics migration...');

  try {
    // 1. Ensure address columns exist on lifestyle_users
    const userCols = db.prepare("PRAGMA table_info(lifestyle_users)").all().map(c => c.name);
    
    if (!userCols.includes('village')) {
      db.exec("ALTER TABLE lifestyle_users ADD COLUMN village TEXT;");
    }
    if (!userCols.includes('union_name')) {
      db.exec("ALTER TABLE lifestyle_users ADD COLUMN union_name TEXT;");
    }
    if (!userCols.includes('upazila')) {
      db.exec("ALTER TABLE lifestyle_users ADD COLUMN upazila TEXT;");
    }
    if (!userCols.includes('district')) {
      db.exec("ALTER TABLE lifestyle_users ADD COLUMN district TEXT DEFAULT 'Feni';");
    }
    if (!userCols.includes('address')) {
      db.exec("ALTER TABLE lifestyle_users ADD COLUMN address TEXT;");
    }

    // 2. Ensure rich winner fields exist on competition_winners
    const winnerCols = db.prepare("PRAGMA table_info(competition_winners)").all().map(c => c.name);
    if (!winnerCols.includes('short_bio')) {
      db.exec("ALTER TABLE competition_winners ADD COLUMN short_bio TEXT;");
    }
    if (!winnerCols.includes('achievement_details')) {
      db.exec("ALTER TABLE competition_winners ADD COLUMN achievement_details TEXT;");
    }
    if (!winnerCols.includes('trophy_title')) {
      db.exec("ALTER TABLE competition_winners ADD COLUMN trophy_title TEXT DEFAULT 'কৃতি আমলকারী';");
    }
    if (!winnerCols.includes('winner_photo')) {
      db.exec("ALTER TABLE competition_winners ADD COLUMN winner_photo TEXT;");
    }

    // 3. Ensure rich fields exist on pinned_monthly_winner
    const pinnedCols = db.prepare("PRAGMA table_info(pinned_monthly_winner)").all().map(c => c.name);
    if (!pinnedCols.includes('short_bio')) {
      db.exec("ALTER TABLE pinned_monthly_winner ADD COLUMN short_bio TEXT;");
    }
    if (!pinnedCols.includes('achievement_details')) {
      db.exec("ALTER TABLE pinned_monthly_winner ADD COLUMN achievement_details TEXT;");
    }
    if (!pinnedCols.includes('competition_name')) {
      db.exec("ALTER TABLE pinned_monthly_winner ADD COLUMN competition_name TEXT DEFAULT '৪০ দিনের আত্মশুদ্ধি প্রতিযোগিতা (ব্যাচ-০১)';");
    }
    if (!pinnedCols.includes('winning_position')) {
      db.exec("ALTER TABLE pinned_monthly_winner ADD COLUMN winning_position TEXT DEFAULT '১ম স্থান (বিজয়ী)';");
    }

    // 4. Update existing pinned_monthly_winner with sample bio if empty
    const currentPinned = db.prepare("SELECT id, short_bio, achievement_details FROM pinned_monthly_winner WHERE id = 1").get();
    if (currentPinned) {
      if (!currentPinned.short_bio) {
        db.prepare(`
          UPDATE pinned_monthly_winner
          SET short_bio = ?,
              achievement_details = ?,
              competition_name = ?,
              winning_position = ?
          WHERE id = 1
        `).run(
          'নিয়মিত ৫ ওয়াক্ত জামাতে সালাত আদায়কারী, কুরআন তিলাওয়াত ও মাসনুন জিকিরে অবিচল কৃতি প্রতিযোগী।',
          'টানা ৪০ দিন ১০০% জামাতে সালাত, তাহাজ্জুদ ও পূর্ণাঙ্গ সুন্নাহ লাইফস্টাইল অনুসরণে ৩৯৫০ পয়েন্ট অর্জন করেছেন।',
          '৪০ দিনের আত্মশুদ্ধি আমল প্রতিযোগিতা (ব্যাচ-০১)',
          '১ম স্থান (বিজয়ী)'
        );
      }
    }

    console.log('[Migration V10] Migration completed successfully.');
  } catch (err) {
    console.error('[Migration V10] Error during migration:', err);
    throw err;
  }
}

module.exports = { runMigrationV10 };
