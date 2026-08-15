require('dotenv').config();

const express = require('express');
const pool = require('./db');
const cors = require('cors');
const path = require('path');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');

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
    await pool.query(`
      CREATE TABLE IF NOT EXISTS users (
        id SERIAL PRIMARY KEY,
        username VARCHAR(255) NOT NULL UNIQUE,
        email VARCHAR(255) NOT NULL UNIQUE,
        password VARCHAR(255) NOT NULL,
        role VARCHAR(50) NOT NULL DEFAULT 'user',
        "isActive" INTEGER NOT NULL DEFAULT 1,
        "createdAt" TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        "updatedAt" TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);
    
    const adminUserRes = await pool.query(`SELECT * FROM users WHERE email = 'admin@system.com'`);
    if (adminUserRes.rows.length === 0) {
      const adminPassword = process.env.ADMIN_PASSWORD || 'AdminSecure!2026';
      const hashedPassword = await bcrypt.hash(adminPassword, 10);
      await pool.query(`
        INSERT INTO users (username, email, password, role, "isActive", "createdAt", "updatedAt")
        VALUES ($1, $2, $3, 'admin', 1, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
      `, ['admin', 'admin@system.com', hashedPassword]);
      console.log('Default admin created: admin@system.com / ' + adminPassword);
    }
    
    isDbInitialized = true;
    console.log('PostgreSQL database initialized successfully.');
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
    
    const passwordRegex = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])[A-Za-z\d@$!%*?&]{8,}$/;
    if (!passwordRegex.test(password)) {
      return res.status(400).json({ success: false, message: 'Password must be at least 8 characters long and include an uppercase letter, a lowercase letter, a number, and a special character.' });
    }

    const existingUserRes = await pool.query(`SELECT * FROM users WHERE email = $1 OR username = $2`, [email, username]);
    if (existingUserRes.rows.length > 0) {
      return res.status(409).json({ success: false, message: 'Email or username already exists' });
    }

    const hashedPassword = await bcrypt.hash(password, 10);

    await pool.query(`
      INSERT INTO users (username, email, password, role, "isActive", "createdAt", "updatedAt")
      VALUES ($1, $2, $3, 'user', 1, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
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

    const userRes = await pool.query(`SELECT * FROM users WHERE email = $1`, [email]);
    const user = userRes.rows[0];
    
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
    const { email, password, token } = req.body;
    
    if (!email || !password) {
      return res.status(400).json({ success: false, message: 'Email and password are required' });
    }
    
    const requiredToken = process.env.ADMIN_2FA_TOKEN;
    if (requiredToken && token !== requiredToken) {
      return res.status(401).json({ success: false, message: 'Invalid 2FA token' });
    }

    const userRes = await pool.query(`SELECT * FROM users WHERE email = $1`, [email]);
    const user = userRes.rows[0];
    
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

    const jwtToken = jwt.sign(
      { id: user.id, username: user.username, email: user.email, role: user.role },
      JWT_SECRET,
      { expiresIn: '1d' }
    );

    res.status(200).json({
      success: true,
      message: 'Admin login successful',
      token: jwtToken,
      user: { username: user.username, email: user.email, role: user.role }
    });
  } catch (error) {
    console.error('Admin login error:', error);
    res.status(500).json({ success: false, message: 'Unexpected server error' });
  }
});

app.get('/api/me', authMiddleware, async (req, res) => {
  try {
    const userRes = await pool.query(`SELECT id, username, email, role, "isActive", "createdAt" FROM users WHERE id = $1`, [req.user.id]);
    const user = userRes.rows[0];
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
    const rowRes = await pool.query(`SELECT COUNT(*) AS count FROM users WHERE role = 'user'`);
    const count = rowRes.rows[0].count;
    res.status(200).json({ success: true, count });
  } catch (error) {
    console.error('Error fetching user count:', error);
    res.status(500).json({ success: false, message: 'Unexpected server error' });
  }
});

app.get('/api/admin/users', authMiddleware, adminMiddleware, async (req, res) => {
  try {
    const { search } = req.query;
    let users = [];

    if (search) {
      const usersRes = await pool.query(`
        SELECT id, username, email, role, "isActive", "createdAt", "updatedAt"
        FROM users
        WHERE role = 'user'
          AND (username ILIKE $1 OR email ILIKE $2)
        ORDER BY "createdAt" DESC
      `, ['%' + search + '%', '%' + search + '%']);
      users = usersRes.rows;
    } else {
      const usersRes = await pool.query(`
        SELECT id, username, email, role, "isActive", "createdAt", "updatedAt"
        FROM users
        WHERE role = 'user'
        ORDER BY "createdAt" DESC
      `);
      users = usersRes.rows;
    }

    res.status(200).json(users);
  } catch (error) {
    console.error('Error fetching users:', error);
    res.status(500).json({ success: false, message: 'Unexpected server error' });
  }
});

app.put('/api/admin/users/:id/status', authMiddleware, adminMiddleware, async (req, res) => {
  try {
    const userRes = await pool.query(`SELECT * FROM users WHERE id = $1`, [req.params.id]);
    const user = userRes.rows[0];
    
    if (!user) return res.status(404).json({ success: false, message: 'User not found' });
    
    if (user.role === 'admin') return res.status(403).json({ success: false, message: 'Cannot deactivate an admin' });

    // SQLite: CASE isActive WHEN 1 THEN 0 ELSE 1 END
    // Postgres doesn't easily let you toggle int like that dynamically in a simple query, 
    // we can do it in JS since we have the user object.
    const newIsActive = user.isActive === 1 ? 0 : 1;

    await pool.query(`
      UPDATE users
      SET "isActive" = $1,
          "updatedAt" = CURRENT_TIMESTAMP
      WHERE id = $2
    `, [newIsActive, req.params.id]);
    
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
  }).catch(e => {
    console.error("Failed to start server locally", e);
  });
}

// Export the app for Vercel Serverless Functions
module.exports = app;
