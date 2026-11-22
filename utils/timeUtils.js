const db = require('../database/db');
const { TIME_SLOTS, CLINIC } = require('../config/constants');

/**
 * Returns the current date in Bangladesh Standard Time (UTC+6) formatted as YYYY-MM-DD
 */
function getBstTodayString() {
  const now = new Date();
  // BST is UTC+6
  const utc = now.getTime() + (now.getTimezoneOffset() * 60000);
  const bstTime = new Date(utc + (3600000 * 6));
  return bstTime.toISOString().split('T')[0];
}

/**
 * Checks if a given YYYY-MM-DD string is earlier than today in BST
 */
function isDateInPast(dateStr) {
  const todayStr = getBstTodayString();
  return dateStr < todayStr;
}

/**
 * Checks if date is a weekly holiday (e.g. Friday = 5)
 * If weekly holiday is disabled or set to -1, returns false (7 days open)
 */
function isWeeklyHoliday(dateStr) {
  const parts = dateStr.split('-');
  if (parts.length !== 3) return false;
  // Year, month (0-indexed), day
  const d = new Date(parseInt(parts[0], 10), parseInt(parts[1], 10) - 1, parseInt(parts[2], 10));
  const dayOfWeek = d.getDay(); // 0 = Sun, 5 = Fri
  
  const setting = db.prepare('SELECT weekly_holiday_day, weekly_holiday_enabled FROM availability_settings WHERE id = 1').get();
  if (setting) {
    if (setting.weekly_holiday_enabled === 0 || setting.weekly_holiday_day === -1 || setting.weekly_holiday_day === null) {
      return false; // No weekly holiday! Open 7 days a week
    }
  }
  const holidayDay = (setting && setting.weekly_holiday_day !== undefined && setting.weekly_holiday_day !== null) ? setting.weekly_holiday_day : CLINIC.DEFAULT_WEEKLY_HOLIDAY;
  if (holidayDay === -1) return false;
  
  return dayOfWeek === holidayDay;
}

/**
 * Checks if a specific date is closed by admin
 */
function getClosedDateInfo(dateStr) {
  return db.prepare('SELECT * FROM closed_dates WHERE closed_date = ?').get(dateStr);
}

/**
 * Returns all blocked time slots for a specific date
 */
function getBlockedSlots(dateStr) {
  const rows = db.prepare('SELECT time_slot, reason FROM blocked_time_slots WHERE slot_date = ?').all(dateStr);
  return rows;
}

/**
 * Returns all active booked appointments for a date
 */
function getBookedAppointments(dateStr) {
  return db.prepare(`
    SELECT appointment_id, time_slot, service_name, patient_name, status
    FROM appointments
    WHERE appointment_date = ? AND status NOT IN ('Cancelled')
  `).all(dateStr);
}

/**
 * Computes available time slots for a given date according to all business rules
 */
function getAvailabilityForDate(dateStr) {
  // 1. Check valid date format
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) {
    return {
      success: false,
      date: dateStr,
      isAvailable: false,
      reason: 'Invalid date format. Expected YYYY-MM-DD.',
      slots: []
    };
  }

  // 2. Check if date is in the past
  if (isDateInPast(dateStr)) {
    return {
      success: true,
      date: dateStr,
      isAvailable: false,
      reason: 'Appointments cannot be booked for past dates.',
      isPast: true,
      slots: []
    };
  }

  // 3. Check if closed by admin
  const closedRecord = getClosedDateInfo(dateStr);
  if (closedRecord) {
    return {
      success: true,
      date: dateStr,
      isAvailable: false,
      reason: closedRecord.reason || 'The clinic is closed on this date by administrative notice.',
      isClosedDay: true,
      slots: []
    };
  }

  // 4. Check if weekly holiday
  if (isWeeklyHoliday(dateStr)) {
    const setting = db.prepare('SELECT weekly_holiday_day FROM availability_settings WHERE id = 1').get();
    const dayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
    const holDay = (setting && setting.weekly_holiday_day !== undefined && setting.weekly_holiday_day !== null) ? setting.weekly_holiday_day : CLINIC.DEFAULT_WEEKLY_HOLIDAY;
    const dayName = dayNames[holDay] || 'Weekly Holiday';
    return {
      success: true,
      date: dateStr,
      isAvailable: false,
      reason: `Weekly Holiday (${dayName}) - Clinic closed for public bookings.`,
      isWeeklyHoliday: true,
      slots: []
    };
  }

  // 5. Gather booked and blocked slots
  const bookedAppointments = getBookedAppointments(dateStr);
  const bookedSlotLabels = new Set(bookedAppointments.map(a => a.time_slot));

  const blockedRecords = getBlockedSlots(dateStr);
  const blockedSlotLabels = new Set(blockedRecords.map(b => b.time_slot));

  // 6. Filter TIME_SLOTS
  const allSlots = TIME_SLOTS.map(slot => {
    const isBooked = bookedSlotLabels.has(slot.label);
    const isBlocked = blockedSlotLabels.has(slot.label);
    const available = !isBooked && !isBlocked;

    return {
      id: slot.id,
      label: slot.label,
      start: slot.start,
      end: slot.end,
      available: available,
      status: isBooked ? 'booked' : (isBlocked ? 'blocked' : 'available'),
      reason: isBlocked ? (blockedRecords.find(b => b.time_slot === slot.label)?.reason || 'Blocked by Clinic') : (isBooked ? 'Already Booked' : null)
    };
  });

  const availableSlotsOnly = allSlots.filter(s => s.available);

  return {
    success: true,
    date: dateStr,
    isAvailable: availableSlotsOnly.length > 0,
    totalSlots: TIME_SLOTS.length,
    availableCount: availableSlotsOnly.length,
    bookedCount: bookedAppointments.length,
    blockedCount: blockedRecords.length,
    slots: allSlots,
    availableSlots: availableSlotsOnly
  };
}

module.exports = {
  getBstTodayString,
  isDateInPast,
  isWeeklyHoliday,
  getClosedDateInfo,
  getBlockedSlots,
  getBookedAppointments,
  getAvailabilityForDate
};
