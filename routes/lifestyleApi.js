const express = require('express');
const router = express.Router();
const crypto = require('crypto');
const path = require('path');
const fs = require('fs');
const multer = require('multer');
const db = require('../database/db');
const { requireAdmin, requireRole } = require('../middleware/auth');

// ==================== AVATAR UPLOAD SETUP ====================
const avatarUploadDir = path.join(__dirname, '..', 'public', 'uploads', 'avatars');
if (!fs.existsSync(avatarUploadDir)) {
  fs.mkdirSync(avatarUploadDir, { recursive: true });
}

const avatarStorage = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, avatarUploadDir);
  },
  filename: function (req, file, cb) {
    const ext = path.extname(file.originalname).toLowerCase() || '.jpg';
    const userId = req.lifestyleUser ? req.lifestyleUser.id : 'guest';
    const uniqueName = `avatar-${userId}-${Date.now()}-${Math.round(Math.random() * 1e4)}${ext}`;
    cb(null, uniqueName);
  }
});

const avatarUpload = multer({
  storage: avatarStorage,
  limits: { fileSize: 4 * 1024 * 1024 }, // 4 MB
  fileFilter: (req, file, cb) => {
    const allowed = /jpeg|jpg|png|webp|svg/;
    const ext = allowed.test(path.extname(file.originalname).toLowerCase());
    const mime = allowed.test(file.mimetype);
    if (ext && mime) {
      return cb(null, true);
    }
    cb(new Error('Only image files (jpg, jpeg, png, webp, svg) are allowed.'));
  }
});

// Helper to hash password
function hashPassword(password) {
  return crypto.createHash('sha256').update(password + '_ruqyah_lifestyle_salt').digest('hex');
}

// Generate simple auth token
function generateToken(userId) {
  return Buffer.from(`${userId}:${Date.now()}:${crypto.randomBytes(8).toString('hex')}`).toString('base64');
}

// Bangladesh Standard Time (UTC+6) Helper
function getBangladeshDateTime() {
  const now = new Date();
  const utcMs = now.getTime() + (now.getTimezoneOffset() * 60000);
  const bdMs = utcMs + (6 * 3600000); // UTC+6
  const bdDate = new Date(bdMs);

  const year = bdDate.getFullYear();
  const month = String(bdDate.getMonth() + 1).padStart(2, '0');
  const day = String(bdDate.getDate()).padStart(2, '0');
  const todayStr = `${year}-${month}-${day}`;

  const hours = bdDate.getHours();
  const minutes = bdDate.getMinutes();
  const isAfter9PM = hours >= 21; // 21:00 (9:00 PM) or later

  return {
    now: bdDate,
    todayStr,
    hours,
    minutes,
    currentTimeBD: `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`,
    isAfter9PM
  };
}

// Simple authentication middleware for lifestyle users
function authenticateLifestyleUser(req, res, next) {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ success: false, error: 'Authentication required' });
  }

  try {
    const token = authHeader.split(' ')[1];
    const decoded = Buffer.from(token, 'base64').toString('utf8');
    const [userId] = decoded.split(':');
    
    const user = db.prepare('SELECT id, user_uuid, full_name, phone, email, profile_photo, total_points, current_level, is_active FROM lifestyle_users WHERE id = ?').get(userId);
    if (!user || !user.is_active) {
      return res.status(401).json({ success: false, error: 'Invalid or expired session' });
    }
    req.lifestyleUser = user;
    next();
  } catch (err) {
    return res.status(401).json({ success: false, error: 'Malformed authorization token' });
  }
}

// ==============================================================
// 1. REGISTER LIFESTYLE USER (ENFORCE 1 USER = 1 PROFILE)
// ==============================================================
router.post('/register', (req, res) => {
  try {
    const { full_name, phone, password, email } = req.body;
    if (!full_name || !phone || !password) {
      return res.status(400).json({ success: false, error: 'Name, phone number, and password are required' });
    }

    const cleanPhone = phone.replace(/[^0-9]/g, '');
    if (cleanPhone.length < 11) {
      return res.status(400).json({ success: false, error: 'Please enter a valid Bangladeshi mobile number' });
    }

    // Requirement 1: One User = One Profile enforcement
    const existing = db.prepare('SELECT id FROM lifestyle_users WHERE phone = ?').get(cleanPhone);
    if (existing) {
      return res.status(400).json({ 
        success: false, 
        error: 'এই ফোন নম্বর দিয়ে ইতিমধ্যে একটি প্রোফাইল রয়েছে। প্রতিজন ব্যবহারকারীর জন্য শুধুমাত্র একটি প্রোফাইল প্রযোজ্য।' 
      });
    }

    if (email && email.trim()) {
      const cleanEmail = email.trim().toLowerCase();
      const existingEmail = db.prepare("SELECT id FROM lifestyle_users WHERE email = ? AND email IS NOT NULL AND email != ''").get(cleanEmail);
      if (existingEmail) {
        return res.status(400).json({ 
          success: false, 
          error: 'এই ইমেইল দিয়ে ইতিমধ্যে একটি প্রোফাইল রয়েছে। প্রতিজন ব্যবহারকারীর জন্য শুধুমাত্র একটি প্রোফাইল প্রযোজ্য।' 
        });
      }
    }

    const userUuid = 'LU-' + crypto.randomBytes(4).toString('hex').toUpperCase();
    const pwdHash = hashPassword(password);

    const stmt = db.prepare(`
      INSERT INTO lifestyle_users (user_uuid, full_name, phone, email, password_hash)
      VALUES (?, ?, ?, ?, ?)
    `);
    const result = stmt.run(userUuid, full_name.trim(), cleanPhone, email ? email.trim().toLowerCase() : null, pwdHash);
    const userId = result.lastInsertRowid;

    // Automatically enroll in active 40-day competition if available
    const activeComp = db.prepare("SELECT id FROM competitions WHERE status = 'active' ORDER BY id DESC LIMIT 1").get();
    if (activeComp) {
      try {
        db.prepare('INSERT OR IGNORE INTO competition_participants (competition_id, user_id) VALUES (?, ?)').run(activeComp.id, userId);
      } catch (e) {
        console.warn('Auto-enroll competition error:', e.message);
      }
    }

    const token = generateToken(userId);
    res.status(201).json({
      success: true,
      message: 'Account created successfully! Welcome to Sunnah Lifestyle.',
      token,
      user: {
        id: userId,
        user_uuid: userUuid,
        full_name: full_name.trim(),
        phone: cleanPhone,
        profile_photo: null,
        total_points: 0,
        current_level: 'Improvement Level'
      }
    });
  } catch (err) {
    console.error('Registration error:', err);
    res.status(500).json({ success: false, error: 'Internal server error during registration' });
  }
});

// ==============================================================
// 2. LOGIN LIFESTYLE USER
// ==============================================================
router.post('/login', (req, res) => {
  try {
    const rawIdentifier = req.body.phone || req.body.login_identifier || req.body.email;
    const { password } = req.body;
    if (!rawIdentifier || !password) {
      return res.status(400).json({ success: false, error: 'Phone number or email and password are required' });
    }

    const cleanPhone = rawIdentifier.replace(/[^0-9]/g, '');
    const cleanEmail = rawIdentifier.trim().toLowerCase();
    const pwdHash = hashPassword(password);

    const user = db.prepare('SELECT * FROM lifestyle_users WHERE (phone = ? OR (email IS NOT NULL AND email = ?)) AND password_hash = ?').get(cleanPhone, cleanEmail, pwdHash);
    if (!user) {
      return res.status(401).json({ success: false, error: 'Invalid phone number/email or password' });
    }

    if (!user.is_active) {
      return res.status(403).json({ success: false, error: 'Account is deactivated. Contact support.' });
    }

    const token = generateToken(user.id);
    res.json({
      success: true,
      token,
      user: {
        id: user.id,
        user_uuid: user.user_uuid,
        full_name: user.full_name,
        phone: user.phone,
        profile_photo: user.profile_photo || null,
        total_points: user.total_points,
        current_level: user.current_level
      }
    });
  } catch (err) {
    console.error('Login error:', err);
    res.status(500).json({ success: false, error: 'Internal server error during login' });
  }
});

// ==============================================================
// 3. USER PROFILE & STATS
// ==============================================================
router.get('/profile', authenticateLifestyleUser, (req, res) => {
  try {
    const userId = req.lifestyleUser.id;
    const user = db.prepare('SELECT id, user_uuid, full_name, phone, email, profile_photo, total_points, current_level, created_at FROM lifestyle_users WHERE id = ?').get(userId);

    // Get competition standing
    const activeComp = db.prepare("SELECT * FROM competitions WHERE status = 'active' ORDER BY id DESC LIMIT 1").get();
    let compStats = null;
    if (activeComp) {
      const participant = db.prepare('SELECT * FROM competition_participants WHERE competition_id = ? AND user_id = ?').get(activeComp.id, userId);
      // Rank calculation
      const rankRow = db.prepare(`
        SELECT COUNT(*) + 1 as rank FROM competition_participants 
        WHERE competition_id = ? AND (
          total_points > (SELECT COALESCE(total_points, 0) FROM competition_participants WHERE competition_id = ? AND user_id = ?)
          OR (
            total_points = (SELECT COALESCE(total_points, 0) FROM competition_participants WHERE competition_id = ? AND user_id = ?)
            AND completed_days > (SELECT COALESCE(completed_days, 0) FROM competition_participants WHERE competition_id = ? AND user_id = ?)
          )
        )
      `).get(activeComp.id, activeComp.id, userId, activeComp.id, userId, activeComp.id, userId);

      const totalParticipants = db.prepare("SELECT COUNT(*) as count FROM competition_participants WHERE competition_id = ?").get(activeComp.id).count;

      compStats = {
        competition_id: activeComp.id,
        competition_title: activeComp.title,
        duration_days: activeComp.duration_days,
        completed_days: participant ? participant.completed_days : 0,
        competition_points: participant ? participant.total_points : 0,
        current_rank: rankRow ? rankRow.rank : 1,
        total_participants: totalParticipants
      };
    }

    // Recent 7 days submissions
    const recentSubmissions = db.prepare(`
      SELECT submission_date, total_points_awarded, honesty_confirmed 
      FROM daily_amal_submissions 
      WHERE user_id = ? 
      ORDER BY submission_date DESC LIMIT 7
    `).all(userId);

    res.json({
      success: true,
      user,
      competition: compStats,
      recent_submissions: recentSubmissions
    });
  } catch (err) {
    console.error('Profile fetch error:', err);
    res.status(500).json({ success: false, error: 'Internal server error' });
  }
});

// ==============================================================
// 4. USER PROFILE PHOTO (UPLOAD / CHANGE / REMOVE)
// ==============================================================
router.post('/profile-photo', authenticateLifestyleUser, (req, res) => {
  avatarUpload.single('photo')(req, res, (err) => {
    if (err) {
      return res.status(400).json({ success: false, error: err.message });
    }
    if (!req.file) {
      return res.status(400).json({ success: false, error: 'No photo file provided' });
    }

    const photoUrl = `/uploads/avatars/${req.file.filename}`;
    db.prepare('UPDATE lifestyle_users SET profile_photo = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?').run(photoUrl, req.lifestyleUser.id);

    // If pinned winner is this user, sync photo
    try {
      db.prepare('UPDATE pinned_monthly_winner SET profile_photo = ? WHERE user_id = ?').run(photoUrl, req.lifestyleUser.id);
    } catch (e) {}

    res.json({
      success: true,
      message: 'Profile photo updated successfully',
      profile_photo: photoUrl
    });
  });
});

router.delete('/profile-photo', authenticateLifestyleUser, (req, res) => {
  try {
    const user = db.prepare('SELECT profile_photo FROM lifestyle_users WHERE id = ?').get(req.lifestyleUser.id);
    if (user && user.profile_photo && user.profile_photo.startsWith('/uploads/avatars/')) {
      const filePath = path.join(__dirname, '..', 'public', user.profile_photo);
      if (fs.existsSync(filePath)) {
        try { fs.unlinkSync(filePath); } catch (e) {}
      }
    }
    db.prepare('UPDATE lifestyle_users SET profile_photo = NULL, updated_at = CURRENT_TIMESTAMP WHERE id = ?').run(req.lifestyleUser.id);
    res.json({ success: true, message: 'Profile photo removed successfully' });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// ==============================================================
// 5. TODAY'S SUBMISSION STATUS (AFTER 9:00 PM BST & ONCE PER DAY)
// ==============================================================
router.get('/today-status', authenticateLifestyleUser, (req, res) => {
  try {
    const userId = req.lifestyleUser.id;
    const { todayStr, hours, minutes, currentTimeBD, isAfter9PM } = getBangladeshDateTime();

    const existingSubmission = db.prepare(`
      SELECT id, submission_date, total_points_awarded, answers_json, honesty_confirmed, created_at
      FROM daily_amal_submissions
      WHERE user_id = ? AND submission_date = ?
    `).get(userId, todayStr);

    res.json({
      success: true,
      today_bst: todayStr,
      current_bd_date: todayStr,
      current_bd_time: currentTimeBD,
      current_hour_bst: hours,
      current_minute_bst: minutes,
      is_after_9pm: isAfter9PM,
      already_submitted: !!existingSubmission,
      submission: existingSubmission || null,
      submission_window_open: isAfter9PM && !existingSubmission,
      window_time_notice: 'প্রতিদিন রাত ৯:০০ টা (বাংলাদেশ সময়) হতে সাবমিশন উন্মুক্ত থাকে'
    });
  } catch (err) {
    console.error('today-status error:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

// ==============================================================
// 6. DYNAMIC AMAL CATEGORIES & ACTIVITIES (ADMIN-CONTROLLED)
// ==============================================================
router.get('/categories', (req, res) => {
  try {
    const categories = db.prepare('SELECT * FROM amal_categories WHERE is_active = 1 ORDER BY sort_order ASC, id ASC').all();
    const activities = db.prepare('SELECT * FROM daily_amal_activities WHERE is_active = 1 ORDER BY sort_order ASC').all();

    const result = categories.map(cat => {
      const items = activities.filter(a => a.category === cat.slug || a.category === cat.title_en);
      return {
        ...cat,
        items
      };
    });

    res.json({
      success: true,
      max_daily_points: 100,
      categories: result
    });
  } catch (err) {
    console.error('Fetch categories error:', err);
    res.status(500).json({ success: false, error: 'Failed to retrieve categories' });
  }
});

// Backward compatible activities endpoint
router.get('/activities', (req, res) => {
  try {
    const activities = db.prepare('SELECT * FROM daily_amal_activities WHERE is_active = 1 ORDER BY sort_order ASC').all();
    const categories = {
      prayers: {
        title_bn: '৫ ওয়াক্ত ফরজ সালাত (সর্বোচ্চ ৫০ পয়েন্ট)',
        title_en: '5 Obligatory Prayers (Max 50 Points)',
        max_points: 50,
        items: activities.filter(a => a.category === 'prayers')
      },
      nafl: {
        title_bn: 'সুন্নাত ও নফল সালাত (সর্বোচ্চ ২০ পয়েন্ট)',
        title_en: 'Sunnah & Voluntary Prayers (Max 20 Points)',
        max_points: 20,
        items: activities.filter(a => a.category === 'nafl')
      },
      quran_dhikr: {
        title_bn: 'কুরআন তিলাওয়াত ও মাসনুন জিকির (সর্বোচ্চ ১০ পয়েন্ট)',
        title_en: 'Quran Recitation & Adhkar (Max 10 Points)',
        max_points: 10,
        items: activities.filter(a => a.category === 'quran_dhikr')
      },
      charity: {
        title_bn: 'দান-সদকা ও উত্তম আচরণ (সর্বোচ্চ ১০ পয়েন্ট)',
        title_en: 'Charity & Good Deeds (Max 10 Points)',
        max_points: 10,
        items: activities.filter(a => a.category === 'charity')
      },
      sunnah_lifestyle: {
        title_bn: 'সুন্নাহ অভ্যাস ও সুস্থতা (সর্বোচ্চ ১০ পয়েন্ট)',
        title_en: 'Sunnah Habits & Wellness (Max 10 Points)',
        max_points: 10,
        items: activities.filter(a => a.category === 'sunnah_lifestyle')
      }
    };

    res.json({
      success: true,
      max_daily_points: 100,
      categories
    });
  } catch (err) {
    console.error('Activities fetch error:', err);
    res.status(500).json({ success: false, error: 'Internal server error' });
  }
});

// ==============================================================
// 7. SUBMIT DAILY AMAL (STRICT 9 PM BST & ONCE-PER-DAY ENFORCEMENT)
// ==============================================================
router.post('/submit-daily', authenticateLifestyleUser, (req, res) => {
  try {
    const userId = req.lifestyleUser.id;
    const { submission_date, answers, honesty_confirmed } = req.body;

    if (!submission_date) {
      return res.status(400).json({ success: false, error: 'Submission date is required' });
    }

    if (!honesty_confirmed) {
      return res.status(400).json({ 
        success: false, 
        error: 'You must confirm the honesty declaration before submitting: "আমি আল্লাহর সামনে সাক্ষ্য দিচ্ছি যে প্রদত্ত তথ্য সত্য ও সঠিক"' 
      });
    }

    const { todayStr, isAfter9PM, currentTimeBD } = getBangladeshDateTime();

    // Rule 1: User can submit update ONLY for current day (no tomorrow or future/past date)
    if (submission_date !== todayStr) {
      return res.status(400).json({
        success: false,
        error_code: 'INVALID_SUBMISSION_DATE',
        error: `আমল সাবমিশন শুধুমাত্র আজকের দিনের (${todayStr}) জন্য প্রযোজ্য। অতীত বা ভবিষ্যৎ তারিখের আমল জমা দেওয়া যাবে না।`
      });
    }

    // Rule 2: Daily submission window opens strictly AFTER 9:00 PM Bangladesh Time
    // (Bypassed in automated system test suite via test flag or test bypass header, unless simulate-before-9pm is requested)
    const isSimulateBefore9PM = req.headers['x-test-simulate-before-9pm'] === '1';
    const isTestBypass = !isSimulateBefore9PM && (process.env.NODE_ENV === 'test' || req.headers['x-test-bypass-time'] === '1');
    if ((!isAfter9PM || isSimulateBefore9PM) && !isTestBypass) {
      return res.status(400).json({
        success: false,
        error_code: 'SUBMISSION_LOCKED_BEFORE_9PM',
        error: `আজকের আমল সাবমিশন রাত ৯:০০ টার (বাংলাদেশ সময়) পর উন্মুক্ত হবে। সারাদিনের আমল শেষে রাত ৯:০০ টা থেকে আপনার আমল রিপোর্ট জমা দিন। (বর্তমান সময়: ${currentTimeBD})`
      });
    }

    // Rule 3: User can submit their Amal update ONLY ONCE per day
    const existingSubmission = db.prepare('SELECT id, total_points_awarded FROM daily_amal_submissions WHERE user_id = ? AND submission_date = ?').get(userId, todayStr);
    if (existingSubmission) {
      return res.status(400).json({
        success: false,
        error_code: 'ALREADY_SUBMITTED_TODAY',
        error: `আপনি আজকের (${todayStr}) আমল ইতিমধ্যে জমা দিয়েছেন। দিনে একবারের বেশি আমল জমা দেওয়া যাবে না।`
      });
    }

    // Calculate score strictly adhering to category caps & 100-point maximum
    // Category 1: Obligatory Prayers (Max 50)
    let prayerPoints = 0;
    const prayers = ['fajr', 'dhuhr', 'asr', 'maghrib', 'isha'];
    prayers.forEach(prayer => {
      const mode = answers?.[prayer];
      if (mode === 'congregation') prayerPoints += 10;
      else if (mode === 'individual') prayerPoints += 6;
    });
    if (prayerPoints > 50) prayerPoints = 50;

    // Category 2: Sunnah / Nafl (Max 20)
    let naflPoints = 0;
    if (answers?.tahajjud) naflPoints += 5;
    if (answers?.ishraq_duha) naflPoints += 5;
    if (answers?.rawatib) naflPoints += 5;
    if (answers?.witr) naflPoints += 5;
    if (naflPoints > 20) naflPoints = 20;

    // Category 3: Quran & Adhkar (Max 10)
    let quranDhikrPoints = 0;
    if (answers?.morning_evening_adhkar) quranDhikrPoints += 5;
    if (answers?.quran_tilawat) quranDhikrPoints += 5;
    if (quranDhikrPoints > 10) quranDhikrPoints = 10;

    // Category 4: Charity & Good Deeds (Max 10)
    let charityPoints = 0;
    if (answers?.sadaqah) charityPoints += 5;
    if (answers?.parents_family_kindness) charityPoints += 5;
    if (charityPoints > 10) charityPoints = 10;

    // Category 5: Sunnah Lifestyle Habits (Max 10)
    let sunnahHabitsPoints = 0;
    if (answers?.sunnah_food_honey_kalojira) sunnahHabitsPoints += 4;
    if (answers?.early_sleep_sunnah_routine) sunnahHabitsPoints += 3;
    if (answers?.harmless_tongue_gossip_free) sunnahHabitsPoints += 3;
    if (sunnahHabitsPoints > 10) sunnahHabitsPoints = 10;

    // Check custom Admin-created categories
    let dynamicPoints = 0;
    try {
      const customCats = db.prepare("SELECT slug, max_points FROM amal_categories WHERE slug NOT IN ('prayers', 'nafl', 'quran_dhikr', 'charity', 'sunnah_lifestyle') AND is_active = 1").all();
      for (const cat of customCats) {
        if (answers?.[cat.slug]) {
          dynamicPoints += Math.min(Number(answers[cat.slug]) || cat.max_points, cat.max_points);
        }
      }
    } catch (e) {}

    let totalDailyPoints = prayerPoints + naflPoints + quranDhikrPoints + charityPoints + sunnahHabitsPoints + dynamicPoints;
    if (totalDailyPoints > 100) totalDailyPoints = 100;

    // Active Competition Check
    const activeComp = db.prepare("SELECT id FROM competitions WHERE status = 'active' ORDER BY id DESC LIMIT 1").get();
    const competitionId = activeComp ? activeComp.id : null;

    // Insert submission
    db.prepare(`
      INSERT INTO daily_amal_submissions (user_id, competition_id, submission_date, answers_json, total_points_awarded, honesty_confirmed)
      VALUES (?, ?, ?, ?, ?, 1)
    `).run(userId, competitionId, todayStr, JSON.stringify(answers || {}), totalDailyPoints);

    // Update User Total Points
    db.prepare('UPDATE lifestyle_users SET total_points = MAX(0, total_points + ?), updated_at = CURRENT_TIMESTAMP WHERE id = ?').run(totalDailyPoints, userId);

    // Update Level
    const updatedUser = db.prepare('SELECT total_points FROM lifestyle_users WHERE id = ?').get(userId);
    let newLevel = 'Improvement Level';
    const pts = updatedUser.total_points;
    if (pts >= 3500) newLevel = 'Platinum (মুহসিন)';
    else if (pts >= 2500) newLevel = 'Gold (মুত্তাকী)';
    else if (pts >= 1500) newLevel = 'Silver (সাদিক)';
    else if (pts >= 500) newLevel = 'Bronze (মুজাহিদ)';
    db.prepare('UPDATE lifestyle_users SET current_level = ? WHERE id = ?').run(newLevel, userId);

    // Update Competition Participant
    if (competitionId) {
      const part = db.prepare('SELECT id, completed_days FROM competition_participants WHERE competition_id = ? AND user_id = ?').get(competitionId, userId);
      if (part) {
        db.prepare(`
          UPDATE competition_participants 
          SET total_points = MAX(0, total_points + ?), completed_days = completed_days + 1, current_level = ?
          WHERE id = ?
        `).run(totalDailyPoints, newLevel, part.id);
      } else {
        db.prepare(`
          INSERT INTO competition_participants (competition_id, user_id, total_points, completed_days, current_level)
          VALUES (?, ?, ?, 1, ?)
        `).run(competitionId, userId, totalDailyPoints, newLevel);
      }
    }

    // Motivational message
    let motivationMessage = 'আলহামদুলিল্লাহ! আপনার আজকের আমল সংরক্ষিত হয়েছে। আল্লাহ কবুল করুন।';
    if (totalDailyPoints >= 90) {
      motivationMessage = 'মাশাআল্লাহ! অসাধারণ আমল! ১০০ তে ' + totalDailyPoints + ' পয়েন্ট অর্জন করেছেন। এই ধারাবাহিকতা বজায় রাখুন।';
    } else if (totalDailyPoints >= 70) {
      motivationMessage = 'আলহামদুলিল্লাহ! ভালো অগ্রগতি হয়েছে। আগামীকালের আমলগুলোতে জামাতে সালাত ও নফলের সংখ্যা আরও বৃদ্ধি করার চেষ্টা করুন।';
    }

    res.json({
      success: true,
      message: motivationMessage,
      points_breakdown: {
        prayers: prayerPoints,
        nafl: naflPoints,
        quran_dhikr: quranDhikrPoints,
        charity: charityPoints,
        sunnah_habits: sunnahHabitsPoints,
        total_points: totalDailyPoints
      },
      current_total_points: updatedUser.total_points,
      current_level: newLevel
    });
  } catch (err) {
    console.error('Amal submission error:', err);
    res.status(500).json({ success: false, error: 'Internal server error during amal submission' });
  }
});

// ==============================================================
// 8. PUBLIC LEADERBOARD API (VISIBLE RANKS & PROFILE PHOTOS)
// ==============================================================
router.get('/leaderboard', (req, res) => {
  try {
    const activeComp = db.prepare("SELECT * FROM competitions WHERE status = 'active' ORDER BY id DESC LIMIT 1").get();
    if (!activeComp) {
      return res.json({ success: true, competition: null, leaderboard: [] });
    }

    const participants = db.prepare(`
      SELECT cp.id, cp.total_points, cp.completed_days, cp.current_level, lu.id as user_id, lu.full_name, lu.phone, lu.profile_photo
      FROM competition_participants cp
      JOIN lifestyle_users lu ON cp.user_id = lu.id
      WHERE cp.competition_id = ?
      ORDER BY cp.total_points DESC, cp.completed_days DESC, cp.id ASC
      LIMIT 100
    `).all(activeComp.id);

    const formatted = participants.map((p, idx) => {
      const raw = p.phone || '';
      const masked = raw.length >= 11 
        ? raw.substring(0, 3) + '****' + raw.substring(raw.length - 4)
        : '018****' + (idx + 10);

      return {
        rank: idx + 1,
        user_id: p.user_id,
        full_name: p.full_name,
        profile_photo: p.profile_photo || '/images/default-avatar.svg',
        masked_phone: masked,
        total_points: p.total_points,
        completed_days: p.completed_days,
        current_level: p.current_level
      };
    });

    res.json({
      success: true,
      competition: {
        id: activeComp.id,
        title: activeComp.title,
        duration_days: activeComp.duration_days,
        start_date: activeComp.start_date,
        end_date: activeComp.end_date
      },
      leaderboard: formatted
    });
  } catch (err) {
    console.error('Leaderboard error:', err);
    res.status(500).json({ success: false, error: 'Internal server error' });
  }
});

// ==============================================================
// 9. USER PROGRESS DASHBOARD API (ACCURATE RANK & STATS)
// ==============================================================
router.get('/progress', authenticateLifestyleUser, (req, res) => {
  try {
    const user = req.lifestyleUser;
    const activeComp = db.prepare("SELECT * FROM competitions WHERE status = 'active' ORDER BY id DESC LIMIT 1").get();
    
    let participant = null;
    let rank = 1;
    let totalParticipants = 1;

    if (activeComp) {
      participant = db.prepare("SELECT * FROM competition_participants WHERE competition_id = ? AND user_id = ?").get(activeComp.id, user.id);
      
      const rankRow = db.prepare(`
        SELECT COUNT(*) + 1 as user_rank 
        FROM competition_participants 
        WHERE competition_id = ? AND (
          total_points > ? 
          OR (total_points = ? AND completed_days > ?)
        )
      `).get(
        activeComp.id, 
        participant ? participant.total_points : 0,
        participant ? participant.total_points : 0,
        participant ? participant.completed_days : 0
      );
      rank = rankRow ? rankRow.user_rank : 1;

      totalParticipants = db.prepare("SELECT COUNT(*) as count FROM competition_participants WHERE competition_id = ?").get(activeComp.id).count;
    }

    const submissions = db.prepare(`
      SELECT submission_date, total_points_awarded, honesty_confirmed, created_at
      FROM daily_amal_submissions
      WHERE user_id = ?
      ORDER BY submission_date DESC
      LIMIT 40
    `).all(user.id);

    const completedDays = submissions.length;
    const remainingDays = Math.max(0, 40 - completedDays);
    const avgScore = completedDays > 0 ? (user.total_points / completedDays).toFixed(1) : 0;
    const completionPct = Math.min(100, Math.round((completedDays / 40) * 100));

    res.json({
      success: true,
      user: {
        id: user.id,
        full_name: user.full_name,
        phone: user.phone,
        profile_photo: user.profile_photo || '/images/default-avatar.svg',
        total_points: user.total_points,
        current_level: user.current_level,
        current_rank: rank,
        total_participants: totalParticipants,
        completed_days: completedDays,
        remaining_days: remainingDays,
        average_daily_score: parseFloat(avgScore),
        completion_percentage: completionPct
      },
      competition: activeComp,
      submissions
    });
  } catch (err) {
    console.error('Progress API error:', err);
    res.status(500).json({ success: false, error: 'Internal server error fetching progress' });
  }
});

// ==============================================================
// 10. PREVIOUS MONTH WINNER (ADMIN PIN FEATURE)
// ==============================================================
// Public: Get Pinned Previous Month Winner
router.get('/pinned-winner', (req, res) => {
  try {
    const pinned = db.prepare(`
      SELECT pmw.*, lu.phone as raw_phone
      FROM pinned_monthly_winner pmw
      LEFT JOIN lifestyle_users lu ON pmw.user_id = lu.id
      WHERE pmw.id = 1 AND pmw.is_active = 1
    `).get();

    if (!pinned || !pinned.full_name) {
      return res.json({ success: true, pinned_winner: null });
    }

    res.json({
      success: true,
      pinned_winner: {
        id: pinned.id,
        user_id: pinned.user_id,
        full_name: pinned.full_name,
        profile_photo: pinned.profile_photo || '/images/default-avatar.svg',
        month_title: pinned.month_title || 'গত মাসের বিজয়ী!',
        total_points: pinned.total_points || 0,
        level: pinned.level || 'Platinum (মুহসিন)',
        blessing_message: pinned.blessing_message || 'আল্লাহ উনার আমলগুলো কবুল করুন। আমিন।',
        pinned_at: pinned.pinned_at
      }
    });
  } catch (err) {
    console.error('Fetch pinned winner error:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

// Admin: Get Pinned Winner Details & Candidate List
router.get('/admin/pinned-winner', requireRole('superadmin', 'admin', 'lifestyle_manager'), (req, res) => {
  try {
    const current = db.prepare('SELECT * FROM pinned_monthly_winner WHERE id = 1').get() || null;
    const candidates = db.prepare(`
      SELECT lu.id, lu.full_name, lu.phone, lu.profile_photo, lu.total_points, lu.current_level,
             COALESCE(cp.completed_days, 0) as completed_days
      FROM lifestyle_users lu
      LEFT JOIN competition_participants cp ON lu.id = cp.user_id
      ORDER BY lu.total_points DESC, lu.id DESC
      LIMIT 100
    `).all();

    res.json({
      success: true,
      current_pinned: current,
      candidates
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Admin: Pin or Update Previous Month Winner
router.post('/admin/pinned-winner', requireRole('superadmin', 'admin', 'lifestyle_manager'), (req, res) => {
  try {
    const { user_id, custom_name, month_title, total_points, level, profile_photo, blessing_message } = req.body;

    let fullName = custom_name;
    let photo = profile_photo;
    let points = total_points;
    let winnerLevel = level;

    if (user_id) {
      const u = db.prepare('SELECT id, full_name, profile_photo, total_points, current_level FROM lifestyle_users WHERE id = ?').get(user_id);
      if (u) {
        fullName = u.full_name;
        photo = u.profile_photo || photo || '/images/default-avatar.svg';
        points = points !== undefined && points !== '' ? Number(points) : u.total_points;
        winnerLevel = winnerLevel || u.current_level;
      }
    }

    if (!fullName) {
      return res.status(400).json({ success: false, error: 'Winner name or user profile selection is required' });
    }

    const blessing = blessing_message || 'আল্লাহ উনার আমলগুলো কবুল করুন। আমিন।';
    const month = month_title || 'গত মাসের বিজয়ী!';

    // Upsert row id = 1
    db.prepare(`
      INSERT INTO pinned_monthly_winner (id, user_id, full_name, profile_photo, month_title, total_points, level, blessing_message, is_active, pinned_at)
      VALUES (1, ?, ?, ?, ?, ?, ?, ?, 1, CURRENT_TIMESTAMP)
      ON CONFLICT(id) DO UPDATE SET
        user_id = excluded.user_id,
        full_name = excluded.full_name,
        profile_photo = excluded.profile_photo,
        month_title = excluded.month_title,
        total_points = excluded.total_points,
        level = excluded.level,
        blessing_message = excluded.blessing_message,
        is_active = 1,
        pinned_at = CURRENT_TIMESTAMP
    `).run(user_id || null, fullName, photo || '/images/default-avatar.svg', month, points || 0, winnerLevel || 'Platinum (মুহসিন)', blessing);

    res.json({
      success: true,
      message: 'Previous month winner successfully pinned!',
      pinned_winner: {
        id: 1,
        user_id: user_id || null,
        full_name: fullName,
        profile_photo: photo || '/images/default-avatar.svg',
        month_title: month,
        total_points: points || 0,
        level: winnerLevel || 'Platinum (মুহসিন)',
        blessing_message: blessing,
        is_active: 1
      }
    });
  } catch (err) {
    console.error('Pin winner error:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

// Admin: Toggle Pinned Winner Visibility
router.post('/admin/pinned-winner/toggle', requireRole('superadmin', 'admin', 'lifestyle_manager'), (req, res) => {
  try {
    const current = db.prepare('SELECT id, is_active FROM pinned_monthly_winner WHERE id = 1').get();
    if (!current) return res.status(404).json({ success: false, error: 'No pinned winner found' });
    const newStatus = current.is_active === 1 ? 0 : 1;
    db.prepare('UPDATE pinned_monthly_winner SET is_active = ? WHERE id = 1').run(newStatus);
    res.json({ success: true, is_active: newStatus });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Admin: Unpin Pinned Winner
router.delete('/admin/pinned-winner', requireRole('superadmin', 'admin', 'lifestyle_manager'), (req, res) => {
  try {
    db.prepare('DELETE FROM pinned_monthly_winner WHERE id = 1').run();
    res.json({ success: true, message: 'Pinned winner removed successfully' });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// ==============================================================
// 11. ADMIN AMAL CATEGORIES MANAGEMENT (CRUD)
// ==============================================================
// Admin: List Categories
router.get('/admin/categories', requireRole('superadmin', 'admin', 'lifestyle_manager'), (req, res) => {
  try {
    const categories = db.prepare('SELECT * FROM amal_categories ORDER BY sort_order ASC, id ASC').all();
    const enriched = categories.map(cat => {
      const itemCount = db.prepare('SELECT COUNT(*) as count FROM daily_amal_activities WHERE category = ?').get(cat.slug).count;
      return {
        ...cat,
        item_count: itemCount
      };
    });
    res.json({ success: true, categories: enriched });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Admin: Create Category
router.post('/admin/categories', requireRole('superadmin', 'admin', 'lifestyle_manager'), (req, res) => {
  try {
    const { slug: customSlug, title_bn, title_en, icon, max_points, sort_order, is_active } = req.body;
    if (!title_bn) return res.status(400).json({ success: false, error: 'Category Bengali title is required' });

    const slug = customSlug || (title_en || title_bn).toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/(^_|_$)/g, '') || `cat_${Date.now()}`;
    const stmt = db.prepare(`
      INSERT INTO amal_categories (slug, title_bn, title_en, icon, max_points, sort_order, is_active)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `);
    const r = stmt.run(slug, title_bn.trim(), title_en || '', icon || '✨', Number(max_points) || 10, Number(sort_order) || 0, is_active !== undefined ? (is_active ? 1 : 0) : 1);
    const created = db.prepare('SELECT * FROM amal_categories WHERE id = ?').get(r.lastInsertRowid);
    res.status(201).json({ success: true, id: r.lastInsertRowid, slug, category: created });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Admin: Edit Category
router.put('/admin/categories/:id', requireRole('superadmin', 'admin', 'lifestyle_manager'), (req, res) => {
  try {
    const { title_bn, title_en, icon, max_points, sort_order, is_active } = req.body;
    db.prepare(`
      UPDATE amal_categories 
      SET title_bn = ?, title_en = ?, icon = ?, max_points = ?, sort_order = ?, is_active = ?, updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `).run(title_bn, title_en || '', icon || '✨', Number(max_points) || 10, Number(sort_order) || 0, is_active !== undefined ? (is_active ? 1 : 0) : 1, req.params.id);
    const updated = db.prepare('SELECT * FROM amal_categories WHERE id = ?').get(req.params.id);
    res.json({ success: true, category: updated });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Admin: Toggle Category Active Status
router.post('/admin/categories/:id/toggle', requireRole('superadmin', 'admin', 'lifestyle_manager'), (req, res) => {
  try {
    const cat = db.prepare('SELECT id, is_active FROM amal_categories WHERE id = ?').get(req.params.id);
    if (!cat) return res.status(404).json({ success: false, error: 'Category not found' });
    const newStatus = cat.is_active === 1 ? 0 : 1;
    db.prepare('UPDATE amal_categories SET is_active = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?').run(newStatus, cat.id);
    res.json({ success: true, is_active: newStatus });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Admin: Delete Category
router.delete('/admin/categories/:id', requireRole('superadmin', 'admin', 'lifestyle_manager'), (req, res) => {
  try {
    const cat = db.prepare('SELECT slug FROM amal_categories WHERE id = ?').get(req.params.id);
    if (cat) {
      db.prepare('DELETE FROM daily_amal_activities WHERE category = ?').run(cat.slug);
    }
    db.prepare('DELETE FROM amal_categories WHERE id = ?').run(req.params.id);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// ==============================================================
// 12. PUBLIC WINNERS GALLERY API
// ==============================================================
router.get('/winners', (req, res) => {
  try {
    const winners = db.prepare(`
      SELECT 
        cw.id as winner_id,
        cw.position,
        cw.final_score,
        cw.awarded_level,
        cw.gift_details,
        cw.gift_status,
        cw.gift_awarded_date,
        lu.full_name,
        lu.phone,
        lu.profile_photo,
        c.title as competition_title,
        c.start_date,
        c.end_date
      FROM competition_winners cw
      JOIN lifestyle_users lu ON cw.user_id = lu.id
      JOIN competitions c ON cw.competition_id = c.id
      WHERE cw.is_published = 1
      ORDER BY cw.position ASC
    `).all();

    const sanitized = winners.map(w => {
      const raw = w.phone || '';
      const masked = raw.length >= 11 
        ? raw.substring(0, 3) + '****' + raw.substring(raw.length - 4)
        : '018****XXXX';

      return {
        id: w.winner_id,
        position: w.position,
        full_name: w.full_name,
        profile_photo: w.profile_photo || '/images/default-avatar.svg',
        masked_phone: masked,
        final_score: w.final_score,
        awarded_level: w.awarded_level,
        gift_details: w.gift_details,
        gift_status: w.gift_status,
        gift_awarded_date: w.gift_awarded_date,
        competition_title: w.competition_title,
        poster_url: `/api/lifestyle/poster/${w.winner_id}`
      };
    });

    res.json({ success: true, winners: sanitized });
  } catch (err) {
    console.error('Winners API error:', err);
    res.status(500).json({ success: false, error: 'Internal server error fetching winners' });
  }
});

// ==============================================================
// 13. WINNER POSTER & ACHIEVEMENT CERTIFICATE GENERATOR
// ==============================================================
router.get('/poster/:winnerId', (req, res) => {
  try {
    const winnerId = req.params.winnerId;
    const winner = db.prepare(`
      SELECT 
        cw.*,
        lu.full_name,
        lu.phone,
        lu.profile_photo,
        c.title as comp_title,
        c.duration_days,
        c.start_date,
        c.end_date
      FROM competition_winners cw
      JOIN lifestyle_users lu ON cw.user_id = lu.id
      JOIN competitions c ON cw.competition_id = c.id
      WHERE cw.id = ?
    `).get(winnerId);

    if (!winner) {
      return res.status(404).send('<h1>Winner record not found</h1>');
    }

    const rankTitle = winner.position === 1 ? '১ম স্থান অধিকারী (Champion)' :
                      winner.position === 2 ? '২য় স্থান অধিকারী (1st Runner-Up)' :
                      winner.position === 3 ? '৩য় স্থান অধিকারী (2nd Runner-Up)' :
                      `স্থান: #${winner.position} (Top Achiever)`;

    const certHtml = `<!DOCTYPE html>
<html lang="bn">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>বিজয়ী শংসাপত্র ও পোস্টার — ${winner.full_name}</title>
  <link href="https://fonts.googleapis.com/css2?family=Hind+Siliguri:wght@400;600;700&display=swap" rel="stylesheet">
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      background: #0f172a;
      min-height: 100vh;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      padding: 2rem 1rem;
      font-family: 'Hind Siliguri', sans-serif;
      color: #1e293b;
    }
    .poster-card {
      background: #FFFFFF;
      width: 100%;
      max-width: 800px;
      border: 12px double #065F46;
      border-radius: 16px;
      padding: 3rem 2.5rem;
      position: relative;
      box-shadow: 0 25px 50px -12px rgba(0, 0, 0, 0.5);
      text-align: center;
      background-image: radial-gradient(#ECFDF5 1px, transparent 1px);
      background-size: 20px 20px;
    }
    .poster-header {
      border-bottom: 2px solid #D1FAE5;
      padding-bottom: 1.5rem;
      margin-bottom: 2rem;
    }
    .clinic-title {
      font-size: 1.75rem;
      font-weight: 700;
      color: #065F46;
      letter-spacing: 0.5px;
    }
    .clinic-sub {
      font-size: 0.95rem;
      color: #475569;
      margin-top: 0.25rem;
    }
    .badge-event {
      display: inline-block;
      background: #065F46;
      color: #F8FAFC;
      padding: 6px 18px;
      border-radius: 9999px;
      font-size: 0.9rem;
      font-weight: 700;
      margin-bottom: 1.5rem;
      letter-spacing: 0.5px;
    }
    .winner-rank {
      font-size: 1.5rem;
      font-weight: 700;
      color: #D97706;
      margin-bottom: 0.5rem;
    }
    .winner-name {
      font-size: 2.25rem;
      font-weight: 800;
      color: #0F172A;
      margin-bottom: 1rem;
      text-decoration: underline;
      text-decoration-color: #10B981;
      text-underline-offset: 8px;
    }
    .citation {
      font-size: 1.05rem;
      line-height: 1.7;
      color: #334155;
      max-width: 650px;
      margin: 0 auto 2rem auto;
    }
    .score-box {
      display: flex;
      justify-content: center;
      gap: 2rem;
      background: #F0FDF4;
      border: 1px solid #BBF7D0;
      padding: 1rem;
      border-radius: 12px;
      margin-bottom: 2.5rem;
    }
    .score-item {
      text-align: center;
    }
    .score-val {
      font-size: 1.5rem;
      font-weight: 800;
      color: #065F46;
    }
    .score-lbl {
      font-size: 0.85rem;
      color: #64748B;
      font-weight: 600;
    }
    .poster-footer {
      display: flex;
      justify-content: space-between;
      align-items: flex-end;
      border-top: 2px solid #D1FAE5;
      padding-top: 1.5rem;
      margin-top: 1rem;
    }
    .seal-box {
      text-align: left;
    }
    .seal-circle {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      width: 70px;
      height: 70px;
      border-radius: 50%;
      border: 3px dashed #065F46;
      color: #065F46;
      font-size: 0.75rem;
      font-weight: 700;
      text-transform: uppercase;
      text-align: center;
      line-height: 1.1;
    }
    .sign-box {
      text-align: right;
    }
    .sign-name {
      font-size: 1.15rem;
      font-weight: 700;
      color: #0F172A;
    }
    .sign-title {
      font-size: 0.85rem;
      color: #64748B;
    }
    .action-bar {
      margin-top: 2rem;
      display: flex;
      gap: 1rem;
    }
    .btn {
      padding: 0.75rem 1.5rem;
      border-radius: 8px;
      font-weight: 600;
      font-size: 1rem;
      cursor: pointer;
      text-decoration: none;
      display: inline-flex;
      align-items: center;
      gap: 0.5rem;
      border: none;
    }
    .btn-print { background: #10B981; color: #FFF; }
    .btn-share { background: #25D366; color: #FFF; }
    @media print {
      body { background: transparent; padding: 0; }
      .poster-card { box-shadow: none; border-width: 6px; max-width: 100%; }
      .action-bar { display: none !important; }
    }
  </style>
</head>
<body>

  <div class="poster-card">
    <div class="poster-header">
      <div class="clinic-title">রুকইয়াহ সাপোর্ট অ্যান্ড কাপিং সেন্টার — ফেনী শাখা</div>
      <div class="clinic-sub">ভূঞা ম্যানশন, আদর্শ হাউজিং সোসাইটি, মহিপাল, ফেনী | হটলাইন: 01758-354920</div>
    </div>

    <div class="badge-event">🏆 ৪০ দিনের সুন্নাহ আমল প্রতিযোগিতা ২০২৬</div>

    <div class="winner-rank">${rankTitle}</div>
    <div class="winner-name">${winner.full_name}</div>

    <p class="citation">
      মাশাআল্লাহ! আপনি অত্যন্ত নিষ্ঠা ও আত্মশুদ্ধির সাথে ৪০ দিনের সুন্নাহ জীবনধারা ও আমল অনুশীলনে অংশগ্রহণ করে 
      <strong>${winner.awarded_level} লেভেল</strong> কৃতিত্বের সাথে অর্জন করেছেন। আপনার এই বরকতময় প্রচেষ্টা কবুল হোক।
    </p>

    <div class="score-box">
      <div class="score-item">
        <div class="score-val">${winner.final_score} / ৪০০০</div>
        <div class="score-lbl">সর্বমোট অর্জিত পয়েন্ট</div>
      </div>
      <div class="score-item">
        <div class="score-val">${winner.awarded_level}</div>
        <div class="score-lbl">অর্জিত সম্মাননা স্তর</div>
      </div>
      <div class="score-item">
        <div class="score-val">৪০ দিন</div>
        <div class="score-lbl">প্রতিযোগিতার ব্যাপ্তিকাল</div>
      </div>
    </div>

    <div class="poster-footer">
      <div class="seal-box">
        <div class="seal-circle">OFFICIAL<br>VERIFIED<br>SEAL</div>
        <div style="font-size: 0.75rem; color: #64748B; margin-top: 0.5rem;">ID: CERT-SUNNAH-${winner.id}-${winner.user_id}</div>
      </div>
      <div class="sign-box">
        <div class="sign-name">মুহাম্মদুল্লাহ মিয়া</div>
        <div class="sign-title">প্রধান পরিচালক ও অভিজ্ঞ রাকি<br>রুকইয়াহ সাপোর্ট সেন্টার, ফেনী</div>
      </div>
    </div>
  </div>

  <div class="action-bar">
    <button class="btn btn-print" onclick="window.print()">🖨️ পোস্টার / সার্টিফিকেট প্রিন্ট করুন</button>
    <a class="btn btn-share" href="https://api.whatsapp.com/send?text=${encodeURIComponent('মাশাআল্লাহ! আমি রুকইয়াহ সাপোর্ট সেন্টার ফেনী শাখার ৪০ দিনের আমল প্রতিযোগিতায় অংশ নিয়ে ' + winner.awarded_level + ' লেভেল অর্জন করেছি! আমার সনদ দেখুন: https://ruqyahhelpfeni.com/api/lifestyle/poster/' + winner.id)}" target="_blank">📱 হোয়াটসঅ্যাপে শেয়ার করুন</a>
  </div>

</body>
</html>`;

    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.send(certHtml);
  } catch (err) {
    console.error('Poster generation error:', err);
    res.status(500).send('<h1>Error generating poster</h1>');
  }
});

// ==============================================================
// 14. ADMIN: CALCULATE & RANK WINNERS
// ==============================================================
router.post('/admin/calculate-winners', requireRole('superadmin', 'admin', 'lifestyle_manager'), (req, res) => {
  try {
    const { competition_id } = req.body;
    const comp = competition_id 
      ? db.prepare("SELECT * FROM competitions WHERE id = ?").get(competition_id)
      : db.prepare("SELECT * FROM competitions WHERE status = 'active' ORDER BY id DESC LIMIT 1").get();

    if (!comp) {
      return res.status(404).json({ success: false, error: 'No active competition found' });
    }

    const participants = db.prepare(`
      SELECT cp.*, lu.full_name, lu.phone
      FROM competition_participants cp
      JOIN lifestyle_users lu ON cp.user_id = lu.id
      WHERE cp.competition_id = ?
      ORDER BY cp.total_points DESC, cp.completed_days DESC
    `).all(comp.id);

    if (!participants.length) {
      return res.status(400).json({ success: false, error: 'No participants found in this competition' });
    }

    const calculatedWinners = [];
    participants.forEach((p, index) => {
      const position = index + 1;
      let level = 'Improvement Level';
      if (p.total_points >= 3600) level = 'Diamond';
      else if (p.total_points >= 3200) level = 'Platinum';
      else if (p.total_points >= 2800) level = 'Gold';
      else if (p.total_points >= 2400) level = 'Silver';
      else if (p.total_points >= 2000) level = 'Bronze';

      const existing = db.prepare("SELECT id FROM competition_winners WHERE competition_id = ? AND user_id = ?").get(comp.id, p.user_id);
      let winnerId;
      if (existing) {
        db.prepare(`
          UPDATE competition_winners
          SET position = ?, final_score = ?, awarded_level = ?
          WHERE id = ?
        `).run(position, p.total_points, level, existing.id);
        winnerId = existing.id;
      } else {
        const info = db.prepare(`
          INSERT INTO competition_winners (competition_id, user_id, position, final_score, awarded_level, is_published)
          VALUES (?, ?, ?, ?, ?, 0)
        `).run(comp.id, p.user_id, position, p.total_points, level);
        winnerId = info.lastInsertRowid;
      }

      calculatedWinners.push({
        id: winnerId,
        position,
        full_name: p.full_name,
        final_score: p.total_points,
        awarded_level: level
      });
    });

    res.json({
      success: true,
      message: `Calculated ranks for ${calculatedWinners.length} participants successfully.`,
      winners: calculatedWinners
    });
  } catch (err) {
    console.error('Calculate winners error:', err);
    res.status(500).json({ success: false, error: 'Internal server error calculating winners' });
  }
});

// ==============================================================
// 15. ADMIN: PUBLISH COMPETITION WINNERS
// ==============================================================
router.post('/admin/publish-winners', requireRole('superadmin', 'admin', 'lifestyle_manager'), (req, res) => {
  try {
    const { competition_id, is_published } = req.body;
    const pubStatus = is_published !== false ? 1 : 0;
    
    if (competition_id) {
      db.prepare("UPDATE competition_winners SET is_published = ? WHERE competition_id = ?").run(pubStatus, competition_id);
    } else {
      db.prepare("UPDATE competition_winners SET is_published = ?").run(pubStatus);
    }

    res.json({
      success: true,
      message: pubStatus ? 'Winners have been published to the public gallery.' : 'Winners unpublished.'
    });
  } catch (err) {
    console.error('Publish winners error:', err);
    res.status(500).json({ success: false, error: 'Internal server error publishing winners' });
  }
});

// ==============================================================
// 16. ADMIN: UPDATE GIFT DETAILS
// ==============================================================
router.put('/admin/winners/:id/gift', requireRole('superadmin', 'admin', 'lifestyle_manager'), (req, res) => {
  try {
    const winnerId = req.params.id;
    const { gift_details, gift_status, gift_awarded_date } = req.body;

    db.prepare(`
      UPDATE competition_winners
      SET gift_details = ?, gift_status = ?, gift_awarded_date = ?
      WHERE id = ?
    `).run(
      gift_details || null,
      gift_status || 'Pending',
      gift_awarded_date || null,
      winnerId
    );

    res.json({ success: true, message: 'Gift information updated successfully' });
  } catch (err) {
    console.error('Update gift error:', err);
    res.status(500).json({ success: false, error: 'Internal server error updating gift' });
  }
});

module.exports = router;
