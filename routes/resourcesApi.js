const express = require('express');
const router = express.Router();
const db = require('../database/db');

// 1. Get Ruqyah Audio & Duas Library
router.get('/ruqyah-audios', (req, res) => {
  try {
    const { category } = req.query;
    let query = 'SELECT * FROM ruqyah_resources WHERE is_active = 1';
    const params = [];

    if (category) {
      query += ' AND category = ?';
      params.push(category);
    }

    query += ' ORDER BY display_order ASC, id ASC';
    const items = db.prepare(query).all(...params);

    // Grouping by category
    const categories = [
      { key: 'general_ruqyah', name_bn: 'সাধারণ রুকইয়াহ (General Ruqyah)', name_en: 'General Ruqyah' },
      { key: 'ayn_hasad', name_bn: 'বদনজর ও হিংসা (Evil Eye & Hasad)', name_en: 'Evil Eye & Envy' },
      { key: 'sihr_jinn', name_bn: 'জাদু ও জিন নিরাময় (Magic & Jinn Affliction)', name_en: 'Sihr & Jinn' },
      { key: 'sleep_protection', name_bn: 'ঘুমের দোয়া ও দুঃস্বপ্ন সুরক্ষা', name_en: 'Sleep & Nightmares' },
      { key: 'children_family', name_bn: 'শিশু ও পরিবারের নিরাপত্তা', name_en: 'Children & Family Protection' }
    ];

    res.json({ success: true, categories, items });
  } catch (err) {
    console.error('Fetch ruqyah audios error:', err);
    res.status(500).json({ success: false, error: 'Failed to retrieve Ruqyah audio resources' });
  }
});

// 2. Get Hijama Point Packages & Sunnah Calendar
router.get('/hijama-packages', (req, res) => {
  try {
    const packages = db.prepare('SELECT * FROM hijama_packages WHERE is_active = 1 ORDER BY display_order ASC').all();

    // Authentic Hadith references & Sunnah guidelines
    const hadithReferences = [
      {
        narrator: 'আবদুল্লাহ ইবনু আব্বাস (রা.)',
        arabic: 'الشِّفَاءُ فِي ثَلاَثَةٍ شَرْبَةِ عَسَلٍ، وَشَرْطَةِ مِحْجَمٍ، وَكَيَّةِ نَارٍ',
        bengali: 'রাসূলুল্লাহ (সা.) বলেছেন: তিনটি জিনিসের মধ্যে রোগমুক্তি রয়েছে—মধুপানে, হিজামার রক্তমোক্ষণে এবং আগুনে দাগ দেওয়ায়। তবে আমি আমার উম্মতকে আগুনে দাগ দিতে নিষেধ করছি।',
        reference: 'সহিহ বুখারি: ৫৬৮০'
      },
      {
        narrator: 'আবু হুরায়রা (রা.)',
        arabic: 'مَنِ احْتَجَمَ لِسَبْعَ عَشْرَةَ وَتِسْعَ عَشْرَةَ وَإِحْدَى وَعِشْرِينَ كَانَ شِفَاءً مِنْ كُلِّ دَاءٍ',
        bengali: 'রাসূলুল্লাহ (সা.) বলেছেন: যে ব্যক্তি চন্দ্র মাসের ১৭, ১৯ ও ২১ তারিখে হিজামা করাবে, তা তার সব রোগের জন্য শেফা হবে।',
        reference: 'সুনানে আবু দাউদ: ৩৮৬১'
      }
    ];

    // Calculate next upcoming Hijama Sunnah dates (approximate lunar calendar reference for Feni)
    const sunnahCalendarNotes = {
      recommended_lunar_days: [17, 19, 21],
      description_bn: 'হিজামার জন্য সর্বোত্তম সময় হচ্ছে প্রতি হিজরি মাসের ১৭, ১৯ ও ২১ তারিখ। তবে কোনো অসুস্থতা বা ব্যথার চিকিৎসার জন্য যেকোনো দিনই হিজামা করানো যায়।',
      description_en: 'The prime Sunnah dates for cupping are the 17th, 19th, and 21st of the Islamic lunar month.'
    };

    res.json({
      success: true,
      packages,
      hadiths: hadithReferences,
      calendar_notes: sunnahCalendarNotes
    });
  } catch (err) {
    console.error('Fetch hijama packages error:', err);
    res.status(500).json({ success: false, error: 'Failed to retrieve Hijama packages' });
  }
});

// 3. Get Active Advertisements / Banners
router.get('/advertisements', (req, res) => {
  try {
    const { placement } = req.query;
    let query = 'SELECT * FROM advertisements WHERE is_active = 1';
    const params = [];

    if (placement) {
      query += ' AND (placement = ? OR placement = "all")';
      params.push(placement);
    }

    query += ' ORDER BY id DESC LIMIT 5';
    const ads = db.prepare(query).all(...params);
    res.json({ success: true, advertisements: ads });
  } catch (err) {
    console.error('Fetch advertisements error:', err);
    res.status(500).json({ success: false, error: 'Failed to retrieve advertisements' });
  }
});

module.exports = router;
