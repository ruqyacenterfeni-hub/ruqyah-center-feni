/**
 * Migration V8: Master Platform Expansion
 * Idempotent, Non-Destructive Migration
 * Extends database with all 16 required enterprise modules:
 * - Ruqyah Resources & Audio Library
 * - Hijama Point Packages
 * - Weighted Symptom Assessment & Dynamic Scoring
 * - Clinical Prescriptions
 * - Sunnah Supplements E-Commerce & Product Categories
 * - Orders & Order Items with Tracking
 * - Online Courses, Modules & Lessons
 * - Media Library
 * - Advertisements & Multi-Placement Notices
 * - Sunnah Lifestyle Users, Daily Amal Activities (100-pt max)
 * - 40-Day Competition, Daily Submissions, Leaderboard & Winners
 */

function runMigrationV8(dbInstance) {
  const db = dbInstance || require('./db');
  console.log('[Migration V8] Starting master platform migration...');

  // Safe table creation helper
  db.exec(`
    -- 1. Ruqyah Resources & Audio Library
    CREATE TABLE IF NOT EXISTS ruqyah_resources (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      category TEXT NOT NULL,
      title_ar TEXT,
      title_bn TEXT NOT NULL,
      title_en TEXT,
      text_ar TEXT,
      text_bn TEXT,
      text_en TEXT,
      audio_url TEXT,
      pdf_url TEXT,
      duration TEXT,
      display_order INTEGER DEFAULT 0,
      is_active INTEGER DEFAULT 1,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    -- 2. Hijama Point Packages
    CREATE TABLE IF NOT EXISTS hijama_packages (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      title_bn TEXT NOT NULL,
      title_en TEXT NOT NULL,
      point_count INTEGER NOT NULL,
      price REAL NOT NULL,
      discount_price REAL,
      description_bn TEXT,
      description_en TEXT,
      included_services TEXT,
      image_url TEXT,
      display_order INTEGER DEFAULT 0,
      is_active INTEGER DEFAULT 1,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    -- 3. Dynamic Symptom Assessment Questions & Weights
    CREATE TABLE IF NOT EXISTS assessment_questions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      category_id INTEGER NOT NULL,
      question_bn TEXT NOT NULL,
      question_en TEXT,
      weight_yes INTEGER DEFAULT 10,
      weight_sometimes INTEGER DEFAULT 5,
      weight_no INTEGER DEFAULT 0,
      sort_order INTEGER DEFAULT 0,
      is_active INTEGER DEFAULT 1,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    -- 4. Patient Assessment Result History & Percentage Scores
    CREATE TABLE IF NOT EXISTS patient_assessment_scores (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      patient_id TEXT NOT NULL,
      appointment_id TEXT,
      assessment_date TEXT NOT NULL,
      scores_json TEXT NOT NULL,
      category_percentages_json TEXT NOT NULL,
      disclaimer_acknowledged INTEGER DEFAULT 1,
      raqi_notes TEXT,
      conducted_by TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    -- 5. Prescriptions & Clinical Treatment Plans
    CREATE TABLE IF NOT EXISTS prescriptions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      prescription_id TEXT UNIQUE NOT NULL,
      patient_id TEXT NOT NULL,
      session_id TEXT,
      quranic_prescriptions TEXT,
      dua_prescriptions TEXT,
      sunnah_remedies TEXT,
      daily_amal_instructions TEXT,
      prohibitions TEXT,
      followup_date TEXT,
      created_by TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    -- 6. Product Categories & E-Commerce Products
    CREATE TABLE IF NOT EXISTS product_categories (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name_bn TEXT NOT NULL,
      name_en TEXT NOT NULL,
      slug TEXT UNIQUE NOT NULL,
      display_order INTEGER DEFAULT 0,
      is_active INTEGER DEFAULT 1,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS products (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      category_id INTEGER,
      name_bn TEXT NOT NULL,
      name_en TEXT NOT NULL,
      slug TEXT UNIQUE NOT NULL,
      description_bn TEXT,
      description_en TEXT,
      price REAL NOT NULL,
      discount_price REAL,
      stock_quantity INTEGER DEFAULT 100,
      image_url TEXT,
      is_active INTEGER DEFAULT 1,
      display_order INTEGER DEFAULT 0,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    -- 7. Orders & Order Items
    CREATE TABLE IF NOT EXISTS orders (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      order_number TEXT UNIQUE NOT NULL,
      customer_name TEXT NOT NULL,
      customer_phone TEXT NOT NULL,
      shipping_address TEXT NOT NULL,
      subtotal_amount REAL NOT NULL,
      shipping_charge REAL DEFAULT 100,
      total_amount REAL NOT NULL,
      payment_method TEXT DEFAULT 'Cash on Delivery',
      status TEXT DEFAULT 'Order Received',
      customer_notes TEXT,
      internal_admin_notes TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS order_items (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      order_id INTEGER NOT NULL,
      product_id INTEGER NOT NULL,
      product_name TEXT NOT NULL,
      quantity INTEGER NOT NULL,
      unit_price REAL NOT NULL,
      total_price REAL NOT NULL,
      FOREIGN KEY (order_id) REFERENCES orders(id) ON DELETE CASCADE
    );

    -- 8. Courses, Modules & Lessons
    CREATE TABLE IF NOT EXISTS courses (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      title_bn TEXT NOT NULL,
      title_en TEXT NOT NULL,
      slug TEXT UNIQUE NOT NULL,
      thumbnail_url TEXT,
      fee REAL DEFAULT 0,
      duration TEXT,
      description_bn TEXT,
      description_en TEXT,
      objectives_bn TEXT,
      objectives_en TEXT,
      enrollment_instructions TEXT,
      is_active INTEGER DEFAULT 1,
      display_order INTEGER DEFAULT 0,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS course_modules (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      course_id INTEGER NOT NULL,
      title_bn TEXT NOT NULL,
      title_en TEXT,
      sort_order INTEGER DEFAULT 0,
      FOREIGN KEY (course_id) REFERENCES courses(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS course_lessons (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      module_id INTEGER NOT NULL,
      title_bn TEXT NOT NULL,
      title_en TEXT,
      content_bn TEXT,
      video_audio_url TEXT,
      duration TEXT,
      sort_order INTEGER DEFAULT 0,
      FOREIGN KEY (module_id) REFERENCES course_modules(id) ON DELETE CASCADE
    );

    -- 9. Advertisements & Banners
    CREATE TABLE IF NOT EXISTS advertisements (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      title TEXT NOT NULL,
      description TEXT,
      image_url TEXT NOT NULL,
      target_url TEXT,
      placement TEXT DEFAULT 'homepage',
      button_text TEXT DEFAULT 'বিস্তারিত দেখুন',
      start_date DATE,
      end_date DATE,
      is_active INTEGER DEFAULT 1,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    -- 10. Centralized Media Library
    CREATE TABLE IF NOT EXISTS media_library (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      filename TEXT NOT NULL,
      original_name TEXT NOT NULL,
      file_type TEXT NOT NULL,
      file_size INTEGER NOT NULL,
      file_path TEXT NOT NULL,
      caption TEXT,
      uploaded_by TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    -- 11. Sunnah Lifestyle Users & Authentication
    CREATE TABLE IF NOT EXISTS lifestyle_users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_uuid TEXT UNIQUE NOT NULL,
      full_name TEXT NOT NULL,
      phone TEXT UNIQUE NOT NULL,
      email TEXT,
      password_hash TEXT NOT NULL,
      profile_photo TEXT,
      total_points INTEGER DEFAULT 0,
      current_level TEXT DEFAULT 'Improvement Level',
      is_active INTEGER DEFAULT 1,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    -- 12. Daily Amal Checklist Activities (100 Points Daily Allocation)
    CREATE TABLE IF NOT EXISTS daily_amal_activities (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      category TEXT NOT NULL,
      title_bn TEXT NOT NULL,
      title_en TEXT NOT NULL,
      activity_type TEXT DEFAULT 'prayer',
      congregation_points INTEGER DEFAULT 10,
      individual_points INTEGER DEFAULT 6,
      fixed_points INTEGER DEFAULT 0,
      max_category_points INTEGER DEFAULT 50,
      sort_order INTEGER DEFAULT 0,
      is_active INTEGER DEFAULT 1,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    -- 13. 40-Day Competitions & Cohorts
    CREATE TABLE IF NOT EXISTS competitions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      title TEXT NOT NULL,
      description TEXT,
      start_date DATE NOT NULL,
      end_date DATE NOT NULL,
      duration_days INTEGER DEFAULT 40,
      status TEXT DEFAULT 'active',
      is_rolling INTEGER DEFAULT 0,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS competition_participants (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      competition_id INTEGER NOT NULL,
      user_id INTEGER NOT NULL,
      registered_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      total_points INTEGER DEFAULT 0,
      completed_days INTEGER DEFAULT 0,
      current_level TEXT DEFAULT 'Bronze',
      current_rank INTEGER DEFAULT 0,
      FOREIGN KEY (competition_id) REFERENCES competitions(id),
      FOREIGN KEY (user_id) REFERENCES lifestyle_users(id),
      UNIQUE(competition_id, user_id)
    );

    -- 14. Daily Amal Submissions (Max 100 points/day)
    CREATE TABLE IF NOT EXISTS daily_amal_submissions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      competition_id INTEGER,
      submission_date DATE NOT NULL,
      answers_json TEXT NOT NULL,
      total_points_awarded INTEGER NOT NULL,
      honesty_confirmed INTEGER DEFAULT 1,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES lifestyle_users(id),
      UNIQUE(user_id, submission_date)
    );

    -- 15. Competition Winners & Gift Management
    CREATE TABLE IF NOT EXISTS competition_winners (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      competition_id INTEGER NOT NULL,
      user_id INTEGER NOT NULL,
      position INTEGER NOT NULL,
      final_score INTEGER NOT NULL,
      awarded_level TEXT NOT NULL,
      gift_details TEXT,
      gift_awarded_date DATE,
      gift_status TEXT DEFAULT 'Pending',
      is_published INTEGER DEFAULT 0,
      consent_given INTEGER DEFAULT 1,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (competition_id) REFERENCES competitions(id),
      FOREIGN KEY (user_id) REFERENCES lifestyle_users(id)
    );
  `);

  // Safe Column Additions (Idempotent PRAGMA check)
  const adminCols = db.prepare('PRAGMA table_info(administrators)').all().map(c => c.name);
  if (!adminCols.includes('assigned_modules')) {
    db.exec('ALTER TABLE administrators ADD COLUMN assigned_modules TEXT;');
  }
  if (!adminCols.includes('is_active')) {
    db.exec('ALTER TABLE administrators ADD COLUMN is_active INTEGER DEFAULT 1;');
  }

  const apptCols = db.prepare('PRAGMA table_info(appointments)').all().map(c => c.name);
  if (!apptCols.includes('slip_image_url')) {
    db.exec('ALTER TABLE appointments ADD COLUMN slip_image_url TEXT;');
  }
  if (!apptCols.includes('slip_pdf_url')) {
    db.exec('ALTER TABLE appointments ADD COLUMN slip_pdf_url TEXT;');
  }
  if (!apptCols.includes('shareable_token')) {
    db.exec('ALTER TABLE appointments ADD COLUMN shareable_token TEXT;');
  }

  // Seed Data: 1. Product Categories & Initial Sunnah Supplements
  const catCount = db.prepare('SELECT COUNT(*) as count FROM product_categories').get().count;
  if (catCount === 0) {
    const insertCat = db.prepare('INSERT INTO product_categories (name_bn, name_en, slug, display_order) VALUES (?, ?, ?, ?)');
    insertCat.run('খাঁটি মধু ও সুরভী', 'Pure Honey & Fragrance', 'honey', 1);
    insertCat.run('কালোজিরা ও তেল', 'Black Seed & Essential Oils', 'oils', 2);
    insertCat.run('রুকইয়াহ সামগ্রী ও ভেষজ', 'Ruqyah Remedies & Herbs', 'remedies', 3);
    insertCat.run('আজওয়া খেজুর ও খাদ্য', 'Ajwa Dates & Superfoods', 'dates', 4);

    const insertProd = db.prepare(`
      INSERT INTO products (category_id, name_bn, name_en, slug, description_bn, description_en, price, discount_price, stock_quantity, image_url, display_order)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    insertProd.run(1, 'সুন্দরবনের খাঁটি খলিশা মধু (৫০০ গ্রাম)', 'Pure Sundarban Honey (500g)', 'pure-sundarban-honey-500g', 'প্রাকৃতিক ও শতভাগ ভেজালমুক্ত সুন্দরবনের খলিশা ফুলের মধু। রুকইয়াহ ও দৈনন্দিন স্বাস্থ্যের জন্য উপকারী।', '100% pure Sundarban Khalisha flower honey. Beneficial for Ruqyah and daily health.', 650, 590, 50, '/images/products/honey.jpg', 1);
    insertProd.run(2, 'কোল্ড প্রেসড প্রিমিয়াম কালোজিরা তেল (১০০ মি.লি.)', 'Cold Pressed Black Seed Oil (100ml)', 'cold-pressed-black-seed-oil-100ml', '১০০% বিশুদ্ধ ও ভার্জিন কালোজিরা তেল। মৃত্যু ছাড়া সকল রোগের শেফা সমৃদ্ধ সুন্নাতী ভেষজ।', '100% pure cold pressed extra virgin black seed oil.', 320, 290, 60, '/images/products/black-seed-oil.jpg', 2);
    insertProd.run(3, 'রুকইয়াহ স্পেশাল বরই পাতা গুঁড়া / পাতা (১০০ গ্রাম)', 'Ruqyah Sidr Leaf Powder (100g)', 'ruqyah-sidr-leaf-powder-100g', 'সিহর ও জাদুটোনা নষ্ট করার জন্য সহীহ সুন্নাহ নির্দেশিত তাজা বরই পাতা।', 'Natural Sidr (lote tree) leaves for Ruqyah and spiritual protection as directed in Sunnah.', 180, 150, 80, '/images/products/sidr.jpg', 3);
    insertProd.run(3, 'রুকইয়াহ গোসল ও পানের প্যাকেজ (কমপ্লিট কিট)', 'Complete Ruqyah Treatment Kit', 'complete-ruqyah-treatment-kit', 'পবিত্র কুরআন তিলাওয়াতকৃত তেল, বরই পাতার গুঁড়া, পানি ও ব্যবহারের বিস্তারিত নির্দেশিকা বই।', 'Complete home Ruqyah package including blessed oil, sidr, water and instructional booklet.', 850, 750, 40, '/images/products/kit.jpg', 4);
    insertProd.run(4, 'মদিনার প্রিমিয়াম আজওয়া খেজুর (৫০০ গ্রাম)', 'Premium Madinah Ajwa Dates (500g)', 'premium-madinah-ajwa-dates-500g', 'মদিনা মুনাওয়ারা থেকে সরাসরি আমদানিকৃত প্রিমিয়াম গ্রেড আজওয়া খেজুর। বিষ ও জাদু প্রতিরোধের জন্য প্রতিদিন সকালে ৭টি খাওয়ার হাদিস রয়েছে।', 'Authentic premium Grade-A Ajwa dates directly imported from Madinah.', 950, 890, 35, '/images/products/ajwa.jpg', 5);
    console.log('[Migration V8] Seeded initial product categories and Sunnah supplements.');
  }

  // Seed Data: 2. Hijama Packages
  const hijamaPkgCount = db.prepare('SELECT COUNT(*) as count FROM hijama_packages').get().count;
  if (hijamaPkgCount === 0) {
    const insertHijama = db.prepare(`
      INSERT INTO hijama_packages (title_bn, title_en, point_count, price, discount_price, description_bn, description_en, included_services, image_url, display_order)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    insertHijama.run('সাধারণ সুন্নাতী হিজামা (মাথা ও পিঠ)', 'Standard Sunnah Hijama', 5, 800, 700, 'সুন্নাহ নির্দেশিত ৫টি মৌলিক পয়েন্টে সম্পূর্ণ জীবাণুমুক্ত কাপিং থেরাপি। মাথাব্যথা ও মাইগ্রেনের জন্য অত্যন্ত ফলপ্রসূ।', 'Standard 5-point Sunnah cupping for general wellness and headache relief.', '৫টি ওয়ান-টাইম সার্জিক্যাল কাপ, জীবাণুমুক্তকরণ, প্রাথমিক ব্লাড প্রেসার ও পালস চেক', '/images/hijama/standard.jpg', 1);
    insertHijama.run('ফুল বডি ডিটক্স ও পেইন রিলিফ প্যাকেজ', 'Full Body Detox & Pain Relief', 10, 1500, 1350, 'কোমর, হাঁটু, পিঠ ও কাঁধের ব্যথানাশক ১০টি মূল পয়েন্টে গভীর বিষাক্ত রক্ত অপসারণ।', '10-point comprehensive detox for chronic back pain, joint stiffness, and fatigue.', '১০টি ওয়ান-টাইম কাপ, কালোজিরা ও অলিভ অয়েল ম্যাসাজ, জীবাণুমুক্ত ড্রেসিং', '/images/hijama/detox.jpg', 2);
    insertHijama.run('রুকইয়াহ স্পেশাল কাপিং (সিহর ও জিন রুকইয়াহ সমন্বিত)', 'Ruqyah Integrated Cupping', 7, 1200, 1100, 'রুকইয়াহ শারঈয়্যাহ চলাকালীন বা পরবর্তী পর্যায়ে সিহরের প্রভাবে রক্তে তৈরি হওয়া টক্সিন দূরীকরণে বিশেষ কাপিং।', 'Specialized cupping synchronized with spiritual Ruqyah diagnosis points.', '৭টি কাপ, রুকইয়াহ তেল মালিশ, সার্বক্ষণিক রাক্বীর পর্যবেক্ষণ', '/images/hijama/ruqyah-cupping.jpg', 3);
    console.log('[Migration V8] Seeded initial Hijama packages.');
  }

  // Seed Data: 3. Daily Amal Activities (100 Points Max Daily System)
  const amalCount = db.prepare('SELECT COUNT(*) as count FROM daily_amal_activities').get().count;
  if (amalCount === 0) {
    const insertAmal = db.prepare(`
      INSERT INTO daily_amal_activities (category, title_bn, title_en, activity_type, congregation_points, individual_points, fixed_points, max_category_points, sort_order)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    // 5 Daily Prayers (Total max 50 pts)
    insertAmal.run('Five Daily Prayers', 'ফজর সালাত (জামায়াতে / ওয়াক্তমতো)', 'Fajr Prayer', 'prayer', 10, 6, 0, 50, 1);
    insertAmal.run('Five Daily Prayers', 'যোহর সালাত (জামায়াতে / ওয়াক্তমতো)', 'Dhuhr Prayer', 'prayer', 10, 6, 0, 50, 2);
    insertAmal.run('Five Daily Prayers', 'আসর সালাত (জামায়াতে / ওয়াক্তমতো)', 'Asr Prayer', 'prayer', 10, 6, 0, 50, 3);
    insertAmal.run('Five Daily Prayers', 'মাগরিব সালাত (জামায়াতে / ওয়াক্তমতো)', 'Maghrib Prayer', 'prayer', 10, 6, 0, 50, 4);
    insertAmal.run('Five Daily Prayers', 'ইশা সালাত (জামায়াতে / ওয়াক্তমতো)', 'Isha Prayer', 'prayer', 10, 6, 0, 50, 5);

    // Nafl Worship (Total max 20 pts)
    insertAmal.run('Nafl Worship', 'তাহাজ্জুদ সালাত (রাত্রিকালীন সালাত)', 'Tahajjud Prayer', 'nafl', 0, 0, 8, 20, 6);
    insertAmal.run('Nafl Worship', 'ইশরাক ও চাশতের সালাত', 'Ishraq & Duha Prayer', 'nafl', 0, 0, 6, 20, 7);
    insertAmal.run('Nafl Worship', 'আউওয়াবীন সালাত ও রাওয়াতীব সুন্নতসমূহ', 'Awwabin & Sunan Rawatib', 'nafl', 0, 0, 6, 20, 8);

    // Quran and Dhikr (Total max 10 pts)
    insertAmal.run('Quran & Dhikr', 'দৈনিক কুরআন তিলাওয়াত (অনূর্ধ্ব ১ রুকু বা তদূর্ধ্ব)', 'Daily Quran Recitation', 'fixed', 0, 0, 4, 10, 9);
    insertAmal.run('Quran & Dhikr', 'সকাল ও সন্ধ্যার মাসনূন আজকারসমূহ পাঠ', 'Morning & Evening Adhkar', 'fixed', 0, 0, 3, 10, 10);
    insertAmal.run('Quran & Dhikr', 'ইস্তিগফার ও দুরুদ পাঠ (কমপক্ষে ১০০ বার)', 'Istighfar & Durood', 'fixed', 0, 0, 3, 10, 11);

    // Charity and Donations (Total max 10 pts)
    insertAmal.run('Charity & Giving', 'দৈনিক সদকাহ / বিপদগ্রস্তকে দান বা সহায়তা', 'Daily Charity & Giving', 'fixed', 0, 0, 10, 10, 12);

    // Sunnah & Healthy Habits (Total max 10 pts)
    insertAmal.run('Sunnah Habits', 'মিসওয়াক ব্যবহার ও সুন্নাতী পরিচ্ছন্নতা', 'Miswak & Sunnah Cleanliness', 'fixed', 0, 0, 4, 10, 13);
    insertAmal.run('Sunnah Habits', 'ইসলামী বই পাঠ / দ্বীনি ইলম অর্জন', 'Islamic Reading & Knowledge', 'fixed', 0, 0, 3, 10, 14);
    insertAmal.run('Sunnah Habits', 'শারীরিক ব্যায়াম / স্বাস্থ্যকর সুন্নাতী খাদ্যাভ্যাস', 'Physical Exercise & Sunnah Diet', 'fixed', 0, 0, 3, 10, 15);

    console.log('[Migration V8] Seeded initial Daily Amal activities with 100-pt maximum rules.');
  }

  // Seed Data: 4. Initial Competition
  const compCount = db.prepare('SELECT COUNT(*) as count FROM competitions').get().count;
  if (compCount === 0) {
    db.prepare(`
      INSERT INTO competitions (title, description, start_date, end_date, duration_days, status, is_rolling)
      VALUES (?, ?, DATE('now'), DATE('now', '+40 days'), 40, 'active', 1)
    `).run(
      '৪০ দিনের সুন্নাহ লাইফস্টাইল আমল প্রতিযোগিতা (সেশন ১)',
      'দৈনিক ১০০ পয়েন্টের আমল ট্র্যাকিংয়ের মাধ্যমে আত্মউন্নয়ন ও সুন্নাতী জীবনধারার ৪০ দিনের ইসলামিক অভ্যাস গঠন প্রতিযোগিতা।'
    );
    console.log('[Migration V8] Seeded initial 40-Day Sunnah Lifestyle Competition.');
  }

  // Seed Data: 5. Courses
  const courseCount = db.prepare('SELECT COUNT(*) as count FROM courses').get().count;
  if (courseCount === 0) {
    const insertCourse = db.prepare(`
      INSERT INTO courses (title_bn, title_en, slug, thumbnail_url, fee, duration, description_bn, objectives_bn, enrollment_instructions)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    insertCourse.run(
      'নিজে নিজে রুকইয়াহ করার পূর্ণাঙ্গ গাইডলাইন (Self-Ruqyah Masterclass)',
      'Complete Self-Ruqyah Masterclass',
      'self-ruqyah-masterclass',
      '/images/courses/self-ruqyah.jpg',
      0, // Free educational course
      '৪ সপ্তাহ (৮টি লেকচার)',
      'কুরআন ও সহীহ সুন্নাহ মোতাবেক বদনজর, হিংসা ও পারিবারিক সমস্যার বিরুদ্ধে ঘরে বসে নিজেই নিজের পরিবারের রুকইয়াহ করার প্র্যাকটিক্যাল কোর্স।',
      '১. বদনজর ও সিহরের প্রাথমিক লক্ষণ চেনা\n২. সঠিক উচ্চারণে রুকইয়ার আয়াতসমূহ পড়া\n৩. তেল ও পানিতে ফুঁ দিয়ে চিকিৎসা পদ্ধতি\n৪. দৈনন্দিন সুরক্ষা বজায় রাখার নিয়ম',
      'কোর্সটি সকলের জন্য উন্মুক্ত ও ফ্রি। নিচে দেওয়া মডিউলসমূহ ধারাবাহিকভাবে শুনুন ও আমল করুন।'
    );
    console.log('[Migration V8] Seeded initial educational course.');
  }

  // Seed Data: 6. Ruqyah Audio Library Resources
  const rscCount = db.prepare('SELECT COUNT(*) as count FROM ruqyah_resources').get().count;
  if (rscCount === 0) {
    const insertRsc = db.prepare(`
      INSERT INTO ruqyah_resources (category, title_ar, title_bn, title_en, text_ar, text_bn, text_en, audio_url, pdf_url, duration, display_order)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    insertRsc.run(
      'general',
      'آيَةُ الْكُرْسِيِّ',
      'আয়াতুল কুরসী (সূরা আল-বাক্বারাহ: ২৫৫)',
      'Ayat al-Kursi (Surah Al-Baqarah: 255)',
      'اللَّهُ لَا إِلَٰهَ إِلَّا هُوَ الْحَيُّ الْقَيُّومُ ۚ لَا تَأْخُذُهُ سِنَةٌ وَلَا نَوْمٌ ۚ لَّهُ مَا فِي السَّمَاوَاتِ وَمَا فِي الْأَرْضِ...',
      'আল্লাহ, তিনি ছাড়া কোনো সত্য ইলাহ নেই। তিনি চিরঞ্জীব, সর্বসত্তার ধারক। তাঁকে তন্দ্রাও স্পর্শ করতে পারে না, নিদ্রাও নয়...',
      'Allah - there is no deity except Him, the Ever-Living, the Sustainer of all existence...',
      '/audio/ayatul-kursi.mp3',
      '/pdf/ayatul-kursi.pdf',
      '02:15',
      1
    );
    insertRsc.run(
      'evil_eye',
      'الْمُعَوِّذَتَيْنِ',
      'আল-মু’আওবিযাতাইন (সূরা আল-ফালাক্ব ও সূরা আন-নাস)',
      'Al-Mu’awwidhatayn (Surah Al-Falaq & An-Nas)',
      'قُلْ أَعُوذُ بِرَبِّ الْفَلَقِ... قُلْ أَعُوذُ بِرَبِّ النَّاسِ...',
      'বলুন, আমি আশ্রয় প্রার্থনা করছি ঊষার রবের কাছে... বলুন, আমি আশ্রয় প্রার্থনা করছি মানুষের রবের কাছে...',
      'Say: I seek refuge in the Lord of daybreak... Say: I seek refuge in the Lord of mankind...',
      '/audio/muawwidhatayn.mp3',
      '/pdf/muawwidhatayn.pdf',
      '03:40',
      2
    );
    console.log('[Migration V8] Seeded initial Ruqyah audio resources.');
  }

  // Seed Data: 7. Weighted Symptom Assessment Questions (for all 10 categories)
  const qCount = db.prepare('SELECT COUNT(*) as count FROM assessment_questions').get().count;
  if (qCount === 0) {
    const insertQ = db.prepare(`
      INSERT INTO assessment_questions (category_id, question_bn, question_en, weight_yes, weight_sometimes, weight_no, sort_order)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `);
    // Category 1: Evil Eye (বদনজর)
    insertQ.run(1, 'অকারণে শরীরে প্রচণ্ড ক্লান্তি, আলস্য বা ভারী ভাব অনুভূত হয় কি?', 'Do you feel sudden severe fatigue or heaviness without physical cause?', 10, 5, 0, 1);
    insertQ.run(1, 'মাথার পেছনের অংশে বা দুই কাঁধে কোনো অজানা চাপ অনুভব করেন কি?', 'Do you feel unexplained pressure in the back of your head or shoulders?', 10, 5, 0, 2);
    insertQ.run(1, 'তিলাওয়াত বা রুকইয়াহ শুনলে ঘন ঘন হাই আসে বা চোখ দিয়ে পানি পড়ে কি?', 'Do you experience continuous yawning or watering eyes during Ruqyah recitation?', 10, 5, 0, 3);
    insertQ.run(1, 'মেডিকেল রিপোর্টে কোনো সমস্যা না থাকা সত্ত্বেও চামড়ায় চুলকানি বা লালচে দাগ দেখা যায় কি?', 'Do you have skin rashes/itching with normal medical checkups?', 10, 5, 0, 4);

    // Category 2: Hasad (হিংসা)
    insertQ.run(2, 'কোনো স্পষ্ট কারণ ছাড়া ব্যবসা, চাকরি বা পড়ালেখায় হঠাৎ চরম স্থবিরতা এসেছে কি?', 'Has there been a sudden inexplicable blockage in your studies/business/career?', 10, 5, 0, 1);
    insertQ.run(2, 'পারিবারিক বা দাম্পত্য জীবনে সামান্য বিষয়ে হঠাৎ প্রচণ্ড রাগ বা অশান্তি তৈরি হয় কি?', 'Do minor issues cause sudden extreme anger or family discord?', 10, 5, 0, 2);

    // Category 3: Sihr (জাদু)
    insertQ.run(3, 'পেটে প্রচণ্ড ব্যথা, গ্যাসের তীব্র সমস্যা বা পেটের ভেতরে কোনো কিছু নড়াচড়া অনুভব হয় কি?', 'Do you feel severe stomach pain or a moving sensation in the abdominal area?', 10, 5, 0, 1);
    insertQ.run(3, 'কুরআন তিলাওয়াত বা আযান শুনলে তীব্র অস্বস্তি বা রাগ লাগে কি?', 'Do you feel intense irritation or agitation when hearing the Adhan or Quran?', 10, 5, 0, 2);
    insertQ.run(3, 'বিবাহে বারবার প্রস্তাব এসেও শেষ মুহূর্তে অলৌকিকভাবে ভেঙে যায় কি?', 'Do marriage proposals repeatedly break down at the final stage for no valid reason?', 10, 5, 0, 3);

    // Category 4: Jinn-related (জিন সংক্রান্ত)
    insertQ.run(4, 'ঘুমের ঘোরে বা জাগ্রত অবস্থায় শরীরে কোনো অবয়ব বা কারো উপস্থিতি টের পান কি?', 'Do you sense an unseen presence or figure in your room or near you?', 10, 5, 0, 1);
    insertQ.run(4, 'ঘুমন্ত অবস্থায় হঠাৎ বোবায় ধরা (Sleep Paralysis) বা শ্বাসরুদ্ধকর অবস্থা হয় কি?', 'Do you regularly experience sleep paralysis or feeling suffocated at night?', 10, 5, 0, 2);

    // Category 5: Dream-related (স্বপ্ন সংক্রান্ত)
    insertQ.run(5, 'স্বপ্নে ঘন ঘন সাপ, বিচ্ছু, কালো কুকুর বা হিংস্র প্রাণী আক্রমণ করতে দেখেন কি?', 'Do you frequently dream of snakes, scorpions, black dogs, or predatory beasts?', 10, 5, 0, 1);
    insertQ.run(5, 'উঁচু স্থান থেকে নিচে পড়ে যাওয়া বা গভীর পানিতে ডুবে যাওয়ার স্বপ্ন দেখেন কি?', 'Do you often dream of falling from heights or drowning in deep water?', 10, 5, 0, 2);
    insertQ.run(5, 'স্বপ্নে কবরস্থান, নোংরা নর্দমা বা মৃত ব্যক্তিদের সাথে কথা বলতে দেখেন কি?', 'Do you frequently dream of graveyards, filthy places, or interacting with the dead?', 10, 5, 0, 3);

    console.log('[Migration V8] Seeded weighted diagnostic questions.');
  }

  console.log('[Migration V8] Master platform migration completed successfully.');
}

module.exports = { runMigrationV8 };
