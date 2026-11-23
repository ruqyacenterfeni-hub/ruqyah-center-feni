const path = require('path');
const express = require('express');
const cookieParser = require('cookie-parser');
const cors = require('cors');
const { PORT } = require('./config/constants');
const db = require('./database/db');

// Route modules
const publicApi = require('./routes/publicApi');
const authApi = require('./routes/authApi');
const adminAppointments = require('./routes/adminAppointments');
const adminAvailability = require('./routes/adminAvailability');
const adminPatients = require('./routes/adminPatients');
const adminSessions = require('./routes/adminSessions');
const adminFollowups = require('./routes/adminFollowups');
const adminPricing = require('./routes/adminPricing');
const adminReports = require('./routes/adminReports');
const adminSettings = require('./routes/adminSettings');
const adminDiagnosis = require('./routes/adminDiagnosis');
const adminArticles = require('./routes/adminArticles');
const lifestyleApi = require('./routes/lifestyleApi');
const shopApi = require('./routes/shopApi');
const coursesApi = require('./routes/coursesApi');
const resourcesApi = require('./routes/resourcesApi');
const adminCommerce = require('./routes/adminCommerce');

const app = express();

// Middlewares
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());

// Static assets
app.use(express.static(path.join(__dirname, 'public')));

// Public APIs
app.use('/api/public', publicApi);
app.use('/api/auth', authApi);
app.use('/api/lifestyle', lifestyleApi);
app.use('/api/shop', shopApi);
app.use('/api/courses', coursesApi);
app.use('/api/resources', resourcesApi);

// Admin Protected APIs
app.use('/api/admin/appointments', adminAppointments);
app.use('/api/admin/availability', adminAvailability);
app.use('/api/admin/patients', adminPatients);
app.use('/api/admin/sessions', adminSessions);
app.use('/api/admin/followups', adminFollowups);
app.use('/api/admin/pricing', adminPricing);
app.use('/api/admin/reports', adminReports);
app.use('/api/admin/settings', adminSettings);
app.use('/api/admin/diagnosis', adminDiagnosis);
app.use('/api/admin/articles', adminArticles);
app.use('/api/admin/commerce', adminCommerce);

// Public View Pages
app.get('/', (req, res) => res.sendFile(path.join(__dirname, 'views', 'index.html')));
app.get('/ruqyah', (req, res) => res.sendFile(path.join(__dirname, 'views', 'ruqyah.html')));
app.get('/hijama', (req, res) => res.sendFile(path.join(__dirname, 'views', 'hijama.html')));
app.get('/shop', (req, res) => res.sendFile(path.join(__dirname, 'views', 'shop.html')));
app.get('/orders/track', (req, res) => res.sendFile(path.join(__dirname, 'views', 'order-track.html')));
app.get('/shop/orders/track', (req, res) => res.sendFile(path.join(__dirname, 'views', 'order-track.html')));
app.get('/courses', (req, res) => res.sendFile(path.join(__dirname, 'views', 'courses.html')));
app.get('/courses/:slug', (req, res) => res.sendFile(path.join(__dirname, 'views', 'course-detail.html')));
app.get('/lifestyle', (req, res) => res.sendFile(path.join(__dirname, 'views', 'lifestyle.html')));
app.get('/lifestyle/tracker', (req, res) => res.sendFile(path.join(__dirname, 'views', 'lifestyle-tracker.html')));
app.get('/lifestyle/leaderboard', (req, res) => res.sendFile(path.join(__dirname, 'views', 'leaderboard.html')));
app.get('/about', (req, res) => res.sendFile(path.join(__dirname, 'views', 'about.html')));
app.get('/services', (req, res) => res.sendFile(path.join(__dirname, 'views', 'services.html')));
app.get('/articles', (req, res) => res.sendFile(path.join(__dirname, 'views', 'articles.html')));
app.get('/articles/:slug', (req, res) => res.sendFile(path.join(__dirname, 'views', 'article-detail.html')));
app.get('/case-studies', (req, res) => res.redirect('/articles'));
app.get('/policies', (req, res) => res.sendFile(path.join(__dirname, 'views', 'policies.html')));
app.get('/contact', (req, res) => res.sendFile(path.join(__dirname, 'views', 'contact.html')));
app.get('/book', (req, res) => res.sendFile(path.join(__dirname, 'views', 'book.html')));
app.get('/lookup', (req, res) => res.sendFile(path.join(__dirname, 'views', 'lookup.html')));
app.get('/appointments/slip/:id', (req, res) => res.sendFile(path.join(__dirname, 'views', 'appointment-slip.html')));

// Admin Portal Pages
app.get('/admin/login', (req, res) => res.sendFile(path.join(__dirname, 'views', 'admin-login.html')));
app.get('/admin', (req, res) => res.sendFile(path.join(__dirname, 'views', 'admin.html')));
app.get('/admin/*', (req, res) => res.sendFile(path.join(__dirname, 'views', 'admin.html')));

// Printable HTML Reports (for high-fidelity in-browser printing with @media print)
app.get('/reports/view/patient/:patient_id', (req, res) => res.sendFile(path.join(__dirname, 'views', 'report-patient.html')));
app.get('/reports/view/session/:session_id', (req, res) => res.sendFile(path.join(__dirname, 'views', 'report-session.html')));

// Health check for hosting monitors and reverse proxies
app.get('/health', (req, res) => res.status(200).json({ status: 'ok', uptime: process.uptime() }));

// Error handling middleware
app.use((err, req, res, next) => {
  if (err instanceof URIError) {
    return res.status(400).send('Bad Request: Invalid URL encoding');
  }
  console.error('Unhandled Application Error:', err);
  res.status(500).json({ success: false, error: 'An internal server error occurred.' });
});

// Start Server - Always listen unless running unit/system test runner
const isTestEnv = process.env.NODE_ENV === 'test' || (process.argv[1] && process.argv[1].endsWith('system.test.js'));

if (!isTestEnv) {
  const server = app.listen(PORT, '0.0.0.0', () => {
    const addr = server.address();
    const bind = typeof addr === 'string' ? `pipe ${addr}` : `port ${addr ? addr.port : PORT}`;
    console.log(`=======================================================`);
    console.log(` Ruqyah Support & Cupping Center - Feni Branch`);
    console.log(` Server listening on ${bind}`);
    console.log(` Public Booking:  /book`);
    console.log(` Admin Portal:    /admin`);
    console.log(` Default Admin:   admin / Admin@12345`);
    console.log(`=======================================================`);
  });
}

module.exports = app;
