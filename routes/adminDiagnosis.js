const express = require('express');
const router = express.Router();
const db = require('../database/db');
const { requireAdmin } = require('../middleware/auth');
const { logAudit } = require('../middleware/audit');

function toBengaliDigits(str) {
  const bnDigits = ['০','১','২','৩','৪','৫','৬','৭','৮','৯'];
  return String(str).replace(/[0-9]/g, d => bnDigits[d]);
}

router.use(requireAdmin);

/**
 * GET /api/admin/diagnosis/categories
 * Returns all active diagnosis categories and their 10 symptoms each (90 symptoms total)
 * No 5-symptom limitation or truncation.
 */
router.get('/categories', (req, res) => {
  try {
    const categories = db.prepare(`
      SELECT id, code, name_bn, name_en, description_bn, description_en, sort_order, status, created_at
      FROM diagnosis_categories
      WHERE status = 'active'
      ORDER BY sort_order ASC, id ASC
    `).all();

    const getSymptomsStmt = db.prepare(`
      SELECT id, category_id, symptom_bn, symptom_en, sort_order, status, created_at
      FROM diagnosis_symptoms
      WHERE category_id = ? AND status = 'active'
      ORDER BY sort_order ASC, id ASC
    `);

    const result = categories.map(cat => {
      const symptoms = getSymptomsStmt.all(cat.id);
      return {
        ...cat,
        symptoms
      };
    });

    res.json({
      success: true,
      total_categories: result.length,
      data: result
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

/**
 * GET /api/admin/diagnosis/management
 * Full list for Admin Diagnosis Management tab (including inactive items for administrative editing)
 */
router.get('/management', (req, res) => {
  try {
    const categories = db.prepare(`
      SELECT id, code, name_bn, name_en, description_bn, description_en, sort_order, status, created_at
      FROM diagnosis_categories
      ORDER BY sort_order ASC, id ASC
    `).all();

    const getSymptomsStmt = db.prepare(`
      SELECT id, category_id, symptom_bn, symptom_en, sort_order, status, created_at
      FROM diagnosis_symptoms
      WHERE category_id = ?
      ORDER BY sort_order ASC, id ASC
    `);

    const result = categories.map(cat => {
      const symptoms = getSymptomsStmt.all(cat.id);
      return {
        ...cat,
        symptoms
      };
    });

    res.json({
      success: true,
      data: result
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

/**
 * PUT /api/admin/diagnosis/categories/:id
 * Update category details, bilingual names, descriptions, sort order, and status
 */
router.put('/categories/:id', (req, res) => {
  try {
    const { name_bn, name_en, description_bn, description_en, sort_order, status } = req.body;
    const catId = parseInt(req.params.id, 10);

    const category = db.prepare('SELECT * FROM diagnosis_categories WHERE id = ?').get(catId);
    if (!category) {
      return res.status(404).json({ success: false, error: 'Category not found.' });
    }

    db.prepare(`
      UPDATE diagnosis_categories
      SET 
        name_bn = COALESCE(?, name_bn),
        name_en = COALESCE(?, name_en),
        description_bn = COALESCE(?, description_bn),
        description_en = COALESCE(?, description_en),
        sort_order = COALESCE(?, sort_order),
        status = COALESCE(?, status)
      WHERE id = ?
    `).run(
      name_bn ? name_bn.trim() : null,
      name_en ? name_en.trim() : null,
      description_bn !== undefined ? description_bn : null,
      description_en !== undefined ? description_en : null,
      sort_order !== undefined ? parseInt(sort_order, 10) : null,
      status || null,
      catId
    );

    logAudit(req.admin.username, 'UPDATE_DIAGNOSIS_CATEGORY', 'DIAGNOSIS', catId, `Updated category ${category.code}`, req);

    res.json({
      success: true,
      message: 'Category updated successfully.'
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

/**
 * POST /api/admin/diagnosis/symptoms
 * Add a new symptom dynamically to any of the 9 categories
 */
router.post('/symptoms', (req, res) => {
  try {
    const { category_id, symptom_bn, symptom_en, sort_order, status } = req.body;
    if (!category_id) {
      return res.status(400).json({ success: false, error: 'ক্যাটাগরি নির্বাচন করা বাধ্যতামূলক (Category is required).' });
    }
    if (!symptom_bn || !symptom_bn.trim()) {
      return res.status(400).json({ success: false, error: 'উপসর্গের বাংলা নাম বাধ্যতামূলক (Bengali symptom name is required).' });
    }
    const cat = db.prepare('SELECT id, name_bn FROM diagnosis_categories WHERE id = ?').get(category_id);
    if (!cat) {
      return res.status(404).json({ success: false, error: 'নির্বাচিত ক্যাটাগরি পাওয়া যায়নি।' });
    }

    const order = sort_order !== undefined && sort_order !== null && sort_order !== '' 
      ? parseInt(sort_order, 10) 
      : (db.prepare('SELECT COALESCE(MAX(sort_order), 0) + 1 as next_order FROM diagnosis_symptoms WHERE category_id = ?').get(category_id).next_order);

    const info = db.prepare(`
      INSERT INTO diagnosis_symptoms (category_id, symptom_bn, symptom_en, sort_order, status)
      VALUES (?, ?, ?, ?, ?)
    `).run(
      parseInt(category_id, 10),
      symptom_bn.trim(),
      (symptom_en || '').trim(),
      order,
      status === 'inactive' ? 'inactive' : 'active'
    );

    const newSymptom = db.prepare('SELECT * FROM diagnosis_symptoms WHERE id = ?').get(info.lastInsertRowid);
    logAudit(req.admin.username, 'CREATE_DIAGNOSIS_SYMPTOM', 'DIAGNOSIS', String(info.lastInsertRowid), `Created symptom "${symptom_bn.trim()}" in category ${cat.name_bn}`, req);

    res.json({
      success: true,
      message: 'নতুন উপসর্গ সফলভাবে যোগ করা হয়েছে।',
      data: newSymptom
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

/**
 * PUT /api/admin/diagnosis/symptoms/:id
 * Update symptom details, bilingual text, sort order, category reassignment, and status
 */
router.put('/symptoms/:id', (req, res) => {
  try {
    const { category_id, symptom_bn, symptom_en, sort_order, status } = req.body;
    const symId = parseInt(req.params.id, 10);

    const symptom = db.prepare('SELECT * FROM diagnosis_symptoms WHERE id = ?').get(symId);
    if (!symptom) {
      return res.status(404).json({ success: false, error: 'Symptom not found.' });
    }

    if (category_id !== undefined && category_id !== null && category_id !== '') {
      const cat = db.prepare('SELECT id FROM diagnosis_categories WHERE id = ?').get(category_id);
      if (!cat) {
        return res.status(404).json({ success: false, error: 'Target category not found.' });
      }
    }

    db.prepare(`
      UPDATE diagnosis_symptoms
      SET 
        category_id = COALESCE(?, category_id),
        symptom_bn = COALESCE(?, symptom_bn),
        symptom_en = COALESCE(?, symptom_en),
        sort_order = COALESCE(?, sort_order),
        status = COALESCE(?, status)
      WHERE id = ?
    `).run(
      category_id !== undefined && category_id !== null && category_id !== '' ? parseInt(category_id, 10) : null,
      symptom_bn ? symptom_bn.trim() : null,
      symptom_en !== undefined ? (symptom_en ? symptom_en.trim() : '') : null,
      sort_order !== undefined ? parseInt(sort_order, 10) : null,
      status || null,
      symId
    );

    logAudit(req.admin.username, 'UPDATE_DIAGNOSIS_SYMPTOM', 'DIAGNOSIS', symId, `Updated symptom ID ${symId}`, req);

    res.json({
      success: true,
      message: 'উপসর্গ সফলভাবে আপডেট করা হয়েছে।'
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

/**
 * DELETE /api/admin/diagnosis/symptoms/:id
 * Delete an unwanted symptom permanently from active pool
 * Preserves historical records stored in patient_diagnoses.selected_symptoms_json
 */
router.delete('/symptoms/:id', (req, res) => {
  try {
    const symId = parseInt(req.params.id, 10);
    const symptom = db.prepare('SELECT * FROM diagnosis_symptoms WHERE id = ?').get(symId);
    if (!symptom) {
      return res.status(404).json({ success: false, error: 'উপসর্গটি পাওয়া যায়নি (Symptom not found).' });
    }

    db.prepare('DELETE FROM diagnosis_symptoms WHERE id = ?').run(symId);
    logAudit(req.admin.username, 'DELETE_DIAGNOSIS_SYMPTOM', 'DIAGNOSIS', symId, `Deleted symptom "${symptom.symptom_bn}" (ID ${symId})`, req);

    res.json({
      success: true,
      message: 'উপসর্গটি সফলভাবে মুছে ফেলা হয়েছে।'
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

/**
 * POST /api/admin/diagnosis/symptoms/:id/toggle
 * Toggle symptom between active and inactive status
 */
router.post('/symptoms/:id/toggle', (req, res) => {
  try {
    const symId = parseInt(req.params.id, 10);
    const symptom = db.prepare('SELECT * FROM diagnosis_symptoms WHERE id = ?').get(symId);
    if (!symptom) {
      return res.status(404).json({ success: false, error: 'উপসর্গটি পাওয়া যায়নি।' });
    }

    const newStatus = symptom.status === 'active' ? 'inactive' : 'active';
    db.prepare('UPDATE diagnosis_symptoms SET status = ? WHERE id = ?').run(newStatus, symId);
    logAudit(req.admin.username, 'TOGGLE_DIAGNOSIS_SYMPTOM_STATUS', 'DIAGNOSIS', symId, `Toggled symptom ID ${symId} to ${newStatus}`, req);

    res.json({
      success: true,
      message: `উপসর্গটি ${newStatus === 'active' ? 'সক্রিয়' : 'নিষ্ক্রিয়'} করা হয়েছে।`,
      new_status: newStatus
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

/**
 * GET /api/admin/diagnosis/patient/:patient_id
 * Retrieve patient's diagnosis record and selected symptoms
 */
router.get('/patient/:patient_id', (req, res) => {
  try {
    const patient = db.prepare('SELECT * FROM patients WHERE id = ? OR patient_id = ?').get(req.params.patient_id, req.params.patient_id);
    if (!patient) {
      return res.status(404).json({ success: false, error: 'Patient not found.' });
    }

    const diagnosis = db.prepare(`
      SELECT * FROM patient_diagnoses
      WHERE patient_id = ?
      ORDER BY id DESC
      LIMIT 1
    `).get(patient.patient_id);

    if (!diagnosis) {
      return res.json({
        success: true,
        data: null,
        message: 'No diagnosis recorded yet for this patient.'
      });
    }

    let parsedSymptoms = [];
    try {
      parsedSymptoms = JSON.parse(diagnosis.selected_symptoms_json || '[]');
    } catch (e) {
      parsedSymptoms = [];
    }

    let symptomIds = [];
    try {
      symptomIds = JSON.parse(diagnosis.selected_symptom_ids || '[]');
    } catch (e) {
      symptomIds = [];
    }

    let categoryIds = [];
    try {
      categoryIds = JSON.parse(diagnosis.category_ids || '[]');
    } catch (e) {
      categoryIds = [];
    }

    res.json({
      success: true,
      data: {
        ...diagnosis,
        category_ids: categoryIds,
        selected_symptom_ids: symptomIds,
        selected_symptoms_json: parsedSymptoms,
        main_complaints_text: diagnosis.main_complaints_text || '',
        onset_history_notes: diagnosis.onset_history_notes || '',
        family_social_notes: diagnosis.family_social_notes || '',
        suicidal_ideation_flag: diagnosis.suicidal_ideation_flag || 0
      }
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

/**
 * POST /api/admin/diagnosis/patient/:patient_id
 * Save or update patient diagnosis with selected symptoms across all 9 categories
 */
router.post('/patient/:patient_id', (req, res) => {
  try {
    const patient = db.prepare('SELECT * FROM patients WHERE id = ? OR patient_id = ?').get(req.params.patient_id, req.params.patient_id);
    if (!patient) {
      return res.status(404).json({ success: false, error: 'Patient not found.' });
    }

    const {
      appointment_id,
      session_id,
      selected_symptom_ids = [],
      notes = '',
      main_complaints_text = '',
      onset_history_notes = '',
      family_social_notes = '',
      raqi_name = 'মুহাম্মদুল্লাহ মিয়াহ',
      diagnosis_date = new Date().toISOString().split('T')[0]
    } = req.body;

    const symIds = Array.isArray(selected_symptom_ids) ? selected_symptom_ids.map(Number).filter(Boolean) : [];

    // Fetch detailed symptoms and categories from DB
    let detailedSymptoms = [];
    let affectedCatIds = new Set();
    let hasSuicidalIdeation = false;

    if (symIds.length > 0) {
      const placeholders = symIds.map(() => '?').join(',');
      const rows = db.prepare(`
        SELECT 
          s.id as symptom_id, s.category_id, s.symptom_bn, s.symptom_en, s.sort_order as symptom_sort,
          c.code as category_code, c.name_bn as category_name_bn, c.name_en as category_name_en, c.sort_order as category_sort
        FROM diagnosis_symptoms s
        JOIN diagnosis_categories c ON s.category_id = c.id
        WHERE s.id IN (${placeholders})
        ORDER BY c.sort_order ASC, s.sort_order ASC
      `).all(...symIds);

      // Check if suicidal ideation or self-harm symptom is selected
      hasSuicidalIdeation = rows.some(r => 
        (r.symptom_bn && r.symptom_bn.includes('আত্মহত্যা')) || 
        (r.symptom_en && r.symptom_en.toLowerCase().includes('suicid'))
      );

      // Group by category
      const catMap = new Map();
      rows.forEach(r => {
        affectedCatIds.add(r.category_id);
        if (!catMap.has(r.category_id)) {
          catMap.set(r.category_id, {
            category_id: r.category_id,
            category_code: r.category_code,
            category_name_bn: r.category_name_bn,
            category_name_en: r.category_name_en,
            symptoms: []
          });
        }
        catMap.get(r.category_id).symptoms.push({
          id: r.symptom_id,
          symptom_bn: r.symptom_bn,
          symptom_en: r.symptom_en
        });
      });

      detailedSymptoms = Array.from(catMap.values());
    }

    const suicidalFlag = hasSuicidalIdeation ? 1 : 0;

    // Generate comprehensive bilingual summary
    const catCount = detailedSymptoms.length;
    const totalSymCount = symIds.length;

    let summaryBn = '';
    let summaryEn = '';

    if (totalSymCount === 0) {
      summaryBn = 'কোনো লক্ষণ বা উপসর্গ নির্বাচিত করা হয়নি।';
      summaryEn = 'No symptoms or complaints selected.';
    } else {
      const catListBn = detailedSymptoms.map(c => `${c.category_name_bn} (${toBengaliDigits(c.symptoms.length)}টি)`).join(', ');
      const catListEn = detailedSymptoms.map(c => `${c.category_name_en} (${c.symptoms.length})`).join(', ');

      summaryBn = `মোট ৯টি ডায়াগনোসিস ক্যাটাগরির মধ্যে ${toBengaliDigits(catCount)}টি ক্যাটাগরিতে রোগীর মোট ${toBengaliDigits(totalSymCount)}টি উপসর্গ ও ইতিহাস চিহ্নিত করা হয়েছে: ${catListBn}।`;
      summaryEn = `Documented ${totalSymCount} active symptoms and history indicators across ${catCount} of 9 clinical categories: ${catListEn}.`;

      if (suicidalFlag) {
        summaryBn += ' ⚠️ [জরুরি সতর্কতা]: আত্মহত্যার চিন্তা বা নিজেকে ক্ষতি করার ইচ্ছা চিহ্নিত হয়েছে। অনতিবিলম্বে রেজিস্টার্ড মানসিক রোগ বিশেষজ্ঞের পরামর্শ গ্রহণ করুন।';
        summaryEn += ' ⚠️ [Urgent Clinical Alert]: Suicidal thoughts or urges to self-harm reported. Urgent professional mental health assessment is strongly recommended.';
      }
    }

    const catIdsArray = Array.from(affectedCatIds);
    const selectedSymptomsJsonStr = JSON.stringify(detailedSymptoms);
    const selectedSymptomIdsStr = JSON.stringify(symIds);
    const categoryIdsStr = JSON.stringify(catIdsArray);

    // Check if patient already has a record in patient_diagnoses
    const existing = db.prepare('SELECT id FROM patient_diagnoses WHERE patient_id = ? ORDER BY id DESC LIMIT 1').get(patient.patient_id);

    let diagnosisId;
    if (existing) {
      db.prepare(`
        UPDATE patient_diagnoses
        SET 
          appointment_id = COALESCE(?, appointment_id),
          session_id = COALESCE(?, session_id),
          category_ids = ?,
          selected_symptom_ids = ?,
          selected_symptoms_json = ?,
          summary_bn = ?,
          summary_en = ?,
          notes = ?,
          main_complaints_text = ?,
          onset_history_notes = ?,
          family_social_notes = ?,
          suicidal_ideation_flag = ?,
          raqi_name = ?,
          diagnosis_date = ?,
          updated_at = CURRENT_TIMESTAMP
        WHERE id = ?
      `).run(
        appointment_id || null,
        session_id || null,
        categoryIdsStr,
        selectedSymptomIdsStr,
        selectedSymptomsJsonStr,
        summaryBn,
        summaryEn,
        notes ? notes.trim() : '',
        main_complaints_text ? main_complaints_text.trim() : '',
        onset_history_notes ? onset_history_notes.trim() : '',
        family_social_notes ? family_social_notes.trim() : '',
        suicidalFlag,
        raqi_name || 'মুহাম্মদুল্লাহ মিয়াহ',
        diagnosis_date,
        existing.id
      );
      diagnosisId = existing.id;
    } else {
      const info = db.prepare(`
        INSERT INTO patient_diagnoses (
          patient_id, appointment_id, session_id,
          category_ids, selected_symptom_ids, selected_symptoms_json,
          summary_bn, summary_en, notes, main_complaints_text, onset_history_notes, family_social_notes, suicidal_ideation_flag,
          raqi_name, diagnosis_date
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        patient.patient_id,
        appointment_id || null,
        session_id || null,
        categoryIdsStr,
        selectedSymptomIdsStr,
        selectedSymptomsJsonStr,
        summaryBn,
        summaryEn,
        notes ? notes.trim() : '',
        main_complaints_text ? main_complaints_text.trim() : '',
        onset_history_notes ? onset_history_notes.trim() : '',
        family_social_notes ? family_social_notes.trim() : '',
        suicidalFlag,
        raqi_name || 'মুহাম্মদুল্লাহ মিয়াহ',
        diagnosis_date
      );
      diagnosisId = info.lastInsertRowid;
    }

    logAudit(req.admin.username, 'SAVE_PATIENT_DIAGNOSIS', 'PATIENT_DIAGNOSIS', patient.patient_id, `Saved diagnosis (${totalSymCount} symptoms in ${catCount} categories) for ${patient.full_name}`, req);

    res.json({
      success: true,
      message: 'রোগীর ডায়াগনোসিস রেকর্ড সফলভাবে সংরক্ষিত হয়েছে।',
      data: {
        id: diagnosisId,
        patient_id: patient.patient_id,
        total_symptoms: totalSymCount,
        total_categories: catCount,
        summary_bn: summaryBn,
        summary_en: summaryEn,
        suicidal_ideation_flag: suicidalFlag,
        selected_symptoms: detailedSymptoms
      }
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// ==================== WEIGHTED SYMPTOM ASSESSMENT SYSTEM ====================

/**
 * GET /api/admin/diagnosis/assessment-questions
 * Retrieves dynamic assessment questions with weights
 */
router.get('/assessment-questions', (req, res) => {
  try {
    const questions = db.prepare(`
      SELECT q.*, c.name_bn as category_name_bn, c.name_en as category_name_en, c.code as category_code
      FROM assessment_questions q
      JOIN diagnosis_categories c ON q.category_id = c.id
      WHERE q.is_active = 1
      ORDER BY q.category_id ASC, q.sort_order ASC
    `).all();

    res.json({ success: true, questions });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

/**
 * POST /api/admin/diagnosis/calculate-assessment
 * Calculates category percentage scores based on answers
 */
router.post('/calculate-assessment', (req, res) => {
  try {
    const { answers } = req.body; // e.g. { "1": "yes", "2": "sometimes", "3": "no" }
    if (!answers || typeof answers !== 'object') {
      return res.status(400).json({ success: false, error: 'Answers object is required' });
    }

    const questions = db.prepare(`
      SELECT q.id, q.category_id, q.weight_yes, q.weight_sometimes, q.weight_no, c.name_bn, c.name_en
      FROM assessment_questions q
      JOIN diagnosis_categories c ON q.category_id = c.id
      WHERE q.is_active = 1
    `).all();

    const categoryStats = {};
    for (const q of questions) {
      if (!categoryStats[q.category_id]) {
        categoryStats[q.category_id] = {
          category_id: q.category_id,
          name_bn: q.name_bn,
          name_en: q.name_en,
          earned_score: 0,
          max_score: 0
        };
      }

      categoryStats[q.category_id].max_score += (q.weight_yes || 10);
      const ans = (answers[q.id] || 'no').toLowerCase();
      if (ans === 'yes') {
        categoryStats[q.category_id].earned_score += (q.weight_yes || 10);
      } else if (ans === 'sometimes') {
        categoryStats[q.category_id].earned_score += (q.weight_sometimes || 5);
      } else {
        categoryStats[q.category_id].earned_score += (q.weight_no || 0);
      }
    }

    const results = Object.values(categoryStats).map(cat => {
      const percentage = cat.max_score > 0 ? Math.round((cat.earned_score / cat.max_score) * 100) : 0;
      let riskLevel = 'স্বাভাবিক / কোনো লক্ষণ নেই';
      if (percentage >= 70) riskLevel = 'তীব্র আক্রান্তের লক্ষণ (High Probability)';
      else if (percentage >= 40) riskLevel = 'মাঝারি লক্ষণ (Moderate Symptoms)';
      else if (percentage >= 20) riskLevel = 'মৃদু লক্ষণ (Mild Symptoms)';

      return {
        ...cat,
        percentage,
        risk_level: riskLevel
      };
    });

    res.json({
      success: true,
      disclaimer: 'এই অ্যাসেসমেন্ট শুধুমাত্র রুকইয়াহ থেরাপিস্টের প্রাথমিক পর্যালোচনার সহায়ক এবং পূর্ণাঙ্গ শরয়ী ডায়াগনোসিসের বিকল্প নয়।',
      results
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

/**
 * POST /api/admin/diagnosis/save-assessment
 * Persists calculated assessment scores to patient record
 */
router.post('/save-assessment', (req, res) => {
  try {
    const { patient_id, appointment_id, answers, results, raqi_notes } = req.body;
    if (!patient_id) return res.status(400).json({ success: false, error: 'Patient ID is required' });

    const today = new Date().toISOString().split('T')[0];
    const stmt = db.prepare(`
      INSERT INTO patient_assessment_scores (
        patient_id, appointment_id, assessment_date, scores_json, category_percentages_json, disclaimer_acknowledged, raqi_notes, conducted_by
      ) VALUES (?, ?, ?, ?, ?, 1, ?, ?)
    `);

    const r = stmt.run(
      patient_id,
      appointment_id || null,
      today,
      JSON.stringify(answers || {}),
      JSON.stringify(results || []),
      raqi_notes || '',
      req.admin.name || req.admin.username
    );

    logAudit(req.admin.username, 'SAVE_ASSESSMENT_SCORES', 'PATIENT', patient_id, `Saved weighted symptom assessment for ${patient_id}`, req);

    res.status(201).json({
      success: true,
      id: r.lastInsertRowid,
      message: 'রোগীর ওয়েটেড অ্যাসেসমেন্ট ফলাফল সংরক্ষিত হয়েছে।'
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

/**
 * GET /api/admin/diagnosis/assessment-history/:patientId
 * Retrieves past assessment records for patient timeline
 */
router.get('/assessment-history/:patientId', (req, res) => {
  try {
    const history = db.prepare(`
      SELECT * FROM patient_assessment_scores 
      WHERE patient_id = ? 
      ORDER BY id DESC
    `).all(req.params.patientId);

    const parsed = history.map(h => ({
      ...h,
      scores: JSON.parse(h.scores_json || '{}'),
      percentages: JSON.parse(h.category_percentages_json || '[]')
    }));

    res.json({ success: true, history: parsed });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

module.exports = router;
