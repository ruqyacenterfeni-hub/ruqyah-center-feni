const express = require('express');
const router = express.Router();
const db = require('../database/db');
const { requireAdmin } = require('../middleware/auth');
const { logAudit } = require('../middleware/audit');
const { generatePatientHistoryPdf, generateRuqyahSessionPdf } = require('../utils/pdfGenerator');

router.use(requireAdmin);

/**
 * GET /api/admin/reports/patient/:patient_id/pdf
 * Generates and streams standard binary PDF for Patient History Report
 * Supports ?lang=bn (default) or ?lang=en
 */
router.get('/patient/:patient_id/pdf', async (req, res) => {
  try {
    const patientId = req.params.patient_id;
    const lang = req.query.lang === 'en' ? 'en' : 'bn';
    const isShareable = req.query.shareable === '1' || req.query.type === 'shareable';
    const patient = db.prepare('SELECT * FROM patients WHERE patient_id = ? OR id = ?').get(patientId, patientId);
    if (!patient) {
      return res.status(404).json({ success: false, error: 'Patient not found.' });
    }

    const history = db.prepare('SELECT * FROM patient_histories WHERE patient_id = ?').get(patient.patient_id);
    const diagnosis = db.prepare('SELECT * FROM patient_diagnoses WHERE patient_id = ? ORDER BY id DESC LIMIT 1').get(patient.patient_id);
    
    // Privacy protection: omit internal confidential notes in patient shareable copy
    let sanitizedHistory = history;
    if (isShareable && history) {
      sanitizedHistory = { ...history };
      if (sanitizedHistory.raqi_confidential_notes) delete sanitizedHistory.raqi_confidential_notes;
    }

    const pdfBuffer = await generatePatientHistoryPdf(patient, sanitizedHistory, diagnosis, lang, { isShareable });

    // Save snapshot record in reports table
    const reportRef = `RPT-HIST-${patient.patient_id}-${Date.now()}-${Math.floor(Math.random() * 10000)}`;
    db.prepare(`
      INSERT INTO reports (report_id, report_type, patient_id, title, generated_by, data_snapshot)
      VALUES (?, 'patient_history', ?, ?, ?, ?)
    `).run(
      reportRef,
      patient.patient_id,
      `Patient History Report (${lang.toUpperCase()}${isShareable ? ' - Shareable' : ''}) - ${patient.full_name}`,
      req.admin.name,
      JSON.stringify({ patient, history: sanitizedHistory, lang, isShareable })
    );

    logAudit(req.admin.username, 'GENERATE_PDF_REPORT', 'REPORT', reportRef, `Downloaded Patient History PDF (${lang.toUpperCase()}${isShareable ? ' Shareable' : ''}) for ${patient.full_name}`, req);

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="Patient_History_${patient.patient_id}_${lang.toUpperCase()}${isShareable ? '_Shareable' : ''}.pdf"`);
    res.setHeader('Content-Length', pdfBuffer.length);
    res.send(pdfBuffer);
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

/**
 * GET /api/admin/reports/session/:session_id/pdf
 * Generates and streams standard binary PDF for Ruqyah Session Report
 * Supports ?lang=bn (default) or ?lang=en, and ?shareable=1
 */
router.get('/session/:session_id/pdf', async (req, res) => {
  try {
    const sessionId = req.params.session_id;
    const lang = req.query.lang === 'en' ? 'en' : 'bn';
    const isShareable = req.query.shareable === '1' || req.query.type === 'shareable';
    const session = db.prepare('SELECT * FROM ruqyah_sessions WHERE session_id = ? OR id = ?').get(sessionId, sessionId);
    if (!session) {
      return res.status(404).json({ success: false, error: 'Ruqyah session not found.' });
    }

    const patient = db.prepare('SELECT * FROM patients WHERE patient_id = ?').get(session.patient_id);
    if (!patient) {
      return res.status(404).json({ success: false, error: 'Associated patient not found.' });
    }

    let sanitizedSession = session;
    if (isShareable && session) {
      sanitizedSession = { ...session };
      if (sanitizedSession.confidential_raqi_notes) delete sanitizedSession.confidential_raqi_notes;
    }

    const pdfBuffer = await generateRuqyahSessionPdf(sanitizedSession, patient, lang, { isShareable });

    // Save snapshot record
    const reportRef = `RPT-SESS-${session.session_id}-${Date.now()}-${Math.floor(Math.random() * 10000)}`;
    db.prepare(`
      INSERT INTO reports (report_id, report_type, patient_id, session_id, title, generated_by, data_snapshot)
      VALUES (?, 'ruqyah_session', ?, ?, ?, ?, ?)
    `).run(
      reportRef,
      patient.patient_id,
      session.session_id,
      `Ruqyah Session #${session.session_number} Report (${lang.toUpperCase()}${isShareable ? ' - Shareable' : ''}) - ${patient.full_name}`,
      req.admin.name,
      JSON.stringify({ session: sanitizedSession, patient, lang, isShareable })
    );

    logAudit(req.admin.username, 'GENERATE_PDF_REPORT', 'REPORT', reportRef, `Downloaded Ruqyah Session PDF (${lang.toUpperCase()}${isShareable ? ' Shareable' : ''}) for ${session.session_id}`, req);

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="Ruqyah_Session_${session.session_id}_${lang.toUpperCase()}${isShareable ? '_Shareable' : ''}.pdf"`);
    res.setHeader('Content-Length', pdfBuffer.length);
    res.send(pdfBuffer);
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

/**
 * GET /api/admin/reports and /api/admin/reports/list
 * List all generated report history
 */
router.get('/', (req, res) => {
  try {
    const reports = db.prepare(`
      SELECT r.*, p.full_name as patient_name, p.phone as patient_phone
      FROM reports r
      JOIN patients p ON r.patient_id = p.patient_id
      ORDER BY r.id DESC
      LIMIT 100
    `).all();

    res.json({ success: true, count: reports.length, data: reports });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

router.get('/list', (req, res) => {
  try {
    const reports = db.prepare(`
      SELECT r.*, p.full_name as patient_name, p.phone as patient_phone
      FROM reports r
      JOIN patients p ON r.patient_id = p.patient_id
      ORDER BY r.id DESC
      LIMIT 100
    `).all();

    res.json({ success: true, count: reports.length, data: reports });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

module.exports = router;
