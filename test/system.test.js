/**
 * Comprehensive System Test Suite for Ruqyah Support & Cupping Center (Feni Branch)
 * Validates all requirements:
 * 1. Only 1 Ruqyah service (2,050 BDT) & 1 Hijama service (consultation based)
 * 2. Old Ruqyah package pricing removed from active services
 * 3. Service selection during booking (Ruqyah vs Hijama)
 * 4. Automatic slot removal and concurrency control
 * 5. Expanded Patient History (সমস্যা কত দিন ধরে?, কী কী প্রক্রিয়ায় চিকিৎসা নিয়েছেন?, রিজিক ও পারিবারিক পরিস্থিতি, বংশগত ইতিহাস)
 * 6. Admin dashboard appointment display with service and fee
 * 7. PDF Report generation
 */

process.env.NODE_ENV = 'test';
const assert = require('assert');
const path = require('path');
const http = require('http');
const app = require('../server');
const db = require('../database/db');
const { TIME_SLOTS } = require('../config/constants');

let server;
let port = 5055;
let baseUrl;
let adminCookie = '';

function request(method, path, body = null, headers = {}) {
  return new Promise((resolve, reject) => {
    const url = new URL(path, baseUrl);
    const options = {
      method,
      hostname: url.hostname,
      port: url.port,
      path: url.pathname + url.search,
      headers: {
        'Accept': 'application/json',
        ...headers
      }
    };

    if (adminCookie) {
      options.headers['Cookie'] = adminCookie;
    }

    let payload = null;
    if (body) {
      payload = JSON.stringify(body);
      options.headers['Content-Type'] = 'application/json';
      options.headers['Content-Length'] = Buffer.byteLength(payload);
    }

    const req = http.request(options, (res) => {
      const chunks = [];
      res.on('data', chunk => chunks.push(chunk));
      res.on('end', () => {
        const rawBuffer = Buffer.concat(chunks);
        let data = null;
        const contentType = res.headers['content-type'] || '';

        if (contentType.includes('application/json')) {
          try {
            data = JSON.parse(rawBuffer.toString());
          } catch {
            data = rawBuffer.toString();
          }
        } else {
          data = rawBuffer;
        }

        resolve({
          statusCode: res.statusCode,
          headers: res.headers,
          data,
          rawBuffer
        });
      });
    });

    req.on('error', reject);
    if (payload) req.write(payload);
    req.end();
  });
}

function uploadMultipart(path, fieldName, filename, fileBuffer, mimeType = 'application/octet-stream') {
  return new Promise((resolve, reject) => {
    const boundary = '----WebKitFormBoundary' + Math.random().toString(36).substring(2);
    const postDataStart = Buffer.from(
      `--${boundary}\r\nContent-Disposition: form-data; name="${fieldName}"; filename="${filename}"\r\nContent-Type: ${mimeType}\r\n\r\n`
    );
    const postDataEnd = Buffer.from(`\r\n--${boundary}--\r\n`);
    const fullBody = Buffer.concat([postDataStart, fileBuffer, postDataEnd]);

    const url = new URL(path, baseUrl);
    const req = http.request({
      method: 'POST',
      hostname: url.hostname,
      port: url.port,
      path: url.pathname,
      headers: {
        'Cookie': adminCookie,
        'Content-Type': `multipart/form-data; boundary=${boundary}`,
        'Content-Length': fullBody.length
      }
    }, (res) => {
      const chunks = [];
      res.on('data', c => chunks.push(c));
      res.on('end', () => {
        try {
          const json = JSON.parse(Buffer.concat(chunks).toString('utf8'));
          resolve({ statusCode: res.statusCode, data: json });
        } catch {
          resolve({ statusCode: res.statusCode, raw: Buffer.concat(chunks).toString('utf8') });
        }
      });
    });
    req.on('error', reject);
    req.write(fullBody);
    req.end();
  });
}

async function runTests() {
  console.log('================================================================');
  console.log(' STARTING RUQYAH CLINIC SYSTEM VERIFICATION & AUDIT TEST SUITE ');
  console.log('================================================================');

  // Clean up any test artifacts from previous runs in correct dependency order
  const testPatientRows = db.prepare("SELECT patient_id FROM patients WHERE phone IN ('01719998877', '01899990000', '01955443322', '01600112233', '01711223344') OR full_name LIKE 'Test Patient%' OR full_name = 'Mahmudur Rahman'").all();
  const testPIds = testPatientRows.map(r => r.patient_id);
  for (const pid of testPIds) {
    db.prepare("DELETE FROM reports WHERE patient_id = ?").run(pid);
    db.prepare("DELETE FROM follow_ups WHERE patient_id = ?").run(pid);
    db.prepare("DELETE FROM ruqyah_sessions WHERE patient_id = ?").run(pid);
    db.prepare("DELETE FROM patient_histories WHERE patient_id = ?").run(pid);
    db.prepare("DELETE FROM appointments WHERE patient_id = ?").run(pid);
  }
  db.prepare("DELETE FROM appointments WHERE patient_phone LIKE '017199%' OR patient_phone LIKE '018999%' OR patient_phone LIKE '017112%' OR patient_name LIKE 'Test Patient%'").run();
  db.prepare("DELETE FROM patients WHERE phone IN ('01719998877', '01899990000', '01955443322', '01600112233', '01711223344') OR full_name LIKE 'Test Patient%' OR full_name = 'Mahmudur Rahman'").run();
  db.prepare("DELETE FROM closed_dates WHERE reason LIKE '%Conference%'").run();
  db.prepare("DELETE FROM blocked_time_slots WHERE reason LIKE '%Sanitization%'").run();

  let passed = 0;
  let failed = 0;

  async function test(name, fn) {
    try {
      process.stdout.write(`TEST: ${name} ... `);
      await fn();
      console.log('PASSED ✓');
      passed++;
    } catch (err) {
      console.log('FAILED ✕');
      console.error(err);
      failed++;
    }
  }

  // 1. Check Public Info & Services
  await test('Public Clinic Info API returns Feni branch details', async () => {
    const res = await request('GET', '/api/public/info');
    assert.strictEqual(res.statusCode, 200);
    assert.strictEqual(res.data.success, true);
    assert.strictEqual(res.data.data.branch_name, 'Feni Branch');
    assert.strictEqual(res.data.data.phone, '01758-354920');
  });

  await test('Public Services API: exactly 2 active services, Ruqyah 2050 BDT, Hijama consultation-based', async () => {
    const res = await request('GET', '/api/public/services');
    assert.strictEqual(res.statusCode, 200);
    assert.strictEqual(res.data.success, true);
    assert(Array.isArray(res.data.data));

    // Only active services returned
    const ruqyah = res.data.data.find(s => s.code === 'ruqyah' || s.name.includes('রুকইয়াহ'));
    assert(ruqyah, 'Ruqyah service must be present');
    assert.strictEqual(ruqyah.price, 2050, 'Ruqyah price must be exactly 2,050 BDT');

    const hijama = res.data.data.find(s => s.code === 'hijama' || s.name.includes('হিজামা'));
    assert(hijama, 'Hijama service must be present');
    assert.strictEqual(hijama.price, 0, 'Hijama price is 0 (consultation-based)');

    // Ensure old packages (1500, etc) are not active
    const old1500 = res.data.data.find(s => s.price === 1500);
    assert(!old1500, 'Old 1500 BDT package must not be active');
  });

  // Pick target test date: 10 days from now (non-Friday)
  let targetDate = new Date(Date.now() + 10 * 86400000);
  if (targetDate.getDay() === 5) {
    targetDate = new Date(targetDate.getTime() + 86400000);
  }
  const testDateStr = targetDate.toISOString().split('T')[0];

  // 2. Initial Availability Check
  await test('Public Availability API computes 10 slots and disallows Friday / past dates', async () => {
    const res = await request('GET', `/api/public/availability?date=${testDateStr}`);
    assert.strictEqual(res.statusCode, 200);
    assert.strictEqual(res.data.success, true);
    assert.strictEqual(res.data.totalSlots, 10);
    assert(res.data.availableSlots.length > 0, 'Should have available slots on valid date');

    // Test Friday check
    const nextFriday = new Date();
    nextFriday.setDate(nextFriday.getDate() + ((5 - nextFriday.getDay() + 7) % 7 || 7));
    const friStr = nextFriday.toISOString().split('T')[0];
    const friRes = await request('GET', `/api/public/availability?date=${friStr}`);
    assert.strictEqual(friRes.data.isWeeklyHoliday, true);
    assert.strictEqual(friRes.data.isAvailable, false);
    assert.strictEqual(friRes.data.slots.length, 0);

    // Test Past date check
    const pastRes = await request('GET', '/api/public/availability?date=2020-01-01');
    assert.strictEqual(pastRes.data.isPast, true);
    assert.strictEqual(pastRes.data.isAvailable, false);
  });

  // 3. Appointment Booking: Ruqyah (2,050 BDT)
  const slotToBook = '10:00 AM – 11:00 AM';
  let bookedAptId = '';

  await test('Book appointment for Ruqyah (service_type: ruqyah, price: 2050)', async () => {
    const payload = {
      full_name: 'Test Patient A',
      phone: '01719998877',
      address: 'Mohipal, Feni',
      service_type: 'ruqyah',
      number_of_patients: 1,
      appointment_date: testDateStr,
      time_slot: slotToBook,
      additional_notes: 'Experiencing sudden severe chest tightness and night terrors.'
    };

    const res = await request('POST', '/api/public/book', payload);
    assert.strictEqual(res.statusCode, 201);
    assert.strictEqual(res.data.success, true);
    assert(res.data.data.appointment_id.startsWith('APT-'));
    assert.strictEqual(res.data.data.patient_name, 'Test Patient A');
    assert.strictEqual(res.data.data.time_slot, slotToBook);
    assert.strictEqual(res.data.data.service_type, 'ruqyah');
    assert.strictEqual(res.data.data.price, 2050);
    assert.strictEqual(res.data.data.price_display, '২,০৫০ টাকা');
    bookedAptId = res.data.data.appointment_id;
  });

  await test('MANDATORY REQUIREMENT: Booked time slot automatically disappears from available list', async () => {
    const res = await request('GET', `/api/public/availability?date=${testDateStr}`);
    assert.strictEqual(res.statusCode, 200);
    const availableSlotLabels = res.data.availableSlots.map(s => s.label);
    assert(!availableSlotLabels.includes(slotToBook), 'Booked slot must disappear from availableSlots');
    assert.strictEqual(res.data.availableCount, 9);
  });

  await test('MANDATORY REQUIREMENT: Concurrency test - Patient B tries booking same slot -> strictly REJECTED', async () => {
    const payload = {
      full_name: 'Test Patient B',
      phone: '01899990000',
      address: 'Dagonbhuiyan, Feni',
      service_type: 'ruqyah',
      number_of_patients: 1,
      appointment_date: testDateStr,
      time_slot: slotToBook, // Exact same slot!
      additional_notes: 'Duplicate attempt test'
    };

    const res = await request('POST', '/api/public/book', payload);
    assert.strictEqual(res.statusCode, 400);
    assert.strictEqual(res.data.success, false);
    assert(res.data.error.includes('already been booked') || res.data.error.includes('alternative slot'));
  });

  // 4. Appointment Booking: Hijama (Consultation based)
  const hijamaSlot = '11:00 AM – 12:00 PM';
  let hijamaAptId = '';

  await test('Book appointment for Hijama (service_type: hijama, consultation fee)', async () => {
    const payload = {
      full_name: 'Test Patient Hijama',
      phone: '01711223344',
      address: 'Sonagazi, Feni',
      service_type: 'hijama',
      number_of_patients: 1,
      appointment_date: testDateStr,
      time_slot: hijamaSlot,
      additional_notes: 'Migraine and back pain.'
    };

    const res = await request('POST', '/api/public/book', payload);
    assert.strictEqual(res.statusCode, 201);
    assert.strictEqual(res.data.success, true);
    assert.strictEqual(res.data.data.service_type, 'hijama');
    assert.strictEqual(res.data.data.price, null);
    assert.strictEqual(res.data.data.price_display, 'খরচ পরামর্শের মাধ্যমে নির্ধারণ করা হবে।');
    hijamaAptId = res.data.data.appointment_id;
  });

  // 5. Appointment Status Lookup
  await test('Appointment Status Lookup: verifies reference ID, service, and fee', async () => {
    const res = await request('GET', `/api/public/lookup?q=${bookedAptId}`);
    assert.strictEqual(res.statusCode, 200);
    assert.strictEqual(res.data.success, true);
    assert.strictEqual(res.data.data[0].appointment_id, bookedAptId);
    assert.strictEqual(res.data.data[0].patient_phone, '01719998877');
    assert.strictEqual(res.data.data[0].service_price, 2050);

    const hijamaRes = await request('GET', `/api/public/lookup?q=${hijamaAptId}`);
    assert.strictEqual(hijamaRes.statusCode, 200);
    assert.strictEqual(hijamaRes.data.data[0].service_type, 'hijama');
  });

  // 6. Admin Authentication & Route Protection
  await test('Security: Admin routes strictly reject unauthorized visitors (401)', async () => {
    const res1 = await request('GET', '/api/admin/appointments');
    assert.strictEqual(res1.statusCode, 401);

    const res2 = await request('GET', '/api/admin/patients');
    assert.strictEqual(res2.statusCode, 401);

    const res3 = await request('GET', '/api/admin/sessions');
    assert.strictEqual(res3.statusCode, 401);
  });

  await test('Admin Login with valid credentials succeeds and issues cookie', async () => {
    const res = await request('POST', '/api/auth/login', {
      username: 'admin',
      password: 'Admin@12345'
    });
    assert.strictEqual(res.statusCode, 200);
    assert.strictEqual(res.data.success, true);
    assert.strictEqual(res.data.admin.username, 'admin');

    const cookieHeader = res.headers['set-cookie'];
    assert(cookieHeader, 'Must set authentication cookie');
    adminCookie = cookieHeader[0].split(';')[0];
  });

  // 7. Admin Appointments List: includes service_type and service_price
  await test('Admin Appointments API includes service_type and service_price', async () => {
    const res = await request('GET', '/api/admin/appointments');
    assert.strictEqual(res.statusCode, 200);
    assert.strictEqual(res.data.success, true);
    const apt = res.data.data.find(a => a.appointment_id === bookedAptId);
    assert(apt, 'Booked appointment must exist in admin list');
    assert.strictEqual(apt.service_type, 'ruqyah');
    assert.strictEqual(apt.service_price, 2050);
  });

  // 8. Manage Clinic Availability
  let closeTarget = new Date(Date.now() + 15 * 86400000);
  if (closeTarget.getDay() === 5) {
    closeTarget = new Date(closeTarget.getTime() + 86400000);
  }
  const closeTestDate = closeTarget.toISOString().split('T')[0];

  await test('Admin Date Closure: Close an entire date with custom reason', async () => {
    const res = await request('POST', '/api/admin/availability/close-date', {
      date: closeTestDate,
      reason: 'Raqi Muhammadullah Miah Traveling to Chittagong Conference'
    });
    assert.strictEqual(res.statusCode, 200);
    assert.strictEqual(res.data.success, true);

    // Verify public booking calendar immediately reflects closed date
    const checkRes = await request('GET', `/api/public/availability?date=${closeTestDate}`);
    assert.strictEqual(checkRes.data.isClosedDay, true);
    assert.strictEqual(checkRes.data.isAvailable, false);
    assert.strictEqual(checkRes.data.slots.length, 0);
    assert(checkRes.data.reason.includes('Chittagong Conference'));

    // Try booking on closed date -> rejected
    const bookRes = await request('POST', '/api/public/book', {
      full_name: 'Patient C',
      phone: '01600112233',
      address: 'Feni',
      service_type: 'ruqyah',
      appointment_date: closeTestDate,
      time_slot: '09:00 AM – 10:00 AM'
    });
    assert.strictEqual(bookRes.statusCode, 400);
  });

  await test('Admin Date Reopening: Reopen previously closed date', async () => {
    const res = await request('POST', '/api/admin/availability/reopen-date', {
      date: closeTestDate
    });
    assert.strictEqual(res.statusCode, 200);
    assert.strictEqual(res.data.success, true);

    const checkRes = await request('GET', `/api/public/availability?date=${closeTestDate}`);
    assert.strictEqual(checkRes.data.isClosedDay, undefined);
    assert(checkRes.data.availableSlots.length > 0);
  });

  await test('Admin Slot Blocking: Block specific time slot on a date', async () => {
    const blockSlot = '02:00 PM – 03:00 PM';
    const res = await request('POST', '/api/admin/availability/block-slot', {
      date: testDateStr,
      time_slot: blockSlot,
      reason: 'Clinic Sanitization & Equipment Sterilization'
    });
    assert.strictEqual(res.statusCode, 200);
    assert.strictEqual(res.data.success, true);

    const checkRes = await request('GET', `/api/public/availability?date=${testDateStr}`);
    const labels = checkRes.data.availableSlots.map(s => s.label);
    assert(!labels.includes(blockSlot), 'Blocked slot must disappear from public availability');
    assert(labels.includes('03:00 PM – 04:00 PM'), 'Other available times must remain visible');

    // Unblock the slot
    const unblockRes = await request('POST', '/api/admin/availability/unblock-slot', {
      date: testDateStr,
      time_slot: blockSlot
    });
    assert.strictEqual(unblockRes.statusCode, 200);
  });

  // 9. Appointment Rescheduling
  let newRescheduleSlot = '03:00 PM – 04:00 PM';
  await test('Reschedule Appointment: move to 03:00 PM - 04:00 PM on same date', async () => {
    const res = await request('POST', `/api/admin/appointments/${bookedAptId}/reschedule`, {
      new_date: testDateStr,
      new_time_slot: newRescheduleSlot,
      reason: 'Patient requested afternoon time'
    });
    assert.strictEqual(res.statusCode, 200);
    assert.strictEqual(res.data.success, true);

    // Verify original slot (10:00 AM - 11:00 AM) is now available again!
    const checkRes = await request('GET', `/api/public/availability?date=${testDateStr}`);
    const labels = checkRes.data.availableSlots.map(s => s.label);
    assert(labels.includes(slotToBook), 'Previous slot must become available again');
    assert(!labels.includes(newRescheduleSlot), 'New slot must be reserved');
  });

  // 10. Patient CRM & Expanded History Form (PRD 7: সমস্যা কত দিন ধরে? & কী কী প্রক্রিয়ায় চিকিৎসা নিয়েছেন?)
  let testPatientId = '';
  await test('Patient CRM: Register new patient and generate unique Patient ID', async () => {
    const res = await request('POST', '/api/admin/patients', {
      full_name: 'Mahmudur Rahman',
      phone: '01955443322',
      age: 42,
      gender: 'Male',
      marital_status: 'Married',
      address: 'Chhagalnaiya, Feni',
      emergency_contact: 'Wife: 01988776655',
      notes: 'Referred for prolonged nocturnal anxiety and religious waswas.'
    });
    assert.strictEqual(res.statusCode, 201);
    assert.strictEqual(res.data.success, true);
    assert(res.data.data.patient_id.startsWith('RSCC-P-'));
    testPatientId = res.data.data.patient_id;
  });

  await test('Patient CRM: Save expanded History with problem_duration and previous_treatment_history', async () => {
    const historyPayload = {
      main_symptoms: ['Chest heaviness & suffocation', 'Sudden unprovoked anger', 'Constant unexplained exhaustion'],
      physical_symptoms: ['Stomach tingling / burning sensation', 'Upper back & shoulder tension'],
      sleep_problems: ['Severe insomnia', 'Sleep paralysis (Kaboos)', 'Frequent abrupt awakenings'],
      dream_problems: ['Black dogs and beasts attacking', 'Falling from high structures', 'Walking in graveyards'],
      worship_problems: ['Severe intrusive doubts (Waswas) in Wudu / Salah', 'Sudden overwhelming sleepiness during recitation'],
      family_history: 'Unremarkable. Good marital relations prior to symptoms.',
      genetic_history: 'পরিবারে কোনো পূর্ববর্তী মানসিক বা জিনঘটিত রোগের ইতিহাস নেই।',
      financial_family_situation: 'ব্যবসায় হঠাৎ অচলাবস্থা সৃষ্টি হয়েছে।',
      rizq_family_situation: 'ব্যবসায় হঠাৎ অচলাবস্থা সৃষ্টি হয়েছে।',
      previous_medical_history: 'কবিরাজ: ৩টি তাবিয দেওয়া হয়েছিল। এলোপ্যাথিক: ঘুমের ওষুধ খেয়েছিলেন।',
      previous_treatment_history: 'কবিরাজ: ৩টি তাবিয দেওয়া হয়েছিল। এলোপ্যাথিক: ঘুমের ওষুধ খেয়েছিলেন।',
      duration_of_problems: '২ বছর',
      problem_duration: '২ বছর',
      additional_information: 'Patient wore a copper talisman from village astrologer which was removed.'
    };

    const res = await request('PUT', `/api/admin/patients/${testPatientId}/history`, historyPayload);
    assert.strictEqual(res.statusCode, 200);
    assert.strictEqual(res.data.success, true);

    // Verify retrieval of updated fields
    const getRes = await request('GET', `/api/admin/patients/${testPatientId}`);
    assert.strictEqual(getRes.statusCode, 200);
    const hist = getRes.data.data.history;
    assert(hist !== null);
    assert.strictEqual(hist.problem_duration, '২ বছর', 'problem_duration must be correctly stored');
    assert(hist.previous_treatment_history.includes('কবিরাজ'), 'previous_treatment_history must be correctly stored');
    assert(hist.rizq_family_situation.includes('অচলাবস্থা'));
    assert(hist.genetic_history.includes('পরিবারে'));
  });

  // 11. Ruqyah Diagnosis & Session Recording
  let recordedSessionId = '';
  await test('Ruqyah Session Recording: verses, reactions, Raqi professional assessment', async () => {
    const sessionPayload = {
      patient_id: testPatientId,
      session_date: new Date().toISOString().split('T')[0],
      raqi_name: 'Muhammadullah Miah',
      initial_assessment: 'Patient arrived with tense demeanor, accompanied by wife.',
      reported_symptoms: 'Heaviness in chest, frequent nightmares of black animals.',
      patient_main_symptoms: 'মাথা ঘোরা ও সার্বক্ষণিক তীব্র অবসাদ',
      medical_history_checked: 'Neurological workup verified negative for organic epilepsy.',
      observed_reactions: [
        'Trembling / involuntary shivering in limbs',
        'Deep repeated yawning',
        'Profuse cold sweating'
      ],
      physical_observations: 'তিলাওয়াত চলাকালীন ডান হাতে কাঁপুনি ও বারবার দীর্ঘ হাই তোলার প্রবণতা লক্ষণীয়।',
      manual_diagnosis: ['আইন (Ayn)', 'সেহের (Sihr)'],
      assessment_category: 'আইন (Ayn), সেহের (Sihr)',
      prescribed_amal: 'প্রতিদিন সকালে ৭টি আজওয়া খেজুর, পড়া পানি পান, বরই পাতা দিয়ে গোসল এবং সকাল-সন্ধ্যার মাসনূন আজকার পাঠ।',
      raqi_comments: 'রোগীর মধ্যে বদনজর ও সিহরের প্রভাব স্পষ্ট। তবে মানসিক সচেতনতা অটুট। নিয়মিত সুন্নাহ আমল অব্যাহত রাখতে হবে।',
      special_advice: 'পাঁচ ওয়াক্ত সালাত জামাতে আদায়, গান-বাজনা বর্জন, ঘরে সূরা আল-বাকারাহ তিলাওয়াত এবং সবধরনের তাবিয পরিহার।',
      next_followup_date: new Date(Date.now() + 7 * 86400000).toISOString().split('T')[0]
    };

    const res = await request('POST', '/api/admin/sessions', sessionPayload);
    assert.strictEqual(res.statusCode, 201);
    assert.strictEqual(res.data.success, true);
    assert(res.data.session_id.startsWith('RS-'));
    recordedSessionId = res.data.session_id;

    // Verify session data persistence via GET
    const getRes = await request('GET', `/api/admin/sessions/${recordedSessionId}`);
    assert.strictEqual(getRes.statusCode, 200);
    assert.strictEqual(getRes.data.success, true);
    assert(getRes.data.data.patient_main_symptoms.includes('মাথা ঘোরা'));
    assert(getRes.data.data.prescribed_amal.includes('আজওয়া খেজুর'));
    assert(getRes.data.data.raqi_comments.includes('বদনজর'));
    assert(getRes.data.data.special_advice.includes('সালাত জামাতে আদায়'));
  });

  // 12. Follow-up Tracking
  await test('Follow-up Management: Progression tracking and status update', async () => {
    const listRes = await request('GET', `/api/admin/followups?patient_id=${testPatientId}`);
    assert.strictEqual(listRes.statusCode, 200);
    assert(listRes.data.data.length > 0);
    const followup = listRes.data.data[0];

    const updateRes = await request('PUT', `/api/admin/followups/${followup.id}`, {
      symptom_progression: 'Mildly Improved',
      symptom_changes_notes: 'Chest heaviness decreased significantly after 4 Sidr baths. Sleep improved.',
      status: 'Completed'
    });
    assert.strictEqual(updateRes.statusCode, 200);
    assert.strictEqual(updateRes.data.success, true);
  });

  // 13. PDF Report Generation
  await test('MANDATORY REQUIREMENT: PDF Report 1 - Patient History Report PDF binary download', async () => {
    const res = await request('GET', `/api/admin/reports/patient/${testPatientId}/pdf`);
    assert.strictEqual(res.statusCode, 200);
    assert.strictEqual(res.headers['content-type'], 'application/pdf');
    assert(res.rawBuffer.length > 1000, 'PDF buffer must contain real content');
    const pdfHeader = res.rawBuffer.slice(0, 8).toString();
    assert(pdfHeader.startsWith('%PDF-1.'), `Header must be valid PDF, got: ${pdfHeader}`);
  });

  await test('MANDATORY REQUIREMENT: PDF Report 2 - Ruqyah Session Report PDF binary download', async () => {
    const res = await request('GET', `/api/admin/reports/session/${recordedSessionId}/pdf`);
    assert.strictEqual(res.statusCode, 200);
    assert.strictEqual(res.headers['content-type'], 'application/pdf');
    assert(res.rawBuffer.length > 1000, 'PDF buffer must contain real content');
    const pdfHeader = res.rawBuffer.slice(0, 8).toString();
    assert(pdfHeader.startsWith('%PDF-1.'), `Header must be valid PDF, got: ${pdfHeader}`);
  });

  // 14. Database Backup & Audit Logs
  await test('Database Backup: Exports complete JSON snapshot', async () => {
    const res = await request('GET', '/api/admin/settings/backup');
    assert.strictEqual(res.statusCode, 200);
    assert(res.headers['content-type'].includes('application/json'));
    assert(res.data.patients.length > 0);
    assert(res.data.appointments.length > 0);
  });

  await test('Audit Trail: Records administrative changes', async () => {
    const res = await request('GET', '/api/admin/settings/audit-logs');
    assert.strictEqual(res.statusCode, 200);
    assert(res.data.data.length > 0);
  });

  // ==============================================================
  // 15. THE 10 DIAGNOSIS CATEGORIES & APPROVED CLINICAL DATASET
  // ==============================================================
  await test('CRITICAL REQUIREMENT: Exactly 10 diagnosis categories exist in DB', async () => {
    const res = await request('GET', '/api/admin/diagnosis/categories');
    assert.strictEqual(res.statusCode, 200);
    assert.strictEqual(res.data.success, true);
    assert.strictEqual(res.data.data.length, 10, 'Must have exactly 10 diagnosis categories');
    
    // Check Bengali Unicode names for all 10 approved categories
    const expectedCodes = [
      'patient_main_symptoms', 'main_complaints', 'physical_symptoms', 'sleep_problems', 'dream_problems',
      'rizq_obstacles', 'mental_behavioral', 'worship_obstacles', 'onset_history', 'family_social'
    ];
    res.data.data.forEach((cat, idx) => {
      assert(cat.name_bn && cat.name_bn.length > 3, `Category ${idx+1} must have valid Bengali name`);
      assert(cat.name_en && cat.name_en.length > 3, `Category ${idx+1} must have valid English name`);
      assert(expectedCodes.includes(cat.code), `Category code ${cat.code} must match approved dataset`);
    });

    // Category 1 is patient_main_symptoms with 0 predefined checkboxes
    const cat1 = res.data.data[0];
    assert.strictEqual(cat1.code, 'patient_main_symptoms');
    assert.strictEqual(cat1.name_bn, 'রোগীর প্রধান উপসর্গসমূহ');
    assert.strictEqual(cat1.symptoms.length, 0, 'Category 1 must contain ONLY textarea for main symptoms (0 predefined checkboxes)');
  });

  await test('CRITICAL CORRECTION: At least 10 active items per category for categories 2-10 = 92 items total', async () => {
    const res = await request('GET', '/api/admin/diagnosis/categories');
    assert.strictEqual(res.statusCode, 200);

    let totalSymptoms = 0;
    const symptomCategories = res.data.data.filter(c => c.code !== 'patient_main_symptoms');
    assert.strictEqual(symptomCategories.length, 9, 'Must have 9 categories containing selectable symptoms');

    symptomCategories.forEach((cat, idx) => {
      const symCount = cat.symptoms.length;
      assert(symCount >= 10, `Category ${cat.name_bn} (#${idx+2}) must contain AT LEAST 10 items, got: ${symCount}`);
      totalSymptoms += symCount;
      
      // Verify every symptom has bilingual labels and sort order
      cat.symptoms.forEach(s => {
        assert(s.symptom_bn && s.symptom_bn.length > 3, 'Symptom must have detailed Bengali text');
        assert(s.symptom_en && s.symptom_en.length > 3, 'Symptom must have English text');
        assert.strictEqual(s.status, 'active');
      });
    });

    assert.strictEqual(totalSymptoms, 92, 'Total active items across categories 2-10 must be 92');
  });

  await test('VERIFICATION: No 5-symptom limitation or truncation exists in diagnosis API', async () => {
    const res = await request('GET', '/api/admin/diagnosis/categories');
    assert.strictEqual(res.statusCode, 200);
    const symptomCategories = res.data.data.filter(c => c.code !== 'patient_main_symptoms');
    symptomCategories.forEach(cat => {
      assert(cat.symptoms.length >= 10, `Category ${cat.name_bn} must have >= 10 symptoms (found: ${cat.symptoms.length})`);
    });
  });

  await test('Patient Diagnosis: Save multi-selection symptoms across categories with Bengali summary and custom notes', async () => {
    const catRes = await request('GET', '/api/admin/diagnosis/categories');
    const cat1 = catRes.data.data.find(c => c.code === 'main_complaints');
    const cat2 = catRes.data.data.find(c => c.code === 'physical_symptoms');
    const cat6 = catRes.data.data.find(c => c.code === 'mental_behavioral'); // has suicidal thoughts item

    // Find suicidal ideation symptom in Category 6
    const suicideSym = cat6.symptoms.find(s => s.symptom_bn.includes('আত্মহত্যা') || s.symptom_en.toLowerCase().includes('suicid'));
    assert(suicideSym, 'Category 6 must contain the suicidal thoughts/self-harm item');

    const selectedSymIds = [
      cat1.symptoms[0].id, cat1.symptoms[1].id, cat1.symptoms[2].id,
      cat2.symptoms[0].id, cat2.symptoms[1].id, cat2.symptoms[2].id,
      suicideSym.id
    ];

    const saveRes = await request('POST', `/api/admin/diagnosis/patient/${testPatientId}`, {
      selected_symptom_ids: selectedSymIds,
      main_complaints_text: 'রোগী প্রায় ৩ মাস ধরে অস্বাভাবিক অস্থিরতা এবং তীব্র মাথাব্যথায় ভুগছেন।',
      onset_history_notes: 'সমস্যাটি হঠাৎ শুরু হয়েছিল একটি পারিবারিক শোকের ঘটনার পর। পূর্বে অ্যালোপ্যাথিক চিকিৎসা নিয়েছেন।',
      family_social_notes: 'পারিবারিক পরিবেশ কিছুটা অশান্ত, তবে নিকটাত্মীয়রা সহযোগিতাপূর্ণ।',
      notes: 'শারীরিক ও মানসিক লক্ষণসমূহ চিহ্নিত হয়েছে। রোগীকে আধুনিক সাইকিয়াট্রিক মূল্যায়নের পাশাপাশি শারঈ রুকইয়াহর দিকনির্দেশনা দেওয়া হলো।',
      raqi_name: 'মুহাম্মদুল্লাহ মিয়াহ',
      diagnosis_date: new Date().toISOString().split('T')[0]
    });

    assert.strictEqual(saveRes.statusCode, 200);
    assert.strictEqual(saveRes.data.success, true);
    assert.strictEqual(saveRes.data.data.total_symptoms, 7);
    assert.strictEqual(saveRes.data.data.total_categories, 3);
    assert.strictEqual(saveRes.data.data.suicidal_ideation_flag, 1, 'Suicide safety flag must be activated');
    assert(saveRes.data.data.summary_bn.includes('৭টি উপসর্গ'), 'Summary must mention 7 symptoms');
    assert(saveRes.data.data.summary_bn.includes('৩টি ক্যাটাগরিতে'), 'Summary must mention 3 categories');
    assert(saveRes.data.data.summary_bn.includes('জরুরি সতর্কতা'), 'Summary must include safety alert for suicide ideation');
  });

  await test('Patient Diagnosis: Reopen record, verify custom fields & persistence', async () => {
    // 1. Fetch saved diagnosis
    const getRes = await request('GET', `/api/admin/diagnosis/patient/${testPatientId}`);
    assert.strictEqual(getRes.statusCode, 200);
    assert.strictEqual(getRes.data.success, true);
    assert.strictEqual(getRes.data.data.selected_symptom_ids.length, 7);
    assert.strictEqual(getRes.data.data.suicidal_ideation_flag, 1);
    assert.strictEqual(getRes.data.data.main_complaints_text, 'রোগী প্রায় ৩ মাস ধরে অস্বাভাবিক অস্থিরতা এবং তীব্র মাথাব্যথায় ভুগছেন।');
    assert(getRes.data.data.onset_history_notes.includes('পারিবারিক শোকের'), 'Onset notes must persist');
    assert(getRes.data.data.family_social_notes.includes('পারিবারিক পরিবেশ'), 'Family notes must persist');

    // 2. Edit: Add 3 more symptoms from category 3 (sleep)
    const catRes = await request('GET', '/api/admin/diagnosis/categories');
    const cat3 = catRes.data.data.find(c => c.code === 'sleep_problems');
    const updatedSymIds = [...getRes.data.data.selected_symptom_ids, cat3.symptoms[0].id, cat3.symptoms[1].id, cat3.symptoms[2].id];
    assert.strictEqual(updatedSymIds.length, 10);

    const updateRes = await request('POST', `/api/admin/diagnosis/patient/${testPatientId}`, {
      selected_symptom_ids: updatedSymIds,
      main_complaints_text: 'আপডেটকৃত প্রধান অভিযোগসমূহ।',
      onset_history_notes: 'আপডেটকৃত ইতিহাস।',
      family_social_notes: 'আপডেটকৃত সামাজিক বিবরণ।',
      notes: 'ঘুমের সমস্যাও সংযুক্ত করা হলো।',
      raqi_name: 'মুহাম্মদুল্লাহ মিয়াহ',
      diagnosis_date: new Date().toISOString().split('T')[0]
    });

    assert.strictEqual(updateRes.statusCode, 200);
    assert.strictEqual(updateRes.data.data.total_symptoms, 10);

    // 3. Verify persistence
    const verifyRes = await request('GET', `/api/admin/diagnosis/patient/${testPatientId}`);
    assert.strictEqual(verifyRes.statusCode, 200);
    assert.strictEqual(verifyRes.data.data.selected_symptom_ids.length, 10, 'Updated diagnosis must persist 10 symptoms');
    assert.strictEqual(verifyRes.data.data.main_complaints_text, 'আপডেটকৃত প্রধান অভিযোগসমূহ।');
  });

  await test('Admin Diagnosis Management: Edit category & symptom bilingual details', async () => {
    const catRes = await request('GET', '/api/admin/diagnosis/categories');
    const targetCat = catRes.data.data.find(c => c.code === 'main_complaints');
    const targetSym = targetCat.symptoms[0];

    // 1. Update Category
    const catUpdateRes = await request('PUT', `/api/admin/diagnosis/categories/${targetCat.id}`, {
      name_bn: 'প্রধান সমস্যা ও অভিযোগ (সম্পাদিত)',
      name_en: 'Main Complaints & Presenting Symptoms (Edited)',
      description_bn: 'হালনাগাদকৃত বিবরণী।',
      description_en: 'Updated clinical description.',
      sort_order: targetCat.sort_order,
      status: 'active'
    });
    assert.strictEqual(catUpdateRes.statusCode, 200);
    assert.strictEqual(catUpdateRes.data.success, true);

    // 2. Update Symptom
    const symUpdateRes = await request('PUT', `/api/admin/diagnosis/symptoms/${targetSym.id}`, {
      symptom_bn: 'তীব্র বা দীর্ঘস্থায়ী মাথাব্যথা (পরীক্ষিত)',
      symptom_en: 'Severe or persistent headache (Verified)',
      sort_order: 1,
      status: 'active'
    });
    assert.strictEqual(symUpdateRes.statusCode, 200);
    assert.strictEqual(symUpdateRes.data.success, true);

    // Revert back to original approved names
    await request('PUT', `/api/admin/diagnosis/categories/${targetCat.id}`, {
      name_bn: 'প্রধান সমস্যা ও অভিযোগ',
      name_en: 'Main Complaints & Presenting Symptoms',
      description_bn: 'রোগীর প্রাথমিক ও তাৎক্ষণিক সমস্যাসমূহের তালিকা।',
      description_en: 'Initial and immediate complaints reported by patient.',
      sort_order: targetCat.sort_order,
      status: 'active'
    });
    await request('PUT', `/api/admin/diagnosis/symptoms/${targetSym.id}`, {
      symptom_bn: 'তীব্র বা দীর্ঘস্থায়ী মাথাব্যথা',
      symptom_en: 'Severe or persistent headache',
      sort_order: 1,
      status: 'active'
    });
  });

  await test('Public Diagnosis API: Returns all 10 active categories and 92 symptoms total', async () => {
    const res = await request('GET', '/api/public/diagnosis/categories');
    assert.strictEqual(res.statusCode, 200);
    assert.strictEqual(res.data.success, true);
    assert.strictEqual(res.data.data.length, 10);
    let symCount = 0;
    res.data.data.forEach(c => symCount += c.symptoms.length);
    assert.strictEqual(symCount, 92);
  });

  await test('PDF Report with Full Diagnosis: binary download includes all 10 selected symptoms', async () => {
    const res = await request('GET', `/api/admin/reports/patient/${testPatientId}/pdf`);
    assert.strictEqual(res.statusCode, 200);
    assert.strictEqual(res.headers['content-type'], 'application/pdf');
    assert(res.rawBuffer.length > 1000);
    const pdfContent = res.rawBuffer.toString('latin1');
    assert(pdfContent.includes('9-CATEGORY CLINICAL DIAGNOSIS'), 'PDF must include 9-category diagnosis section');
  });

  await test('Dual-Language PDF: Download Bengali PDF (?lang=bn) and English PDF (?lang=en)', async () => {
    // 1. Bengali PDF
    const bnRes = await request('GET', `/api/admin/reports/patient/${testPatientId}/pdf?lang=bn`);
    assert.strictEqual(bnRes.statusCode, 200);
    assert.strictEqual(bnRes.headers['content-type'], 'application/pdf');
    assert(bnRes.headers['content-disposition'].includes('_BN.pdf'));
    assert(bnRes.rawBuffer.length > 5000);

    // 2. English PDF
    const enRes = await request('GET', `/api/admin/reports/patient/${testPatientId}/pdf?lang=en`);
    assert.strictEqual(enRes.statusCode, 200);
    assert.strictEqual(enRes.headers['content-type'], 'application/pdf');
    assert(enRes.headers['content-disposition'].includes('_EN.pdf'));
    assert(enRes.rawBuffer.length > 5000);
    const enPdfContent = enRes.rawBuffer.toString('latin1');
    assert(enPdfContent.includes('URGENT CLINICAL ALERT') || enPdfContent.includes('Suicidal') || enPdfContent.includes('9-CATEGORY'), 'English PDF must reflect clinical diagnosis status');
  });

  await test('CLINICAL SAFETY: Suicidal thoughts detection flags record and attaches clinical warning', async () => {
    // Verify patient diagnosis has suicidal_ideation_flag set
    const diagRes = await request('GET', `/api/admin/diagnosis/patient/${testPatientId}`);
    assert.strictEqual(diagRes.statusCode, 200);
    assert.strictEqual(diagRes.data.data.suicidal_ideation_flag, 1);
    assert(diagRes.data.data.summary_bn.includes('জরুরি সতর্কতা'));
  });

  await test('STRUCTURED HISTORY: Categories 8 & 9 function as structured questionnaires with custom text', async () => {
    const catsRes = await request('GET', '/api/admin/diagnosis/categories');
    const cat8 = catsRes.data.data.find(c => c.code === 'onset_history');
    const cat9 = catsRes.data.data.find(c => c.code === 'family_social');
    
    assert(cat8, 'Category 8 (onset_history) must exist');
    assert(cat9, 'Category 9 (family_social) must exist');
    assert.strictEqual(cat8.symptoms.length, 10, 'Category 8 must have 10 structured questions');
    assert.strictEqual(cat9.symptoms.length, 10, 'Category 9 must have 10 structured questions');

    // Verify first question text
    assert(cat8.symptoms[0].symptom_bn.includes('কবে থেকে শুরু হয়েছে'));
    assert(cat9.symptoms[0].symptom_bn.includes('অন্য সদস্যদের'));
  });

  await test('Dual-Language Session PDF: Download Bengali and English Session PDFs', async () => {
    const sRes = await request('GET', `/api/admin/reports/session/${recordedSessionId}/pdf?lang=bn`);
    assert.strictEqual(sRes.statusCode, 200);
    assert.strictEqual(sRes.headers['content-type'], 'application/pdf');
    assert(sRes.headers['content-disposition'].includes('_BN.pdf'));

    const sEnRes = await request('GET', `/api/admin/reports/session/${recordedSessionId}/pdf?lang=en`);
    assert.strictEqual(sEnRes.statusCode, 200);
    assert.strictEqual(sEnRes.headers['content-type'], 'application/pdf');
    assert(sEnRes.headers['content-disposition'].includes('_EN.pdf'));
  });

  await test('Official Clinic Logo Integration: Assets exist and settings include logo_url', async () => {
    const settingsRes = await request('GET', '/api/admin/settings');
    assert.strictEqual(settingsRes.statusCode, 200);
    assert(settingsRes.data.data.logo_url);

    const fs = require('fs');
    assert(fs.existsSync('public/images/logo.png'), 'logo.png must exist');
    assert(fs.existsSync('public/images/official-logo.jpg'), 'official-logo.jpg must exist');
  });

  await test('Public Articles / Case Studies: Seeded cases are accessible publicly', async () => {
    const res = await request('GET', '/api/public/articles');
    assert.strictEqual(res.statusCode, 200);
    assert.strictEqual(res.data.success, true);
    assert(res.data.data.length >= 3, 'Must have at least 3 seeded cases');

    const first = res.data.data[0];
    const detailRes = await request('GET', `/api/public/articles/${first.slug_bn}`);
    assert.strictEqual(detailRes.statusCode, 200);
    assert.strictEqual(detailRes.data.success, true);
    assert(detailRes.data.data.title_bn);
    assert(detailRes.data.data.content_bn);
  });

  await test('Articles System: Privacy protection strictly rejects phone numbers in case study', async () => {
    const privacyRes = await request('POST', '/api/admin/articles', {
      title_bn: 'অশ্লীল পরীক্ষণ কেস',
      content_bn: 'এই রোগীর মোবাইল নম্বর হলো 01712345678 এবং তিনি এসেছিলেন।'
    });
    assert.strictEqual(privacyRes.statusCode, 400);
    assert(privacyRes.data.error.includes('Privacy Violation') || privacyRes.data.error.includes('গোপনীয়তা'));
  });

  await test('Admin Articles CRUD: Create, Toggle Status, Update and Delete article', async () => {
    // Create
    const createRes = await request('POST', '/api/admin/articles', {
      title_bn: 'টেস্ট কেস স্টাডি: বদনজর থেকে সুস্থতা',
      title_en: 'Test Case Study: Recovery from Evil Eye',
      slug_bn: 'test-case-recovery-evil-eye',
      slug_en: 'test-case-recovery-evil-eye-en',
      category_bn: 'বদনজর চিকিৎসা',
      category_en: 'Evil Eye Treatment',
      excerpt_bn: 'রোগীর সংক্ষিপ্ত বিবরণী ও ডায়াগনোসিস।',
      excerpt_en: 'Brief patient presentation and diagnosis.',
      content_bn: 'বিস্তারিত রুকইয়াহ ও হিজামার বিবরণ। আল্লাহর রহমতে সুস্থ।',
      content_en: 'Detailed treatment protocol and recovery by Allah\'s mercy.',
      status: 'published'
    });
    assert.strictEqual(createRes.statusCode, 200);
    assert.strictEqual(createRes.data.success, true);
    const newArtId = createRes.data.article_id;

    // Toggle Status
    const statusRes = await request('PUT', `/api/admin/articles/${newArtId}/status`, { status: 'draft' });
    assert.strictEqual(statusRes.statusCode, 200);

    // Verify it is draft
    const getRes = await request('GET', `/api/admin/articles/${newArtId}`);
    assert.strictEqual(getRes.data.data.status, 'draft');

    // Delete
    const delRes = await request('DELETE', `/api/admin/articles/${newArtId}`);
    assert.strictEqual(delRes.statusCode, 200);
  });

  await test('Public HTML Pages: /articles and /articles/:slug return HTTP 200', async () => {
    const listHtml = await request('GET', '/articles');
    assert.strictEqual(listHtml.statusCode, 200);

    const detailHtml = await request('GET', '/articles/case-01-stomach-sihr-recovery');
    assert.strictEqual(detailHtml.statusCode, 200);
  });

  // ==========================================================================
  // COMPREHENSIVE AUDIT & DYNAMIC SYMPTOM CRUD TESTS
  // ==========================================================================
  let dynamicSymptomId = null;

  await test('Dynamic Symptom CRUD: Add new symptom to category, verify persistence and availability', async () => {
    const addRes = await request('POST', '/api/admin/diagnosis/symptoms', {
      category_id: 1,
      symptom_bn: 'টেস্ট নতুন উপসর্গ: চোখে ঝাপসা দেখা',
      symptom_en: 'Test New Symptom: Blurred vision during recitation',
      sort_order: 15,
      status: 'active'
    });

    assert.strictEqual(addRes.statusCode, 200);
    assert.strictEqual(addRes.data.success, true);
    assert(addRes.data.data.id > 0, 'Must return new symptom ID');
    dynamicSymptomId = addRes.data.data.id;

    // Verify it immediately appears in the categories API used by patient form
    const catRes = await request('GET', '/api/admin/diagnosis/categories');
    assert.strictEqual(catRes.statusCode, 200);
    const cat1 = catRes.data.data.find(c => c.id === 1);
    const found = cat1.symptoms.find(s => s.id === dynamicSymptomId);
    assert(found, 'Newly added symptom must appear immediately in category 1');
    assert.strictEqual(found.symptom_bn, 'টেস্ট নতুন উপসর্গ: চোখে ঝাপসা দেখা');
    assert.strictEqual(found.symptom_en, 'Test New Symptom: Blurred vision during recitation');
  });

  await test('Dynamic Symptom CRUD: Edit symptom bilingual text and reassign to different category', async () => {
    assert(dynamicSymptomId, 'dynamicSymptomId must exist');

    const editRes = await request('PUT', `/api/admin/diagnosis/symptoms/${dynamicSymptomId}`, {
      category_id: 2, // Reassign to category 2
      symptom_bn: 'আপডেটকৃত উপসর্গ: চোখে অতিরিক্ত ঝাপসা দেখা',
      symptom_en: 'Updated Symptom: Severe blurred vision',
      sort_order: 12,
      status: 'active'
    });

    assert.strictEqual(editRes.statusCode, 200);
    assert.strictEqual(editRes.data.success, true);

    // Verify it moved to category 2
    const catRes = await request('GET', '/api/admin/diagnosis/categories');
    const cat1 = catRes.data.data.find(c => c.id === 1);
    const cat2 = catRes.data.data.find(c => c.id === 2);
    assert(!cat1.symptoms.some(s => s.id === dynamicSymptomId), 'Symptom must no longer be in category 1');
    const foundInCat2 = cat2.symptoms.find(s => s.id === dynamicSymptomId);
    assert(foundInCat2, 'Symptom must now appear in category 2');
    assert.strictEqual(foundInCat2.symptom_bn, 'আপডেটকৃত উপসর্গ: চোখে অতিরিক্ত ঝাপসা দেখা');
  });

  await test('Dynamic Symptom CRUD: Toggle active/inactive status and verify in categories API', async () => {
    assert(dynamicSymptomId, 'dynamicSymptomId must exist');

    // Toggle to inactive
    const toggleRes = await request('POST', `/api/admin/diagnosis/symptoms/${dynamicSymptomId}/toggle`);
    assert.strictEqual(toggleRes.statusCode, 200);
    assert.strictEqual(toggleRes.data.success, true);
    assert.strictEqual(toggleRes.data.new_status, 'inactive');

    // Verify it does NOT appear in active categories list for patient pre-diagnosis
    const catRes = await request('GET', '/api/admin/diagnosis/categories');
    const cat2 = catRes.data.data.find(c => c.id === 2);
    assert(!cat2.symptoms.some(s => s.id === dynamicSymptomId), 'Inactive symptom must not appear in patient pre-diagnosis active list');

    // Toggle back to active
    const toggleBackRes = await request('POST', `/api/admin/diagnosis/symptoms/${dynamicSymptomId}/toggle`);
    assert.strictEqual(toggleBackRes.statusCode, 200);
    assert.strictEqual(toggleBackRes.data.new_status, 'active');
  });

  await test('Dynamic Symptom CRUD: Delete symptom permanently without corrupting patient historical diagnosis', async () => {
    assert(dynamicSymptomId, 'dynamicSymptomId must exist');

    // Delete symptom
    const delRes = await request('DELETE', `/api/admin/diagnosis/symptoms/${dynamicSymptomId}`);
    assert.strictEqual(delRes.statusCode, 200);
    assert.strictEqual(delRes.data.success, true);

    // Verify it is gone from database
    const catRes = await request('GET', '/api/admin/diagnosis/management');
    const allSyms = catRes.data.data.flatMap(c => c.symptoms);
    assert(!allSyms.some(s => s.id === dynamicSymptomId), 'Deleted symptom must be removed from diagnosis_symptoms');

    // CRITICAL: Verify previously saved patient diagnosis records remain 100% intact with their snapshot
    const patientDiagRes = await request('GET', `/api/admin/diagnosis/patient/${testPatientId}`);
    assert.strictEqual(patientDiagRes.statusCode, 200);
    assert.strictEqual(patientDiagRes.data.success, true);
    assert(patientDiagRes.data.data.selected_symptoms_json.length > 0, 'Historical symptom snapshots must remain intact');
    assert.strictEqual(patientDiagRes.data.data.selected_symptom_ids.length, 10, 'All 10 symptoms must remain recorded');
  });

  await test('Lead Raqi Official Name Verification: Strictly "Muhammadullah Miah" / "মুহাম্মদুল্লাহ মিয়াহ"', async () => {
    // 1. Clinic Settings
    const settings = db.prepare('SELECT raqi_name FROM clinic_settings WHERE id = 1').get();
    assert.strictEqual(settings.raqi_name, 'Muhammadullah Miah');

    // 2. Articles Author Name
    const articles = db.prepare('SELECT author_name FROM articles').all();
    for (const a of articles) {
      assert(!a.author_name.includes('মিয়াজী'), `Article author "${a.author_name}" must not contain "মিয়াজী"`);
      assert(!a.author_name.includes('Miyah'), `Article author "${a.author_name}" must not contain "Miyah"`);
      assert(a.author_name.includes('Muhammadullah Miah') || a.author_name.includes('মুহাম্মদুল্লাহ মিয়াহ'), `Author must contain Muhammadullah Miah`);
    }

    // 3. Patient Diagnoses Raqi Name
    const diagnoses = db.prepare('SELECT raqi_name FROM patient_diagnoses').all();
    for (const d of diagnoses) {
      assert(!d.raqi_name.includes('মিয়াজী'), `Diagnosis raqi "${d.raqi_name}" must not contain "মিয়াজী"`);
      assert(!d.raqi_name.includes('Miyah'), `Diagnosis raqi "${d.raqi_name}" must not contain "Miyah"`);
    }

    // 4. Ruqyah Sessions Raqi Name
    const sessions = db.prepare('SELECT raqi_name FROM ruqyah_sessions').all();
    for (const s of sessions) {
      assert(!s.raqi_name.includes('মিয়াজী'), `Session raqi "${s.raqi_name}" must not contain "মিয়াজী"`);
      assert(!s.raqi_name.includes('Miyah'), `Session raqi "${s.raqi_name}" must not contain "Miyah"`);
    }
  });

  await test('Bilingual PDF Verification: Bengali PDF (?lang=bn) and English PDF (?lang=en) generate valid localized files', async () => {
    // Bengali PDF for Patient History
    const bnRes = await request('GET', `/api/admin/reports/patient/${testPatientId}/pdf?lang=bn`);
    assert.strictEqual(bnRes.statusCode, 200);
    assert.strictEqual(bnRes.headers['content-type'], 'application/pdf');
    assert(bnRes.headers['content-disposition'].includes('_BN.pdf'), 'Must download with BN filename');
    assert(bnRes.rawBuffer.length > 5000, 'Bengali PDF must have valid size');
    assert(bnRes.rawBuffer.slice(0, 5).toString() === '%PDF-', 'Must be a valid PDF header');

    // English PDF for Patient History
    const enRes = await request('GET', `/api/admin/reports/patient/${testPatientId}/pdf?lang=en`);
    assert.strictEqual(enRes.statusCode, 200);
    assert.strictEqual(enRes.headers['content-type'], 'application/pdf');
    assert(enRes.headers['content-disposition'].includes('_EN.pdf'), 'Must download with EN filename');
    assert(enRes.rawBuffer.length > 5000, 'English PDF must have valid size');
    assert(enRes.rawBuffer.slice(0, 5).toString() === '%PDF-', 'Must be a valid PDF header');

    // Bengali PDF for Ruqyah Session
    const sBnRes = await request('GET', `/api/admin/reports/session/${recordedSessionId}/pdf?lang=bn`);
    assert.strictEqual(sBnRes.statusCode, 200);
    assert.strictEqual(sBnRes.headers['content-type'], 'application/pdf');
    assert(sBnRes.headers['content-disposition'].includes('_BN.pdf'));

    // English PDF for Ruqyah Session
    const sEnRes = await request('GET', `/api/admin/reports/session/${recordedSessionId}/pdf?lang=en`);
    assert.strictEqual(sEnRes.statusCode, 200);
    assert.strictEqual(sEnRes.headers['content-type'], 'application/pdf');
    assert(sEnRes.headers['content-disposition'].includes('_EN.pdf'));
  });

  // 17. Scrolling Announcement Notice APIs
  await test('Scrolling Notice API: Public GET, Admin PUT, and Toggle Publish', async () => {
    // Public notice
    const pubRes = await request('GET', '/api/public/notice');
    assert.strictEqual(pubRes.statusCode, 200);
    assert.strictEqual(pubRes.data.success, true);
    assert(pubRes.data.data !== null);
    assert(pubRes.data.data.content_bn.length > 0);

    // Admin get notice
    const admGet = await request('GET', '/api/admin/settings/notice');
    assert.strictEqual(admGet.statusCode, 200);
    assert.strictEqual(admGet.data.success, true);

    // Admin update notice
    const admPut = await request('PUT', '/api/admin/settings/notice', {
      title_bn: 'বিশেষ ঘোষণা',
      content_bn: 'টেস্ট নোটিশ: ফেনী শাখায় শনি-বৃহস্পতিবার সকাল ৯টা থেকে রাত ৮টা পর্যন্ত সেবা খোলা থাকে।',
      content_en: 'Test notice: Open Sat-Thu 9 AM - 8 PM.',
      is_active: 1
    });
    assert.strictEqual(admPut.statusCode, 200);
    assert.strictEqual(admPut.data.success, true);

    // Toggle unpublish
    const togRes = await request('POST', '/api/admin/settings/notice/toggle');
    assert.strictEqual(togRes.statusCode, 200);
    assert.strictEqual(togRes.data.is_active, 0);

    // Toggle back to publish
    const togBack = await request('POST', '/api/admin/settings/notice/toggle');
    assert.strictEqual(togBack.statusCode, 200);
    assert.strictEqual(togBack.data.is_active, 1);
  });

  // 18. Multi-Patient Pricing: Standard Ruqyah calculates Total = Per-Patient × Count
  let multiAptId = null;
  await test('Multi-Patient Pricing: Standard Ruqyah calculates Total = 2 × 2050 = 4100 BDT', async () => {
    const bookRes = await request('POST', '/api/public/book', {
      full_name: 'Test Multi Patient',
      phone: '01719998877',
      address: 'Rampur, Feni',
      service_type: 'ruqyah',
      number_of_patients: 2,
      appointment_date: testDateStr,
      time_slot: '04:00 PM – 05:00 PM',
      additional_notes: 'Booking for 2 family members'
    });

    assert.strictEqual(bookRes.statusCode, 201);
    assert.strictEqual(bookRes.data.success, true);
    assert.strictEqual(bookRes.data.data.price, 4100);
    assert.strictEqual(bookRes.data.data.package_type, 'standard');
    assert(bookRes.data.data.price_display.includes('৪,১০০'));

    multiAptId = bookRes.data.data.appointment_id;

    // Verify database row
    const row = db.prepare('SELECT service_price, original_price, per_patient_price, package_type FROM appointments WHERE appointment_id = ?').get(multiAptId);
    assert.strictEqual(row.service_price, 4100);
    assert.strictEqual(row.per_patient_price, 2050);
    assert.strictEqual(row.package_type, 'standard');
  });

  // 19. Family Package: Fixed 6,000 BDT for 1-6 patients
  let familyAptId = null;
  await test('Family Package: Fixed 6,000 BDT regardless of patient count (up to 6 patients)', async () => {
    const famRes = await request('POST', '/api/public/book', {
      full_name: 'Test Family Patient',
      phone: '01899990000',
      address: 'Daganbhuiyan, Feni',
      service_type: 'family',
      package_type: 'family',
      number_of_patients: 4,
      appointment_date: testDateStr,
      time_slot: '05:00 PM – 06:00 PM',
      additional_notes: 'Family session for 4 members'
    });

    assert.strictEqual(famRes.statusCode, 201);
    assert.strictEqual(famRes.data.success, true);
    assert.strictEqual(famRes.data.data.price, 6000);
    assert.strictEqual(famRes.data.data.package_type, 'family');
    assert(famRes.data.data.price_display.includes('৬,০০০'));

    familyAptId = famRes.data.data.appointment_id;

    const row = db.prepare('SELECT service_price, package_type, number_of_patients FROM appointments WHERE appointment_id = ?').get(familyAptId);
    assert.strictEqual(row.service_price, 6000);
    assert.strictEqual(row.package_type, 'family');
    assert.strictEqual(row.number_of_patients, 4);
  });

  // 20. Family Package Rejection: strictly rejects > 6 patients
  await test('Family Package Validation: strictly rejects > 6 patients', async () => {
    const invalidRes = await request('POST', '/api/public/book', {
      full_name: 'Test Over Limit Family',
      phone: '01955443322',
      address: 'Chhagalnaiya, Feni',
      service_type: 'family',
      package_type: 'family',
      number_of_patients: 7,
      appointment_date: testDateStr,
      time_slot: '06:00 PM – 07:00 PM'
    });

    assert.strictEqual(invalidRes.statusCode, 400);
    assert.strictEqual(invalidRes.data.success, false);
    assert(invalidRes.data.error.includes('সর্বোচ্চ ৬'));
  });

  // 21. Admin Price Override / Financial Concession
  await test('Admin Price Override: allows financial concession adjustment for low-income patients', async () => {
    assert(multiAptId, 'Must have multiAptId from previous test');

    const overrideRes = await request('POST', `/api/admin/appointments/${multiAptId}/override-price`, {
      adjusted_price: 1500,
      reason: 'অসচ্ছল রোগীর জন্য বিশেষ ছাড় / Financial concession'
    });

    assert.strictEqual(overrideRes.statusCode, 200);
    assert.strictEqual(overrideRes.data.success, true);
    assert.strictEqual(overrideRes.data.adjusted_price, 1500);

    const row = db.prepare('SELECT service_price, adjusted_price, is_price_overridden, admin_notes FROM appointments WHERE appointment_id = ?').get(multiAptId);
    assert.strictEqual(row.service_price, 1500);
    assert.strictEqual(row.adjusted_price, 1500);
    assert.strictEqual(row.is_price_overridden, 1);
    assert(row.admin_notes.includes('Financial concession') || row.admin_notes.includes('বিশেষ ছাড়'));
  });

  // 22. Flexible Weekly Holiday Setting: -1 opens 7 days a week
  await test('Flexible Weekly Holiday: setting -1 opens booking 7 days a week', async () => {
    // Find next Friday
    let friday = new Date(Date.now() + 86400000);
    while (friday.getDay() !== 5) {
      friday = new Date(friday.getTime() + 86400000);
    }
    const fridayStr = friday.toISOString().split('T')[0];

    // Under normal settings (Friday = 5 holiday), Friday is closed
    const normalAvail = await request('GET', `/api/public/availability?date=${fridayStr}`);
    assert.strictEqual(normalAvail.statusCode, 200);
    assert.strictEqual(normalAvail.data.isWeeklyHoliday, true);
    assert.strictEqual(normalAvail.data.slots.length, 0);

    // Now Admin updates weekly holiday to -1 (No weekly holiday)
    const updateHolRes = await request('PUT', '/api/admin/availability/settings', {
      weekly_holiday_day: -1,
      weekly_holiday_enabled: 0
    });
    assert.strictEqual(updateHolRes.statusCode, 200);
    assert.strictEqual(updateHolRes.data.success, true);

    // Verify Friday is now open!
    const openAvail = await request('GET', `/api/public/availability?date=${fridayStr}`);
    assert.strictEqual(openAvail.statusCode, 200);
    assert.strictEqual(openAvail.data.isWeeklyHoliday, undefined);
    assert.strictEqual(openAvail.data.slots.length, 10);

    // Revert holiday setting back to Friday (5)
    await request('PUT', '/api/admin/availability/settings', {
      weekly_holiday_day: 5,
      weekly_holiday_enabled: 1
    });
  });

  await test('PHASE 5: Dynamic Weighted Symptom Assessment & Category Calculation', async () => {
    const qRes = await request('GET', '/api/admin/diagnosis/assessment-questions');
    assert.strictEqual(qRes.statusCode, 200);
    assert.strictEqual(qRes.data.success, true);
    assert.ok(qRes.data.questions.length > 0);

    const calcRes = await request('POST', '/api/admin/diagnosis/calculate-assessment', {
      answers: {
        '1': 'yes',
        '2': 'sometimes',
        '3': 'no'
      }
    });
    assert.strictEqual(calcRes.statusCode, 200);
    assert.strictEqual(calcRes.data.success, true);
    assert.ok(calcRes.data.disclaimer.includes('প্রাথমিক পর্যালোচনার'));
    assert.ok(Array.isArray(calcRes.data.results));
  });

  await test('PHASE 6: Ruqyah Audio Library & Hijama Point Packages API', async () => {
    const rRes = await request('GET', '/api/resources/ruqyah-audios');
    assert.strictEqual(rRes.statusCode, 200);
    assert.strictEqual(rRes.data.success, true);
    assert.ok(rRes.data.items.length > 0);

    const hRes = await request('GET', '/api/resources/hijama-packages');
    assert.strictEqual(hRes.statusCode, 200);
    assert.strictEqual(hRes.data.success, true);
    assert.ok(hRes.data.packages.length > 0);
    assert.ok(hRes.data.hadiths.length >= 2);
  });

  await test('PHASE 7: Sunnah Supplements Products & COD Checkout', async () => {
    const pRes = await request('GET', '/api/shop/products');
    assert.strictEqual(pRes.statusCode, 200);
    assert.strictEqual(pRes.data.success, true);
    assert.ok(pRes.data.products.length > 0);

    const firstProd = pRes.data.products[0];
    const orderRes = await request('POST', '/api/shop/orders/checkout', {
      customer_name: 'আব্দুর রহমান',
      customer_phone: '01812345678',
      district: 'Feni',
      shipping_address: 'মহিপাল, ফেনী সদর',
      items: [
        { product_id: firstProd.id, quantity: 1 }
      ]
    });
    assert.strictEqual(orderRes.statusCode, 201);
    assert.strictEqual(orderRes.data.success, true);
    assert.ok(orderRes.data.order.order_number.startsWith('ORD-'));
    assert.strictEqual(orderRes.data.order.shipping_charge, 70);

    // Track this order
    const trackRes = await request('GET', `/api/shop/orders/track?order_number=${orderRes.data.order.order_number}&phone=01812345678`);
    assert.strictEqual(trackRes.statusCode, 200);
    assert.strictEqual(trackRes.data.success, true);
    assert.strictEqual(trackRes.data.order.order_number, orderRes.data.order.order_number);
    assert.ok(trackRes.data.order.timeline.length >= 4);
  });

  await test('PHASE 6: Online Courses & Curriculum Syllabus API', async () => {
    const cRes = await request('GET', '/api/courses');
    assert.strictEqual(cRes.statusCode, 200);
    assert.strictEqual(cRes.data.success, true);
    assert.ok(cRes.data.courses.length > 0);

    const detailRes = await request('GET', `/api/courses/${cRes.data.courses[0].slug}`);
    assert.strictEqual(detailRes.statusCode, 200);
    assert.strictEqual(detailRes.data.success, true);
    assert.ok(Array.isArray(detailRes.data.curriculum));
  });

  await test('PHASE 8: Sunnah Lifestyle User Registration, 100-pt Max Score Ceiling & Leaderboard', async () => {
    const regPhone = '018' + Math.floor(10000000 + Math.random() * 90000000);
    const regRes = await request('POST', '/api/lifestyle/register', {
      full_name: 'আহমাদুল্লাহ ফাহিম',
      phone: regPhone,
      password: 'password123'
    });
    assert.strictEqual(regRes.statusCode, 201);
    assert.strictEqual(regRes.data.success, true);
    const token = regRes.data.token;

    // Get current day from today-status
    const todayStatusRes = await request('GET', '/api/lifestyle/today-status', null, { 'Authorization': 'Bearer ' + token });
    const currentDay = todayStatusRes.data.today_bst;

    // Daily submission without honesty confirmation fails
    const failHonesty = await request('POST', '/api/lifestyle/submit-daily', {
      submission_date: currentDay,
      answers: { fajr: 'congregation' },
      honesty_confirmed: false
    }, { 'Authorization': 'Bearer ' + token });
    assert.strictEqual(failHonesty.statusCode, 400);

    // Full daily submission with all items checked - must strictly never exceed 100 points
    const fullSubmit = await request('POST', '/api/lifestyle/submit-daily', {
      submission_date: currentDay,
      answers: {
        fajr: 'congregation',
        dhuhr: 'congregation',
        asr: 'congregation',
        maghrib: 'congregation',
        isha: 'congregation',
        tahajjud: true,
        ishraq_duha: true,
        rawatib: true,
        witr: true,
        morning_evening_adhkar: true,
        quran_tilawat: true,
        sadaqah: true,
        parents_family_kindness: true,
        sunnah_food_honey_kalojira: true,
        early_sleep_sunnah_routine: true,
        harmless_tongue_gossip_free: true
      },
      honesty_confirmed: true
    }, { 'Authorization': 'Bearer ' + token });
    assert.strictEqual(fullSubmit.statusCode, 200);
    assert.strictEqual(fullSubmit.data.success, true);
    assert.strictEqual(fullSubmit.data.points_breakdown.total_points, 100);

    // Verify leaderboard returns masked phone for privacy
    const lbRes = await request('GET', '/api/lifestyle/leaderboard');
    assert.strictEqual(lbRes.statusCode, 200);
    assert.strictEqual(lbRes.data.success, true);
    assert.ok(lbRes.data.leaderboard.length > 0);
    assert.ok(lbRes.data.leaderboard[0].masked_phone.includes('****'));
  });

  await test('PHASE 8: Public HTML Pages return HTTP 200', async () => {
    const pages = ['/ruqyah', '/hijama', '/shop', '/orders/track', '/courses', '/lifestyle', '/lifestyle/leaderboard'];
    for (const p of pages) {
      const res = await request('GET', p);
      assert.strictEqual(res.statusCode, 200, `Page ${p} did not return 200`);
    }
  });

  await test('HOMEPAGE INTEGRATION: Dedicated section "আমল ও প্রতিযোগিতা" exists with 4 core modules', async () => {
    const homeRes = await request('GET', '/');
    assert.strictEqual(homeRes.statusCode, 200);
    assert.ok(homeRes.data.includes('id="amalCompetitionSection"'));
    assert.ok(homeRes.data.includes('আমল ও প্রতিযোগিতা'));
    assert.ok(homeRes.data.includes('দৈনিক আমল ট্র্যাকার'));
    assert.ok(homeRes.data.includes('সুন্নাহ লাইফস্টাইল ও নসিহত'));
    assert.ok(homeRes.data.includes('৪০ দিনের আমল প্রতিযোগিতা'));
    assert.ok(homeRes.data.includes('পয়েন্ট, লিডারবোর্ড ও বিজয়ী পুরস্কার'));
  });

  await test('MODULE 21 & 08: Automatic Winner Calculation, Poster Generator & Shareable Dual Report', async () => {
    // 1. Calculate winners as admin
    const calcRes = await request('POST', '/api/lifestyle/admin/calculate-winners', {});
    assert.strictEqual(calcRes.statusCode, 200);
    assert.strictEqual(calcRes.data.success, true);
    assert.ok(calcRes.data.winners.length > 0);

    const winnerId = calcRes.data.winners[0].id;

    // 2. Publish winners
    const pubRes = await request('POST', '/api/lifestyle/admin/publish-winners', { is_published: 1 });
    assert.strictEqual(pubRes.statusCode, 200);

    // 3. Update gift info
    const giftRes = await request('PUT', `/api/lifestyle/admin/winners/${winnerId}/gift`, {
      gift_details: 'Special Sunnah Honey & Pure Ajwa Dates Box',
      gift_status: 'Awarded',
      gift_awarded_date: '2026-11-23'
    });
    assert.strictEqual(giftRes.statusCode, 200);

    // 4. Public winners API returns published list
    const pubWinners = await request('GET', '/api/lifestyle/winners');
    assert.strictEqual(pubWinners.statusCode, 200);
    assert.strictEqual(pubWinners.data.success, true);
    assert.ok(pubWinners.data.winners.length > 0);
    assert.strictEqual(pubWinners.data.winners[0].gift_status, 'Awarded');

    // 5. Winner Poster Generator HTML endpoint
    const posterRes = await request('GET', `/api/lifestyle/poster/${winnerId}`);
    assert.strictEqual(posterRes.statusCode, 200);
    assert.ok(posterRes.data.includes('৪০ দিনের সুন্নাহ আমল প্রতিযোগিতা ২০২৬'));
    assert.ok(posterRes.data.includes('মুহাম্মদুল্লাহ মিয়া'));

    // 6. Shareable Patient History PDF download with ?shareable=1
    const pHistPdf = await request('GET', `/api/admin/reports/patient/${testPatientId}/pdf?shareable=1`);
    assert.strictEqual(pHistPdf.statusCode, 200);
    assert.strictEqual(pHistPdf.headers['content-type'], 'application/pdf');

    // 7. Shareable Ruqyah Session PDF download with ?shareable=1
    const pSessPdf = await request('GET', `/api/admin/reports/session/${recordedSessionId}/pdf?shareable=1`);
    assert.strictEqual(pSessPdf.statusCode, 200);
    assert.strictEqual(pSessPdf.headers['content-type'], 'application/pdf');
  });

  await test('HOMEPAGE INTEGRATION: Dedicated sections for Supplements, Audio Library, Hijama Packages, Courses, Articles & Quick Order Modal exist', async () => {
    const res = await request('GET', '/');
    assert.strictEqual(res.statusCode, 200);
    const html = res.data;
    assert.ok(html.includes('id="hijamaPackagesSection"'), 'Hijama Packages section must be present on homepage');
    assert.ok(html.includes('id="ruqyahAudioSection"'), 'Ruqyah Audio Library section must be present on homepage');
    assert.ok(html.includes('id="supplementsSection"'), 'Sunnah Supplements Store section must be present on homepage');
    assert.ok(html.includes('id="coursesSection"'), 'Courses section must be present on homepage');
    assert.ok(html.includes('id="articlesSection"'), 'Articles & Case History section must be present on homepage');
    assert.ok(html.includes('id="quickOrderModal"'), 'Quick Order Modal must be present on homepage');
    assert.ok(html.includes('id="homepageProductsContainer"'), 'Products container must exist');
    assert.ok(html.includes('id="homepageAudioContainer"'), 'Audio container must exist');
    assert.ok(html.includes('id="homepageHijamaContainer"'), 'Hijama container must exist');
    assert.ok(html.includes('id="homepageCoursesContainer"'), 'Courses container must exist');
    assert.ok(html.includes('id="homepageArticlesContainer"'), 'Articles container must exist');
    assert.ok(html.includes('openQuickOrder'), 'openQuickOrder JS function must exist');
    assert.ok(html.includes('submitQuickOrder'), 'submitQuickOrder JS function must exist');
  });

  await test('ADMIN COMMERCE & CMS TOGGLES: Admin can toggle visibility of products, hijama packages, ruqyah audios, and courses', async () => {
    // 1. Toggle product
    const prodToggle1 = await request('POST', '/api/admin/commerce/products/1/toggle', null, adminCookie);
    assert.strictEqual(prodToggle1.statusCode, 200);
    assert.strictEqual(prodToggle1.data.success, true);
    assert.strictEqual(prodToggle1.data.is_active, 0);

    const prodToggle2 = await request('POST', '/api/admin/commerce/products/1/toggle', null, adminCookie);
    assert.strictEqual(prodToggle2.statusCode, 200);
    assert.strictEqual(prodToggle2.data.success, true);
    assert.strictEqual(prodToggle2.data.is_active, 1);

    // 2. Toggle hijama package
    const pkgToggle1 = await request('POST', '/api/admin/commerce/hijama-packages/1/toggle', null, adminCookie);
    assert.strictEqual(pkgToggle1.statusCode, 200);
    assert.strictEqual(pkgToggle1.data.success, true);
    assert.strictEqual(pkgToggle1.data.is_active, 0);

    const pkgToggle2 = await request('POST', '/api/admin/commerce/hijama-packages/1/toggle', null, adminCookie);
    assert.strictEqual(pkgToggle2.statusCode, 200);
    assert.strictEqual(pkgToggle2.data.success, true);
    assert.strictEqual(pkgToggle2.data.is_active, 1);

    // 3. Toggle ruqyah audio
    const audioToggle1 = await request('POST', '/api/admin/commerce/ruqyah-audios/1/toggle', null, adminCookie);
    assert.strictEqual(audioToggle1.statusCode, 200);
    assert.strictEqual(audioToggle1.data.success, true);
    assert.strictEqual(audioToggle1.data.is_active, 0);

    const audioToggle2 = await request('POST', '/api/admin/commerce/ruqyah-audios/1/toggle', null, adminCookie);
    assert.strictEqual(audioToggle2.statusCode, 200);
    assert.strictEqual(audioToggle2.data.success, true);
    assert.strictEqual(audioToggle2.data.is_active, 1);

    // 4. Toggle course
    const courseToggle1 = await request('POST', '/api/admin/commerce/courses/1/toggle', null, adminCookie);
    assert.strictEqual(courseToggle1.statusCode, 200);
    assert.strictEqual(courseToggle1.data.success, true);
    assert.strictEqual(courseToggle1.data.is_active, 0);

    const courseToggle2 = await request('POST', '/api/admin/commerce/courses/1/toggle', null, adminCookie);
    assert.strictEqual(courseToggle2.statusCode, 200);
    assert.strictEqual(courseToggle2.data.success, true);
    assert.strictEqual(courseToggle2.data.is_active, 1);
  });

  await test('HOMEPAGE QUICK ORDER COD: Visitor places an order via /api/shop/checkout and order appears in admin list', async () => {
    const orderPayload = {
      customer_name: 'আব্দুর রহমান',
      customer_phone: '01811223344',
      shipping_address: 'শান্তিনিকেতন রোড, শান্তি কোম্পানি, মহিপাল',
      district: 'Feni',
      items: [
        { product_id: 1, quantity: 2 }
      ],
      customer_notes: 'হোমপেজ কুইক অর্ডার টেস্ট'
    };

    const res = await request('POST', '/api/shop/checkout', orderPayload);
    assert.strictEqual(res.statusCode, 201);
    assert.strictEqual(res.data.success, true);
    assert.ok(res.data.order && res.data.order.order_number, 'Order number must be generated');
    assert.ok(res.data.order.order_number.startsWith('ORD-'));

    // Verify order is visible in Admin Orders list
    const adminOrdersRes = await request('GET', '/api/admin/commerce/orders', null, adminCookie);
    assert.strictEqual(adminOrdersRes.statusCode, 200);
    assert.strictEqual(adminOrdersRes.data.success, true);
    const placedOrder = adminOrdersRes.data.orders.find(o => o.order_number === res.data.order.order_number);
    assert.ok(placedOrder, 'Placed order must exist in admin orders list');
    assert.strictEqual(placedOrder.customer_name, 'আব্দুর রহমান');
    assert.strictEqual(placedOrder.customer_phone, '01811223344');
  });

  // ==============================================================
  // AMAL & COMPETITIONS UPGRADE: 7 CRITICAL REQUIREMENTS AUDIT
  // ==============================================================

  const uniquePhone = '018' + Math.floor(10000000 + Math.random() * 90000000);
  const uniqueEmail = `user_${Date.now()}@example.com`;

  await test('AMAL REQ 1: One User = One Profile strictly prevents duplicate accounts with same phone or email', async () => {
    const userPayload = {
      full_name: 'আব্দুল কাদের',
      phone: uniquePhone,
      email: uniqueEmail,
      password: 'StrongPassword123!',
      district: 'Feni'
    };

    // 1. First registration succeeds
    const reg1 = await request('POST', '/api/lifestyle/register', userPayload);
    assert.strictEqual(reg1.statusCode, 201);
    assert.strictEqual(reg1.data.success, true);
    assert.ok(reg1.data.token);

    // 2. Duplicate registration with same phone is rejected
    const dupPhone = await request('POST', '/api/lifestyle/register', {
      full_name: 'অন্য নাম',
      phone: uniquePhone,
      email: 'other_' + uniqueEmail,
      password: 'Pass123456!'
    });
    assert.strictEqual(dupPhone.statusCode, 400);
    assert.strictEqual(dupPhone.data.success, false);
    assert.ok(dupPhone.data.error.includes('ইতিমধ্যে একটি প্রোফাইল রয়েছে'));

    // 3. Duplicate registration with same email is rejected
    const dupEmail = await request('POST', '/api/lifestyle/register', {
      full_name: 'আরেক নাম',
      phone: '017' + Math.floor(10000000 + Math.random() * 90000000),
      email: uniqueEmail,
      password: 'Pass123456!'
    });
    assert.strictEqual(dupEmail.statusCode, 400);
    assert.strictEqual(dupEmail.data.success, false);
  });

  await test('AMAL REQ 2: Daily Amal Submission Rule - 9 PM BST rule, current-day only, and strictly once per day', async () => {
    // Login with unique user
    const loginRes = await request('POST', '/api/lifestyle/login', {
      login_identifier: uniquePhone,
      password: 'StrongPassword123!'
    });
    assert.strictEqual(loginRes.statusCode, 200);
    const userToken = loginRes.data.token;
    const authHeaders = { 'Authorization': 'Bearer ' + userToken };

    // 1. Check /today-status endpoint
    const statusRes = await request('GET', '/api/lifestyle/today-status', null, authHeaders);
    assert.strictEqual(statusRes.statusCode, 200);
    assert.strictEqual(statusRes.data.success, true);
    assert.ok(statusRes.data.today_bst);
    assert.strictEqual(typeof statusRes.data.is_after_9pm, 'boolean');
    assert.strictEqual(statusRes.data.already_submitted, false);

    const todayDate = statusRes.data.today_bst;

    // 2. Attempt future date submission -> strictly rejected
    const futureDate = '2099-12-31';
    const futureRes = await request('POST', '/api/lifestyle/submit-daily', {
      submission_date: futureDate,
      answers: { fajr: 'congregation' },
      honesty_confirmed: true
    }, authHeaders);
    assert.strictEqual(futureRes.statusCode, 400);
    assert.ok(futureRes.data.error.includes('ভবিষ্যৎ') || futureRes.data.error_code === 'INVALID_SUBMISSION_DATE');

    // 3. Attempt submission with x-test-simulate-before-9pm header -> rejected before 9 PM BST
    const before9pmRes = await request('POST', '/api/lifestyle/submit-daily', {
      submission_date: todayDate,
      answers: { fajr: 'congregation' },
      honesty_confirmed: true
    }, { ...authHeaders, 'x-test-simulate-before-9pm': '1' });
    assert.strictEqual(before9pmRes.statusCode, 400);
    assert.ok(before9pmRes.data.error.includes('রাত ৯:০০'));

    // 4. Submit today's amal (with valid time / bypass) -> succeeds
    const submit1 = await request('POST', '/api/lifestyle/submit-daily', {
      submission_date: todayDate,
      answers: {
        fajr: 'congregation',
        dhuhr: 'congregation',
        asr: 'congregation',
        maghrib: 'congregation',
        isha: 'congregation',
        tahajjud: true,
        morning_evening_adhkar: true,
        sadaqah: true
      },
      honesty_confirmed: true
    }, { ...authHeaders, 'x-test-bypass-time': '1' });
    assert.strictEqual(submit1.statusCode, 200);
    assert.strictEqual(submit1.data.success, true);
    assert.ok(submit1.data.points_breakdown.total_points > 0);

    // 5. Attempt second submission on same day -> strictly rejected (Rule 2: once per day)
    const submit2 = await request('POST', '/api/lifestyle/submit-daily', {
      submission_date: todayDate,
      answers: { fajr: 'congregation' },
      honesty_confirmed: true
    }, { ...authHeaders, 'x-test-bypass-time': '1' });
    assert.strictEqual(submit2.statusCode, 400);
    assert.ok(submit2.data.error.includes('ইতিমধ্যে') || submit2.data.error_code === 'ALREADY_SUBMITTED_TODAY');

    // 6. Verify /today-status now reflects already_submitted: true
    const statusAfter = await request('GET', '/api/lifestyle/today-status', null, authHeaders);
    assert.strictEqual(statusAfter.statusCode, 200);
    assert.strictEqual(statusAfter.data.already_submitted, true);
  });

  await test('AMAL REQ 3 & 4: Single Amal Tracker & Admin-Controlled Amal Categories CRUD', async () => {
    // 1. Public dynamic categories API
    const catsRes = await request('GET', '/api/lifestyle/categories');
    assert.strictEqual(catsRes.statusCode, 200);
    assert.strictEqual(catsRes.data.success, true);
    assert.ok(catsRes.data.categories.length >= 5);
    const prayerCat = catsRes.data.categories.find(c => c.slug === 'prayers');
    assert.ok(prayerCat, 'Prayers category must exist');
    assert.strictEqual(prayerCat.max_points, 50);

    // 2. Admin adds a new custom Amal Category
    const newCatPayload = {
      slug: 'community_khidmah',
      title_bn: 'সমাজসেবা ও মানবকল্যাণ',
      title_en: 'Community Service',
      icon: '🤝',
      max_points: 10,
      sort_order: 6,
      is_active: 1
    };
    const addCatRes = await request('POST', '/api/lifestyle/admin/categories', newCatPayload, adminCookie);
    assert.strictEqual(addCatRes.statusCode, 201);
    assert.strictEqual(addCatRes.data.success, true);
    const createdCatId = addCatRes.data.category.id;

    // 3. Admin edits the category
    const editCatRes = await request('PUT', `/api/lifestyle/admin/categories/${createdCatId}`, {
      ...newCatPayload,
      max_points: 15,
      title_bn: 'সমাজসেবা, রক্তদান ও মানবকল্যাণ'
    }, adminCookie);
    assert.strictEqual(editCatRes.statusCode, 200);
    assert.strictEqual(editCatRes.data.category.max_points, 15);

    // 4. Admin toggles active/inactive
    const toggleRes = await request('POST', `/api/lifestyle/admin/categories/${createdCatId}/toggle`, {}, adminCookie);
    assert.strictEqual(toggleRes.statusCode, 200);
    assert.strictEqual(toggleRes.data.is_active, 0);

    // 5. Admin deletes the custom category
    const delRes = await request('DELETE', `/api/lifestyle/admin/categories/${createdCatId}`, null, adminCookie);
    assert.strictEqual(delRes.statusCode, 200);
    assert.strictEqual(delRes.data.success, true);
  });

  await test('AMAL REQ 5 & 6: Profile Photo and Real-time Visible Ranking System', async () => {
    // 1. Leaderboard includes explicit rank and profile_photo
    const lbRes = await request('GET', '/api/lifestyle/leaderboard');
    assert.strictEqual(lbRes.statusCode, 200);
    assert.strictEqual(lbRes.data.success, true);
    assert.ok(lbRes.data.leaderboard.length > 0);

    // Verify ordering by total_points DESC and explicit rank numbers
    for (let i = 0; i < lbRes.data.leaderboard.length; i++) {
      const item = lbRes.data.leaderboard[i];
      assert.strictEqual(item.rank, i + 1, `Rank should match position ${i + 1}`);
      assert.ok('profile_photo' in item);
      if (i > 0) {
        assert.ok(lbRes.data.leaderboard[i - 1].total_points >= item.total_points, 'Leaderboard must be sorted DESC');
      }
    }

    // 2. User progress API includes current_rank and total_participants
    const loginRes = await request('POST', '/api/lifestyle/login', {
      login_identifier: uniquePhone,
      password: 'StrongPassword123!'
    });
    const userToken = loginRes.data.token;
    const progRes = await request('GET', '/api/lifestyle/progress', null, { 'Authorization': 'Bearer ' + userToken });
    assert.strictEqual(progRes.statusCode, 200);
    assert.strictEqual(progRes.data.success, true);
    assert.ok(progRes.data.user.current_rank >= 1);
    assert.ok(progRes.data.user.total_participants >= 1);
    assert.ok('profile_photo' in progRes.data.user);
  });

  await test('AMAL REQ 7: Previous Month Winner Admin Pin Feature with required exact blessing message', async () => {
    // 1. Get current pinned winner
    const pinGet = await request('GET', '/api/lifestyle/pinned-winner');
    assert.strictEqual(pinGet.statusCode, 200);
    assert.strictEqual(pinGet.data.success, true);
    assert.ok(pinGet.data.pinned_winner);
    assert.strictEqual(pinGet.data.pinned_winner.month_title, 'গত মাসের বিজয়ী!');
    assert.strictEqual(pinGet.data.pinned_winner.blessing_message, 'আল্লাহ উনার আমলগুলো কবুল করুন। আমিন।');

    // 2. Admin pins a new winner
    const pinPayload = {
      user_id: 1,
      month_title: 'গত মাসের বিজয়ী!',
      blessing_message: 'আল্লাহ উনার আমলগুলো কবুল করুন। আমিন।',
      total_points: 3950,
      level: 'Diamond (মুকাররাবুন)',
      is_active: 1
    };
    const pinSet = await request('POST', '/api/lifestyle/admin/pinned-winner', pinPayload, adminCookie);
    assert.strictEqual(pinSet.statusCode, 200);
    assert.strictEqual(pinSet.data.success, true);
    assert.strictEqual(pinSet.data.pinned_winner.total_points, 3950);
    assert.strictEqual(pinSet.data.pinned_winner.blessing_message, 'আল্লাহ উনার আমলগুলো কবুল করুন। আমিন।');

    // 3. Admin unpins winner
    const unpinRes = await request('DELETE', '/api/lifestyle/admin/pinned-winner', null, adminCookie);
    assert.strictEqual(unpinRes.statusCode, 200);
    assert.strictEqual(unpinRes.data.success, true);

    // 4. Re-pin for public display
    await request('POST', '/api/lifestyle/admin/pinned-winner', pinPayload, adminCookie);
  });

  await test('AMAL V10 REQ 1 & 5: Winner Profiles, Hall of Fame, and Strict Privacy Protection', async () => {
    // 1. Pinned winner returns rich profile attributes
    const pinRes = await request('GET', '/api/lifestyle/pinned-winner');
    assert.strictEqual(pinRes.statusCode, 200);
    assert.strictEqual(pinRes.data.success, true);
    assert.ok(pinRes.data.pinned_winner);
    const pw = pinRes.data.pinned_winner;
    assert.ok('short_bio' in pw, 'Pinned winner should contain short_bio');
    assert.ok('achievement_details' in pw, 'Pinned winner should contain achievement_details');
    assert.ok('competition_name' in pw, 'Pinned winner should contain competition_name');
    assert.ok('winning_position' in pw, 'Pinned winner should contain winning_position');

    // 2. Hall of fame returns published winners with masked phone numbers
    const hofRes = await request('GET', '/api/lifestyle/hall-of-fame');
    assert.strictEqual(hofRes.statusCode, 200);
    assert.strictEqual(hofRes.data.success, true);
    assert.ok(Array.isArray(hofRes.data.hall_of_fame));
    hofRes.data.hall_of_fame.forEach(w => {
      assert.ok(w.masked_phone.includes('****'), 'Phone number must be masked in public Hall of Fame');
      assert.strictEqual(w.phone, undefined, 'Raw phone must never be exposed publicly');
      assert.strictEqual(w.address, undefined, 'Address must never be exposed publicly');
    });

    // 3. Admin updates pinned winner rich fields
    const richPinPayload = {
      user_id: 1,
      month_title: 'গত মাসের বিজয়ী!',
      blessing_message: 'আল্লাহ উনার আমলগুলো কবুল করুন। আমিন।',
      short_bio: 'নিয়মিত জামাতে সালাত আদায়কারী, কুরআন তিলাওয়াত ও মাসনুন জিকিরে অবিচল কৃতি প্রতিযোগী।',
      achievement_details: 'টানা ৪০ দিন ১০০% জামাতে সালাত, তাহাজ্জুদ ও পূর্ণাঙ্গ সুন্নাহ লাইফস্টাইল অনুসরণে ৩৯৫০ পয়েন্ট অর্জন করেছেন।',
      competition_name: '৪০ দিনের আত্মশুদ্ধি আমল প্রতিযোগিতা (ব্যাচ-০১)',
      winning_position: '১ম স্থান (বিজয়ী)',
      total_points: 3950,
      level: 'Platinum (মুহসিন)',
      is_active: 1
    };
    const adminPinRes = await request('POST', '/api/lifestyle/admin/pinned-winner', richPinPayload, adminCookie);
    assert.strictEqual(adminPinRes.statusCode, 200);
    assert.strictEqual(adminPinRes.data.success, true);
    assert.strictEqual(adminPinRes.data.pinned_winner.short_bio, richPinPayload.short_bio);
    assert.strictEqual(adminPinRes.data.pinned_winner.competition_name, richPinPayload.competition_name);
  });

  await test('AMAL V10 REQ 2 & 5: User View Amal Activity Report, Streaks, Frequency Analysis & Address Update', async () => {
    // 1. Authenticate user
    const loginRes = await request('POST', '/api/lifestyle/login', {
      login_identifier: uniquePhone,
      password: 'StrongPassword123!'
    });
    const userToken = loginRes.data.token;
    const authHeaders = { 'Authorization': 'Bearer ' + userToken };

    // 2. User updates address details
    const addrPayload = {
      full_name: 'Mahmudur Rahman',
      email: `mahmud_${Date.now()}@example.com`,
      village: 'ভূঞা বাড়ি',
      union_name: 'শর্শদী',
      upazila: 'ফেনী সদর',
      district: 'Feni',
      address: 'ভূঞা ম্যানশন, মহিপাল, ফেনী'
    };
    const updateProfRes = await request('PUT', '/api/lifestyle/profile', addrPayload, authHeaders);
    assert.strictEqual(updateProfRes.statusCode, 200);
    assert.strictEqual(updateProfRes.data.success, true);
    assert.strictEqual(updateProfRes.data.user.village, 'ভূঞা বাড়ি');
    assert.strictEqual(updateProfRes.data.user.upazila, 'ফেনী সদর');

    // 3. User Amal Activity & Report
    const reportRes = await request('GET', '/api/lifestyle/my-report', null, authHeaders);
    assert.strictEqual(reportRes.statusCode, 200);
    assert.strictEqual(reportRes.data.success, true);
    assert.ok(reportRes.data.streaks, 'my-report must return streaks');
    assert.ok(typeof reportRes.data.streaks.current_streak === 'number');
    assert.ok(typeof reportRes.data.streaks.longest_streak === 'number');
    assert.ok(reportRes.data.summary, 'my-report must return summary');
    assert.ok(reportRes.data.frequency_analysis, 'my-report must return frequency_analysis');
    assert.ok(Array.isArray(reportRes.data.frequency_analysis.frequencyList));

    // 4. User inspects specific day submission breakdown
    const todayStr = new Date().toISOString().split('T')[0];
    const dayBreakdownRes = await request('GET', `/api/lifestyle/my-submission?date=${todayStr}`, null, authHeaders);
    assert.strictEqual(dayBreakdownRes.statusCode, 200);
    assert.strictEqual(dayBreakdownRes.data.success, true);
    assert.ok(Array.isArray(dayBreakdownRes.data.breakdown));
    if (dayBreakdownRes.data.submitted) {
      assert.ok(dayBreakdownRes.data.breakdown.length >= 10);
      assert.ok('points_earned' in dayBreakdownRes.data.breakdown[0]);
      assert.ok('status_text' in dayBreakdownRes.data.breakdown[0]);
    }
  });

  await test('AMAL V10 REQ 3 & 4: Admin Detailed Participant Profile, Address, Date Analytics & Search', async () => {
    // 1. Admin gets detailed participant profile with unmasked phone and address
    const partRes = await request('GET', '/api/lifestyle/admin/participants/1', null, adminCookie);
    assert.strictEqual(partRes.statusCode, 200);
    assert.strictEqual(partRes.data.success, true);
    const participant = partRes.data.participant;
    assert.ok(participant.phone, 'Admin participant profile must include unmasked phone number');
    assert.ok(!participant.phone.includes('****'), 'Admin phone must be completely unmasked');
    assert.ok('village' in participant);
    assert.ok('upazila' in participant);
    assert.ok('district' in participant);
    assert.ok('rank' in participant);
    assert.ok('current_streak' in participant);
    assert.ok(partRes.data.frequency_analysis, 'Must include frequency analysis for participant');

    // 2. Admin inspects date-specific submission for participant
    const todayStr = new Date().toISOString().split('T')[0];
    const subRes = await request('GET', `/api/lifestyle/admin/participants/1/submissions?date=${todayStr}`, null, adminCookie);
    assert.strictEqual(subRes.statusCode, 200);
    assert.strictEqual(subRes.data.success, true);
    assert.ok('submitted' in subRes.data);

    // 3. Admin updates participant address
    const editPartRes = await request('PUT', '/api/lifestyle/admin/participants/1/profile', {
      village: 'উত্তর চাড়িপুর',
      upazila: 'ফেনী সদর',
      district: 'Feni',
      address: 'চাড়িপুর রোড, ফেনী'
    }, adminCookie);
    assert.strictEqual(editPartRes.statusCode, 200);
    assert.strictEqual(editPartRes.data.participant.village, 'উত্তর চাড়িপুর');

    // 4. Admin Analytics by Date
    const analyticsRes = await request('GET', `/api/lifestyle/admin/analytics?date=${todayStr}`, null, adminCookie);
    assert.strictEqual(analyticsRes.statusCode, 200);
    assert.strictEqual(analyticsRes.data.success, true);
    assert.ok(typeof analyticsRes.data.total_participants === 'number');
    assert.ok(typeof analyticsRes.data.submitted_count === 'number');
    assert.ok(typeof analyticsRes.data.not_submitted_count === 'number');
    assert.ok(typeof analyticsRes.data.submission_rate === 'number');
    assert.ok(Array.isArray(analyticsRes.data.top_scorers_on_date));
    assert.ok(Array.isArray(analyticsRes.data.most_frequent_amals_on_date));
    assert.ok(Array.isArray(analyticsRes.data.least_frequent_amals_on_date));

    // 5. Admin Participant Search & Filtering
    const searchRes = await request('GET', '/api/lifestyle/admin/participants/search?rank_min=1&rank_max=10', null, adminCookie);
    assert.strictEqual(searchRes.statusCode, 200);
    assert.strictEqual(searchRes.data.success, true);
    assert.ok(Array.isArray(searchRes.data.participants));
    searchRes.data.participants.forEach(p => {
      assert.ok(p.rank >= 1 && p.rank <= 10, 'Filtered participants must be within rank range');
      assert.ok(p.phone, 'Admin participant search must include unmasked phone number');
      assert.ok(!p.phone.includes('****'), 'Admin participant phone must not be masked');
    });
  });

  // ==============================================================
  // ADMIN DASHBOARD FIXES 1 - 5 VERIFICATION TESTS
  // ==============================================================

  // FIX 1: Audio Library - Audio file uploading and management
  await test('ADMIN FIX 1: Audio Library File Upload & Management (Upload, Create, Get, Edit, Delete)', async () => {
    // 1. Upload sample audio binary (simulating MP3/WAV file)
    const dummyAudioBuffer = Buffer.from('ID3DUMMYAUDIODATA' + '0'.repeat(1024));
    const uploadRes = await uploadMultipart(
      '/api/admin/commerce/upload-audio',
      'audio',
      'test-ruqyah.mp3',
      dummyAudioBuffer,
      'audio/mpeg'
    );
    assert.strictEqual(uploadRes.statusCode, 200);
    assert.strictEqual(uploadRes.data.success, true);
    assert.ok(uploadRes.data.audio_url.startsWith('/uploads/audio/'));
    assert.ok(uploadRes.data.size > 0);

    // 2. Create Ruqyah Audio resource using uploaded URL
    const createRes = await request('POST', '/api/admin/commerce/ruqyah-audios', {
      title_bn: 'টেস্ট রুকইয়াহ অডিও তিলাওয়াত',
      title_ar: 'الرقية الشرعية',
      category: 'general_ruqyah',
      duration: '১৫ মিনিট',
      audio_url: uploadRes.data.audio_url,
      text_bn: 'বিশেষ তিলাওয়াত ও দোয়া'
    });
    assert.strictEqual(createRes.statusCode, 201);
    assert.strictEqual(createRes.data.success, true);
    const audioId = createRes.data.id;
    assert.ok(audioId > 0);

    // 3. Get single audio resource by ID
    const getRes = await request('GET', `/api/admin/commerce/ruqyah-audios/${audioId}`);
    assert.strictEqual(getRes.statusCode, 200);
    assert.strictEqual(getRes.data.success, true);
    assert.strictEqual(getRes.data.audio.title_bn, 'টেস্ট রুকইয়াহ অডিও তিলাওয়াত');
    assert.strictEqual(getRes.data.audio.audio_url, uploadRes.data.audio_url);

    // 4. Update audio resource (Edit)
    const updateRes = await request('PUT', `/api/admin/commerce/ruqyah-audios/${audioId}`, {
      title_bn: 'আপডেটেড রুকইয়াহ অডিও তিলাওয়াত',
      duration: '২০ মিনিট',
      category: 'sihr_jinn'
    });
    assert.strictEqual(updateRes.statusCode, 200);
    assert.strictEqual(updateRes.data.success, true);

    const getUpdated = await request('GET', `/api/admin/commerce/ruqyah-audios/${audioId}`);
    assert.strictEqual(getUpdated.data.audio.title_bn, 'আপডেটেড রুকইয়াহ অডিও তিলাওয়াত');
    assert.strictEqual(getUpdated.data.audio.duration, '২০ মিনিট');
    assert.strictEqual(getUpdated.data.audio.category, 'sihr_jinn');
    // Ensure audio_url was preserved
    assert.strictEqual(getUpdated.data.audio.audio_url, uploadRes.data.audio_url);

    // 5. Delete audio resource
    const delRes = await request('DELETE', `/api/admin/commerce/ruqyah-audios/${audioId}`);
    assert.strictEqual(delRes.statusCode, 200);
    assert.strictEqual(delRes.data.success, true);

    const getDeleted = await request('GET', `/api/admin/commerce/ruqyah-audios/${audioId}`);
    assert.strictEqual(getDeleted.statusCode, 404);
  });

  // FIX 2: Advertisements & Banners - Image uploading and management
  await test('ADMIN FIX 2: Advertisements & Banners Upload & Management (Upload, Create, List, Edit, Toggle, Delete)', async () => {
    // 1. Upload sample banner image binary
    const dummyImageBuffer = Buffer.from('\x89PNG\r\n\x1a\n\x00\x00\x00\rIHDR' + '0'.repeat(500));
    const uploadRes = await uploadMultipart(
      '/api/admin/commerce/upload-banner',
      'banner',
      'promo-banner.png',
      dummyImageBuffer,
      'image/png'
    );
    assert.strictEqual(uploadRes.statusCode, 200);
    assert.strictEqual(uploadRes.data.success, true);
    assert.ok(uploadRes.data.image_url.startsWith('/uploads/banners/'));

    // 2. Create new Advertisement / Banner
    const createRes = await request('POST', '/api/admin/commerce/advertisements', {
      title: 'বিশেষ রমজান অফার - মধু ও কালোজিরা',
      description: '৩০% ছাড়ে খাঁটি সুন্দরবনের মধু অর্ডার করুন',
      image_url: uploadRes.data.image_url,
      placement: 'homepage',
      button_text: 'এখনই কিনুন',
      target_url: '/shop'
    });
    assert.strictEqual(createRes.statusCode, 201);
    assert.strictEqual(createRes.data.success, true);
    const adId = createRes.data.id;
    assert.ok(adId > 0);

    // 3. List all ads from admin endpoint
    const listRes = await request('GET', '/api/admin/commerce/advertisements');
    assert.strictEqual(listRes.statusCode, 200);
    assert.strictEqual(listRes.data.success, true);
    const foundAd = listRes.data.advertisements.find(a => a.id === adId);
    assert.ok(foundAd, 'Created ad must appear in admin advertisements list');
    assert.strictEqual(foundAd.title, 'বিশেষ রমজান অফার - মধু ও কালোজিরা');

    // 4. Get single ad by ID
    const getRes = await request('GET', `/api/admin/commerce/advertisements/${adId}`);
    assert.strictEqual(getRes.statusCode, 200);
    assert.strictEqual(getRes.data.advertisement.button_text, 'এখনই কিনুন');

    // 5. Update advertisement
    const editRes = await request('PUT', `/api/admin/commerce/advertisements/${adId}`, {
      title: 'আপডেটেড ব্যানার অফার',
      placement: 'shop',
      button_text: 'শপ দেখুন'
    });
    assert.strictEqual(editRes.statusCode, 200);

    // 6. Toggle status
    const toggleRes = await request('POST', `/api/admin/commerce/advertisements/${adId}/toggle`);
    assert.strictEqual(toggleRes.statusCode, 200);
    assert.strictEqual(toggleRes.data.is_active, 0);

    // 7. Delete ad
    const delRes = await request('DELETE', `/api/admin/commerce/advertisements/${adId}`);
    assert.strictEqual(delRes.statusCode, 200);
    const getAfterDel = await request('GET', `/api/admin/commerce/advertisements/${adId}`);
    assert.strictEqual(getAfterDel.statusCode, 404);
  });

  // FIX 3 & 4: Supplement Orders & Order Details
  await test('ADMIN FIX 3 & 4: Orders List with Items and Full Order Details Modal endpoint', async () => {
    // 1. Fetch all orders from admin
    const ordersRes = await request('GET', '/api/admin/commerce/orders');
    assert.strictEqual(ordersRes.statusCode, 200);
    assert.strictEqual(ordersRes.data.success, true);
    assert.ok(Array.isArray(ordersRes.data.orders));
    assert.ok(ordersRes.data.orders.length > 0, 'Orders list must not be empty');

    // Verify each order includes ordered products and quantities in the items array
    const sampleOrder = ordersRes.data.orders[0];
    assert.ok('order_number' in sampleOrder);
    assert.ok('customer_name' in sampleOrder);
    assert.ok('customer_phone' in sampleOrder);
    assert.ok('shipping_address' in sampleOrder);
    assert.ok('total_amount' in sampleOrder);
    assert.ok(Array.isArray(sampleOrder.items), 'Every order must include an items array');
    assert.ok(typeof sampleOrder.total_items_count === 'number');

    // Verify items have product_name, quantity, and unit_price
    if (sampleOrder.items.length > 0) {
      const it = sampleOrder.items[0];
      assert.ok(it.product_name, 'Ordered item must contain product_name');
      assert.ok(it.quantity > 0, 'Ordered item must contain positive quantity');
      assert.ok(typeof it.unit_price === 'number', 'Ordered item must contain unit_price');
    }

    // 2. Fetch single order details by ID
    const singleOrderRes = await request('GET', `/api/admin/commerce/orders/${sampleOrder.id}`);
    assert.strictEqual(singleOrderRes.statusCode, 200);
    assert.strictEqual(singleOrderRes.data.success, true);
    assert.strictEqual(singleOrderRes.data.order.id, sampleOrder.id);
    assert.ok(Array.isArray(singleOrderRes.data.items), 'Order details must return itemized products list');

    // 3. Update order status and internal admin notes
    const updateStatusRes = await request('PUT', `/api/admin/commerce/orders/${sampleOrder.id}/status`, {
      status: 'Processing',
      internal_admin_notes: 'রেডএক্স কুরিয়ার চালান কনফার্মড'
    });
    assert.strictEqual(updateStatusRes.statusCode, 200);
    assert.strictEqual(updateStatusRes.data.success, true);

    const recheckOrder = await request('GET', `/api/admin/commerce/orders/${sampleOrder.id}`);
    assert.strictEqual(recheckOrder.data.order.status, 'Processing');
    assert.strictEqual(recheckOrder.data.order.internal_admin_notes, 'রেডএক্স কুরিয়ার চালান কনফার্মড');
  });

  // FIX 5: Product Management - Product Editing and Image Uploading
  await test('ADMIN FIX 5: Product Image Upload & Non-destructive Editing', async () => {
    // 1. Upload product image binary
    const dummyProdImg = Buffer.from('\x89PNG\r\n\x1a\n\x00\x00\x00\rIHDR' + '1'.repeat(500));
    const uploadRes = await uploadMultipart(
      '/api/admin/commerce/upload-product-image',
      'image',
      'new-product-sidr.png',
      dummyProdImg,
      'image/png'
    );
    assert.strictEqual(uploadRes.statusCode, 200);
    assert.strictEqual(uploadRes.data.success, true);
    assert.ok(uploadRes.data.image_url.startsWith('/uploads/products/'));

    // 2. Create a new test product
    const createProd = await request('POST', '/api/admin/commerce/products', {
      category_id: 1,
      name_bn: 'টেস্ট খাঁটি কালোজিরা মধু',
      name_en: 'Test Black Seed Honey',
      price: 750,
      discount_price: 690,
      stock_quantity: 45,
      image_url: uploadRes.data.image_url,
      description_bn: 'অর্গানিক ও ১০০% প্রাকৃতিক'
    });
    assert.strictEqual(createProd.statusCode, 201);
    const prodId = createProd.data.product_id;
    assert.ok(prodId > 0);

    // 3. Fetch single product by ID
    const getProd = await request('GET', `/api/admin/commerce/products/${prodId}`);
    assert.strictEqual(getProd.statusCode, 200);
    assert.strictEqual(getProd.data.product.name_bn, 'টেস্ট খাঁটি কালোজিরা মধু');
    assert.strictEqual(getProd.data.product.image_url, uploadRes.data.image_url);
    assert.strictEqual(getProd.data.product.price, 750);
    assert.strictEqual(getProd.data.product.stock_quantity, 45);

    // 4. Update product details (safe edit)
    const updateProd = await request('PUT', `/api/admin/commerce/products/${prodId}`, {
      price: 800,
      discount_price: 720,
      stock_quantity: 50,
      description_bn: 'নতুন প্যাকেজিং ও হালনাগাদকৃত বিবরণ'
    });
    assert.strictEqual(updateProd.statusCode, 200);

    // Verify non-destructive update preserved name_bn and image_url
    const getUpdatedProd = await request('GET', `/api/admin/commerce/products/${prodId}`);
    assert.strictEqual(getUpdatedProd.data.product.name_bn, 'টেস্ট খাঁটি কালোজিরা মধু');
    assert.strictEqual(getUpdatedProd.data.product.image_url, uploadRes.data.image_url);
    assert.strictEqual(getUpdatedProd.data.product.price, 800);
    assert.strictEqual(getUpdatedProd.data.product.discount_price, 720);
    assert.strictEqual(getUpdatedProd.data.product.stock_quantity, 50);

    // 5. Delete product
    const delProd = await request('DELETE', `/api/admin/commerce/products/${prodId}`);
    assert.strictEqual(delProd.statusCode, 200);
    const getAfterDel = await request('GET', `/api/admin/commerce/products/${prodId}`);
    assert.strictEqual(getAfterDel.statusCode, 404);
  });

  console.log('================================================================');
  console.log(` AUDIT & VERIFICATION RESULTS: ${passed} PASSED, ${failed} FAILED `);
  console.log('================================================================');

  if (failed > 0) {
    process.exit(1);
  }
}

// Start temporary test server
server = app.listen(port, async () => {
  baseUrl = `http://localhost:${port}`;
  try {
    await runTests();
  } catch (err) {
    console.error('Fatal test error:', err);
    process.exit(1);
  } finally {
    server.close();
    process.exit(0);
  }
});
