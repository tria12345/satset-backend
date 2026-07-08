const express = require('express');
const cors = require('cors');
const db = require('./db');

const app = express();
app.use(cors());
app.use(express.json());

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
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
