const express = require('express');
const dbPromise = require('./db');
const cors = require('cors');
const path = require('path');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');

require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3000;
const JWT_SECRET = process.env.JWT_SECRET || 'my_super_secure_jwt_secret_2026';

if (!process.env.JWT_SECRET) {
  console.warn('WARNING: JWT_SECRET not set in .env — using an insecure default. Set it before deploying.');
}

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
// Serve static files from the current directory
app.use(express.static(__dirname));

// --- Database Initialization Middleware (Crucial for Vercel) ---
let isDbInitialized = false;

const initDb = async () => {
  if (isDbInitialized) return;
  try {
    const db = await dbPromise;
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
    
    const adminUser = await db.get(`SELECT * FROM users WHERE email = 'admin@system.com'`);
    if (!adminUser) {
      const hashedPassword = await bcrypt.hash('admin123', 10);
      await db.run(`
        INSERT INTO users (username, email, password, role, isActive, createdAt, updatedAt)
        VALUES (?, ?, ?, 'admin', 1, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
      `, ['admin', 'admin@system.com', hashedPassword]);
      console.log('Default admin created: admin@system.com / admin123');
    }
    
    isDbInitialized = true;
    console.log('SQLite database initialized successfully.');
  } catch (err) {
    console.error('Database connection/initialization error:', err);
    throw err;
  }
};

const initPromise = initDb();

app.use(async (req, res, next) => {
  try {
    if (!isDbInitialized) {
      await initPromise;
    }
    next();
  } catch (error) {
    res.status(500).json({ success: false, message: 'Server database initialization failed' });
  }
});

// --- Auth Middlewares ---
const authMiddleware = (req, res, next) => {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ success: false, message: 'No token provided' });
  }
  const token = authHeader.split(' ')[1];
  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    req.user = decoded;
    next();
  } catch (error) {
    return res.status(401).json({ success: false, message: 'Invalid or expired token' });
  }
};

const adminMiddleware = (req, res, next) => {
  if (req.user && req.user.role === 'admin') {
    next();
  } else {
    return res.status(403).json({ success: false, message: 'Admin access required' });
  }
};

// --- API Routes ---

app.get('/api/health', (req, res) => {
  res.status(200).json({ success: true, message: 'Server is running' });
});

app.post('/api/register', async (req, res) => {
  try {
    const { username, email, password } = req.body;
    
    if (!username || !email || !password) {
      return res.status(400).json({ success: false, message: 'Username, email, and password are required' });
    }
    
    if (password.length < 6) {
      return res.status(400).json({ success: false, message: 'Password must be at least 6 characters long' });
    }

    const db = await dbPromise;
    const existingUser = await db.get(`SELECT * FROM users WHERE email = ? OR username = ?`, [email, username]);
    if (existingUser) {
      return res.status(409).json({ success: false, message: 'Email or username already exists' });
    }

    const hashedPassword = await bcrypt.hash(password, 10);

    await db.run(`
      INSERT INTO users (username, email, password, role, isActive, createdAt, updatedAt)
      VALUES (?, ?, ?, 'user', 1, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
    `, [username, email, hashedPassword]);

    res.status(201).json({ success: true, message: 'User registered successfully' });
  } catch (error) {
    console.error('Registration error:', error);
    res.status(500).json({ success: false, message: 'Unexpected server error' });
  }
});

app.post('/api/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    
    if (!email || !password) {
      return res.status(400).json({ success: false, message: 'Email and password are required' });
    }

    const db = await dbPromise;
    const user = await db.get(`SELECT * FROM users WHERE email = ?`, [email]);
    
    if (!user) {
      return res.status(401).json({ success: false, message: 'Invalid email or password' });
    }

    if (user.role !== 'user') {
      return res.status(403).json({ success: false, message: 'Access denied. User role required.' });
    }

    if (!user.isActive) {
      return res.status(403).json({ success: false, message: 'Your account has been deactivated. Contact admin.' });
    }

    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) {
      return res.status(401).json({ success: false, message: 'Invalid email or password' });
    }

    const token = jwt.sign(
      { id: user.id, username: user.username, email: user.email, role: user.role },
      JWT_SECRET,
      { expiresIn: '1d' }
    );

    res.status(200).json({
      success: true,
      message: 'Login successful',
      token,
      user: { id: user.id, username: user.username, email: user.email, role: user.role }
    });
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({ success: false, message: 'Unexpected server error' });
  }
});

app.post('/api/admin/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    
    if (!email || !password) {
      return res.status(400).json({ success: false, message: 'Email and password are required' });
    }

    const db = await dbPromise;
    const user = await db.get(`SELECT * FROM users WHERE email = ?`, [email]);
    
    if (!user) {
      return res.status(401).json({ success: false, message: 'Invalid Admin credentials' });
    }

    if (user.role !== 'admin') {
      return res.status(403).json({ success: false, message: 'Access denied. Admin role required.' });
    }

    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) {
      return res.status(401).json({ success: false, message: 'Invalid Admin credentials' });
    }

    const token = jwt.sign(
      { id: user.id, username: user.username, email: user.email, role: user.role },
      JWT_SECRET,
      { expiresIn: '1d' }
    );

    res.status(200).json({
      success: true,
      message: 'Admin login successful',
      token,
      user: { username: user.username, email: user.email, role: user.role }
    });
  } catch (error) {
    console.error('Admin login error:', error);
    res.status(500).json({ success: false, message: 'Unexpected server error' });
  }
});

app.get('/api/me', authMiddleware, async (req, res) => {
  try {
    const db = await dbPromise;
    const user = await db.get(`SELECT id, username, email, role, isActive, createdAt FROM users WHERE id = ?`, [req.user.id]);
    if (!user) {
      return res.status(404).json({ success: false, message: 'User not found' });
    }
    res.status(200).json({ success: true, user });
  } catch (error) {
    console.error('Get me error:', error);
    res.status(500).json({ success: false, message: 'Unexpected server error' });
  }
});

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
    console.error('User activity error:', error);
    res.status(500).json({ success: false, message: 'Unexpected server error' });
  }
});

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
    console.error('Admin traffic error:', error);
    res.status(500).json({ success: false, message: 'Unexpected server error' });
  }
});

app.get('/api/users/count', authMiddleware, adminMiddleware, async (req, res) => {
  try {
    const db = await dbPromise;
    const row = await db.get(`SELECT COUNT(*) AS count FROM users WHERE role = 'user'`);
    res.status(200).json({ success: true, count: row.count });
  } catch (error) {
    console.error('Error fetching user count:', error);
    res.status(500).json({ success: false, message: 'Unexpected server error' });
  }
});

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
    res.status(500).json({ success: false, message: 'Unexpected server error' });
  }
});

app.put('/api/admin/users/:id/status', authMiddleware, adminMiddleware, async (req, res) => {
  try {
    const db = await dbPromise;
    const user = await db.get(`SELECT * FROM users WHERE id = ?`, [req.params.id]);
    if (!user) return res.status(404).json({ success: false, message: 'User not found' });
    
    if (user.role === 'admin') return res.status(403).json({ success: false, message: 'Cannot deactivate an admin' });

    await db.run(`
      UPDATE users
      SET isActive = CASE isActive WHEN 1 THEN 0 ELSE 1 END,
          updatedAt = CURRENT_TIMESTAMP
      WHERE id = ?
    `, [req.params.id]);
    
    res.status(200).json({ success: true, message: `User ${!user.isActive ? 'activated' : 'deactivated'} successfully` });
  } catch (error) {
    console.error('Error updating user status:', error);
    res.status(500).json({ success: false, message: 'Unexpected server error' });
  }
});

// Global Error Handler
app.use((err, req, res, next) => {
  console.error("GLOBAL ERROR HANDLER:", err);
  res.status(500).json({ success: false, message: 'Unexpected server error' });
});

if (process.env.NODE_ENV !== 'production' && !process.env.VERCEL) {
  // If running locally as a standalone script, start the server once initialized.
  initPromise.then(() => {
    app.listen(PORT, () => {
      console.log(`Server running at http://localhost:${PORT}`);
    });
  });
}

// Export the app for Vercel Serverless Functions
module.exports = app;
