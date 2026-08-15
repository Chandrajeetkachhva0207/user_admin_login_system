const express = require('express');
const { Op } = require('sequelize');
const sequelize = require('./db');
const cors = require('cors');
const path = require('path');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcrypt');
const User = require('./models/User');

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

// Database connection (SQLite)
sequelize.sync()
.then(async () => {
  console.log('Connected to SQLite database and synced models');
  // Create default admin if not exists
  const adminExists = await User.findOne({ where: { email: 'admin@system.com' } });
  if (!adminExists) {
    const hashedPassword = await bcrypt.hash('admin123', 10);
    await User.create({
      username: 'admin',
      email: 'admin@system.com',
      password: hashedPassword,
      role: 'admin'
    });
    console.log('Default admin user created: admin@system.com / admin123');
  }
})
.catch(err => console.error('Database connection error:', err));

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

    // Check if user already exists
    const existingUser = await User.findOne({ where: { [Op.or]: [{ email }, { username }] } });
    if (existingUser) {
      return res.status(400).json({ message: 'Email or Username already exists' });
    }

    // Hash password
    const hashedPassword = await bcrypt.hash(password, 10);

    // Create new user
    const newUser = await User.create({ username, email, password: hashedPassword });

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

    // Find user
    const user = await User.findOne({ where: { email } });
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

    const user = await User.findOne({ where: { email } });
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
    // Mocking user activity data for the chart
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
    // Mocking traffic data for the admin chart
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
    const count = await User.count({ where: { role: 'user' } });
    res.status(200).json({ count });
  } catch (error) {
    console.error('Error fetching user count:', error);
    res.status(500).json({ message: 'Server error fetching user count' });
  }
});

// Admin: Get all users (with search support)
app.get('/api/admin/users', authMiddleware, adminMiddleware, async (req, res) => {
  try {
    const { search } = req.query;
    let query = { role: 'user' }; // Only show normal users, not admins

    if (search) {
      query[Op.or] = [
        { username: { [Op.like]: `%${search}%` } },
        { email: { [Op.like]: `%${search}%` } }
      ];
    }

    const users = await User.findAll({ 
      where: query, 
      attributes: { exclude: ['password'] }, 
      order: [['createdAt', 'DESC']] 
    });
    res.status(200).json(users);
  } catch (error) {
    console.error('Error fetching users:', error);
    res.status(500).json({ message: 'Server error fetching users' });
  }
});

// Admin: Toggle User Status
app.put('/api/admin/users/:id/status', authMiddleware, adminMiddleware, async (req, res) => {
  try {
    const user = await User.findByPk(req.params.id);
    if (!user) return res.status(404).json({ message: 'User not found' });
    if (user.role === 'admin') return res.status(400).json({ message: 'Cannot deactivate an admin' });

    user.isActive = !user.isActive;
    await user.save();
    
    res.status(200).json({ message: `User ${user.isActive ? 'activated' : 'deactivated'} successfully`, user });
  } catch (error) {
    console.error('Error updating user status:', error);
    res.status(500).json({ message: 'Server error updating status' });
  }
});

// Start Server
app.listen(PORT, () => {
  console.log(`Server is running on http://localhost:${PORT}`);
});
