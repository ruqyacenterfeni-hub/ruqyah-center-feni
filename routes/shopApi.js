const express = require('express');
const router = express.Router();
const crypto = require('crypto');
const db = require('../database/db');

// 1. Get Product Categories
router.get('/categories', (req, res) => {
  try {
    const categories = db.prepare('SELECT * FROM product_categories WHERE is_active = 1 ORDER BY display_order ASC').all();
    res.json({ success: true, categories });
  } catch (err) {
    console.error('Fetch categories error:', err);
    res.status(500).json({ success: false, error: 'Failed to retrieve categories' });
  }
});

// 2. Get Products (with optional category filter and search)
router.get('/products', (req, res) => {
  try {
    const { category, search } = req.query;
    let query = `
      SELECT p.*, pc.name_bn as category_name_bn, pc.name_en as category_name_en, pc.slug as category_slug
      FROM products p
      LEFT JOIN product_categories pc ON p.category_id = pc.id
      WHERE p.is_active = 1
    `;
    const params = [];

    if (category) {
      query += ' AND pc.slug = ?';
      params.push(category);
    }

    if (search) {
      query += ' AND (p.name_bn LIKE ? OR p.name_en LIKE ? OR p.description_bn LIKE ?)';
      const term = `%${search.trim()}%`;
      params.push(term, term, term);
    }

    query += ' ORDER BY p.display_order ASC, p.id DESC';
    const products = db.prepare(query).all(...params);
    res.json({ success: true, products });
  } catch (err) {
    console.error('Fetch products error:', err);
    res.status(500).json({ success: false, error: 'Failed to retrieve products' });
  }
});

// 3. Get Single Product by Slug
router.get('/products/:slug', (req, res) => {
  try {
    const product = db.prepare(`
      SELECT p.*, pc.name_bn as category_name_bn, pc.name_en as category_name_en, pc.slug as category_slug
      FROM products p
      LEFT JOIN product_categories pc ON p.category_id = pc.id
      WHERE p.slug = ? AND p.is_active = 1
    `).get(req.params.slug);

    if (!product) {
      return res.status(404).json({ success: false, error: 'Product not found' });
    }

    // Related products in the same category
    const related = db.prepare(`
      SELECT id, name_bn, name_en, slug, price, discount_price, image_url
      FROM products 
      WHERE category_id = ? AND id != ? AND is_active = 1 
      LIMIT 4
    `).all(product.category_id, product.id);

    res.json({ success: true, product, related_products: related });
  } catch (err) {
    console.error('Fetch product detail error:', err);
    res.status(500).json({ success: false, error: 'Failed to retrieve product details' });
  }
});

// 4. Place Order (Checkout)
router.post('/orders/checkout', (req, res) => {
  try {
    const { customer_name, customer_phone, shipping_address, district, items, customer_notes } = req.body;

    if (!customer_name || !customer_phone || !shipping_address) {
      return res.status(400).json({ success: false, error: 'Customer name, phone number, and address are required' });
    }

    const cleanPhone = customer_phone.replace(/[^0-9]/g, '');
    if (cleanPhone.length < 11) {
      return res.status(400).json({ success: false, error: 'Please enter a valid 11-digit mobile number' });
    }

    if (!Array.isArray(items) || items.length === 0) {
      return res.status(400).json({ success: false, error: 'Your cart is empty' });
    }

    // Validate each item and calculate totals
    let subtotal = 0;
    const validatedItems = [];

    for (const item of items) {
      const product = db.prepare('SELECT id, name_bn, name_en, price, discount_price, stock_quantity, is_active FROM products WHERE id = ?').get(item.product_id);
      if (!product || !product.is_active) {
        return res.status(400).json({ success: false, error: `Product ID ${item.product_id} is unavailable` });
      }

      const qty = parseInt(item.quantity, 10);
      if (isNaN(qty) || qty <= 0) {
        return res.status(400).json({ success: false, error: `Invalid quantity for ${product.name_bn}` });
      }

      const unitPrice = (product.discount_price !== null && product.discount_price > 0) ? product.discount_price : product.price;
      const itemTotal = unitPrice * qty;
      subtotal += itemTotal;

      validatedItems.push({
        product_id: product.id,
        name: product.name_bn,
        quantity: qty,
        unit_price: unitPrice,
        total_price: itemTotal
      });
    }

    // Shipping charge: Feni district = 70 BDT, outside = 130 BDT
    const isFeni = district && district.toLowerCase().includes('feni');
    const shippingCharge = isFeni ? 70 : 120;
    const totalAmount = subtotal + shippingCharge;

    // Generate readable order number: e.g. ORD-2611-ABCD
    const dateCode = new Date().toISOString().slice(2, 7).replace('-', '');
    const randCode = crypto.randomBytes(2).toString('hex').toUpperCase();
    const orderNumber = `ORD-${dateCode}-${randCode}`;

    const fullAddress = district ? `${shipping_address}, ${district}` : shipping_address;

    const insertOrder = db.prepare(`
      INSERT INTO orders (order_number, customer_name, customer_phone, shipping_address, subtotal_amount, shipping_charge, total_amount, payment_method, status, customer_notes)
      VALUES (?, ?, ?, ?, ?, ?, ?, 'Cash on Delivery', 'Order Received', ?)
    `);

    const orderRes = insertOrder.run(orderNumber, customer_name.trim(), cleanPhone, fullAddress.trim(), subtotal, shippingCharge, totalAmount, customer_notes || null);
    const orderId = orderRes.lastInsertRowid;

    const insertItem = db.prepare(`
      INSERT INTO order_items (order_id, product_id, product_name, quantity, unit_price, total_price)
      VALUES (?, ?, ?, ?, ?, ?)
    `);

    for (const vItem of validatedItems) {
      insertItem.run(orderId, vItem.product_id, vItem.name, vItem.quantity, vItem.unit_price, vItem.total_price);
      // Decrement stock
      db.prepare('UPDATE products SET stock_quantity = MAX(0, stock_quantity - ?) WHERE id = ?').run(vItem.quantity, vItem.product_id);
    }

    res.status(201).json({
      success: true,
      message: 'আপনার অর্ডার সফলভাবে গৃহীত হয়েছে। শীঘ্রই আমাদের প্রতিনিধি আপনার সাথে যোগাযোগ করবেন।',
      order: {
        id: orderId,
        order_number: orderNumber,
        customer_name: customer_name.trim(),
        customer_phone: cleanPhone,
        shipping_address: fullAddress,
        subtotal: subtotal,
        shipping_charge: shippingCharge,
        total_amount: totalAmount,
        payment_method: 'Cash on Delivery',
        status: 'Order Received',
        items: validatedItems
      }
    });
  } catch (err) {
    console.error('Order checkout error:', err);
    res.status(500).json({ success: false, error: 'Failed to complete order. Please try again.' });
  }
});

// 5. Order Tracking by Order Number & Phone
router.get('/orders/track', (req, res) => {
  try {
    const { order_number, phone } = req.query;
    if (!order_number || !phone) {
      return res.status(400).json({ success: false, error: 'Order number and customer phone number are required for tracking' });
    }

    const cleanPhone = phone.replace(/[^0-9]/g, '');
    const cleanOrderNumber = order_number.trim().toUpperCase();

    const order = db.prepare(`
      SELECT * FROM orders 
      WHERE UPPER(order_number) = ? AND customer_phone = ?
    `).get(cleanOrderNumber, cleanPhone);

    if (!order) {
      return res.status(404).json({ success: false, error: 'No order found matching the provided Order Number and Phone Number' });
    }

    const items = db.prepare('SELECT * FROM order_items WHERE order_id = ?').all(order.id);

    // Milestones timeline
    const allStatuses = ['Order Received', 'Processing', 'Shipped', 'Delivered'];
    const currentIdx = allStatuses.indexOf(order.status);

    const timeline = allStatuses.map((st, idx) => ({
      status: st,
      completed: currentIdx >= idx,
      is_current: currentIdx === idx
    }));

    res.json({
      success: true,
      order: {
        order_number: order.order_number,
        customer_name: order.customer_name,
        customer_phone: order.customer_phone,
        shipping_address: order.shipping_address,
        subtotal_amount: order.subtotal_amount,
        shipping_charge: order.shipping_charge,
        total_amount: order.total_amount,
        payment_method: order.payment_method,
        status: order.status,
        created_at: order.created_at,
        items,
        timeline
      }
    });
  } catch (err) {
    console.error('Order tracking error:', err);
    res.status(500).json({ success: false, error: 'Failed to retrieve order tracking information' });
  }
});

module.exports = router;
