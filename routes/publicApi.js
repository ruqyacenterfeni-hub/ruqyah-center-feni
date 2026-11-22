const express = require('express');
const router = express.Router();
const db = require('../database/db');
const { getAvailabilityForDate, isDateInPast, isWeeklyHoliday } = require('../utils/timeUtils');
const { TIME_SLOTS, CLINIC } = require('../config/constants');

/**
 * GET /api/public/info
 * Returns clinic profile and public contact settings
 */
router.get('/info', (req, res) => {
  try {
    const settings = db.prepare('SELECT * FROM clinic_settings WHERE id = 1').get() || CLINIC;
    res.json({ success: true, data: settings });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

/**
 * GET /api/public/notice
 * Returns the currently active scrolling notice / announcement
 */
router.get('/notice', (req, res) => {
  try {
    const notice = db.prepare(`
      SELECT id, title_bn, title_en, content_bn, content_en, is_active, updated_at
      FROM announcements
      WHERE is_active = 1
      ORDER BY display_order ASC, id DESC
      LIMIT 1
    `).get();

    res.json({
      success: true,
      hasNotice: !!notice && (!!notice.content_bn || !!notice.content_en),
      data: notice || null
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

/**
 * GET /api/public/services
 * Returns all active services with dynamic prices
 */
router.get('/services', (req, res) => {
  try {
    const services = db.prepare(`
      SELECT id, code, name, category, description, duration_minutes, price, discount_price, display_order
      FROM services
      WHERE is_active = 1
      ORDER BY display_order ASC, id ASC
    `).all();

    res.json({ success: true, data: services });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

/**
 * GET /api/public/diagnosis/categories
 * Returns active 9 categories and 10 symptoms each (90 total)
 */
router.get('/diagnosis/categories', (req, res) => {
  try {
    const categories = db.prepare(`
      SELECT id, code, name_bn, name_en, description_bn, description_en, sort_order, status
      FROM diagnosis_categories
      WHERE status = 'active'
      ORDER BY sort_order ASC, id ASC
    `).all();

    const getSymptomsStmt = db.prepare(`
      SELECT id, category_id, symptom_bn, symptom_en, sort_order, status
      FROM diagnosis_symptoms
      WHERE category_id = ? AND status = 'active'
      ORDER BY sort_order ASC, id ASC
    `);

    const result = categories.map(cat => ({
      ...cat,
      symptoms: getSymptomsStmt.all(cat.id)
    }));

    res.json({ success: true, count: result.length, data: result });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

/**
 * GET /api/public/availability
 * Checks real-time availability for a specific date
 */
router.get('/availability', (req, res) => {
  try {
    const { date } = req.query;
    if (!date) {
      return res.status(400).json({ success: false, error: 'Query parameter "date" (YYYY-MM-DD) is required.' });
    }

    const availability = getAvailabilityForDate(date);
    res.json(availability);
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

/**
 * POST /api/public/book
 * Concurrency-safe atomic appointment booking
 */
router.post('/book', (req, res) => {
  try {
    const {
      full_name,
      phone,
      address,
      service_id,
      service_type,
      number_of_patients = 1,
      appointment_date,
      time_slot,
      additional_notes
    } = req.body;

    // 1. Validation
    if (!full_name || !phone || !address || (!service_id && !service_type) || !appointment_date || !time_slot) {
      return res.status(400).json({
        success: false,
        error: 'Please fill in all mandatory fields: Full Name, Phone, Address, Service, Date, and Time Slot.'
      });
    }

    // Verify time slot is in standard slots
    const validSlot = TIME_SLOTS.find(s => s.label === time_slot);
    if (!validSlot) {
      return res.status(400).json({
        success: false,
        error: 'Invalid time slot selected. Please select an approved daily clinic slot.'
      });
    }

    // Check date not in past
    if (isDateInPast(appointment_date)) {
      return res.status(400).json({
        success: false,
        error: 'Appointments cannot be booked for past dates.'
      });
    }

    // Check weekly holiday
    if (isWeeklyHoliday(appointment_date)) {
      return res.status(400).json({
        success: false,
        error: 'The clinic is closed on this weekly holiday for public appointments.'
      });
    }

    let packageType = (req.body.package_type || '').toLowerCase();
    let numPatients = parseInt(number_of_patients, 10);
    if (isNaN(numPatients) || numPatients < 1) {
      numPatients = 1;
    }

    // Verify service exists and is active
    let service = null;
    if (service_id) {
      service = db.prepare('SELECT id, code, name, price, discount_price, category FROM services WHERE id = ? AND is_active = 1').get(service_id);
    }

    if (!service && service_type) {
      const st = String(service_type).toLowerCase();
      if (st === 'family' || st.includes('ফ্যামিলি') || packageType === 'family') {
        service = db.prepare("SELECT * FROM services WHERE code = 'family' AND is_active = 1").get();
      } else if (st.includes('ruqyah') || st.includes('রুকইয়াহ')) {
        service = db.prepare("SELECT * FROM services WHERE code = 'ruqyah' AND is_active = 1").get() ||
                  db.prepare("SELECT * FROM services WHERE name LIKE '%রুকইয়াহ%' AND code != 'family' AND is_active = 1").get();
      } else if (st.includes('hijama') || st.includes('হিজামা')) {
        service = db.prepare("SELECT * FROM services WHERE code = 'hijama' AND is_active = 1").get() ||
                  db.prepare("SELECT * FROM services WHERE name LIKE '%হিজামা%' AND is_active = 1").get();
      }
    }

    if (!service) {
      if (packageType === 'family') {
        service = db.prepare("SELECT * FROM services WHERE code = 'family' AND is_active = 1").get();
      } else {
        service = db.prepare("SELECT * FROM services WHERE code = 'ruqyah' AND is_active = 1").get();
      }
    }

    if (!service) {
      return res.status(400).json({
        success: false,
        error: 'Selected service is currently unavailable or inactive.'
      });
    }

    const isFamily = service.code === 'family' || packageType === 'family' || (service.name && service.name.includes('ফ্যামিলি'));
    if (isFamily) {
      packageType = 'family';
      if (numPatients > 6) {
        return res.status(400).json({
          success: false,
          error: 'ফ্যামিলি প্যাকেজে সর্বোচ্চ ৬ জন রোগীর জন্য বুকিং করা সম্ভব। ৬ জনের বেশি হলে অনুগ্রহ করে আলাদা বুকিং করুন বা ক্লিনিকে যোগাযোগ করুন।'
        });
      }
    } else {
      packageType = 'standard';
    }

    // 2. Atomic Database Transaction (Strict Concurrency Control)
    const bookTransaction = db.transaction(() => {
      // Check date closed
      const isClosed = db.prepare('SELECT reason FROM closed_dates WHERE closed_date = ?').get(appointment_date);
      if (isClosed) {
        throw new Error(isClosed.reason || 'This date is closed by clinic administration.');
      }

      // Check slot blocked
      const isBlocked = db.prepare('SELECT reason FROM blocked_time_slots WHERE slot_date = ? AND time_slot = ?').get(appointment_date, time_slot);
      if (isBlocked) {
        throw new Error('This time slot is reserved or blocked by the clinic.');
      }

      // Check slot already booked
      const existing = db.prepare(`
        SELECT id FROM appointments 
        WHERE appointment_date = ? AND time_slot = ? AND status NOT IN ('Cancelled')
      `).get(appointment_date, time_slot);

      if (existing) {
        throw new Error('This time slot has just been booked by another patient. Please choose an alternative slot.');
      }

      // Find or create patient record
      let patient = db.prepare('SELECT id, patient_id FROM patients WHERE phone = ?').get(phone.trim());
      let patientId = null;

      if (patient) {
        patientId = patient.patient_id;
        // Update patient info if address or name changed
        db.prepare('UPDATE patients SET full_name = ?, address = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?')
          .run(full_name.trim(), address.trim(), patient.id);
      } else {
        // Generate new Patient ID
        const lastPatient = db.prepare('SELECT id FROM patients ORDER BY id DESC LIMIT 1').get();
        const nextNum = (lastPatient ? lastPatient.id : 0) + 1001;
        patientId = `RSCC-P-${nextNum}`;

        db.prepare(`
          INSERT INTO patients (patient_id, full_name, phone, age, gender, address, notes)
          VALUES (?, ?, ?, ?, ?, ?, ?)
        `).run(
          patientId,
          full_name.trim(),
          phone.trim(),
          30, // Default approximate age until clinical intake
          'Unspecified',
          address.trim(),
          'Registered via public online booking portal.'
        );
      }

      // Generate unique Appointment ID
      const datePart = appointment_date.replace(/-/g, '');
      const randomSuffix = Math.floor(1000 + Math.random() * 9000);
      const appointmentId = `APT-${datePart}-${randomSuffix}`;

      // Price calculation
      const isHijama = service.code === 'hijama' || (service.name && service.name.includes('হিজামা'));
      const sType = isHijama ? 'hijama' : 'ruqyah';
      
      let sPrice = null;
      let perPatientPrice = null;

      if (!isHijama) {
        if (packageType === 'family') {
          // Fixed 6000 BDT for family package (up to 6 patients)
          sPrice = service.discount_price || service.price || 6000;
          perPatientPrice = null;
        } else {
          // Standard Ruqyah: unit price * number of patients
          perPatientPrice = service.discount_price || service.price || 2050;
          sPrice = perPatientPrice * numPatients;
        }
      }

      function toBnNumber(num) {
        if (num === null || num === undefined) return '';
        const enStr = Number(num).toLocaleString('en-IN');
        const bnDigits = { '0': '০', '1': '১', '2': '২', '3': '৩', '4': '৪', '5': '৫', '6': '৬', '7': '৭', '8': '৮', '9': '৯', ',': ',' };
        return enStr.split('').map(c => bnDigits[c] || c).join('');
      }

      let priceDisplay = 'খরচ পরামর্শের মাধ্যমে নির্ধারণ করা হবে।';
      if (!isHijama && sPrice !== null) {
        priceDisplay = `${toBnNumber(sPrice)} টাকা`;
      }

      // Insert Appointment
      db.prepare(`
        INSERT INTO appointments (
          appointment_id, patient_id, patient_name, patient_phone, patient_address,
          service_id, service_name, service_type, service_price, original_price,
          adjusted_price, is_price_overridden, per_patient_price, package_type,
          appointment_date, time_slot, appointment_time, slot_start_time,
          number_of_patients, additional_notes, notes, status
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'Pending')
      `).run(
        appointmentId,
        patientId,
        full_name.trim(),
        phone.trim(),
        address.trim(),
        service.id,
        service.name,
        sType,
        sPrice,
        sPrice,
        sPrice,
        perPatientPrice,
        packageType,
        appointment_date,
        time_slot,
        time_slot,
        validSlot.start,
        numPatients,
        additional_notes ? additional_notes.trim() : null,
        additional_notes ? additional_notes.trim() : null
      );

      return {
        appointment_id: appointmentId,
        patient_id: patientId,
        patient_name: full_name.trim(),
        patient_phone: phone.trim(),
        patient_address: address.trim(),
        service_id: service.id,
        service_name: service.name,
        service_type: sType,
        package_type: packageType,
        number_of_patients: numPatients,
        price: sPrice,
        price_display: priceDisplay,
        appointment_date,
        time_slot,
        status: 'Pending'
      };
    });

    const appointmentResult = bookTransaction();

    // Prepare WhatsApp direct link
    const waText = encodeURIComponent(
      `Assalamu Alaikum. I have booked an appointment at Ruqyah Support & Cupping Center (Feni Branch).\n\nAppointment ID: ${appointmentResult.appointment_id}\nPatient: ${appointmentResult.patient_name}\nDate: ${appointmentResult.appointment_date}\nTime: ${appointmentResult.time_slot}\nService: ${appointmentResult.service_name}`
    );
    const whatsappLink = `https://wa.me/8801758354920?text=${waText}`;

    res.status(201).json({
      success: true,
      message: 'Your appointment has been successfully scheduled!',
      data: {
        ...appointmentResult,
        whatsapp_link: whatsappLink,
        clinic_phone: CLINIC.PHONE,
        clinic_address: CLINIC.ADDRESS
      }
    });

  } catch (err) {
    res.status(400).json({
      success: false,
      error: err.message || 'Failed to complete appointment booking.'
    });
  }
});

/**
 * GET /api/public/lookup
 * Allows patients to verify their booking status
 */
router.get('/lookup', (req, res) => {
  try {
    const { q } = req.query;
    if (!q || !q.trim()) {
      return res.status(400).json({ success: false, error: 'Please enter an Appointment ID or Mobile Number.' });
    }

    const term = q.trim();
    const appointments = db.prepare(`
      SELECT 
        appointment_id, patient_id, patient_name, patient_phone,
        service_name, service_type, service_price, appointment_date, time_slot, status, created_at
      FROM appointments
      WHERE appointment_id = ? OR patient_phone = ?
      ORDER BY appointment_date DESC, id DESC
      LIMIT 10
    `).all(term, term);

    if (appointments.length === 0) {
      return res.status(404).json({
        success: false,
        error: 'No appointments found matching the provided details.'
      });
    }

    res.json({ success: true, count: appointments.length, data: appointments });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

/**
 * POST /api/public/contact
 * Handles contact form messages
 */
router.post('/contact', (req, res) => {
  try {
    const { name, phone, subject, message } = req.body;
    if (!name || !phone || !message) {
      return res.status(400).json({ success: false, error: 'Name, Phone and Message are required.' });
    }

    db.prepare(`
      INSERT INTO contact_messages (name, phone, subject, message)
      VALUES (?, ?, ?, ?)
    `).run(name.trim(), phone.trim(), subject ? subject.trim() : 'General Inquiry', message.trim());

    res.json({
      success: true,
      message: 'Thank you for reaching out. Our center will contact you shortly.'
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

/**
 * GET /api/public/articles
 * Returns list of published articles and case studies
 */
router.get('/articles', (req, res) => {
  try {
    const { category, limit = 20, lang = 'bn' } = req.query;
    let query = `
      SELECT id, title_bn, title_en, slug_bn, slug_en, category_bn, category_en,
             excerpt_bn, excerpt_en, featured_image, author_name, published_at
      FROM articles
      WHERE status = 'published'
    `;
    const params = [];

    if (category) {
      query += ' AND (category_bn = ? OR category_en = ?)';
      params.push(category, category);
    }

    query += ' ORDER BY published_at DESC, id DESC LIMIT ?';
    params.push(Number(limit) || 20);

    const articles = db.prepare(query).all(...params);
    res.json({ success: true, count: articles.length, data: articles });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

/**
 * GET /api/public/articles/:slug
 * Returns a specific article/case study by slug or id
 */
router.get('/articles/:slug', (req, res) => {
  try {
    const slug = req.params.slug;
    const article = db.prepare(`
      SELECT * FROM articles
      WHERE (slug_bn = ? OR slug_en = ? OR id = ?) AND status = 'published'
    `).get(slug, slug, isNaN(slug) ? -1 : Number(slug));

    if (!article) {
      return res.status(404).json({ success: false, error: 'Article not found or is unpublished.' });
    }

    res.json({ success: true, data: article });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

module.exports = router;
