const express = require('express');
const cors = require('cors');
const path = require('path');
const db = require('./db');

const app = express();
app.use(cors());
app.use(express.json());

// Serve static frontend files
app.use(express.static(path.join(__dirname, '../frontend/dist')));

// Initialize DB tables automatically
const initDb = async () => {
  try {
    await db.query(`
      CREATE TABLE IF NOT EXISTS orders (
        id int(11) NOT NULL AUTO_INCREMENT,
        distance decimal(10,2) NOT NULL,
        price_charged decimal(10,2) NOT NULL,
        expenses decimal(10,2) NOT NULL DEFAULT 0.00,
        net_profit decimal(10,2) NOT NULL,
        notes text DEFAULT NULL,
        created_at timestamp NOT NULL DEFAULT current_timestamp(),
        PRIMARY KEY (id)
      )
    `);
    
    await db.query(`
      CREATE TABLE IF NOT EXISTS settings (
        id int(11) NOT NULL,
        base_price decimal(10,2) NOT NULL,
        price_per_km decimal(10,2) NOT NULL,
        min_price decimal(10,2) NOT NULL,
        daily_expense decimal(10,2) NOT NULL DEFAULT 0.00,
        daily_target decimal(10,2) NOT NULL DEFAULT 100000.00,
        PRIMARY KEY (id)
      )
    `);

    // Insert default settings if empty
    const [rows] = await db.query('SELECT * FROM settings WHERE id = 1');
    if (rows.length === 0) {
      await db.query('INSERT INTO settings (id, base_price, price_per_km, min_price, daily_expense, daily_target) VALUES (1, 5000.00, 2000.00, 10000.00, 20000.00, 100000.00)');
    }
    console.log('Database tables initialized successfully');
  } catch (err) {
    console.error('Failed to initialize database:', err.message);
  }
};
initDb();

// Get settings
app.get('/api/settings', async (req, res) => {
  try {
    const [rows] = await db.query('SELECT * FROM settings WHERE id = 1');
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
app.put('/api/settings', async (req, res) => {
  const { base_price, price_per_km, min_price, daily_expense, daily_target } = req.body;
  try {
    await db.query(
      'UPDATE settings SET base_price = ?, price_per_km = ?, min_price = ?, daily_expense = ?, daily_target = ? WHERE id = 1',
      [base_price, price_per_km, min_price, daily_expense, daily_target]
    );
    res.json({ message: 'Settings updated successfully' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Get all orders
app.get('/api/orders', async (req, res) => {
  try {
    const [orders] = await db.query('SELECT * FROM orders ORDER BY created_at DESC');
    res.json({ orders });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Create new order
app.post('/api/orders', async (req, res) => {
  const { distance, price_charged, expenses, net_profit, notes } = req.body;
  try {
    const [result] = await db.query(
      'INSERT INTO orders (distance, price_charged, expenses, net_profit, notes) VALUES (?, ?, ?, ?, ?)',
      [distance, price_charged, expenses, net_profit, notes]
    );
    res.status(201).json({ id: result.insertId, message: 'Order created successfully' });
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
