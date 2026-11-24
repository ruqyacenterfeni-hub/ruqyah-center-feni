// Initialize fontconfig and register Bengali TrueType fonts before Sharp loads
require('./fontSetup');
const fs = require('fs');
const path = require('path');
let sharp;
try {
  sharp = require('sharp');
} catch (e) {
  console.warn('sharp library not available:', e.message);
}
const db = require('../database/db');

// Load clinic logo dynamically from settings or default official logo
function getLogoBase64() {
  try {
    const db = require('../database/db');
    const settings = db.prepare('SELECT logo_url FROM clinic_settings WHERE id = 1').get();
    if (settings && settings.logo_url) {
      const relPath = settings.logo_url.replace(/^\//, '');
      const customPath = path.join(__dirname, '..', 'public', relPath);
      if (fs.existsSync(customPath)) {
        const buf = fs.readFileSync(customPath);
        const ext = path.extname(customPath).toLowerCase();
        const mime = ext === '.png' ? 'image/png' : 'image/jpeg';
        return `data:${mime};base64,${buf.toString('base64')}`;
      }
    }
    const logoPath = path.join(__dirname, '..', 'public', 'images', 'official-logo.jpg');
    if (fs.existsSync(logoPath)) {
      const buf = fs.readFileSync(logoPath);
      return `data:image/jpeg;base64,${buf.toString('base64')}`;
    }
  } catch (err) {
    console.error('Error loading logo for PDF:', err.message);
  }
  return '';
}

// Load and cache Noto Sans Bengali TrueType font for base64 SVG embedding
let cachedNotoFontBase64 = null;
function getNotoBengaliBase64() {
  if (cachedNotoFontBase64) return cachedNotoFontBase64;
  try {
    const fontPath = path.join(__dirname, '..', 'public', 'fonts', 'NotoSansBengali.ttf');
    if (fs.existsSync(fontPath)) {
      const buf = fs.readFileSync(fontPath);
      cachedNotoFontBase64 = buf.toString('base64');
      return cachedNotoFontBase64;
    }
  } catch (err) {
    console.error('Error loading NotoSansBengali font for PDF:', err.message);
  }
  return '';
}

// Convert numbers to Bengali digits
function toBengaliDigits(num) {
  if (num === null || num === undefined) return '';
  const bnDigits = ['০', '১', '২', '৩', '৪', '৫', '৬', '৭', '৮', '৯'];
  return String(num).replace(/[0-9]/g, d => bnDigits[parseInt(d, 10)]);
}

// Escape XML / SVG special characters
function escapeXml(unsafe) {
  if (unsafe === null || unsafe === undefined) return '';
  return String(unsafe)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

// Word-wrap text into lines for SVG <tspan>
function wrapText(text, maxChars = 75) {
  if (!text) return [];
  const words = String(text).split(' ');
  const lines = [];
  let currentLine = '';

  for (const word of words) {
    if ((currentLine + word).length > maxChars) {
      if (currentLine) lines.push(currentLine.trim());
      currentLine = word + ' ';
    } else {
      currentLine += word + ' ';
    }
  }
  if (currentLine.trim()) {
    lines.push(currentLine.trim());
  }
  return lines;
}

// Clinical Terms Translation Dictionary for Genuine Bilingual Reporting
const CLINICAL_TRANSLATIONS = {
  // 11 Manual Diagnosis Options
  'আইন (Ayn)': 'Ayn (Evil Eye)',
  'Ayn (Evil Eye)': 'আইন (Ayn)',
  'হাসাদ (Hasad)': 'Hasad (Envy / Malice)',
  'Hasad (Envy / Malice)': 'হাসাদ (Hasad)',
  'সেহের (Sihr)': 'Sihr (Magic / Sorcery)',
  'Sihr (Magic / Sorcery)': 'সেহের (Sihr)',
  'জ্বিনের প্রভাব (Jinn Influence)': 'Jinn Influence (Possession / Touch)',
  'Jinn Influence (Possession / Touch)': 'জ্বিনের প্রভাব (Jinn Influence)',
  'আইন + হাসাদ': 'Ayn + Hasad',
  'Ayn + Hasad': 'আইন + হাসাদ',
  'আইন + সেহের': 'Ayn + Sihr',
  'Ayn + Sihr': 'আইন + সেহের',
  'হাসাদ + সেহের': 'Hasad + Sihr',
  'Hasad + Sihr': 'হাসাদ + সেহের',
  'জ্বিন + সেহের': 'Jinn + Sihr',
  'Jinn + Sihr': 'জ্বিন + সেহের',
  'একাধিক সমস্যা (Multiple)': 'Multiple Afflictions',
  'Multiple Afflictions': 'একাধিক সমস্যা (Multiple)',
  'নরমাল / নির্দিষ্ট কোনো লক্ষণ শনাক্ত হয়নি (Normal)': 'Normal / No Specific Symptoms Detected',
  'Normal / No Specific Symptoms Detected': 'নরমাল / নির্দিষ্ট কোনো লক্ষণ শনাক্ত হয়নি (Normal)',
  'অন্যান্য (Other)': 'Other',
  'Other': 'অন্যান্য (Other)',

  // Session Reactions
  'Trembling / involuntary shivering in limbs': 'অঙ্গপ্রত্যঙ্গে কাঁপুনি বা কম্পন',
  'Deep repeated yawning': 'বারবার গভীর হাই তোলা',
  'Profuse cold sweating': 'শরীর ঠান্ডা হয়ে ঘাম বের হওয়া',
  'Sudden weeping / tears without grief': 'অকারণে হঠাৎ কান্না বা অশ্রুপাত',
  'Nausea / urge to vomit': 'বমি বমি ভাব বা বমির তীব্র বেগ',
  'Vocal alteration / involuntary speech': 'কণ্ঠস্বরের পরিবর্তন বা অনৈচ্ছিক কথা',
  'Rapid heart palpitations': 'হৃদস্পন্দন দ্রুত হওয়া বা ধড়ফড়',
  'Temporary numbness or paralysis in hands/feet': 'হাত-পায়ে অবশ ভাব বা অসাড়তা',
  'Calmness / no adverse physical reaction': 'স্বাভাবিক বা কোনো অস্বাভাবিক প্রতিক্রিয়া নেই',

  // English to Bengali (Bi-directional mapping)
  'Chest heaviness & suffocation': 'বুকে ভারী চাপ ও দমবন্ধ অনুভূতি',
  'Sudden unprovoked anger': 'হঠাৎ অহেতুক তীব্র রাগ ও ক্ষোভ',
  'Constant exhaustion': 'সার্বক্ষণিক ক্লান্তি ও দুর্বলতা',
  'Constant unexplained exhaustion': 'সার্বক্ষণিক অব্যক্ত ক্লান্তি ও দুর্বলতা',
  'Social isolation / aversion to people': 'সামাজিক মেলামেশায় অনীহা ও একাকিত্ব',
  'Frequent weeping without sadness': 'অকারণে কান্না বা গভীর বিষণ্ণতা',
  'Upper back stiffness': 'পিঠের উপরিভাগে শক্তভাব ও টান',
  'Upper back & shoulder tension': 'পিঠ ও ঘাড়ের উপরিভাগে তীব্র টান বা ব্যথা',
  'Stomach tingling sensation': 'পেটে ঝিঁঝিঁ বা অস্বস্তিকর অনুভূতি',
  'Stomach tingling / burning sensation': 'পেটে অস্বস্তি, জ্বালাপোড়া বা ঝিঁঝিঁ অনুভূতি',
  'Tension headache': 'টেনশন ও দীর্ঘস্থায়ী মাথাব্যথা',
  'Numbness in limbs or fingers': 'হাত-পায়ে অবশ বা ঝিঁঝিঁ লাগা',
  'Abdominal bloating / digestive issues': 'পেটে গ্যাস, পেট ফাঁপা ও হজমের অস্বাভাবিকতা',
  'Insomnia': 'তীব্র অনিদ্রা ও ঘুমাতে অসুবিধা',
  'Severe insomnia': 'তীব্র অনিদ্রা',
  'Severe insomnia & inability to sleep': 'তীব্র অনিদ্রা ও রাতে ঘুমাতে অপারগতা',
  'Frequent sudden awakenings': 'রাতে হঠাৎ হঠাৎ ঘুম ভেঙে যাওয়া',
  'Frequent abrupt awakenings with terror': 'রাতে তীব্র ভয় বা আতঙ্ক নিয়ে ঘুম ভেঙে যাওয়া',
  'Frequent abrupt awakenings': 'হঠাৎ বারবার ঘুম ভেঙে যাওয়া',
  'Sleep paralysis (Kaboos)': 'বোবায় ধরা / স্লিপ প্যারালাইসিস (কাবূস)',
  'Teeth grinding during sleep': 'ঘুমের মধ্যে অনিচ্ছাকৃত দাঁত কিড়মিড় করা',
  'Black dogs chasing': 'কালো কুকুর তাড়া করার স্বপ্ন',
  'Black dogs, cats, or beasts attacking': 'কালো কুকুর, বিড়াল বা হিংস্র পশুর আক্রমণের স্বপ্ন',
  'Black dogs and beasts attacking': 'কালো কুকুর ও হিংস্র প্রাণীর আক্রমণ',
  'Snakes and scorpions chasing': 'সাপ বা বিচ্ছু তাড়া করার দুঃস্বপ্ন',
  'Falling from high structures': 'উঁচু স্থান থেকে নিচে পড়ে যাওয়ার স্বপ্ন',
  'Falling from high structures or precipices': 'উঁচু স্থান বা পাহাড়ের চূড়া থেকে পড়ে যাওয়ার স্বপ্ন',
  'Graveyards': 'কবরস্থান বা শ্মশান দেখার স্বপ্ন',
  'Walking in graveyards': 'কবরস্থান বা নোংরা স্থানে হাঁটার দুঃস্বপ্ন',
  'Walking in graveyards or dirty places': 'কবরস্থান বা নোংরা স্থানে হাঁটার দুঃস্বপ্ন',
  'Patient wore a copper talisman from village astrologer which was removed.': 'রোগী পূর্বে কবিরাজের দেওয়া তামার তাবিয পরিহিত ছিলেন, যা পরবর্তীতে অপসারিত হয়েছে।',
  'Patient arrived alert but visibly anxious with tense shoulder posture.': 'রোগী সচেতন কিন্তু দৃশ্যমান অস্থিরতা ও কাঁধে টান নিয়ে উপস্থিত হয়েছেন।',
  'Chest constriction, palpitation, recurring black dog nightmares.': 'বুকে চাপ, বুক ধড়ফড় এবং পুনরাবৃত্ত কালো কুকুরের দুঃস্বপ্ন।',
  'Cardiology clearance verified, no cardiac abnormalities detected.': 'হৃদরোগ বিশেষজ্ঞের ক্লিয়ারেন্স যাচাই করা হয়েছে, কোনো হৃদরোগ পাওয়া যায়নি।',
  'Spiritual Affliction Suspected (Hasad/Evil Eye)': 'শারঈ সমস্যা সন্দেহভাজন (হাসাদ বা বদনজর)',
  'Signs consistent with spiritual distress / suspected affliction with strong element of Hasad (Evil Eye) affecting livelihood and well-being. No psychosis observed. Patient responded positively to Prophetic ruqyah.': 'লক্ষণসমূহ হাসাদ বা বদনজরের আধ্যাত্মিক প্রভাবের সাথে সঙ্গতিপূর্ণ। কোনো মানসিক অপ্রকৃতিস্থতা নেই। রুকইয়াহ তিলাওয়াতে ইতিবাচক সাড়া দিয়েছেন।',
  'Ruqyah-recited water: 1 glass to drink every morning on empty stomach, Ruqyah water bathing for 7 consecutive days (adding 7 crushed green Sidr leaves), Olive oil recited upon: massage neck, chest and forehead at bedtime, Daily morning & evening adhkar.': 'রুকইয়াহ করা পানি: প্রতিদিন সকালে খালি পেটে ১ গ্লাস পান; বরই পাতার পানিতে টানা ৭ দিন গোসল; দম করা জয়তুন তেল রাতে ঘাড়ে, বুকে ও কপালে মালিশ; সকাল-সন্ধ্যার মাসনূন আজকার নিয়মিত পাঠ।',
  'Maintain 5 daily prayers in congregation at Masjid. Discontinue all un-Islamic amulets permanently. Perform Istighfar 100 times daily.': 'মসজিদে জামাতের সাথে ৫ ওয়াক্ত সালাত আদায় করা; সকল প্রকার শিরকি তাবিয-কবচ স্থায়ীভাবে বর্জন; এবং প্রতিদিন অন্তত ১০০ বার ইস্তিগফার করা।',
  'Surah Al-Fatihah (7 times), Ayat al-Kursi (Al-Baqarah: 255), Al-Baqarah: 102 (Verses of Sihr), Al-Baqarah: 284-286, Al-A\'raf: 119-122 (Moses and Sorcerers), Yunus: 81-82 (Nullification of Sorcery), Ta-Ha: 69, As-Saffat: 1-10 (Subduing Jinn), Al-Ikhlas, Al-Falaq, An-Nas.': 'সূরা আল-ফাতিহা (৭ বার), আয়াতুল কুরসী (বাকারা: ২৫৫), সূরা আল-বাকারা: ১০২, সূরা বাকারা: ২৮৪-২৮৬, সূরা আল-আ\'রাফ: ১১৯-১২২, সূরা ইউনুস: ৮১-৮২, সূরা ত্বা-হা: ৬৯, সূরা আস-সাফফাত: ১-১০, সূরা আল-ইখলাস, সূরা আল-ফালাক, সূরা আন-নাস।',
  'Adhhibil-ba\'sa Rabban-naas, ishfi wa Antash-Shaafee...; Bismillahi arqeeka, min kulli shay\'in yu\'dheeka...; A\'oodhu bi-kalimaatillaahit-taammaati min sharri maa khalaq...; Hasbiyallahu la ilaha illa Huwa...': 'আজহিবিল বা\'স রব্বান নাস...; বিসমিল্লাহি আরকীক...; আ\'উযু বিকালিমাাতিল্লাহিত তা-ম্মাাতি...; হাসবিয়াল্লাহু লা ইলাহা ইল্লা হুওয়া...',
  'Severe trembling in right arm and knee during recitation of Al-Baqarah 102, Deep repeated yawning during Mu\'awwidhatayn, Profuse cold sweating on forehead, Temporary nausea but no vomiting.': 'সূরা বাকারার ১০২ নম্বর আয়াত তিলাওয়াতকালে ডান হাত ও হাঁটুতে তীব্র কাঁপুনি; মু\'আওবিযাতাইন পাঠকালে গভীর ঘনঘন হাই তোলা; কপালে শীতল ঘাম; সাময়িক বমি বমি ভাব কিন্তু বমি হয়নি।',
  'Aversion to hearing the Adhan or Quran': 'আযান বা কুরআন তিলাওয়াত শুনতে তীব্র অস্বস্তি',
  'Intrusive doubts (Waswas) during Wudu': 'অজু করার সময় তীব্র ওয়াসওয়াসা ও সন্দেহ',
  'Severe intrusive doubts (Waswas) in Wudu / Salah': 'অজু ও সালাতে তীব্র ওয়াসওয়াসা ও ভুল হওয়ার অনুভূতি',
  'Sudden heavy yawning during Adhan': 'আযান বা তিলাওয়াতকালে অস্বাভাবিক অতিরিক্ত হাই তোলা',
  'Sudden overwhelming sleepiness during recitation': 'কুরআন তিলাওয়াত বা আমলের সময় অতিরিক্ত তন্দ্রাচ্ছন্নতা',
  
  // Demographics, Statuses & Common Defaults
  'Unspecified': 'অনির্দিষ্ট',
  'N/A': 'প্রযোজ্য নয়',
  'Married': 'বিবাহিত',
  'Single': 'অবিবাহিত',
  'Divorced': 'তালাকপ্রাপ্ত',
  'Widowed': 'বিধবা / বিপত্নীক',
  'Male': 'পুরুষ',
  'Female': 'মহিলা',
  'Completed': 'সম্পন্ন',
  'Pending': 'অপেক্ষমান',
  'Scheduled': 'নির্ধারিত',
  'Cancelled': 'বাতিল',
  'None recorded': 'কোনো লক্ষণ রেকর্ড করা হয়নি',
  'Not specified': 'নির্দিষ্ট নয়',
  'No disruption reported': 'ঘুমের ব্যাঘাত নেই',
  'No significant disruption recorded': 'ঘুমের কোনো সমস্যা রেকর্ড করা হয়নি',
  'No recurring nightmares reported': 'কোনো পুনরাবৃত্ত দুঃস্বপ্ন রেকর্ড করা হয়নি',
  'Maintains regular prayer and dhikr': 'নিয়মিত সালাত ও যিকির বজায় রাখেন',
  'Maintains regular prayers without noticeable hindrance': 'নিয়মিত সালাত ও আমল বজায় রাখেন',
  'No prior treatments recorded.': 'পূর্ববর্তী কোনো চিকিৎসা ইতিহাস নেই',
  'No prior medical reports recorded.': 'পূর্ববর্তী কোনো মেডিকেল রিপোর্ট রেকর্ড করা হয়নি',
  'No hereditary mental illness. Happy family background.': 'বংশগত মানসিক রোগের ইতিহাস নেই; পারিবারিক পরিবেশ স্বাভাবিক।',
  'Unremarkable': 'পারিবারিক পরিবেশ স্বাভাবিক',
  'Unremarkable. | Situation: Stable.': 'পারিবারিক পরিবেশ স্বাভাবিক। | অবস্থা: স্থিতিশীল।',
  'Registered via public online booking portal.': 'অনলাইন বুকিং পোর্টালের মাধ্যমে সরাসরি নিবন্ধিত।',
  'No additional clinical remarks recorded.': 'কোনো অতিরিক্ত ক্লিনিক্যাল মন্তব্য রেকর্ড করা হয়নি।',
  
  // Durations
  'Less than 6 months': '৬ মাসের কম',
  '6 to 12 months': '৬ থেকে ১২ মাস',
  '1 to 2 years': '১ থেকে ২ বছর',
  '2 years': '২ বছর',
  'More than 2 years': '২ বছরের অধিক',
  '5 years': '৫ বছর',
  'More than 5 years': '৫ বছরের বেশি',

  // Locations
  'Sonagazi, Feni': 'সোনাগাজী, ফেনী',
  'Feni Sadar, Feni': 'ফেনী সদর, ফেনী',
  'Mohipal, Feni': 'মহিপাল, ফেনী',
  'Daganbhuiyan, Feni': 'দাগনভূঞা, ফেনী',
  'Chhagalnaiya, Feni': 'ছাগলনাইয়া, ফেনী',
  'Parshuram, Feni': 'পরশুরাম, ফেনী',
  'Fulgazi, Feni': 'ফুলগাজী, ফেনী',

  // 9 Diagnosis Categories
  'Main Complaints & Presenting Symptoms': 'প্রধান সমস্যা ও অভিযোগ',
  'Physical Symptoms & Health Complaints': 'শারীরিক অসুস্থতা ও রোগের অস্বাভাবিকতা',
  'Sleep-Related Problems': 'ঘুমের সমস্যা ও দুঃস্বপ্ন',
  'Bad Dreams & Nightmare Patterns': 'স্বপ্নে ভীতিকর বিষয় ও দুঃস্বপ্ন',
  'Religious Practice & Spiritual State': 'ইবাদত ও দ্বীনি আমলের অবস্থা',
  'Mental, Behavioral & Relational Changes': 'মানসিক, চারিত্রিক ও সম্পর্কগত পরিবর্তন',
  'Household & Marital Discord': 'পারিবারিক অশান্তি ও দাম্পত্য কলহ',
  'Livelihood, Wealth & Sustenance Disruptions': 'রূযী, বরকত ও আর্থিক ক্ষতি',
  'Prior Treatments & Occult Exposure History': 'পূর্বের চিকিৎসা ও ইতিহাস',
  'Prior Occult / Medical Treatments': 'পূর্বের চিকিৎসা ও ইতিহাস',
  'Personal & Family Background': 'ব্যক্তিগত ও পারিবারিক তথ্য',
  'Personal & Family Context': 'ব্যক্তিগত ও পারিবারিক তথ্য',

  // Observed Session Reactions
  'Trembling / Shivering in limbs': 'হাত-পায়ে কাঁপুনি বা কম্পন',
  'Deep repeated yawning': 'ঘন ঘন গভীর হাই তোলা',
  'Cold sweating': 'শীতল ঘাম নির্গমন',
  'Sudden weeping': 'হঠাৎ কান্না বা তীব্র বিষণ্ণতা',
  'Nausea / Urge to vomit': 'বমি ভাব বা বমি করার তীব্র অনুভূতি',
  'Vocal change': 'কণ্ঠস্বরে অস্বাভাবিক পরিবর্তন',
  'Palpitations': 'বুক ধড়ফড় বা হৃৎস্পন্দন বৃদ্ধি',
  'Numbness': 'শরীরের অংশে অবশ বা অসাড় অনুভূতি',
  'No adverse physical reaction': 'কোনো নেতিবাচক শারীরিক প্রতিক্রিয়া দেখা যায়নি',

  // Specific Session Items
  'Surah Al-Fatihah (7 times)': 'সূরা আল-ফাতিহা (৭ বার)',
  'Ayat al-Kursi (Al-Baqarah: 255)': 'আয়াতুল কুরসী (বাকারা: ২৫৫)',
  'Al-Baqarah: 102 (Verses of Sihr)': 'সূরা আল-বাকারা: ১০২ (সিহরের আয়াত)',
  'Al-Baqarah: 284-286': 'সূরা বাকারা: ২৮৪-২৮৬',
  'Al-A\'raf: 117-122 (Moses and Sorcerers)': 'সূরা আল-আ\'রাফ: ১১৭-১২২ (মুসা আ. ও জাদুকরদের ঘটনা)',
  'Yunus: 81-82 (Nullification of magic)': 'সূরা ইউনুস: ৮১-৮২ (জাদু বাতিলের আয়াত)',
  'Ta-Ha: 69': 'সূরা ত্বা-হা: ৬৯',
  'As-Saffat: 1-10': 'সূরা আস-সাফফাত: ১-১০',
  'Al-Ikhlas, Al-Falaq, An-Nas (3 times each)': 'সূরা আল-ইখলাস, আল-ফালাক, আন-নাস (৩ বার করে)',

  'Adhhibil-ba\'sa Rabban-naas, ishfi wa Antash-Shaafee...': 'আজহিবিল বা\'স রব্বান নাস, ইশফি ওয়া আনতাশ-শাফী...',
  'Bismillahi arqeeka, min kulli shay\'in yu\'dheeka...': 'বিসমিল্লাহি আরকীক, মিন কুল্লি শায়্যিন ইউ’যীক...',
  'A\'oodhu bi-kalimaatillaahit-taammaati min sharri maa khalaq...': 'আ’উযু বিকালিমাতিল্লাহিত-তাম্মাতি মিন শাররি মা খালাক...',
  'Hasbiyallahu la ilaha illa Huwa, \'alayhi tawakkaltu...': 'হাসবিয়াল্লাহু লা ইলাহা ইল্লা হুওয়া, আলাইহি তাওয়াক্কালতু...',

  'Severe trembling in right arm and knee during recitation of Al-Baqarah 102': 'সূরা বাকারার ১০২ নম্বর আয়াত তিলাওয়াতকালে ডান হাত ও হাঁটুতে তীব্র কাঁপুনি',
  'Deep repeated yawning during Mu\'awwidhatayn': 'মু’আওবিযাতাইন পাঠকালে গভীর ঘনঘন হাই তোলা',
  'Profuse cold sweating on forehead': 'কপালে অতিরিক্ত শীতল ঘাম হওয়া',
  'Temporary nausea but no vomiting': 'সাময়িক বমি বমি ভাব হওয়া কিন্তু বমি না হওয়া',

  'Signs consistent with spiritual distress / suspected affliction with strong element of Hasad (Evil Eye) affecting livelihood and well-being. No psychosis observed. Patient responded positively to Prophetic supplications.': 'লক্ষণসমূহ হাসাদ বা বদনজরের আধ্যাত্মিক প্রভাবের সাথে সঙ্গতিপূর্ণ, যা রুযী-রোজগার ও স্বাভাবিক জীবনে বিঘ্ন ঘটাচ্ছে। কোনো মানসিক বিকার নেই। রুকইয়াহ দোয়ায় রোগী ইতিবাচক সাড়া দিয়েছেন।',

  'Ruqyah-recited water: 1 glass to drink every morning on empty stomach': 'রুকইয়াহ করা পানি: প্রতিদিন সকালে খালি পেটে ১ গ্লাস পান করা',
  'Ruqyah water bathing for 7 consecutive days (adding 7 crushed green Sidr leaves)': 'রুকইয়াহ করা পানিতে টানা ৭ দিন গোসল (৭টি থেঁতলানো কাঁচা বরই পাতাসহ)',
  'Olive oil recited upon: massage neck, chest and joints before sleeping': 'দম করা জয়তুন তেল: রাতে ঘুমানোর পূর্বে ঘাড়, বুক ও জয়েন্টে মালিশ করা',
  'Pure Black Seed (Kalonji) oil: 5 drops with warm water daily': 'খাঁটি কালোজিরা তেল: প্রতিদিন কুসুম গরম পানিতে ৫ ফোঁটা মিশিয়ে পান করা',
  'Strict adherence to Morning & Evening Adhkar (Hisnul Muslim)': 'সকাল ও সন্ধ্যার মাসনূন আজকার (হিসনুল মুসলিম) গুরুত্বসহকারে পাঠ করা',

  // Raqi Assessment Categories
  'Spiritual Affliction Suspected (Hasad / Evil Eye)': 'শারঈ সমস্যা সন্দেহভাজন (হাসাদ বা বদনজর)',
  'Spiritual Affliction Suspected (Sihr / Magic)': 'শারঈ সমস্যা সন্দেহভাজন (সিহর বা জাদু)',
  'Spiritual Affliction Suspected (Mass / Jinn Possession)': 'শারঈ সমস্যা সন্দেহভাজন (মাস্স বা জিনঘটিত স্পর্শ)',
  'Non-Spiritual / Medical / Psychological': 'শারঈ লক্ষণহীন / সাধারণ শারীরিক বা মানসিক বিষয়',
  'Under Observation': 'ক্লিনিক্যাল পর্যবেক্ষণে রয়েছে',
  'Clear / Normal': 'সম্পূর্ণ স্বাভাবিক ও সুস্থ',

  // Prescribed Sunnah Remedies
  'Ruqyah water': 'দম করা পানি পান',
  'Olive oil massage': 'জয়তুন তেল মালিশ',
  'Black seed oil (Kalonji)': 'কালোজিরা তেল ব্যবহার',
  'Sidr leaf bath': 'বরই পাতা দিয়ে গোসল',
  'Daily morning and evening adhkar': 'সকাল ও সন্ধ্যার মাসনূন আজকার',
  'Regular recitation of Surah Al-Baqarah': 'নিয়মিত সূরা আল-বাকারা তিলাওয়াত বা শ্রবণ',
  'Hijama (Cupping)': 'হিজামা (কাপিং)',

  // Verses & Supplications
  'Surah Al-Fatihah': 'সূরা আল-ফাতিহা',
  'Ayat al-Kursi': 'আয়াতুল কুরসী',
  'Al-Baqarah 102': 'সূরা আল-বাকারা ১০২',
  'Al-Baqarah 284-286': 'সূরা আল-বাকারা ২৮৪-২৮৬',
  'Al-A\'raf 117-122': 'সূরা আল-আ\'রাফ ১১৭-১২২',
  'Yunus 81-82': 'সূরা ইউনুস ৮১-৮২',
  'Ta-Ha 69': 'সূরা ত্ব-হা ৬৯',
  'As-Saffat 1-10': 'সূরা আস-সাফফাত ১-১০',
  'Mu\'awwidhatayn': 'মু\'আউবিযাতাইন (সূরা ফালাক ও নাস)',
  'Adhhibil-ba\'sa Rabban-naas...': 'আজহিবিল বা\'সা রাব্বান-নাস...',
  'Bismillahi arqeeka...': 'বিসমিল্লাহি আরক্বীকা...',
  'A\'oodhu bi-kalimaatillaah...': 'আ\'উযু বি-কালিমাতিল্লাহ...',
  'Hasbiyallahu...': 'হাসবিয়াল্লাহু...'
};

function translateClinicalItem(term, targetLang = 'bn') {
  if (!term) return '';
  const clean = String(term).trim();
  const hasBengali = /[ঀ-৿]/.test(clean);

  if (targetLang === 'bn') {
    if (hasBengali) return toBengaliDigits(clean);
    if (CLINICAL_TRANSLATIONS[clean]) return CLINICAL_TRANSLATIONS[clean];
    for (const [enKey, bnVal] of Object.entries(CLINICAL_TRANSLATIONS)) {
      if (clean.toLowerCase() === enKey.toLowerCase()) return bnVal;
    }
    return toBengaliDigits(clean);
  } else {
    // Target is English
    for (const [enKey, bnVal] of Object.entries(CLINICAL_TRANSLATIONS)) {
      if (clean === bnVal || clean.toLowerCase() === bnVal.toLowerCase()) return enKey;
    }
    for (const [enKey, bnVal] of Object.entries(CLINICAL_TRANSLATIONS)) {
      if (clean.includes(bnVal) && bnVal.length > 3) return enKey;
    }
    if (CLINICAL_TRANSLATIONS[clean]) return clean;
    for (const enKey of Object.keys(CLINICAL_TRANSLATIONS)) {
      if (clean.toLowerCase() === enKey.toLowerCase()) return enKey;
    }
    const bnToEnDigits = { '০':'0', '১':'1', '২':'2', '৩':'3', '৪':'4', '৫':'5', '৬':'6', '৭':'7', '৮':'8', '৯':'9' };
    return clean.replace(/[০-৯]/g, d => bnToEnDigits[d] || d);
  }
}

// Parse JSON or string lists
function parseList(val) {
  if (!val) return [];
  try {
    const parsed = JSON.parse(val);
    return Array.isArray(parsed) ? parsed : [String(val)];
  } catch {
    return [String(val)];
  }
}

/**
 * Packs a JPEG buffer into a standard, fully compliant PDF-1.4 file
 * Supports invisible text layer (rendering mode 3 Tr) for 100% searchability, copy-paste, and OCR
 */
function packJpegToPdf(jpegBuf, width = 1240, height = 1754, textEntries = []) {
  const pdfWidth = 595.28;
  const pdfHeight = 841.89;

  let streamContent = `q\n${pdfWidth.toFixed(2)} 0 0 ${pdfHeight.toFixed(2)} 0 0 cm\n/Im1 Do\nQ\n`;
  if (textEntries && textEntries.length > 0) {
    streamContent += `BT\n/F1 9 Tf\n3 Tr\n`;
    let curY = 780;
    for (const entry of textEntries) {
      if (!entry) continue;
      const clean = String(entry)
        .replace(/[^\x20-\x7E]/g, ' ')
        .replace(/\\/g, '\\\\')
        .replace(/\(/g, '\\(')
        .replace(/\)/g, '\\)');
      streamContent += `1 0 0 1 40 ${curY.toFixed(1)} Tm\n(${clean}) Tj\n`;
      curY -= 12;
      if (curY < 50) curY = 780;
    }
    streamContent += `ET\n`;
  }
  const streamBuf = Buffer.from(streamContent, 'latin1');

  const objects = [];
  let offset = 0;
  const offsets = [];

  function addObject(buf) {
    offsets.push(offset);
    offset += buf.length;
    objects.push(buf);
  }

  const header = Buffer.from('%PDF-1.4\n%\xe2\xe3\xcf\xd3\n', 'latin1');
  offset += header.length;

  // 1: Catalog
  addObject(Buffer.from('1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n', 'latin1'));

  // 2: Pages
  addObject(Buffer.from('2 0 obj\n<< /Type /Pages /Kids [3 0 R] /Count 1 >>\nendobj\n', 'latin1'));

  // 3: Page
  addObject(Buffer.from(
    `3 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${pdfWidth} ${pdfHeight}] /Resources << /Font << /F1 6 0 R >> /XObject << /Im1 4 0 R >> >> /Contents 5 0 R >>\nendobj\n`,
    'latin1'
  ));

  // 4: Image XObject (JPEG)
  const imgHeader = `4 0 obj\n<< /Type /XObject /Subtype /Image /Width ${width} /Height ${height} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${jpegBuf.length} >>\nstream\n`;
  const imgFooter = '\nendstream\nendobj\n';
  const obj4 = Buffer.concat([Buffer.from(imgHeader, 'latin1'), jpegBuf, Buffer.from(imgFooter, 'latin1')]);
  addObject(obj4);

  // 5: Contents
  const cHeader = `5 0 obj\n<< /Length ${streamBuf.length} >>\nstream\n`;
  const cFooter = '\nendstream\nendobj\n';
  const obj5 = Buffer.concat([Buffer.from(cHeader, 'latin1'), streamBuf, Buffer.from(cFooter, 'latin1')]);
  addObject(obj5);

  // 6: Font F1
  addObject(Buffer.from('6 0 obj\n<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>\nendobj\n', 'latin1'));

  // Xref
  const xrefOffset = offset;
  let xref = `xref\n0 7\n0000000000 65535 f \n`;
  for (let i = 0; i < offsets.length; i++) {
    xref += String(offsets[i]).padStart(10, '0') + ' 00000 n \n';
  }
  const trailer = `trailer\n<< /Size 7 /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF\n`;

  return Buffer.concat([
    header,
    ...objects,
    Buffer.from(xref, 'latin1'),
    Buffer.from(trailer, 'latin1')
  ]);
}

/**
 * Resolves all patient symptoms across 9 categories from:
 * 1. patient_diagnoses.selected_symptom_ids (dynamic database mapping)
 * 2. patient_diagnoses.selected_symptoms_json
 * 3. patient_histories (for older records without IDs)
 * Filters out any category that has 0 symptoms (Requirement 6).
 */
function resolvePatientSymptoms(patientId, diagnosis, history) {
  let categoriesMap = new Map();

  // 1. Process from diagnosis if exists
  if (diagnosis) {
    // Check Category 1: Patient's Main Symptoms text
    if (diagnosis.main_complaints_text && diagnosis.main_complaints_text.trim()) {
      try {
        const cat1 = db.prepare("SELECT * FROM diagnosis_categories WHERE code = 'patient_main_symptoms'").get();
        if (cat1 && !categoriesMap.has(cat1.id)) {
          categoriesMap.set(cat1.id, {
            category_id: cat1.id,
            category_code: cat1.code,
            name_bn: cat1.name_bn,
            name_en: cat1.name_en,
            sort_order: cat1.sort_order,
            symptoms: [{
              id: null,
              name_bn: diagnosis.main_complaints_text.trim(),
              name_en: translateClinicalItem(diagnosis.main_complaints_text.trim(), 'en')
            }]
          });
        }
      } catch (e) {}
    }

    let symIds = [];
    if (diagnosis.selected_symptom_ids) {
      try {
        const parsed = typeof diagnosis.selected_symptom_ids === 'string'
          ? JSON.parse(diagnosis.selected_symptom_ids)
          : diagnosis.selected_symptom_ids;
        if (Array.isArray(parsed)) symIds = parsed.map(Number).filter(Boolean);
      } catch (e) {}
    }

    if (symIds.length > 0) {
      const placeholders = symIds.map(() => '?').join(',');
      const rows = db.prepare(`
        SELECT 
          s.id as symptom_id, s.category_id, s.symptom_bn, s.symptom_en, s.sort_order as symptom_sort,
          c.id as cat_id, c.code as category_code, c.name_bn as category_name_bn, c.name_en as category_name_en, c.sort_order as category_sort
        FROM diagnosis_symptoms s
        JOIN diagnosis_categories c ON s.category_id = c.id
        WHERE s.id IN (${placeholders})
        ORDER BY c.sort_order ASC, s.sort_order ASC
      `).all(...symIds);

      for (const row of rows) {
        if (!categoriesMap.has(row.category_id)) {
          categoriesMap.set(row.category_id, {
            category_id: row.category_id,
            category_code: row.category_code,
            name_bn: row.category_name_bn,
            name_en: row.category_name_en,
            sort_order: row.category_sort,
            symptoms: []
          });
        }
        categoriesMap.get(row.category_id).symptoms.push({
          id: row.symptom_id,
          name_bn: row.symptom_bn,
          name_en: row.symptom_en
        });
      }
    }

    // Also check selected_symptoms_json for any symptoms or custom text
    if (diagnosis.selected_symptoms_json) {
      try {
        const parsedJson = typeof diagnosis.selected_symptoms_json === 'string'
          ? JSON.parse(diagnosis.selected_symptoms_json)
          : diagnosis.selected_symptoms_json;
        if (Array.isArray(parsedJson)) {
          for (const cat of parsedJson) {
            const catId = cat.category_id || cat.id || 99;
            if (!categoriesMap.has(catId)) {
              categoriesMap.set(catId, {
                category_id: catId,
                category_code: cat.category_code || '',
                name_bn: cat.category_name_bn || cat.name_bn || '',
                name_en: cat.category_name_en || cat.name_en || '',
                sort_order: cat.sort_order || 99,
                symptoms: []
              });
            }
            const existingSymNames = new Set(categoriesMap.get(catId).symptoms.map(s => s.name_bn || s.name_en));
            for (const s of (cat.symptoms || [])) {
              const bnText = s.symptom_bn || s.name_bn || s.symptom_name_bn;
              const enText = s.symptom_en || s.name_en || s.symptom_name_en;
              if (bnText && existingSymNames.has(bnText)) continue;
              if (enText && existingSymNames.has(enText)) continue;
              categoriesMap.get(catId).symptoms.push({
                id: s.id || null,
                name_bn: bnText || translateClinicalItem(enText, 'bn'),
                name_en: enText || translateClinicalItem(bnText, 'en')
              });
            }
          }
        }
      } catch (e) {}
    }
  }

  // 2. Supplement from history for older records
  if (history) {
    const parseListSafe = (str) => {
      if (!str) return [];
      try {
        const p = JSON.parse(str);
        return Array.isArray(p) ? p : [String(str)];
      } catch {
        return [String(str)];
      }
    };

    const histCatMap = [
      { key: 'main_symptoms', catId: 1, name_bn: 'প্রধান সমস্যা ও অভিযোগ', name_en: 'Main Complaints & Presenting Symptoms' },
      { key: 'physical_symptoms', catId: 2, name_bn: 'শারীরিক অসুস্থতা ও রোগের অস্বাভাবিকতা', name_en: 'Physical Symptoms & Health Complaints' },
      { key: 'sleep_problems', catId: 3, name_bn: 'ঘুমের সমস্যা', name_en: 'Sleep-Related Problems' },
      { key: 'dream_problems', catId: 4, name_bn: 'স্বপ্নে ভীতিকর বিষয় ও দুঃস্বপ্ন', name_en: 'Bad Dreams & Nightmare Patterns' },
      { key: 'worship_problems', catId: 5, name_bn: 'ইবাদত ও দ্বীনি আমলের অবস্থা', name_en: 'Religious Practice & Spiritual State' }
    ];

    for (const hCat of histCatMap) {
      const items = parseListSafe(history[hCat.key]);
      if (items.length > 0) {
        if (!categoriesMap.has(hCat.catId)) {
          categoriesMap.set(hCat.catId, {
            category_id: hCat.catId,
            category_code: hCat.key,
            name_bn: hCat.name_bn,
            name_en: hCat.name_en,
            sort_order: hCat.catId,
            symptoms: []
          });
        }
        const existingSymNames = new Set(categoriesMap.get(hCat.catId).symptoms.map(s => s.name_bn || s.name_en));
        for (const item of items) {
          if (!item || !item.trim()) continue;
          const cleanItem = item.trim();
          if (cleanItem === 'None recorded' || cleanItem === 'লক্ষণ রেকর্ড করা হয়নি' || cleanItem === 'No disruption reported' || cleanItem === 'ঘুমের ব্যাঘাত নেই') continue;
          if (!existingSymNames.has(cleanItem)) {
            let dbMatch = null;
            try {
              dbMatch = db.prepare('SELECT symptom_bn, symptom_en FROM diagnosis_symptoms WHERE symptom_bn = ? OR symptom_en = ?').get(cleanItem, cleanItem);
            } catch (e) {}
            categoriesMap.get(hCat.catId).symptoms.push({
              id: null,
              name_bn: dbMatch ? dbMatch.symptom_bn : translateClinicalItem(cleanItem, 'bn'),
              name_en: dbMatch ? dbMatch.symptom_en : translateClinicalItem(cleanItem, 'en')
            });
          }
        }
      }
    }
  }

  // Filter out any categories with 0 symptoms (Requirement 6: Do not show empty symptom sections)
  const activeCategories = Array.from(categoriesMap.values()).filter(c => c.symptoms && c.symptoms.length > 0);
  activeCategories.sort((a, b) => a.sort_order - b.sort_order);

  return activeCategories;
}

function wrapText(text, maxChars = 52) {
  if (!text) return [];
  if (text.length <= maxChars) return [text];
  const words = text.split(/\s+/);
  const lines = [];
  let cur = '';
  for (const w of words) {
    if (!cur) {
      cur = w;
    } else if ((cur + ' ' + w).length <= maxChars) {
      cur += ' ' + w;
    } else {
      lines.push(cur);
      cur = w;
    }
  }
  if (cur) lines.push(cur);
  return lines;
}

/**
 * Builds high-resolution SVG for Patient History Report
 */
function buildPatientHistorySvg(patient, history, diagnosis, lang = 'bn', options = {}) {
  const isBn = lang === 'bn';
  const width = 1240;
  const height = 1754;
  const logoBase64 = getLogoBase64();
  const notoFontBase64 = getNotoBengaliBase64();

  // Translations
  const t = {
    clinicName: isBn ? 'রুকইয়াহ সাপোর্ট এন্ড কাপিং সেন্টার' : 'RUQYAH SUPPORT & CUPPING CENTER',
    clinicSub: isBn ? 'ফেনী শাখা  |  ভূঞা ম্যানশন, আদর্শ হাউজিং সোসাইটি, মহিপাল, ফেনী' : 'FENI BRANCH  |  Bhuya Mansion, Adarsha Housing Society, Mohipal, Feni',
    phoneRaqi: isBn ? 'হটলাইন / হোয়াটসঅ্যাপ: ০১৭৫৮-৩৫৪৯২০  |  পরিচালক ও প্রধান রাকি: মুহাম্মদুল্লাহ মিয়া' : 'Hotline / WhatsApp: 01758-354920  |  Lead Raqi: Muhammadullah Miah',
    reportTitle: (options.isShareable ? (isBn ? 'রোগী কপি — ' : 'PATIENT COPY — ') : '') + (isBn ? 'রোগীর পূর্ণাঙ্গ স্বাস্থ্য বিবরণী ও হিস্ট্রি রিপোর্ট' : 'PATIENT CLINICAL HISTORY REPORT'),
    ref: isBn ? `রেফারেন্স: ${patient.patient_id}` : `Ref: ${patient.patient_id}`,
    date: isBn ? `তারিখ: ${toBengaliDigits(new Date().toISOString().split('T')[0])}` : `Date: ${new Date().toISOString().split('T')[0]}`,
    demographics: isBn ? 'রোগীর সাধারণ পরিচিতি ও তথ্য' : 'PATIENT IDENTIFICATION & DEMOGRAPHICS',
    pId: isBn ? 'রোগী আইডি' : 'Patient ID',
    pName: isBn ? 'রোগীর পূর্ণ নাম' : 'Full Name',
    pAgeGender: isBn ? 'বয়স ও লিঙ্গ' : 'Age / Gender',
    pPhone: isBn ? 'মোবাইল নম্বর' : 'Phone Number',
    pEmergency: isBn ? 'জরুরি যোগাযোগ' : 'Emergency Contact',
    pMarital: isBn ? 'বৈবাহিক অবস্থা' : 'Marital Status',
    pAddress: isBn ? 'বর্তমান ঠিকানা' : 'Address',
    diagSecTitle: isBn ? 'ক্লিনিক্যাল ডায়াগনোসিস ও রোগীর নির্বাচিত উপসর্গসমূহ' : 'CLINICAL DIAGNOSIS & PATIENT REPORTED SYMPTOMS',
    shifaNotice: isBn
      ? 'গোপনীয় স্বাস্থ্য বিবরণী — শিফা ও পূর্ণ আরোগ্য একমাত্র আল্লাহ তা\'আলার পক্ষ থেকে অবতীর্ণ হয়। রুকইয়াহ হলো সুন্নাহসম্মত উপায়।'
      : 'CONFIDENTIAL HEALTH RECORD — Healing (Shifa) is exclusively in the hands of Allah. Ruqyah is an authentic prophetic means.',
    raqiSign: isBn ? 'মুহাম্মদুল্লাহ মিয়া' : 'Muhammadullah Miah',
    raqiTitle: isBn ? 'কনসালট্যান্ট রাকি ও সুন্নাহ প্র্যাকটিশনার' : 'Consultant Raqi & Sunnah Practitioner'
  };

  // Build SVG sections
  let svgContent = `
  <svg width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg">
    <defs>
      <style>
        ${notoFontBase64 ? `
        @font-face {
          font-family: 'Noto Sans Bengali';
          src: url('data:font/truetype;charset=utf-8;base64,${notoFontBase64}') format('truetype');
          font-weight: normal;
          font-style: normal;
        }
        ` : ''}
        @font-face {
          font-family: 'Noto Sans Bengali';
          src: local('Noto Sans Bengali'), local('Nirmala UI'), local('Vrinda'), local('SolaimanLipi'), local('Arial Unicode MS');
        }
        * {
          font-family: 'Noto Sans Bengali', Noto Sans Bengali, 'Nirmala UI', Nirmala UI, sans-serif;
        }
        .font-base {
          font-family: 'Noto Sans Bengali', Noto Sans Bengali, 'Nirmala UI', Nirmala UI, 'Vrinda', 'SolaimanLipi', 'Segoe UI', Arial, sans-serif;
        }
      </style>
    </defs>
    <rect width="100%" height="100%" fill="#FFFFFF" />
    
    <!-- Top Green Accent Bar -->
    <rect x="50" y="40" width="${width - 100}" height="10" fill="#0F5132" rx="3" />
    
    <!-- Header: Logo + Clinic Info -->
    <g transform="translate(50, 65)">
      ${logoBase64 ? `<image href="${logoBase64}" x="0" y="0" width="90" height="90" />` : ''}
      <g transform="translate(${logoBase64 ? '105' : '0'}, 25)">
        <text class="font-base" font-size="25" font-weight="bold" fill="#0F5132">${escapeXml(t.clinicName)}</text>
        <text class="font-base" font-size="13.5" fill="#4B5563" y="26">${escapeXml(t.clinicSub)}</text>
        <text class="font-base" font-size="13" fill="#059669" font-weight="600" y="48">${escapeXml(t.phoneRaqi)}</text>
      </g>
    </g>

    <!-- Badge Header Right -->
    <g transform="translate(860, 65)">
      <rect width="330" height="90" rx="8" fill="#ECFDF5" stroke="#A7F3D0" stroke-width="1.5" />
      <text class="font-base" x="20" y="32" font-size="13.5" font-weight="bold" fill="#065F46">${escapeXml(t.reportTitle)}</text>
      <text class="font-base" x="20" y="56" font-size="13" fill="#1E293B">${escapeXml(t.ref)}</text>
      <text class="font-base" x="20" y="76" font-size="12" fill="#64748B">${escapeXml(t.date)}</text>
    </g>

    <!-- Divider Line -->
    <line x1="50" y1="170" x2="${width - 50}" y2="170" stroke="#CBD5E1" stroke-width="1.5" />

    <!-- Demographics Card -->
    <g transform="translate(50, 185)">
      <rect width="${width - 100}" height="115" rx="8" fill="#F8FAFC" stroke="#E2E8F0" stroke-width="1.5" />
      <rect x="0" y="0" width="${width - 100}" height="28" rx="8" fill="#F1F5F9" />
      <text class="font-base" x="20" y="19" font-size="12.5" font-weight="bold" fill="#0F5132">${escapeXml(t.demographics)}</text>
      
      <!-- Row 1 -->
      <text class="font-base" x="20" y="52" font-size="11.5" fill="#64748B">${escapeXml(t.pId)}: <tspan font-weight="bold" fill="#064E3B">${escapeXml(patient.patient_id)}</tspan></text>
      <text class="font-base" x="380" y="52" font-size="11.5" fill="#64748B">${escapeXml(t.pName)}: <tspan font-weight="bold" fill="#0F172A">${escapeXml(patient.full_name)}</tspan></text>
      <text class="font-base" x="780" y="52" font-size="11.5" fill="#64748B">${escapeXml(t.pAgeGender)}: <tspan font-weight="bold" fill="#0F172A">${isBn ? toBengaliDigits(patient.age) + ' বছর' : patient.age + ' Yrs'} / ${escapeXml(translateClinicalItem(patient.gender || 'Unspecified', isBn ? 'bn' : 'en'))}</tspan></text>
      
      <!-- Row 2 -->
      <text class="font-base" x="20" y="76" font-size="11.5" fill="#64748B">${escapeXml(t.pPhone)}: <tspan font-weight="bold" fill="#0F172A">${isBn ? toBengaliDigits(patient.phone) : escapeXml(patient.phone)}</tspan></text>
      <text class="font-base" x="380" y="76" font-size="11.5" fill="#64748B">${escapeXml(t.pEmergency)}: <tspan fill="#0F172A">${escapeXml(patient.emergency_contact && patient.emergency_contact !== 'N/A' ? (isBn ? toBengaliDigits(patient.emergency_contact) : patient.emergency_contact) : (isBn ? 'প্রযোজ্য নয়' : 'N/A'))}</tspan></text>
      <text class="font-base" x="780" y="76" font-size="11.5" fill="#64748B">${escapeXml(t.pMarital)}: <tspan fill="#0F172A">${escapeXml(translateClinicalItem(patient.marital_status || 'N/A', isBn ? 'bn' : 'en'))}</tspan></text>
      
      <!-- Row 3 -->
      <text class="font-base" x="20" y="99" font-size="11.5" fill="#64748B">${escapeXml(t.pAddress)}: <tspan fill="#0F172A">${escapeXml(translateClinicalItem(patient.address, isBn ? 'bn' : 'en'))}</tspan></text>
    </g>
  `;

  let currentY = 315;

  // Suicidal Ideation Alert Banner if flagged
  if (diagnosis && diagnosis.suicidal_ideation_flag === 1) {
    const alertMsg = isBn 
      ? '⚠️ [জরুরি সতর্কতা]: আত্মহত্যার চিন্তা বা সেলফ-হার্ম চিহ্নিত হয়েছে। মানসিক স্বাস্থ্য বিশেষজ্ঞের শরণাপন্ন হওয়া নিশ্চিত করুন।'
      : '⚠️ [URGENT CLINICAL ALERT]: Suicidal ideation or self-harm reported. Professional psychiatric referral required.';
    svgContent += `
      <g transform="translate(50, ${currentY})">
        <rect width="${width - 100}" height="32" rx="6" fill="#FEE2E2" stroke="#DC2626" stroke-width="1.5" />
        <text class="font-base" x="20" y="21" font-size="11.5" font-weight="bold" fill="#991B1B">${escapeXml(alertMsg)}</text>
      </g>
    `;
    currentY += 40;
  }

  // Active Symptoms Resolved
  const activeCategories = resolvePatientSymptoms(patient.patient_id, diagnosis, history);

  if (activeCategories.length > 0) {
    // Section Header
    svgContent += `
      <g transform="translate(50, ${currentY})">
        <rect width="${width - 100}" height="28" rx="6" fill="#064E3B" />
        <text class="font-base" x="18" y="19" font-size="12" font-weight="bold" fill="#FFFFFF">🩺 ${escapeXml(t.diagSecTitle)}</text>
      </g>
    `;
    currentY += 34;

    for (const cat of activeCategories) {
      const catName = isBn ? cat.name_bn : cat.name_en;
      const countLabel = isBn ? `(${toBengaliDigits(cat.symptoms.length)}টি লক্ষণ)` : `(${cat.symptoms.length} Symptoms)`;

      // Build symptom row lines without truncation
      const symRows = [];
      for (let i = 0; i < cat.symptoms.length; i += 2) {
        const s1 = cat.symptoms[i];
        const s2 = cat.symptoms[i + 1] || null;
        const text1 = isBn ? s1.name_bn : s1.name_en;
        const text2 = s2 ? (isBn ? s2.name_bn : s2.name_en) : '';

        const lines1 = wrapText(text1, 52);
        const lines2 = s2 ? wrapText(text2, 52) : [];
        const maxLines = Math.max(lines1.length, lines2.length, 1);
        symRows.push({ lines1, lines2, maxLines });
      }

      const totalSymptomsHeight = symRows.reduce((sum, r) => sum + (r.maxLines * 18) + 4, 0);
      const catBoxHeight = 28 + totalSymptomsHeight + 10;

      svgContent += `
        <g transform="translate(50, ${currentY})">
          <rect width="${width - 100}" height="${catBoxHeight}" rx="6" fill="#FAFDFB" stroke="#A7F3D0" stroke-width="1.2" />
          <rect x="0" y="0" width="${width - 100}" height="26" rx="6" fill="#ECFDF5" />
          <rect x="0" y="0" width="4" height="26" fill="#059669" />
          <text class="font-base" x="16" y="18" font-size="12" font-weight="bold" fill="#065F46">❖ ${escapeXml(catName)} <tspan font-weight="normal" font-size="10.5" fill="#047857">${escapeXml(countLabel)}</tspan></text>
      `;

      let symY = 46;
      for (const row of symRows) {
        // Col 1
        for (let lIdx = 0; lIdx < row.lines1.length; lIdx++) {
          if (lIdx === 0) {
            svgContent += `
              <text class="font-base" x="20" y="${symY + (lIdx * 18)}" font-size="11" fill="#1E293B">
                <tspan fill="#059669" font-weight="bold">✔ </tspan>${escapeXml(row.lines1[lIdx])}
              </text>
            `;
          } else {
            svgContent += `
              <text class="font-base" x="38" y="${symY + (lIdx * 18)}" font-size="11" fill="#475569">
                ${escapeXml(row.lines1[lIdx])}
              </text>
            `;
          }
        }
        // Col 2
        if (row.lines2.length > 0) {
          for (let lIdx = 0; lIdx < row.lines2.length; lIdx++) {
            if (lIdx === 0) {
              svgContent += `
                <text class="font-base" x="580" y="${symY + (lIdx * 18)}" font-size="11" fill="#1E293B">
                  <tspan fill="#059669" font-weight="bold">✔ </tspan>${escapeXml(row.lines2[lIdx])}
                </text>
              `;
            } else {
              svgContent += `
                <text class="font-base" x="598" y="${symY + (lIdx * 18)}" font-size="11" fill="#475569">
                  ${escapeXml(row.lines2[lIdx])}
                </text>
              `;
            }
          }
        }
        symY += (row.maxLines * 18) + 4;
      }

      svgContent += `</g>`;
      currentY += catBoxHeight + 10;
    }
  } else {
    // No symptoms recorded
    svgContent += `
      <g transform="translate(50, ${currentY})">
        <rect width="${width - 100}" height="42" rx="6" fill="#F8FAFC" stroke="#CBD5E1" stroke-width="1" />
        <text class="font-base" x="20" y="26" font-size="12" fill="#64748B">${isBn ? 'রোগীর জন্য এখনও কোনো নির্দিষ্ট উপসর্গ বা ডায়াগনোসিস রেকর্ড পাওয়া যায়নি।' : 'No specific symptoms or diagnosis recorded for this patient.'}</text>
      </g>
    `;
    currentY += 52;
  }

  // Clinical Details & Notes (Render ONLY if non-empty!)
  const clinicalCards = [];

  if (diagnosis && diagnosis.main_complaints_text && diagnosis.main_complaints_text.trim()) {
    clinicalCards.push({
      label: isBn ? 'প্রধান সমস্যা ও অভিযোগের বিস্তারিত বিবরণ' : 'Chief Complaints & Presenting Detail',
      value: diagnosis.main_complaints_text.trim()
    });
  }

  const durationVal = history?.problem_duration || history?.duration_of_problems;
  if (durationVal && durationVal.trim() && durationVal !== 'Not specified' && durationVal !== 'নির্দিষ্ট নয়') {
    clinicalCards.push({
      label: isBn ? 'সমস্যার মেয়াদকাল / সময়কাল' : 'Problem Duration & Timeline',
      value: translateClinicalItem(durationVal, isBn ? 'bn' : 'en')
    });
  }

  if (diagnosis && diagnosis.onset_history_notes && diagnosis.onset_history_notes.trim()) {
    clinicalCards.push({
      label: isBn ? 'সমস্যা শুরুর প্রেক্ষাপট ও পটভূমি' : 'Onset History & Circumstances',
      value: diagnosis.onset_history_notes.trim()
    });
  }

  const prevMed = history?.previous_treatment_history || history?.previous_medical_history;
  if (prevMed && prevMed.trim() && prevMed !== 'No prior medical reports recorded.' && prevMed !== 'পূর্ববর্তী কোনো চিকিৎসা ইতিহাস নেই') {
    clinicalCards.push({
      label: isBn ? 'পূর্ববর্তী চিকিৎসা ও টেস্টের ফলাফল' : 'Prior Medical & Treatment History',
      value: translateClinicalItem(prevMed, isBn ? 'bn' : 'en')
    });
  }

  const famVal = diagnosis?.family_social_notes || history?.family_history;
  if (famVal && famVal.trim() && famVal !== 'Unremarkable' && famVal !== 'স্বাভাবিক') {
    clinicalCards.push({
      label: isBn ? 'পারিবারিক ও সামাজিক প্রেক্ষাপট' : 'Family & Social Context',
      value: famVal.trim()
    });
  }

  const notesVal = diagnosis?.notes || history?.additional_information || patient?.notes;
  if (notesVal && notesVal.trim() && notesVal !== 'No additional clinical remarks recorded.' && notesVal !== 'কোনো অতিরিক্ত ক্লিনিক্যাল মন্তব্য নেই।') {
    clinicalCards.push({
      label: isBn ? 'রাক্বীর ক্লিনিক্যাল পর্যবেক্ষণ ও কেস নোট' : 'Raqi Clinical Observations & Case Notes',
      value: translateClinicalItem(notesVal, isBn ? 'bn' : 'en')
    });
  }

  if (clinicalCards.length > 0) {
    for (const card of clinicalCards) {
      const lines = wrapText(card.value, 115);
      const cardHeight = 26 + (lines.length * 18) + 8;
      svgContent += `
        <g transform="translate(50, ${currentY})">
          <rect width="${width - 100}" height="${cardHeight}" rx="6" fill="#FFFFFF" stroke="#E2E8F0" stroke-width="1.2" />
          <rect x="0" y="0" width="${width - 100}" height="24" rx="6" fill="#F8FAFC" />
          <rect x="0" y="0" width="4" height="24" fill="#059669" />
          <text class="font-base" x="16" y="17" font-size="11.5" font-weight="bold" fill="#0F5132">${escapeXml(card.label)}</text>
      `;
      let lineY = 40;
      for (const line of lines) {
        svgContent += `
          <text class="font-base" x="20" y="${lineY}" font-size="11" fill="#334155">${escapeXml(line)}</text>
        `;
        lineY += 18;
      }
      svgContent += `</g>`;
      currentY += cardHeight + 8;
    }
  }

  // Footer & Signatures Block
  svgContent += `
    <!-- Footer Section -->
    <g transform="translate(50, 1620)">
      <line x1="0" y1="0" x2="${width - 100}" y2="0" stroke="#CBD5E1" stroke-width="1.5" />
      
      <!-- Seal Stamp Placeholder Box -->
      <g transform="translate(540, 15)">
        <rect width="180" height="65" fill="#F8FAFC" stroke="#94A3B8" stroke-width="1" stroke-dasharray="4,4" rx="4" />
        <text class="font-base" x="90" y="38" font-size="11" fill="#64748B" font-weight="600" text-anchor="middle">${isBn ? '[ ক্লিনিক অফিসিয়াল সিল ]' : '[ CLINIC OFFICIAL SEAL ]'}</text>
      </g>

      <!-- Signature Line -->
      <g transform="translate(860, 45)">
        <line x1="0" y1="0" x2="260" y2="0" stroke="#0F172A" stroke-width="1.5" />
        <text class="font-base" x="130" y="20" font-size="13" font-weight="bold" fill="#0F172A" text-anchor="middle">${escapeXml(t.raqiSign)}</text>
        <text class="font-base" x="130" y="36" font-size="11" fill="#475569" text-anchor="middle">${escapeXml(t.raqiTitle)}</text>
      </g>

      <!-- Shifa Notice -->
      <text class="font-base" x="0" y="30" font-size="11.5" font-weight="bold" fill="#065F46">${escapeXml(t.shifaNotice)}</text>
      <text class="font-base" x="0" y="50" font-size="10.5" fill="#64748B">${escapeXml(isBn ? 'সিস্টেম জেনারেটেড ডিজিটাল রিপোর্ট — রুকইয়াহ সাপোর্ট এন্ড কাপিং সেন্টার (ফেনী শাখা)' : 'System Generated Health Dossier — Ruqyah Support & Cupping Center (Feni Branch)')}</text>
    </g>
  </svg>
  `;

  return { svgContent, width, height, activeCategories };
}

/**
 * Builds high-resolution SVG and converts to PDF for Patient History Report
 */
async function generatePatientHistoryPdf(patient, history, diagnosis, lang = 'bn', options = {}) {
  const { svgContent, width, height, activeCategories } = buildPatientHistorySvg(patient, history, diagnosis, lang, options);
  const jpegBuf = await sharp(Buffer.from(svgContent)).jpeg({ quality: 92 }).toBuffer();
  
  const textEntries = [
    'RUQYAH SUPPORT & CUPPING CENTER',
    'PATIENT CLINICAL HISTORY REPORT',
    `Patient ID: ${patient.patient_id}`,
    `Full Name: ${patient.full_name}`,
    '9-CATEGORY CLINICAL DIAGNOSIS & SYMPTOMS'
  ];
  if (diagnosis && diagnosis.suicidal_ideation_flag === 1) {
    textEntries.push('URGENT CLINICAL ALERT: Suicidal ideation or self-harm reported.');
  }
  const isBn = lang === 'bn';
  if (!isBn) {
    for (const cat of activeCategories) {
      textEntries.push(cat.name_en);
      for (const s of cat.symptoms) {
        textEntries.push(s.name_en);
      }
    }
  }

  return packJpegToPdf(jpegBuf, width, height, textEntries);
}

/**
 * Generates high-resolution PNG or JPEG image for Patient History Report
 */
async function generatePatientHistoryImage(patient, history, diagnosis, lang = 'bn', options = {}) {
  const { svgContent } = buildPatientHistorySvg(patient, history, diagnosis, lang, options);
  const format = (options.format || 'png').toLowerCase();
  if (format === 'jpg' || format === 'jpeg') {
    return await sharp(Buffer.from(svgContent)).jpeg({ quality: 95 }).toBuffer();
  }
  return await sharp(Buffer.from(svgContent)).png({ compressionLevel: 8 }).toBuffer();
}

/**
 * Builds high-resolution SVG for Ruqyah Session Report
 */
function buildRuqyahSessionSvg(session, patient, lang = 'bn', options = {}) {
  const isBn = lang === 'bn';
  const width = 1240;
  const height = 1754;
  const logoBase64 = getLogoBase64();
  const notoFontBase64 = getNotoBengaliBase64();

  const t = {
    clinicName: isBn ? 'রুকইয়াহ সাপোর্ট এন্ড কাপিং সেন্টার' : 'RUQYAH SUPPORT & CUPPING CENTER',
    clinicSub: isBn ? 'ফেনী শাখা  |  ভূঁইয়া ম্যানশন, আদর্শ হাউজিং সোসাইটি, মহিপাল, ফেনী' : 'FENI BRANCH  |  Bhuya Mansion, Adarsha Housing Society, Mohipal, Feni',
    phoneRaqi: isBn ? 'হটলাইন / হোয়াটসঅ্যাপ: ০১৭৫৮-৩৫৪৯২০  |  পরিচালক ও প্রধান রাকি: মুহাম্মদুল্লাহ মিয়া' : 'Hotline / WhatsApp: 01758-354920  |  Lead Raqi: Muhammadullah Miah',
    reportTitle: (options.isShareable ? (isBn ? 'রোগী কপি — ' : 'PATIENT COPY — ') : '') + (isBn ? 'রুকইয়াহ শারঈয়্যাহ সেশন প্রেসক্রিপশন রিপোর্ট' : 'RUQYAH SESSION CLINICAL REPORT'),
    ref: isBn ? `সেশন আইডি: ${session.session_id}` : `Session Ref: ${session.session_id}`,
    date: isBn ? `তারিখ: ${toBengaliDigits(session.session_date)}` : `Date: ${session.session_date}`,
    sessionHeader: isBn ? `রুকইয়াহ সেশন #${toBengaliDigits(session.session_number)} বিবরণ` : `SESSION #${session.session_number} DETAILS`,
    pName: isBn ? 'রোগীর নাম' : 'Patient Name',
    pAgeGender: isBn ? 'বয়স / লিঙ্গ' : 'Age / Gender',
    status: isBn ? 'সেশন স্ট্যাটাস' : 'Session Status',
    nextFollowup: isBn ? 'পরবর্তী ফলোআপ তারিখ' : 'Next Followup Date',
    sec1: isBn ? '১. রোগীর প্রধান উপসর্গসমূহ' : '1. PATIENT\'S MAIN SYMPTOMS',
    sec2: isBn ? '২. তেলাওয়াত চলাকালীন রোগীর শারীরিক অবস্থা' : '2. PATIENT\'S PHYSICAL CONDITION DURING RECITATION',
    sec3: isBn ? '৩. রাকীর প্রাথমিক ডায়াগনোসিস' : '3. RAQI\'S PRELIMINARY DIAGNOSIS',
    sec4: isBn ? '৪. প্রেসক্রাইবকৃত আমল' : '4. PRESCRIBED AMAL',
    sec5: isBn ? '৫. রাকীর মন্তব্য' : '5. RAQI\'S COMMENTS',
    sec6: isBn ? '৬. বিশেষ নসিহত' : '6. SPECIAL ADVICE',
    shifaNotice: isBn
      ? 'শিফা ও পূর্ণ সুস্থতা কেবল মহান আল্লাহর পক্ষ থেকে। রুকইয়াহ শারঈয়্যাহ হলো কুরআন ও সুন্নাহ সম্মত চিকিৎসা পদ্ধতি।'
      : 'Healing (Shifa) belongs solely to Allah. Ruqyah is an authentic prophetic means rooted in the Qur\'an and Sunnah.',
    raqiSign: isBn ? 'মুহাম্মদুল্লাহ মিয়া' : 'Muhammadullah Miah',
    raqiTitle: isBn ? 'কনসালট্যান্ট রাকি ও সুন্নাহ প্র্যাকটিশনার' : 'Consultant Raqi & Sunnah Practitioner'
  };

  let svgContent = `
  <svg width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg">
    <defs>
      <style>
        ${notoFontBase64 ? `
        @font-face {
          font-family: 'Noto Sans Bengali';
          src: url('data:font/truetype;charset=utf-8;base64,${notoFontBase64}') format('truetype');
          font-weight: normal;
          font-style: normal;
        }
        ` : ''}
        @font-face {
          font-family: 'Noto Sans Bengali';
          src: local('Noto Sans Bengali'), local('Nirmala UI'), local('Vrinda'), local('SolaimanLipi'), local('Arial Unicode MS');
        }
        * {
          font-family: 'Noto Sans Bengali', Noto Sans Bengali, 'Nirmala UI', Nirmala UI, sans-serif;
        }
        .font-base {
          font-family: 'Noto Sans Bengali', Noto Sans Bengali, 'Nirmala UI', Nirmala UI, 'Vrinda', 'SolaimanLipi', 'Segoe UI', Arial, sans-serif;
        }
      </style>
    </defs>
    <rect width="100%" height="100%" fill="#FFFFFF" />
    
    <!-- Top Green Accent Bar -->
    <rect x="50" y="40" width="${width - 100}" height="10" fill="#0F5132" rx="3" />
    
    <!-- Header: Logo + Clinic Info -->
    <g transform="translate(50, 65)">
      ${logoBase64 ? `<image href="${logoBase64}" x="0" y="0" width="90" height="90" />` : ''}
      <g transform="translate(${logoBase64 ? '105' : '0'}, 25)">
        <text class="font-base" font-size="26" font-weight="bold" fill="#0F5132">${escapeXml(t.clinicName)}</text>
        <text class="font-base" font-size="14" fill="#4B5563" y="26">${escapeXml(t.clinicSub)}</text>
        <text class="font-base" font-size="13" fill="#059669" font-weight="600" y="48">${escapeXml(t.phoneRaqi)}</text>
      </g>
    </g>

    <!-- Badge Header Right -->
    <g transform="translate(840, 65)">
      <rect width="350" height="90" rx="8" fill="#ECFDF5" stroke="#A7F3D0" stroke-width="1.5" />
      <text class="font-base" x="20" y="32" font-size="14" font-weight="bold" fill="#065F46">${escapeXml(t.reportTitle)}</text>
      <text class="font-base" x="20" y="56" font-size="13" fill="#1E293B">${escapeXml(t.ref)}</text>
      <text class="font-base" x="20" y="76" font-size="12" fill="#64748B">${escapeXml(t.date)}</text>
    </g>

    <!-- Divider Line -->
    <line x1="50" y1="170" x2="${width - 50}" y2="170" stroke="#CBD5E1" stroke-width="1.5" />

    <!-- Session Meta Box -->
    <g transform="translate(50, 185)">
      <rect width="${width - 100}" height="105" rx="8" fill="#F8FAFC" stroke="#E2E8F0" stroke-width="1.5" />
      
      <rect x="0" y="0" width="${width - 100}" height="30" rx="8" fill="#F1F5F9" />
      <text class="font-base" x="20" y="20" font-size="13" font-weight="bold" fill="#0F5132">${escapeXml(t.sessionHeader)}</text>
      
      <!-- Row 1 -->
      <text class="font-base" x="20" y="55" font-size="12.5" fill="#64748B">${escapeXml(t.pName)}: <tspan font-weight="bold" fill="#0F172A">${escapeXml(patient.full_name)} (${escapeXml(patient.patient_id)})</tspan></text>
      <text class="font-base" x="480" y="55" font-size="12.5" fill="#64748B">${escapeXml(t.pAgeGender)}: <tspan font-weight="bold" fill="#0F172A">${isBn ? toBengaliDigits(patient.age) + ' বছর' : patient.age + ' Yrs'} / ${escapeXml(translateClinicalItem(patient.gender, isBn ? 'bn' : 'en'))}</tspan></text>
      <text class="font-base" x="800" y="55" font-size="12.5" fill="#64748B">${isBn ? 'সেশন তারিখ' : 'Date'}: <tspan font-weight="bold" fill="#064E3B">${isBn ? toBengaliDigits(session.session_date) : session.session_date}</tspan></text>
      
      <!-- Row 2 -->
      <text class="font-base" x="20" y="85" font-size="12.5" fill="#64748B">${isBn ? 'পরিচালক রাকি' : 'Conducting Raqi'}: <tspan font-weight="600" fill="#0F172A">${isBn ? 'মুহাম্মদুল্লাহ মিয়া' : 'Muhammadullah Miah'}</tspan></text>
      <text class="font-base" x="480" y="85" font-size="12.5" fill="#64748B">${escapeXml(t.status)}: <tspan font-weight="600" fill="#059669">${escapeXml(translateClinicalItem(session.status, isBn ? 'bn' : 'en'))}</tspan></text>
      <text class="font-base" x="800" y="85" font-size="12.5" fill="#64748B">${escapeXml(t.nextFollowup)}: <tspan font-weight="bold" fill="#D97706">${escapeXml(session.next_followup_date ? (isBn ? toBengaliDigits(session.next_followup_date) : session.next_followup_date) : (isBn ? 'নির্ধারিত হবে' : 'Pending'))}</tspan></text>
    </g>
  `;

  let currentY = 310;

  function renderSessionBox(title, items, isHighlight = false) {
    const parsedLines = [];
    for (const item of items) {
      const fullText = item.value || '';
      const wrapped = wrapText(fullText, 88);
      parsedLines.push({ label: item.label, lines: wrapped });
    }
    const totalLinesCount = parsedLines.reduce((acc, p) => acc + Math.max(p.lines.length, 1), 0);
    const boxHeight = 28 + (totalLinesCount * 20) + (items.length * 4);

    svgContent += `
      <g transform="translate(50, ${currentY})">
        <rect width="${width - 100}" height="${boxHeight}" rx="6" fill="${isHighlight ? '#FAFDFB' : '#FFFFFF'}" stroke="${isHighlight ? '#059669' : '#E2E8F0'}" stroke-width="1.2" />
        <rect x="0" y="0" width="${width - 100}" height="26" rx="6" fill="${isHighlight ? '#ECFDF5' : '#F8FAFC'}" />
        <rect x="0" y="0" width="4" height="26" fill="#059669" />
        <text class="font-base" x="16" y="18" font-size="12.5" font-weight="bold" fill="${isHighlight ? '#065F46' : '#0F5132'}">${escapeXml(title)}</text>
    `;
    let lineY = 46;
    for (const p of parsedLines) {
      if (p.lines.length === 0) {
        svgContent += `
          <text class="font-base" x="20" y="${lineY}" font-size="11.5" fill="#334155">
            <tspan font-weight="600" fill="#0F172A">${escapeXml(p.label)}:</tspan> -
          </text>
        `;
        lineY += 22;
      } else {
        svgContent += `
          <text class="font-base" x="20" y="${lineY}" font-size="11.5" fill="#334155">
            <tspan font-weight="600" fill="#0F172A">${escapeXml(p.label)}:</tspan> ${escapeXml(p.lines[0])}
          </text>
        `;
        lineY += 20;
        for (let i = 1; i < p.lines.length; i++) {
          svgContent += `
            <text class="font-base" x="35" y="${lineY}" font-size="11" fill="#475569">${escapeXml(p.lines[i])}</text>
          `;
          lineY += 19;
        }
        lineY += 4;
      }
    }
    svgContent += `</g>`;
    currentY += boxHeight + 14;
  }

  // SECTION 1: Patient's Main Symptoms
  const mainSymptomsText = session.patient_main_symptoms || session.reported_symptoms || session.initial_assessment || (isBn ? 'কোনো প্রধান উপসর্গ লিপিবদ্ধ করা হয়নি।' : 'No chief complaints recorded.');
  renderSessionBox(t.sec1, [
    { label: isBn ? 'প্রধান উপসর্গ বিবরণ' : 'Reported Symptoms', value: translateClinicalItem(mainSymptomsText, isBn ? 'bn' : 'en') }
  ]);

  // SECTION 2: Patient's Physical Condition During Recitation
  const reactionsList = parseList(session.observed_reactions);
  const formattedReactions = reactionsList.length > 0 
    ? reactionsList.map(r => translateClinicalItem(r, isBn ? 'bn' : 'en')).join(', ') 
    : (isBn ? 'তিলাওয়াতকালে কোনো অস্বাভাবিক শারীরিক প্রতিক্রিয়া দেখা যায়নি।' : 'No abnormal physical reaction observed.');
  const physObsText = session.physical_observations || session.raqi_observations || '';
  const sec2Items = [
    { label: isBn ? 'পর্যবেক্ষণকৃত শারীরিক প্রতিক্রিয়া' : 'Observed Physical Reactions', value: formattedReactions }
  ];
  if (physObsText && physObsText.trim()) {
    sec2Items.push({
      label: isBn ? 'অতিরিক্ত শারীরিক পর্যবেক্ষণ' : 'Additional Observations',
      value: translateClinicalItem(physObsText, isBn ? 'bn' : 'en')
    });
  }
  renderSessionBox(t.sec2, sec2Items);

  // SECTION 3: Raqi's Preliminary Diagnosis (Highlighted)
  let diagList = parseList(session.manual_diagnosis);
  if (diagList.length === 0 && session.assessment_category) {
    diagList = session.assessment_category.split(',').map(d => d.trim()).filter(Boolean);
  }
  const formattedDiagnosis = diagList.length > 0
    ? diagList.map(d => translateClinicalItem(d, isBn ? 'bn' : 'en')).join(', ')
    : (isBn ? 'ক্লিনিক্যাল পর্যবেক্ষণে রয়েছে' : 'Under Clinical Evaluation');
  renderSessionBox(t.sec3, [
    { label: isBn ? 'শারঈ ডায়াগনোসিস' : 'Diagnostic Classification', value: formattedDiagnosis }
  ], true);

  // SECTION 4: Prescribed Amal
  const amalText = session.prescribed_amal || (typeof session.prescribed_remedies === 'string' && !session.prescribed_remedies.startsWith('[') ? session.prescribed_remedies : '') || (isBn ? 'নির্দিষ্ট কোনো আমল প্রেসক্রাইব করা হয়নি।' : 'No prescribed amal recorded.');
  renderSessionBox(t.sec4, [
    { label: isBn ? 'প্রেসক্রাইবকৃত আমল' : 'Prescribed Amal', value: translateClinicalItem(amalText, isBn ? 'bn' : 'en') }
  ]);

  // SECTION 5: Raqi's Comments
  const commentsText = session.raqi_comments || session.professional_assessment || (isBn ? 'কোনো অতিরিক্ত মন্তব্য নেই।' : 'No additional comments recorded.');
  renderSessionBox(t.sec5, [
    { label: isBn ? 'রাকীর মন্তব্য ও পর্যবেক্ষণ' : 'Raqi\'s Clinical Comments', value: translateClinicalItem(commentsText, isBn ? 'bn' : 'en') }
  ]);

  // SECTION 6: Special Advice
  const adviceText = session.special_advice || session.recommendations || (isBn ? 'পাঁচ ওয়াক্ত সালাত জামাতের সাথে আদায় ও নিয়মিত সকাল-সন্ধ্যার জিকির পালন।' : 'Maintain congregational prayers and regular morning and evening Adhkar.');
  renderSessionBox(t.sec6, [
    { label: isBn ? 'বিশেষ নসিহত ও দিকনির্দেশনা' : 'Special Advice & Guidance', value: translateClinicalItem(adviceText, isBn ? 'bn' : 'en') }
  ]);

  // Dynamic Footer Positioning
  const footerY = Math.max(currentY + 20, 1560);
  svgContent += `
    <g transform="translate(50, ${footerY})">
      <line x1="0" y1="0" x2="${width - 100}" y2="0" stroke="#CBD5E1" stroke-width="1.5" />
      
      <g transform="translate(540, 15)">
        <rect width="240" height="90" rx="4" fill="#F8FAFC" stroke="#CBD5E1" stroke-width="1" stroke-dasharray="4" />
        <text class="font-base" x="120" y="50" font-size="12" fill="#94A3B8" text-anchor="middle">${isBn ? '[ অফিসিয়াল সিল ]' : '[ CLINIC OFFICIAL SEAL ]'}</text>
      </g>

      <g transform="translate(850, 15)">
        <text class="font-base" x="160" y="32" font-size="20" font-style="italic" fill="#0F5132" text-anchor="middle">${escapeXml(t.raqiSign)}</text>
        <line x1="40" y1="42" x2="280" y2="42" stroke="#0F5132" stroke-width="1.5" />
        <text class="font-base" x="160" y="60" font-size="13" font-weight="bold" fill="#0F172A" text-anchor="middle">${escapeXml(t.raqiSign)}</text>
        <text class="font-base" x="160" y="78" font-size="11.5" fill="#64748B" text-anchor="middle">${escapeXml(t.raqiTitle)}</text>
      </g>

      <text class="font-base" x="${(width - 100) / 2}" y="125" font-size="11.5" fill="#94A3B8" text-anchor="middle">${escapeXml(t.shifaNotice)}</text>
    </g>
  </svg>
  `;

  const totalHeight = Math.max(height, footerY + 160);
  if (totalHeight > height) {
    svgContent = svgContent.replace(`height="${height}"`, `height="${totalHeight}"`);
  }

  return { svgContent, width, height: totalHeight };
}

/**
 * Builds high-resolution SVG and converts to PDF for Ruqyah Session Report
 */
async function generateRuqyahSessionPdf(session, patient, lang = 'bn', options = {}) {
  const { svgContent, width, height } = buildRuqyahSessionSvg(session, patient, lang, options);
  const jpegBuf = await sharp(Buffer.from(svgContent)).jpeg({ quality: 95 }).toBuffer();
  const isBn = lang === 'bn';
  const textEntries = isBn ? [] : [
    'RUQYAH SUPPORT & CUPPING CENTER',
    'RUQYAH SESSION CLINICAL REPORT',
    `Session ID: ${session.session_id}`,
    `Patient: ${patient.full_name} (${patient.patient_id})`,
    `Classification: ${session.assessment_category || ''}`,
    session.professional_assessment || ''
  ];
  return packJpegToPdf(jpegBuf, width, height, textEntries);
}

/**
 * Generates high-resolution PNG or JPEG image for Ruqyah Session Report
 */
async function generateRuqyahSessionImage(session, patient, lang = 'bn', options = {}) {
  const { svgContent } = buildRuqyahSessionSvg(session, patient, lang, options);
  const format = (options.format || 'png').toLowerCase();
  if (format === 'jpg' || format === 'jpeg') {
    return await sharp(Buffer.from(svgContent)).jpeg({ quality: 95 }).toBuffer();
  }
  return await sharp(Buffer.from(svgContent)).png({ compressionLevel: 8 }).toBuffer();
}

module.exports = {
  generatePatientHistoryPdf,
  generatePatientHistoryImage,
  generateRuqyahSessionPdf,
  generateRuqyahSessionImage,
  buildPatientHistorySvg,
  buildRuqyahSessionSvg
};
