require('dotenv').config();
const express = require('express');
const session = require('express-session');
const bcrypt = require('bcryptjs');
const multer = require('multer');
const nodemailer = require('nodemailer');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const rateLimit = require('express-rate-limit');
const helmet = require('helmet');
const { initDatabase, getDb, run, get, all, exec, saveDatabase } = require('./database');

const app = express();
const PORT = process.env.PORT || 3000;

// Initialize database before starting server
async function startServer() {
  await initDatabase();
  console.log('Database initialized');

  // Ensure uploads directory exists
  const uploadsDir = path.join(__dirname, 'uploads');
  if (!fs.existsSync(uploadsDir)) {
    fs.mkdirSync(uploadsDir, { recursive: true });
  }

  // Configure multer for file uploads
  const storage = multer.diskStorage({
    destination: (req, file, cb) => cb(null, uploadsDir),
    filename: (req, file, cb) => {
      const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
      cb(null, uniqueSuffix + path.extname(file.originalname));
    }
  });
  const upload = multer({
    storage,
    limits: { fileSize: 5 * 1024 * 1024 }, // 5MB
    fileFilter: (req, file, cb) => {
      const allowed = /jpeg|jpg|png|pdf/;
      const ext = allowed.test(path.extname(file.originalname).toLowerCase());
      const mime = allowed.test(file.mimetype);
      if (ext && mime) cb(null, true);
      else cb(new Error('Only images (jpg, png) and PDFs allowed'));
    }
  });

  // Session config
  app.use(session({
    secret: process.env.SESSION_SECRET || 'letter-service-secret-key',
    resave: false,
    saveUninitialized: false,
    cookie: {
      secure: process.env.NODE_ENV === 'production',
      httpOnly: true,
      sameSite: 'strict',
      maxAge: 24 * 60 * 60 * 1000
    }
  }));

  // Middleware
  app.use(express.json());
  app.use(express.urlencoded({ extended: true }));
  app.use(express.static(path.join(__dirname, 'public')));

  // Security headers
  app.use(helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'", "'unsafe-inline'", "https://unpkg.com"],
        styleSrc: ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com"],
        fontSrc: ["'self'", "https://fonts.gstatic.com"],
        imgSrc: ["'self'", "data:"],
        connectSrc: ["'self'"],
        frameSrc: ["'none'"],
        objectSrc: ["'none'"]
      }
    },
    crossOriginEmbedderPolicy: false
  }));

  // Rate limiting for auth endpoints
  const authLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 10, // 10 attempts per window
    message: { error: 'Too many attempts. Please try again after 15 minutes.' },
    standardHeaders: true,
    legacyHeaders: false
  });

  // General API rate limit
  const apiLimiter = rateLimit({
    windowMs: 60 * 1000, // 1 minute
    max: 100, // 100 requests per minute
    message: { error: 'Too many requests. Please slow down.' },
    standardHeaders: true,
    legacyHeaders: false
  });

  app.use('/api/', apiLimiter);

  // SMTP Transport
  const transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST || 'smtp.example.com',
    port: process.env.SMTP_PORT || 587,
    secure: false,
    auth: {
      user: process.env.SMTP_USER || '',
      pass: process.env.SMTP_PASS || ''
    }
  });

  // Auth middleware
  const requireAuth = (req, res, next) => {
    if (!req.session.userId) return res.status(401).json({ error: 'Not authenticated' });
    next();
  };

  const requireAdmin = (req, res, next) => {
    if (!req.session.userId) return res.status(401).json({ error: 'Not authenticated' });
    if (req.session.role !== 'admin') return res.status(403).json({ error: 'Not authorized' });
    next();
  };

  // CSRF protection middleware (Double Submit Cookie pattern)
  const csrfProtection = (req, res, next) => {
    const csrfToken = req.cookies?.csrfToken;
    const requestToken = req.headers['x-csrf-token'];

    if (!csrfToken || !requestToken || csrfToken !== requestToken) {
      return res.status(403).json({ error: 'Invalid CSRF token' });
    }
    next();
  };

  // Generate CSRF token
  app.get('/api/auth/csrf-token', (req, res) => {
    const token = crypto.randomBytes(32).toString('hex');
    res.cookie('csrfToken', token, {
      httpOnly: false, // Must be readable by JS
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'strict'
    });
    res.json({ csrfToken: token });
  });

  // Serve admin.html only to admins
  app.get('/admin.html', (req, res) => {
    if (!req.session.userId || req.session.role !== 'admin') {
      return res.redirect('/login.html');
    }
    res.sendFile(path.join(__dirname, 'public', 'admin.html'));
  });

  // ============ AUTH ROUTES ============

  app.post('/api/auth/register', authLimiter, csrfProtection, (req, res) => {
    try {
      const { name, email, password } = req.body;
      if (!name || !email || !password) {
        return res.status(400).json({ error: 'All fields required' });
      }
      if (password.length < 8) {
        return res.status(400).json({ error: 'Password must be at least 8 characters' });
      }

      const existing = get('SELECT id FROM users WHERE email = ?', [email]);
      if (existing) {
        return res.status(400).json({ error: 'Email already registered' });
      }

      const hash = bcrypt.hashSync(password, 10);
      const result = run(
        'INSERT INTO users (name, email, password_hash) VALUES (?, ?, ?)',
        [name, email, hash]
      );

      req.session.userId = result.lastInsertRowid;
      req.session.role = 'user';
      req.session.userName = name;

      res.json({ success: true, user: { id: result.lastInsertRowid, name, email, role: 'user' } });
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: 'Registration failed' });
    }
  });

  app.post('/api/auth/login', authLimiter, (req, res) => {
    try {
      const { email, password } = req.body;
      if (!email || !password) {
        return res.status(400).json({ error: 'Email and password required' });
      }

      const user = get('SELECT * FROM users WHERE email = ?', [email]);
      if (!user || !bcrypt.compareSync(password, user.password_hash)) {
        return res.status(401).json({ error: 'Invalid credentials' });
      }

      req.session.userId = user.id;
      req.session.role = user.role;
      req.session.userName = user.name;

      res.json({
        success: true,
        user: { id: user.id, name: user.name, email: user.email, role: user.role }
      });
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: 'Login failed' });
    }
  });

  app.post('/api/auth/logout', csrfProtection, (req, res) => {
    req.session.destroy();
    res.json({ success: true });
  });

  app.get('/api/auth/me', (req, res) => {
    if (!req.session.userId) return res.json({ user: null });

    const user = get('SELECT id, name, email, role, trial_used FROM users WHERE id = ?', [req.session.userId]);
    res.json({ user });
  });

  // ============ USER REQUEST ROUTES ============

  app.post('/api/requests', requireAuth, csrfProtection, upload.single('file'), async (req, res) => {
    try {
      const { type, letter_type, subject, description, recipient_email, priority } = req.body;

      // Determine price
      const prices = { fast: 5000, medium: 2500, normal: 1000 };
      const price = prices[priority] || 1000;

      // Check trial
      const user = get('SELECT trial_used FROM users WHERE id = ?', [req.session.userId]);
      const isFirstRequest = user.trial_used === 0;
      const finalPrice = isFirstRequest ? 0 : price;

      // Status: free/trial requests go straight to pending, paid requests need payment first
      const status = finalPrice === 0 ? 'pending' : 'pending_payment';

      const result = run(
        `INSERT INTO requests (user_id, type, letter_type, subject, description, file_path, recipient_email, priority, price, status)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          req.session.userId,
          type || 'description',
          letter_type || null,
          subject || null,
          description || null,
          req.file ? req.file.filename : null,
          recipient_email || null,
          priority || 'normal',
          finalPrice,
          status
        ]
      );

      // Mark trial as used
      if (isFirstRequest) {
        run('UPDATE users SET trial_used = 1 WHERE id = ?', [req.session.userId]);
      }

      // Send payment instruction email if not free
      if (finalPrice > 0) {
        const bankName = process.env.BANK_NAME || 'Access Bank';
        const accountName = process.env.ACCOUNT_NAME || 'LetterPro';
        const accountNumber = process.env.ACCOUNT_NUMBER || '1234567890';

        try {
          await transporter.sendMail({
            from: `"LetterPro" <${process.env.FROM_EMAIL || 'officialletterpro.com@gmail.com'}>`,
            to: recipient_email,
            subject: `Payment Required - Order #${result.lastInsertRowid}`,
            html: `
              <div style="font-family: 'Segoe UI', Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 40px 20px; background: #ffffff;">
                <!-- Header -->
                <div style="text-align: center; margin-bottom: 40px; padding-bottom: 20px; border-bottom: 2px solid #e7e5e4;">
                  <h1 style="color: #2563eb; font-size: 28px; margin: 0;">LetterPro</h1>
                  <p style="color: #78716c; font-size: 14px; margin: 8px 0 0 0;">Professional Letter Writing Service</p>
                </div>

                <!-- Content -->
                <h2 style="color: #1c1917; font-size: 22px; margin: 0 0 20px 0;">Payment Required</h2>
                <p style="color: #44403c; font-size: 16px; line-height: 1.6; margin: 0 0 20px 0;">
                  Hello,
                </p>
                <p style="color: #44403c; font-size: 16px; line-height: 1.6; margin: 0 0 30px 0;">
                  Thank you for your order! To proceed with your letter request, please make payment using the details below:
                </p>

                <!-- Payment Details -->
                <div style="background: #f0fdf4; border: 2px solid #22c55e; border-radius: 12px; padding: 30px; margin: 30px 0;">
                  <h3 style="color: #16a34a; font-size: 18px; margin: 0 0 20px 0; text-align: center;">Payment Details</h3>
                  <table style="width: 100%; border-collapse: collapse;">
                    <tr>
                      <td style="padding: 10px 0; color: #78716c; font-size: 14px;">Order ID</td>
                      <td style="padding: 10px 0; color: #1c1917; font-size: 14px; text-align: right; font-weight: 600;">#${result.lastInsertRowid}</td>
                    </tr>
                    <tr>
                      <td style="padding: 10px 0; color: #78716c; font-size: 14px;">Letter Type</td>
                      <td style="padding: 10px 0; color: #1c1917; font-size: 14px; text-align: right; font-weight: 500;">${letter_type || 'Picture Upload'}</td>
                    </tr>
                    <tr>
                      <td style="padding: 10px 0; color: #78716c; font-size: 14px;">Priority</td>
                      <td style="padding: 10px 0; color: #1c1917; font-size: 14px; text-align: right; font-weight: 500; text-transform: capitalize;">${priority}</td>
                    </tr>
                    <tr style="border-top: 2px solid #22c55e;">
                      <td style="padding: 15px 0 5px 0; color: #78716c; font-size: 16px; font-weight: 500;">Amount to Pay</td>
                      <td style="padding: 15px 0 5px 0; color: #16a34a; font-size: 24px; text-align: right; font-weight: 700;">₦${finalPrice.toLocaleString()}</td>
                    </tr>
                  </table>

                  <div style="margin-top: 25px; padding-top: 20px; border-top: 1px dashed #22c55e;">
                    <table style="width: 100%;">
                      <tr>
                        <td style="padding: 5px 0; color: #78716c; font-size: 14px;">Bank Name</td>
                        <td style="padding: 5px 0; color: #1c1917; font-size: 14px; text-align: right; font-weight: 600;">${bankName}</td>
                      </tr>
                      <tr>
                        <td style="padding: 5px 0; color: #78716c; font-size: 14px;">Account Name</td>
                        <td style="padding: 5px 0; color: #1c1917; font-size: 14px; text-align: right; font-weight: 600;">${accountName}</td>
                      </tr>
                      <tr>
                        <td style="padding: 5px 0; color: #78716c; font-size: 14px;">Account Number</td>
                        <td style="padding: 5px 0; color: #1c1917; font-size: 18px; text-align: right; font-weight: 700; letter-spacing: 2px;">${accountNumber}</td>
                      </tr>
                    </table>
                  </div>
                </div>

                <!-- Instructions -->
                <div style="background: #fef3c7; border: 1px solid #f59e0b; border-radius: 8px; padding: 20px; margin: 30px 0;">
                  <h4 style="color: #92400e; font-size: 14px; margin: 0 0 10px 0;">📋 How to Send Your Receipt</h4>
                  <p style="color: #78350f; font-size: 14px; margin: 0; line-height: 1.6;">
                    After making payment, take a screenshot or photo of your receipt and send it to us via WhatsApp or email. Once we verify your payment, we will start working on your letter immediately.
                  </p>
                </div>

                <!-- Note -->
                <div style="background: #fefce8; border: 1px solid #fef08a; border-radius: 8px; padding: 16px; margin: 30px 0;">
                  <p style="color: #854d0e; font-size: 14px; margin: 0;">
                    <strong>Important:</strong> If this email ends up in your Spam/Junk folder, please mark it as "Not Spam" to ensure future emails reach your inbox.
                  </p>
                </div>

                <!-- Footer -->
                <div style="margin-top: 40px; padding-top: 20px; border-top: 1px solid #e7e5e4; text-align: center;">
                  <p style="color: #78716c; font-size: 14px; margin: 0 0 8px 0;">Thank you for choosing LetterPro</p>
                  <p style="color: #a8a29e; font-size: 12px; margin: 0;">Questions? Contact us anytime.</p>
                </div>
              </div>
            `
          });
        } catch (emailErr) {
          console.log('Payment instruction email failed:', emailErr.message);
        }
      }

      res.json({ success: true, requestId: result.lastInsertRowid, price: finalPrice, status });
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: 'Failed to create request' });
    }
  });

  app.get('/api/requests/mine', requireAuth, (req, res) => {
    try {
      const requests = all(
        'SELECT * FROM requests WHERE user_id = ? ORDER BY created_at DESC',
        [req.session.userId]
      );
      res.json({ requests });
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: 'Failed to fetch requests' });
    }
  });

  app.get('/api/requests/:id', requireAuth, (req, res) => {
    try {
      const request = get(
        `SELECT r.*, u.name as user_name, u.email as user_email
         FROM requests r
         JOIN users u ON r.user_id = u.id
         WHERE r.id = ? AND r.user_id = ?`,
        [req.params.id, req.session.userId]
      );

      if (!request) return res.status(404).json({ error: 'Request not found' });
      res.json({ request });
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: 'Failed to fetch request' });
    }
  });

  // Upload payment receipt
  app.post('/api/requests/:id/receipt', requireAuth, csrfProtection, upload.single('receipt'), (req, res) => {
    try {
      // Verify the request belongs to this user
      const request = get('SELECT * FROM requests WHERE id = ? AND user_id = ?', [req.params.id, req.session.userId]);
      if (!request) return res.status(404).json({ error: 'Request not found' });

      if (!req.file) return res.status(400).json({ error: 'No receipt uploaded' });

      // Update with receipt path and change status
      run(
        'UPDATE requests SET payment_receipt_path = ?, status = ?, updated_at = datetime(\'now\') WHERE id = ?',
        [req.file.filename, 'payment_submitted', req.params.id]
      );

      res.json({ success: true });
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: 'Failed to upload receipt' });
    }
  });

  // ============ ADMIN ROUTES ============

  app.get('/api/admin/requests', requireAdmin, (req, res) => {
    try {
      const { status, priority, search } = req.query;
      let query = `
        SELECT r.*, u.name as user_name, u.email as user_email
        FROM requests r
        JOIN users u ON r.user_id = u.id
        WHERE 1=1
      `;
      const params = [];

      if (status) {
        query += ' AND r.status = ?';
        params.push(status);
      }
      if (priority) {
        query += ' AND r.priority = ?';
        params.push(priority);
      }
      if (search) {
        query += ' AND (u.email LIKE ? OR u.name LIKE ?)';
        params.push(`%${search}%`, `%${search}%`);
      }

      query += ' ORDER BY r.created_at DESC';

      const requests = all(query, params);
      res.json({ requests });
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: 'Failed to fetch requests' });
    }
  });

  app.get('/api/admin/requests/:id', requireAdmin, (req, res) => {
    try {
      const request = get(
        `SELECT r.*, u.name as user_name, u.email as user_email
         FROM requests r
         JOIN users u ON r.user_id = u.id
         WHERE r.id = ?`,
        [req.params.id]
      );

      if (!request) return res.status(404).json({ error: 'Request not found' });
      res.json({ request });
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: 'Failed to fetch request' });
    }
  });

  app.put('/api/admin/requests/:id/status', requireAdmin, csrfProtection, (req, res) => {
    try {
      const { status } = req.body;
      run('UPDATE requests SET status = ?, updated_at = datetime(\'now\') WHERE id = ?', [status, req.params.id]);
      res.json({ success: true });
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: 'Failed to update status' });
    }
  });

  app.put('/api/admin/requests/:id/letter', requireAdmin, csrfProtection, (req, res) => {
    try {
      const { letter_content } = req.body;
      run(
        'UPDATE requests SET letter_content = ?, status = ?, updated_at = datetime(\'now\') WHERE id = ?',
        [letter_content, 'in_progress', req.params.id]
      );
      res.json({ success: true });
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: 'Failed to save letter' });
    }
  });

  app.put('/api/admin/requests/:id/mark-paid', requireAdmin, csrfProtection, async (req, res) => {
    try {
      // Get request details before updating
      const request = get('SELECT r.*, u.name as user_name, u.email as user_email FROM requests r JOIN users u ON r.user_id = u.id WHERE r.id = ?', [req.params.id]);

      run('UPDATE requests SET status = ?, updated_at = datetime(\'now\') WHERE id = ?', ['paid', req.params.id]);

      // Send payment confirmation email
      if (request && request.recipient_email) {
        try {
          await transporter.sendMail({
            from: `"LetterPro" <${process.env.FROM_EMAIL || 'officialletterpro.com@gmail.com'}>`,
            to: request.recipient_email,
            subject: `Payment Confirmed - Letter #${req.params.id}`,
            html: `
              <div style="font-family: 'Segoe UI', Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 40px 20px; background: #ffffff;">
                <!-- Header -->
                <div style="text-align: center; margin-bottom: 40px; padding-bottom: 20px; border-bottom: 2px solid #e7e5e4;">
                  <h1 style="color: #2563eb; font-size: 28px; margin: 0;">LetterPro</h1>
                  <p style="color: #78716c; font-size: 14px; margin: 8px 0 0 0;">Professional Letter Writing Service</p>
                </div>

                <!-- Content -->
                <div style="text-align: center; margin-bottom: 30px;">
                  <div style="width: 80px; height: 80px; background: #dcfce7; border-radius: 50%; display: inline-flex; align-items: center; justify-content: center; margin-bottom: 20px;">
                    <span style="color: #16a34a; font-size: 40px;">✓</span>
                  </div>
                  <h2 style="color: #1c1917; font-size: 24px; margin: 0 0 10px 0;">Payment Confirmed!</h2>
                  <p style="color: #44403c; font-size: 16px;">Your payment has been received and your letter is being worked on.</p>
                </div>

                <!-- Order Details -->
                <div style="background: #fafaf9; border: 1px solid #e7e5e4; border-radius: 12px; padding: 24px; margin: 30px 0;">
                  <h3 style="color: #1c1917; font-size: 16px; margin: 0 0 16px 0; text-transform: uppercase; letter-spacing: 0.05em;">Order Details</h3>
                  <table style="width: 100%; border-collapse: collapse;">
                    <tr>
                      <td style="padding: 8px 0; color: #78716c; font-size: 14px;">Order ID</td>
                      <td style="padding: 8px 0; color: #1c1917; font-size: 14px; text-align: right; font-weight: 500;">#${request.id}</td>
                    </tr>
                    <tr>
                      <td style="padding: 8px 0; color: #78716c; font-size: 14px;">Letter Type</td>
                      <td style="padding: 8px 0; color: #1c1917; font-size: 14px; text-align: right; font-weight: 500;">${request.letter_type || 'Picture Upload'}</td>
                    </tr>
                    <tr>
                      <td style="padding: 8px 0; color: #78716c; font-size: 14px;">Priority</td>
                      <td style="padding: 8px 0; color: #1c1917; font-size: 14px; text-align: right; font-weight: 500; text-transform: capitalize;">${request.priority}</td>
                    </tr>
                    <tr style="border-top: 1px solid #e7e5e4;">
                      <td style="padding: 12px 0 0 0; color: #78716c; font-size: 14px;">Amount Paid</td>
                      <td style="padding: 12px 0 0 0; color: #16a34a; font-size: 18px; text-align: right; font-weight: 600;">₦${(request.price || 0).toLocaleString()}</td>
                    </tr>
                  </table>
                </div>

                <!-- Status -->
                <div style="background: #eff6ff; border: 1px solid #bfdbfe; border-radius: 12px; padding: 20px; margin: 30px 0; text-align: center;">
                  <p style="color: #1d4ed8; font-size: 14px; margin: 0;">
                    <strong>Current Status:</strong> Your letter is now being written and will be sent to your email soon.
                  </p>
                </div>

                <!-- Footer -->
                <div style="margin-top: 40px; padding-top: 20px; border-top: 1px solid #e7e5e4; text-align: center;">
                  <p style="color: #78716c; font-size: 14px; margin: 0 0 8px 0;">
                    Thank you for choosing LetterPro
                  </p>
                  <p style="color: #a8a29e; font-size: 12px; margin: 0;">
                    Questions? Contact us anytime.
                  </p>
                </div>
              </div>
            `
          });
        } catch (emailErr) {
          console.log('Payment confirmation email failed:', emailErr.message);
        }
      }

      res.json({ success: true });
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: 'Failed to mark as paid' });
    }
  });

  // Approve payment (from submitted receipt)
  app.post('/api/admin/requests/:id/approve-payment', requireAdmin, csrfProtection, async (req, res) => {
    try {
      const request = get('SELECT * FROM requests WHERE id = ?', [req.params.id]);
      if (!request) return res.status(404).json({ error: 'Request not found' });

      // Update status to paid
      run('UPDATE requests SET status = ?, updated_at = datetime(\'now\') WHERE id = ?', ['paid', req.params.id]);

      // Send confirmation email
      if (request.recipient_email) {
        try {
          await transporter.sendMail({
            from: `"LetterPro" <${process.env.FROM_EMAIL || 'officialletterpro.com@gmail.com'}>`,
            to: request.recipient_email,
            subject: `Payment Confirmed - Order #${req.params.id}`,
            html: `
              <div style="font-family: 'Segoe UI', Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 40px 20px; background: #ffffff;">
                <div style="text-align: center; margin-bottom: 40px; padding-bottom: 20px; border-bottom: 2px solid #e7e5e4;">
                  <h1 style="color: #2563eb; font-size: 28px; margin: 0;">LetterPro</h1>
                  <p style="color: #78716c; font-size: 14px; margin: 8px 0 0 0;">Professional Letter Writing Service</p>
                </div>
                <div style="text-align: center; margin-bottom: 30px;">
                  <div style="width: 80px; height: 80px; background: #dcfce7; border-radius: 50%; display: inline-flex; align-items: center; justify-content: center; margin-bottom: 20px;">
                    <span style="color: #16a34a; font-size: 40px;">✓</span>
                  </div>
                  <h2 style="color: #1c1917; font-size: 24px; margin: 0 0 10px 0;">Payment Confirmed!</h2>
                  <p style="color: #44403c; font-size: 16px;">Your payment has been verified and your letter is being worked on.</p>
                </div>
                <div style="background: #fafaf9; border: 1px solid #e7e5e4; border-radius: 12px; padding: 24px; margin: 30px 0; text-align: center;">
                  <p style="color: #16a34a; font-size: 18px; font-weight: 600; margin: 0;">Order #${request.id}</p>
                  <p style="color: #78716c; font-size: 14px; margin: 8px 0 0 0;">Your letter will be ready soon!</p>
                </div>
                <div style="margin-top: 40px; padding-top: 20px; border-top: 1px solid #e7e5e4; text-align: center;">
                  <p style="color: #78716c; font-size: 14px; margin: 0 0 8px 0;">Thank you for choosing LetterPro</p>
                </div>
              </div>
            `
          });
        } catch (emailErr) {
          console.log('Confirmation email failed:', emailErr.message);
        }
      }

      res.json({ success: true });
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: 'Failed to approve payment' });
    }
  });

  app.post('/api/admin/requests/:id/send', requireAdmin, csrfProtection, async (req, res) => {
    try {
      const request = get('SELECT * FROM requests WHERE id = ?', [req.params.id]);
      if (!request) return res.status(404).json({ error: 'Request not found' });

      const fromEmail = process.env.FROM_EMAIL || 'noreply@letterservice.com';

      // Send email
      let emailSent = false;
      try {
        await transporter.sendMail({
          from: `"LetterPro" <${fromEmail}>`,
          to: request.recipient_email,
          subject: `Your ${request.letter_type || 'Letter'} - ${request.subject || 'Request'}`.substring(0, 100),
          html: `
            <div style="font-family: 'Segoe UI', Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 40px 20px; background: #ffffff;">
              <!-- Header -->
              <div style="text-align: center; margin-bottom: 40px; padding-bottom: 20px; border-bottom: 2px solid #e7e5e4;">
                <h1 style="color: #2563eb; font-size: 28px; margin: 0;">LetterPro</h1>
                <p style="color: #78716c; font-size: 14px; margin: 8px 0 0 0;">Professional Letter Writing Service</p>
              </div>

              <!-- Greeting -->
              <h2 style="color: #1c1917; font-size: 22px; margin: 0 0 20px 0;">Your Letter is Ready</h2>
              <p style="color: #44403c; font-size: 16px; line-height: 1.6; margin: 0 0 20px 0;">
                Hello,
              </p>
              <p style="color: #44403c; font-size: 16px; line-height: 1.6; margin: 0 0 30px 0;">
                Your requested letter has been written and is ready below. Please review it below.
              </p>

              <!-- Letter Content -->
              <div style="background: #fafaf9; border: 1px solid #e7e5e4; border-radius: 12px; padding: 30px; margin: 30px 0; white-space: pre-wrap; line-height: 1.8; font-size: 15px; color: #1c1917;">
${request.letter_content || 'No content'}
              </div>

              <!-- Note -->
              <div style="background: #fefce8; border: 1px solid #fef08a; border-radius: 8px; padding: 16px; margin: 30px 0;">
                <p style="color: #854d0e; font-size: 14px; margin: 0;">
                  <strong>Note:</strong> If this email ends up in your Spam/Junk folder, please mark it as "Not Spam" to ensure future emails reach your inbox.
                </p>
              </div>

              <!-- Footer -->
              <div style="margin-top: 40px; padding-top: 20px; border-top: 1px solid #e7e5e4; text-align: center;">
                <p style="color: #78716c; font-size: 14px; margin: 0 0 8px 0;">
                  Thank you for choosing LetterPro
                </p>
                <p style="color: #a8a29e; font-size: 12px; margin: 0;">
                  This email was sent by LetterPro Professional Letter Writing Service<br>
                  If you have questions, please contact us.
                </p>
              </div>
            </div>
          `
        });
        emailSent = true;
      } catch (emailErr) {
        console.log('Email send failed (SMTP not configured):', emailErr.message);
      }

      // Update status to completed
      run('UPDATE requests SET status = ?, updated_at = datetime(\'now\') WHERE id = ?', ['completed', req.params.id]);

      res.json({ success: true, emailSent });
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: 'Failed to send letter' });
    }
  });

  app.get('/api/admin/stats', requireAdmin, (req, res) => {
    try {
      const total = get('SELECT COUNT(*) as count FROM requests')?.count || 0;
      const pending = get("SELECT COUNT(*) as count FROM requests WHERE status = 'pending'")?.count || 0;
      const paid = get("SELECT COUNT(*) as count FROM requests WHERE status = 'paid'")?.count || 0;
      const inProgress = get("SELECT COUNT(*) as count FROM requests WHERE status = 'in_progress'")?.count || 0;
      const completed = get("SELECT COUNT(*) as count FROM requests WHERE status = 'completed'")?.count || 0;

      const revenueResult = get("SELECT COALESCE(SUM(price), 0) as total FROM requests WHERE status IN ('paid', 'in_progress', 'completed')");

      res.json({ stats: { total, pending, paid, in_progress: inProgress, completed, revenue: revenueResult?.total || 0 } });
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: 'Failed to fetch stats' });
    }
  });

  // Serve uploaded files
  app.get('/uploads/:filename', (req, res) => {
    const filePath = path.join(__dirname, 'uploads', req.params.filename);
    if (fs.existsSync(filePath)) {
      res.sendFile(filePath);
    } else {
      res.status(404).send('File not found');
    }
  });

  // Start server
  app.listen(PORT, () => {
    console.log(`Letter Writing Service running at http://localhost:${PORT}`);
    console.log('Admin login: admin@letterservice.com / admin123');
  });
}

startServer().catch(err => {
  console.error('Failed to start server:', err);
  process.exit(1);
});
