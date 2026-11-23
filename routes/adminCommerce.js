const express = require('express');
const router = express.Router();
const db = require('../database/db');
const { requireAuth } = require('../middleware/auth');

router.use(requireAuth);

// ==================== PRODUCTS MANAGEMENT ====================
router.get('/products', (req, res) => {
  try {
    const products = db.prepare(`
      SELECT p.*, pc.name_bn as category_name 
      FROM products p 
      LEFT JOIN product_categories pc ON p.category_id = pc.id 
      ORDER BY p.id DESC
    `).all();
    res.json({ success: true, products });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

router.post('/products', (req, res) => {
  try {
    const { category_id, name_bn, name_en, slug, description_bn, description_en, price, discount_price, stock_quantity, image_url } = req.body;
    if (!name_bn || !price) {
      return res.status(400).json({ success: false, error: 'Product name and price are required' });
    }

    const cleanSlug = (slug || name_en || name_bn).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '') + '-' + Date.now().toString().slice(-4);

    const stmt = db.prepare(`
      INSERT INTO products (category_id, name_bn, name_en, slug, description_bn, description_en, price, discount_price, stock_quantity, image_url)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    const result = stmt.run(category_id || null, name_bn, name_en || name_bn, cleanSlug, description_bn || '', description_en || '', price, discount_price || null, stock_quantity || 100, image_url || '');

    res.status(201).json({ success: true, product_id: result.lastInsertRowid });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

router.put('/products/:id', (req, res) => {
  try {
    const { category_id, name_bn, name_en, description_bn, description_en, price, discount_price, stock_quantity, is_active, image_url } = req.body;
    db.prepare(`
      UPDATE products 
      SET category_id = ?, name_bn = ?, name_en = ?, description_bn = ?, description_en = ?, price = ?, discount_price = ?, stock_quantity = ?, is_active = ?, image_url = ?, updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `).run(category_id, name_bn, name_en, description_bn, description_en, price, discount_price, stock_quantity, is_active, image_url, req.params.id);

    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// ==================== ORDERS MANAGEMENT ====================
router.get('/orders', (req, res) => {
  try {
    const orders = db.prepare('SELECT * FROM orders ORDER BY id DESC').all();
    res.json({ success: true, orders });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

router.get('/orders/:id', (req, res) => {
  try {
    const order = db.prepare('SELECT * FROM orders WHERE id = ?').get(req.params.id);
    if (!order) return res.status(404).json({ success: false, error: 'Order not found' });
    const items = db.prepare('SELECT * FROM order_items WHERE order_id = ?').all(order.id);
    res.json({ success: true, order, items });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

router.put('/orders/:id/status', (req, res) => {
  try {
    const { status, internal_admin_notes } = req.body;
    db.prepare(`
      UPDATE orders 
      SET status = ?, internal_admin_notes = COALESCE(?, internal_admin_notes), updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `).run(status, internal_admin_notes || null, req.params.id);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// ==================== HIJAMA PACKAGES ====================
router.get('/hijama-packages', (req, res) => {
  try {
    const packages = db.prepare('SELECT * FROM hijama_packages ORDER BY display_order ASC').all();
    res.json({ success: true, packages });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

router.post('/hijama-packages', (req, res) => {
  try {
    const { title_bn, title_en, point_count, price, discount_price, description_bn, description_en, included_services } = req.body;
    const stmt = db.prepare(`
      INSERT INTO hijama_packages (title_bn, title_en, point_count, price, discount_price, description_bn, description_en, included_services)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `);
    const r = stmt.run(title_bn, title_en || title_bn, point_count, price, discount_price || null, description_bn || '', description_en || '', included_services || '');
    res.status(201).json({ success: true, id: r.lastInsertRowid });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

router.put('/hijama-packages/:id', (req, res) => {
  try {
    const { title_bn, title_en, point_count, price, discount_price, description_bn, description_en, included_services, is_active } = req.body;
    db.prepare(`
      UPDATE hijama_packages 
      SET title_bn = ?, title_en = ?, point_count = ?, price = ?, discount_price = ?, description_bn = ?, description_en = ?, included_services = ?, is_active = ?, updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `).run(title_bn, title_en, point_count, price, discount_price, description_bn, description_en, included_services, is_active, req.params.id);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// ==================== ADVERTISEMENTS ====================
router.get('/advertisements', (req, res) => {
  try {
    const ads = db.prepare('SELECT * FROM advertisements ORDER BY id DESC').all();
    res.json({ success: true, advertisements: ads });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

router.post('/advertisements', (req, res) => {
  try {
    const { title, description, image_url, target_url, placement, button_text, is_active } = req.body;
    const stmt = db.prepare(`
      INSERT INTO advertisements (title, description, image_url, target_url, placement, button_text, is_active)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `);
    const r = stmt.run(title, description || '', image_url, target_url || '#', placement || 'homepage', button_text || 'বিস্তারিত দেখুন', is_active !== undefined ? is_active : 1);
    res.status(201).json({ success: true, id: r.lastInsertRowid });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// ==================== PRESCRIPTION GENERATION ====================
router.post('/prescriptions', (req, res) => {
  try {
    const { patient_id, session_id, quranic_prescriptions, dua_prescriptions, sunnah_remedies, daily_amal_instructions, prohibitions, followup_date } = req.body;
    if (!patient_id) return res.status(400).json({ success: false, error: 'Patient ID is required' });

    const rxId = 'RX-' + Date.now().toString().slice(-6);
    const stmt = db.prepare(`
      INSERT INTO prescriptions (prescription_id, patient_id, session_id, quranic_prescriptions, dua_prescriptions, sunnah_remedies, daily_amal_instructions, prohibitions, followup_date, created_by)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    const r = stmt.run(
      rxId, 
      patient_id, 
      session_id || null, 
      typeof quranic_prescriptions === 'object' ? JSON.stringify(quranic_prescriptions) : quranic_prescriptions,
      typeof dua_prescriptions === 'object' ? JSON.stringify(dua_prescriptions) : dua_prescriptions,
      typeof sunnah_remedies === 'object' ? JSON.stringify(sunnah_remedies) : sunnah_remedies,
      typeof daily_amal_instructions === 'object' ? JSON.stringify(daily_amal_instructions) : daily_amal_instructions,
      prohibitions || '',
      followup_date || '',
      req.user ? req.user.username : 'lead_raqi'
    );

    res.status(201).json({ success: true, prescription_id: rxId, id: r.lastInsertRowid });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

router.get('/prescriptions/patient/:patientId', (req, res) => {
  try {
    const prescriptions = db.prepare('SELECT * FROM prescriptions WHERE patient_id = ? ORDER BY id DESC').all(req.params.patientId);
    res.json({ success: true, prescriptions });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// ==================== PRODUCT TOGGLE & DELETE ====================
router.post('/products/:id/toggle', (req, res) => {
  try {
    const prod = db.prepare('SELECT id, is_active FROM products WHERE id = ?').get(req.params.id);
    if (!prod) return res.status(404).json({ success: false, error: 'Product not found' });
    const newStatus = prod.is_active === 1 ? 0 : 1;
    db.prepare('UPDATE products SET is_active = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?').run(newStatus, prod.id);
    res.json({ success: true, is_active: newStatus });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

router.delete('/products/:id', (req, res) => {
  try {
    db.prepare('DELETE FROM products WHERE id = ?').run(req.params.id);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// ==================== RUQYAH AUDIOS ADMIN CRUD ====================
router.get('/ruqyah-audios', (req, res) => {
  try {
    const items = db.prepare('SELECT * FROM ruqyah_resources ORDER BY id DESC').all();
    res.json({ success: true, items });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

router.post('/ruqyah-audios', (req, res) => {
  try {
    const { category, title_bn, title_en, title_ar, text_bn, audio_url, pdf_url, duration, is_active } = req.body;
    if (!title_bn) return res.status(400).json({ success: false, error: 'Title (Bengali) is required' });
    const stmt = db.prepare(`
      INSERT INTO ruqyah_resources (category, title_bn, title_en, title_ar, text_bn, audio_url, pdf_url, duration, is_active)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    const r = stmt.run(category || 'general_ruqyah', title_bn, title_en || '', title_ar || '', text_bn || '', audio_url || '', pdf_url || '', duration || '২৫ মিনিট', is_active !== undefined ? is_active : 1);
    res.status(201).json({ success: true, id: r.lastInsertRowid });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

router.put('/ruqyah-audios/:id', (req, res) => {
  try {
    const { category, title_bn, title_en, title_ar, text_bn, audio_url, pdf_url, duration, is_active } = req.body;
    db.prepare(`
      UPDATE ruqyah_resources
      SET category = ?, title_bn = ?, title_en = ?, title_ar = ?, text_bn = ?, audio_url = ?, pdf_url = ?, duration = ?, is_active = ?
      WHERE id = ?
    `).run(category, title_bn, title_en, title_ar, text_bn, audio_url, pdf_url, duration, is_active !== undefined ? is_active : 1, req.params.id);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

router.post('/ruqyah-audios/:id/toggle', (req, res) => {
  try {
    const item = db.prepare('SELECT id, is_active FROM ruqyah_resources WHERE id = ?').get(req.params.id);
    if (!item) return res.status(404).json({ success: false, error: 'Audio resource not found' });
    const newStatus = item.is_active === 1 ? 0 : 1;
    db.prepare('UPDATE ruqyah_resources SET is_active = ? WHERE id = ?').run(newStatus, item.id);
    res.json({ success: true, is_active: newStatus });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

router.delete('/ruqyah-audios/:id', (req, res) => {
  try {
    db.prepare('DELETE FROM ruqyah_resources WHERE id = ?').run(req.params.id);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// ==================== HIJAMA PACKAGES TOGGLE & DELETE ====================
router.post('/hijama-packages/:id/toggle', (req, res) => {
  try {
    const pkg = db.prepare('SELECT id, is_active FROM hijama_packages WHERE id = ?').get(req.params.id);
    if (!pkg) return res.status(404).json({ success: false, error: 'Hijama package not found' });
    const newStatus = pkg.is_active === 1 ? 0 : 1;
    db.prepare('UPDATE hijama_packages SET is_active = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?').run(newStatus, pkg.id);
    res.json({ success: true, is_active: newStatus });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

router.delete('/hijama-packages/:id', (req, res) => {
  try {
    db.prepare('DELETE FROM hijama_packages WHERE id = ?').run(req.params.id);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// ==================== COURSES ADMIN CRUD & TOGGLE ====================
router.get('/courses', (req, res) => {
  try {
    const courses = db.prepare('SELECT * FROM courses ORDER BY id DESC').all();
    res.json({ success: true, courses });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

router.post('/courses', (req, res) => {
  try {
    const { title_bn, title_en, fee, duration, description_bn, is_active } = req.body;
    if (!title_bn) return res.status(400).json({ success: false, error: 'Course title is required' });
    const slug = (title_en || title_bn).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '') + '-' + Date.now().toString().slice(-4);
    const stmt = db.prepare(`
      INSERT INTO courses (title_bn, title_en, slug, fee, duration, description_bn, is_active)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `);
    const r = stmt.run(title_bn, title_en || title_bn, slug, fee || 0, duration || '৪ সপ্তাহ', description_bn || '', is_active !== undefined ? is_active : 1);
    res.status(201).json({ success: true, id: r.lastInsertRowid });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

router.put('/courses/:id', (req, res) => {
  try {
    const { title_bn, title_en, fee, duration, description_bn, is_active } = req.body;
    db.prepare(`
      UPDATE courses
      SET title_bn = ?, title_en = ?, fee = ?, duration = ?, description_bn = ?, is_active = ?, updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `).run(title_bn, title_en, fee || 0, duration, description_bn, is_active !== undefined ? is_active : 1, req.params.id);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

router.post('/courses/:id/toggle', (req, res) => {
  try {
    const course = db.prepare('SELECT id, is_active FROM courses WHERE id = ?').get(req.params.id);
    if (!course) return res.status(404).json({ success: false, error: 'Course not found' });
    const newStatus = course.is_active === 1 ? 0 : 1;
    db.prepare('UPDATE courses SET is_active = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?').run(newStatus, course.id);
    res.json({ success: true, is_active: newStatus });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

router.delete('/courses/:id', (req, res) => {
  try {
    db.prepare('DELETE FROM courses WHERE id = ?').run(req.params.id);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

module.exports = router;
