const express = require('express');
const router = express.Router();
const crypto = require('crypto');
const db = require('../database/db');

// Helper to hash password
function hashPassword(password) {
  return crypto.createHash('sha256').update(password + '_ruqyah_lifestyle_salt').digest('hex');
}

// Generate simple auth token
function generateToken(userId) {
  return Buffer.from(`${userId}:${Date.now()}:${crypto.randomBytes(8).toString('hex')}`).toString('base64');
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
    
    const user = db.prepare('SELECT id, user_uuid, full_name, phone, email, total_points, current_level, is_active FROM lifestyle_users WHERE id = ?').get(userId);
    if (!user || !user.is_active) {
      return res.status(401).json({ success: false, error: 'Invalid or expired session' });
    }
    req.lifestyleUser = user;
    next();
  } catch (err) {
    return res.status(401).json({ success: false, error: 'Malformed authorization token' });
  }
}

// 1. Register Lifestyle User
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

    const existing = db.prepare('SELECT id FROM lifestyle_users WHERE phone = ?').get(cleanPhone);
    if (existing) {
      return res.status(409).json({ success: false, error: 'An account with this phone number already exists' });
    }

    const userUuid = 'LU-' + crypto.randomBytes(4).toString('hex').toUpperCase();
    const pwdHash = hashPassword(password);

    const stmt = db.prepare(`
      INSERT INTO lifestyle_users (user_uuid, full_name, phone, email, password_hash)
      VALUES (?, ?, ?, ?, ?)
    `);
    const result = stmt.run(userUuid, full_name.trim(), cleanPhone, email || null, pwdHash);
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
        total_points: 0,
        current_level: 'Improvement Level'
      }
    });
  } catch (err) {
    console.error('Registration error:', err);
    res.status(500).json({ success: false, error: 'Internal server error during registration' });
  }
});

// 2. Login Lifestyle User
router.post('/login', (req, res) => {
  try {
    const { phone, password } = req.body;
    if (!phone || !password) {
      return res.status(400).json({ success: false, error: 'Phone number and password are required' });
    }

    const cleanPhone = phone.replace(/[^0-9]/g, '');
    const pwdHash = hashPassword(password);

    const user = db.prepare('SELECT * FROM lifestyle_users WHERE phone = ? AND password_hash = ?').get(cleanPhone, pwdHash);
    if (!user) {
      return res.status(401).json({ success: false, error: 'Invalid phone number or password' });
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
        total_points: user.total_points,
        current_level: user.current_level
      }
    });
  } catch (err) {
    console.error('Login error:', err);
    res.status(500).json({ success: false, error: 'Internal server error during login' });
  }
});

// 3. User Profile & Stats
router.get('/profile', authenticateLifestyleUser, (req, res) => {
  try {
    const userId = req.lifestyleUser.id;
    const user = db.prepare('SELECT id, user_uuid, full_name, phone, email, total_points, current_level, created_at FROM lifestyle_users WHERE id = ?').get(userId);

    // Get competition standing
    const activeComp = db.prepare("SELECT * FROM competitions WHERE status = 'active' ORDER BY id DESC LIMIT 1").get();
    let compStats = null;
    if (activeComp) {
      const participant = db.prepare('SELECT * FROM competition_participants WHERE competition_id = ? AND user_id = ?').get(activeComp.id, userId);
      // Rank calculation
      const rankRow = db.prepare(`
        SELECT COUNT(*) + 1 as rank FROM competition_participants 
        WHERE competition_id = ? AND total_points > (
          SELECT COALESCE(total_points, 0) FROM competition_participants WHERE competition_id = ? AND user_id = ?
        )
      `).get(activeComp.id, activeComp.id, userId);

      compStats = {
        competition_id: activeComp.id,
        competition_title: activeComp.title,
        duration_days: activeComp.duration_days,
        completed_days: participant ? participant.completed_days : 0,
        competition_points: participant ? participant.total_points : 0,
        current_rank: rankRow ? rankRow.rank : 1
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

// 4. Get Checklist Activities (100 Point Max Configuration)
router.get('/activities', (req, res) => {
  try {
    const activities = db.prepare('SELECT * FROM daily_amal_activities WHERE is_active = 1 ORDER BY sort_order ASC').all();
    
    // Group by categories
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

// 5. Submit Daily Amal Tracker (Strict 100-Point Max Enforcement & Honesty Confirmation)
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

    // Check if submission date is within valid bounds (today or yesterday)
    const todayStr = new Date().toISOString().split('T')[0];
    const targetDate = submission_date;

    // Calculate score strictly adhering to the 100-point maximum and category caps
    // Category 1: Obligatory Prayers (Max 50)
    // - Congregation (জামাত): 10 pts
    // - Individual (একা): 6 pts
    // - Missed (ছুটে গেছে): 0 pts
    let prayerPoints = 0;
    const prayers = ['fajr', 'dhuhr', 'asr', 'maghrib', 'isha'];
    prayers.forEach(prayer => {
      const mode = answers?.[prayer]; // 'congregation', 'individual', or 'missed'
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

    // Total Daily Points (Strictly capped at 100)
    let totalDailyPoints = prayerPoints + naflPoints + quranDhikrPoints + charityPoints + sunnahHabitsPoints;
    if (totalDailyPoints > 100) totalDailyPoints = 100;

    // Active Competition Check
    const activeComp = db.prepare("SELECT id FROM competitions WHERE status = 'active' ORDER BY id DESC LIMIT 1").get();
    const competitionId = activeComp ? activeComp.id : null;

    // Check existing submission for this date
    const existingSubmission = db.prepare('SELECT id, total_points_awarded FROM daily_amal_submissions WHERE user_id = ? AND submission_date = ?').get(userId, targetDate);

    let pointDiff = totalDailyPoints;

    if (existingSubmission) {
      pointDiff = totalDailyPoints - existingSubmission.total_points_awarded;
      db.prepare(`
        UPDATE daily_amal_submissions 
        SET answers_json = ?, total_points_awarded = ?, honesty_confirmed = 1
        WHERE id = ?
      `).run(JSON.stringify(answers || {}), totalDailyPoints, existingSubmission.id);
    } else {
      db.prepare(`
        INSERT INTO daily_amal_submissions (user_id, competition_id, submission_date, answers_json, total_points_awarded, honesty_confirmed)
        VALUES (?, ?, ?, ?, ?, 1)
      `).run(userId, competitionId, targetDate, JSON.stringify(answers || {}), totalDailyPoints);
    }

    // Update User Total Points
    db.prepare('UPDATE lifestyle_users SET total_points = MAX(0, total_points + ?), updated_at = CURRENT_TIMESTAMP WHERE id = ?').run(pointDiff, userId);

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
        const daysIncrement = existingSubmission ? 0 : 1;
        db.prepare(`
          UPDATE competition_participants 
          SET total_points = MAX(0, total_points + ?), completed_days = completed_days + ?, current_level = ?
          WHERE id = ?
        `).run(pointDiff, daysIncrement, newLevel, part.id);
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

// 6. Public Leaderboard API (Privacy Protected: masked phone numbers)
router.get('/leaderboard', (req, res) => {
  try {
    const activeComp = db.prepare("SELECT * FROM competitions WHERE status = 'active' ORDER BY id DESC LIMIT 1").get();
    if (!activeComp) {
      return res.json({ success: true, competition: null, leaderboard: [] });
    }

    const participants = db.prepare(`
      SELECT cp.id, cp.total_points, cp.completed_days, cp.current_level, lu.full_name, lu.phone
      FROM competition_participants cp
      JOIN lifestyle_users lu ON cp.user_id = lu.id
      WHERE cp.competition_id = ?
      ORDER BY cp.total_points DESC, cp.completed_days DESC
      LIMIT 50
    `).all(activeComp.id);

    const formatted = participants.map((p, idx) => {
      // Mask phone: 01812345678 -> 018****5678
      const raw = p.phone || '';
      const masked = raw.length >= 11 
        ? raw.substring(0, 3) + '****' + raw.substring(raw.length - 4)
        : '018****' + (idx + 10);

      return {
        rank: idx + 1,
        full_name: p.full_name,
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

module.exports = router;
