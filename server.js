const express = require('express');
const cors = require('cors');
const path = require('path');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { OAuth2Client } = require('google-auth-library');
const db = require('./db');

const app = express();
const googleClient = new OAuth2Client(process.env.GOOGLE_CLIENT_ID);
app.use(cors());
app.use(express.json());

app.get('/api/debug-db', async (req, res) => {
  let initError = null;
  try {
    await db.query(`
      CREATE TABLE IF NOT EXISTS users (
        id int(11) NOT NULL AUTO_INCREMENT,
        name varchar(255) NOT NULL,
        email varchar(255) NOT NULL UNIQUE,
        password varchar(255) DEFAULT NULL,
        created_at timestamp NOT NULL DEFAULT current_timestamp(),
        PRIMARY KEY (id)
      )
    `);
  } catch (err) {
    initError = err.message;
  }
  res.json({
    dbHost: process.env.DB_HOST,
    dbPort: process.env.DB_PORT,
    dbUser: process.env.DB_USER,
    hasPassword: !!process.env.DB_PASSWORD,
    dbName: process.env.DB_NAME,
    googleClient: !!process.env.GOOGLE_CLIENT_ID,
    initError
  });
});

const JWT_SECRET = process.env.JWT_SECRET || 'rahasia_satset_super_aman';

// Serve static frontend files
app.use(express.static(path.join(__dirname, '../frontend/dist')));

// Initialize DB tables automatically
const initDb = async () => {
  try {
    await db.query(`
      CREATE TABLE IF NOT EXISTS users (
        id int(11) NOT NULL AUTO_INCREMENT,
        name varchar(255) NOT NULL,
        email varchar(255) NOT NULL UNIQUE,
        password varchar(255) DEFAULT NULL,
        created_at timestamp NOT NULL DEFAULT current_timestamp(),
        PRIMARY KEY (id)
      )
    `);
    
    // Attempt to alter table if it was already created with NOT NULL
    try {
      await db.query('ALTER TABLE users MODIFY password varchar(255) DEFAULT NULL;');
    } catch (e) {
      // Ignore if table doesn't exist yet or column already correct
    }

    await db.query(`
      CREATE TABLE IF NOT EXISTS orders (
        id int(11) NOT NULL AUTO_INCREMENT,
        user_id int(11) NOT NULL,
        distance decimal(10,2) NOT NULL,
        price_charged decimal(10,2) NOT NULL,
        expenses decimal(10,2) NOT NULL DEFAULT 0.00,
        net_profit decimal(10,2) NOT NULL,
        notes text DEFAULT NULL,
        created_at timestamp NOT NULL DEFAULT current_timestamp(),
        PRIMARY KEY (id),
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
      )
    `);
    
    await db.query(`
      CREATE TABLE IF NOT EXISTS settings (
        user_id int(11) NOT NULL,
        base_price decimal(10,2) NOT NULL,
        price_per_km decimal(10,2) NOT NULL,
        min_price decimal(10,2) NOT NULL,
        daily_expense decimal(10,2) NOT NULL DEFAULT 0.00,
        daily_target decimal(10,2) NOT NULL DEFAULT 100000.00,
        PRIMARY KEY (user_id),
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
      )
    `);

    console.log('Database tables initialized successfully');
  } catch (err) {
    console.error('Failed to initialize database:', err.message);
  }
};

let dbInitialized = false;
app.use(async (req, res, next) => {
  if (!dbInitialized) {
    await initDb();
    dbInitialized = true;
  }
  next();
});

// --- Auth Routes ---
app.post('/api/register', async (req, res) => {
  const { name, email, password } = req.body;
  if (!name || !email || !password) return res.status(400).json({ message: 'Lengkapi semua data' });

  try {
    const [existing] = await db.query('SELECT * FROM users WHERE email = ?', [email]);
    if (existing.length > 0) return res.status(400).json({ message: 'Email sudah terdaftar' });

    const hashedPassword = await bcrypt.hash(password, 10);
    const [result] = await db.query('INSERT INTO users (name, email, password) VALUES (?, ?, ?)', [name, email, hashedPassword]);
    const userId = result.insertId;

    // Create default settings for new user
    await db.query('INSERT INTO settings (user_id, base_price, price_per_km, min_price, daily_expense, daily_target) VALUES (?, 5000.00, 2000.00, 10000.00, 20000.00, 100000.00)', [userId]);

    const token = jwt.sign({ id: userId }, JWT_SECRET, { expiresIn: '30d' });
    res.status(201).json({ token, message: 'Registrasi berhasil' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/login', async (req, res) => {
  const { email, password } = req.body;
  if (!email || !password) return res.status(400).json({ message: 'Lengkapi email dan password' });

  try {
    const [users] = await db.query('SELECT * FROM users WHERE email = ?', [email]);
    if (users.length === 0) return res.status(400).json({ message: 'Email tidak ditemukan' });

    const user = users[0];
    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) return res.status(400).json({ message: 'Password salah' });

    const token = jwt.sign({ id: user.id }, JWT_SECRET, { expiresIn: '30d' });
    res.json({ token, message: 'Login berhasil' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/google-login', async (req, res) => {
  const { credential } = req.body;
  if (!credential) return res.status(400).json({ message: 'Token Google tidak ada' });

  try {
    const ticket = await googleClient.verifyIdToken({
      idToken: credential,
      audience: process.env.GOOGLE_CLIENT_ID,
    });
    const payload = ticket.getPayload();
    const { email, name } = payload;

    // Check if user exists
    let [users] = await db.query('SELECT * FROM users WHERE email = ?', [email]);
    let userId;

    if (users.length === 0) {
      // Register new user via Google
      const [result] = await db.query('INSERT INTO users (name, email) VALUES (?, ?)', [name, email]);
      userId = result.insertId;
      await db.query('INSERT INTO settings (user_id, base_price, price_per_km, min_price, daily_expense, daily_target) VALUES (?, 5000.00, 2000.00, 10000.00, 20000.00, 100000.00)', [userId]);
    } else {
      userId = users[0].id;
    }

    const token = jwt.sign({ id: userId }, JWT_SECRET, { expiresIn: '30d' });
    res.json({ token, message: 'Login Google berhasil' });
  } catch (err) {
    console.error('Google login error:', err);
    res.status(500).json({ message: `Google login error: ${err.message}` });
  }
});

// Middleware Auth
const authenticateToken = (req, res, next) => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];
  if (!token) return res.status(401).json({ message: 'Akses ditolak. Token tidak ada' });

  jwt.verify(token, JWT_SECRET, (err, user) => {
    if (err) return res.status(403).json({ message: 'Token tidak valid' });
    req.user = user;
    next();
  });
};

// --- Protected Routes ---

// Get settings
app.get('/api/settings', authenticateToken, async (req, res) => {
  try {
    const [rows] = await db.query('SELECT * FROM settings WHERE user_id = ?', [req.user.id]);
    if (rows.length > 0) {
      res.json(rows[0]);
    } else {
      res.status(404).json({ message: 'Settings not found' });
    }
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Update settings
app.put('/api/settings', authenticateToken, async (req, res) => {
  const { base_price, price_per_km, min_price, daily_expense, daily_target } = req.body;
  try {
    await db.query(
      'UPDATE settings SET base_price = ?, price_per_km = ?, min_price = ?, daily_expense = ?, daily_target = ? WHERE user_id = ?',
      [base_price, price_per_km, min_price, daily_expense, daily_target, req.user.id]
    );
    res.json({ message: 'Settings updated successfully' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Get all orders
app.get('/api/orders', authenticateToken, async (req, res) => {
  try {
    const [orders] = await db.query('SELECT * FROM orders WHERE user_id = ? ORDER BY created_at DESC', [req.user.id]);
    res.json({ orders });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Create new order
app.post('/api/orders', authenticateToken, async (req, res) => {
  const { distance, price_charged, expenses, net_profit, notes } = req.body;
  try {
    const [result] = await db.query(
      'INSERT INTO orders (user_id, distance, price_charged, expenses, net_profit, notes) VALUES (?, ?, ?, ?, ?, ?)',
      [req.user.id, distance, price_charged, expenses, net_profit, notes]
    );
    res.status(201).json({ id: result.insertId, message: 'Order created successfully' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Delete specific order
app.delete('/api/orders/:id', authenticateToken, async (req, res) => {
  try {
    const [result] = await db.query('DELETE FROM orders WHERE id = ? AND user_id = ?', [req.params.id, req.user.id]);
    if (result.affectedRows === 0) return res.status(404).json({ message: 'Order not found' });
    res.json({ message: 'Order deleted successfully' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Delete all orders
app.delete('/api/orders', authenticateToken, async (req, res) => {
  try {
    await db.query('DELETE FROM orders WHERE user_id = ?', [req.user.id]);
    res.json({ message: 'All orders deleted successfully' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

const PORT = process.env.PORT || 5000;
if (process.env.NODE_ENV !== 'production') {
  app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
  });
}

module.exports = app;
