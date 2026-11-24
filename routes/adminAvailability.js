const express = require('express');
const router = express.Router();
const db = require('../database/db');
const { requireAdmin } = require('../middleware/auth');
const { logAudit } = require('../middleware/audit');
const { TIME_SLOTS } = require('../config/constants');
const { getAvailabilityForDate } = require('../utils/timeUtils');

router.use(requireAdmin);

/**
 * GET /api/admin/availability/overview
 * Returns closed dates, blocked slots, settings, and standard slots
 */
router.get('/overview', (req, res) => {
  try {
    const closedDates = db.prepare('SELECT * FROM closed_dates ORDER BY closed_date ASC').all();
    const blockedSlots = db.prepare('SELECT * FROM blocked_time_slots ORDER BY slot_date ASC, time_slot ASC').all();
    const settings = db.prepare('SELECT * FROM availability_settings WHERE id = 1').get();

    res.json({
      success: true,
      data: {
        settings,
        closedDates,
        blockedSlots,
        timeSlots: TIME_SLOTS
      }
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

/**
 * GET /api/admin/availability/check
 * Preview availability for any date from admin perspective (including reasons and booked patient names)
 */
router.get('/check', (req, res) => {
  try {
    const { date } = req.query;
    if (!date) {
      return res.status(400).json({ success: false, error: 'Query param "date" is required.' });
    }

    const avail = getAvailabilityForDate(date);
    
    // Add patient names for booked slots for admin viewing
    const bookedApts = db.prepare(`
      SELECT appointment_id, time_slot, patient_name, patient_phone, service_name, status
      FROM appointments
      WHERE appointment_date = ? AND status NOT IN ('Cancelled')
    `).all(date);

    const bookedMap = {};
    for (const b of bookedApts) {
      if (!bookedMap[b.time_slot]) {
        bookedMap[b.time_slot] = [];
      }
      bookedMap[b.time_slot].push(b);
    }

    const enrichedSlots = avail.slots.map(s => {
      const apts = bookedMap[s.label] || [];
      return {
        ...s,
        bookedDetails: apts[0] || null,
        bookedAppointments: apts
      };
    });

    res.json({
      success: true,
      ...avail,
      slots: enrichedSlots
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

/**
 * POST /api/admin/availability/close-date
 * Close one or multiple dates
 * Body: { dates: ['2026-11-25', '2026-11-26'], reason: 'Raqi Traveling / Seminar', is_holiday: 0 }
 */
router.post('/close-date', (req, res) => {
  try {
    const { date, dates, reason = 'Clinic Closed by Administration', is_holiday = 0 } = req.body;
    const targetDates = dates && Array.isArray(dates) ? dates : (date ? [date] : []);

    if (targetDates.length === 0) {
      return res.status(400).json({ success: false, error: 'Please provide at least one date to close.' });
    }

    const insertStmt = db.prepare(`
      INSERT INTO closed_dates (closed_date, reason, is_holiday, created_by)
      VALUES (?, ?, ?, ?)
      ON CONFLICT(closed_date) DO UPDATE SET reason = excluded.reason, is_holiday = excluded.is_holiday
    `);

    const closeTx = db.transaction(() => {
      for (const d of targetDates) {
        insertStmt.run(d.trim(), reason.trim(), is_holiday ? 1 : 0, req.admin.name);
      }
    });

    closeTx();

    logAudit(
      req.admin.username,
      'CLOSE_CLINIC_DATE',
      'AVAILABILITY',
      targetDates.join(','),
      `Closed ${targetDates.length} date(s). Reason: ${reason}`,
      req
    );

    res.json({
      success: true,
      message: `Successfully closed ${targetDates.length} date(s). Patients cannot book appointments on these dates.`,
      closedDates: targetDates
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

/**
 * POST /api/admin/availability/reopen-date
 * Reopen a previously closed date
 */
router.post('/reopen-date', (req, res) => {
  try {
    const { date } = req.body;
    if (!date) {
      return res.status(400).json({ success: false, error: 'Date is required.' });
    }

    const info = db.prepare('SELECT * FROM closed_dates WHERE closed_date = ?').get(date.trim());
    if (!info) {
      return res.status(404).json({ success: false, error: 'Date was not found in closed dates list.' });
    }

    db.prepare('DELETE FROM closed_dates WHERE closed_date = ?').run(date.trim());

    logAudit(
      req.admin.username,
      'REOPEN_CLINIC_DATE',
      'AVAILABILITY',
      date.trim(),
      `Reopened date ${date.trim()} for public bookings.`,
      req
    );

    res.json({
      success: true,
      message: `Date ${date} has been reopened successfully.`
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

/**
 * POST /api/admin/availability/block-slot
 * Block specific time slot(s) on a particular date
 * Body: { date: '2026-11-20', time_slot: '10:00 AM – 11:00 AM', reason: 'Staff meeting / Sanitization' }
 */
router.post('/block-slot', (req, res) => {
  try {
    const { date, time_slot, time_slots, reason = 'Reserved by Clinic' } = req.body;
    const targetSlots = time_slots && Array.isArray(time_slots) ? time_slots : (time_slot ? [time_slot] : []);

    if (!date || targetSlots.length === 0) {
      return res.status(400).json({ success: false, error: 'Date and at least one time slot are required.' });
    }

    const insertBlock = db.prepare(`
      INSERT INTO blocked_time_slots (slot_date, time_slot, reason, created_by)
      VALUES (?, ?, ?, ?)
      ON CONFLICT(slot_date, time_slot) DO UPDATE SET reason = excluded.reason
    `);

    const blockTx = db.transaction(() => {
      for (const slot of targetSlots) {
        insertBlock.run(date.trim(), slot.trim(), reason.trim(), req.admin.name);
      }
    });

    blockTx();

    logAudit(
      req.admin.username,
      'BLOCK_TIME_SLOTS',
      'AVAILABILITY',
      `${date}: ${targetSlots.join('; ')}`,
      `Blocked slots on ${date}. Reason: ${reason}`,
      req
    );

    res.json({
      success: true,
      message: `Successfully blocked ${targetSlots.length} slot(s) on ${date}.`,
      date,
      blockedSlots: targetSlots
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

/**
 * POST /api/admin/availability/unblock-slot
 * Reopen blocked time slot
 */
router.post('/unblock-slot', (req, res) => {
  try {
    const { id, date, time_slot } = req.body;
    
    if (id) {
      db.prepare('DELETE FROM blocked_time_slots WHERE id = ?').run(id);
    } else if (date && time_slot) {
      db.prepare('DELETE FROM blocked_time_slots WHERE slot_date = ? AND time_slot = ?').run(date.trim(), time_slot.trim());
    } else {
      return res.status(400).json({ success: false, error: 'Provide slot ID or both date and time_slot.' });
    }

    logAudit(
      req.admin.username,
      'UNBLOCK_TIME_SLOT',
      'AVAILABILITY',
      `${date || id}: ${time_slot || ''}`,
      'Unblocked slot for public booking.',
      req
    );

    res.json({
      success: true,
      message: 'Time slot unblocked successfully and restored to availability.'
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

/**
 * PUT /api/admin/availability/settings
 * Update weekly regular holidays and hours
 */
router.put('/settings', (req, res) => {
  try {
    const { weekly_holiday_day, weekly_holiday_enabled, slot_duration_minutes, break_start, break_end, opening_time, closing_time } = req.body;

    const holDay = weekly_holiday_day !== undefined ? parseInt(weekly_holiday_day, 10) : null;
    const holEnabled = weekly_holiday_enabled !== undefined ? (weekly_holiday_enabled ? 1 : 0) : (holDay === -1 ? 0 : 1);

    db.prepare(`
      UPDATE availability_settings
      SET 
        weekly_holiday_day = COALESCE(?, weekly_holiday_day),
        weekly_holiday_enabled = COALESCE(?, weekly_holiday_enabled),
        slot_duration_minutes = COALESCE(?, slot_duration_minutes),
        break_start = COALESCE(?, break_start),
        break_end = COALESCE(?, break_end),
        opening_time = COALESCE(?, opening_time),
        closing_time = COALESCE(?, closing_time),
        updated_at = CURRENT_TIMESTAMP
      WHERE id = 1
    `).run(
      holDay,
      holEnabled,
      slot_duration_minutes !== undefined ? parseInt(slot_duration_minutes, 10) : null,
      break_start || null,
      break_end || null,
      opening_time || null,
      closing_time || null
    );

    logAudit(req.admin.username, 'UPDATE_AVAILABILITY_SETTINGS', 'SETTINGS', '1', 'Updated clinic availability settings', req);

    res.json({ success: true, message: 'Availability settings updated successfully.' });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

module.exports = router;
