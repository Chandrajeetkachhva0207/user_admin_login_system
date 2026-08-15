const express = require('express');
const dbPromise = require('./db');
const cors = require('cors');
const path = require('path');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');

require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3000;
const JWT_SECRET = process.env.JWT_SECRET || 'dev_only_change_this_secret';
if (!process.env.JWT_SECRET) {
  console.warn('WARNING: JWT_SECRET not set in .env — using an insecure default. Set it before deploying.');
}

// Middleware
app.use(cors());
app.use(express.json());
// Serve static files from the current directory
app.use(express.static(__dirname));

// Database connection & initialization
const dbInitPromise = async () => {
  try {
    const db = await dbPromise;
    // Create users table if it doesn't exist
    await db.exec(`
      CREATE TABLE IF NOT EXISTS users (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        username TEXT NOT NULL UNIQUE,
        email TEXT NOT NULL UNIQUE,
        password TEXT NOT NULL,
        role TEXT NOT NULL DEFAULT 'user',
        isActive INTEGER NOT NULL DEFAULT 1,
        createdAt DATETIME DEFAULT CURRENT_TIMESTAMP,
        updatedAt DATETIME DEFAULT CURRENT_TIMESTAMP
      );
    `);

    // Create default admin if not exists
    const adminUser = await db.get(`SELECT * FROM users WHERE email = 'admin@system.com'`);
    if (!adminUser) {
      const hashedPassword = await bcrypt.hash('admin123', 10);
      await db.run(`
        INSERT INTO users (username, email, password, role, isActive, createdAt, updatedAt)
        VALUES (?, ?, ?, 'admin', 1, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
      `, ['admin', 'admin@system.com', hashedPassword]);
      console.log('Default admin user created: admin@system.com / admin123');
    }

    console.log('Connected to SQLite database and synced models');
  } catch (err) {
    console.error('Database connection error:', err);
    throw err;
  }
};

const initPromise = dbInitPromise();

// Middleware to ensure DB is initialized before handling any requests
app.use(async (req, res, next) => {
  try {
    await initPromise;
    next();
  } catch (err) {
    res.status(500).json({ message: 'Server database initialization failed' });
  }
});

// --- Auth Middlewares ---
const authMiddleware = (req, res, next) => {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ message: 'No token provided' });
  }
  const token = authHeader.split(' ')[1];
  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    req.user = decoded;
    next();
  } catch (error) {
    return res.status(401).json({ message: 'Invalid or expired token' });
  }
};

const adminMiddleware = (req, res, next) => {
  if (req.user && req.user.role === 'admin') {
    next();
  } else {
    return res.status(403).json({ message: 'Admin access required' });
  }
};

// --- API Routes ---

// Register a new user
app.post('/api/register', async (req, res) => {
  try {
    const { username, email, password } = req.body;
    const db = await dbPromise;

    // Check if user already exists
    const existingUser = await db.get(`SELECT * FROM users WHERE email = ? OR username = ?`, [email, username]);
    if (existingUser) {
      return res.status(400).json({ message: 'Email or Username already exists' });
    }

    // Hash password
    const hashedPassword = await bcrypt.hash(password, 10);

    // Create new user
    await db.run(`
      INSERT INTO users (username, email, password, role, isActive, createdAt, updatedAt)
      VALUES (?, ?, ?, 'user', 1, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
    `, [username, email, hashedPassword]);

    res.status(201).json({ message: 'User registered successfully' });
  } catch (error) {
    console.error('Registration error:', error);
    res.status(500).json({ message: 'Server error during registration' });
  }
});

// Login user
app.post('/api/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    const db = await dbPromise;

    // Find user
    const user = await db.get(`SELECT * FROM users WHERE email = ?`, [email]);
    if (!user) {
      return res.status(401).json({ message: 'Invalid email or password' });
    }

    // Check if user is active
    if (!user.isActive) {
      return res.status(403).json({ message: 'Your account has been deactivated. Contact admin.' });
    }

    // Check password
    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) {
      return res.status(401).json({ message: 'Invalid email or password' });
    }

    // Generate token
    const token = jwt.sign(
      { id: user.id, username: user.username, role: user.role },
      JWT_SECRET,
      { expiresIn: '1d' }
    );

    res.status(200).json({
      message: 'Login successful',
      token,
      user: { id: user.id, username: user.username, email: user.email, role: user.role }
    });
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({ message: 'Server error during login' });
  }
});

// Admin Login
app.post('/api/admin/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    const db = await dbPromise;

    const user = await db.get(`SELECT * FROM users WHERE email = ?`, [email]);
    if (!user || user.role !== 'admin') {
      return res.status(401).json({ message: 'Invalid Admin credentials' });
    }

    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) {
      return res.status(401).json({ message: 'Invalid Admin credentials' });
    }

    const token = jwt.sign(
      { id: user.id, username: user.username, role: user.role },
      JWT_SECRET,
      { expiresIn: '1d' }
    );

    res.status(200).json({
      message: 'Admin login successful',
      token,
      user: { username: user.username, email: user.email, role: user.role }
    });
  } catch (error) {
    console.error('Admin login error:', error);
    res.status(500).json({ message: 'Server error during login' });
  }
});

// Get User Activity Chart Data
app.get('/api/user/activity', authMiddleware, async (req, res) => {
  try {
    const data = {
      labels: ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'],
      datasets: [{
        label: 'Activity Score',
        data: [12, 19, 15, 25, 22, 30, 28]
      }]
    };
    res.status(200).json(data);
  } catch (error) {
    res.status(500).json({ message: 'Server error fetching activity data' });
  }
});

// Get Admin Traffic Chart Data
app.get('/api/admin/traffic', authMiddleware, adminMiddleware, async (req, res) => {
  try {
    const data = {
      labels: ['00:00', '04:00', '08:00', '12:00', '16:00', '20:00'],
      datasets: [{
        label: 'Active Connections',
        data: [150, 80, 420, 560, 310, 220]
      }]
    };
    res.status(200).json(data);
  } catch (error) {
    res.status(500).json({ message: 'Server error fetching traffic data' });
  }
});

// Get user count (for Admin Dashboard)
app.get('/api/users/count', authMiddleware, adminMiddleware, async (req, res) => {
  try {
    const db = await dbPromise;
    const row = await db.get(`SELECT COUNT(*) AS count FROM users WHERE role = 'user'`);
    res.status(200).json({ count: row.count });
  } catch (error) {
    console.error('Error fetching user count:', error);
    res.status(500).json({ message: 'Server error fetching user count' });
  }
});

// Admin: Get all users (with search support)
app.get('/api/admin/users', authMiddleware, adminMiddleware, async (req, res) => {
  try {
    const { search } = req.query;
    const db = await dbPromise;
    let users = [];

    if (search) {
      users = await db.all(`
        SELECT id, username, email, role, isActive, createdAt, updatedAt
        FROM users
        WHERE role = 'user'
          AND (username LIKE ? OR email LIKE ?)
        ORDER BY createdAt DESC
      `, ['%' + search + '%', '%' + search + '%']);
    } else {
      users = await db.all(`
        SELECT id, username, email, role, isActive, createdAt, updatedAt
        FROM users
        WHERE role = 'user'
        ORDER BY createdAt DESC
      `);
    }

    res.status(200).json(users);
  } catch (error) {
    console.error('Error fetching users:', error);
    res.status(500).json({ message: 'Server error fetching users' });
  }
});

// Admin: Toggle User Status
app.put('/api/admin/users/:id/status', authMiddleware, adminMiddleware, async (req, res) => {
  try {
    const db = await dbPromise;
    const user = await db.get(`SELECT * FROM users WHERE id = ?`, [req.params.id]);
    if (!user) return res.status(404).json({ message: 'User not found' });
    
    if (user.role === 'admin') return res.status(400).json({ message: 'Cannot deactivate an admin' });

    await db.run(`
      UPDATE users
      SET isActive = CASE isActive WHEN 1 THEN 0 ELSE 1 END,
          updatedAt = CURRENT_TIMESTAMP
      WHERE id = ?
    `, [req.params.id]);
    
    user.isActive = !user.isActive; // Toggle for response
    res.status(200).json({ message: `User ${user.isActive ? 'activated' : 'deactivated'} successfully`, user });
  } catch (error) {
    console.error('Error updating user status:', error);
    res.status(500).json({ message: 'Server error updating status' });
  }
});

// Start Server
if (process.env.NODE_ENV !== 'production' && !process.env.VERCEL) {
  app.listen(PORT, () => {
    console.log(`Server is running on http://localhost:${PORT}`);
  });
}

// Export the app for Vercel Serverless Functions
module.exports = app;
