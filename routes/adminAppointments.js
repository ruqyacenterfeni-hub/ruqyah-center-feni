const express = require('express');
const router = express.Router();
const db = require('../database/db');
const { requireAdmin } = require('../middleware/auth');
const { logAudit } = require('../middleware/audit');
const { TIME_SLOTS } = require('../config/constants');
const { getAvailabilityForDate, isDateInPast } = require('../utils/timeUtils');

router.use(requireAdmin);

/**
 * GET /api/admin/appointments
 * Search, filter and paginate appointments
 */
router.get('/', (req, res) => {
  try {
    const {
      search,
      date,
      service_id,
      status,
      limit = 50,
      offset = 0
    } = req.query;

    let query = `
      SELECT 
        a.id, a.appointment_id, a.patient_id, a.patient_name, a.patient_phone, a.patient_address,
        a.service_id, a.service_name, a.service_type, a.service_price, a.package_type,
        a.original_price, a.adjusted_price, a.is_price_overridden, a.per_patient_price,
        a.appointment_date, a.time_slot, a.appointment_time, a.slot_start_time,
        a.number_of_patients, a.additional_notes, a.notes, a.status, a.admin_notes, a.created_at,
        p.age as patient_age, p.gender as patient_gender
      FROM appointments a
      LEFT JOIN patients p ON a.patient_id = p.patient_id
      WHERE 1=1
    `;
    const params = [];

    if (search) {
      query += ` AND (a.patient_name LIKE ? OR a.patient_phone LIKE ? OR a.appointment_id LIKE ?)`;
      const s = `%${search.trim()}%`;
      params.push(s, s, s);
    }

    if (date) {
      query += ` AND a.appointment_date = ?`;
      params.push(date.trim());
    }

    if (service_id) {
      query += ` AND a.service_id = ?`;
      params.push(service_id);
    }

    if (status) {
      query += ` AND a.status = ?`;
      params.push(status.trim());
    }

    query += ` ORDER BY a.appointment_date DESC, a.slot_start_time ASC LIMIT ? OFFSET ?`;
    params.push(parseInt(limit, 10), parseInt(offset, 10));

    const appointments = db.prepare(query).all(...params);

    // Get total count for pagination
    let countQuery = `SELECT COUNT(*) as total FROM appointments a WHERE 1=1`;
    const countParams = [];
    if (search) {
      countQuery += ` AND (a.patient_name LIKE ? OR a.patient_phone LIKE ? OR a.appointment_id LIKE ?)`;
      const s = `%${search.trim()}%`;
      countParams.push(s, s, s);
    }
    if (date) {
      countQuery += ` AND a.appointment_date = ?`;
      countParams.push(date.trim());
    }
    if (service_id) {
      countQuery += ` AND a.service_id = ?`;
      countParams.push(service_id);
    }
    if (status) {
      countQuery += ` AND a.status = ?`;
      countParams.push(status.trim());
    }

    const total = db.prepare(countQuery).get(...countParams).total;

    res.json({
      success: true,
      total,
      data: appointments
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

/**
 * GET /api/admin/appointments/:id
 * Get single appointment with patient records and previous appointments
 */
router.get('/:id', (req, res) => {
  try {
    const appointment = db.prepare(`
      SELECT a.*, p.age, p.gender, p.emergency_contact, p.marital_status
      FROM appointments a
      LEFT JOIN patients p ON a.patient_id = p.patient_id
      WHERE a.id = ? OR a.appointment_id = ?
    `).get(req.params.id, req.params.id);

    if (!appointment) {
      return res.status(404).json({ success: false, error: 'Appointment not found.' });
    }

    // Previous appointments of this patient
    const patientHistoryAppointments = db.prepare(`
      SELECT appointment_id, service_name, appointment_date, time_slot, status
      FROM appointments
      WHERE (patient_id = ? OR patient_phone = ?) AND id != ?
      ORDER BY appointment_date DESC
      LIMIT 10
    `).all(appointment.patient_id, appointment.patient_phone, appointment.id);

    // Check if patient has Ruqyah sessions
    const sessions = appointment.patient_id ? db.prepare(`
      SELECT session_id, session_number, session_date, assessment_category, status
      FROM ruqyah_sessions
      WHERE patient_id = ?
      ORDER BY session_date DESC
    `).all(appointment.patient_id) : [];

    res.json({
      success: true,
      data: {
        ...appointment,
        patient_history_appointments: patientHistoryAppointments,
        patient_sessions: sessions
      }
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

/**
 * PUT /api/admin/appointments/:id/status
 * Update appointment status & admin notes
 */
router.put('/:id/status', (req, res) => {
  try {
    const { status, admin_notes } = req.body;
    const allowed = ['Pending', 'Confirmed', 'Completed', 'Cancelled', 'Rescheduled', 'No Show'];
    if (!allowed.includes(status)) {
      return res.status(400).json({ success: false, error: `Invalid status. Must be one of: ${allowed.join(', ')}` });
    }

    const appointment = db.prepare('SELECT * FROM appointments WHERE id = ? OR appointment_id = ?').get(req.params.id, req.params.id);
    if (!appointment) {
      return res.status(404).json({ success: false, error: 'Appointment not found.' });
    }

    let notesUpdate = appointment.admin_notes || '';
    if (admin_notes && admin_notes.trim()) {
      const timestamp = new Date().toISOString().replace('T', ' ').slice(0, 16);
      notesUpdate = notesUpdate ? `${notesUpdate}\n[${timestamp} - ${req.admin.name}]: ${admin_notes.trim()}` : `[${timestamp} - ${req.admin.name}]: ${admin_notes.trim()}`;
    }

    db.prepare(`
      UPDATE appointments
      SET status = ?, admin_notes = ?, updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `).run(status, notesUpdate, appointment.id);

    logAudit(
      req.admin.username,
      'UPDATE_APPOINTMENT_STATUS',
      'APPOINTMENT',
      appointment.appointment_id,
      `Changed status from ${appointment.status} to ${status}. Notes: ${admin_notes || 'None'}`,
      req
    );

    res.json({
      success: true,
      message: `Appointment ${appointment.appointment_id} status updated to ${status}.`,
      status
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

/**
 * POST /api/admin/appointments/:id/reschedule
 * Reschedule appointment to a new date and time slot
 */
router.post('/:id/reschedule', (req, res) => {
  try {
    const { new_date, new_time_slot, reason } = req.body;
    if (!new_date || !new_time_slot) {
      return res.status(400).json({ success: false, error: 'New date and new time slot are required.' });
    }

    const appointment = db.prepare('SELECT * FROM appointments WHERE id = ? OR appointment_id = ?').get(req.params.id, req.params.id);
    if (!appointment) {
      return res.status(404).json({ success: false, error: 'Appointment not found.' });
    }

    const validSlot = TIME_SLOTS.find(s => s.label === new_time_slot);
    if (!validSlot) {
      return res.status(400).json({ success: false, error: 'Invalid time slot.' });
    }

    // Atomic transaction
    const rescheduleTransaction = db.transaction(() => {
      // Check date closed
      const isClosed = db.prepare('SELECT reason FROM closed_dates WHERE closed_date = ?').get(new_date);
      if (isClosed) {
        throw new Error(isClosed.reason || 'This date is closed by clinic administration.');
      }

      // Check slot blocked
      const isBlocked = db.prepare('SELECT reason FROM blocked_time_slots WHERE slot_date = ? AND time_slot = ?').get(new_date, new_time_slot);
      if (isBlocked) {
        throw new Error('This time slot is blocked on the selected date.');
      }

      // Check existing booked slot (excluding this appointment) - max 2 patients per slot
      const bookedCount = db.prepare(`
        SELECT COUNT(*) as count FROM appointments
        WHERE appointment_date = ? AND time_slot = ? AND status NOT IN ('Cancelled') AND id != ?
      `).get(new_date, new_time_slot, appointment.id).count;

      if (bookedCount >= 2) {
        throw new Error('The target time slot is already fully booked (both seats are occupied).');
      }

      const timestamp = new Date().toISOString().replace('T', ' ').slice(0, 16);
      const noteEntry = `[${timestamp} - Rescheduled]: Moved from ${appointment.appointment_date} (${appointment.time_slot}) to ${new_date} (${new_time_slot}). Reason: ${reason || 'Patient request'}`;
      const updatedNotes = appointment.admin_notes ? `${appointment.admin_notes}\n${noteEntry}` : noteEntry;

      db.prepare(`
        UPDATE appointments
        SET appointment_date = ?, time_slot = ?, slot_start_time = ?, status = 'Rescheduled', admin_notes = ?, updated_at = CURRENT_TIMESTAMP
        WHERE id = ?
      `).run(new_date, new_time_slot, validSlot.start, updatedNotes, appointment.id);
    });

    rescheduleTransaction();

    logAudit(
      req.admin.username,
      'RESCHEDULE_APPOINTMENT',
      'APPOINTMENT',
      appointment.appointment_id,
      `Rescheduled from ${appointment.appointment_date} ${appointment.time_slot} to ${new_date} ${new_time_slot}`,
      req
    );

    res.json({
      success: true,
      message: `Appointment ${appointment.appointment_id} rescheduled to ${new_date} at ${new_time_slot}.`
    });
  } catch (err) {
    res.status(400).json({ success: false, error: err.message });
  }
});

/**
 * POST /api/admin/appointments/create
 * Direct booking from admin dashboard for walk-in / phone calls
 */
router.post('/create', (req, res) => {
  try {
    const {
      patient_id,
      patient_name,
      patient_phone,
      patient_address,
      service_id,
      appointment_date,
      time_slot,
      number_of_patients = 1,
      additional_notes,
      status = 'Confirmed'
    } = req.body;

    if (!patient_name || !patient_phone || !service_id || !appointment_date || !time_slot) {
      return res.status(400).json({ success: false, error: 'Patient name, phone, service, date, and time slot are required.' });
    }

    const validSlot = TIME_SLOTS.find(s => s.label === time_slot);
    if (!validSlot) {
      return res.status(400).json({ success: false, error: 'Invalid time slot.' });
    }

    const service = db.prepare('SELECT id, name FROM services WHERE id = ?').get(service_id);
    if (!service) {
      return res.status(400).json({ success: false, error: 'Service not found.' });
    }

    const createTx = db.transaction(() => {
      // Check seat capacity: maximum 2 patients per slot
      const bookedCount = db.prepare(`
        SELECT COUNT(*) as count FROM appointments
        WHERE appointment_date = ? AND time_slot = ? AND status NOT IN ('Cancelled')
      `).get(appointment_date, time_slot).count;

      if (bookedCount >= 2) {
        throw new Error('This time slot is already fully booked (both seats occupied).');
      }

      let pId = patient_id;
      if (!pId) {
        const p = db.prepare('SELECT patient_id FROM patients WHERE phone = ?').get(patient_phone.trim());
        if (p) {
          pId = p.patient_id;
        } else {
          const last = db.prepare('SELECT id FROM patients ORDER BY id DESC LIMIT 1').get();
          const next = (last ? last.id : 0) + 1001;
          pId = `RSCC-P-${next}`;
          db.prepare(`
            INSERT INTO patients (patient_id, full_name, phone, age, gender, address, notes)
            VALUES (?, ?, ?, ?, ?, ?, ?)
          `).run(pId, patient_name.trim(), patient_phone.trim(), 30, 'Unspecified', patient_address ? patient_address.trim() : 'Feni', 'Created by clinic administrator.');
        }
      }

      const datePart = appointment_date.replace(/-/g, '');
      const randomSuffix = Math.floor(1000 + Math.random() * 9000);
      const appointmentId = `APT-${datePart}-${randomSuffix}`;

      const sType = (service.code === 'hijama' || (service.name && service.name.includes('হিজামা'))) ? 'hijama' : 'ruqyah';
      const isFamily = service.code === 'family' || (service.name && service.name.includes('ফ্যামিলি'));
      const packType = isFamily ? 'family' : 'standard';
      const numPts = parseInt(number_of_patients, 10) || 1;

      let defaultPrice = null;
      let perPtPrice = null;
      if (sType !== 'hijama') {
        if (isFamily) {
          defaultPrice = service.discount_price || service.price || 6000;
        } else {
          perPtPrice = service.discount_price || service.price || 2050;
          defaultPrice = perPtPrice * numPts;
        }
      }

      const hasCustom = custom_price !== undefined && custom_price !== null && custom_price !== '';
      const finalPrice = hasCustom ? parseFloat(custom_price) : defaultPrice;
      const isOverridden = hasCustom ? 1 : 0;

      db.prepare(`
        INSERT INTO appointments (
          appointment_id, patient_id, patient_name, patient_phone, patient_address,
          service_id, service_name, service_type, service_price, original_price,
          adjusted_price, is_price_overridden, per_patient_price, package_type,
          appointment_date, time_slot, appointment_time, slot_start_time,
          number_of_patients, additional_notes, notes, status, admin_notes
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        appointmentId,
        pId,
        patient_name.trim(),
        patient_phone.trim(),
        patient_address ? patient_address.trim() : 'Feni',
        service.id,
        service.name,
        sType,
        finalPrice,
        defaultPrice,
        finalPrice,
        isOverridden,
        perPtPrice,
        packType,
        appointment_date,
        time_slot,
        time_slot,
        validSlot.start,
        numPts,
        additional_notes || null,
        additional_notes || null,
        status,
        hasCustom ? `Price customized to ${finalPrice} BDT by admin ${req.admin.name}` : `Booked manually by admin ${req.admin.name}`
      );

      return appointmentId;
    });

    const newAptId = createTx();

    logAudit(req.admin.username, 'CREATE_APPOINTMENT', 'APPOINTMENT', newAptId, `Created appointment for ${patient_name} on ${appointment_date} (${time_slot})`, req);

    res.status(201).json({
      success: true,
      message: 'Appointment successfully created.',
      appointment_id: newAptId
    });
  } catch (err) {
    res.status(400).json({ success: false, error: err.message });
  }
});

/**
 * POST /api/admin/appointments/:id/override-price
 * Admin can adjust/override fee for low-income patients
 */
router.post('/:id/override-price', (req, res) => {
  try {
    const { id } = req.params;
    const { adjusted_price, reason } = req.body;

    const apt = db.prepare('SELECT * FROM appointments WHERE id = ? OR appointment_id = ?').get(id, id);
    if (!apt) {
      return res.status(404).json({ success: false, error: 'Appointment not found.' });
    }

    const newPrice = adjusted_price !== undefined ? parseFloat(adjusted_price) : 0;
    const notes = apt.admin_notes ? `${apt.admin_notes} | Price adjusted to ${newPrice} BDT: ${reason || 'Financial relief'}` : `Price adjusted to ${newPrice} BDT: ${reason || 'Financial relief'}`;

    db.prepare(`
      UPDATE appointments
      SET service_price = ?, adjusted_price = ?, is_price_overridden = 1, admin_notes = ?, updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `).run(newPrice, newPrice, notes, apt.id);

    logAudit(req.admin.username, 'OVERRIDE_PRICE', 'APPOINTMENT', apt.appointment_id, `Adjusted price from ${apt.service_price} to ${newPrice} BDT (${reason || 'Financial relief'})`, req);

    res.json({
      success: true,
      message: 'Appointment fee adjusted successfully.',
      adjusted_price: newPrice
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

module.exports = router;
