-- Ruqyah Support & Cupping Center (Feni Branch) Database Schema

CREATE TABLE IF NOT EXISTS administrators (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  username TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  name TEXT NOT NULL,
  email TEXT,
  role TEXT DEFAULT 'admin',
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS clinic_settings (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  business_name TEXT NOT NULL,
  branch_name TEXT NOT NULL,
  raqi_name TEXT NOT NULL,
  phone TEXT NOT NULL,
  whatsapp TEXT NOT NULL,
  address TEXT NOT NULL,
  email TEXT,
  hours TEXT,
  emergency_notes TEXT,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS services (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  code TEXT UNIQUE NOT NULL,
  name TEXT NOT NULL,
  category TEXT NOT NULL, -- 'ruqyah', 'hijama', 'consultation'
  description TEXT,
  duration_minutes INTEGER DEFAULT 60,
  price REAL NOT NULL,
  discount_price REAL DEFAULT NULL,
  is_active INTEGER DEFAULT 1,
  display_order INTEGER DEFAULT 0,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS patients (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  patient_id TEXT UNIQUE NOT NULL,
  full_name TEXT NOT NULL,
  phone TEXT NOT NULL,
  age INTEGER NOT NULL,
  gender TEXT NOT NULL,
  address TEXT NOT NULL,
  emergency_contact TEXT,
  marital_status TEXT,
  registration_date DATETIME DEFAULT CURRENT_TIMESTAMP,
  notes TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS appointments (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  appointment_id TEXT UNIQUE NOT NULL,
  patient_id TEXT,
  patient_name TEXT NOT NULL,
  patient_phone TEXT NOT NULL,
  patient_address TEXT NOT NULL,
  service_id INTEGER NOT NULL REFERENCES services(id),
  service_name TEXT NOT NULL,
  appointment_date TEXT NOT NULL, -- YYYY-MM-DD
  time_slot TEXT NOT NULL,        -- '09:00 AM – 10:00 AM'
  slot_start_time TEXT NOT NULL,  -- '09:00'
  number_of_patients INTEGER DEFAULT 1,
  additional_notes TEXT,
  status TEXT DEFAULT 'Pending',   -- 'Pending', 'Confirmed', 'Completed', 'Cancelled', 'Rescheduled', 'No Show'
  admin_notes TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Two-seat capacity per time slot: dropped 1-seat unique index
DROP INDEX IF EXISTS idx_active_appointment_slot;

CREATE INDEX IF NOT EXISTS idx_appointments_date ON appointments(appointment_date);
CREATE INDEX IF NOT EXISTS idx_appointments_status ON appointments(status);
CREATE INDEX IF NOT EXISTS idx_appointments_patient ON appointments(patient_phone);

CREATE TABLE IF NOT EXISTS patient_histories (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  patient_id TEXT UNIQUE NOT NULL REFERENCES patients(patient_id) ON DELETE CASCADE,
  main_symptoms TEXT,              -- JSON array/text
  physical_symptoms TEXT,          -- JSON array/text
  sleep_problems TEXT,             -- JSON array/text
  dream_problems TEXT,             -- JSON array/text
  worship_problems TEXT,           -- JSON array/text
  family_history TEXT,
  financial_family_situation TEXT,
  previous_medical_history TEXT,
  duration_of_problems TEXT,
  additional_information TEXT,
  recorded_by TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS ruqyah_sessions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  session_id TEXT UNIQUE NOT NULL,
  patient_id TEXT NOT NULL REFERENCES patients(patient_id) ON DELETE CASCADE,
  appointment_id TEXT,
  session_number INTEGER DEFAULT 1,
  session_date TEXT NOT NULL,      -- YYYY-MM-DD
  raqi_name TEXT DEFAULT 'Muhammadullah Miah',
  initial_assessment TEXT,
  reported_symptoms TEXT,
  medical_history_checked TEXT,
  quranic_verses_recited TEXT,     -- JSON array/text
  authentic_supplications TEXT,    -- JSON array/text
  observed_reactions TEXT,         -- JSON array/text
  raqi_observations TEXT,
  professional_assessment TEXT,
  assessment_category TEXT,
  prescribed_remedies TEXT,        -- JSON array/text
  recommendations TEXT,
  next_followup_date TEXT,
  status TEXT DEFAULT 'Completed',
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS follow_ups (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  patient_id TEXT NOT NULL REFERENCES patients(patient_id) ON DELETE CASCADE,
  previous_session_id TEXT,
  followup_date TEXT NOT NULL,     -- YYYY-MM-DD
  scheduled_time TEXT,
  symptom_progression TEXT,        -- 'Significantly Improved', 'Mildly Improved', 'Unchanged', 'Worsened', 'New Symptoms'
  symptom_changes_notes TEXT,
  new_observations TEXT,
  treatment_progress_summary TEXT,
  reminder_sent INTEGER DEFAULT 0,
  status TEXT DEFAULT 'Scheduled', -- 'Scheduled', 'Completed', 'Cancelled', 'Overdue'
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS availability_settings (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  weekly_holiday_day INTEGER DEFAULT 5, -- 5 = Friday
  slot_duration_minutes INTEGER DEFAULT 60,
  break_start TEXT DEFAULT '13:00',
  break_end TEXT DEFAULT '14:00',
  opening_time TEXT DEFAULT '09:00',
  closing_time TEXT DEFAULT '20:00',
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS closed_dates (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  closed_date TEXT UNIQUE NOT NULL, -- YYYY-MM-DD
  reason TEXT,
  is_holiday INTEGER DEFAULT 0,
  created_by TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS blocked_time_slots (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  slot_date TEXT NOT NULL,          -- YYYY-MM-DD
  time_slot TEXT NOT NULL,          -- '10:00 AM – 11:00 AM'
  reason TEXT,
  created_by TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(slot_date, time_slot)
);

CREATE TABLE IF NOT EXISTS reports (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  report_id TEXT UNIQUE NOT NULL,
  report_type TEXT NOT NULL,        -- 'patient_history', 'ruqyah_session'
  patient_id TEXT NOT NULL REFERENCES patients(patient_id),
  session_id TEXT,
  title TEXT NOT NULL,
  generated_by TEXT,
  data_snapshot TEXT,               -- JSON snapshot of data at report generation
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS audit_logs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  admin_username TEXT NOT NULL,
  action TEXT NOT NULL,
  target_type TEXT,
  target_id TEXT,
  details TEXT,
  ip_address TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS contact_messages (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  phone TEXT NOT NULL,
  subject TEXT,
  message TEXT NOT NULL,
  status TEXT DEFAULT 'Unread',     -- 'Unread', 'Read', 'Replied'
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- ============================================================================
-- 9 DIAGNOSIS CATEGORIES & 90 SYMPTOMS (10 PER CATEGORY)
-- ============================================================================
CREATE TABLE IF NOT EXISTS diagnosis_categories (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  code TEXT UNIQUE NOT NULL,
  name_bn TEXT NOT NULL,
  name_en TEXT NOT NULL,
  description_bn TEXT,
  description_en TEXT,
  sort_order INTEGER DEFAULT 0,
  status TEXT DEFAULT 'active',
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS diagnosis_symptoms (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  category_id INTEGER NOT NULL REFERENCES diagnosis_categories(id) ON DELETE CASCADE,
  symptom_bn TEXT NOT NULL,
  symptom_en TEXT NOT NULL,
  sort_order INTEGER DEFAULT 0,
  status TEXT DEFAULT 'active',
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS patient_diagnoses (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  patient_id TEXT NOT NULL REFERENCES patients(patient_id) ON DELETE CASCADE,
  appointment_id INTEGER REFERENCES appointments(id),
  session_id INTEGER REFERENCES ruqyah_sessions(id),
  category_ids TEXT,
  selected_symptom_ids TEXT,
  selected_symptoms_json TEXT,
  summary_bn TEXT,
  summary_en TEXT,
  notes TEXT,
  raqi_name TEXT DEFAULT 'মুহাম্মদুল্লাহ মিয়াহ',
  diagnosis_date DATE DEFAULT (DATE('now')),
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS announcements (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  title_bn TEXT,
  title_en TEXT,
  content_bn TEXT NOT NULL,
  content_en TEXT,
  is_active INTEGER DEFAULT 1,
  display_order INTEGER DEFAULT 0,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
