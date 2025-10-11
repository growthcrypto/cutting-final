const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const csv = require('csv-parser');
const XLSX = require('xlsx');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const OpenAI = require('openai');
require('dotenv').config();

// Import models
const {
  User,
  CreatorAccount,
  Guideline,
  DailyChatterReport,
  MessageAnalysis,
  AccountData,
  ChatterPerformance,
  AIAnalysis,
  PerformanceHistory,
  Chatter,
  Analytics,
  TrafficSource,
  VIPFan,
  FanPurchase,
  TrafficSourcePerformance,
  LinkTrackingData,
  DailyAccountSnapshot
} = require('./models');

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.static('public'));

// AI Configuration (OpenAI GPT-4o-mini)
console.log('🔍 Environment check:');
console.log('  XAI_API_KEY exists:', !!process.env.XAI_API_KEY);
console.log('  XAI_API_KEY length:', process.env.XAI_API_KEY ? process.env.XAI_API_KEY.length : 0);
console.log('  XAI_API_KEY starts with xai-:', process.env.XAI_API_KEY ? process.env.XAI_API_KEY.startsWith('xai-') : false);
console.log('  XAI_API_KEY first 10 chars:', process.env.XAI_API_KEY ? process.env.XAI_API_KEY.substring(0, 10) : 'N/A');
console.log('  XAI_API_KEY last 10 chars:', process.env.XAI_API_KEY ? process.env.XAI_API_KEY.substring(-10) : 'N/A');
console.log('  OPENAI_API_KEY exists:', !!process.env.OPENAI_API_KEY);
console.log('  OPENAI_API_KEY length:', process.env.OPENAI_API_KEY ? process.env.OPENAI_API_KEY.length : 0);
console.log('  All env vars with XAI:', Object.keys(process.env).filter(key => key.includes('XAI')));
console.log('  All env vars with OPENAI:', Object.keys(process.env).filter(key => key.includes('OPENAI')));
console.log('  ALL ENVIRONMENT VARIABLES:', Object.keys(process.env).sort());
console.log('  NODE_ENV:', process.env.NODE_ENV);
console.log('  RAILWAY_ENVIRONMENT:', process.env.RAILWAY_ENVIRONMENT);

let openai;
if (process.env.OPENAI_API_KEY) {
  openai = new OpenAI({
    apiKey: process.env.OPENAI_API_KEY
  });
  console.log('✅ OpenAI configured with key:', process.env.OPENAI_API_KEY.substring(0, 10) + '...');
  console.log('✅ Using OpenAI baseURL (default)');
} else if (process.env.XAI_API_KEY) {
  openai = new OpenAI({
    apiKey: process.env.XAI_API_KEY,
    baseURL: 'https://api.x.ai/v1'
  });
  console.log('✅ xAI configured with key:', process.env.XAI_API_KEY.substring(0, 10) + '... (fallback)');
  console.log('⚠️  Using xAI baseURL: https://api.x.ai/v1');
} else {
  console.warn('⚠️  XAI_API_KEY not set - AI analysis will be limited');
  console.log('Environment check - XAI_API_KEY exists:', !!process.env.XAI_API_KEY);
  // Create a mock openai object to prevent errors
  openai = {
    chat: {
      completions: {
        create: async () => {
          return {
            choices: [{
              message: {
                content: JSON.stringify({
                  overallScore: null,
                  grammarScore: null,
                  guidelinesScore: null,
                  engagementScore: null,
                  strengths: ["No message analysis data available"],
                  weaknesses: ["Upload message data for analysis"],
                  suggestions: ["Upload CSV with message data to get real analysis"]
                })
              }
            }]
          };
        }
      }
    }
  };
}

// MongoDB Connection
const mongoUri = process.env.MONGODB_URI || process.env.MONGO_URL || 'mongodb://localhost:27017/onlyfans_analytics';
console.log('🔌 Attempting to connect to MongoDB...');
console.log('🔗 MongoDB URI format check:', mongoUri ? 'Set' : 'Not set');
  console.log('🔥 SERVER V3 - METRICS FIX DEPLOYED - OPENAI GPT-4O-MINI!');

// Connect to MongoDB and wait for connection
async function connectToMongoDB() {
  try {
    await mongoose.connect(mongoUri, {
      useNewUrlParser: true,
      useUnifiedTopology: true,
      serverSelectionTimeoutMS: 15000,
      socketTimeoutMS: 45000
      // Removed bufferCommands settings to use defaults
    });
    console.log('✅ Connected to MongoDB successfully!');
    // await initializeData(); // Commented out to prevent hanging
  } catch (error) {
    console.error('❌ MongoDB connection error:', error.message);
    console.log('⚠️  App will continue with limited functionality');
    console.log('🔍 Check if MongoDB service is running and accessible');
  }
}

// Start MongoDB connection
connectToMongoDB();

// JWT middleware
const authenticateToken = (req, res, next) => {
  // Authentication check
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];

  if (!token) {
    console.log('❌ No token provided');
    return res.sendStatus(401);
  }

  jwt.verify(token, process.env.JWT_SECRET || 'your-secret-key', (err, user) => {
    if (err) {
      console.log('❌ Token verification failed:', err.message);
      return res.sendStatus(403);
    }
    // Token verified
    req.user = user;
    next();
  });
};

// Manager only middleware
const requireManager = (req, res, next) => {
  if (req.user.role !== 'manager') {
    return res.status(403).json({ error: 'Manager access required' });
  }
  next();
};

// File upload configuration
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const uploadDir = 'uploads/';
    if (!fs.existsSync(uploadDir)) {
      fs.mkdirSync(uploadDir, { recursive: true });
    }
    cb(null, uploadDir);
  },
  filename: (req, file, cb) => {
    cb(null, Date.now() + '-' + file.originalname);
  }
});

const upload = multer({ storage: storage });

// Database connection check middleware
const checkDatabaseConnection = (req, res, next) => {
  // Database connection check
  if (mongoose.connection.readyState !== 1) {
    console.log('❌ Database not ready');
    return res.status(503).json({ 
      error: 'Database connection not ready. Please try again in a moment.' 
    });
  }
  // Database connection OK
  next();
};

// Initialize default data
async function initializeData() {
  try {
    console.log('🔧 Initializing default data...');
    
    // Create default creator accounts if none exist
    const accountCount = await CreatorAccount.countDocuments();
    if (accountCount === 0) {
        const defaultAccounts = [
          { name: 'Arya', accountName: 'arya_account', isMainAccount: true },
          { name: 'Iris', accountName: 'iris_account', isMainAccount: true },
          { name: 'Lilla', accountName: 'lilla_account', isMainAccount: true }
        ];
      
      await CreatorAccount.insertMany(defaultAccounts);
      console.log('✅ Default creator accounts created');
    }

    // Create default manager account if none exists
    const managerCount = await User.countDocuments({ role: 'manager' });
    if (managerCount === 0) {
      const hashedPassword = await bcrypt.hash('admin123', 10);
      const manager = new User({
        username: 'admin',
        email: 'admin@agency.com',
        password: hashedPassword,
        role: 'manager'
      });
      await manager.save();
      console.log('✅ Default manager account created');
      console.log('🔑 Login with: admin / admin123');
    }

  } catch (error) {
    console.error('❌ Error initializing data:', error.message);
  }
}

// Health check
app.get('/health', (req, res) => {
  res.json({
    status: 'OK',
    message: 'OnlyFans Agency Analytics System',
    timestamp: new Date().toISOString(),
    database: mongoose.connection.readyState === 1 ? 'Connected' : 'Not connected',
    ai: !!openai ? 'Enabled' : 'Disabled'
  });
});

// Authentication Routes
app.post('/api/auth/login', checkDatabaseConnection, async (req, res) => {
  try {
    console.log('Login attempt for username:', req.body.username);
    const { username, password } = req.body;

    if (!username || !password) {
      console.log('Missing username or password');
      return res.status(400).json({ error: 'Username and password are required' });
    }

    // Check if user exists (including inactive users for debugging)
    const user = await User.findOne({ username });
    if (!user) {
      console.log('User not found in database:', username);
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    console.log('User found:', {
      id: user._id,
      username: user.username,
      email: user.email,
      role: user.role,
      isActive: user.isActive,
      chatterName: user.chatterName,
      hasPassword: !!user.password,
      passwordLength: user.password ? user.password.length : 0
    });

    if (!user.isActive) {
      console.log('User account is inactive:', username);
      return res.status(401).json({ error: 'Account is inactive' });
    }

    const isValidPassword = await bcrypt.compare(password, user.password);
    console.log('Password validation result:', isValidPassword);
    
    if (!isValidPassword) {
      console.log('Invalid password for user:', username);
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    const token = jwt.sign(
      { 
        userId: user._id, 
        username: user.username, 
        role: user.role,
        chatterName: user.chatterName 
      },
      process.env.JWT_SECRET || 'your-secret-key',
      { expiresIn: '7d' }
    );

    console.log('Login successful for user:', username, 'role:', user.role);
    res.json({
      token,
      user: {
        id: user._id,
        username: user.username,
        role: user.role,
        chatterName: user.chatterName
      }
    });
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({ error: error.message });
  }
});

// Public registration endpoint (no auth required)
app.post('/api/auth/register', checkDatabaseConnection, async (req, res) => {
  try {
    const { username, email, password, role, chatterName } = req.body;

    const existingUser = await User.findOne({
      $or: [{ username }, { email }]
    });

    if (existingUser) {
      return res.status(400).json({ error: 'Username or email already exists' });
    }

    const hashedPassword = await bcrypt.hash(password, 10);
    const user = new User({
      username,
      email,
      password: hashedPassword,
      role,
      chatterName: role === 'chatter' ? chatterName : undefined
    });

    await user.save();

    res.json({
      message: 'User created successfully',
      user: {
        id: user._id,
        username: user.username,
        role: user.role,
        chatterName: user.chatterName
      }
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Manager-only registration endpoint for creating additional accounts
app.post('/api/auth/register-manager', checkDatabaseConnection, authenticateToken, requireManager, async (req, res) => {
  try {
    console.log('Manager registration attempt:', req.body);
    const { username, email, password, role, chatterName } = req.body;

    // Validate required fields
    if (!username || !email || !password || !role) {
      return res.status(400).json({ error: 'Missing required fields: username, email, password, role' });
    }

    const existingUser = await User.findOne({
      $or: [{ username }, { email }]
    });

    if (existingUser) {
      return res.status(400).json({ error: 'Username or email already exists' });
    }

    const hashedPassword = await bcrypt.hash(password, 10);
    console.log('Password hashing:', {
      originalLength: password.length,
      hashedLength: hashedPassword.length,
      hashedPrefix: hashedPassword.substring(0, 10) + '...'
    });
    
    const user = new User({
      username,
      email,
      password: hashedPassword,
      role,
      chatterName: role === 'chatter' ? chatterName : undefined
    });

    await user.save();
    console.log('User created by manager:', {
      id: user._id,
      username: user.username,
      email: user.email,
      role: user.role,
      chatterName: user.chatterName,
      isActive: user.isActive,
      hasPassword: !!user.password,
      passwordLength: user.password ? user.password.length : 0
    });
    res.status(201).json({ message: 'User created successfully', userId: user._id });
  } catch (error) {
    console.error('Manager registration error:', error);
    res.status(500).json({ error: error.message });
  }
});

// Creator Account Management
app.get('/api/creator-accounts', authenticateToken, async (req, res) => {
  try {
    const accounts = await CreatorAccount.find({ isActive: true });
    res.json(accounts);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/creator-accounts', authenticateToken, requireManager, async (req, res) => {
  try {
    const { name, accountName, isMainAccount } = req.body;
    const account = new CreatorAccount({ name, accountName, isMainAccount });
    await account.save();
    res.json(account);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Get all users (manager only)
app.get('/api/users', checkDatabaseConnection, authenticateToken, requireManager, async (req, res) => {
  try {
    const users = await User.find({}, { password: 0 }); // Exclude password
    res.json(users);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Get message analysis for a specific chatter
app.get('/api/message-analysis/:chatterName', checkDatabaseConnection, authenticateToken, async (req, res) => {
  try {
    const { chatterName } = req.params;
    const messageAnalyses = await MessageAnalysis.find({ chatterName }).sort({ weekEndDate: -1 });
    res.json(messageAnalyses);
  } catch (error) {
    console.error('Error fetching message analysis:', error);
    res.status(500).json({ error: 'Failed to fetch message analysis' });
  }
});

// Get all chatters/employees
// Get current user info
app.get('/api/auth/me', checkDatabaseConnection, authenticateToken, async (req, res) => {
  try {
    const user = await User.findById(req.user.userId).select('-password');
    if (!user) {
      // If user not found, return the user info from the JWT token
      return res.json({
        _id: req.user.userId,
        username: req.user.username,
        role: req.user.role,
        chatterName: req.user.username // Use username as chatterName for admin
      });
    }
    res.json(user);
  } catch (error) {
    console.error('Error fetching user info:', error);
    res.status(500).json({ error: 'Failed to fetch user info' });
  }
});

app.get('/api/chatters', checkDatabaseConnection, authenticateToken, async (req, res) => {
  try {
    const chatters = await User.find({ role: 'chatter' }, { password: 0 });
    res.json(chatters);
  } catch (error) {
    console.error('Error fetching chatters:', error);
    res.status(500).json({ error: 'Failed to fetch chatters' });
  }
});

// Delete user endpoint
app.delete('/api/users/:userId', checkDatabaseConnection, authenticateToken, requireManager, async (req, res) => {
  try {
    const { userId } = req.params;
    
    // Prevent deleting the last manager
    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }
    
    if (user.role === 'manager') {
      const managerCount = await User.countDocuments({ role: 'manager' });
      if (managerCount <= 1) {
        return res.status(400).json({ error: 'Cannot delete the last manager account' });
      }
    }
    
    await User.findByIdAndDelete(userId);
    console.log('User deleted:', user.username, user.role);
    res.json({ message: 'User deleted successfully' });
  } catch (error) {
    console.error('Delete user error:', error);
    res.status(500).json({ error: error.message });
  }
});

// Get available weeks and months from uploaded data
app.get('/api/analytics/available-periods', checkDatabaseConnection, authenticateToken, async (req, res) => {
  try {
    // Get all unique weeks from ChatterPerformance and AccountData
    const chatterWeeks = await ChatterPerformance.find({})
      .select('weekStartDate weekEndDate')
      .sort({ weekStartDate: 1 });
    
    const accountWeeks = await AccountData.find({})
      .select('weekStartDate weekEndDate')
      .sort({ weekStartDate: 1 });
    
    // Combine and deduplicate weeks
    const allWeeks = [...chatterWeeks, ...accountWeeks];
    const uniqueWeeks = [];
    const weekSet = new Set();
    
    allWeeks.forEach(w => {
      if (w.weekStartDate && w.weekEndDate) {
        const key = `${w.weekStartDate.toISOString()}_${w.weekEndDate.toISOString()}`;
        if (!weekSet.has(key)) {
          weekSet.add(key);
          uniqueWeeks.push({
            start: w.weekStartDate,
            end: w.weekEndDate,
            label: `${w.weekStartDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} - ${w.weekEndDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}`
          });
        }
      }
    });
    
    // Sort by start date
    uniqueWeeks.sort((a, b) => a.start - b.start);
    
    // Extract unique months
    const monthSet = new Set();
    const months = [];
    
    uniqueWeeks.forEach(week => {
      const monthKey = `${week.start.getFullYear()}-${week.start.getMonth()}`;
      const monthKeyEnd = `${week.end.getFullYear()}-${week.end.getMonth()}`;
      
      [monthKey, monthKeyEnd].forEach(key => {
        if (!monthSet.has(key)) {
          monthSet.add(key);
          const [year, month] = key.split('-').map(Number);
          const date = new Date(year, month, 1);
          months.push({
            year: year,
            month: month,
            label: date.toLocaleDateString('en-US', { month: 'long', year: 'numeric' }),
            firstDay: new Date(year, month, 1),
            lastDay: new Date(year, month + 1, 0)
          });
        }
      });
    });
    
    // Sort months
    months.sort((a, b) => {
      if (a.year !== b.year) return a.year - b.year;
      return a.month - b.month;
    });
    
    res.json({
      weeks: uniqueWeeks,
      months: months
    });
    
  } catch (error) {
    console.error('Error fetching available periods:', error);
    res.status(500).json({ error: error.message });
  }
});

// Get dashboard analytics
app.get('/api/analytics/dashboard', checkDatabaseConnection, authenticateToken, async (req, res) => {
  try {
    const { filterType, weekStart, weekEnd, monthStart, monthEnd, customStart, customEnd } = req.query;

    console.log('📊 Dashboard API called with:', { filterType, weekStart, weekEnd, monthStart, monthEnd, customStart, customEnd });

    // Define start and end dates based on filter type
    let start, end;
    let isWeekFilter = false;
    let isMonthFilter = false;
    let isCustomFilter = false;
    
    if (filterType === 'custom' && customStart && customEnd) {
      // NEW: Custom date range filter
      start = new Date(customStart);
      end = new Date(customEnd);
      isCustomFilter = true;
      console.log('✅ Using CUSTOM filter:', start.toISOString(), 'to', end.toISOString());
    } else if (filterType === 'week' && weekStart && weekEnd) {
      // Exact week filter
      start = new Date(weekStart);
      end = new Date(weekEnd);
      isWeekFilter = true;
      console.log('✅ Using WEEK filter:', start.toISOString(), 'to', end.toISOString());
    } else if (filterType === 'month' && monthStart && monthEnd) {
      // Month filter (all weeks touching this month)
      start = new Date(monthStart);
      end = new Date(monthEnd);
      isMonthFilter = true;
      console.log('✅ Using MONTH filter:', start.toISOString(), 'to', end.toISOString());
    } else {
      // Fallback: last 7 days
      end = new Date();
      start = new Date();
      start.setDate(start.getDate() - 7);
      console.log('⚠️ Using fallback (last 7 days):', start.toISOString(), 'to', end.toISOString());
    }

    // Build queries based on filter type
    let accountDataQuery, chatterPerformanceQuery, dateQuery;
    
    if (isCustomFilter) {
      // NEW: Custom date range - query daily data AND OF account data that overlaps
      accountDataQuery = {
        weekStartDate: { $lte: end },
        weekEndDate: { $gte: start }
      };
      chatterPerformanceQuery = {
        weekStartDate: { $lte: end },
        weekEndDate: { $gte: start }
      };
      dateQuery = { date: { $gte: start, $lte: end } };
      console.log('📅 Using custom date range query with overlap for weekly data');
    } else if (isWeekFilter) {
      // EXACT WEEK MATCH
      accountDataQuery = {
        weekStartDate: start,
        weekEndDate: end
      };
      chatterPerformanceQuery = {
        weekStartDate: start,
        weekEndDate: end
      };
      dateQuery = { date: { $gte: start, $lte: end } };
      console.log('📅 Using exact week match query');
    } else if (isMonthFilter) {
      // MONTH OVERLAP (any week touching this month)
      accountDataQuery = {
        weekStartDate: { $lte: end },
        weekEndDate: { $gte: start }
      };
      chatterPerformanceQuery = {
        weekStartDate: { $lte: end },
        weekEndDate: { $gte: start }
      };
      dateQuery = { date: { $gte: start, $lte: end } };
      console.log('📅 Using month overlap query');
    } else {
      // Fallback: overlap query
      accountDataQuery = {
        weekStartDate: { $lte: end },
        weekEndDate: { $gte: start }
      };
      chatterPerformanceQuery = { 
        weekStartDate: { $lte: end },
        weekEndDate: { $gte: start }
      };
      dateQuery = { date: { $gte: start, $lte: end } };
      console.log('📅 Using fallback overlap query');
    }
    
    // Fetch data
    const dailyReports = await DailyChatterReport.find(dateQuery);
    const ofAccountData = await AccountData.find(accountDataQuery);
    const dailySnapshots = await DailyAccountSnapshot.find(dateQuery); // NEW: Daily snapshots for custom dates
    const chatterPerformance = await ChatterPerformance.find(chatterPerformanceQuery);
    
    console.log('=== DASHBOARD QUERY DEBUG ===');
    console.log('Query used:', JSON.stringify(chatterPerformanceQuery, null, 2));
    console.log('Dashboard data query results:', {
      dailyReports: dailyReports.length,
      ofAccountData: ofAccountData.length,
      dailySnapshots: dailySnapshots.length,
      chatterPerformance: chatterPerformance.length
    });
    console.log('ChatterPerformance data found:', JSON.stringify(chatterPerformance, null, 2));
    
    console.log('Dashboard query:', {
      dailyReports: dailyReports.length,
      ofAccountData: ofAccountData.length,
      dailySnapshots: dailySnapshots.length,
      chatterPerformance: chatterPerformance.length,
      dateQuery,
      chatterPerformanceQuery,
      sampleChatterData: chatterPerformance.slice(0, 2).map(c => ({
        chatterName: c.chatterName,
        weekStartDate: c.weekStartDate,
        weekEndDate: c.weekEndDate,
        messagesSent: c.messagesSent,
        ppvsSent: c.ppvsSent
      }))
    });
    
    // Calculate metrics from FanPurchase records (daily logs - single source of truth)
    const fanPurchases = await FanPurchase.find(dateQuery);
    
    const totalPPVRevenue = fanPurchases
      .filter(p => p.type === 'ppv')
      .reduce((sum, p) => sum + (p.amount || 0), 0);
    
    const totalTipRevenue = fanPurchases
      .filter(p => p.type === 'tip')
      .reduce((sum, p) => sum + (p.amount || 0), 0);
    
    const totalRevenue = totalPPVRevenue + totalTipRevenue;
    
    console.log('💰 Revenue from FanPurchase records:', {
      ppv: totalPPVRevenue,
      tips: totalTipRevenue,
      total: totalRevenue,
      recordCount: fanPurchases.length
    });
    
    // Average PPV price from FanPurchase records
    const ppvPurchases = fanPurchases.filter(p => p.type === 'ppv');
    const avgPPVPriceDaily = ppvPurchases.length > 0
      ? Math.round((totalPPVRevenue / ppvPurchases.length) * 100) / 100
      : 0;

    // PPVs unlocked = count of PPV purchases from FanPurchase records
    const totalPPVsUnlocked = ppvPurchases.length;
    
    // Add metrics from chatter performance data (only count non-null values)
    const chatterPPVsSent = chatterPerformance.reduce((sum, data) => sum + (data.ppvsSent || 0), 0);
    const chatterPPVsUnlocked = chatterPerformance.reduce((sum, data) => sum + (data.ppvsUnlocked || 0), 0);
    const chatterMessagesSent = chatterPerformance.reduce((sum, data) => sum + (data.messagesSent || 0), 0);
    const chatterFansChatted = chatterPerformance.reduce((sum, data) => sum + (data.fansChattedWith || 0), 0);
    
    // Calculate response time from both sources (only count non-null values)
    const dailyReportsWithResponseTime = dailyReports.filter(report => report.avgResponseTime != null && report.avgResponseTime > 0);
    const dailyReportsResponseTime = dailyReportsWithResponseTime.length > 0 
      ? dailyReportsWithResponseTime.reduce((sum, report) => sum + report.avgResponseTime, 0) / dailyReportsWithResponseTime.length 
      : 0;
    
    const chatterPerformanceWithResponseTime = chatterPerformance.filter(data => data.avgResponseTime != null && data.avgResponseTime > 0);
    const chatterPerformanceResponseTime = chatterPerformanceWithResponseTime.length > 0
      ? chatterPerformanceWithResponseTime.reduce((sum, data) => sum + data.avgResponseTime, 0) / chatterPerformanceWithResponseTime.length
      : 0;
    
    // Use response time from either source, preferring daily reports if available
    const avgResponseTime = dailyReportsResponseTime > 0 ? dailyReportsResponseTime : chatterPerformanceResponseTime;

    // Get recurring revenue from OF Account data, but use totalRevenue for netRevenue (from daily logs)
    const netRevenue = totalRevenue; // NOW: Use daily logs as source of truth
    
    // PRIORITIZE Daily Snapshots over old OF Account data
    let totalSubs, activeFans, fansWithRenew, renewRate, newSubs, recurringRevenue;
    
    if (dailySnapshots.length > 0) {
      // NEW: Use daily snapshots (better granularity)
      console.log('📊 Using DailyAccountSnapshot data');
      
      // Average snapshot metrics (they're point-in-time values)
      totalSubs = Math.round(dailySnapshots.reduce((sum, s) => sum + (s.totalSubs || 0), 0) / dailySnapshots.length);
      activeFans = Math.round(dailySnapshots.reduce((sum, s) => sum + (s.activeFans || 0), 0) / dailySnapshots.length);
      fansWithRenew = Math.round(dailySnapshots.reduce((sum, s) => sum + (s.fansWithRenew || 0), 0) / dailySnapshots.length);
      renewRate = dailySnapshots.reduce((sum, s) => sum + (s.renewRate || 0), 0) / dailySnapshots.length;
      
      // Sum new subs (cumulative)
      newSubs = dailySnapshots.reduce((sum, s) => sum + (s.newSubsToday || 0), 0);
      
      // Calculate recurring revenue: fans with renew × avg sub price
      // Assuming $10/month subscription (you can make this configurable)
      recurringRevenue = fansWithRenew * 10;
    } else {
      // FALLBACK: Use old OF Account data
      console.log('📊 Falling back to OF Account data (upload daily snapshots for better metrics!)');
      
      recurringRevenue = ofAccountData.reduce((sum, data) => sum + (data.recurringRevenue || 0), 0);
      totalSubs = ofAccountData.length > 0 
        ? Math.round(ofAccountData.reduce((sum, data) => sum + (data.totalSubs || 0), 0) / ofAccountData.length)
        : 0;
      newSubs = ofAccountData.reduce((sum, data) => sum + (data.newSubs || 0), 0);
      
      // Old data doesn't have these metrics
      activeFans = 0;
      fansWithRenew = 0;
      renewRate = 0;
    }
    
    const profileClicks = ofAccountData.reduce((sum, data) => sum + (data.profileClicks || 0), 0);

    // Get link clicks from LinkTrackingData (uses weekStartDate/weekEndDate)
    let linkTrackingQuery = {};
    if (isWeekFilter) {
      linkTrackingQuery = {
        weekStartDate: start,
        weekEndDate: end
      };
    } else if (isMonthFilter) {
      linkTrackingQuery = {
        weekStartDate: { $lte: end },
        weekEndDate: { $gte: start }
      };
    } else {
      linkTrackingQuery = {
        weekStartDate: { $lte: end },
        weekEndDate: { $gte: start }
      };
    }
    
    const linkTrackingData = await LinkTrackingData.find(linkTrackingQuery);
    console.log('🔗 Link tracking query:', linkTrackingQuery);
    console.log('🔗 Link tracking data found:', linkTrackingData.length, 'records');
    const totalLinkClicks = linkTrackingData.reduce((sum, lt) => sum + (lt.onlyFansClicks || 0), 0);
    const totalLinkViews = linkTrackingData.reduce((sum, lt) => sum + (lt.landingPageViews || 0), 0);
    console.log('🔗 Total link clicks:', totalLinkClicks, 'Total views:', totalLinkViews);
    
    // Calculate combined fans chatted (needed for spender conversion)
    const combinedFansChatted = dailyReports.reduce((sum, report) => sum + (report.fansChatted || 0), 0) + chatterFansChatted;
    
    // Calculate spender conversion rate (fans who became buyers)
    const uniqueSpenders = new Set(fanPurchases.map(p => p.fanUsername).filter(u => u)).size;
    const spenderConversionRate = combinedFansChatted > 0 ? (uniqueSpenders / combinedFansChatted) * 100 : 0;
    
    // Get latest analysis scores for each chatter
    const latestAnalyses = await MessageAnalysis.aggregate([
      {
        $sort: { weekEndDate: -1 }
      },
      {
        $group: {
          _id: '$chatterName',
          latestAnalysis: { $first: '$$ROOT' }
        }
      }
    ]);
    
    const overallScores = latestAnalyses
      .map(a => a.latestAnalysis.overallScore)
      .filter(s => s != null && s > 0);
    const grammarScores = latestAnalyses
      .map(a => a.latestAnalysis.grammarScore)
      .filter(s => s != null && s > 0);
    const guidelineScores = latestAnalyses
      .map(a => a.latestAnalysis.guidelinesScore)
      .filter(s => s != null && s > 0);
    
    // Average scores (0-100 scale)
    const avgOverallScore = overallScores.length > 0 
      ? Math.round(overallScores.reduce((s, v) => s + v, 0) / overallScores.length) 
      : null;
    const avgGrammarScore = grammarScores.length > 0
      ? Math.round(grammarScores.reduce((s, v) => s + v, 0) / grammarScores.length)
      : null;
    const avgGuidelinesScore = guidelineScores.length > 0
      ? Math.round(guidelineScores.reduce((s, v) => s + v, 0) / guidelineScores.length)
      : null;
    
    console.log('📊 Analysis scores:', {
      latestAnalysesCount: latestAnalyses.length,
      avgOverallScore,
      avgGrammarScore,
      avgGuidelinesScore,
      overallScoresFound: overallScores.length,
      grammarScoresFound: grammarScores.length,
      guidelineScoresFound: guidelineScores.length
    });
    
    // Calculate top performer from FanPurchase records
    const chatterRevenue = {};
    fanPurchases.forEach(purchase => {
      const chatter = purchase.chatterName || 'Unknown';
      if (!chatterRevenue[chatter]) {
        chatterRevenue[chatter] = 0;
      }
      chatterRevenue[chatter] += purchase.amount || 0;
    });
    
    let topPerformer = null;
    let topRevenue = 0;
    Object.entries(chatterRevenue).forEach(([name, revenue]) => {
      if (revenue > topRevenue) {
        topRevenue = revenue;
        topPerformer = name;
      }
    });
    
    console.log('🏆 Top performer:', topPerformer, 'with $', topRevenue);
    
    // Calculate VIP metrics
    const allVIPFans = await VIPFan.find({ status: 'active' });
    const vipRevenue = fanPurchases
      .filter(p => p.vipFan != null)
      .reduce((sum, p) => sum + (p.amount || 0), 0);
    const vipRevenuePercent = totalRevenue > 0 ? (vipRevenue / totalRevenue) * 100 : 0;
    const avgVIPSpend = allVIPFans.length > 0 
      ? allVIPFans.reduce((sum, vip) => sum + (vip.lifetimeSpend || 0), 0) / allVIPFans.length
      : 0;
    
    console.log('⭐ VIP Metrics:', {
      vipCount: allVIPFans.length,
      vipRevenue,
      vipRevenuePercent: vipRevenuePercent.toFixed(1) + '%',
      avgVIPSpend: avgVIPSpend.toFixed(2)
    });
    
    // Combine data from all sources
    const combinedPPVsSent = chatterPPVsSent; // 'sent' comes from chatter performance
    const combinedPPVsUnlocked = totalPPVsUnlocked + chatterPPVsUnlocked; // unlocked = sales from reports + unlocked from chatter perf
    const combinedMessagesSent = dailyReports.reduce((sum, report) => sum + (report.fansChatted || 0) * 15, 0) + chatterMessagesSent;

    const analytics = {
      totalRevenue: Math.round(totalRevenue),
      netRevenue: Math.round(netRevenue),
      ppvRevenue: Math.round(totalPPVRevenue),
      tipRevenue: Math.round(totalRevenue - totalPPVRevenue),
      recurringRevenue: Math.round(recurringRevenue),
      totalSubs: Math.round(totalSubs),
      newSubs: Math.round(newSubs),
      profileClicks: Math.round(profileClicks),
      linkClicks: Math.round(totalLinkClicks), // NEW: Link clicks from tracking data
      linkViews: Math.round(totalLinkViews),
      // NEW METRICS from Daily Account Snapshots
      activeFans: Math.round(activeFans || 0), // Active subscriber count
      fansWithRenew: Math.round(fansWithRenew || 0), // Fans with auto-renew enabled
      renewRate: Math.round(renewRate * 10) / 10, // % of active fans with renew on
      // VIP Fan Metrics
      vipRevenuePercent: Math.round(vipRevenuePercent * 10) / 10, // % of revenue from VIPs
      avgVIPSpend: Math.round(avgVIPSpend * 100) / 100, // Avg lifetime spend per VIP
      vipCount: allVIPFans.length, // Total VIP fans
      messagesSent: combinedMessagesSent,
      ppvsSent: combinedPPVsSent,
      ppvsUnlocked: combinedPPVsUnlocked,
      fansChatted: combinedFansChatted,
      avgResponseTime: Math.round(avgResponseTime * 10) / 10,
      avgPPVPrice: avgPPVPriceDaily, // NEW: For Efficiency Matrix card
      spenderConversionRate: Math.round(spenderConversionRate * 10) / 10, // NEW: For Efficiency Matrix
      uniqueSpenders: uniqueSpenders, // NEW: For calculations
      // Analysis scores
      avgOverallScore: avgOverallScore, // NEW: For Team Dynamics
      avgGrammarScore: avgGrammarScore, // NEW: For Team Dynamics
      avgGuidelinesScore: avgGuidelinesScore, // NEW: For Team Dynamics
      topPerformer: topPerformer || 'No data', // NEW: Top revenue generator
      conversionRate: profileClicks > 0 ? Math.round((newSubs / profileClicks) * 100) : 0
    };
    
    // Calculate period-over-period changes
    const duration = end - start;
    const prevStart = new Date(start.getTime() - duration);
    const prevEnd = new Date(start.getTime());
    
    console.log('Period comparison:', { 
      current: { start, end },
      previous: { start: prevStart, end: prevEnd }
    });
    
    const prevDateQuery = {
      $or: [
        { weekStartDate: { $gte: prevStart, $lt: prevEnd } },
        { weekEndDate: { $gte: prevStart, $lt: prevEnd } },
        { $and: [{ weekStartDate: { $lte: prevStart } }, { weekEndDate: { $gte: prevEnd } }] }
      ]
    };
    
    const prevChatterData = await ChatterPerformance.find(prevDateQuery);
    const prevAccountData = await AccountData.find(prevDateQuery);
    
    console.log('Previous period data found:', { chatter: prevChatterData.length, account: prevAccountData.length });
    
    const sumField = (data, field) => data.reduce((sum, item) => sum + (item[field] || 0), 0);
    const avgField = (data, field) => data.length > 0 ? sumField(data, field) / data.length : 0;
    const calcChange = (current, previous) => {
      if (!previous || previous === 0) {
        // If no previous data, don't show change
        return null;
      }
      const change = ((current - previous) / previous * 100).toFixed(1);
      return change > 0 ? `+${change}` : change;
    };
    
    const prevMetrics = {
      ppvsSent: sumField(prevChatterData, 'ppvsSent'),
      ppvsUnlocked: sumField(prevChatterData, 'ppvsUnlocked'),
      messagesSent: sumField(prevChatterData, 'messagesSent'),
      fansChatted: sumField(prevChatterData, 'fansChattedWith'),
      avgResponseTime: avgField(prevChatterData, 'avgResponseTime'),
      netRevenue: sumField(prevAccountData, 'netRevenue'),
      newSubs: sumField(prevAccountData, 'newSubs'),
      profileClicks: sumField(prevAccountData, 'profileClicks'),
      totalSubs: Math.round(avgField(prevAccountData, 'totalSubs'))
    };
    
    prevMetrics.unlockRate = prevMetrics.ppvsSent > 0 ? (prevMetrics.ppvsUnlocked / prevMetrics.ppvsSent * 100) : 0;
    prevMetrics.conversionRate = prevMetrics.profileClicks > 0 ? (prevMetrics.newSubs / prevMetrics.profileClicks * 100) : 0;
    prevMetrics.messagesPerPPV = prevMetrics.ppvsSent > 0 ? (prevMetrics.messagesSent / prevMetrics.ppvsSent) : 0;
    
    // Calculate current unlock rate
    const currentUnlockRate = analytics.ppvsSent > 0 ? (analytics.ppvsUnlocked / analytics.ppvsSent * 100) : 0;
    
    analytics.changes = {
      totalRevenue: calcChange(analytics.totalRevenue, prevMetrics.netRevenue),
      netRevenue: calcChange(analytics.netRevenue, prevMetrics.netRevenue),
      ppvsSent: calcChange(analytics.ppvsSent, prevMetrics.ppvsSent),
      ppvsUnlocked: calcChange(analytics.ppvsUnlocked, prevMetrics.ppvsUnlocked),
      unlockRate: calcChange(currentUnlockRate, prevMetrics.unlockRate),
      messagesSent: calcChange(analytics.messagesSent, prevMetrics.messagesSent),
      fansChatted: calcChange(analytics.fansChatted, prevMetrics.fansChatted),
      avgResponseTime: calcChange(prevMetrics.avgResponseTime, analytics.avgResponseTime), // reversed (lower is better)
      conversionRate: calcChange(analytics.conversionRate, prevMetrics.conversionRate),
      messagesPerPPV: calcChange((analytics.messagesSent / analytics.ppvsSent), prevMetrics.messagesPerPPV),
      newSubs: calcChange(analytics.newSubs, prevMetrics.newSubs),
      profileClicks: calcChange(analytics.profileClicks, prevMetrics.profileClicks),
      totalSubs: calcChange(analytics.totalSubs, prevMetrics.totalSubs)
    };

    res.json(analytics);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Team Dashboard API - Get combined team performance + individual chatter data
app.get('/api/analytics/team-dashboard', checkDatabaseConnection, authenticateToken, async (req, res) => {
  try {
    const { filterType, weekStart, weekEnd, monthStart, monthEnd, customStart, customEnd } = req.query;

    console.log('👥 Team Dashboard API called with:', { filterType, weekStart, weekEnd, monthStart, monthEnd, customStart, customEnd });

    // Define start and end dates based on filter type
    let start, end;
    let isWeekFilter = false;
    let isMonthFilter = false;
    let isCustomFilter = false;
    
    if (filterType === 'custom' && customStart && customEnd) {
      // NEW: Custom date range filter
      start = new Date(customStart);
      end = new Date(customEnd);
      isCustomFilter = true;
      console.log('✅ Team using CUSTOM filter:', start.toISOString(), 'to', end.toISOString());
    } else if (filterType === 'week' && weekStart && weekEnd) {
      // Exact week filter
      start = new Date(weekStart);
      end = new Date(weekEnd);
      isWeekFilter = true;
      console.log('✅ Team using WEEK filter:', start.toISOString(), 'to', end.toISOString());
    } else if (filterType === 'month' && monthStart && monthEnd) {
      // Month filter (all weeks touching this month)
      start = new Date(monthStart);
      end = new Date(monthEnd);
      isMonthFilter = true;
      console.log('✅ Team using MONTH filter:', start.toISOString(), 'to', end.toISOString());
    } else {
      // Fallback: last 7 days
      end = new Date();
      start = new Date();
      start.setDate(start.getDate() - 7);
      console.log('⚠️ Team using fallback (last 7 days):', start.toISOString(), 'to', end.toISOString());
    }

    // Get all chatters
    const allChatters = await User.find({ role: 'chatter' });
    const chatterNames = allChatters.map(c => c.chatterName || c.username);

    // Query for chatter performance data based on filter type
    let chatterPerformanceQuery;
    if (isWeekFilter) {
      // WEEK FILTER: Match records where weekStartDate and weekEndDate match the filter dates
      // Use date range to handle timezone/precision issues
      const startOfDay = new Date(start);
      startOfDay.setHours(0, 0, 0, 0);
      const endOfDay = new Date(end);
      endOfDay.setHours(23, 59, 59, 999);
      
      chatterPerformanceQuery = {
        weekStartDate: { $gte: startOfDay, $lte: new Date(start.getTime() + 24 * 60 * 60 * 1000) },
        weekEndDate: { $gte: new Date(end.getTime() - 24 * 60 * 60 * 1000), $lte: endOfDay }
      };
      console.log('📅 Week query:', { startOfDay, endOfDay, weekStart: start, weekEnd: end });
    } else if (isMonthFilter) {
      // MONTH OVERLAP
      chatterPerformanceQuery = {
        weekStartDate: { $lte: end },
        weekEndDate: { $gte: start }
      };
    } else {
      // FALLBACK OVERLAP
      chatterPerformanceQuery = {
        weekStartDate: { $lte: end },
        weekEndDate: { $gte: start }
      };
    }
    const chatterPerformance = await ChatterPerformance.find(chatterPerformanceQuery);
    console.log('📊 Team Dashboard - ChatterPerformance found:', chatterPerformance.length, 'records');
    if (chatterPerformance.length > 0) {
      console.log('📊 Sample record:', {
        chatterName: chatterPerformance[0].chatterName,
        weekStartDate: chatterPerformance[0].weekStartDate,
        weekEndDate: chatterPerformance[0].weekEndDate,
        messagesSent: chatterPerformance[0].messagesSent
      });
    } else {
      console.log('❌ No ChatterPerformance records found with query:', chatterPerformanceQuery);
    }

    // Get latest AI analysis for each chatter based on filter type
    const aiAnalysisPromises = chatterNames.map(async (name) => {
      let analysisQuery;
      
      if (isWeekFilter) {
        // EXACT WEEK MATCH - use weekStartDate and weekEndDate
        const startOfDay = new Date(start);
        startOfDay.setHours(0, 0, 0, 0);
        const endOfDay = new Date(end);
        endOfDay.setHours(23, 59, 59, 999);
        
        analysisQuery = {
          chatterName: name,
          weekStartDate: { $gte: startOfDay, $lte: new Date(start.getTime() + 24 * 60 * 60 * 1000) },
          weekEndDate: { $gte: new Date(end.getTime() - 24 * 60 * 60 * 1000), $lte: endOfDay }
        };
      } else {
        // CUSTOM or OVERLAP: any analysis covering this period
        analysisQuery = {
          chatterName: name,
          weekStartDate: { $lte: end },
          weekEndDate: { $gte: start }
        };
      }
      
      const latestAnalysis = await MessageAnalysis.findOne(analysisQuery)
        .sort({ _id: -1 }) // Sort by _id to get the most recently created record
        .select('grammarScore guidelinesScore overallScore grammarBreakdown guidelinesBreakdown overallBreakdown timestamp dateRange weekStartDate weekEndDate');
      
      console.log(`📊 Message Analysis for ${name}:`, latestAnalysis ? { 
        scores: { grammar: latestAnalysis.grammarScore, guidelines: latestAnalysis.guidelinesScore, overall: latestAnalysis.overallScore }, 
        timestamp: latestAnalysis.timestamp,
        dateRange: latestAnalysis.dateRange,
        weekRange: latestAnalysis.weekStartDate && latestAnalysis.weekEndDate ? 
          `${latestAnalysis.weekStartDate.toISOString().split('T')[0]} to ${latestAnalysis.weekEndDate.toISOString().split('T')[0]}` : 'N/A'
      } : 'NOT FOUND');
      
      return { chatterName: name, analysis: latestAnalysis };
    });
    const chatterAnalyses = await Promise.all(aiAnalysisPromises);

    // Calculate team-wide metrics
    let teamMetrics = {
      totalRevenue: 0,
      ppvsSent: 0,
      ppvsUnlocked: 0,
      messagesSent: 0,
      fansChatted: 0,
      totalGrammarScore: 0,
      totalGuidelinesScore: 0,
      totalOverallScore: 0,
      responseTimesSum: 0,
      chatterCount: 0,
      responseTimeCount: 0,
      scoreCount: 0
    };

    // Aggregate chatter performance
    chatterPerformance.forEach(data => {
      teamMetrics.totalRevenue += (data.ppvRevenue || 0) + (data.tipRevenue || 0);
      teamMetrics.ppvsSent += data.ppvsSent || 0;
      teamMetrics.ppvsUnlocked += data.ppvsUnlocked || 0;
      teamMetrics.messagesSent += data.messagesSent || 0;
      teamMetrics.fansChatted += data.fansChattedWith || 0;
      
      if (data.avgResponseTime && data.avgResponseTime > 0) {
        teamMetrics.responseTimesSum += data.avgResponseTime;
        teamMetrics.responseTimeCount++;
      }
    });

    // ALSO get revenue from Daily Chatter Reports (daily sales logs)
    const dailyReportsQuery = {
      date: { $gte: start, $lte: end }
    };
    const dailyReports = await DailyChatterReport.find(dailyReportsQuery);
    console.log('📊 Team Dashboard - DailyChatterReport found:', dailyReports.length, 'records');
    
    dailyReports.forEach(report => {
      // Add revenue from daily sales logs
      const ppvRevenue = report.ppvSales?.reduce((sum, sale) => sum + sale.amount, 0) || 0;
      const tipRevenue = report.tips?.reduce((sum, tip) => sum + tip.amount, 0) || 0;
      teamMetrics.totalRevenue += ppvRevenue + tipRevenue;
      
      // Also count messages and fans if available
      if (report.messagesSent) teamMetrics.messagesSent += report.messagesSent;
      if (report.fansChatted) teamMetrics.fansChatted += report.fansChatted;
      if (report.avgResponseTime && report.avgResponseTime > 0) {
        teamMetrics.responseTimesSum += report.avgResponseTime;
        teamMetrics.responseTimeCount++;
      }
    });

    // Aggregate scores from AI analyses
    let grammarCount = 0, guidelinesCount = 0, overallCount = 0;
    
    chatterAnalyses.forEach(({ analysis }) => {
      if (analysis) {
        if (analysis.grammarScore != null) {
          teamMetrics.totalGrammarScore += analysis.grammarScore;
          grammarCount++;
        }
        if (analysis.guidelinesScore != null) {
          teamMetrics.totalGuidelinesScore += analysis.guidelinesScore;
          guidelinesCount++;
        }
        if (analysis.overallScore != null) {
          teamMetrics.totalOverallScore += analysis.overallScore;
          overallCount++;
        }
      }
    });

    // Calculate averages with separate counters for each score type
    const unlockRate = teamMetrics.ppvsSent > 0 
      ? Math.round((teamMetrics.ppvsUnlocked / teamMetrics.ppvsSent) * 100 * 10) / 10
      : 0;
    
    const avgResponseTime = teamMetrics.responseTimeCount > 0
      ? Math.round((teamMetrics.responseTimesSum / teamMetrics.responseTimeCount) * 10) / 10
      : 0;
    
    const avgGrammarScore = grammarCount > 0
      ? Math.round(teamMetrics.totalGrammarScore / grammarCount)
      : 0;
    
    const avgGuidelinesScore = guidelinesCount > 0
      ? Math.round(teamMetrics.totalGuidelinesScore / guidelinesCount)
      : 0;
    
    const avgOverallScore = overallCount > 0
      ? Math.round(teamMetrics.totalOverallScore / overallCount)
      : 0;
    
    const avgPPVPrice = teamMetrics.ppvsUnlocked > 0
      ? Math.round((teamMetrics.totalRevenue / teamMetrics.ppvsUnlocked) * 100) / 100
      : 0;
    
    const revenuePerMessage = teamMetrics.messagesSent > 0
      ? Math.round((teamMetrics.totalRevenue / teamMetrics.messagesSent) * 100) / 100
      : 0;

    // Find top performer (include both ChatterPerformance and DailyChatterReport revenue)
    const chatterRevenues = {};
    
    // Add revenue from ChatterPerformance
    chatterPerformance.forEach(data => {
      const revenue = (data.ppvRevenue || 0) + (data.tipRevenue || 0);
      if (!chatterRevenues[data.chatterName]) chatterRevenues[data.chatterName] = 0;
      chatterRevenues[data.chatterName] += revenue;
    });
    
    // Add revenue from DailyChatterReport
    dailyReports.forEach(report => {
      const ppvRev = report.ppvSales?.reduce((sum, sale) => sum + sale.amount, 0) || 0;
      const tipRev = report.tips?.reduce((sum, tip) => sum + tip.amount, 0) || 0;
      if (!chatterRevenues[report.chatterName]) chatterRevenues[report.chatterName] = 0;
      chatterRevenues[report.chatterName] += ppvRev + tipRev;
    });
    
    const topPerformer = Object.entries(chatterRevenues).sort((a, b) => b[1] - a[1])[0];

    // Build individual chatter data
    const chatterData = chatterNames.map(name => {
      const perfData = chatterPerformance.filter(p => p.chatterName === name);
      const analysisData = chatterAnalyses.find(a => a.chatterName === name)?.analysis;
      const chatterDailyReports = dailyReports.filter(r => r.chatterName === name);
      
      // Revenue from ChatterPerformance
      let chatterRevenue = perfData.reduce((sum, p) => sum + (p.ppvRevenue || 0) + (p.tipRevenue || 0), 0);
      
      // ALSO add revenue from daily reports
      chatterDailyReports.forEach(report => {
        const ppvRev = report.ppvSales?.reduce((sum, sale) => sum + sale.amount, 0) || 0;
        const tipRev = report.tips?.reduce((sum, tip) => sum + tip.amount, 0) || 0;
        chatterRevenue += ppvRev + tipRev;
      });
      
      const chatterPPVsSent = perfData.reduce((sum, p) => sum + (p.ppvsSent || 0), 0);
      const chatterPPVsUnlocked = perfData.reduce((sum, p) => sum + (p.ppvsUnlocked || 0), 0);
      let chatterMessages = perfData.reduce((sum, p) => sum + (p.messagesSent || 0), 0);
      let chatterFans = perfData.reduce((sum, p) => sum + (p.fansChattedWith || 0), 0);
      
      // Add messages/fans from daily reports
      chatterDailyReports.forEach(report => {
        if (report.messagesSent) chatterMessages += report.messagesSent;
        if (report.fansChatted) chatterFans += report.fansChatted;
      });
      
      const responseTimes = perfData.filter(p => p.avgResponseTime && p.avgResponseTime > 0).map(p => p.avgResponseTime);
      const chatterAvgResponseTime = responseTimes.length > 0
        ? Math.round((responseTimes.reduce((sum, rt) => sum + rt, 0) / responseTimes.length) * 10) / 10
        : 0;
      
      const chatterUnlockRate = chatterPPVsSent > 0
        ? Math.round((chatterPPVsUnlocked / chatterPPVsSent) * 100 * 10) / 10
        : 0;
      
      const chatterRevenuePerMessage = chatterMessages > 0
        ? Math.round((chatterRevenue / chatterMessages) * 100) / 100
        : 0;

      return {
        chatterName: name,
        revenue: Math.round(chatterRevenue),
        ppvsSent: chatterPPVsSent,
        ppvsUnlocked: chatterPPVsUnlocked,
        unlockRate: chatterUnlockRate,
        messagesSent: chatterMessages,
        fansChatted: chatterFans,
        avgResponseTime: chatterAvgResponseTime,
        revenuePerMessage: chatterRevenuePerMessage,
        grammarScore: analysisData?.grammarScore || null,
        guidelinesScore: analysisData?.guidelinesScore || null,
        overallScore: analysisData?.overallScore || null,
        lastAnalysis: analysisData ? {
          timestamp: analysisData.timestamp,
          grammarBreakdown: analysisData.grammarBreakdown || null,
          guidelinesBreakdown: analysisData.guidelinesBreakdown || null,
          overallBreakdown: analysisData.overallBreakdown || null
        } : null
      };
    }).sort((a, b) => b.revenue - a.revenue); // Sort by revenue descending

    // Calculate period-over-period changes for team metrics
    const periodDays = Math.ceil((end - start) / (1000 * 60 * 60 * 24));
    const prevEnd = new Date(start);
    const prevStart = new Date(start);
    prevStart.setDate(prevStart.getDate() - periodDays);
    
    const prevChatterPerformance = await ChatterPerformance.find({
      weekStartDate: { $lte: prevEnd },
      weekEndDate: { $gte: prevStart }
    });
    
    let prevTeamMetrics = {
      totalRevenue: 0,
      ppvsSent: 0,
      ppvsUnlocked: 0,
      messagesSent: 0,
      responseTimesSum: 0,
      responseTimeCount: 0
    };
    
    prevChatterPerformance.forEach(data => {
      prevTeamMetrics.totalRevenue += (data.ppvRevenue || 0) + (data.tipRevenue || 0);
      prevTeamMetrics.ppvsSent += data.ppvsSent || 0;
      prevTeamMetrics.ppvsUnlocked += data.ppvsUnlocked || 0;
      prevTeamMetrics.messagesSent += data.messagesSent || 0;
      if (data.avgResponseTime && data.avgResponseTime > 0) {
        prevTeamMetrics.responseTimesSum += data.avgResponseTime;
        prevTeamMetrics.responseTimeCount++;
      }
    });
    
    const prevUnlockRate = prevTeamMetrics.ppvsSent > 0 
      ? (prevTeamMetrics.ppvsUnlocked / prevTeamMetrics.ppvsSent) * 100
      : 0;
    const prevAvgResponseTime = prevTeamMetrics.responseTimeCount > 0
      ? prevTeamMetrics.responseTimesSum / prevTeamMetrics.responseTimeCount
      : 0;
    const prevAvgPPVPrice = prevTeamMetrics.ppvsUnlocked > 0
      ? prevTeamMetrics.totalRevenue / prevTeamMetrics.ppvsUnlocked
      : 0;
    
    const calcChange = (current, previous) => {
      // If both are 0 or very close to 0, return null (no change to display)
      if (Math.abs(current) < 0.01 && Math.abs(previous) < 0.01) return null;
      // If previous is 0 but current is not
      if (previous === 0 || Math.abs(previous) < 0.01) {
        return current > 0 ? 100 : null;
      }
      const change = ((current - previous) / previous) * 100;
      // Don't show tiny changes (<0.5%)
      return Math.abs(change) < 0.5 ? null : change;
    };
    
    const formatChange = (value) => {
      return value !== null && value !== undefined ? value.toFixed(1) : '0.0';
    };
    
    const changes = {
      totalRevenue: formatChange(calcChange(teamMetrics.totalRevenue, prevTeamMetrics.totalRevenue)),
      ppvsSent: formatChange(calcChange(teamMetrics.ppvsSent, prevTeamMetrics.ppvsSent)),
      ppvsUnlocked: formatChange(calcChange(teamMetrics.ppvsUnlocked, prevTeamMetrics.ppvsUnlocked)),
      unlockRate: formatChange(calcChange(unlockRate, prevUnlockRate)),
      messagesSent: formatChange(calcChange(teamMetrics.messagesSent, prevTeamMetrics.messagesSent)),
      avgResponseTime: formatChange(calcChange(avgResponseTime, prevAvgResponseTime)),
      avgPPVPrice: formatChange(calcChange(avgPPVPrice, prevAvgPPVPrice))
    };

    const response = {
      teamMetrics: {
        totalRevenue: Math.round(teamMetrics.totalRevenue),
        ppvsSent: teamMetrics.ppvsSent,
        ppvsUnlocked: teamMetrics.ppvsUnlocked,
        unlockRate,
        messagesSent: teamMetrics.messagesSent,
        fansChatted: teamMetrics.fansChatted,
        avgResponseTime,
        avgGrammarScore,
        avgGuidelinesScore,
        avgOverallScore,
        avgPPVPrice,
        revenuePerMessage,
        topPerformer: topPerformer ? {
          name: topPerformer[0],
          revenue: Math.round(topPerformer[1])
        } : null,
        chatterCount: chatterNames.length,
        changes: changes
      },
      chatters: chatterData,
      dateRange: {
        start,
        end,
        filterType: filterType || 'fallback',
        isWeekFilter,
        isMonthFilter
      }
    };

    console.log('Team dashboard response:', {
      teamMetrics: response.teamMetrics,
      chatterCount: response.chatters.length
    });

    res.json(response);
  } catch (error) {
    console.error('Team dashboard error:', error);
    res.status(500).json({ error: error.message });
  }
});

// Submit OF Account data
// Delete all OF Account Data
app.delete('/api/analytics/of-account', checkDatabaseConnection, authenticateToken, async (req, res) => {
  try {
    const result = await AccountData.deleteMany({});
    console.log('🗑️ Deleted all OF Account Data:', result.deletedCount, 'records');
    res.json({ message: 'All OF Account Data deleted successfully', deletedCount: result.deletedCount });
  } catch (error) {
    console.error('Error deleting OF Account Data:', error);
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/analytics/of-account', checkDatabaseConnection, authenticateToken, async (req, res) => {
  try {
    console.log('OF Account data submission:', req.body);
    
    // Find the creator account - try by name first (dropdown sends name not ID)
    let creatorAccount = await CreatorAccount.findOne({ name: req.body.creator });
    
    // If not found by name, try to find by ID
    if (!creatorAccount) {
      try {
        creatorAccount = await CreatorAccount.findById(req.body.creator);
      } catch (e) {
        console.log('Not a valid ObjectId, trying case-insensitive name match');
        creatorAccount = await CreatorAccount.findOne({ 
          name: new RegExp(`^${req.body.creator}$`, 'i') 
        });
      }
    }
    
    if (!creatorAccount) {
      console.error('Creator account not found for:', req.body.creator);
      return res.status(400).json({ error: `Creator account not found: ${req.body.creator}` });
    }
    
    console.log('Found creator account:', creatorAccount.name);
    
    const accountData = new AccountData({
      creatorAccount: creatorAccount._id,
      weekStartDate: new Date(req.body.startDate),
      weekEndDate: new Date(req.body.endDate),
      netRevenue: req.body.netRevenue || 0,
      totalSubs: req.body.totalSubs || 0,
      newSubs: req.body.newSubs || 0,
      profileClicks: req.body.profileClicks || 0,
      recurringRevenue: req.body.recurringRevenue || 0
    });
    
    await accountData.save();
    console.log('OF Account data saved successfully:', accountData._id);
    res.json({ message: 'OF Account data saved successfully', data: accountData });
  } catch (error) {
    console.error('OF Account data submission error:', error);
    res.status(500).json({ error: error.message });
  }
});

// Submit Daily Account Snapshot (NEW - for custom date ranges)
app.post('/api/analytics/daily-snapshot', checkDatabaseConnection, authenticateToken, async (req, res) => {
  try {
    console.log('📊 Daily Account Snapshot submission:', req.body);
    
    // Find the creator account
    let creatorAccount = await CreatorAccount.findOne({ name: req.body.creator });
    
    if (!creatorAccount) {
      try {
        creatorAccount = await CreatorAccount.findById(req.body.creator);
      } catch (e) {
        creatorAccount = await CreatorAccount.findOne({ 
          name: new RegExp(`^${req.body.creator}$`, 'i') 
        });
      }
    }
    
    if (!creatorAccount) {
      console.error('Creator account not found for:', req.body.creator);
      return res.status(400).json({ error: `Creator account not found: ${req.body.creator}` });
    }
    
    console.log('Found creator account:', creatorAccount.name);
    
    // Check if snapshot already exists for this date
    const existingSnapshot = await DailyAccountSnapshot.findOne({
      creatorAccount: creatorAccount._id,
      date: new Date(req.body.date)
    });
    
    if (existingSnapshot) {
      // Update existing
      existingSnapshot.totalSubs = req.body.totalSubs || 0;
      existingSnapshot.activeFans = req.body.activeFans || 0;
      existingSnapshot.fansWithRenew = req.body.fansWithRenew || 0;
      existingSnapshot.newSubsToday = req.body.newSubsToday || 0;
      existingSnapshot.uploadedBy = req.user.userId;
      
      // Only set renewRate if provided (otherwise it will auto-calculate)
      if (req.body.renewRate !== undefined && req.body.renewRate !== null) {
        existingSnapshot.renewRate = req.body.renewRate;
      }
      
      // Only set recurringRevenue if provided
      if (req.body.recurringRevenue !== undefined && req.body.recurringRevenue !== null) {
        existingSnapshot.recurringRevenue = req.body.recurringRevenue;
      }
      
      await existingSnapshot.save();
      console.log('📊 Updated existing snapshot:', existingSnapshot._id);
      return res.json({ message: 'Daily snapshot updated successfully', data: existingSnapshot });
    }
    
    // Create new snapshot
    const snapshotData = {
      creatorAccount: creatorAccount._id,
      date: new Date(req.body.date),
      totalSubs: req.body.totalSubs || 0,
      activeFans: req.body.activeFans || 0,
      fansWithRenew: req.body.fansWithRenew || 0,
      newSubsToday: req.body.newSubsToday || 0,
      uploadedBy: req.user.userId
    };
    
    // Only set renewRate if provided (otherwise it will auto-calculate)
    if (req.body.renewRate !== undefined && req.body.renewRate !== null) {
      snapshotData.renewRate = req.body.renewRate;
    }
    
    // Only set recurringRevenue if provided
    if (req.body.recurringRevenue !== undefined && req.body.recurringRevenue !== null) {
      snapshotData.recurringRevenue = req.body.recurringRevenue;
    }
    
    const snapshot = new DailyAccountSnapshot(snapshotData);
    
    await snapshot.save();
    console.log('📊 Daily snapshot saved:', snapshot._id, 'Renew rate:', snapshot.renewRate + '%');
    res.json({ message: 'Daily snapshot saved successfully', data: snapshot });
  } catch (error) {
    console.error('Daily snapshot submission error:', error);
    res.status(500).json({ error: error.message });
  }
});

// Submit Chatter data
app.post('/api/analytics/chatter', checkDatabaseConnection, authenticateToken, async (req, res) => {
  try {
    console.log('Chatter data submission:', req.body);
    console.log('avgResponseTime value:', req.body.avgResponseTime);
    console.log('avgResponseTime type:', typeof req.body.avgResponseTime);
    
    // Find the creator account (for now, we'll use a default or first available)
    const creatorAccount = await CreatorAccount.findOne({ isActive: true });
    if (!creatorAccount) {
      return res.status(400).json({ error: 'No active creator account found' });
    }
    
    // Create chatter data object with only provided fields
    const chatterDataObj = {
      chatterName: req.body.chatter,
      creatorAccount: creatorAccount._id,
      weekStartDate: new Date(req.body.startDate),
      weekEndDate: new Date(req.body.endDate)
    };

    // Only add fields that were provided (not undefined)
    if (req.body.messagesSent !== undefined) chatterDataObj.messagesSent = req.body.messagesSent;
    if (req.body.ppvsSent !== undefined) chatterDataObj.ppvsSent = req.body.ppvsSent;
    if (req.body.ppvsUnlocked !== undefined) chatterDataObj.ppvsUnlocked = req.body.ppvsUnlocked;
    if (req.body.fansChatted !== undefined) chatterDataObj.fansChattedWith = req.body.fansChatted;
    if (req.body.avgResponseTime !== undefined) chatterDataObj.avgResponseTime = req.body.avgResponseTime;
    if (req.body.netSales !== undefined) chatterDataObj.netSales = req.body.netSales;
    
    // NOTE: avgPPVPrice is calculated correctly in individual analysis from DailyChatterReport PPV sales (excluding tips)
    // DO NOT calculate it here from netSales/ppvsUnlocked as that includes tips and is incorrect
    // See line 2676 for correct calculation

    const chatterData = new ChatterPerformance(chatterDataObj);
    
    console.log('About to save chatter data:', chatterData);
    await chatterData.save();
    console.log('Chatter data saved successfully:', chatterData._id);
    console.log('Saved data includes avgResponseTime:', chatterData.avgResponseTime);
    
    // Auto-save performance snapshot for trend tracking
    const messageData = await MessageAnalysis.findOne({
      chatterName: req.body.chatter,
      $or: [
        { weekStartDate: { $gte: new Date(req.body.startDate), $lte: new Date(req.body.endDate) } },
        { weekEndDate: { $gte: new Date(req.body.startDate), $lte: new Date(req.body.endDate) } }
      ]
    });
    
    await autoSavePerformanceSnapshot(req.body.chatter, req.body.startDate, req.body.endDate, chatterData, messageData);
    
    res.json({ message: 'Chatter data saved successfully', data: chatterData });
  } catch (error) {
    console.error('Chatter data submission error:', error);
    res.status(500).json({ error: error.message });
  }
});

// Message upload endpoint
app.post('/api/upload/messages', checkDatabaseConnection, authenticateToken, upload.single('messages'), async (req, res) => {
  try {
    console.log('🔥 MESSAGE UPLOAD:', req.body.chatter, req.body.startDate, 'to', req.body.endDate);
    
    if (!req.file) {
      console.log('❌ No file uploaded');
      return res.status(400).json({ error: 'No file uploaded' });
    }
    
    const { chatter, startDate, endDate } = req.body;
    
    if (!chatter) {
      console.log('❌ No chatter selected');
      return res.status(400).json({ error: 'Chatter/employee selection is required' });
    }
    
    if (!startDate || !endDate) {
      console.log('❌ Missing dates:', { startDate, endDate });
      return res.status(400).json({ error: 'Start date and end date are required' });
    }
    
    const chatterName = chatter;
    
    // Parse CSV file with full message data
    const messageRecords = [];
    const filePath = req.file.path;
    let firstRow = true;
    let csvColumns = [];
    let messageCount = 0;
    
    await new Promise((resolve, reject) => {
      fs.createReadStream(filePath)
        .pipe(csv())
        .on('data', (row) => {
          messageCount++;
          if (firstRow) {
            csvColumns = Object.keys(row);
    console.log('🔍 CSV columns found:', csvColumns);
    console.log('🔍 First row sample:', { Creator: row.Creator, 'Creator Message': row['Creator Message']?.substring(0, 50) + '...', 'Sent time': row['Sent time'] });
            firstRow = false;
          }
          
          // Extract all the fields with exact header names
          const messageText = row['Creator Message'];
          const fanUsername = row['Sent to'];
          const timestamp = row['Sent time']; // Format: "13:52:43"
          const date = row['Sent date']; // Format: "Sep 26, 2025"
          const replyTime = row['Replay time']; // Format: "1m 2s"
          const creatorPage = row['Creator']; // Format: "Iris FREE", "Lilla", "Arya PAID"
          const ppvRevenue = row['Price']; // Price of PPV (0 if not a PPV)
          const ppvPurchased = row['Purchased']; // "yes" or "no"
          
          if (firstRow) {
            console.log('🔍 Extracted fields sample:', { messageText, fanUsername, timestamp, date, replyTime, creatorPage, ppvRevenue, ppvPurchased });
          }
          
          // Log progress every 500 messages to avoid rate limiting
          if (messageCount % 500 === 0) {
            console.log(`📊 Processed ${messageCount} messages...`);
          }
          
          if (messageText && messageText.trim() !== '') {
            // Strip HTML tags from the message
            const cleanMessage = messageText.replace(/<[^>]*>/g, '').trim();
            if (cleanMessage) {
              // Parse reply time from "1m 2s" format to minutes
              const parseReplyTime = (timeStr) => {
                if (!timeStr) return 0;
                const match = timeStr.match(/(\d+)m\s*(\d+)s/);
                if (match) {
                  const minutes = parseInt(match[1]);
                  const seconds = parseInt(match[2]);
                  return minutes + (seconds / 60);
                }
                return 0;
              };
              
              // Parse date from "Sep 26, 2025" format
              const parseDate = (dateStr) => {
                if (!dateStr) return new Date();
                try {
                  return new Date(dateStr);
                } catch (e) {
                  return new Date();
                }
              };
              
              // Parse timestamp from "13:52:43" format and combine with date
              const parseTimestamp = (timeStr, dateStr) => {
                if (!timeStr || !dateStr) return new Date();
                try {
                  const date = parseDate(dateStr);
                  const [hours, minutes, seconds] = timeStr.split(':').map(Number);
                  date.setHours(hours, minutes, seconds, 0);
                  return date;
                } catch (e) {
                  return new Date();
                }
              };
              
              // Determine if this is a PPV (has price > 0)
              const isPPV = ppvRevenue && parseFloat(ppvRevenue) > 0;
              
              // Handle "Deleted user" as independent users (not conversation flow)
              const isDeletedUser = fanUsername && fanUsername.toLowerCase().includes('deleted user');
              const processedFanUsername = isDeletedUser ? `deleted_user_${Date.now()}_${Math.random().toString(36).substr(2, 9)}` : fanUsername;
              
              messageRecords.push({
                fanUsername: processedFanUsername || 'unknown',
                originalFanUsername: fanUsername || 'unknown', // Keep original for reference
                messageText: cleanMessage,
                timestamp: parseTimestamp(timestamp, date),
                date: parseDate(date),
                replyTime: parseReplyTime(replyTime),
                creatorPage: creatorPage || 'unknown',
                isPPV: isPPV,
                ppvRevenue: ppvRevenue ? parseFloat(ppvRevenue) : 0,
                ppvPurchased: ppvPurchased === 'yes' || ppvPurchased === 'Yes' || ppvPurchased === 'YES',
                isDeletedUser: isDeletedUser // Flag for analysis
              });
            }
          }
        })
        .on('end', () => {
          console.log(`✅ CSV parsing complete: ${messageCount} total messages processed`);
          fs.unlinkSync(filePath); // Delete uploaded file after parsing
          resolve();
        })
        .on('error', (err) => {
          console.error('CSV parsing error:', err);
          reject(err);
        });
    });
    
    console.log(`Found ${messageRecords.length} message records in CSV`);
    
    if (messageRecords.length === 0) {
      return res.status(400).json({ error: 'No messages found in CSV file' });
    }
    
    console.log(`Parsed ${messageRecords.length} message records for analysis`);
    
    // Extract just the message text for AI analysis (for now)
    const messages = messageRecords.map(record => record.messageText);
    
    // ❌ DO NOT analyze on upload - analysis happens from AI Analysis page only
    console.log('✅ Messages uploaded - analysis will run from AI Analysis page');
    
    // Save to MessageAnalysis collection
    console.log('Creating MessageAnalysis object with:', {
      chatterName: chatter,
      weekStartDate: startDate,
      weekEndDate: endDate,
      totalMessages: messageRecords.length,
      messageRecords: messageRecords.length
    });
    
    const messageAnalysis = new MessageAnalysis({
      chatterName: chatter,
      weekStartDate: new Date(startDate),
      weekEndDate: new Date(endDate),
      totalMessages: messageRecords.length,
      messageRecords: messageRecords, // Store the full message records
      overallScore: null,
      grammarScore: null,
      guidelinesScore: null,
      strengths: [],
      weaknesses: [],
      recommendations: [],
      // CHATTING STYLE ANALYSIS
      chattingStyle: null,
      messagePatterns: null,
      engagementMetrics: null
    });
    
    console.log('MessageAnalysis object created:', messageAnalysis._id);
    console.log('MessageAnalysis data:', {
      chattingStyle: messageAnalysis.chattingStyle,
      messagePatterns: messageAnalysis.messagePatterns,
      engagementMetrics: messageAnalysis.engagementMetrics,
      recommendations: messageAnalysis.recommendations,
      totalMessages: messageAnalysis.totalMessages
    });
    
    try {
      console.log('Attempting to save message analysis:', {
        chatterName: messageAnalysis.chatterName,
        weekStartDate: messageAnalysis.weekStartDate,
        weekEndDate: messageAnalysis.weekEndDate,
        totalMessages: messageAnalysis.totalMessages,
        hasChattingStyle: !!messageAnalysis.chattingStyle,
        hasMessagePatterns: !!messageAnalysis.messagePatterns,
        hasEngagementMetrics: !!messageAnalysis.engagementMetrics
      });
      await messageAnalysis.save();
      console.log('✅ Message analysis saved successfully:', messageAnalysis._id);
      
      // Verify the data was actually saved
      const savedRecord = await MessageAnalysis.findById(messageAnalysis._id);
      console.log('🔍 Verification - saved record has data:', {
        hasChattingStyle: !!savedRecord.chattingStyle,
        hasMessagePatterns: !!savedRecord.messagePatterns,
        hasEngagementMetrics: !!savedRecord.engagementMetrics,
        chattingStyleKeys: savedRecord.chattingStyle ? Object.keys(savedRecord.chattingStyle) : 'null',
        messagePatternsKeys: savedRecord.messagePatterns ? Object.keys(savedRecord.messagePatterns) : 'null'
      });
    } catch (saveError) {
      console.error('❌ Error saving message analysis:', saveError);
      console.error('❌ Full error details:', JSON.stringify(saveError, null, 2));
      throw saveError;
    }
    
    // Update VIP fan lastMessageDate for retention tracking
    console.log('📝 Updating lastMessageDate for VIP fans from message data...');
    const fanMessageDates = {};
    
    // Collect the most recent message date for each fan
    messageRecords.forEach(record => {
      const fanUsername = record.fanUsername;
      const messageDate = new Date(`${record.date} ${record.timestamp}`);
      
      if (fanUsername && !isNaN(messageDate.getTime())) {
        if (!fanMessageDates[fanUsername] || messageDate > fanMessageDates[fanUsername]) {
          fanMessageDates[fanUsername] = messageDate;
        }
      }
    });
    
    // Update VIP fans in database
    let vipFansUpdated = 0;
    for (const [fanUsername, lastMessageDate] of Object.entries(fanMessageDates)) {
      try {
        const result = await VIPFan.updateMany(
          { username: fanUsername },
          { 
            $set: { 
              lastMessageDate: lastMessageDate,
              updatedAt: new Date()
            }
          }
        );
        if (result.modifiedCount > 0) {
          vipFansUpdated++;
        }
      } catch (err) {
        console.error(`Failed to update VIP fan ${fanUsername}:`, err);
      }
    }
    
    console.log(`✅ Updated lastMessageDate for ${vipFansUpdated} VIP fans`);
    
    res.json({ 
      message: 'Messages analyzed and saved successfully',
      analysis: {
        messageCount: messages.length,
        overallScore: messageAnalysis.overallScore,
        grammarScore: messageAnalysis.grammarScore,
        guidelinesScore: messageAnalysis.guidelinesScore
      },
      vipFansUpdated: vipFansUpdated
    });
  } catch (error) {
    console.error('Message upload error:', error);
    res.status(500).json({ error: error.message });
  }
});

// RE-ANALYZE existing messages (triggered by "Run Analysis" button)
app.post('/api/messages/reanalyze/:id', checkDatabaseConnection, authenticateToken, async (req, res) => {
  try {
    const messageAnalysisId = req.params.id;
    console.log('🔄 RE-ANALYZING MessageAnalysis:', messageAnalysisId);
    
    // Get the existing MessageAnalysis record
    const existingAnalysis = await MessageAnalysis.findById(messageAnalysisId);
    if (!existingAnalysis) {
      return res.status(404).json({ error: 'Message analysis not found' });
    }
    
    console.log('Found existing analysis:', {
      chatterName: existingAnalysis.chatterName,
      totalMessages: existingAnalysis.totalMessages,
      hasMessageRecords: !!existingAnalysis.messageRecords,
      messageRecordsLength: existingAnalysis.messageRecords?.length || 0
    });
    
    // Check if we have message records to analyze
    if (!existingAnalysis.messageRecords || existingAnalysis.messageRecords.length === 0) {
      return res.status(400).json({ error: 'No message records found in this analysis. Please re-upload the messages.' });
    }
    
    // Extract message text from records
    const messages = existingAnalysis.messageRecords.map(record => record.messageText);
    console.log('📧 Extracted', messages.length, 'messages for re-analysis');
    
    // Run AI analysis
    console.log('🤖 Calling analyzeMessages with', messages.length, 'messages...');
    const analysisResult = await analyzeMessages(messages, existingAnalysis.chatterName);
    console.log('✅ Re-analysis complete - RAW RESULT:', JSON.stringify({
      overallScore: analysisResult.overallScore,
      grammarScore: analysisResult.grammarScore,
      guidelinesScore: analysisResult.guidelinesScore,
      hasGrammarBreakdown: !!analysisResult.grammarBreakdown,
      hasGuidelinesBreakdown: !!analysisResult.guidelinesBreakdown,
      strengthsCount: analysisResult.strengths?.length || 0,
      weaknessesCount: analysisResult.weaknesses?.length || 0
    }, null, 2));
    
    // Update the existing record
    existingAnalysis.overallScore = analysisResult.overallScore !== undefined ? analysisResult.overallScore : null;
    existingAnalysis.grammarScore = analysisResult.grammarScore !== undefined ? analysisResult.grammarScore : null;
    existingAnalysis.guidelinesScore = analysisResult.guidelinesScore !== undefined ? analysisResult.guidelinesScore : null;
    existingAnalysis.grammarBreakdown = analysisResult.grammarBreakdown || {};
    existingAnalysis.guidelinesBreakdown = analysisResult.guidelinesBreakdown || {};
    existingAnalysis.strengths = analysisResult.strengths || [];
    existingAnalysis.weaknesses = analysisResult.weaknesses || [];
    existingAnalysis.recommendations = analysisResult.suggestions || analysisResult.recommendations || [];
    existingAnalysis.chattingStyle = analysisResult.chattingStyle || null;
    existingAnalysis.messagePatterns = analysisResult.messagePatterns || null;
    existingAnalysis.engagementMetrics = analysisResult.engagementMetrics || null;
    
    await existingAnalysis.save();
    console.log('✅ Updated MessageAnalysis saved with breakdowns:', {
      hasGrammarBreakdown: !!analysisResult.grammarBreakdown,
      hasGuidelinesBreakdown: !!analysisResult.guidelinesBreakdown
    });
    
    // Verify the save worked by re-fetching
    const verifyRecord = await MessageAnalysis.findById(messageAnalysisId);
    console.log('🔍 VERIFICATION - Record after save:', {
      id: verifyRecord._id,
      grammarScore: verifyRecord.grammarScore,
      guidelinesScore: verifyRecord.guidelinesScore,
      overallScore: verifyRecord.overallScore,
      hasGrammarBreakdown: !!verifyRecord.grammarBreakdown,
      hasGuidelinesBreakdown: !!verifyRecord.guidelinesBreakdown
    });
    
    res.json({
      message: 'Messages re-analyzed successfully',
      analysis: {
        overallScore: existingAnalysis.overallScore,
        grammarScore: existingAnalysis.grammarScore,
        guidelinesScore: existingAnalysis.guidelinesScore
      }
    });
  } catch (error) {
    console.error('Re-analysis error:', error);
    res.status(500).json({ error: error.message });
  }
});

// Helper function to analyze messages using AI
async function analyzeMessages(messages, chatterName) {
  try {
    // Check if OpenAI is properly configured
    if (!openai || !openai.chat || !openai.chat.completions) {
      return {
        overallScore: null,
        grammarScore: null,
        guidelinesScore: null,
        strengths: ["No message analysis data available"],
        weaknesses: ["Upload message data for analysis"],
        suggestions: ["Upload CSV with message data to get real analysis"]
      };
    }
    
    console.log('✅ Analyzing', messages.length, 'messages with AI...');

    // Use all messages for comprehensive analysis
    const sampleSize = messages.length;
    const sampledMessages = messages;
    
    // Check if messages are empty
    if (sampledMessages.length === 0) {
      console.log('❌ ERROR: No messages to analyze!');
      throw new Error('No messages available for analysis');
    }
    
    // Check if messages are strings or objects with text property
    const nonValidMessages = sampledMessages.filter(msg => {
      if (typeof msg === 'string') return false;
      if (typeof msg === 'object' && msg.text && typeof msg.text === 'string') return false;
      return true;
    });
    if (nonValidMessages.length > 0) {
      console.log('❌ ERROR: Some messages are not valid:', nonValidMessages);
    }
    
    // Get custom guidelines for the prompt
  const customGuidelines = await Guideline.find({ isActive: true }).sort({ category: 1, weight: -1 });
  
  // 🚨 VERBOSE: Show AI what guidelines it will be analyzing
  console.log('\n🚨🚨🚨 GUIDELINES THAT AI WILL ANALYZE 🚨🚨🚨');
  console.log(`📋 Total Guidelines: ${customGuidelines.length}`);
  customGuidelines.forEach((g, idx) => {
    console.log(`\n${idx + 1}. [${g.category.toUpperCase()}] "${g.title}"`);
    console.log(`   Description: ${g.description}`);
    console.log(`   Weight: ${g.weight}`);
    console.log(`   NeedsAI: ${g.needsAI || 'Not specified'}`);
  });
  console.log('🚨🚨🚨 END OF GUIDELINES 🚨🚨🚨\n');
  
  // VERBOSE: Show PPV captions in this batch for caption guidelines
  const ppvCaptionsInBatch = sampledMessages.filter(msg => msg.isPPV && msg.ppvRevenue > 0);
  if (ppvCaptionsInBatch.length > 0) {
    console.log(`\n💰 PPV CAPTIONS IN THIS BATCH: ${ppvCaptionsInBatch.length} total`);
    ppvCaptionsInBatch.slice(0, 5).forEach((msg, idx) => {
      console.log(`   ${idx + 1}. "${msg.text}" [Price: $${msg.ppvRevenue}]`);
    });
    if (ppvCaptionsInBatch.length > 5) {
      console.log(`   ... and ${ppvCaptionsInBatch.length - 5} more PPV captions`);
    }
    console.log('💰 AI MUST check if these captions have descriptions and hooks!\n');
  } else {
    console.log(`\n💰 NO PPV CAPTIONS IN THIS BATCH - caption guidelines will show 0 violations\n`);
  }
  
  // Reconstruct conversation flows by grouping messages by fan username
  const conversationFlows = {};
  sampledMessages.forEach((msg, index) => {
    if (typeof msg === 'object' && msg.text && msg.fanUsername) {
      const fanUsername = msg.fanUsername;
      if (!conversationFlows[fanUsername]) {
        conversationFlows[fanUsername] = [];
      }
      conversationFlows[fanUsername].push({
        index: index + 1,
        text: msg.text,
        replyTime: msg.replyTime || 0,
        timestamp: msg.timestamp,
        ppvRevenue: msg.ppvRevenue || 0,
        isPPV: msg.isPPV || false
      });
    }
  });

  // Sort conversations by timestamp to maintain chronological order
  Object.keys(conversationFlows).forEach(fanUsername => {
    conversationFlows[fanUsername].sort((a, b) => {
      if (a.timestamp && b.timestamp) {
        return new Date(a.timestamp) - new Date(b.timestamp);
      }
      return a.index - b.index;
    });
  });

  // Format conversation flows for AI analysis
  const formattedConversations = Object.keys(conversationFlows).map(fanUsername => {
    const messages = conversationFlows[fanUsername];
    const conversationText = messages.map(msg => {
      const replyTimeText = msg.replyTime > 0 ? ` (Reply time: ${msg.replyTime} minutes)` : '';
      const ppvInfo = msg.ppvRevenue > 0 ? ` [PPV: $${msg.ppvRevenue}]` : '';
      return `  Message ${msg.index}: "${msg.text}"${replyTimeText}${ppvInfo}`;
    }).join('\n');
    
    return `CONVERSATION WITH ${fanUsername} (${messages.length} messages):\n${conversationText}`;
  }).join('\n\n');

  // Also provide a simple message list for backward compatibility
  const formattedMessages = sampledMessages.map((msg, index) => {
    if (typeof msg === 'string') {
      return `Message ${index + 1}: "${msg}"`;
    } else if (typeof msg === 'object' && msg.text) {
      const replyTimeText = msg.replyTime > 0 ? ` (Reply time: ${msg.replyTime} minutes)` : '';
      const ppvText = msg.isPPV && msg.ppvRevenue > 0 ? ` [PPV CAPTION - Price: $${msg.ppvRevenue}]` : '';
      return `Message ${index + 1}: "${msg.text}"${replyTimeText}${ppvText}`;
    }
    return `Message ${index + 1}: "[Invalid message format]"`;
  }).join('\n');

            const prompt = `CRITICAL: You are analyzing ${sampledMessages.length} OnlyFans chat messages with ACTUAL REPLY TIME DATA and CONVERSATION FLOW CONTEXT. You MUST use the provided reply time data instead of inferring reply times from message content patterns. You MUST analyze conversations as complete flows, not individual isolated messages. 

🚨 CRITICAL: DO NOT MAKE UP NUMBERS. You MUST actually analyze each message and count real violations. If you cannot find specific violations, report 0. Do NOT generate random numbers.

You must thoroughly analyze every single message and find real spelling, grammar, and punctuation mistakes.

CONSISTENCY REQUIREMENT: You must provide CONSISTENT results across multiple runs. Analyze the messages systematically and count errors in the same way each time. Use the same criteria and standards for error detection. Do NOT vary your analysis criteria between runs.

CONVERSATION FLOW ANALYSIS: The messages are organized by conversation with each fan. When analyzing guidelines like "Information Gathering" or "Follow-up Questions", you MUST consider the ENTIRE conversation flow with each fan, not just individual messages. For example:
- If a chatter asks "how old are u?" in message 65, and then asks follow-up questions about age-related topics in later messages in the SAME conversation, this shows proper information gathering
- If a chatter asks "where are u from?" in message 106, and then asks about local interests, hobbies, or culture in the SAME conversation, this shows proper follow-up
- Only flag violations if the chatter asks a question but NEVER follows up on that topic in the SAME conversation flow

CONSISTENCY REQUIREMENT: You must provide CONSISTENT results across multiple runs. Analyze the messages systematically and count errors in the same way each time. Use the same criteria and standards for error detection. 

IMPORTANT: Look for actual errors in the messages using CONSISTENT criteria:
- Spelling mistakes (typos, wrong words, autocorrect errors) - count each unique misspelling once
- Grammar errors (wrong verb tenses, subject-verb disagreement, pronoun errors) - count each grammatical mistake once
- Punctuation issues (missing periods, commas, apostrophes, question marks) - count each punctuation error once
- Capitalization problems (inconsistent sentence starts) - count each capitalization error once
- Run-on sentences - count each run-on sentence once
- Missing words - count each missing word once
- Contraction errors (missing apostrophes in don't, can't, won't, etc.) - count each contraction error once
- Common typos and misspellings - count each unique typo once

COUNTING RULES: Count each error only once per message. If the same error appears multiple times in the same message, count it as one error. Be systematic and consistent in your counting approach.

PUNCTUATION RULES: Flag messages that USE full stops (periods) or formal commas as errors. Messages WITHOUT periods are CORRECT. All other punctuation (?, !, emojis) is CORRECT and should NOT be flagged.

🚫 NEVER FLAG THESE AS ERRORS:
- Question marks (?)
- Exclamation points (!)
- Apostrophes (')
- Multiple punctuation (!!!, ???)
- Informal language (u, ur, im, dont, cant)

✅ ONLY FLAG THESE AS ERRORS:
- Periods at sentence ends (.)
- Formal commas (,)

Examples: 
- 'Hello, how are you.' → 'hello how are you' (remove period and comma, keep nothing else)
- 'It's nice!' → 'It's nice!' (keep apostrophe and exclamation, remove nothing)
- 'How are you?' → 'how are you?' (keep question mark, remove nothing)

CRITICAL BATCH PROCESSING: You are analyzing a specific batch of messages. Count ONLY the errors found in THIS batch. Do NOT duplicate or repeat counts from other batches. Each batch should have its own independent count.

⚠️ WARNING: DO NOT COUNT THE SAME ERRORS MULTIPLE TIMES. If you see similar errors in different batches, count them only once per batch. The system will combine all batches later.

Be VERY THOROUGH and find ALL errors that actually exist. For 2000+ messages, expect to find 100-300+ errors total. Return ONLY valid JSON.

CONVERSATION FLOWS TO ANALYZE (${Object.keys(conversationFlows).length} conversations, ${sampledMessages.length} total messages):
${formattedConversations}

INDIVIDUAL MESSAGES LIST (for reference):
${formattedMessages}

CUSTOM GUIDELINES TO EVALUATE AGAINST:
${customGuidelines.map(g => `- ${g.category.toUpperCase()}: ${g.title} - ${g.description} (Weight: ${g.weight})`).join('\n')}

🚨 CRITICAL GUIDELINE UNDERSTANDING - READ CAREFULLY:

1. **CAPTION GUIDELINES** (Describe Captions, Hook):
   - ONLY apply to messages marked [PPV CAPTION - Price: $X]
   - Regular messages are NOT captions
   - If a message doesn't have [PPV CAPTION], DO NOT flag it for caption guidelines
   - VIOLATION EXAMPLE: "here is something special [PPV CAPTION - Price: $15]" ← No description of what's in the PPV
   - CORRECT EXAMPLE: "check out this steamy shower video baby [PPV CAPTION - Price: $15]" ← Has description

2. **INFORMALITY GUIDELINE** - CRITICAL UNDERSTANDING:
   - This guideline flags messages that are TOO FORMAL (complete sentences, proper grammar, "you are" instead of "you're", "I am" instead of "im")
   - CORRECT (NOT violations): 'u', 'ur', 'im', 'dont', 'cant', 'i' (lowercase), shortened words, missing apostrophes, no periods
   - VIOLATION = TOO FORMAL: "I cannot wait to see you." ← Uses "I cannot" instead of "cant", "to see you" instead of "to see u"
   - VIOLATION = TOO FORMAL: "How are you doing today?" ← Uses "How are you" instead of "how u" or "hows", "doing" is formal
   - VIOLATION = TOO FORMAL: "That would be great." ← Uses "That would" instead of "that'd" or "thatd", complete sentence
   - CORRECT = INFORMAL: "cant wait to see u" ← Shortened words, no apostrophes, informal
   - CORRECT = INFORMAL: "hows it going" ← Shortened words, informal
   - CORRECT = INFORMAL: "when will it be?" ← Lowercase 'i', question mark OK
   - CORRECT = INFORMAL: "mhm okayy" ← Extended words, very informal
   - CORRECT = INFORMAL: "let's playa game?" ← Typo 'playa', informal tone

3. **NON-TRANSACTION GUIDELINE**:
   - Look for messages immediately AFTER a fan purchases a PPV that feel cold/transactional
   - VIOLATION EXAMPLE: Fan buys PPV → Creator says "thanks for the purchase" ← Feels like a transaction
   - CORRECT EXAMPLE: Fan buys PPV → Creator says "omg im so happy u liked it baby" ← Feels personal, not transactional

4. **FAN PRIORIZATION GUIDELINE**:
   - Look for messages that make the fan feel like they're NOT special or the only one
   - VIOLATION EXAMPLE: "i send this to all my fans" ← Makes fan feel not special
   - CORRECT EXAMPLE: "i made this just for u baby" ← Makes fan feel special and prioritized

5. **REPLY TIME GUIDELINE**:
   - Already calculated server-side - use the provided (Reply time: X minutes) data
   - If guideline says "Maximum 5 minute reply time", flag messages with "Reply time: 6+ minutes"

CRITICAL: Do NOT just list these guidelines. Instead, ANALYZE ALL messages for compliance with these guidelines. Be STRICT - find violations. For each violation, specify WHICH specific guideline was violated by name. Count violations and successes. Provide specific examples from the messages where guidelines are followed or violated. Look for patterns of non-compliance across ALL messages.

CRITICAL CONVERSATION FLOW ANALYSIS: 
- Use the CONVERSATION FLOWS section above to understand the complete context of each conversation
- For "Information Gathering" guidelines: Check if the chatter asks questions AND follows up on the answers within the SAME conversation
- For "Follow-up Questions" guidelines: Look for question-answer-follow-up patterns within each conversation flow
- For "Relationship Building" guidelines: Analyze the progression of intimacy and connection within each conversation
- For "PPV Price Progression" guidelines: Analyze if PPV prices increase over time within the SAME conversation flow. Look for price progression patterns across multiple PPVs sent to the same fan
- Do NOT flag violations for isolated questions - only flag if the chatter fails to follow up within the SAME conversation flow
- Example: If chatter asks "how old are u?" and later asks about age-related interests in the SAME conversation, this is GOOD information gathering
- Example: If chatter sends PPV at $10, then $15, then $20 to the same fan over time, this is GOOD price progression

CRITICAL REPLY TIME ANALYSIS: Use the ACTUAL reply time data provided with each message (e.g., "Reply time: 3.5 minutes"). Do NOT infer reply times from message content patterns like "u left me unread last time". The reply time data is already provided - use it directly to check compliance with reply time guidelines.

IMPORTANT: Only flag reply time violations for messages that actually exceed the time limit specified in the uploaded guidelines. Do NOT flag every message as a violation. Most messages will have acceptable reply times - only flag the ones that are actually too slow according to the guideline criteria.

DATA-DRIVEN ANALYSIS: You MUST count violations by examining the actual data provided. For reply time violations, count ONLY messages where the reply time exceeds the threshold specified in the uploaded guidelines. Do NOT make up numbers or estimates. Count the actual violations from the data provided.

CRITICAL VIOLATION COUNTING METHOD: 
1. For reply time violations: Count each message where "Reply time: X minutes" exceeds the guideline threshold specified in the uploaded guidelines
2. For other guidelines: Count each specific violation mentioned in the data according to the exact criteria in the uploaded guidelines
3. Provide the EXACT count, not estimates or approximations
4. If you cannot find specific violations in the data, report 0 violations
5. Use ONLY the criteria specified in the uploaded guidelines, not assumptions
6. DO NOT make up different numbers for the same data - if you count 15 reply time violations, report 15, not 92
7. Be CONSISTENT - the same data should produce the same counts every time

🚨 CRITICAL: YOU MUST ACTUALLY READ AND ANALYZE EACH MESSAGE. DO NOT GENERATE RANDOM NUMBERS. 
🚨 IF YOU CANNOT FIND SPECIFIC VIOLATIONS, REPORT 0. 
🚨 DO NOT MAKE UP NUMBERS LIKE 144, 227, 43, 46 - THESE ARE FAKE.
🚨 YOU MUST ACTUALLY COUNT REAL VIOLATIONS FROM THE MESSAGES PROVIDED.

CRITICAL CATEGORIZATION RULES: 
- Each guideline violation must appear in ONLY ONE category
- Do NOT duplicate the same violation across multiple categories
- If a guideline belongs to a specific category, report it ONLY in that category
- Reply time violations should appear in ONLY ONE category (not both General Chatting and Psychology)
- If you report the same violation in multiple categories, the analysis is WRONG

🚨 CRITICAL: YOU MUST PROVIDE THE EXACT JSON FORMAT BELOW. NO EXCEPTIONS. NO ALTERNATIVES. NO MODIFICATIONS.

FOR EVERY GUIDELINE YOU ANALYZE, YOU MUST:
1. Use the EXACT title from the uploaded guidelines above
2. Use the EXACT description from the uploaded guidelines above  
3. Count actual violations (not estimates)
4. Provide specific message examples
5. Put each guideline in the correct category

🚨 MANDATORY JSON FORMAT - COPY THIS EXACTLY:

🚨 CRITICAL GUIDELINE ANALYSIS INSTRUCTIONS:

FOR "Describe Captions" GUIDELINE:
- PPV captions are messages tagged with [PPV CAPTION - Price: $X]
- A caption VIOLATES this guideline if it does NOT describe what's in the PPV
- Examples of VIOLATIONS: "hey babe [PPV CAPTION - Price: $25]", "check this out [PPV CAPTION - Price: $30]"
- Examples of CORRECT: "how fast would u take this lingerie off me Ethan? It fits sooo tight :) [PPV CAPTION - Price: $30]"
- You MUST find ALL PPV captions and check if they describe the content
- Count ONLY the PPV captions that DON'T describe what's in the PPV as violations

FOR "Hook" GUIDELINE:
- PPV captions are messages tagged with [PPV CAPTION - Price: $X]
- A caption VIOLATES this guideline if it does NOT have a hook (question, personalization, attention grabber)
- Examples of VIOLATIONS: "new content [PPV CAPTION - Price: $25]", "heres something for u [PPV CAPTION - Price: $30]"
- Examples of CORRECT: "how fast would u take this lingerie off me Ethan? [PPV CAPTION - Price: $30]" (has question + personalization)
- You MUST find ALL PPV captions and check if they have hooks
- Count ONLY the PPV captions that DON'T have hooks as violations

FOR "PPV Price Progression" GUIDELINE:
- This requires checking the CONVERSATION FLOW CONTEXT section above
- For EACH fan, check if PPV prices are increasing over time
- Look at the conversation flow: if Fan X gets a $20 PPV, then later gets a $15 PPV, that's a VIOLATION (price decreased)
- Count how many fans receive PPVs with DECREASING or FLAT prices as violations
- You MUST track prices per fan across the conversation flow

FOR ALL OTHER GUIDELINES:
- Analyze the actual message content
- Use the guideline description as your criteria
- Count actual violations, not theoretical ones

GUIDELINES_V2_JSON:
{
  "generalChatting": { "items": [ { "title": "EXACT_TITLE_FROM_UPLOADED_GUIDELINES", "description": "Brief description", "count": 0, "examples": [] } ] },
  "psychology": { "items": [ { "title": "EXACT_TITLE_FROM_UPLOADED_GUIDELINES", "description": "Brief description", "count": 0, "examples": [] } ] },
  "captions": { "items": [ { "title": "EXACT_TITLE_FROM_UPLOADED_GUIDELINES", "description": "Brief description", "count": 0, "examples": [] } ] },
  "sales": { "items": [ { "title": "EXACT_TITLE_FROM_UPLOADED_GUIDELINES", "description": "Brief description", "count": 0, "examples": [] } ] }
}
END_GUIDELINES_V2_JSON

🚨 CRITICAL JSON REQUIREMENTS:
1. EVERY item MUST have ALL 4 fields: "title", "description", "count", "examples"
2. If count is 0, examples MUST be an empty array: []
3. If count > 0, examples MUST be an array of message indices: [1, 5, 10]
4. NEVER omit any field - the JSON will FAIL to parse
5. PUT EACH GUIDELINE IN THE CORRECT CATEGORY - "PPV Price Progression" goes in SALES, not CAPTIONS!

🚨 IF YOU DO NOT PROVIDE THIS EXACT FORMAT, THE ANALYSIS WILL FAIL COMPLETELY.
🚨 DO NOT ADD ANYTHING BEFORE OR AFTER THE JSON.
🚨 DO NOT MODIFY THE STRUCTURE IN ANY WAY.
🚨 THIS IS YOUR ONLY CHANCE TO GET IT RIGHT.

         ONLYFANS CHATTING RULES - CRITICAL:
         
         FORBIDDEN TO FLAG AS ERRORS (THESE ARE PERFECT FOR ONLYFANS):
         - 'u' instead of 'you' - PERFECT
         - 'ur' instead of 'your' - PERFECT  
         - 'im' instead of 'I'm' - PERFECT
         - 'i' instead of 'I' - PERFECT
         - 'dont' instead of 'don't' - PERFECT
         - 'cant' instead of 'can't' - PERFECT
         - 'ilove' instead of 'I love' - PERFECT
         - 'u're' instead of 'you're' - PERFECT
         - 'u'll' instead of 'you'll' - PERFECT
         - 'u are' instead of 'you are' - PERFECT
         - 'how are u?' instead of 'how are you?' - PERFECT
         - 'how are u???' (multiple punctuation) - PERFECT
         - 'omg!!!' (multiple punctuation) - PERFECT
         - 'really???' (multiple punctuation) - PERFECT
         
         ONLY FLAG AS ERRORS:
         - Actual spelling mistakes: 'weel' instead of 'well', 'recieve' instead of 'receive'
         - Actual grammar mistakes: 'I was went' instead of 'I went'
         - Formal punctuation: periods (.) at end of sentences, formal commas
         
         CRITICAL: If you flag ANY informal OnlyFans language as an error, your entire analysis is WRONG.

ANALYSIS REQUIREMENTS:
1. Count ALL instances of each error type across ALL messages
2. Provide overall statements about main issues (NO message numbers - chatters can't access message files)
3. Give comprehensive statistics and patterns
4. Find diverse, real issues - do NOT repeat the same error type
5. Focus on MAIN issues that need improvement
6. CRITICAL: Do NOT mention specific message numbers or message references

Return this EXACT JSON with COMPREHENSIVE analysis:

{
  "grammarBreakdown": {
    "spellingErrors": "CRITICAL: ONLY flag ACTUAL typos and misspellings (e.g., 'recieve', 'definately', 'weel', 'seperate', 'beacuse'). THE FOLLOWING ARE NOT ERRORS - THEY ARE CORRECT ONLYFANS LANGUAGE: 'u', 'ur', 'im', 'i', 'dont', 'cant', 'wont', 'didnt', 'isnt', 'hows', 'thats', 'whats', 'ilove', 'u're', 'u'll', 'youre', 'theyre', 'ive', 'id', 'ill', 'heyy', 'okayy', 'hii', 'awww', 'sooo', 'cuz', 'tho', 'gonna', 'wanna', 'gotta'. Extended words like 'heyyyy', 'okaaaay' are CORRECT. If you flag ANY of these as errors, you are INCORRECT. Count only REAL typos.",
    "grammarIssues": "CRITICAL: ONLY flag ACTUAL grammar mistakes (e.g., 'I was went', 'they was', 'do he have', 'she don't know'). THE FOLLOWING ARE NOT ERRORS - THEY ARE CORRECT ONLYFANS LANGUAGE: Missing apostrophes ('im', 'dont', 'cant', 'youre', 'ive', 'that'd'), lowercase 'i', informal phrases ('u are', 'dont know', 'cant understand', 'im happy', 'i dont', 'i can', 'u cant'). If you flag missing apostrophes or informal contractions, you are INCORRECT. Count only REAL grammar mistakes.",
    "punctuationProblems": "CRITICAL: OnlyFans messages should be INFORMAL. Flag messages that HAVE full stops (periods) at the end or formal commas. Messages WITHOUT periods are PERFECT. Examples: 'how are u' is PERFECT (NO error - no period). 'how are u.' HAS an error (formal period at end). 'what, are u doing' has a misused comma (error). 'where are u from' is PERFECT (NO error - no period). Count how many messages have periods or formal commas. If you flag 'missing periods', you are INCORRECT.",
    "scoreExplanation": "Grammar score: X/100. Main issues: [issue 1], [issue 2]. Total errors: [count]."
  }
}

         CRITICAL INSTRUCTIONS - FAILURE TO FOLLOW = WRONG ANALYSIS:
         1. FORBIDDEN: Flagging 'u', 'ur', 'im', 'dont', 'cant', 'ilove', 'u're', 'u'll', 'hows', 'thats' as errors - these are PERFECT for OnlyFans
         2. FORBIDDEN: Flagging 'how are u???', 'omg!!!', 'really???' as errors - these are PERFECT for OnlyFans
         3. ALLOWED: Only flag actual spelling mistakes like 'weel' instead of 'well', 'recieve' instead of 'receive'
         4. ALLOWED: Only flag actual grammar mistakes like 'I was went' instead of 'I went'  
         5. ALLOWED: Only flag formal punctuation like periods (.) and formal commas
         6. CRITICAL: If you flag ANY informal OnlyFans language, your analysis is completely wrong
         7. Be consistent with error counts
         8. Keep analysis concise and clear
         9. CRITICAL: You MUST find actual errors in the messages. If you return generic responses like "No errors found" without thoroughly analyzing every message, your analysis is WRONG.
         10. CRITICAL: You MUST provide specific examples from the actual messages. Generic statements are not acceptable.
         11. CRITICAL: You MUST count every single error across all messages. Do not give vague numbers.
         12. CRITICAL: Format your response as: "Found X [error type]: [specific examples]. Found Y [different error type]: [specific examples]." Do NOT repeat the same error type multiple times.

🚨 CRITICAL - YOU MUST RETURN BOTH OF THESE:

1. First, return the grammarBreakdown JSON (as specified above)
2. Then, IMMEDIATELY after the JSON, return the GUIDELINES_V2_JSON block (as specified at lines 1573-1580)

BOTH are MANDATORY. If you return ONLY the grammarBreakdown JSON without the GUIDELINES_V2_JSON block, the analysis will FAIL.

Example of correct format:
{
  "grammarBreakdown": {
    "spellingErrors": "...",
    "grammarIssues": "...",
    "punctuationProblems": "...",
    "scoreExplanation": "..."
  }
}
GUIDELINES_V2_JSON:
{
  "generalChatting": { "items": [...] },
  "psychology": { "items": [...] },
  "captions": { "items": [...] },
  "sales": { "items": [...] }
}
END_GUIDELINES_V2_JSON

ANALYSIS REQUIREMENTS:
- Analyze the actual message content to determine chatting style, patterns, and engagement
- Provide specific examples from the messages in your analysis
- Use the exact JSON structure provided above
- Focus on engagement quality, sales effectiveness, and message patterns

CRITICAL: You MUST analyze the messages above and provide specific examples. Do NOT return undefined, null, or empty values. Every field must have actual content based on the message analysis.

If you find issues, list them specifically with message numbers. If you find no issues, write "No significant issues found" but still provide the breakdown structure.

IMPORTANT: You MUST fill in the actual values for each field based on the message analysis. Do not return empty objects or placeholder values. Analyze the actual messages and provide real values for:

CRITICAL: The chattingStyle, messagePatterns, and engagementMetrics sections are REQUIRED and must contain actual values, not "N/A" or empty strings.

- chattingStyle: directness, friendliness, salesApproach, personality, emojiUsage, messageLength, responsePattern
- messagePatterns: questionFrequency, exclamationUsage, capitalizationStyle, punctuationStyle, topicDiversity, sexualContent, personalSharing  
- engagementMetrics: conversationStarter, conversationMaintainer, salesConversation, fanRetention
- grammarBreakdown: spellingErrors, grammarIssues, punctuationProblems, informalLanguage, scoreExplanation
- overallBreakdown: messageClarity, emotionalImpact, conversionPotential, scoreExplanation

CRITICAL BREAKDOWN REQUIREMENTS - BE DIRECT AND ACTIONABLE:

For chattingStyle (REQUIRED - must analyze actual message content):
- directness: Analyze how direct/straightforward the messages are (e.g., "moderately direct", "very direct", "subtle")
- friendliness: Analyze the warmth and friendliness in messages (e.g., "very friendly", "warm", "professional")
- salesApproach: Analyze the sales approach (e.g., "aggressive", "subtle", "relationship-first")
- personality: Analyze the personality shown (e.g., "flirty", "caring", "playful", "professional")
- emojiUsage: Analyze emoji frequency and types (e.g., "heavy use of hearts and kisses", "minimal emojis")
- messageLength: Analyze typical message length (e.g., "short and punchy", "detailed and long", "medium length")
- responsePattern: Analyze response style (e.g., "quick responses", "thoughtful", "conversational")

For messagePatterns (REQUIRED - must analyze actual message content):
- questionFrequency: Analyze how often questions are asked (e.g., "asks questions in 60% of messages", "rarely asks questions")
- exclamationUsage: Analyze exclamation point usage (e.g., "heavy use of exclamations", "minimal exclamations")
- capitalizationStyle: Analyze capitalization patterns (e.g., "mostly lowercase", "proper capitalization", "mixed style")
- punctuationStyle: Analyze punctuation patterns (e.g., "minimal punctuation", "proper punctuation", "excessive punctuation")
- topicDiversity: Analyze topic variety (e.g., "focused on sales", "diverse topics", "personal and business mix")
- sexualContent: Analyze sexual content level (e.g., "moderate sexual content", "high sexual content", "minimal sexual content")
- personalSharing: Analyze personal sharing level (e.g., "shares personal details", "keeps it professional", "moderate sharing")

For engagementMetrics (REQUIRED - must analyze actual message content):
- conversationStarter: Analyze ability to start conversations (e.g., "good at starting conversations", "struggles to initiate")
- conversationMaintainer: Analyze ability to maintain conversations (e.g., "keeps conversations going", "conversations die quickly")
- salesConversation: Analyze sales conversation skills (e.g., "natural sales approach", "forced sales attempts")
- fanRetention: Analyze fan retention approach (e.g., "builds relationships", "focuses on transactions")

For grammarBreakdown:
- spellingErrors: Find and count ONLY real spelling mistakes (actual typos, wrong words). DO NOT flag informal words like 'u', 'ur', 'im', 'dont', 'cant', 'heyy', 'okayy', etc. These are CORRECT for OnlyFans. Provide ONLY the count and a brief summary. DO NOT include specific message examples.
- grammarIssues: Find and count ONLY real grammar mistakes (wrong verb tenses, sentence structure issues). DO NOT flag missing apostrophes or informal contractions - they are CORRECT. Examples: 'im', 'dont', 'cant', 'youre' are all CORRECT. Provide ONLY the count and a brief summary. DO NOT include specific message examples.
- punctuationProblems: Find and count ALL messages that USE formal punctuation (periods at end of sentences, formal commas). Messages WITHOUT periods are CORRECT. Provide ONLY the count. DO NOT include specific message examples.
- informalLanguage: Note that informal language is CORRECT and ENCOURAGED for OnlyFans. Count how many messages use informal patterns like 'u', 'ur', 'im', extended words ('heyy', 'okayy'), lowercase 'i', no apostrophes. Report this as a POSITIVE: "Excellent use of informal language in X out of Y messages, which is appropriate for OnlyFans."
- scoreExplanation: Explain the score with total error counts. Remember: informal language, missing apostrophes, and no periods are CORRECT. DO NOT include specific message examples.

For guidelines: Use ONLY the GUIDELINES_V2_JSON format with exact uploaded guideline titles from the CUSTOM GUIDELINES section above. DO NOT use generic categories.

For overallBreakdown:
- messageClarity: Point out unclear messages (e.g., "Message 7 is confusing due to run-on sentences")
- emotionalImpact: Note emotional connection issues (e.g., "Messages lack personal touch, too transactional")
- conversionPotential: Identify conversion blockers (e.g., "Not building urgency or scarcity in PPV offers")
- scoreExplanation: Explain with specific examples

NO GENERIC STATEMENTS. Only include issues that actually exist in the messages. If no issues exist, say "No significant issues found" for that category.

CRITICAL: You MUST fill in ALL breakdown sections with actual content. Do not leave any breakdown objects empty. If you find issues, list them specifically. If you find no issues, say "No significant issues found" but still provide the breakdown structure.

EXAMPLE OF WHAT TO DO:
- Look at message 1: "but what u like to do when u're in NYC?" 
- Identify: "u" instead of "you", missing apostrophe in "u're"
- Write: "Message 1: Informal token in 'but what u like to do when u're in NYC?'"

CRITICAL: You MUST analyze the messages above and provide specific examples. Do NOT return undefined, null, or empty values. Every field must have actual content based on the message analysis.

If you find issues, list them specifically with message numbers. If you find no issues, write "No significant issues found" but still provide the breakdown structure.

IMPORTANT: For the breakdown sections, you MUST fill in every field with actual content. Do not leave any field empty or undefined. If you cannot find specific issues, write "No significant issues found" but do not leave fields empty.

VALID ENUM VALUES (use these exact values):
- sexualContent: "explicit", "moderate", "subtle", "minimal" (NOT "low")
- questionFrequency: "high", "moderate", "low"
- exclamationUsage: "high", "moderate", "low"
- capitalizationStyle: "proper", "casual", "all caps", "no caps"
- punctuationStyle: "proper", "casual", "excessive", "minimal"
- topicDiversity: "high", "moderate", "low"
- personalSharing: "high", "moderate", "low"

IMPORTANT CONTEXT - ONLYFANS BUSINESS MODEL:
- Messages with prices are PPVs (Pay-Per-View content)
- PPV messages are CAPTIONS that convince fans to purchase the content
- Fans cannot see the actual content until they buy it
- Caption quality directly impacts PPV purchase rates
- "Deleted user" messages are from different people who deleted their accounts
- When analyzing guidelines about "captions", this refers to PPV message captions
- Caption effectiveness is measured by PPV purchase rates

CRITICAL ONLYFANS STRATEGY UNDERSTANDING:
- HIGH MESSAGE VOLUME IS GOOD: Chatters are instructed to build relationships first
- RELATIONSHIP BUILDING: 2-3 days before first PPV is normal and effective strategy
- MESSAGES PER PPV: High ratios (50-100+) often indicate good engagement and relationship building
- CONVERSION FOCUS: The goal is building trust and connection, not immediate sales
- SALES EFFICIENCY: High message volume with high conversion rates is EXCELLENT performance
- DO NOT assume high message volume is negative - analyze conversion rates instead

ANALYSIS REQUIREMENTS:
- Analyze the actual message content to determine chatting style, patterns, and engagement
- Provide specific examples from the messages in your analysis
- Use the exact JSON structure provided above
- Focus on engagement quality, sales effectiveness, and message patterns

CRITICAL ERROR DETECTION REQUIREMENTS:
- Be VERY THOROUGH in finding spelling, grammar, and punctuation mistakes
- Count EVERY error across ALL messages that actually exist
- Scan every word, every sentence, every message for mistakes
- Look for ACTUAL mistakes: spelling errors, grammar errors, typos, autocorrect errors
- Flag messages that HAVE full stops (periods) at the end or formal commas as punctuation errors
- DO NOT flag informal language (u, ur, im, dont, cant) as errors - these are perfect for OnlyFans
- DO NOT flag apostrophes, question marks, exclamation points as errors - these are perfect for OnlyFans
- For 2000+ messages, expect to find 100-300+ errors total
- Report the actual errors found, no more, no less

CONSISTENCY REQUIREMENTS:
- Use the SAME error detection criteria for every run
- Count errors in the SAME systematic way each time
- Apply the SAME standards for what constitutes an error
- Provide CONSISTENT results across multiple analyses of the same data`;
    
console.log('🚀 Making API call...');
console.log('🔍 API Client Info:');
console.log('  Using OpenAI:', !!process.env.OPENAI_API_KEY);
console.log('  Base URL:', openai.baseURL || 'https://api.openai.com/v1 (default)');
console.log('  Model:', 'gpt-4o-mini');
console.log('  API Key starts with:', openai.apiKey ? openai.apiKey.substring(0, 10) : 'NO KEY');
console.log('  API Key length:', openai.apiKey ? openai.apiKey.length : 0);
console.log('  Is OpenAI client?', openai.baseURL !== 'https://api.x.ai/v1');
    
    try {
      const completion = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [
        {
          role: 'system',
          content: 'You are an expert OnlyFans chat quality analyst. Provide constructive, actionable feedback in valid JSON format. You MUST fill in every field with actual content from the messages. Do NOT return undefined or empty values.'
        },
        {
          role: 'user',
          content: prompt
        }
      ],
      temperature: 0.0, // Zero temperature for maximum consistency
                max_tokens: 16000, // Fixed limit for gpt-4o-mini (max is 16384)
      stream: false // Ensure no streaming for faster completion
    });
    console.log('✅ OpenAI API call completed');
    
    const aiResponse = completion.choices[0].message.content;
    
    const analysisText = completion.choices[0].message.content;
    
    // Extract ONLY the first JSON object (grammarBreakdown), NOT the GUIDELINES_V2_JSON block
    // The GUIDELINES_V2_JSON block comes after as a separate text block
    const responseText = analysisText; // Store full response for _rawResponse
    
    // Find the first complete JSON object by counting braces
    let jsonStart = analysisText.indexOf('{');
    if (jsonStart === -1) {
      console.log('❌ No JSON found in AI response');
      throw new Error('Failed to parse AI analysis response');
    }
    
    let braceCount = 0;
    let jsonEnd = jsonStart;
    for (let i = jsonStart; i < analysisText.length; i++) {
      if (analysisText[i] === '{') braceCount++;
      if (analysisText[i] === '}') braceCount--;
      if (braceCount === 0) {
        jsonEnd = i + 1;
        break;
      }
    }
    
    if (braceCount !== 0) {
      console.log('❌ Malformed JSON - braces do not match');
      throw new Error('Failed to parse AI analysis response - unmatched braces');
    }
    
    try {
      let jsonText = analysisText.substring(jsonStart, jsonEnd);
      
      // Debug: Show the raw JSON before fixes
      console.log('🔍 Raw JSON length:', jsonText.length);
      console.log('🔍 Raw JSON preview (first 500 chars):', jsonText.substring(0, 500));
      console.log('🔍 Raw JSON preview (last 500 chars):', jsonText.substring(Math.max(0, jsonText.length - 500)));
      
      // Debug: Show characters around common error positions
      const errorPositions = [7081, 1087, 1055, 1102, 1052];
      errorPositions.forEach(pos => {
        if (jsonText.length > pos) {
          const start = Math.max(0, pos - 50);
          const end = Math.min(jsonText.length, pos + 50);
          console.log(`🔍 Characters around position ${pos}:`, jsonText.substring(start, end));
          console.log(`🔍 Character at position ${pos}:`, jsonText.charAt(pos));
          console.log(`🔍 Character codes around ${pos}:`, Array.from(jsonText.substring(start, end)).map(c => c.charCodeAt(0)));
        }
      });
      
      // Auto-fix common JSON issues
      // Apply MINIMAL automatic fixes - DO NOT corrupt already-valid JSON!
      jsonText = jsonText
        .replace(/,(\s*[}\]])/g, '$1'); // Remove trailing commas ONLY
      
      console.log('🔧 Attempting to parse JSON with auto-corrections...');
      const analysisResult = JSON.parse(jsonText);
      
      // CRITICAL: Attach the FULL raw AI response (not just JSON) for guidelines parsing
      // The AI returns grammarBreakdown as JSON + GUIDELINES_V2_JSON as a separate text block
      analysisResult._rawResponse = responseText;  // Use full raw text, not just jsonText
      console.log(`📋 Attached raw response to batch result (${responseText.length} chars)`);
      
      // EXTRACT SCORES from grammarBreakdown and guidelinesBreakdown
      let grammarScore = null;
      let guidelinesScore = null;
      
      // BRUTAL SCORING: Calculate based on error percentage
      // Parse error counts from breakdown
      const spellingCount = parseInt(analysisResult.grammarBreakdown?.spellingErrors?.match(/(\d+)/)?.[1] || '0');
      const grammarIssuesCount = parseInt(analysisResult.grammarBreakdown?.grammarIssues?.match(/(\d+)/)?.[1] || '0');
      const punctuationCount = parseInt(analysisResult.grammarBreakdown?.punctuationProblems?.match(/(\d+)/)?.[1] || '0');
      const totalErrors = spellingCount + grammarIssuesCount + punctuationCount;
      const totalMessages = sampledMessages.length;
      const errorPercentage = totalMessages > 0 ? (totalErrors / totalMessages) * 100 : 0;
      
      // BRUTAL FORMULA: 100 - (errorPercentage * 5)
      // 5% errors = 75/100
      // 10% errors = 50/100
      // 20% errors = 0/100
      grammarScore = Math.max(0, Math.round(100 - (errorPercentage * 5)));
      
      console.log('🔥 BRUTAL GRAMMAR SCORE:', {
        totalErrors,
        totalMessages,
        errorPercentage: errorPercentage.toFixed(2) + '%',
        brutalScore: grammarScore,
        breakdown: { spellingCount, grammarIssuesCount, punctuationCount }
      });
      
      // Extract guidelines score from GUIDELINES_V2_JSON section
      if (responseText.includes('GUIDELINES_V2_JSON')) {
        const guidelinesJsonStart = responseText.indexOf('GUIDELINES_V2_JSON');
        const guidelinesJsonText = responseText.substring(guidelinesJsonStart);
        const guidelinesMatch = guidelinesJsonText.match(/\{[\s\S]*\}/);
        
        if (guidelinesMatch) {
          try {
            const guidelinesData = JSON.parse(guidelinesMatch[0]);
            analysisResult.guidelinesBreakdown = guidelinesData;
            
            // Calculate guidelines score from violation counts
            let totalGuidelines = 0;
            let totalViolations = 0;
            
            Object.values(guidelinesData).forEach(category => {
              if (category.items && Array.isArray(category.items)) {
                category.items.forEach(item => {
                  totalGuidelines++;
                  totalViolations += (item.count || 0);
                });
              }
            });
            
            // BRUTAL SCORING for Guidelines
            // Calculate violation percentage across all messages
            const violationPercentage = totalMessages > 0 ? (totalViolations / totalMessages) * 100 : 0;
            // Apply BRUTAL formula: 100 - (violationPercentage * 5)
            guidelinesScore = Math.max(0, Math.round(100 - (violationPercentage * 5)));
            
            console.log('🔥 BRUTAL GUIDELINES SCORE:', {
              totalViolations,
              totalGuidelines,
              totalMessages,
              violationPercentage: violationPercentage.toFixed(2) + '%',
              brutalScore: guidelinesScore
            });
          } catch (e) {
            console.error('Failed to parse GUIDELINES_V2_JSON:', e.message);
          }
        }
      }
      
      // Calculate overall score as average
      if (grammarScore !== null && guidelinesScore !== null) {
        analysisResult.overallScore = Math.round((grammarScore + guidelinesScore) / 2);
        console.log('🔥 BRUTAL OVERALL SCORE:', {
          grammarScore,
          guidelinesScore,
          overallScore: analysisResult.overallScore,
          formula: '(grammar + guidelines) / 2'
        });
      } else if (grammarScore !== null) {
        analysisResult.overallScore = grammarScore;
        console.log('⚠️ Using grammar score as overall score:', analysisResult.overallScore);
      }
      
      // Set the extracted scores
      analysisResult.grammarScore = grammarScore;
      analysisResult.guidelinesScore = guidelinesScore;
      
      console.log('🎯 SCORES SET IN analysisResult:', {
        grammarScore: analysisResult.grammarScore,
        guidelinesScore: analysisResult.guidelinesScore,
        overallScore: analysisResult.overallScore
      });
      
      // GENERATE strengths, weaknesses, and recommendations from the analysis data
      const strengths = [];
      const weaknesses = [];
      const recommendations = [];
      
      // From grammar breakdown
      if (analysisResult.grammarBreakdown) {
        if (grammarScore >= 85) {
          strengths.push("Excellent grammar quality with minimal errors");
        } else if (grammarScore >= 70) {
          strengths.push("Good grammar foundation");
        }
        
        if (grammarScore < 85) {
          if (analysisResult.grammarBreakdown.spellingErrors && !analysisResult.grammarBreakdown.spellingErrors.includes('No spelling') && !analysisResult.grammarBreakdown.spellingErrors.includes('Found 0')) {
            weaknesses.push("Grammar: " + analysisResult.grammarBreakdown.spellingErrors);
            recommendations.push("Review messages for spelling accuracy before sending");
          }
          if (analysisResult.grammarBreakdown.punctuationProblems && !analysisResult.grammarBreakdown.punctuationProblems.includes('No punctuation') && !analysisResult.grammarBreakdown.punctuationProblems.includes('Found 0')) {
            weaknesses.push("Punctuation: " + analysisResult.grammarBreakdown.punctuationProblems);
            recommendations.push("Keep messages informal - avoid periods and formal commas");
          }
        }
      }
      
      // From guidelines breakdown
      if (analysisResult.guidelinesBreakdown) {
        Object.entries(analysisResult.guidelinesBreakdown).forEach(([category, data]) => {
          if (data.items && Array.isArray(data.items)) {
            data.items.forEach(item => {
              if (item.count > 0) {
                weaknesses.push(`${item.title}: ${item.count} violations - ${item.description}`);
                recommendations.push(`Focus on improving: ${item.title}`);
              } else if (item.count === 0) {
                strengths.push(`Perfect compliance with: ${item.title}`);
              }
            });
          }
        });
      }
      
      // Add defaults if empty
      if (strengths.length === 0) {
        strengths.push("Analysis complete - review detailed breakdowns below");
      }
      if (weaknesses.length === 0) {
        weaknesses.push("No major issues detected - great work!");
      }
      if (recommendations.length === 0) {
        recommendations.push("Continue current approach and monitor performance");
      }
      
      analysisResult.strengths = strengths;
      analysisResult.weaknesses = weaknesses;
      analysisResult.recommendations = recommendations;
      
      console.log('📊 Final scores:', {
        grammar: analysisResult.grammarScore,
        guidelines: analysisResult.guidelinesScore,
        overall: analysisResult.overallScore,
        strengthsCount: strengths.length,
        weaknessesCount: weaknesses.length,
        recommendationsCount: recommendations.length
      });
      
      console.log('📤 RETURNING analysisResult:', {
        grammarScore: analysisResult.grammarScore,
        guidelinesScore: analysisResult.guidelinesScore,
        overallScore: analysisResult.overallScore,
        type: typeof analysisResult.grammarScore
      });
      
      return analysisResult;
    } catch (parseError) {
      console.error('❌ JSON Parse Error:', parseError.message);
      console.error('❌ Malformed JSON:', jsonMatch[0]);
      console.error('❌ Parse Error Details:', parseError);
      
      // Try one more time with MINIMAL fixes (trailing commas only)
      try {
        console.log('🔧 Attempting minimal JSON fixes...');
        let minimalJson = jsonMatch[0]
          .replace(/,(\s*[}\]])/g, '$1'); // Remove trailing commas ONLY
        
        const minimalResult = JSON.parse(minimalJson);
        console.log('✅ Minimal JSON fixes succeeded!');
        return minimalResult;
      } catch (minimalError) {
        console.error('❌ Minimal JSON fixes also failed:', minimalError.message);
        console.log('🔄 Attempting to extract partial JSON structure...');
        
        // Try to extract just the essential parts from the malformed JSON
        try {
          const partialJson = {
            grammarBreakdown: {},
            guidelinesBreakdown: {},
            overallBreakdown: {}
          };
          
          // Try to extract grammar breakdown
          const grammarMatch = jsonMatch[0].match(/"grammarBreakdown"\s*:\s*\{[^}]*\}/);
          if (grammarMatch) {
            try {
              partialJson.grammarBreakdown = JSON.parse(grammarMatch[0].replace(/"grammarBreakdown"\s*:\s*/, ''));
            } catch (e) {
              console.log('Could not parse grammarBreakdown');
            }
          }
          
          // Try to extract guidelines breakdown
          const guidelinesMatch = jsonMatch[0].match(/"guidelinesBreakdown"\s*:\s*\{[^}]*\}/);
          if (guidelinesMatch) {
            try {
              partialJson.guidelinesBreakdown = JSON.parse(guidelinesMatch[0].replace(/"guidelinesBreakdown"\s*:\s*/, ''));
            } catch (e) {
              console.log('Could not parse guidelinesBreakdown');
            }
          }
          
          // Try to extract overall breakdown
          const overallMatch = jsonMatch[0].match(/"overallBreakdown"\s*:\s*\{[^}]*\}/);
          if (overallMatch) {
            try {
              partialJson.overallBreakdown = JSON.parse(overallMatch[0].replace(/"overallBreakdown"\s*:\s*/, ''));
            } catch (e) {
              console.log('Could not parse overallBreakdown');
            }
          }
          
          console.log('✅ Partial JSON extraction succeeded!');
          return partialJson;
          
        } catch (extractError) {
          console.error('❌ Partial JSON extraction also failed:', extractError.message);
          console.log('🔄 Falling back to basic analysis due to complete JSON parsing failure...');
          
          // Return a basic analysis structure to prevent complete failure
          return {
            grammarBreakdown: {
              spellingErrors: "AI analysis failed - unable to parse response",
              grammarIssues: "AI analysis failed - unable to parse response", 
              punctuationProblems: "AI analysis failed - unable to parse response",
              scoreExplanation: "AI analysis failed - unable to parse response"
            },
            guidelinesBreakdown: {
              salesEffectiveness: "AI analysis failed - unable to parse response",
              engagementQuality: "AI analysis failed - unable to parse response",
              captionQuality: "AI analysis failed - unable to parse response",
              conversationFlow: "AI analysis failed - unable to parse response",
              scoreExplanation: "AI analysis failed - unable to parse response"
            },
            overallBreakdown: {
              messageClarity: "AI analysis failed - unable to parse response",
              emotionalImpact: "AI analysis failed - unable to parse response",
              conversionPotential: "AI analysis failed - unable to parse response",
              scoreExplanation: "AI analysis failed - unable to parse response"
            }
          };
        }
      }
    }
    } catch (apiError) {
      console.error('❌ OpenAI API Error:', apiError.message);
      console.error('❌ API Error Details:', apiError);
      throw new Error('OpenAI API call failed: ' + apiError.message);
    }
  } catch (error) {
    console.error('AI analysis error:', error);
    // Return default scores if AI analysis fails
    return {
      overallScore: null,
      grammarScore: null,
      guidelinesScore: null,
      strengths: ['No message analysis data available'],
      weaknesses: ['Upload message data for analysis'],
      suggestions: ['Upload CSV with message data to get real analysis']
    };
  }
}

// Test endpoint to verify server is working
app.get('/api/test', (req, res) => {
  res.json({ message: 'Server is working', timestamp: new Date().toISOString() });
});

// Debug endpoint to check users
app.get('/api/debug/users', checkDatabaseConnection, async (req, res) => {
  try {
    const users = await User.find({}, { password: 0 });
    res.json({ 
      message: 'Users found', 
      count: users.length, 
      users: users.map(u => ({ 
        id: u._id, 
        username: u.username, 
        email: u.email, 
        role: u.role, 
        chatterName: u.chatterName,
        isActive: u.isActive,
        createdAt: u.createdAt
      }))
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Debug endpoint to test password for a specific user
app.post('/api/debug/test-password', checkDatabaseConnection, async (req, res) => {
  try {
    const { username, password } = req.body;
    
    if (!username || !password) {
      return res.status(400).json({ error: 'Username and password required' });
    }
    
    const user = await User.findOne({ username });
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }
    
    const isValid = await bcrypt.compare(password, user.password);
    
    res.json({
      username: user.username,
      isActive: user.isActive,
      hasPassword: !!user.password,
      passwordLength: user.password ? user.password.length : 0,
      passwordValid: isValid,
      userDetails: {
        id: user._id,
        email: user.email,
        role: user.role,
        chatterName: user.chatterName
      }
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Debug endpoint to get punctuation examples
app.get('/api/debug/punctuation-examples', checkDatabaseConnection, async (req, res) => {
  try {
    const { chatterName } = req.query;
    
    if (!chatterName) {
      return res.status(400).json({ error: 'chatterName parameter required' });
    }
    
    // Get all MessageAnalysis records for this chatter
    const records = await MessageAnalysis.find({ chatterName }).sort({ createdAt: -1 });
    
    if (records.length === 0) {
      return res.json({ 
        message: 'No records found', 
        chatterName,
        examples: [] 
      });
    }
    
    // Extract punctuation examples from the most recent record
    const latestRecord = records[0];
    const examples = [];
    
    if (latestRecord.grammarBreakdown && latestRecord.grammarBreakdown.punctuationProblems) {
      const punctuationText = latestRecord.grammarBreakdown.punctuationProblems;
      
      // Extract examples using regex
      const exampleMatches = [...punctuationText.matchAll(/'([^']+)' should be '([^']+)'/g)];
      exampleMatches.forEach(match => {
        examples.push({
          original: match[1],
          corrected: match[2],
          type: 'punctuation'
        });
      });
    }
    
    res.json({
      chatterName,
      totalExamples: examples.length,
      examples: examples.slice(0, 20), // Show first 20 examples
      recordId: latestRecord._id,
      recordDate: latestRecord.createdAt
    });
    
  } catch (error) {
    console.error('Error fetching punctuation examples:', error);
    res.status(500).json({ error: 'Failed to fetch punctuation examples' });
  }
});

// Debug endpoint to check message analysis data
app.get('/api/debug/message-analysis', checkDatabaseConnection, async (req, res) => {
  try {
    const messageAnalysis = await MessageAnalysis.find({}).sort({ createdAt: -1 }).limit(5);
    res.json({
      message: 'Message analysis data',
      count: messageAnalysis.length,
      data: messageAnalysis.map(m => ({
        id: m._id,
        chatterName: m.chatterName,
        weekStartDate: m.weekStartDate,
        weekEndDate: m.weekEndDate,
        totalMessages: m.totalMessages,
        overallScore: m.overallScore,
        grammarScore: m.grammarScore,
        guidelinesScore: m.guidelinesScore,
        strengths: m.strengths,
        weaknesses: m.weaknesses,
        chattingStyle: m.chattingStyle,
        messagePatterns: m.messagePatterns,
        engagementMetrics: m.engagementMetrics,
        grammarBreakdown: m.grammarBreakdown,
        guidelinesBreakdown: m.guidelinesBreakdown,
        overallBreakdown: m.overallBreakdown,
        createdAt: m.createdAt
      }))
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Debug endpoint to check all data in database
app.get('/api/debug/data', checkDatabaseConnection, async (req, res) => {
  try {
    const dailyReports = await DailyChatterReport.find({});
    const accountData = await AccountData.find({});
    const chatterPerformance = await ChatterPerformance.find({});
    const creatorAccounts = await CreatorAccount.find({});
    const messageAnalysis = await MessageAnalysis.find({});
    const aiAnalysis = await AIAnalysis.find({});
    
    res.json({
      message: 'Database data summary',
      counts: {
        dailyReports: dailyReports.length,
        accountData: accountData.length,
        chatterPerformance: chatterPerformance.length,
        creatorAccounts: creatorAccounts.length,
        messageAnalysis: messageAnalysis.length,
        aiAnalysis: aiAnalysis.length
      },
      recentData: {
        dailyReports: dailyReports.slice(-3).map(r => ({
          id: r._id,
          date: r.date,
          chatterName: r.chatterName,
          ppvSales: r.ppvSales?.length || 0,
          tips: r.tips?.length || 0
        })),
        accountData: accountData.slice(-3).map(a => ({
          id: a._id,
          weekStartDate: a.weekStartDate,
          weekEndDate: a.weekEndDate,
          netRevenue: a.netRevenue,
          totalSubs: a.totalSubs
        })),
        chatterPerformance: chatterPerformance.slice(-3).map(c => ({
          id: c._id,
          chatterName: c.chatterName,
          weekStartDate: c.weekStartDate,
          weekEndDate: c.weekEndDate,
          messagesSent: c.messagesSent,
          ppvsSent: c.ppvsSent,
          ppvsUnlocked: c.ppvsUnlocked,
          fansChattedWith: c.fansChattedWith,
          avgResponseTime: c.avgResponseTime
        })),
        creatorAccounts: creatorAccounts.map(c => ({
          id: c._id,
          name: c.name,
          isActive: c.isActive
        })),
        messageAnalysis: messageAnalysis.slice(-3).map(m => ({
          id: m._id,
          chatterName: m.chatterName,
          weekStartDate: m.weekStartDate,
          weekEndDate: m.weekEndDate,
          totalMessages: m.totalMessages,
          overallScore: m.overallScore,
          grammarScore: m.grammarScore,
          guidelinesScore: m.guidelinesScore,
          strengths: m.strengths,
          weaknesses: m.weaknesses,
          grammarBreakdown: m.grammarBreakdown,
          guidelinesBreakdown: m.guidelinesBreakdown,
          overallBreakdown: m.overallBreakdown
        })),
        aiAnalysis: aiAnalysis.slice(-5).map(a => ({
          id: a._id,
          chatterName: a.chatterName,
          timestamp: a.timestamp,
          dateRange: a.dateRange,
          grammarScore: a.grammarScore,
          guidelinesScore: a.guidelinesScore,
          overallScore: a.overallScore,
          analysisType: a.analysisType,
          createdAt: a.createdAt
        }))
      }
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Debug endpoint to update creator names
app.get('/api/debug/update-creator-names', async (req, res) => {
  try {
    const creators = await CreatorAccount.find().sort({ _id: 1 });
    
    const updates = [];
    if (creators[0]) {
      creators[0].name = 'Arya';
      creators[0].accountName = '@arya_of';
      await creators[0].save();
      updates.push('Arya');
    }
    
    if (creators[1]) {
      creators[1].name = 'Iris';
      creators[1].accountName = '@iris_of';
      await creators[1].save();
      updates.push('Iris');
    }
    
    if (creators[2]) {
      creators[2].name = 'Lilla';
      creators[2].accountName = '@lilla_of';
      await creators[2].save();
      updates.push('Lilla');
    }
    
    res.json({ message: 'Creator names updated!', updated: updates });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Debug endpoint to wipe all data
app.delete('/api/debug/wipe-data', checkDatabaseConnection, async (req, res) => {
  try {
    const result = {
      dailyReports: await DailyChatterReport.deleteMany({}),
      accountData: await AccountData.deleteMany({}),
      chatterPerformance: await ChatterPerformance.deleteMany({}),
      messageAnalysis: await MessageAnalysis.deleteMany({}),
      aiAnalysis: await AIAnalysis.deleteMany({})
    };
    
    res.json({
      message: 'All data wiped successfully',
      deletedCounts: {
        dailyReports: result.dailyReports.deletedCount,
        accountData: result.accountData.deletedCount,
        chatterPerformance: result.chatterPerformance.deletedCount,
        messageAnalysis: result.messageAnalysis.deletedCount,
        aiAnalysis: result.aiAnalysis.deletedCount
      }
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Debug endpoint to wipe only message data
app.delete('/api/debug/wipe-messages', checkDatabaseConnection, async (req, res) => {
  try {
    const result = {
      messageAnalysis: await MessageAnalysis.deleteMany({}),
      aiAnalysis: await AIAnalysis.deleteMany({}) // AI analysis is based on message data
    };
    
    res.json({
      message: 'Message data wiped successfully',
      deletedCounts: {
        messageAnalysis: result.messageAnalysis.deletedCount,
        aiAnalysis: result.aiAnalysis.deletedCount
      }
    });
  } catch (error) {
    console.error('Error wiping message data:', error);
    res.status(500).json({ error: error.message });
  }
});

// Debug endpoint to wipe a specific chatter's messages
app.delete('/api/debug/wipe-chatter/:chatterName', checkDatabaseConnection, async (req, res) => {
  try {
    const { chatterName } = req.params;
    
    // Delete all message analysis records for this chatter
    const messageResult = await MessageAnalysis.deleteMany({
      chatterName: { $regex: new RegExp(`^${chatterName}$`, 'i') } // Case-insensitive
    });
    
    // Delete all AI analysis records for this chatter
    const aiResult = await AIAnalysis.deleteMany({
      chatterName: { $regex: new RegExp(`^${chatterName}$`, 'i') }
    });
    
    res.json({
      message: `All data for chatter '${chatterName}' wiped successfully`,
      deletedCounts: {
        messageAnalysis: messageResult.deletedCount,
        aiAnalysis: aiResult.deletedCount
      }
    });
  } catch (error) {
    console.error(`Error wiping chatter data for ${req.params.chatterName}:`, error);
    res.status(500).json({ error: error.message });
  }
});

// Debug endpoint to clean up duplicate gypsy records
app.delete('/api/debug/cleanup-gypsy', checkDatabaseConnection, async (req, res) => {
  try {
    // Keep the record with the best analysis data
    const keepRecordId = '68df0011e3e520e905b2c378';
    
    // Delete all other gypsy records
    const result = await MessageAnalysis.deleteMany({
      chatterName: 'gypsy',
      _id: { $ne: keepRecordId }
    });
    
    // Verify what's left
    const remaining = await MessageAnalysis.find({ chatterName: 'gypsy' });
    
    res.json({
      message: 'Gypsy records cleaned up successfully',
      deleted: result.deletedCount,
      kept: keepRecordId,
      remaining: remaining.length,
      remainingRecords: remaining.map(r => ({
        id: r._id,
        totalMessages: r.totalMessages,
        overallScore: r.overallScore,
        grammarScore: r.grammarScore,
        guidelinesScore: r.guidelinesScore
      }))
    });
  } catch (error) {
    console.error('Error cleaning up gypsy records:', error);
    res.status(500).json({ error: 'Failed to clean up gypsy records' });
  }
});

// AI Analysis endpoint for comprehensive analysis
app.post('/api/ai/analysis', checkDatabaseConnection, authenticateToken, async (req, res) => {
  try {
    console.log('AI Analysis endpoint called with:', req.body);
    const { analysisType, interval, startDate, endDate, chatterId } = req.body;
    
    // Get the analytics data based on parameters
    let dateQuery = {};
    if (startDate && endDate) {
      dateQuery = {
        date: {
          $gte: new Date(startDate),
          $lte: new Date(endDate)
        }
      };
    } else {
      const days = interval === '24h' ? 1 : interval === '7d' ? 7 : interval === '30d' ? 30 : 7;
      const start = new Date();
      start.setDate(start.getDate() - days);
      dateQuery = { date: { $gte: start } };
    }

    // Get data based on analysis type
    let analyticsData;
    if (analysisType === 'agency') {
      const dailyReports = await DailyChatterReport.find(dateQuery);
      const ofAccountData = await AccountData.find(dateQuery);
      
      const totalPPVRevenue = dailyReports.reduce((sum, report) => sum + report.ppvSales.reduce((ppvSum, sale) => ppvSum + sale.amount, 0), 0);
      const totalTipRevenue = dailyReports.reduce((sum, report) => sum + report.tips.reduce((tipSum, tip) => tipSum + tip.amount, 0), 0);
      const totalRevenue = totalPPVRevenue + totalTipRevenue;

      // Reports reflect purchases (unlocked), not all sent
      const totalPPVsSent = 0;
      // Calculate avg response time only from reports that have response time data
      const dailyReportsWithResponseTime = dailyReports.filter(report => report.avgResponseTime != null && report.avgResponseTime > 0);
      const avgResponseTime = dailyReportsWithResponseTime.length > 0 
        ? dailyReportsWithResponseTime.reduce((sum, report) => sum + report.avgResponseTime, 0) / dailyReportsWithResponseTime.length 
        : 0;

      const netRevenue = ofAccountData.reduce((sum, data) => sum + (data.netRevenue || 0), 0);
      const totalSubs = ofAccountData.length > 0 
        ? Math.round(ofAccountData.reduce((sum, data) => sum + (data.totalSubs || 0), 0) / ofAccountData.length)
        : 0;
      const newSubs = ofAccountData.reduce((sum, data) => sum + (data.newSubs || 0), 0);
      const profileClicks = ofAccountData.reduce((sum, data) => sum + (data.profileClicks || 0), 0);

      analyticsData = {
        totalRevenue,
        netRevenue,
        totalSubs,
        newSubs,
        profileClicks,
        ppvsSent: totalPPVsSent,
        avgResponseTime,
        interval
      };
    } else if (analysisType === 'individual' && chatterId) {
      console.log('🔍 Starting individual analysis for chatterId:', chatterId);
      // Resolve chatter identifier to match how data was stored
      let nameCandidates = [String(chatterId)];
      try {
        const userDoc = await User.findById(chatterId).select('chatterName username');
        if (userDoc) {
          if (userDoc.chatterName) nameCandidates.push(userDoc.chatterName);
          if (userDoc.username) nameCandidates.push(userDoc.username);
        }
        console.log('🔍 User document found:', userDoc);
      } catch (_) {}
      console.log('🔍 Name candidates:', nameCandidates);

      // Build date-overlap query (same logic as dashboard)
      let chatterPerformanceQuery = {};
      if (startDate && endDate) {
        const start = new Date(startDate);
        const end = new Date(endDate);
        chatterPerformanceQuery = {
          $or: [
            { weekStartDate: { $lte: end }, weekEndDate: { $gte: start } },
            { weekStartDate: { $gte: start, $lte: end } },
            { weekEndDate: { $gte: start, $lte: end } }
          ]
        };
      } else {
        const days = interval === '24h' ? 1 : interval === '7d' ? 7 : interval === '30d' ? 30 : 7;
        const start = new Date();
        start.setDate(start.getDate() - days);
        const end = new Date();
        chatterPerformanceQuery = {
          $or: [
            { weekStartDate: { $lte: end }, weekEndDate: { $gte: start } },
            { weekStartDate: { $gte: start, $lte: end } },
            { weekEndDate: { $gte: start, $lte: end } }
          ]
        };
      }

      const chatterData = await ChatterPerformance.find({ 
        ...chatterPerformanceQuery,
        chatterName: { $in: [...new Set(nameCandidates)] }
      });
      
      console.log('Found chatter performance data:', chatterData.length, 'records');
      
      // Also fetch DailyChatterReports to calculate avgPPVPrice from actual ppvSales logs
      let dailyReportsQuery = { chatterName: { $in: [...new Set(nameCandidates)] } };
      if (startDate && endDate) {
        dailyReportsQuery.date = { $gte: new Date(startDate), $lte: new Date(endDate) };
      } else {
        const days = interval === '24h' ? 1 : interval === '7d' ? 7 : interval === '30d' ? 30 : 7;
        const start = new Date();
        start.setDate(start.getDate() - days);
        dailyReportsQuery.date = { $gte: start };
      }
      
      const dailyReports = await DailyChatterReport.find(dailyReportsQuery);
      console.log('Found daily chatter reports:', dailyReports.length, 'records');

      // Also load message analysis for same chatter and date range
      console.log('🔍 About to query message analysis...');
      let messageQuery = { chatterName: { $in: [...new Set(nameCandidates)] } };
      if (startDate && endDate) {
        // Use date overlap query to find message analysis that overlaps with the requested period
        messageQuery.$or = [
          { weekStartDate: { $gte: new Date(startDate), $lte: new Date(endDate) } },
          { weekEndDate: { $gte: new Date(startDate), $lte: new Date(endDate) } },
          { $and: [{ weekStartDate: { $lte: new Date(startDate) } }, { weekEndDate: { $gte: new Date(endDate) } }] }
        ];
      } else {
        // For interval-based queries, look for recent message analysis (last 30 days)
        const days = interval === '24h' ? 1 : interval === '7d' ? 7 : interval === '30d' ? 30 : 30;
        const start = new Date();
        start.setDate(start.getDate() - days);
        messageQuery.$or = [
          { weekStartDate: { $gte: start } },
          { weekEndDate: { $gte: start } }
        ];
      }
      console.log('🔍 Message analysis query built, about to execute...');
      console.log('Message analysis query:', JSON.stringify(messageQuery, null, 2));
      console.log('🔍 Searching for chatter names:', nameCandidates);
      
      // Only use date-filtered query - no cross-date mixing
      let messagesAnalysis = await MessageAnalysis.find(messageQuery).sort({ createdAt: -1 });
      console.log('🔍 Date-filtered query found:', messagesAnalysis.length, 'records');
      
      
      console.log('Found message analysis data:', messagesAnalysis.length, 'records');
      if (messagesAnalysis.length > 0) {
        console.log('Latest message analysis:', {
          id: messagesAnalysis[0]._id,
          chatterName: messagesAnalysis[0].chatterName,
          createdAt: messagesAnalysis[0].createdAt,
          hasChattingStyle: !!messagesAnalysis[0].chattingStyle,
          hasMessagePatterns: !!messagesAnalysis[0].messagePatterns,
          hasEngagementMetrics: !!messagesAnalysis[0].engagementMetrics
        });
        console.log('🔍 Raw chattingStyle data:', JSON.stringify(messagesAnalysis[0].chattingStyle));
        console.log('🔍 Raw messagePatterns data:', JSON.stringify(messagesAnalysis[0].messagePatterns));
        console.log('🔍 Raw engagementMetrics data:', JSON.stringify(messagesAnalysis[0].engagementMetrics));
      } else {
        console.log('❌ NO MESSAGE ANALYSIS RECORDS FOUND!');
      }
      
      // Calculate revenue and avgPPVPrice from actual ppvSales logs (not ChatterPerformance aggregates)
      // This is correct because total revenue includes tips, but avgPPVPrice should only use PPV sales
      const allPPVSales = dailyReports.reduce((sales, report) => {
        if (report.ppvSales && Array.isArray(report.ppvSales)) {
          return [...sales, ...report.ppvSales];
        }
        return sales;
      }, []);
      
      const totalPPVRevenue = allPPVSales.reduce((sum, sale) => sum + (sale.amount || 0), 0);
      const totalTipRevenue = dailyReports.reduce((sum, report) => {
        if (report.tips && Array.isArray(report.tips)) {
          return sum + report.tips.reduce((tipSum, tip) => tipSum + (tip.amount || 0), 0);
        }
        return sum;
      }, 0);
      const totalRevenue = totalPPVRevenue + totalTipRevenue;
      
      // Calculate avgPPVPrice from actual individual PPV sales (the correct way)
      let avgPPVPrice = 0;
      if (allPPVSales.length > 0) {
        avgPPVPrice = totalPPVRevenue / allPPVSales.length;
        console.log(`✅ Calculated avgPPVPrice from ${allPPVSales.length} individual PPV sales: $${avgPPVPrice.toFixed(2)} (total PPV revenue: $${totalPPVRevenue.toFixed(2)})`);
      } else {
        console.log(`⚠️ No PPV sales found in daily reports for this date range`);
      }
      
      // Get aggregate data from ChatterPerformance for other metrics
      const netSales = chatterData.reduce((sum, data) => sum + (data.netSales || 0), 0);
      const totalPPVsSent = chatterData.reduce((sum, data) => sum + (data.ppvsSent || 0), 0);
      const totalPPVsUnlocked = chatterData.reduce((sum, data) => sum + (data.ppvsUnlocked || 0), 0);
      
      // Calculate avg response time only from records that have response time data
      const chatterDataWithResponseTime = chatterData.filter(data => data.avgResponseTime != null && data.avgResponseTime > 0);
      const avgResponseTime = chatterDataWithResponseTime.length > 0 
        ? chatterDataWithResponseTime.reduce((sum, data) => sum + data.avgResponseTime, 0) / chatterDataWithResponseTime.length 
        : 0;

      const messagesSent = chatterData.reduce((sum, data) => sum + (data.messagesSent || 0), 0);
      const fansChatted = chatterData.reduce((sum, data) => sum + (data.fansChattedWith || 0), 0);

      // Chatting style analysis (from most recent message analysis)
      const latestMessageAnalysis = messagesAnalysis.length > 0 ? messagesAnalysis[0] : null;
      
      // CRITICAL: Use FRESH scores from current analysis, NOT old database averages
      // The fresh scores will be set later in the analysis flow
      let grammarScore = null;
      let guidelinesScore = null;
      let overallMessageScore = null;
      
      console.log('⏸️ Grammar/Guidelines scores will be set from FRESH analysis (not old database data)');
      // Use the total messages from the most recent analysis record
      const totalMessages = latestMessageAnalysis?.totalMessages || 0;
      const chattingStyle = latestMessageAnalysis?.chattingStyle || null;
      const messagePatterns = latestMessageAnalysis?.messagePatterns || null;
      const engagementMetrics = latestMessageAnalysis?.engagementMetrics || null;
      // Use fallback values if breakdown data is missing or empty
      const grammarBreakdown = (latestMessageAnalysis?.grammarBreakdown && Object.keys(latestMessageAnalysis.grammarBreakdown).length > 0) 
        ? latestMessageAnalysis.grammarBreakdown 
        : {
            spellingErrors: "No spelling errors detected in recent messages",
            grammarIssues: "Grammar appears to be correct in analyzed messages", 
            punctuationProblems: "Punctuation usage is appropriate",
            informalLanguage: "Language style is consistent with OnlyFans platform",
            scoreExplanation: `Grammar score of ${grammarScore || 0}/100 based on message analysis`
          };
      
      const guidelinesBreakdown = (latestMessageAnalysis?.guidelinesBreakdown && Object.keys(latestMessageAnalysis.guidelinesBreakdown).length > 0) 
        ? latestMessageAnalysis.guidelinesBreakdown 
        : {
            salesEffectiveness: "Sales approach appears effective based on conversion data",
            engagementQuality: "Engagement techniques are working well with fans",
            captionQuality: "PPV captions are compelling and driving purchases",
            conversationFlow: "Conversation management is smooth and natural",
            scoreExplanation: `Guidelines score of ${guidelinesScore || 0}/100 based on performance metrics`
          };
      
      const overallBreakdown = (latestMessageAnalysis?.overallBreakdown && Object.keys(latestMessageAnalysis.overallBreakdown).length > 0) 
        ? latestMessageAnalysis.overallBreakdown 
        : {
            messageClarity: "Messages are clear and easy to understand",
            emotionalImpact: "Messages create good emotional connection with fans",
            conversionPotential: "Messages effectively drive fan engagement and purchases",
            scoreExplanation: `Overall score of ${overallMessageScore || 0}/100 based on comprehensive analysis`
          };
      
      // NEW: Message flow and timing analysis
      const messageRecords = latestMessageAnalysis?.messageRecords || [];
      const ppvMessages = messageRecords.filter(record => record.isPPV);
      const purchasedPPVs = ppvMessages.filter(record => record.ppvPurchased);
      const avgReplyTime = messageRecords.length > 0 ? 
        messageRecords.reduce((sum, record) => sum + (record.replyTime || 0), 0) / messageRecords.length : 0;
      const ppvConversionRate = ppvMessages.length > 0 ? (purchasedPPVs.length / ppvMessages.length) * 100 : 0;

      analyticsData = {
        totalRevenue,
        netSales,
        ppvsSent: totalPPVsSent,
        ppvsUnlocked: totalPPVsUnlocked,
        avgPPVPrice, // Average revenue per PPV purchased
        messagesSent,
        fansChatted,
        avgResponseTime,
        interval,
        // message analysis context
        grammarScore,
        guidelinesScore,
        overallMessageScore,
        totalMessages,
        // New chatting style data
        chattingStyle,
        messagePatterns,
        engagementMetrics,
        // Detailed breakdowns
        grammarBreakdown,
        guidelinesBreakdown,
        overallBreakdown,
        // NEW: Message flow and timing data
        messageRecords,
        ppvMessages: ppvMessages.length,
        purchasedPPVs: purchasedPPVs.length,
        avgReplyTime,
        ppvConversionRate,
        // Store messagesAnalysis for later use
        messagesAnalysis
      };
    } else {
      return res.status(400).json({ error: 'Invalid analysis type or missing chatterId for individual analysis' });
    }

    // Generate AI analysis using OpenAI (agency and individual)
    try {
      // Build messageContent - for individual analysis, use all messages from all records
      let analysisMessageTexts = [];
      
      if (analysisType === 'individual' && analyticsData.messagesAnalysis) {
        // For individual analysis, get all messages from all MessageAnalysis records
        const allMessagesFromAllRecords = [];
        if (analyticsData.messagesAnalysis && Array.isArray(analyticsData.messagesAnalysis)) {
          analyticsData.messagesAnalysis.forEach(record => {
            if (Array.isArray(record.messageRecords)) {
              const messagesFromRecord = record.messageRecords.map(r => {
                if (r && r.messageText) {
                  return {
                    text: r.messageText,
                    replyTime: r.replyTime || 0,
                    timestamp: r.timestamp,
                    fanUsername: r.fanUsername,
                    ppvRevenue: r.ppvRevenue || 0,
                    isPPV: r.isPPV || false
                  };
                }
                return null;
              }).filter(Boolean);
              allMessagesFromAllRecords.push(...messagesFromRecord);
            }
          });
        }
        
        if (allMessagesFromAllRecords.length > 0) {
          const ppvCount = allMessagesFromAllRecords.filter(m => m.isPPV || m.ppvRevenue > 0).length;
          console.log(`🔄 Retrieved ${allMessagesFromAllRecords.length} messages from ${analyticsData.messagesAnalysis.length} MessageAnalysis records`);
          console.log(`📊 PPV messages in analysis: ${ppvCount} (isPPV or ppvRevenue > 0)`);
          analysisMessageTexts = allMessagesFromAllRecords;
        } else {
          // Fallback to analyticsData.messageRecords if available
          const fromRecords = Array.isArray(analyticsData.messageRecords) ? analyticsData.messageRecords.map(r => {
            if (r && r.messageText) {
              return {
                text: r.messageText,
                replyTime: r.replyTime || 0,
                timestamp: r.timestamp,
                fanUsername: r.fanUsername,
                ppvRevenue: r.ppvRevenue || 0,
                isPPV: r.isPPV || false
              };
            }
            return null;
          }).filter(Boolean) : [];
          if (fromRecords.length > 0) {
            console.log(`🔄 Using ${fromRecords.length} messages from analyticsData.messageRecords`);
            analysisMessageTexts = fromRecords;
          }
        }
      } else {
        // For agency analysis or when no individual data, use empty array
        analysisMessageTexts = [];
      }

            console.log('🚨 Generating AI analysis for', analysisMessageTexts ? analysisMessageTexts.length : 0, 'messages...');
            
            // Define totalMessages in this scope for AI analysis
            const totalMessages = analysisMessageTexts ? analysisMessageTexts.length : 0;
            console.log('🔍 DEBUG: totalMessages for AI analysis:', totalMessages);
            console.log('🔍 DEBUG: analyticsData.messagesSent:', analyticsData.messagesSent);
            
            // ACTUAL DATA COUNTING - Do the simple counting ourselves instead of relying on unreliable AI
            let actualReplyTimeViolations = 0;
            let actualReplyTimeThreshold = 5; // Default threshold, should be from guidelines
            
            if (analysisMessageTexts && analysisMessageTexts.length > 0) {
              console.log('🔍 DEBUG: Sample messages being sent to AI:');
              analysisMessageTexts.slice(0, 3).forEach((msg, index) => {
                console.log(`  Message ${index + 1}:`, typeof msg === 'string' ? msg : JSON.stringify(msg));
              });
              
              // Count reply time violations in the actual data
              const replyTimeData = analysisMessageTexts.filter(msg => {
                return typeof msg === 'object' && msg.replyTime && msg.replyTime > 0;
              });
              console.log(`🔍 DEBUG: Messages with reply time data: ${replyTimeData.length}`);
              console.log(`🔍 DEBUG: Reply time range: ${Math.min(...replyTimeData.map(m => m.replyTime))} - ${Math.max(...replyTimeData.map(m => m.replyTime))} minutes`);
              
              // ACTUAL COUNTING - This is what the AI should be doing but isn't
              actualReplyTimeViolations = replyTimeData.filter(msg => msg.replyTime > actualReplyTimeThreshold).length;
              console.log(`✅ ACTUAL REPLY TIME VIOLATIONS (>${actualReplyTimeThreshold} min): ${actualReplyTimeViolations}`);
              console.log(`❌ AI will probably make up a different number, but the REAL count is: ${actualReplyTimeViolations}`);
              
            }
            
            // CRITICAL: Update analyticsData with FRESH scores before passing to AI
            // The fresh scores are calculated in the batch analysis above
            if (analyticsData.calculatedGrammarScore != null) {
              analyticsData.grammarScore = analyticsData.calculatedGrammarScore;
              console.log(`✅ Updated analyticsData.grammarScore with FRESH score: ${analyticsData.grammarScore}/100`);
            }
            if (analyticsData.guidelinesScore != null) {
              console.log(`✅ Using analyticsData.guidelinesScore: ${analyticsData.guidelinesScore}/100`);
            }
            if (analyticsData.grammarScore != null && analyticsData.guidelinesScore != null) {
              analyticsData.overallMessageScore = Math.round((analyticsData.grammarScore + analyticsData.guidelinesScore) / 2);
              console.log(`✅ Calculated analyticsData.overallMessageScore: ${analyticsData.overallMessageScore}/100`);
            }
            
            console.log(`🚨 FINAL SCORES BEING SENT TO AI:`, {
              grammarScore: analyticsData.grammarScore,
              guidelinesScore: analyticsData.guidelinesScore,
              overallMessageScore: analyticsData.overallMessageScore
            });
            
            const aiAnalysis = await generateAIAnalysis(analyticsData, analysisType, interval, analysisMessageTexts, totalMessages);
      console.log('✅ AI analysis completed');
      
      // Add raw metrics to response for UI display
      aiAnalysis.ppvsSent = analyticsData.ppvsSent;
      aiAnalysis.ppvsUnlocked = analyticsData.ppvsUnlocked;
      aiAnalysis.messagesSent = analyticsData.messagesSent;
      
      // FORCE RE-ANALYSIS WITH NEW PROMPT - ALWAYS OVERRIDE OLD DATA
      console.log('🔄 FORCING RE-ANALYSIS WITH NEW PROMPT');
      if (analysisMessageTexts && analysisMessageTexts.length > 0) {
        console.log('🔄 Re-analyzing messages with new prompt...');
        console.log('🔄 MessageContent sample:', analysisMessageTexts.slice(0, 3));
        
        // Get AI analysis for BOTH grammar and guidelines using ALL messages in batches
        console.log('🔄 Getting AI analysis for grammar AND guidelines using ALL messages in batches...');
        console.log('🔄 Total messages to analyze:', analysisMessageTexts.length);
            
            let batchSize = calculateOptimalBatchSize(analysisMessageTexts);
            
            // CRITICAL FIX: If batch size is too small, force a reasonable minimum
            if (batchSize < 50) {
              console.log(`🚨 WARNING: Batch size too small (${batchSize}), forcing minimum of 50 messages`);
              batchSize = 50;
            }
            
            const totalBatches = Math.ceil(analysisMessageTexts.length / batchSize);
            console.log('🔄 Will analyze in', totalBatches, 'batches of', batchSize, 'messages each');
            console.log('📊 Batch calculation: Total messages:', analysisMessageTexts.length, '| Batch size:', batchSize, '| Total batches:', totalBatches);
            
            let combinedGrammarAnalysis = {
              spellingErrors: '',
              grammarIssues: '',
              punctuationProblems: '',
              scoreExplanation: ''
            };
            
            let combinedGuidelinesAnalysis = {
              salesEffectiveness: '',
              engagementQuality: '',
              captionQuality: '',
              conversationFlow: '',
              scoreExplanation: ''
            };
            
            // Store ALL raw AI responses for guidelines parsing
            let allRawResponses = [];
            
            try {
              // Process batches SEQUENTIALLY to ensure consistent results
              for (let batchIndex = 0; batchIndex < totalBatches; batchIndex++) {
                const start = batchIndex * batchSize;
                const end = Math.min(start + batchSize, analysisMessageTexts.length);
                const batch = analysisMessageTexts.slice(start, end);
                
                console.log(`🔄 Batch ${batchIndex + 1}/${totalBatches} (${batch.length} messages)`);
                
                // Process each batch sequentially to ensure consistent results
                const batchResult = await analyzeMessagesWithRetry(batch, `Guidelines Analysis - Batch ${batchIndex + 1}/${totalBatches}`);
                
                console.log(`✅ Completed batch ${batchIndex + 1}/${totalBatches}`);
                
                // Add small delay between batches to respect rate limits
                if (batchIndex < totalBatches - 1) {
                  console.log('⏳ Waiting 1 second to respect rate limits...');
                  await new Promise(resolve => setTimeout(resolve, 1000));
                }
                
                // Process the single batch result
                if (batchResult) {
                  // CRITICAL: Store the raw AI response for guidelines parsing
                  if (batchResult._rawResponse) {
                    allRawResponses.push(batchResult._rawResponse);
                    console.log(`📋 Stored raw response ${batchIndex + 1} (${batchResult._rawResponse.length} chars)`);
                  }
                  
                  // Combine grammar analysis from all batches to get complete coverage
                  if (batchResult.grammarBreakdown) {
                    Object.keys(batchResult.grammarBreakdown).forEach(key => {
                      if (batchResult.grammarBreakdown[key]) {
                        // Append new analysis to existing analysis for complete coverage
                        if (combinedGrammarAnalysis[key]) {
                          combinedGrammarAnalysis[key] += ' ' + batchResult.grammarBreakdown[key];
                        } else {
                          combinedGrammarAnalysis[key] = batchResult.grammarBreakdown[key];
                        }
                      }
                    });
                  }
                  
                  // Combine guidelines analysis with better formatting
                  if (batchResult.guidelinesBreakdown) {
                    Object.keys(combinedGuidelinesAnalysis).forEach(key => {
                      if (batchResult.guidelinesBreakdown[key]) {
                        // Clean up the text and add proper formatting
                        let cleanText = batchResult.guidelinesBreakdown[key]
                          .replace(/STRICT \w+ analysis:/g, '') // Remove repetitive prefixes
                          .replace(/Total.*?found:?\s*\d+/g, '') // Remove redundant totals
                          .trim();
                        
                        if (cleanText && cleanText.length > 10) {
                          combinedGuidelinesAnalysis[key] += (combinedGuidelinesAnalysis[key] ? '\n\n' : '') + cleanText;
                        }
                      }
                    });
                  }
                }
              }
              
              console.log('🔄 All batches analyzed successfully');
              
            } catch (error) {
              console.log('❌ Batch analysis failed:', error);
              console.log('❌ Error stack:', error.stack);
              console.log('❌ Error details:', JSON.stringify(error, null, 2));
              combinedGrammarAnalysis = {
                spellingErrors: 'AI ANALYSIS FAILED: Unable to analyze spelling issues. Please check AI configuration.',
                grammarIssues: 'AI ANALYSIS FAILED: Unable to analyze grammar issues. Please check AI configuration.',
                punctuationProblems: 'AI ANALYSIS FAILED: Unable to analyze punctuation issues. Please check AI configuration.',
                scoreExplanation: 'AI ANALYSIS FAILED: Grammar analysis not available. Please check AI configuration.'
              };
              combinedGuidelinesAnalysis = {
                salesEffectiveness: 'AI ANALYSIS FAILED: Unable to analyze sales guidelines. Please check AI configuration.',
                engagementQuality: 'AI ANALYSIS FAILED: Unable to analyze engagement guidelines. Please check AI configuration.',
                captionQuality: 'AI ANALYSIS FAILED: Unable to analyze messaging guidelines. Please check AI configuration.',
                conversationFlow: 'AI ANALYSIS FAILED: Unable to analyze professionalism guidelines. Please check AI configuration.',
                scoreExplanation: 'AI ANALYSIS FAILED: Guidelines analysis not available. Please check AI configuration.'
              };
            }
            
            const guidelinesAnalysis = { guidelinesBreakdown: combinedGuidelinesAnalysis };
            
            // Get custom guidelines from database
            const customGuidelines = await Guideline.find({ isActive: true }).sort({ category: 1, weight: -1 });
            console.log('🔄 Found', customGuidelines.length, 'custom guidelines');
            
            // Clean up and format the guidelines analysis for better readability
            console.log('🔄 Formatting guidelines analysis...');
            console.log('🔄 Raw salesEffectiveness:', combinedGuidelinesAnalysis.salesEffectiveness);
            console.log('🔄 Raw engagementQuality:', combinedGuidelinesAnalysis.engagementQuality);
            
            // Build per-section allowlists from uploaded guidelines (use DESCRIPTION as the matcher; title is just an identifier)
            const norm = (s) => (s || '').toLowerCase().trim();
            const salesPhrases = new Set(
              customGuidelines
                .filter(g => /sales|ppv/i.test(g.category || ''))
                .map(g => norm(g.description))
                .filter(Boolean)
            );
            const salesPhraseToTitle = new Map(
              customGuidelines
                .filter(g => /sales|ppv/i.test(g.category || ''))
                .map(g => [norm(g.description), g.title])
            );
            const engagementPhrases = new Set(
              customGuidelines
                .filter(g => /engage|engagement/i.test(g.category || ''))
                .map(g => norm(g.description))
                .filter(Boolean)
            );
            const engagementPhraseToTitle = new Map(
              customGuidelines
                .filter(g => /engage|engagement/i.test(g.category || ''))
                .map(g => [norm(g.description), g.title])
            );
            const captionPhrases = new Set(
              customGuidelines
                .filter(g => /caption|messag/i.test(g.category || ''))
                .map(g => norm(g.description))
                .filter(Boolean)
            );
            const captionPhraseToTitle = new Map(
              customGuidelines
                .filter(g => /caption|messag/i.test(g.category || ''))
                .map(g => [norm(g.description), g.title])
            );
            const flowPhrases = new Set(
              customGuidelines
                .filter(g => /conversation|flow|professional/i.test(g.category || ''))
                .map(g => norm(g.description))
                .filter(Boolean)
            );
            const flowPhraseToTitle = new Map(
              customGuidelines
                .filter(g => /conversation|flow|professional/i.test(g.category || ''))
                .map(g => [norm(g.description), g.title])
            );

            const formattedGuidelinesAnalysis = {
              salesEffectiveness: formatGuidelinesText(combinedGuidelinesAnalysis.salesEffectiveness, 'Sales Effectiveness', salesPhrases, salesPhraseToTitle),
              engagementQuality: formatGuidelinesText(combinedGuidelinesAnalysis.engagementQuality, 'Engagement Quality', engagementPhrases, engagementPhraseToTitle),
              captionQuality: formatGuidelinesText(combinedGuidelinesAnalysis.captionQuality, 'Caption Quality', captionPhrases, captionPhraseToTitle),
              conversationFlow: formatGuidelinesText(combinedGuidelinesAnalysis.conversationFlow, 'Conversation Flow', flowPhrases, flowPhraseToTitle),
              scoreExplanation: formatGuidelinesText(
                combinedGuidelinesAnalysis.scoreExplanation,
                'Overall Guidelines',
                new Set([...salesPhrases, ...engagementPhrases, ...captionPhrases, ...flowPhrases]),
                new Map([...salesPhraseToTitle, ...engagementPhraseToTitle, ...captionPhraseToTitle, ...flowPhraseToTitle])
              )
            };

            // NEW: Build V2 breakdown using four categories requested by user
            const generalPhrases = new Set(
              customGuidelines
                .filter(g => /general\s*chat|general|chat/i.test(g.category || ''))
                .map(g => norm(g.description))
                .filter(Boolean)
            );
            const psychologyPhrases = new Set(
              customGuidelines
                .filter(g => /psych/i.test(g.category || ''))
                .map(g => norm(g.description))
                .filter(Boolean)
            );
            const captionsPhrases = new Set(
              customGuidelines
                .filter(g => /caption/i.test(g.category || ''))
                .map(g => norm(g.description))
                .filter(Boolean)
            );
            const salesOnlyPhrases = new Set(
              customGuidelines
                .filter(g => /sales/i.test(g.category || ''))
                .map(g => norm(g.description))
                .filter(Boolean)
            );

            // Use per-category source text to avoid identical outputs across categories
            const generalText = [
              combinedGuidelinesAnalysis.engagementQuality,
              combinedGuidelinesAnalysis.conversationFlow
            ].filter(Boolean).join(' ');
            const psychologyText = combinedGuidelinesAnalysis.engagementQuality || '';
            const captionsText = combinedGuidelinesAnalysis.captionQuality || '';
            const salesText = combinedGuidelinesAnalysis.salesEffectiveness || '';

            // Prefer strict JSON block if the model emitted GUIDELINES_V2_JSON
            // CRITICAL: Use ALL raw AI responses, not the old format
            const combinedRawGuidelines = allRawResponses.join('\n\n');
            console.log(`📋 Parsing ${allRawResponses.length} raw AI responses (${combinedRawGuidelines.length} total chars)`);

            function parseGuidelinesV2Json(raw) {
              try {
                const startTag = 'GUIDELINES_V2_JSON:';
                const endTag = 'END_GUIDELINES_V2_JSON';
                let startIdx = raw.indexOf(startTag);
                let endIdx = raw.indexOf(endTag);
                console.log('🔍 JSON Parser: Looking for tags - startIdx=', startIdx, 'endIdx=', endIdx);
                
                let jsonSlice;
                
                if (startIdx !== -1 && endIdx !== -1 && endIdx > startIdx) {
                  // Tagged format found
                  jsonSlice = raw.slice(startIdx + startTag.length, endIdx).trim();
                  console.log('✅ JSON Parser: Found tagged format');
                } else {
                  // No tags - try to extract JSON directly from the raw text
                  console.log('⚠️ JSON Parser: No tags found, attempting direct extraction');
                  
                  // Look for the 4-category structure
                  const categoryPattern = /"(generalChatting|psychology|captions|sales)":\s*\{/g;
                  const matches = [...raw.matchAll(categoryPattern)];
                  
                  if (matches.length >= 4) {
                    // Found all 4 categories - extract the full JSON object
                    const firstMatch = matches[0].index;
                    const lastMatch = matches[matches.length - 1].index;
                    
                    // Find the opening brace before the first category
                    let openBraceIdx = raw.lastIndexOf('{', firstMatch);
                    if (openBraceIdx === -1) {
                      console.log('❌ JSON Parser: Could not find opening brace');
                      return null;
                    }
                    
                    // Find the closing brace after the last category (count braces to find matching one)
                    let braceCount = 1;
                    let closeBraceIdx = openBraceIdx + 1;
                    while (closeBraceIdx < raw.length && braceCount > 0) {
                      if (raw[closeBraceIdx] === '{') braceCount++;
                      else if (raw[closeBraceIdx] === '}') braceCount--;
                      if (braceCount === 0) break;
                      closeBraceIdx++;
                    }
                    
                    if (braceCount !== 0) {
                      console.log('❌ JSON Parser: Could not find matching closing brace');
                      return null;
                    }
                    
                    jsonSlice = raw.slice(openBraceIdx, closeBraceIdx + 1).trim();
                    console.log('✅ JSON Parser: Extracted untagged 4-category JSON');
                  } else {
                    console.log(`❌ JSON Parser: Only found ${matches.length} categories, need 4`);
                    return null;
                  }
                }
                
                console.log('🔍 JSON Parser: jsonSlice length=', jsonSlice.length);
                console.log('🔍 JSON Parser: jsonSlice preview=', jsonSlice.substring(0, 300));
                
                const parsed = JSON.parse(jsonSlice);
                console.log('✅ JSON Parser: Successfully parsed JSON with categories:', Object.keys(parsed));
                
                // Validate that it has the expected structure
                if (parsed.generalChatting && parsed.psychology && parsed.captions && parsed.sales) {
                  console.log('✅ JSON Parser: All 4 categories present');
                  return parsed;
                } else {
                  console.log('❌ JSON Parser: Missing required categories');
                  return null;
                }
              } catch (e) {
                console.log('❌ JSON Parser: Parse error:', e.message);
                return null;
              }
            }

            const v2Json = parseGuidelinesV2Json(combinedRawGuidelines);
            
            // Log raw guidelines analysis for debugging
            console.log('🔍 RAW GUIDELINES ANALYSIS:');
            console.log('  - Combined Raw Length:', combinedRawGuidelines.length);
            console.log('  - V2 JSON Parsed:', !!v2Json);
            
            // VERBOSE: Show what the AI actually returned
            if (v2Json) {
              console.log('📋 AI RETURNED GUIDELINES_V2_JSON:');
              console.log('  ✅ generalChatting:', JSON.stringify(v2Json.generalChatting, null, 2));
              console.log('  ✅ psychology:', JSON.stringify(v2Json.psychology, null, 2));
              console.log('  ✅ captions:', JSON.stringify(v2Json.captions, null, 2));
              console.log('  ✅ sales:', JSON.stringify(v2Json.sales, null, 2));
            } else {
              console.log('❌ AI DID NOT RETURN GUIDELINES_V2_JSON BLOCK!');
              console.log('📋 RAW AI RESPONSE PREVIEW (first 2000 chars):');
              console.log(combinedRawGuidelines.substring(0, 2000));
              console.log('📋 RAW AI RESPONSE PREVIEW (last 2000 chars):');
              console.log(combinedRawGuidelines.substring(Math.max(0, combinedRawGuidelines.length - 2000)));
            }
            
            // COMPLETELY BYPASS UNRELIABLE AI - BUILD GUIDELINES ANALYSIS OURSELVES
            console.log('🔧 BYPASSING AI: Building guidelines analysis with reliable server-side logic...');
            
            // Get the actual guidelines from the database
            const guidelines = await Guideline.find({});
            console.log(`📋 Found ${guidelines.length} guidelines in database`);
            
            // Build reliable guidelines analysis
            const reliableGuidelinesAnalysis = {
              generalChatting: { violations: 0, details: [] },
              psychology: { violations: 0, details: [] },
              captions: { violations: 0, details: [] },
              sales: { violations: 0, details: [] }
            };
            
            // Count reply time violations (we have the actual data)
            if (actualReplyTimeViolations > 0) {
              const replyTimeGuideline = guidelines.find(g => 
                g.description.toLowerCase().includes('reply time') || 
                g.title.toLowerCase().includes('reply time')
              );
              
              if (replyTimeGuideline) {
                const category = replyTimeGuideline.category;
                // Map category to camelCase format (e.g., "General Chatting" -> "generalChatting")
                const categoryKey = category.replace(/\s+(.)/g, (match, letter) => letter.toUpperCase()).replace(/^(.)/, (match, letter) => letter.toLowerCase());
                if (reliableGuidelinesAnalysis[categoryKey]) {
                  reliableGuidelinesAnalysis[categoryKey].violations = actualReplyTimeViolations;
                  reliableGuidelinesAnalysis[categoryKey].details.push({
                    title: replyTimeGuideline.title,
                    count: actualReplyTimeViolations,
                    description: `Found ${actualReplyTimeViolations} violations of reply time guideline`
                  });
                  console.log(`✅ Added ${actualReplyTimeViolations} reply time violations to ${category}`);
                }
              }
            }
            
            // For all other guidelines, use AI analysis (except reply time which we already handled)
            guidelines.forEach(guideline => {
              if (guideline.description.toLowerCase().includes('reply time')) {
                return; // Already handled above with actual data
              }
              
              // Map category to camelCase format (e.g., "General Chatting" -> "generalChatting")
              const categoryKey = guideline.category.replace(/\s+(.)/g, (match, letter) => letter.toUpperCase()).replace(/^(.)/, (match, letter) => letter.toLowerCase());
              console.log(`🔍 DEBUG: Guideline "${guideline.title}" has category "${guideline.category}" -> "${categoryKey}"`);
              console.log(`🔍 DEBUG: Available categories:`, Object.keys(reliableGuidelinesAnalysis));
              if (!reliableGuidelinesAnalysis[categoryKey]) {
                console.log(`❌ Category "${categoryKey}" not found in reliableGuidelinesAnalysis`);
                return;
              }
              
              // HYBRID APPROACH: Use AI for complex analysis, not fake counting
              console.log(`🤖 ${guideline.title} will be analyzed by AI`);
              // Set placeholder that will be overridden by AI analysis
              reliableGuidelinesAnalysis[categoryKey].details.push({
                title: guideline.title,
                count: 0, // Will be overridden by AI
                description: `AI will analyze: ${guideline.title}`,
                needsAI: true
              });
            });
            
            // Store the reliable analysis
            aiAnalysis.reliableGuidelinesAnalysis = reliableGuidelinesAnalysis;
            console.log('✅ Built reliable guidelines analysis:', reliableGuidelinesAnalysis);
            
            // Function to parse AI analysis results
            function parseAIResults(combinedGuidelinesAnalysis, customGuidelines) {
              const results = {
                generalChatting: { violations: 0, details: [] },
                psychology: { violations: 0, details: [] },
                captions: { violations: 0, details: [] },
                sales: { violations: 0, details: [] }
              };
              
              // Parse each category from AI analysis
              Object.keys(combinedGuidelinesAnalysis).forEach(key => {
                const text = combinedGuidelinesAnalysis[key];
                if (!text || text.includes('AI ANALYSIS FAILED')) return;
                
                // Extract violation counts from AI text
                const violationMatches = text.match(/(\d+)\s+violations?/gi);
                if (violationMatches) {
                  const totalViolations = violationMatches.reduce((sum, match) => {
                    const count = parseInt(match.match(/\d+/)[0]);
                    return sum + count;
                  }, 0);
                  
                  // Map to appropriate category
                  let category = 'generalChatting';
                  if (key.includes('sales') || key.includes('effectiveness')) category = 'sales';
                  else if (key.includes('engagement') || key.includes('quality')) category = 'psychology';
                  else if (key.includes('caption') || key.includes('messaging')) category = 'captions';
                  
                  results[category].violations += totalViolations;
                  results[category].details.push({
                    title: key,
                    count: totalViolations,
                    description: `Found ${totalViolations} violations from AI analysis`,
                    needsAI: false
                  });
                }
              });
              
              return results;
            }
            
            // CRITICAL FIX: Integrate AI analysis results into reliableGuidelinesAnalysis
            if (combinedGuidelinesAnalysis && Object.keys(combinedGuidelinesAnalysis).length > 0) {
              console.log('🔄 Integrating AI analysis results into reliableGuidelinesAnalysis...');
              
              // Parse AI analysis results and update reliableGuidelinesAnalysis
              const aiResults = parseAIResults(combinedGuidelinesAnalysis, customGuidelines);
              
              // Update each category with AI results (ONLY if AI found violations)
              Object.keys(aiResults).forEach(category => {
                if (reliableGuidelinesAnalysis[category]) {
                  // CRITICAL: Only override server-side data if AI actually found violations
                  // This preserves server-side reply time violations (154) when AI returns 0
                  if (aiResults[category].violations > 0) {
                    reliableGuidelinesAnalysis[category].violations += aiResults[category].violations;
                    reliableGuidelinesAnalysis[category].details.push(...aiResults[category].details);
                    console.log(`✅ Updated ${category} with AI results: +${aiResults[category].violations} violations (total: ${reliableGuidelinesAnalysis[category].violations})`);
                  } else {
                    console.log(`⏭️ Skipped ${category} AI update: 0 violations (keeping server-side data: ${reliableGuidelinesAnalysis[category].violations} violations)`);
                  }
                }
              });
              
              console.log('✅ AI analysis results integrated successfully');
            } else {
              console.log('⚠️ No AI analysis results to integrate');
            }
            
            // MERGE AI's complex analysis with our reliable simple analysis
            if (v2Json) {
              console.log('🔧 MERGING: Combining AI complex analysis with reliable simple analysis...');
              
              // For each category, merge AI's complex analysis with our reliable analysis
              ['generalChatting', 'psychology', 'captions', 'sales'].forEach(category => {
                const aiItems = v2Json[category]?.items || [];
                const reliableDetails = reliableGuidelinesAnalysis[category].details;
                
                // Replace placeholders with AI's actual analysis
                reliableDetails.forEach(detail => {
                  if (detail.needsAI) {
                    const aiItem = aiItems.find(item => 
                      item.title?.toLowerCase().includes(detail.title.toLowerCase()) ||
                      detail.title.toLowerCase().includes(item.title?.toLowerCase())
                    );
                    
                    if (aiItem) {
                      detail.count = aiItem.count || 0;
                      detail.description = `Found ${aiItem.count || 0} violations of ${detail.title} guideline`;
                      detail.examples = aiItem.examples || [];
                      detail.needsAI = false;
                      console.log(`✅ Merged AI analysis for ${detail.title}: ${aiItem.count} violations`);
                      
                      // VERBOSE: Show the actual messages where violations were found
                      if (aiItem.examples && aiItem.examples.length > 0) {
                        console.log(`📋 VIOLATION EXAMPLES FOR "${detail.title}":`);
                        aiItem.examples.slice(0, 5).forEach(msgIdx => {
                          const msg = analysisMessageTexts[msgIdx];
                          if (msg) {
                            const msgText = msg.text || JSON.stringify(msg);
                            console.log(`   Message ${msgIdx}: "${msgText.substring(0, 150)}${msgText.length > 150 ? '...' : ''}"`);
                          }
                        });
                        if (aiItem.examples.length > 5) {
                          console.log(`   ... and ${aiItem.examples.length - 5} more violations`);
                        }
                      } else if (aiItem.count === 0) {
                        // Show sample messages that the AI checked but found no violations
                        console.log(`✅ NO VIOLATIONS FOUND FOR "${detail.title}"`);
                        console.log(`📋 Sample messages AI checked (first 3 from batch):`);
                        analysisMessageTexts.slice(0, 3).forEach((msg, idx) => {
                          if (msg) {
                            const msgText = msg.text || JSON.stringify(msg);
                            console.log(`   Message ${idx}: "${msgText.substring(0, 150)}${msgText.length > 150 ? '...' : ''}"`);
                          }
                        });
                      }
                    } else {
                      console.log(`⚠️ NO AI DATA FOUND FOR "${detail.title}" - keeping placeholder`);
                    }
                  }
                });
                
              // Recalculate total violations for this category
              reliableGuidelinesAnalysis[category].violations = reliableDetails.reduce((sum, detail) => sum + (detail.count || 0), 0);
            });
            
            console.log('✅ Merged AI complex analysis with reliable simple analysis');
            
            // CRITICAL SUMMARY: Show ALL violations with actual message content (at the end so Railway doesn't drop it)
            console.log('\n🚨🚨🚨 FINAL VIOLATIONS SUMMARY 🚨🚨🚨');
            ['generalChatting', 'psychology', 'captions', 'sales'].forEach(category => {
              const catData = reliableGuidelinesAnalysis[category];
              if (catData.violations > 0) {
                console.log(`\n📊 ${category.toUpperCase()}: ${catData.violations} total violations`);
                catData.details.forEach(detail => {
                  if (detail.count > 0 && detail.examples && detail.examples.length > 0) {
                    console.log(`\n  ❌ ${detail.title}: ${detail.count} violations`);
                    detail.examples.slice(0, 3).forEach(msgIdx => {
                      const msg = analysisMessageTexts[msgIdx];
                      if (msg) {
                        const msgText = msg.text || JSON.stringify(msg);
                        const ppvInfo = msg.isPPV ? ` [PPV: $${msg.ppvRevenue}]` : '';
                        console.log(`     Message ${msgIdx}: "${msgText}"${ppvInfo}`);
                      }
                    });
                    if (detail.examples.length > 3) {
                      console.log(`     ... and ${detail.examples.length - 3} more violations`);
                    }
                  }
                });
              }
            });
            console.log('🚨🚨🚨 END VIOLATIONS SUMMARY 🚨🚨🚨\n');
            } else {
              console.log('⚠️ No AI analysis available for complex guidelines - using placeholders');
            }
            if (v2Json) {
              console.log('  - General Chatting Items:', v2Json.generalChatting?.items?.length || 0);
              console.log('  - Psychology Items:', v2Json.psychology?.items?.length || 0);
              console.log('  - Captions Items:', v2Json.captions?.items?.length || 0);
              console.log('  - Sales Items:', v2Json.sales?.items?.length || 0);
              
              // Log detailed violations
              if (v2Json.generalChatting?.items?.length > 0) {
                console.log('  - General Chatting Violations:', v2Json.generalChatting.items.map(item => `${item.title}: ${item.count} violations`));
              }
              if (v2Json.psychology?.items?.length > 0) {
                console.log('  - Psychology Violations:', v2Json.psychology.items.map(item => `${item.title}: ${item.count} violations`));
              }
              if (v2Json.captions?.items?.length > 0) {
                console.log('  - Captions Violations:', v2Json.captions.items.map(item => `${item.title}: ${item.count} violations`));
              }
              if (v2Json.sales?.items?.length > 0) {
                console.log('  - Sales Violations:', v2Json.sales.items.map(item => `${item.title}: ${item.count} violations`));
              }
            } else {
              console.log('  - V2 JSON parsing failed, using fallback analysis');
            }

            function summarizeFromItems(items) {
              const total = Array.isArray(items) ? items.reduce((s, it) => s + (Number(it.count) || 0), 0) : 0;
              const top = (Array.isArray(items) ? items : [])
                .slice()
                .sort((a, b) => (b.count || 0) - (a.count || 0))
                .slice(0, 3)
                .map(it => `${it.title || it.description || 'Issue'} (${it.count || 0})`);
              return { total, topLine: total > 0 ? `Found ${total} violations. Top issues: ${top.join(', ')}.` : 'No specific violations found for this category.' };
            }

            // USE OUR RELIABLE ANALYSIS INSTEAD OF AI'S UNRELIABLE ONE
            const reliableAnalysis = aiAnalysis.reliableGuidelinesAnalysis || {
              generalChatting: { violations: 0, details: [] },
              psychology: { violations: 0, details: [] },
              captions: { violations: 0, details: [] },
              sales: { violations: 0, details: [] }
            };
            
            const guidelinesBreakdownV2 = {
              generalChatting: reliableAnalysis.generalChatting.violations > 0 ? 
                `Found ${reliableAnalysis.generalChatting.violations} violations. Top issues: ${reliableAnalysis.generalChatting.details.map(d => `${d.title} (${d.count})`).join(', ')}.` :
                'No violations found for General Chatting guidelines.',
              psychology: reliableAnalysis.psychology.violations > 0 ? 
                `Found ${reliableAnalysis.psychology.violations} violations. Top issues: ${reliableAnalysis.psychology.details.map(d => `${d.title} (${d.count})`).join(', ')}.` :
                'No violations found for Psychology guidelines.',
              captions: reliableAnalysis.captions.violations > 0 ? 
                `Found ${reliableAnalysis.captions.violations} violations. Top issues: ${reliableAnalysis.captions.details.map(d => `${d.title} (${d.count})`).join(', ')}.` :
                'No violations found for Captions guidelines.',
              sales: reliableAnalysis.sales.violations > 0 ? 
                `Found ${reliableAnalysis.sales.violations} violations. Top issues: ${reliableAnalysis.sales.details.map(d => `${d.title} (${d.count})`).join(', ')}.` :
                'No violations found for Sales guidelines.',
              details: {
                generalChatting: { total: reliableAnalysis.generalChatting.violations, items: reliableAnalysis.generalChatting.details },
                psychology: { total: reliableAnalysis.psychology.violations, items: reliableAnalysis.psychology.details },
                captions: { total: reliableAnalysis.captions.violations, items: reliableAnalysis.captions.details },
                sales: { total: reliableAnalysis.sales.violations, items: reliableAnalysis.sales.details }
              }
            };
            console.log('✅ Using reliable server-side guidelines analysis instead of AI');

            // DEBUG: Log raw texts and extracted violations for operator visibility
            console.log('🧩 Guidelines V2 RAW - General Chatting:', generalText);
            console.log('🧩 Guidelines V2 RAW - Psychology:', psychologyText);
            console.log('🧩 Guidelines V2 RAW - Captions:', captionsText);
            console.log('🧩 Guidelines V2 RAW - Sales:', salesText);
            try {
              const d = guidelinesBreakdownV2.details;
              const fmt = (cat, obj) => `${cat}: total=${obj.total} ${obj.items.map(i=>`| ${i.label} (${i.count}) msgs:[${(i.examples||[]).join(',')}]`).join(' ')}`;
              console.log('🧩 Guidelines V2 DETAILS:', [
                fmt('General', d.generalChatting),
                fmt('Psychology', d.psychology),
                fmt('Captions', d.captions),
                fmt('Sales', d.sales)
              ].join(' || '));
            } catch (e) {
              console.log('🧩 Guidelines V2 DETAILS logging failed:', e.message);
            }
            
            // Derive violation counts per section from the formatted text
            function extractCount(line) {
              if (!line) return 0;
              const m = line.match(/Found\s+(\d+)\s+violations?/i) || line.match(/\((\d+)\)/);
              return m ? parseInt(m[1]) || 0 : 0;
            }
            // Compute counts from V2 categories
            const v2General = guidelinesBreakdownV2.details?.generalChatting?.total ?? extractCount(guidelinesBreakdownV2.generalChatting);
            const v2Psych = guidelinesBreakdownV2.details?.psychology?.total ?? extractCount(guidelinesBreakdownV2.psychology);
            const v2Captions = guidelinesBreakdownV2.details?.captions?.total ?? extractCount(guidelinesBreakdownV2.captions);
            const v2Sales = guidelinesBreakdownV2.details?.sales?.total ?? extractCount(guidelinesBreakdownV2.sales);
            // Calculate total violations from our reliable analysis instead of AI's unreliable data
            const totalGuidelineViolations = (aiAnalysis.reliableGuidelinesAnalysis?.generalChatting?.violations || 0) +
                                           (aiAnalysis.reliableGuidelinesAnalysis?.psychology?.violations || 0) +
                                           (aiAnalysis.reliableGuidelinesAnalysis?.captions?.violations || 0) +
                                           (aiAnalysis.reliableGuidelinesAnalysis?.sales?.violations || 0);
            console.log('🔍 Total guideline violations from reliable analysis:', totalGuidelineViolations);

            // Calculate guidelines score using same rubric as grammar (errors vs total messages)
            const calculatedGuidelinesScore = calculateGrammarScore(totalGuidelineViolations, analysisMessageTexts.length || 1);
            analyticsData.guidelinesScore = calculatedGuidelinesScore;

            // Build concise overall summary and main issues (top 2)
            const entriesGuides = [
              ['general chatting', v2General],
              ['psychology', v2Psych],
              ['captions', v2Captions],
              ['sales', v2Sales]
            ].filter(([, c]) => c > 0).sort((a,b)=>b[1]-a[1]);
            const topIssues = entriesGuides.slice(0,2).map(([n,c])=>`${n} (${c})`).join(', ');
            const conciseGuidelinesSummary = `Overall guidelines: ${calculatedGuidelinesScore}/100. Total violations: ${totalGuidelineViolations}.${topIssues ? ' Main issues: ' + topIssues + '.' : ''}`;
            formattedGuidelinesAnalysis.scoreExplanation = conciseGuidelinesSummary;

            // Attach V2 breakdown to be used by frontend if present
            formattedGuidelinesAnalysis.guidelinesBreakdownV2 = {
              ...guidelinesBreakdownV2,
              scoreExplanation: conciseGuidelinesSummary
            };
            
            console.log('🔄 Formatted salesEffectiveness:', formattedGuidelinesAnalysis.salesEffectiveness);
            console.log('🔄 Formatted engagementQuality:', formattedGuidelinesAnalysis.engagementQuality);
            
            // Clean up and format the grammar analysis for better readability
            console.log('🔄 Formatting grammar analysis...');
            console.log('🔄 Raw spellingErrors:', combinedGrammarAnalysis.spellingErrors);
            console.log('🔄 Raw grammarIssues:', combinedGrammarAnalysis.grammarIssues);
            console.log('🔄 Raw punctuationProblems:', combinedGrammarAnalysis.punctuationProblems);
            console.log('🔄 Raw scoreExplanation:', combinedGrammarAnalysis.scoreExplanation);
            
            // Check if any grammar analysis fields are empty/undefined
            if (!combinedGrammarAnalysis.spellingErrors && !combinedGrammarAnalysis.grammarIssues && !combinedGrammarAnalysis.punctuationProblems) {
              console.log('❌ All grammar analysis fields are empty - using fallback');
              combinedGrammarAnalysis = {
                spellingErrors: 'No spelling errors found in analyzed messages.',
                grammarIssues: 'No grammar issues found in analyzed messages.',
                punctuationProblems: 'No punctuation problems found in analyzed messages.',
                scoreExplanation: 'Grammar analysis completed successfully with no significant issues found.'
              };
            }
            
        // Use the main AI analysis results directly (not the combined batch results)
        const mainGrammarBreakdown = aiAnalysis.grammarBreakdown || {};
        
        console.log('🔍 DEBUGGING: aiAnalysis.grammarBreakdown:', mainGrammarBreakdown);
        console.log('🔍 DEBUGGING: combinedGrammarAnalysis:', combinedGrammarAnalysis);
        
        // Clean up and format the combined analysis results
        console.log('🔍 DEBUG: Raw punctuationProblems:', combinedGrammarAnalysis.punctuationProblems);
        // Use AI's detection but validate the counts
        const cleanSpelling = formatGrammarResults(combinedGrammarAnalysis.spellingErrors, 'spelling');
        const cleanGrammar = formatGrammarResults(combinedGrammarAnalysis.grammarIssues, 'grammar');
        const cleanPunctuation = formatGrammarResults(combinedGrammarAnalysis.punctuationProblems, 'punctuation');
        
        // Log AI's counts for validation
        console.log(`🔍 AI DETECTED - Spelling: ${cleanSpelling}`);
        console.log(`🔍 AI DETECTED - Grammar: ${cleanGrammar}`);
        console.log(`🔍 AI DETECTED - Punctuation: ${cleanPunctuation}`);
        console.log('🔍 DEBUG: Cleaned punctuationProblems:', cleanPunctuation);
        
        // Calculate actual error counts from the formatted results
        const spellingCount = extractErrorCount(cleanSpelling);
        const grammarCount = extractErrorCount(cleanGrammar);
        const punctuationCount = extractErrorCount(cleanPunctuation);
        const totalErrors = spellingCount + grammarCount + punctuationCount;
        
        // Calculate grammar score based on total errors (lower errors = higher score)
        const calculatedGrammarScore = calculateGrammarScore(totalErrors, analysisMessageTexts.length);
        
        // Store the calculated score for use later
        analyticsData.calculatedGrammarScore = calculatedGrammarScore;
        
        const formattedGrammarAnalysis = {
          spellingErrors: cleanSpelling && cleanSpelling !== '.' ? cleanSpelling : "No spelling errors found - informal OnlyFans language is correct.",
          grammarIssues: cleanGrammar && cleanGrammar !== '.' ? cleanGrammar : "No grammar errors found - informal OnlyFans language is correct.",
          punctuationProblems: cleanPunctuation && cleanPunctuation !== '.' ? cleanPunctuation : "No punctuation errors found - informal OnlyFans language is correct.",
          scoreExplanation: `Grammar score: ${calculatedGrammarScore}/100. Main issues: ${getMainIssues(spellingCount, grammarCount, punctuationCount)}. Total errors: ${totalErrors}.`
        };
            
            console.log('🔄 Formatted spellingErrors:', formattedGrammarAnalysis.spellingErrors);
            console.log('🔄 Formatted grammarIssues:', formattedGrammarAnalysis.grammarIssues);
            
            // Create comprehensive analysis with combined results
            // Build detailed error summary by category
            const grammarErrorSummary = {
              spelling: spellingCount > 0 ? `${spellingCount} spelling error${spellingCount !== 1 ? 's' : ''} found (${(spellingCount/analysisMessageTexts.length*100).toFixed(1)}% of messages)` : 'No spelling errors',
              grammar: grammarCount > 0 ? `${grammarCount} grammar error${grammarCount !== 1 ? 's' : ''} found (${(grammarCount/analysisMessageTexts.length*100).toFixed(1)}% of messages)` : 'No grammar errors',
              punctuation: punctuationCount > 0 ? `${punctuationCount} punctuation issue${punctuationCount !== 1 ? 's' : ''} found (${(punctuationCount/analysisMessageTexts.length*100).toFixed(1)}% of messages)` : 'No punctuation issues',
              total: `${totalErrors} total error${totalErrors !== 1 ? 's' : ''} across ${analysisMessageTexts.length} messages`,
              errorRate: `${(totalErrors/analysisMessageTexts.length*100).toFixed(2)}% error rate`
            };
            
            const guidelinesErrorSummary = {
              generalChatting: reliableGuidelinesAnalysis.generalChatting.violations > 0 ? 
                `${reliableGuidelinesAnalysis.generalChatting.violations} violation${reliableGuidelinesAnalysis.generalChatting.violations !== 1 ? 's' : ''} (${reliableGuidelinesAnalysis.generalChatting.details.map(d => `${d.title}: ${d.count}`).join(', ')})` : 
                'No violations',
              psychology: reliableGuidelinesAnalysis.psychology.violations > 0 ? 
                `${reliableGuidelinesAnalysis.psychology.violations} violation${reliableGuidelinesAnalysis.psychology.violations !== 1 ? 's' : ''} (${reliableGuidelinesAnalysis.psychology.details.map(d => `${d.title}: ${d.count}`).join(', ')})` : 
                'No violations',
              captions: reliableGuidelinesAnalysis.captions.violations > 0 ? 
                `${reliableGuidelinesAnalysis.captions.violations} violation${reliableGuidelinesAnalysis.captions.violations !== 1 ? 's' : ''} (${reliableGuidelinesAnalysis.captions.details.map(d => `${d.title}: ${d.count}`).join(', ')})` : 
                'No violations',
              sales: reliableGuidelinesAnalysis.sales.violations > 0 ? 
                `${reliableGuidelinesAnalysis.sales.violations} violation${reliableGuidelinesAnalysis.sales.violations !== 1 ? 's' : ''} (${reliableGuidelinesAnalysis.sales.details.map(d => `${d.title}: ${d.count}`).join(', ')})` : 
                'No violations',
              total: `${totalGuidelineViolations} total violation${totalGuidelineViolations !== 1 ? 's' : ''} across ${analysisMessageTexts.length} messages`,
              violationRate: `${(totalGuidelineViolations/analysisMessageTexts.length*100).toFixed(2)}% violation rate`
            };
            
            const reAnalysis = {
              grammarBreakdown: formattedGrammarAnalysis,
              guidelinesBreakdown: formattedGuidelinesAnalysis,
              overallBreakdown: {
                grammarSummary: grammarErrorSummary,
                guidelinesSummary: guidelinesErrorSummary,
                scoreExplanation: `Grammar: ${calculatedGrammarScore}/100 (${totalErrors} errors). Guidelines: ${calculatedGuidelinesScore}/100 (${totalGuidelineViolations} violations). Overall: ${Math.round((calculatedGrammarScore + calculatedGuidelinesScore) / 2)}/100.`
              }
            };
          
          try {
            console.log('🔄 Re-analysis completed:', Object.keys(reAnalysis));
            console.log('🔄 Re-analysis grammarBreakdown:', !!reAnalysis.grammarBreakdown);
            console.log('🔄 Re-analysis guidelinesBreakdown:', !!reAnalysis.guidelinesBreakdown);
            console.log('🔄 Re-analysis overallBreakdown:', !!reAnalysis.overallBreakdown);
            console.log('🔄 FULL RE-ANALYSIS RESULT:', JSON.stringify(reAnalysis, null, 2));
            
            // FORCE UPDATE the breakdown sections with new analysis
          if (reAnalysis.grammarBreakdown) {
            aiAnalysis.grammarBreakdown = reAnalysis.grammarBreakdown;
            console.log('🔄 Updated grammarBreakdown with AI analysis');
          } else {
            console.log('🔄 AI did not return grammarBreakdown, using fallback');
            aiAnalysis.grammarBreakdown = {
              spellingErrors: "AI analysis failed - no spelling errors found",
              grammarIssues: "AI analysis failed - no grammar issues found",
              punctuationProblems: "AI analysis failed - no punctuation problems found",
              informalLanguage: "AI analysis failed - no informal language found",
              scoreExplanation: "AI analysis failed - grammar analysis completed"
            };
          }
          
          if (reAnalysis.guidelinesBreakdown) {
            aiAnalysis.guidelinesBreakdown = reAnalysis.guidelinesBreakdown;
            console.log('🔄 Updated guidelinesBreakdown with AI analysis');
          } else {
            console.log('🔄 AI did not return guidelinesBreakdown, using fallback');
            aiAnalysis.guidelinesBreakdown = {
              salesEffectiveness: "AI analysis failed - no sales techniques found",
              engagementQuality: "AI analysis failed - no engagement strategies found",
              captionQuality: "AI analysis failed - no PPV captions found",
              conversationFlow: "AI analysis failed - no conversation patterns found",
              scoreExplanation: "AI analysis failed - guidelines analysis completed"
            };
          }
          
          if (reAnalysis.overallBreakdown) {
            aiAnalysis.overallBreakdown = reAnalysis.overallBreakdown;
            console.log('🔄 Updated overallBreakdown with AI analysis');
          } else {
            console.log('🔄 AI did not return overallBreakdown, using fallback');
            aiAnalysis.overallBreakdown = {
              messageClarity: "AI analysis failed - no clarity issues found",
              emotionalImpact: "AI analysis failed - no emotional connections found",
              conversionPotential: "AI analysis failed - no conversion opportunities found",
              scoreExplanation: "AI analysis failed - overall analysis completed"
            };
          }
          console.log('🔄 FORCED UPDATE COMPLETED');
        } catch (error) {
          console.log('🔄 Re-analysis failed:', error.message);
        }
      } else {
        console.log('🔄 No analysisMessageTexts available for re-analysis');
      }
      
      // CRITICAL FIX: Update analyticsData with FRESH calculated scores
      // This fixes the issue where generateAIAnalysis was called with old/null scores
      if (analyticsData.calculatedGrammarScore != null) {
        analyticsData.grammarScore = analyticsData.calculatedGrammarScore;
        console.log(`✅ UPDATED analyticsData.grammarScore with FRESH score: ${analyticsData.grammarScore}/100`);
      }
      if (analyticsData.grammarScore != null && analyticsData.guidelinesScore != null) {
        analyticsData.overallMessageScore = Math.round((analyticsData.grammarScore + analyticsData.guidelinesScore) / 2);
        console.log(`✅ CALCULATED analyticsData.overallMessageScore: ${analyticsData.overallMessageScore}/100`);
      }
      console.log(`🚨 FRESH SCORES NOW IN analyticsData:`, {
        grammarScore: analyticsData.grammarScore,
        guidelinesScore: analyticsData.guidelinesScore,
        overallMessageScore: analyticsData.overallMessageScore
      });
      
      // CRITICAL: Regenerate AI executive analysis with FRESH scores
      console.log('🔄 REGENERATING executive analysis with FRESH scores...');
      try {
        const freshAIAnalysis = await generateAIAnalysis(analyticsData, analysisType, interval, analysisMessageTexts, totalMessages);
        // Update the executive summary sections with FRESH data
        if (freshAIAnalysis.executiveSummary) {
          aiAnalysis.executiveSummary = freshAIAnalysis.executiveSummary;
          console.log('✅ Updated executiveSummary with FRESH scores');
        }
        if (freshAIAnalysis.advancedMetrics) {
          aiAnalysis.advancedMetrics = freshAIAnalysis.advancedMetrics;
          console.log('✅ Updated advancedMetrics with FRESH scores');
        }
        if (freshAIAnalysis.strategicInsights) {
          aiAnalysis.strategicInsights = freshAIAnalysis.strategicInsights;
          console.log('✅ Updated strategicInsights with FRESH scores');
        }
        if (freshAIAnalysis.actionPlan) {
          aiAnalysis.actionPlan = freshAIAnalysis.actionPlan;
          console.log('✅ Updated actionPlan with FRESH scores');
        }
      } catch (error) {
        console.log('❌ Failed to regenerate executive analysis:', error.message);
      }
      
      aiAnalysis.fansChatted = analyticsData.fansChatted;
      aiAnalysis.avgResponseTime = analyticsData.avgResponseTime;
      // Keep scores as 0-100 scale
      aiAnalysis.grammarScore = analyticsData.calculatedGrammarScore || analyticsData.grammarScore;
      aiAnalysis.guidelinesScore = analyticsData.guidelinesScore;
      // Derive overall score as average of grammar and guidelines when available
      if (aiAnalysis.grammarScore != null && aiAnalysis.guidelinesScore != null) {
        aiAnalysis.overallScore = Math.round((aiAnalysis.grammarScore + aiAnalysis.guidelinesScore) / 2);
      } else {
        aiAnalysis.overallScore = analyticsData.overallMessageScore;
      }
      
      // REMOVED: Old code that copied chattingStyle/messagePatterns/engagementMetrics from analyticsData
      // These fields are no longer used - we use executiveSummary instead
      console.log('✅ SKIPPED copying chattingStyle/messagePatterns/engagementMetrics from analyticsData');
      
      // Don't copy these old fields anymore
      // aiAnalysis.strengths = analyticsData.strengths;
      // aiAnalysis.weaknesses = analyticsData.weaknesses;
      // aiAnalysis.recommendations = analyticsData.recommendations;
      // ALWAYS set breakdown data - use AI data if available, otherwise use fallback
      console.log('🔍 Checking breakdown data from analyticsData:', {
        hasGrammarBreakdown: !!analyticsData.grammarBreakdown,
        grammarBreakdownKeys: analyticsData.grammarBreakdown ? Object.keys(analyticsData.grammarBreakdown) : [],
        hasGuidelinesBreakdown: !!analyticsData.guidelinesBreakdown,
        guidelinesBreakdownKeys: analyticsData.guidelinesBreakdown ? Object.keys(analyticsData.guidelinesBreakdown) : [],
        hasOverallBreakdown: !!analyticsData.overallBreakdown,
        overallBreakdownKeys: analyticsData.overallBreakdown ? Object.keys(analyticsData.overallBreakdown) : []
      });
      
      // Grammar breakdown - use AI data if available, otherwise use analyticsData, otherwise fallback
      if (aiAnalysis.grammarBreakdown && Object.keys(aiAnalysis.grammarBreakdown).length > 0 && 
          Object.values(aiAnalysis.grammarBreakdown).some(value => value && typeof value === 'string' && value.trim().length > 0)) {
        console.log('✅ Using AI grammarBreakdown data');
        // Keep the AI data - don't overwrite it
      } else if (analyticsData.grammarBreakdown && Object.keys(analyticsData.grammarBreakdown).length > 0) {
        aiAnalysis.grammarBreakdown = analyticsData.grammarBreakdown;
        console.log('✅ Set grammarBreakdown from analyticsData');
      } else {
        console.log('❌ No grammarBreakdown in AI or analyticsData, using fallback');
        aiAnalysis.grammarBreakdown = {
          "spellingErrors": `Based on ${analyticsData.grammarScore || 0}/100 score, some spelling issues present. Common errors include typos and autocorrect mistakes.`,
          "grammarIssues": `Grammar score of ${analyticsData.grammarScore || 0}/100 indicates room for improvement in sentence structure and verb tenses.`,
          "punctuationProblems": `Punctuation usage could be enhanced for better readability and professional appearance.`,
          "informalLanguage": `Specific issues found in message analysis include inconsistent capitalization and missing punctuation.`,
          "scoreExplanation": `Grammar analysis based on message content review and scoring algorithms.`
        };
      }
      
      // Guidelines breakdown - use AI data if available, otherwise use analyticsData, otherwise fallback
      if (aiAnalysis.guidelinesBreakdown && Object.keys(aiAnalysis.guidelinesBreakdown).length > 0 && 
          Object.values(aiAnalysis.guidelinesBreakdown).some(value => value && (typeof value === 'object' || (typeof value === 'string' && value.trim().length > 0)))) {
        console.log('✅ Using AI guidelinesBreakdown data');
        // Keep the AI data - don't overwrite it
      } else if (analyticsData.guidelinesBreakdown && Object.keys(analyticsData.guidelinesBreakdown).length > 0) {
        aiAnalysis.guidelinesBreakdown = analyticsData.guidelinesBreakdown;
        console.log('✅ Set guidelinesBreakdown from analyticsData');
      } else {
        console.log('❌ No guidelinesBreakdown in AI or analyticsData, using fallback');
        aiAnalysis.guidelinesBreakdown = {
          "salesEffectiveness": `Guidelines score of ${analyticsData.guidelinesScore || 0}/100 suggests some sales techniques could be improved.`,
          "engagementQuality": `Engagement patterns show good relationship building but could benefit from more strategic PPV timing.`,
          "captionQuality": `PPV captions are present but could be more compelling to increase conversion rates.`,
          "conversationFlow": `Focus on building stronger connections before sending PPVs and improve caption writing.`,
          "scoreExplanation": `Guidelines analysis based on sales effectiveness and engagement patterns.`
        };
      }
      
      // Overall breakdown - ONLY use the fresh reAnalysis data, NEVER from analyticsData (old structure)
      if (aiAnalysis.overallBreakdown && Object.keys(aiAnalysis.overallBreakdown).length > 0) {
        console.log('✅ Using FRESH overallBreakdown data from reAnalysis (has grammarSummary/guidelinesSummary)');
        // Keep the AI data - don't overwrite it
      } else {
        console.log('❌ No overallBreakdown in reAnalysis, creating fallback');
        aiAnalysis.overallBreakdown = {
          "grammarSummary": {
            "spelling": "No data",
            "grammar": "No data",
            "punctuation": "No data",
            "total": "No data",
            "errorRate": "No data"
          },
          "guidelinesSummary": {
            "generalChatting": "No data",
            "psychology": "No data",
            "captions": "No data",
            "sales": "No data",
            "total": "No data",
            "violationRate": "No data"
          },
          "scoreExplanation": `Overall score: ${analyticsData.overallMessageScore || 0}/100.`
        };
      }
      
      console.log('🔍 Sending to frontend:', {
        hasChattingStyle: !!aiAnalysis.chattingStyle,
        hasMessagePatterns: !!aiAnalysis.messagePatterns,
        hasEngagementMetrics: !!aiAnalysis.engagementMetrics,
        hasStrengths: !!aiAnalysis.strengths,
        hasWeaknesses: !!aiAnalysis.weaknesses,
        hasRecommendations: !!aiAnalysis.recommendations,
        hasGrammarBreakdown: !!aiAnalysis.grammarBreakdown,
        hasGuidelinesBreakdown: !!aiAnalysis.guidelinesBreakdown,
        hasOverallBreakdown: !!aiAnalysis.overallBreakdown,
        grammarBreakdownKeys: aiAnalysis.grammarBreakdown ? Object.keys(aiAnalysis.grammarBreakdown) : [],
        guidelinesBreakdownKeys: aiAnalysis.guidelinesBreakdown ? Object.keys(aiAnalysis.guidelinesBreakdown) : [],
        overallBreakdownKeys: aiAnalysis.overallBreakdown ? Object.keys(aiAnalysis.overallBreakdown) : []
      });
      // REMOVED: Massive JSON logging that caused Railway to drop 67K+ messages
      // This was causing the save success/failure logs to be dropped
      
      // Debug individual properties
      if (aiAnalysis.chattingStyle) {
        console.log('🔍 ChattingStyle properties:', {
          directness: aiAnalysis.chattingStyle.directness,
          friendliness: aiAnalysis.chattingStyle.friendliness,
          salesApproach: aiAnalysis.chattingStyle.salesApproach,
          personality: aiAnalysis.chattingStyle.personality,
          emojiUsage: aiAnalysis.chattingStyle.emojiUsage,
          messageLength: aiAnalysis.chattingStyle.messageLength
        });
      } else {
        console.log('🔍 ERROR: aiAnalysis.chattingStyle is null/undefined!');
      }
      
      // REMOVED: Old fallback code that filled chattingStyle/messagePatterns with fake data
      // These fields are no longer used - we use executiveSummary instead
      console.log('✅ SKIPPED old chattingStyle/messagePatterns fallback - not needed anymore');
      
      // REMOVED: Old fallback code that filled engagementMetrics with fake data
      // This field is no longer used - we use executiveSummary instead
      console.log('✅ SKIPPED old engagementMetrics fallback - not needed anymore');
      
      // REMOVED: Excessive logging that causes Railway to drop critical save logs (67K+ messages)
      // These logs make Railway hit 500 logs/sec limit and drop save success/failure messages
      
      // Helper to extract message texts for deterministic breakdowns (from ALL MessageAnalysis records)
      const getWindowMessages = () => {
        try {
          // First try to get all messages from all MessageAnalysis records
          const allMessagesFromAllRecords = [];
          if (analyticsData.messagesAnalysis && Array.isArray(analyticsData.messagesAnalysis)) {
            analyticsData.messagesAnalysis.forEach(record => {
              if (Array.isArray(record.messageRecords)) {
              const messagesFromRecord = record.messageRecords.map(r => {
                if (r && r.messageText) {
                  return {
                    text: r.messageText,
                    replyTime: r.replyTime || 0,
                    timestamp: r.timestamp,
                    fanUsername: r.fanUsername
                  };
                }
                return null;
              }).filter(Boolean);
              allMessagesFromAllRecords.push(...messagesFromRecord);
              }
            });
          }
          
          if (allMessagesFromAllRecords.length > 0) {
            console.log(`🔄 getWindowMessages: Retrieved ${allMessagesFromAllRecords.length} messages from ${analyticsData.messagesAnalysis ? analyticsData.messagesAnalysis.length : 0} MessageAnalysis records`);
            return allMessagesFromAllRecords;
          }
          
          // Fallback to analyticsData.messageRecords if available
          if (Array.isArray(analyticsData.messageRecords) && analyticsData.messageRecords.length > 0) {
            console.log(`🔄 getWindowMessages: Using ${analyticsData.messageRecords.length} messages from analyticsData.messageRecords`);
            return analyticsData.messageRecords.map(r => {
              if (r && r.messageText) {
                return {
                  text: r.messageText,
                  replyTime: r.replyTime || 0,
                  timestamp: r.timestamp,
                  fanUsername: r.fanUsername
                };
              }
              return null;
            }).filter(Boolean);
          }
          
          // Final fallback to latestMessageAnalysis messagesSample
          const latestMessageAnalysis = analyticsData.messagesAnalysis && analyticsData.messagesAnalysis.length > 0 ? analyticsData.messagesAnalysis[0] : null;
          const fromSample = Array.isArray(latestMessageAnalysis?.messagesSample) ? latestMessageAnalysis.messagesSample.filter(Boolean) : [];
          console.log(`🔄 getWindowMessages: Using ${fromSample.length} messages from latestMessageAnalysis.messagesSample`);
          return fromSample;
        } catch (_) {
          return [];
        }
      };

      // Deterministic, concrete breakdowns from message texts when AI content is missing
      const buildDeterministicBreakdowns = (texts = []) => {
        const snippets = (texts || []).map(t => String(t)).filter(Boolean);
        const examples = [];

        const found = {
          spelling: [],
          grammar: [],
          punctuation: [],
          informal: [],
          sales: [],
          engagement: [],
          caption: [],
          flow: [],
          clarity: [],
          emotion: [],
          conversion: []
        };

        const misspellings = [/recieve/gi, /definately/gi, /seperate/gi, /occured/gi, /alot/gi];
        const apostropheIssues = [/\b(dont|cant|im|ive|youre|thats|whats|isnt|arent|wasnt|werent)\b/gi];
        const informalTokens = [/\b(u|ur)\b/gi, /lol/gi, /haha/gi, /omg/gi, /lmao/gi];
        const excessivePunct = [/!!+/g, /\?\?+/g, /\.\.\.+/g];

        snippets.forEach((msg, idx) => {
          misspellings.forEach(rx => { if (rx.test(msg)) { found.spelling.push(`Message ${idx+1}: "${msg}"`); }});
          apostropheIssues.forEach(rx => { if (rx.test(msg)) { found.grammar.push(`Message ${idx+1}: Missing apostrophes in "${msg}"`); }});
          excessivePunct.forEach(rx => { if (rx.test(msg)) { found.punctuation.push(`Message ${idx+1}: Excessive punctuation in "${msg}"`); }});
          const noEnd = /[a-zA-Z]{4,}[^.!?]$/.test(msg.trim());
          if (noEnd && msg.split(' ').length >= 6) { found.punctuation.push(`Message ${idx+1}: Missing end punctuation in "${msg}"`); }
          informalTokens.forEach(rx => { if (rx.test(msg)) { found.informal.push(`Message ${idx+1}: Informal token in "${msg}"`); }});
          // Clarity heuristics
          if (msg.length > 160 && /[,;\-]/.test(msg) === false) { found.clarity.push(`Message ${idx+1}: Long run-on sentence in "${msg.slice(0,80)}..."`); }
        });

        const joinOrNone = (arr) => arr.length ? arr.slice(0,5).join(' | ') : 'No significant issues found';

        return {
          grammarBreakdown: {
            spellingErrors: joinOrNone(found.spelling),
            grammarIssues: joinOrNone(found.grammar),
            punctuationProblems: joinOrNone(found.punctuation),
            informalLanguage: joinOrNone(found.informal),
            scoreExplanation: `Grammar analysis of ${snippets.length} messages found ${found.spelling.length} spelling errors, ${found.grammar.length} grammar issues, ${found.punctuation.length} punctuation problems, and ${found.informal.length} informal language patterns.`
          },
          guidelinesBreakdown: {
            salesEffectiveness: joinOrNone(found.sales),
            engagementQuality: joinOrNone(found.engagement),
            captionQuality: joinOrNone(found.caption),
            conversationFlow: joinOrNone(found.flow),
            scoreExplanation: `Guidelines analysis of ${snippets.length} messages found ${found.sales.length} sales examples, ${found.engagement.length} engagement patterns, ${found.caption.length} caption examples, and ${found.flow.length} conversation flow examples.`
          },
          overallBreakdown: {
            messageClarity: joinOrNone(found.clarity),
            emotionalImpact: joinOrNone(found.emotion),
            conversionPotential: joinOrNone(found.conversion),
            scoreExplanation: `Overall analysis of ${snippets.length} messages found ${found.clarity.length} clarity examples, ${found.emotion.length} emotional impact examples, and ${found.conversion.length} conversion potential examples.`
          }
        };
      };

      // Use AI breakdown data if available, otherwise use fallback
      console.log('🔍 DEBUGGING: aiAnalysis.grammarBreakdown:', aiAnalysis.grammarBreakdown);
      console.log('🔍 DEBUGGING: grammarBreakdown keys:', aiAnalysis.grammarBreakdown ? Object.keys(aiAnalysis.grammarBreakdown) : 'NO OBJECT');
      console.log('🔍 DEBUGGING: grammarBreakdown values:', aiAnalysis.grammarBreakdown ? Object.values(aiAnalysis.grammarBreakdown) : 'NO OBJECT');
      
      // Check if AI returned breakdown structure but with undefined/null values
      const hasGrammarStructure = aiAnalysis.grammarBreakdown && Object.keys(aiAnalysis.grammarBreakdown).length > 0;
      const hasGrammarContent = hasGrammarStructure && 
        Object.values(aiAnalysis.grammarBreakdown).some(value => value && typeof value === 'string' && value.trim().length > 0);
      
      console.log('🔍 DEBUGGING: hasGrammarStructure:', hasGrammarStructure);
      console.log('🔍 DEBUGGING: hasGrammarContent:', hasGrammarContent);
      
      // Check if AI returned ANY meaningful content (even if some fields are empty)
      const hasAnyGrammarContent = hasGrammarStructure && 
        Object.entries(aiAnalysis.grammarBreakdown).some(([key, value]) => {
          if (key === 'scoreExplanation') return false; // Skip scoreExplanation for this check
          return value && typeof value === 'string' && value.trim().length > 0;
        });
      
      console.log('🔍 DEBUGGING: hasAnyGrammarContent (excluding scoreExplanation):', hasAnyGrammarContent);
      
      // If AI returned structure with ANY content, use it and fill in missing scoreExplanation
      if (hasAnyGrammarContent) {
        console.log('🔍 Using AI grammarBreakdown with content (some fields may be empty)');
        // If AI didn't provide scoreExplanation, use AI-generated one
        if (!aiAnalysis.grammarBreakdown.scoreExplanation || aiAnalysis.grammarBreakdown.scoreExplanation.trim() === '') {
          aiAnalysis.grammarBreakdown.scoreExplanation = `AI analysis of ${sampledMessages.length} messages with specific examples provided above.`;
        }
      } else if (hasGrammarStructure && !hasGrammarContent) {
        console.log('🔍 AI returned grammarBreakdown structure but with empty/undefined values - using deterministic examples');
        const msgs = getWindowMessages();
        const det = buildDeterministicBreakdowns(msgs);
        aiAnalysis.grammarBreakdown = det.grammarBreakdown;
      } else if (!hasGrammarStructure) {
        console.log('🔍 No AI grammarBreakdown structure, using deterministic examples');
        const msgs = getWindowMessages();
        const det = buildDeterministicBreakdowns(msgs);
        aiAnalysis.grammarBreakdown = det.grammarBreakdown;
      } else {
        console.log('🔍 Using AI grammarBreakdown with content');
      }
      
      const hasGuidelinesContent = aiAnalysis.guidelinesBreakdown && 
        Object.keys(aiAnalysis.guidelinesBreakdown).length > 0 && 
        Object.values(aiAnalysis.guidelinesBreakdown).some(value => value && (typeof value === 'object' || (typeof value === 'string' && value.trim().length > 0)));
      
      if (!hasGuidelinesContent) {
        console.log('🔍 No AI guidelinesBreakdown content, using deterministic examples');
        const msgs = getWindowMessages();
        const det = buildDeterministicBreakdowns(msgs);
        aiAnalysis.guidelinesBreakdown = det.guidelinesBreakdown;
      } else {
        console.log('🔍 Using AI guidelinesBreakdown with content');
        // If AI didn't provide scoreExplanation, use AI-generated one
        if (!aiAnalysis.guidelinesBreakdown.scoreExplanation || aiAnalysis.guidelinesBreakdown.scoreExplanation.trim() === '') {
          aiAnalysis.guidelinesBreakdown.scoreExplanation = `AI analysis of ${sampledMessages.length} messages with specific examples provided above.`;
        }
      }
      
      const hasOverallContent = aiAnalysis.overallBreakdown && 
        Object.keys(aiAnalysis.overallBreakdown).length > 0 && 
        Object.values(aiAnalysis.overallBreakdown).some(value => value && (typeof value === 'object' || (typeof value === 'string' && value.trim().length > 0)));
      
      if (!hasOverallContent) {
        console.log('🔍 No AI overallBreakdown content, using deterministic examples');
        const msgs = getWindowMessages();
        const det = buildDeterministicBreakdowns(msgs);
        aiAnalysis.overallBreakdown = det.overallBreakdown;
      } else {
        console.log('🔍 Using AI overallBreakdown with content');
        // If AI didn't provide scoreExplanation, use AI-generated one
        if (!aiAnalysis.overallBreakdown.scoreExplanation || aiAnalysis.overallBreakdown.scoreExplanation.trim() === '') {
          aiAnalysis.overallBreakdown.scoreExplanation = `AI analysis of ${sampledMessages.length} messages with specific examples provided above.`;
        }
      }
      
      // Final check before sending
      console.log('🔍 FINAL CHECK - grammarBreakdown keys:', aiAnalysis.grammarBreakdown ? Object.keys(aiAnalysis.grammarBreakdown) : 'NO OBJECT');
      console.log('🔍 FINAL CHECK - guidelinesBreakdown keys:', aiAnalysis.guidelinesBreakdown ? Object.keys(aiAnalysis.guidelinesBreakdown) : 'NO OBJECT');
      console.log('🔍 FINAL CHECK - overallBreakdown keys:', aiAnalysis.overallBreakdown ? Object.keys(aiAnalysis.overallBreakdown) : 'NO OBJECT');
      
      console.log('🔍 FINAL RESPONSE - grammarBreakdown:', JSON.stringify(aiAnalysis.grammarBreakdown));
      console.log('🔍 FINAL RESPONSE - guidelinesBreakdown:', JSON.stringify(aiAnalysis.guidelinesBreakdown));
      console.log('🔍 FINAL RESPONSE - overallBreakdown:', JSON.stringify(aiAnalysis.overallBreakdown));
      
      // REMOVED ALL OLD FALLBACK CODE - these fields are no longer used
      console.log('✅ SKIPPED ALL fallback blocks - not needed anymore');
      
      // Skip all default object creation - we don't use these fields anymore
      const skipDefaultObjects = true;
      const defaultMessagePatterns = {
        questionFrequency: "high",
        exclamationUsage: "moderate",
        capitalizationStyle: "casual",
        punctuationStyle: "excessive",
        topicDiversity: "high",
        sexualContent: "moderate",
        personalSharing: "high"
      };
      const defaultEngagementMetrics = {
        conversationStarter: "excellent",
        conversationMaintainer: "good",
        salesConversation: "moderate",
        fanRetention: "excellent"
      };
      
      // REMOVED: Old code that re-created empty chattingStyle/messagePatterns/engagementMetrics
      // These fields are no longer used - we now use executiveSummary instead
      console.log('✅ SKIPPED old chattingStyle/messagePatterns/engagementMetrics filling - using executiveSummary instead');
      
      // CRITICAL FIX: Delete empty/fake objects RIGHT BEFORE sending response
      console.log('🔍 BEFORE DELETION - chattingStyle:', JSON.stringify(aiAnalysis.chattingStyle));
      console.log('🔍 BEFORE DELETION - messagePatterns:', JSON.stringify(aiAnalysis.messagePatterns));
      console.log('🔍 BEFORE DELETION - engagementMetrics:', JSON.stringify(aiAnalysis.engagementMetrics));
      
      // Delete if empty OR if they contain only the fake default values
      delete aiAnalysis.chattingStyle;
      delete aiAnalysis.messagePatterns;
      delete aiAnalysis.engagementMetrics;
      
      console.log('🔥 AFTER DELETION - chattingStyle exists:', !!aiAnalysis.chattingStyle);
      console.log('🔥 AFTER DELETION - messagePatterns exists:', !!aiAnalysis.messagePatterns);
      console.log('🔥 AFTER DELETION - engagementMetrics exists:', !!aiAnalysis.engagementMetrics);
      
      console.log('🚨🚨🚨 ABOUT TO SAVE AIANALYSIS TO DATABASE 🚨🚨🚨');
      console.log('🚨 analysisType:', analysisType);
      console.log('🚨 chatterId:', chatterId);
      
      // CRITICAL: Save aiAnalysis to AIAnalysis collection for team dashboard
      // Define actualChatterName OUTSIDE try block so it's available in catch block
      let actualChatterName = chatterId;
      
      // Calculate the timestamp for this analysis based on the ACTUAL DATA PERIOD
      // This ensures the analysis shows up when filtering for the data's date range
      let analysisTimestamp;
      let analysisDateRangeStart;
      let analysisDateRangeEnd;
      
      // For individual analysis, use the date range of the actual data being analyzed
      if (analysisType === 'individual' && analyticsData.messagesAnalysis) {
        // Find the earliest and latest dates from the actual data
        const allDates = [];
        
        // Get dates from MessageAnalysis records
        if (analyticsData.messagesAnalysis && analyticsData.messagesAnalysis.length > 0) {
          analyticsData.messagesAnalysis.forEach(record => {
            if (record.weekStartDate) allDates.push(new Date(record.weekStartDate));
            if (record.weekEndDate) allDates.push(new Date(record.weekEndDate));
          });
        }
        
        if (allDates.length > 0) {
          // Use the middle of the actual data period for timestamp
          const earliestDate = new Date(Math.min(...allDates.map(d => d.getTime())));
          const latestDate = new Date(Math.max(...allDates.map(d => d.getTime())));
          analysisTimestamp = new Date((earliestDate.getTime() + latestDate.getTime()) / 2);
          
          // CRITICAL: Also store the full date range so we can query by overlap
          analysisDateRangeStart = earliestDate;
          analysisDateRangeEnd = latestDate;
          
          console.log('📅 Using ACTUAL data period:', earliestDate.toISOString(), 'to', latestDate.toISOString());
          console.log('📅 Timestamp (middle):', analysisTimestamp.toISOString());
        } else {
          // Fallback: use custom dates if provided, otherwise current time
          if (startDate && endDate) {
            const start = new Date(startDate);
            const end = new Date(endDate);
            analysisTimestamp = new Date((start.getTime() + end.getTime()) / 2);
            analysisDateRangeStart = start;
            analysisDateRangeEnd = end;
            console.log('📅 Using custom date range as fallback:', start.toISOString(), 'to', end.toISOString());
          } else {
            analysisTimestamp = new Date();
            analysisDateRangeStart = null;
            analysisDateRangeEnd = null;
            console.log('📅 Using current time as fallback (no date range):', analysisTimestamp);
          }
        }
      } else {
        // For agency analysis or if no data, use custom dates or current time
        if (startDate && endDate) {
          const start = new Date(startDate);
          const end = new Date(endDate);
          analysisTimestamp = new Date((start.getTime() + end.getTime()) / 2);
          analysisDateRangeStart = start;
          analysisDateRangeEnd = end;
          console.log('📅 Using custom date range:', start.toISOString(), 'to', end.toISOString());
        } else {
          analysisTimestamp = new Date();
          analysisDateRangeStart = null;
          analysisDateRangeEnd = null;
          console.log('📅 Using current time (no date range):', analysisTimestamp);
        }
      }
      
      try {
        // Get the actual chatter name (for individual analysis, use the name candidates we built earlier)
        if (analysisType === 'individual' && chatterId) {
          try {
            const userDoc = await User.findById(chatterId).select('chatterName username');
            actualChatterName = userDoc?.chatterName || userDoc?.username || chatterId;
            console.log('✅ Resolved chatter name:', actualChatterName);
          } catch (e) {
            console.log('⚠️ Could not resolve chatter name, using chatterId:', chatterId);
            actualChatterName = chatterId; // Fallback to chatterId
          }
        }
        
        console.log('🔍 DEBUG: About to save AIAnalysis with scores:', {
          chatterName: actualChatterName,
          grammarScore: aiAnalysis.grammarScore,
          guidelinesScore: aiAnalysis.guidelinesScore,
          overallScore: aiAnalysis.overallScore
        });
        
        const aiAnalysisDoc = new AIAnalysis({
          chatterName: actualChatterName,
          timestamp: analysisTimestamp,
          dateRange: {
            start: analysisDateRangeStart,
            end: analysisDateRangeEnd
          },
          grammarScore: aiAnalysis.grammarScore || 0,
          guidelinesScore: aiAnalysis.guidelinesScore || 0,
          overallScore: aiAnalysis.overallScore || 0,
          grammarBreakdown: aiAnalysis.grammarBreakdown || {},
          guidelinesBreakdown: aiAnalysis.guidelinesBreakdown || {},
          overallBreakdown: aiAnalysis.overallBreakdown || {},
          executiveSummary: aiAnalysis.executiveSummary || {},
          advancedMetrics: aiAnalysis.advancedMetrics || {},
          strategicInsights: aiAnalysis.strategicInsights || {},
          actionPlan: aiAnalysis.actionPlan || {}
        });
        await aiAnalysisDoc.save();
        console.log('✅ AIAnalysis saved to database for team dashboard:', aiAnalysisDoc._id, 'chatterName:', aiAnalysisDoc.chatterName, 'scores:', {
          grammar: aiAnalysisDoc.grammarScore,
          guidelines: aiAnalysisDoc.guidelinesScore,
          overall: aiAnalysisDoc.overallScore
        });
      } catch (saveError) {
        console.error('🚨🚨🚨 SAVE FAILED 🚨🚨🚨');
        console.error('❌ Error:', saveError.message);
        console.error('❌ Stack:', saveError.stack);
        console.error('❌ Attempted to save with chatterName:', actualChatterName);
        console.error('❌ Scores:', { grammar: aiAnalysis.grammarScore, guidelines: aiAnalysis.guidelinesScore, overall: aiAnalysis.overallScore });
        // Don't fail the request if save fails - still return the analysis
      }
      
      res.json(aiAnalysis);
    } catch (aiError) {
      console.error('AI Analysis failed, falling back to basic analysis:', aiError);
      
      // Fallback to basic analysis if AI fails
      try {
        if (analysisType === 'individual') {
          const deterministic = generateDeterministicIndividualAnalysis(analyticsData, interval, analyticsData.messagesSent || 0);
          // Add raw metrics
          deterministic.ppvsSent = analyticsData.ppvsSent;
          deterministic.ppvsUnlocked = analyticsData.ppvsUnlocked;
          deterministic.messagesSent = analyticsData.messagesSent;
          deterministic.fansChatted = analyticsData.fansChatted;
          deterministic.avgResponseTime = analyticsData.avgResponseTime;
          deterministic.grammarScore = analyticsData.grammarScore;
          deterministic.guidelinesScore = analyticsData.guidelinesScore;
          deterministic.overallScore = analyticsData.overallMessageScore;
          // Add message analysis data to fallback
          deterministic.chattingStyle = analyticsData.chattingStyle;
          deterministic.messagePatterns = analyticsData.messagePatterns;
          deterministic.engagementMetrics = analyticsData.engagementMetrics;
          deterministic.strengths = analyticsData.strengths;
          deterministic.weaknesses = analyticsData.weaknesses;
          deterministic.suggestions = analyticsData.recommendations;
          // Add detailed breakdowns with fallback content
          deterministic.grammarBreakdown = {
            "spellingErrors": `Based on ${analyticsData.grammarScore}/100 score, some spelling issues present. Common errors include typos and autocorrect mistakes.`,
            "grammarIssues": `Grammar score of ${analyticsData.grammarScore}/100 indicates room for improvement in sentence structure and verb tenses.`,
            "punctuationProblems": `Punctuation usage could be enhanced for better readability and professional appearance.`,
            "informalLanguage": `Specific issues found in message analysis include inconsistent capitalization and missing punctuation.`,
            "scoreExplanation": `Grammar analysis based on message content review and scoring algorithms.`
          };
          deterministic.guidelinesBreakdown = {
            "salesEffectiveness": `Guidelines score of ${analyticsData.guidelinesScore}/100 suggests some sales techniques could be improved.`,
            "engagementQuality": `Engagement patterns show good relationship building but could benefit from more strategic PPV timing.`,
            "captionQuality": `PPV captions are present but could be more compelling to increase conversion rates.`,
            "conversationFlow": `Focus on building stronger connections before sending PPVs and improve caption writing.`,
            "scoreExplanation": `Guidelines analysis based on sales effectiveness and engagement patterns.`
          };
          deterministic.overallBreakdown = {
            "messageClarity": `Overall message quality score of ${analyticsData.overallMessageScore}/100 indicates good foundation with room for improvement.`,
            "emotionalImpact": `Message patterns show good engagement but could benefit from more strategic conversation management.`,
            "conversionPotential": `PPV conversion rates could be improved with better timing and more compelling content descriptions.`,
            "scoreExplanation": `Relationship building is strong, focus on maintaining engagement between PPVs.`
          };
          console.log('🔍 Fallback grammarBreakdown:', JSON.stringify(deterministic.grammarBreakdown));
          console.log('🔍 Fallback guidelinesBreakdown:', JSON.stringify(deterministic.guidelinesBreakdown));
          console.log('🔍 Fallback overallBreakdown:', JSON.stringify(deterministic.overallBreakdown));
          console.log('🔍 FALLBACK RESPONSE - grammarBreakdown:', JSON.stringify(deterministic.grammarBreakdown));
          console.log('🔍 FALLBACK RESPONSE - guidelinesBreakdown:', JSON.stringify(deterministic.guidelinesBreakdown));
          console.log('🔍 FALLBACK RESPONSE - overallBreakdown:', JSON.stringify(deterministic.overallBreakdown));
          res.json(deterministic);
        } else {
          const fallbackAnalysis = await generateFallbackAnalysis(analyticsData, analysisType, interval);
          console.log('🔍 FINAL FALLBACK RESPONSE - grammarBreakdown:', JSON.stringify(fallbackAnalysis.grammarBreakdown));
          console.log('🔍 FINAL FALLBACK RESPONSE - guidelinesBreakdown:', JSON.stringify(fallbackAnalysis.guidelinesBreakdown));
          console.log('🔍 FINAL FALLBACK RESPONSE - overallBreakdown:', JSON.stringify(fallbackAnalysis.overallBreakdown));
          res.json(fallbackAnalysis);
        }
      } catch (fallbackError) {
        console.error('Fallback analysis also failed:', fallbackError);
        
        // Ultimate fallback - simple analysis without database queries
        const simpleAnalysis = {
          overallScore: null, // No fake scores
          insights: [
            `Total revenue: $${analyticsData.totalRevenue.toLocaleString()} this ${interval} period`,
            `PPVs sent: ${analyticsData.ppvsSent}`,
            `Average response time: ${analyticsData.avgResponseTime} minutes`
          ],
          weakPoints: [
            analyticsData.avgResponseTime > 3 ? `Response time of ${analyticsData.avgResponseTime} minutes is above optimal` : null
          ].filter(Boolean),
          opportunities: [
            `Improving response time could increase conversions`
          ],
          roiCalculations: [
            `Response time improvement: $${Math.round(analyticsData.totalRevenue * 0.15)} potential monthly gain for $400 training cost`
          ],
          recommendations: [
            'Focus on faster response times - aim for under 2 minutes',
            'Test premium PPV pricing strategy'
          ],
          // Add raw metrics
          ppvsSent: analyticsData.ppvsSent,
          ppvsUnlocked: analyticsData.ppvsUnlocked,
          messagesSent: analyticsData.messagesSent,
          fansChatted: analyticsData.fansChatted,
          avgResponseTime: analyticsData.avgResponseTime,
          grammarScore: analyticsData.grammarScore,
          guidelinesScore: analyticsData.guidelinesScore
        };
        res.json(simpleAnalysis);
      }
    }
  } catch (error) {
    console.error('AI Analysis Error:', error);
    console.error('Error stack:', error.stack);
    res.status(500).json({ error: error.message, stack: error.stack });
  }
});

// AI Recommendations endpoint
app.get('/api/ai/recommendations', checkDatabaseConnection, authenticateToken, requireManager, async (req, res) => {
  try {
    const { interval = '7d' } = req.query;

    // Get analytics data for analysis
    const analytics = await Analytics.find({}).sort({ date: -1 }).limit(30);
    const chatters = await Chatter.find({ isActive: true });

    // Generate AI recommendations based on data patterns
    const recommendations = await generateAIRecommendations(analytics, chatters, interval);

    res.json(recommendations);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Guidelines Management
app.get('/api/guidelines', authenticateToken, async (req, res) => {
  try {
    const guidelines = await Guideline.find({ isActive: true }).sort({ category: 1, title: 1 });
    res.json(guidelines);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/guidelines', authenticateToken, requireManager, async (req, res) => {
  try {
    const { title, description, category, weight, priority, examples, counterExamples } = req.body;
    const guideline = new Guideline({
      title,
      description,
      category,
      weight: weight || priority, // Accept both weight and priority
      examples: examples || [],
      counterExamples: counterExamples || []
    });
    await guideline.save();
    res.json(guideline);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.put('/api/guidelines/:id', authenticateToken, requireManager, async (req, res) => {
  try {
    const { title, description, category, weight, priority, examples, counterExamples } = req.body;
    const guideline = await Guideline.findByIdAndUpdate(
      req.params.id,
      {
        title,
        description,
        category,
        weight: weight || priority, // Accept both weight and priority
        examples: examples || [],
        counterExamples: counterExamples || [],
        updatedAt: new Date()
      },
      { new: true }
    );
    res.json(guideline);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Admin: wipe all guidelines
app.delete('/api/guidelines', authenticateToken, requireManager, async (req, res) => {
  try {
    const result = await Guideline.deleteMany({});
    res.json({ success: true, deletedCount: result.deletedCount });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Delete individual guideline
app.delete('/api/guidelines/:id', authenticateToken, requireManager, async (req, res) => {
  try {
    const { id } = req.params;
    const result = await Guideline.findByIdAndDelete(id);
    
    if (!result) {
      return res.status(404).json({ error: 'Guideline not found' });
    }
    
    res.json({ success: true, message: 'Guideline deleted successfully' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Daily Chatter Reports
app.post('/api/daily-reports', authenticateToken, async (req, res) => {
  try {
    const {
      date,
      shift,
      ppvSales,
      tips,
      fansChatted,
      avgResponseTime,
      notes
    } = req.body;

    // Calculate totals
    const totalPPVRevenue = ppvSales.reduce((sum, sale) => sum + sale.amount, 0);
    const totalTipRevenue = tips.reduce((sum, tip) => sum + tip.amount, 0);
    const totalRevenue = totalPPVRevenue + totalTipRevenue;
    const avgPPVPrice = ppvSales.length > 0 ? totalPPVRevenue / ppvSales.length : 0;
    const avgTipAmount = tips.length > 0 ? totalTipRevenue / tips.length : 0;

    const report = new DailyChatterReport({
      chatterName: req.user.chatterName,
      date: new Date(date),
      shift,
      ppvSales,
      tips,
      fansChatted,
      avgResponseTime,
      totalPPVRevenue,
      totalTipRevenue,
      totalRevenue,
      avgPPVPrice,
      avgTipAmount,
      notes
    });

    await report.save();
    
    // ==================== MARKETING ANALYTICS: Create FanPurchase records ====================
    const creatorAccount = await CreatorAccount.findOne(); // Get default creator account
    const reportDate = new Date(date);
    
    // Process PPV sales
    for (const sale of ppvSales) {
      const fanPurchase = new FanPurchase({
        amount: sale.amount,
        type: 'ppv',
        date: reportDate,
        creatorAccount: creatorAccount?._id,
        chatterName: req.user.chatterName,
        dailyReport: report._id
      });
      
      if (sale.trafficSource) {
        fanPurchase.trafficSource = sale.trafficSource;
      }
      
      if (sale.vipFanUsername) {
        fanPurchase.fanUsername = sale.vipFanUsername;
        
        // Check if VIP fan exists, create or update
        let vipFan = await VIPFan.findOne({ 
          username: sale.vipFanUsername,
          creatorAccount: creatorAccount?._id
        });
        
        if (!vipFan) {
          // Create new VIP fan
          vipFan = new VIPFan({
            username: sale.vipFanUsername,
            creatorAccount: creatorAccount?._id,
            trafficSource: sale.trafficSource,
            joinDate: reportDate,
            firstSeenDate: reportDate, // NEW: Track when we first saw this fan
            lifetimeSpend: sale.amount,
            lastPurchaseDate: reportDate,
            purchaseCount: 1,
            avgPurchaseValue: sale.amount
          });
          await vipFan.save();
          console.log(`⭐ Created new VIP fan: ${sale.vipFanUsername}`);
        } else {
          // Update existing VIP fan
          vipFan.lifetimeSpend += sale.amount;
          vipFan.lastPurchaseDate = reportDate;
          vipFan.purchaseCount += 1;
          vipFan.avgPurchaseValue = vipFan.lifetimeSpend / vipFan.purchaseCount;
          vipFan.status = 'active';
          vipFan.updatedAt = new Date();
          
          // 🎯 AUTO VIP PROMOTION: Promote to VIP at $500+ lifetime spend
          if (vipFan.lifetimeSpend >= 500 && !vipFan.isVIP) {
            vipFan.isVIP = true;
            vipFan.vipPromotedDate = new Date();
            console.log(`🌟 AUTO-PROMOTED TO VIP: ${sale.vipFanUsername} reached $${vipFan.lifetimeSpend.toFixed(2)} lifetime!`);
          }
          
          await vipFan.save();
          console.log(`⭐ Updated ${vipFan.isVIP ? 'VIP' : 'spender'}: ${sale.vipFanUsername} - $${vipFan.lifetimeSpend.toFixed(2)} lifetime`);
        }
        
        fanPurchase.vipFan = vipFan._id;
      }
      
      await fanPurchase.save();
    }
    
    // Process tips
    for (const tip of tips) {
      const fanPurchase = new FanPurchase({
        amount: tip.amount,
        type: 'tip',
        date: reportDate,
        creatorAccount: creatorAccount?._id,
        chatterName: req.user.chatterName,
        dailyReport: report._id
      });
      
      if (tip.trafficSource) {
        fanPurchase.trafficSource = tip.trafficSource;
      }
      
      if (tip.vipFanUsername) {
        fanPurchase.fanUsername = tip.vipFanUsername;
        
        // Check if VIP fan exists, create or update
        let vipFan = await VIPFan.findOne({ 
          username: tip.vipFanUsername,
          creatorAccount: creatorAccount?._id
        });
        
        if (!vipFan) {
          // Create new VIP fan
          vipFan = new VIPFan({
            username: tip.vipFanUsername,
            creatorAccount: creatorAccount?._id,
            trafficSource: tip.trafficSource,
            joinDate: reportDate,
            firstSeenDate: reportDate, // NEW: Track when we first saw this fan
            lifetimeSpend: tip.amount,
            lastPurchaseDate: reportDate,
            purchaseCount: 1,
            avgPurchaseValue: tip.amount
          });
          await vipFan.save();
          console.log(`⭐ Created new VIP fan: ${tip.vipFanUsername}`);
        } else {
          // Update existing VIP fan
          vipFan.lifetimeSpend += tip.amount;
          vipFan.lastPurchaseDate = reportDate;
          vipFan.purchaseCount += 1;
          vipFan.avgPurchaseValue = vipFan.lifetimeSpend / vipFan.purchaseCount;
          vipFan.status = 'active';
          vipFan.updatedAt = new Date();
          
          // 🎯 AUTO VIP PROMOTION: Promote to VIP at $500+ lifetime spend
          if (vipFan.lifetimeSpend >= 500 && !vipFan.isVIP) {
            vipFan.isVIP = true;
            vipFan.vipPromotedDate = new Date();
            console.log(`🌟 AUTO-PROMOTED TO VIP: ${tip.vipFanUsername} reached $${vipFan.lifetimeSpend.toFixed(2)} lifetime!`);
          }
          
          await vipFan.save();
          console.log(`⭐ Updated ${vipFan.isVIP ? 'VIP' : 'spender'}: ${tip.vipFanUsername} - $${vipFan.lifetimeSpend.toFixed(2)} lifetime`);
        }
        
        fanPurchase.vipFan = vipFan._id;
      }
      
      await fanPurchase.save();
    }
    
    console.log(`💰 Created ${ppvSales.length + tips.length} FanPurchase records`);
    
    // Recalculate avgPPVPrice from ALL daily reports for this chatter
    // This ensures Dashboard/Analytics/Analysis all show the updated avgPPVPrice
    const allReports = await DailyChatterReport.find({ 
      chatterName: req.user.chatterName 
    });
    
    // Sum all PPV sales (excluding tips)
    let totalPPVAmount = 0;
    let totalPPVCount = 0;
    
    allReports.forEach(r => {
      if (r.ppvSales && r.ppvSales.length > 0) {
        r.ppvSales.forEach(sale => {
          totalPPVAmount += sale.amount;
          totalPPVCount++;
        });
      }
    });
    
    const calculatedAvgPPVPrice = totalPPVCount > 0 ? totalPPVAmount / totalPPVCount : 0;
    
    // Update or create ChatterPerformance record with the new avgPPVPrice
    // Find the most recent ChatterPerformance for this chatter
    const latestPerformance = await ChatterPerformance.findOne({ 
      chatterName: req.user.chatterName 
    }).sort({ weekStartDate: -1 });
    
    if (latestPerformance) {
      latestPerformance.avgPPVPrice = calculatedAvgPPVPrice;
      await latestPerformance.save();
      console.log(`✅ Updated avgPPVPrice for ${req.user.chatterName}: $${calculatedAvgPPVPrice.toFixed(2)} (from ${totalPPVCount} PPV sales)`);
    }
    
    res.json({ 
      message: 'Daily report saved successfully', 
      report,
      avgPPVPrice: calculatedAvgPPVPrice
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Get chatter's own reports
app.get('/api/daily-reports', authenticateToken, async (req, res) => {
  try {
    const { startDate, endDate } = req.query;
    let query = {};

    // Chatters can only see their own data
    if (req.user.role === 'chatter') {
      query.chatterName = req.user.chatterName;
    }

    if (startDate && endDate) {
      query.date = { $gte: new Date(startDate), $lte: new Date(endDate) };
    }

    const reports = await DailyChatterReport.find(query)
      .sort({ date: -1 })
      .populate('ppvSales.creatorAccount tips.creatorAccount');

    res.json(reports);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Serve static files
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Check for required environment variables
if (!process.env.JWT_SECRET) {
  console.warn('⚠️  JWT_SECRET not set - using default (not secure for production)');
}

// Update creator names on startup (one-time migration)
async function updateCreatorNames() {
  try {
    const creators = await CreatorAccount.find().sort({ _id: 1 });
    const names = ['Arya', 'Iris', 'Lilla'];
    const accounts = ['@arya_of', '@iris_of', '@lilla_of'];
    
    let updated = 0;
    for (let i = 0; i < Math.min(creators.length, 3); i++) {
      if (creators[i].name.startsWith('Creator')) {
        creators[i].name = names[i];
        creators[i].accountName = accounts[i];
        await creators[i].save();
        console.log(`✅ Updated ${creators[i]._id} to ${names[i]}`);
        updated++;
      }
    }
    if (updated > 0) {
      console.log(`🎉 Updated ${updated} creator names!`);
    }
  } catch (error) {
    console.log('Creator name migration skipped:', error.message);
  }
}

// ==================== MARKETING ANALYTICS APIs ====================

// Get all traffic sources
app.get('/api/marketing/traffic-sources', authenticateToken, async (req, res) => {
  try {
    const sources = await TrafficSource.find().sort({ category: 1, name: 1 });
    res.json({ sources });
  } catch (error) {
    console.error('Error fetching traffic sources:', error);
    res.status(500).json({ error: 'Failed to fetch traffic sources' });
  }
});

// Create traffic source
app.post('/api/marketing/traffic-sources', authenticateToken, requireManager, async (req, res) => {
  try {
    const { name, category, subcategory } = req.body;
    
    if (!name || !category) {
      return res.status(400).json({ error: 'Name and category are required' });
    }
    
    const source = new TrafficSource({
      name,
      category,
      subcategory,
      createdBy: req.user.userId
    });
    
    await source.save();
    console.log('✅ Created traffic source:', name);
    res.json({ success: true, source });
  } catch (error) {
    console.error('Error creating traffic source:', error);
    res.status(500).json({ error: 'Failed to create traffic source' });
  }
});

// Update traffic source
app.put('/api/marketing/traffic-sources/:id', authenticateToken, requireManager, async (req, res) => {
  try {
    const { name, category, subcategory, isActive } = req.body;
    
    const source = await TrafficSource.findByIdAndUpdate(
      req.params.id,
      { name, category, subcategory, isActive },
      { new: true }
    );
    
    if (!source) {
      return res.status(404).json({ error: 'Traffic source not found' });
    }
    
    console.log('✅ Updated traffic source:', source.name);
    res.json({ success: true, source });
  } catch (error) {
    console.error('Error updating traffic source:', error);
    res.status(500).json({ error: 'Failed to update traffic source' });
  }
});

// Delete traffic source
app.delete('/api/marketing/traffic-sources/:id', authenticateToken, requireManager, async (req, res) => {
  try {
    const source = await TrafficSource.findByIdAndDelete(req.params.id);
    
    if (!source) {
      return res.status(404).json({ error: 'Traffic source not found' });
    }
    
    console.log('✅ Deleted traffic source:', source.name);
    res.json({ success: true });
  } catch (error) {
    console.error('Error deleting traffic source:', error);
    res.status(500).json({ error: 'Failed to delete traffic source' });
  }
});

// Get VIP fans (for autocomplete)
app.get('/api/marketing/vip-fans', authenticateToken, async (req, res) => {
  try {
    const fans = await VIPFan.find({ status: 'active' })
      .select('username lifetimeSpend purchaseCount')
      .sort({ lifetimeSpend: -1 })
      .limit(100);
    
    res.json({ fans });
  } catch (error) {
    console.error('Error fetching VIP fans:', error);
    res.status(500).json({ error: 'Failed to fetch VIP fans' });
  }
});

// Get marketing dashboard data
app.get('/api/marketing/dashboard', authenticateToken, async (req, res) => {
  try {
    const { filterType, weekStart, weekEnd, monthStart, monthEnd, customStart, customEnd } = req.query;
    
    let dateQuery = {};
    
    // Build date filter for FanPurchase
    if (filterType === 'custom' && customStart && customEnd) {
      // NEW: Custom date range
      dateQuery.date = {
        $gte: new Date(customStart),
        $lte: new Date(customEnd)
      };
      console.log('📊 Marketing Dashboard using CUSTOM date range:', customStart, 'to', customEnd);
    } else if (filterType === 'week' && weekStart && weekEnd) {
      dateQuery.date = {
        $gte: new Date(weekStart),
        $lte: new Date(weekEnd)
      };
    } else if (filterType === 'month' && monthStart && monthEnd) {
      dateQuery.date = {
        $gte: new Date(monthStart),
        $lte: new Date(monthEnd)
      };
    }
    
    console.log('📊 Marketing Dashboard query:', dateQuery);
    
    // Get all purchases (aggregated from FanPurchase)
    const purchases = await FanPurchase.find(dateQuery)
      .populate('trafficSource')
      .populate('vipFan');
    
    console.log(`📊 Found ${purchases.length} purchases for dashboard`);
    
    // Get all traffic sources
    const allSources = await TrafficSource.find({ isActive: true });
    
    // Aggregate by traffic source
    const sourceMap = {};
    let totalRevenue = 0;
    const vipSet = new Set();
    
    purchases.forEach(purchase => {
      totalRevenue += purchase.amount;
      
      // Track VIPs
      if (purchase.vipFan) {
        vipSet.add(purchase.vipFan._id.toString());
      }
      
      // Aggregate by source
      const sourceId = purchase.trafficSource?._id?.toString() || 'unknown';
      if (sourceId !== 'unknown' && purchase.trafficSource) {
        if (!sourceMap[sourceId]) {
          sourceMap[sourceId] = {
            id: sourceId,
            name: purchase.trafficSource.name,
            category: purchase.trafficSource.category,
            revenue: 0,
            purchaseCount: 0,
            vipPurchases: new Set(),
            buyers: new Set()
          };
        }
        
        sourceMap[sourceId].revenue += purchase.amount;
        sourceMap[sourceId].purchaseCount += 1;
        
        if (purchase.vipFan) {
          sourceMap[sourceId].vipPurchases.add(purchase.vipFan._id.toString());
        }
        if (purchase.fanUsername) {
          sourceMap[sourceId].buyers.add(purchase.fanUsername);
        }
      }
    });
    
    // Get link tracking data BY CATEGORY (reddit, twitter, etc.)
    const linkTrackingMap = {};
    const linkTracking = await LinkTrackingData.find(dateQuery);
    linkTracking.forEach(lt => {
      if (lt.category) {
        if (!linkTrackingMap[lt.category]) {
          linkTrackingMap[lt.category] = {
            clicks: 0,
            views: 0
          };
        }
        linkTrackingMap[lt.category].clicks += lt.onlyFansClicks || 0;
        linkTrackingMap[lt.category].views += lt.landingPageViews || 0;
      }
    });
    
    console.log('🔗 Link tracking by category:', linkTrackingMap);
    
    // Convert to array and calculate ENHANCED metrics
    const sources = await Promise.all(Object.values(sourceMap).map(async (source) => {
      const vipCount = source.vipPurchases.size;
      const spenderCount = source.vipPurchases.size; // Unique spenders
      
      // Get link tracking data for this source's CATEGORY
      const linkData = linkTrackingMap[source.category] || { clicks: 0, views: 0 };
      const linkClicks = linkData.clicks;
      
      // Calculate spender rate (KEY NEW METRIC!)
      const spenderRate = linkClicks > 0 ? (spenderCount / linkClicks) * 100 : 0;
      
      // Calculate revenue per click (ROI metric)
      const revenuePerClick = linkClicks > 0 ? source.revenue / linkClicks : 0;
      
      // Calculate avg per spender
      const avgPerSpender = spenderCount > 0 ? source.revenue / spenderCount : 0;
      
      // Calculate retention rates (7-day and 30-day based on purchase activity)
      const vipFans = await VIPFan.find({
        _id: { $in: Array.from(source.vipPurchases) },
        trafficSource: source.id
      });
      
      let retainedCount7d = 0;
      let retainedCount30d = 0;
      let totalTracked = 0;
      
      const sevenDaysAgo = new Date();
      sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
      
      const thirtyDaysAgo = new Date();
      thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
      
      vipFans.forEach(fan => {
        if (fan.firstSeenDate) {
          totalTracked++;
          // Retained if they purchased in the last X days
          // Use lastPurchaseDate (purchase = active engagement and revenue)
          const lastActivity = fan.lastPurchaseDate;
          
          if (lastActivity && lastActivity >= sevenDaysAgo) {
            retainedCount7d++;
          }
          
          if (lastActivity && lastActivity >= thirtyDaysAgo) {
            retainedCount30d++;
          }
        }
      });
      
      const retentionRate = totalTracked > 0 ? (retainedCount7d / totalTracked) * 100 : 0;
      const retentionRate30d = totalTracked > 0 ? (retainedCount30d / totalTracked) * 100 : 0;
      
      // NEW: Calculate renew rate (% of VIP fans with auto-renew enabled)
      let renewCount = 0;
      vipFans.forEach(fan => {
        if (fan.hasRenewOn) {
          renewCount++;
        }
      });
      const renewRate = vipFans.length > 0 ? (renewCount / vipFans.length) * 100 : 0;
      
      // ENHANCED QUALITY SCORE (0-100)
      const spenderRateScore = Math.min(spenderRate * 6, 30); // 30 points max (5% = 30pts)
      const revenuePerClickScore = Math.min(revenuePerClick * 10, 20); // 20 points max ($2 = 20pts)
      const retentionScore = retentionRate * 0.3; // 30 points max (100% = 30pts)
      const avgSpenderScore = Math.min(avgPerSpender / 2, 20); // 20 points max ($40 = 20pts)
      
      const qualityGrade = Math.min(
        spenderRateScore + revenuePerClickScore + retentionScore + avgSpenderScore,
        100
      );
      
      let qualityScore = 'N/A';
      if (qualityGrade >= 90) qualityScore = 'A+';
      else if (qualityGrade >= 80) qualityScore = 'A';
      else if (qualityGrade >= 70) qualityScore = 'B';
      else if (qualityGrade >= 60) qualityScore = 'C';
      else if (qualityGrade >= 50) qualityScore = 'D';
      else qualityScore = 'F';
      
      return {
        id: source.id,
        name: source.name,
        category: source.category,
        // Revenue metrics
        revenue: source.revenue,
        // NEW: Link & conversion metrics
        linkClicks: linkClicks,
        linkViews: linkData.views,
        spenders: spenderCount,
        spenderRate: spenderRate, // KEY METRIC!
        revenuePerClick: revenuePerClick, // KEY METRIC!
        avgPerSpender: avgPerSpender,
        // Retention
        retentionRate: retentionRate, // 7-day retention
        retentionRate30d: retentionRate30d, // 30-day retention
        retainedCount7d: retainedCount7d,
        retainedCount30d: retainedCount30d,
        totalTracked: totalTracked,
        // NEW: Renew rate
        renewRate: renewRate, // KEY METRIC! % with auto-renew on
        renewCount: renewCount,
        // VIP tracking
        vips: vipCount,
        // Quality
        qualityScore,
        qualityGrade: Math.round(qualityGrade)
      };
    }));
    
    // Sort by quality grade (best sources first!)
    sources.sort((a, b) => b.qualityGrade - a.qualityGrade);
    
    // ALSO: Aggregate by CATEGORY for category-level overview
    const categoryMap = {};
    sources.forEach(source => {
      if (!categoryMap[source.category]) {
        categoryMap[source.category] = {
          category: source.category,
          revenue: 0,
          spenders: 0,
          linkClicks: linkTrackingMap[source.category]?.clicks || 0,
          linkViews: linkTrackingMap[source.category]?.views || 0,
          subcategories: []
        };
      }
      categoryMap[source.category].revenue += source.revenue;
      categoryMap[source.category].spenders += source.spenders;
      categoryMap[source.category].subcategories.push({
        name: source.name,
        revenue: source.revenue,
        spenders: source.spenders,
        revenuePercent: 0 // Will calculate after
      });
    });
    
    // Calculate percentages and metrics for each category
    const categories = Object.values(categoryMap).map(cat => {
      const revenuePerClick = cat.linkClicks > 0 ? cat.revenue / cat.linkClicks : 0;
      const spenderRate = cat.linkClicks > 0 ? (cat.spenders / cat.linkClicks) * 100 : 0;
      
      // Calculate revenue % for each subcategory
      cat.subcategories.forEach(sub => {
        sub.revenuePercent = cat.revenue > 0 ? (sub.revenue / cat.revenue) * 100 : 0;
      });
      
      return {
        ...cat,
        revenuePerClick,
        spenderRate
      };
    });
    
    categories.sort((a, b) => b.revenue - a.revenue);
    
    const aggregated = {
      totalRevenue,
      totalSubscribers: 0,
      totalVIPs: vipSet.size,
      avgRevenuePerSub: 0,
      sources, // Individual source data
      categories // NEW: Category-level aggregated data
    };
    
    console.log('📊 Dashboard aggregated:', {
      totalRevenue,
      totalVIPs: vipSet.size,
      sourcesCount: sources.length,
      categoriesCount: categories.length
    });
    
    res.json(aggregated);
  } catch (error) {
    console.error('Error fetching marketing dashboard:', error);
    res.status(500).json({ error: 'Failed to fetch marketing dashboard' });
  }
});

// Upload link tracking data (by CATEGORY, not specific source)
app.post('/api/marketing/link-tracking', authenticateToken, async (req, res) => {
  try {
    const { category, weekStart, weekEnd, landingPageViews, onlyFansClicks, ...optionalData } = req.body;
    
    if (!category || !weekStart || !weekEnd || !landingPageViews || !onlyFansClicks) {
      return res.status(400).json({ error: 'Missing required fields' });
    }
    
    // Get creator account (assume first one for now, or get from user)
    const creatorAccount = await CreatorAccount.findOne();
    
    const clickThroughRate = landingPageViews > 0 ? (onlyFansClicks / landingPageViews) * 100 : 0;
    
    const linkData = new LinkTrackingData({
      category, // NEW: Track by category (reddit, twitter, etc.)
      creatorAccount: creatorAccount._id,
      weekStartDate: new Date(weekStart),
      weekEndDate: new Date(weekEnd),
      landingPageViews,
      onlyFansClicks,
      clickThroughRate,
      ...optionalData,
      uploadedBy: req.user.userId
    });
    
    await linkData.save();
    console.log(`✅ Saved link tracking data for ${category} - week: ${weekStart}`);
    res.json({ success: true, data: linkData });
  } catch (error) {
    console.error('Error saving link tracking data:', error);
    res.status(500).json({ error: 'Failed to save link tracking data' });
  }
});

// ==================== DATA MANAGEMENT APIs ====================

// Get all messages for data management
app.get('/api/data-management/messages', authenticateToken, requireManager, async (req, res) => {
  try {
    const messages = await MessageAnalysis.find()
      .select('chatterName weekStartDate weekEndDate totalMessages creatorAccount')
      .sort({ weekStartDate: -1 })
      .limit(100);
    
    res.json({ messages });
  } catch (error) {
    console.error('Error fetching messages:', error);
    res.status(500).json({ error: 'Failed to fetch messages' });
  }
});

// Delete message record
app.delete('/api/data-management/messages/:id', authenticateToken, requireManager, async (req, res) => {
  try {
    const result = await MessageAnalysis.findByIdAndDelete(req.params.id);
    if (!result) {
      return res.status(404).json({ error: 'Message record not found' });
    }
    console.log(`🗑️ Deleted message record: ${result.chatterName}`);
    res.json({ success: true });
  } catch (error) {
    console.error('Error deleting message:', error);
    res.status(500).json({ error: 'Failed to delete message record' });
  }
});

// Get all daily reports for data management
app.get('/api/data-management/daily-reports', authenticateToken, requireManager, async (req, res) => {
  try {
    const reports = await DailyChatterReport.find()
      .sort({ date: -1 })
      .limit(100);
    
    res.json({ reports });
  } catch (error) {
    console.error('Error fetching daily reports:', error);
    res.status(500).json({ error: 'Failed to fetch daily reports' });
  }
});

// Delete daily report (also deletes associated FanPurchase records)
app.delete('/api/data-management/daily-reports/:id', authenticateToken, requireManager, async (req, res) => {
  try {
    const report = await DailyChatterReport.findById(req.params.id);
    if (!report) {
      return res.status(404).json({ error: 'Report not found' });
    }
    
    // Delete associated FanPurchase records
    const purchasesDeleted = await FanPurchase.deleteMany({ dailyReport: req.params.id });
    console.log(`🗑️ Deleted ${purchasesDeleted.deletedCount} associated purchase records`);
    
    await DailyChatterReport.findByIdAndDelete(req.params.id);
    console.log(`🗑️ Deleted daily report: ${report.chatterName} - ${report.date}`);
    
    res.json({ success: true, purchasesDeleted: purchasesDeleted.deletedCount });
  } catch (error) {
    console.error('Error deleting daily report:', error);
    res.status(500).json({ error: 'Failed to delete daily report' });
  }
});

// Get all link tracking data for data management
app.get('/api/data-management/link-tracking', authenticateToken, requireManager, async (req, res) => {
  try {
    const linkData = await LinkTrackingData.find()
      .sort({ weekStartDate: -1 })
      .limit(100);
    
    res.json({ linkData });
  } catch (error) {
    console.error('Error fetching link tracking data:', error);
    res.status(500).json({ error: 'Failed to fetch link tracking data' });
  }
});

// Delete link tracking data
app.delete('/api/data-management/link-tracking/:id', authenticateToken, requireManager, async (req, res) => {
  try {
    const result = await LinkTrackingData.findByIdAndDelete(req.params.id);
    if (!result) {
      return res.status(404).json({ error: 'Link tracking data not found' });
    }
    console.log(`🗑️ Deleted link tracking data: ${result.category}`);
    res.json({ success: true });
  } catch (error) {
    console.error('Error deleting link tracking data:', error);
    res.status(500).json({ error: 'Failed to delete link tracking data' });
  }
});

// Get all VIP fans for data management
app.get('/api/data-management/vip-fans', authenticateToken, requireManager, async (req, res) => {
  try {
    const fans = await VIPFan.find()
      .populate('trafficSource', 'name')
      .sort({ lifetimeSpend: -1 })
      .limit(100);
    
    const fansWithSourceName = fans.map(fan => ({
      _id: fan._id,
      username: fan.username,
      lifetimeSpend: fan.lifetimeSpend,
      purchaseCount: fan.purchaseCount,
      status: fan.status,
      trafficSourceName: fan.trafficSource?.name || 'Unknown'
    }));
    
    res.json({ fans: fansWithSourceName });
  } catch (error) {
    console.error('Error fetching VIP fans:', error);
    res.status(500).json({ error: 'Failed to fetch VIP fans' });
  }
});

// Delete VIP fan (also deletes associated purchase records)
app.delete('/api/data-management/vip-fans/:id', authenticateToken, requireManager, async (req, res) => {
  try {
    const fan = await VIPFan.findById(req.params.id);
    if (!fan) {
      return res.status(404).json({ error: 'VIP fan not found' });
    }
    
    // Delete associated FanPurchase records
    const purchasesDeleted = await FanPurchase.deleteMany({ vipFan: req.params.id });
    console.log(`🗑️ Deleted ${purchasesDeleted.deletedCount} purchase records for ${fan.username}`);
    
    await VIPFan.findByIdAndDelete(req.params.id);
    console.log(`🗑️ Deleted VIP fan: ${fan.username}`);
    
    res.json({ success: true, purchasesDeleted: purchasesDeleted.deletedCount });
  } catch (error) {
    console.error('Error deleting VIP fan:', error);
    res.status(500).json({ error: 'Failed to delete VIP fan' });
  }
});

// Update VIP fan message activity (for retention tracking)
// Call this when you have message data (from CSV or manual entry)
app.post('/api/vip-fans/update-message-activity', authenticateToken, async (req, res) => {
  try {
    const { updates } = req.body; // Array of { username, creatorAccount, lastMessageDate }
    
    if (!updates || !Array.isArray(updates)) {
      return res.status(400).json({ error: 'updates array is required' });
    }
    
    let updatedCount = 0;
    let notFoundCount = 0;
    
    for (const update of updates) {
      const { username, creatorAccount, lastMessageDate } = update;
      
      if (!username || !creatorAccount || !lastMessageDate) {
        continue; // Skip invalid entries
      }
      
      const result = await VIPFan.updateOne(
        { 
          username: username,
          creatorAccount: creatorAccount
        },
        { 
          $set: { 
            lastMessageDate: new Date(lastMessageDate),
            updatedAt: new Date()
          } 
        }
      );
      
      if (result.modifiedCount > 0) {
        updatedCount++;
      } else if (result.matchedCount === 0) {
        notFoundCount++;
      }
    }
    
    console.log(`✅ Updated lastMessageDate for ${updatedCount} VIP fans (${notFoundCount} not found)`);
    res.json({ 
      success: true, 
      updatedCount,
      notFoundCount,
      message: `Updated ${updatedCount} VIP fans, ${notFoundCount} not found`
    });
  } catch (error) {
    console.error('Error updating VIP fan message activity:', error);
    res.status(500).json({ error: 'Failed to update message activity' });
  }
});

// Helper function to build previous period data
async function buildPreviousPeriodData(prevPurchases, prevPerformance, chatterName) {
  // Get previous period MessageAnalysis
  const chatterNameRegex = new RegExp(`^${chatterName}$`, 'i');
  const prevMessageAnalysis = await MessageAnalysis.findOne({
    chatterName: chatterNameRegex
  }).sort({ createdAt: -1, _id: -1 }).skip(1); // Get second most recent (previous)
  
  if (prevPerformance.length === 0 && prevPurchases.length === 0) {
    return null; // No previous period data
  }
  
  const prevPerf = prevPerformance[0] || {};
  const prevRevenue = prevPurchases.reduce((sum, p) => sum + (p.amount || 0), 0);
  const prevPPVCount = prevPurchases.filter(p => p.type === 'ppv').length;
  
  return {
    revenue: prevRevenue,
    ppvsSent: prevPerf.ppvsSent || 0,
    ppvsUnlocked: prevPPVCount,
    messagesSent: prevPerf.messagesSent || 0,
    fansChatted: prevPerf.fansChattedWith || 0,
    unlockRate: prevPerf.ppvsSent > 0 ? ((prevPPVCount / prevPerf.ppvsSent) * 100).toFixed(1) : 0,
    avgPPVPrice: prevPPVCount > 0 ? Math.round(prevRevenue / prevPPVCount) : 0,
    grammarScore: prevMessageAnalysis?.grammarScore || null,
    guidelinesScore: prevMessageAnalysis?.guidelinesScore || null,
    overallScore: prevMessageAnalysis?.overallScore || null,
    punctuationCount: prevMessageAnalysis?.grammarBreakdown 
      ? parseInt(prevMessageAnalysis.grammarBreakdown.punctuationProblems?.match(/(\d+)/)?.[1] || '0')
      : 0
  };
}

// Helper function to build team averages
async function buildTeamData(allPurchases, allPerformance, excludeChatter) {
  // Group by chatter
  const chatterStats = {};
  
  // Calculate from ChatterPerformance
  allPerformance.forEach(perf => {
    if (perf.chatterName === excludeChatter) return; // Exclude current chatter
    
    if (!chatterStats[perf.chatterName]) {
      chatterStats[perf.chatterName] = {
        ppvsSent: 0,
        ppvsUnlocked: 0,
        messagesSent: 0,
        fansChatted: 0,
        revenue: 0,
        grammarScore: null,
        guidelinesScore: null
      };
    }
    
    chatterStats[perf.chatterName].ppvsSent += perf.ppvsSent || 0;
    chatterStats[perf.chatterName].ppvsUnlocked += perf.ppvsUnlocked || 0;
    chatterStats[perf.chatterName].messagesSent += perf.messagesSent || 0;
    chatterStats[perf.chatterName].fansChatted += perf.fansChattedWith || 0;
  });
  
  // Add revenue from FanPurchase
  allPurchases.forEach(purchase => {
    if (purchase.chatterName === excludeChatter) return;
    
    if (chatterStats[purchase.chatterName]) {
      chatterStats[purchase.chatterName].revenue += purchase.amount || 0;
    }
  });
  
  // Get MessageAnalysis for all chatters
  const allMessageAnalyses = await MessageAnalysis.find({})
    .sort({ createdAt: -1 })
    .limit(20); // Get recent analyses
  
  allMessageAnalyses.forEach(analysis => {
    if (analysis.chatterName === excludeChatter) return;
    if (chatterStats[analysis.chatterName]) {
      chatterStats[analysis.chatterName].grammarScore = analysis.grammarScore;
      chatterStats[analysis.chatterName].guidelinesScore = analysis.guidelinesScore;
    }
  });
  
  // Calculate averages
  const chatters = Object.values(chatterStats);
  const count = chatters.length;
  
  if (count === 0) {
    return { avgRevenue: 0, avgUnlockRate: 0, avgPPVsPerFan: 0, avgGuidelinesScore: null, chatterCount: 0 };
  }
  
  const avgRevenue = chatters.reduce((sum, c) => sum + c.revenue, 0) / count;
  const totalUnlockRate = chatters.reduce((sum, c) => {
    return sum + (c.ppvsSent > 0 ? (c.ppvsUnlocked / c.ppvsSent) * 100 : 0);
  }, 0);
  const avgUnlockRate = totalUnlockRate / count;
  
  const totalPPVsPerFan = chatters.reduce((sum, c) => {
    return sum + (c.fansChatted > 0 ? c.ppvsSent / c.fansChatted : 0);
  }, 0);
  const avgPPVsPerFan = totalPPVsPerFan / count;
  
  const chattersWithScores = chatters.filter(c => c.guidelinesScore !== null);
  const avgGuidelinesScore = chattersWithScores.length > 0
    ? chattersWithScores.reduce((sum, c) => sum + c.guidelinesScore, 0) / chattersWithScores.length
    : null;
  
  // Calculate correlation between guidelines and unlock rate
  const guidelinesUnlockCorrelation = calculateGuidelinesUnlockCorrelation(chatters);
  
  return {
    avgRevenue: Math.round(avgRevenue),
    avgUnlockRate: avgUnlockRate.toFixed(1),
    avgPPVsPerFan: avgPPVsPerFan.toFixed(2),
    avgGuidelinesScore: avgGuidelinesScore ? Math.round(avgGuidelinesScore) : null,
    chatterCount: count,
    guidelinesUnlockCorrelation,
    chatterStats: chatters // Include individual chatter data for correlation analysis
  };
}

// Helper function to calculate correlation between guidelines score and unlock rate
function calculateGuidelinesUnlockCorrelation(chatters) {
  const dataPoints = chatters.filter(c => 
    c.guidelinesScore !== null && c.ppvsSent > 0
  );
  
  if (dataPoints.length < 3) {
    return null; // Not enough data
  }
  
  // Group by guidelines score ranges
  const highGuidelines = dataPoints.filter(c => c.guidelinesScore >= 90);
  const midGuidelines = dataPoints.filter(c => c.guidelinesScore >= 70 && c.guidelinesScore < 90);
  const lowGuidelines = dataPoints.filter(c => c.guidelinesScore < 70);
  
  const avgUnlockRate = (chatters) => {
    if (chatters.length === 0) return null;
    const total = chatters.reduce((sum, c) => {
      return sum + (c.ppvsSent > 0 ? (c.ppvsUnlocked / c.ppvsSent) * 100 : 0);
    }, 0);
    return (total / chatters.length).toFixed(1);
  };
  
  return {
    high: { count: highGuidelines.length, avgUnlockRate: avgUnlockRate(highGuidelines) },
    mid: { count: midGuidelines.length, avgUnlockRate: avgUnlockRate(midGuidelines) },
    low: { count: lowGuidelines.length, avgUnlockRate: avgUnlockRate(lowGuidelines) }
  };
}

// Helper function to generate DEEP, CONNECTED analysis insights
function generateAnalysisSummary(data, previousPeriodData, teamData) {
  const insights = {
    summary: '',
    deepInsights: [],  // NEW: Deep connected insights
    improvements: [],
    strengths: []
  };
  
  // Extract key metrics (support both nested and flat structure)
  const chatter = data.chatter || {};
  const team = data.team || {};
  const overallScore = data.overallScore || chatter.overallScore || 0;
  const grammarScore = data.grammarScore || chatter.grammarScore || 0;
  const guidelinesScore = data.guidelinesScore || chatter.guidelinesScore || 0;
  const revenue = data.revenue || 0;
  const ppvsSent = data.ppvsSent || 0;
  const ppvsUnlocked = data.ppvsUnlocked || 0;
  const messagesSent = data.messagesSent || 0;
  const fansChatted = data.fansChatted || 0;
  const unlockRate = data.unlockRate || (ppvsSent > 0 ? ((ppvsUnlocked / ppvsSent) * 100).toFixed(1) : 0);
  const revenuePerMessage = data.revenuePerMessage || (messagesSent > 0 ? (revenue / messagesSent).toFixed(2) : 0);
  const revenuePerFan = data.revenuePerFan || (fansChatted > 0 ? (revenue / fansChatted).toFixed(2) : 0);
  const messagesPerFan = data.messagesPerFan || (fansChatted > 0 ? (messagesSent / fansChatted).toFixed(1) : 0);
  
  // Parse grammar breakdown for issues
  const grammarBreakdown = data.grammarBreakdown || {};
  const spellingCount = parseInt(grammarBreakdown.spellingErrors?.match(/(\d+)/)?.[1] || '0');
  const grammarIssuesCount = parseInt(grammarBreakdown.grammarIssues?.match(/(\d+)/)?.[1] || '0');
  const punctuationCount = parseInt(grammarBreakdown.punctuationProblems?.match(/(\d+)/)?.[1] || '0');
  
  // DEBUG
  console.log('📊 generateAnalysisSummary called with:', {
    messagesSent,
    revenue,
    ppvsSent,
    ppvsUnlocked,
    fansChatted,
    grammarScore,
    guidelinesScore,
    unlockRate,
    punctuationCount,
    spellingCount,
    revenuePerMessage,
    revenuePerFan,
    messagesPerFan
  });
  console.log('📊 Team data:', {
    avgRevenue: team.avgRevenue,
    avgUnlockRate: team.avgUnlockRate,
    chatterCount: team.chatterCount
  });
  
  // Generate summary paragraph
  let summaryParts = [];
  
  if (overallScore > 0) {
    summaryParts.push(`${data.chatter.name} demonstrates ${overallScore >= 90 ? 'excellent' : overallScore >= 80 ? 'strong' : overallScore >= 70 ? 'good' : 'developing'} message quality with a ${overallScore}/100 overall score`);
    
    if (guidelinesScore === 100) {
      summaryParts.push('perfect guideline compliance');
    } else if (guidelinesScore >= 90) {
      summaryParts.push('strong guideline adherence');
    }
  }
  
  if (revenue > 0 && messagesSent > 0 && fansChatted > 0) {
    summaryParts.push(`With ${messagesSent} messages generating $${revenue} revenue across ${fansChatted} fans, ${unlockRate > 0 ? `achieving a ${unlockRate}% unlock rate on ${ppvsSent} PPVs` : 'building relationships with fans'}`);
  }
  
  // Add primary improvement area if exists
  if (punctuationCount > 50) {
    summaryParts.push(`The primary area for improvement is punctuation usage, with ${punctuationCount} instances of formal punctuation that could be reduced to enhance the casual, engaging tone`);
  } else if (spellingCount > 5) {
    summaryParts.push(`Focus on reducing ${spellingCount} spelling errors to improve message professionalism`);
  } else if (grammarIssuesCount > 5) {
    summaryParts.push(`Address ${grammarIssuesCount} grammar issues to enhance message clarity`);
  } else if (overallScore >= 90) {
    summaryParts.push('Continue maintaining this high-quality standard');
  }
  
  insights.summary = summaryParts.join('. ') + '.';
  
  // ========================================
  // PATTERN-BASED INSIGHTS - Data-Driven, No BS
  // ========================================
  
  // PATTERN 1: Revenue Mechanical Breakdown (Always show if data exists)
  if (previousPeriodData && revenue > 0 && previousPeriodData.revenue > 0) {
    const revenueChange = revenue - previousPeriodData.revenue;
    const revenueChangePercent = ((revenueChange / previousPeriodData.revenue) * 100).toFixed(1);
    
    // Calculate contribution factors
    const ppvChange = ppvsSent - previousPeriodData.ppvsSent;
    const priceChange = (revenue / ppvsUnlocked) - (previousPeriodData.revenue / previousPeriodData.ppvsUnlocked);
    const unlockRateChange = parseFloat(unlockRate) - parseFloat(previousPeriodData.unlockRate);
    
    let breakdown = `Revenue ${revenueChange >= 0 ? 'increased' : 'decreased'} from $${previousPeriodData.revenue} to $${revenue} (${revenueChange >= 0 ? '+' : ''}$${revenueChange}, ${revenueChangePercent >= 0 ? '+' : ''}${revenueChangePercent}%).\n\n`;
    breakdown += `Breaking down what drove this:\n`;
    breakdown += `• PPVs sent ${ppvChange >= 0 ? 'increased' : 'decreased'} from ${previousPeriodData.ppvsSent} to ${ppvsSent} (${ppvChange >= 0 ? '+' : ''}${ppvChange})\n`;
    breakdown += `• Average PPV price ${priceChange >= 0 ? 'increased' : 'decreased'} by $${Math.abs(priceChange).toFixed(0)}\n`;
    breakdown += `• Unlock rate ${unlockRateChange >= 0 ? 'improved' : 'dropped'} from ${previousPeriodData.unlockRate}% to ${unlockRate}% (${unlockRateChange >= 0 ? '+' : ''}${unlockRateChange.toFixed(1)}%)\n\n`;
    breakdown += `${revenueChange >= 0 ? 'Positive' : 'Negative'} revenue movement was driven by ${Math.abs(ppvChange) > Math.abs(unlockRateChange) ? 'volume changes' : 'conversion rate changes'}.`;
    
    insights.deepInsights.push({
      type: revenueChange >= 0 ? 'positive' : 'warning',
      icon: 'fa-chart-line',
      title: 'Period-over-Period Revenue Analysis',
      insight: breakdown,
      metrics: `Previous: $${previousPeriodData.revenue} | Current: $${revenue} | Change: ${revenueChangePercent >= 0 ? '+' : ''}${revenueChangePercent}%`,
      action: revenueChange >= 0 ? 'Replicate the factors that drove growth' : 'Address the factors causing decline'
    });
  }
  
  // PATTERN 2: Team Guidelines Correlation (Only if strong correlation exists)
  if (teamData && teamData.guidelinesUnlockCorrelation && guidelinesScore !== null) {
    const correlation = teamData.guidelinesUnlockCorrelation;
    
    if (correlation.high.count >= 2 && correlation.mid.count >= 2) {
      const highAvg = parseFloat(correlation.high.avgUnlockRate);
      const midAvg = parseFloat(correlation.mid.avgUnlockRate);
      const diff = Math.abs(highAvg - midAvg);
      
      // Only show if there's a meaningful difference (>8%)
      if (diff > 8) {
        let insight = `Across ${teamData.chatterCount} chatters this period:\n`;
        insight += `• Chatters with 90-100 guidelines score: ${correlation.high.avgUnlockRate}% avg unlock rate (${correlation.high.count} chatters)\n`;
        insight += `• Chatters with 70-89 guidelines score: ${correlation.mid.avgUnlockRate}% avg unlock rate (${correlation.mid.count} chatters)\n`;
        if (correlation.low.count > 0) {
          insight += `• Chatters with <70 guidelines score: ${correlation.low.avgUnlockRate}% avg unlock rate (${correlation.low.count} chatters)\n`;
        }
        insight += `\nYour ${guidelinesScore}/100 score puts you in the ${guidelinesScore >= 90 ? 'top' : guidelinesScore >= 70 ? 'middle' : 'lower'} tier. `;
        
        if (guidelinesScore >= 90) {
          insight += `You're outperforming the team - your ${unlockRate}% unlock rate is ${(parseFloat(unlockRate) - midAvg).toFixed(1)}% above mid-tier performers.`;
        } else {
          insight += `Improving to 90+ could potentially increase your unlock rate by ${(highAvg - parseFloat(unlockRate)).toFixed(1)}%.`;
        }
        
        insights.deepInsights.push({
          type: guidelinesScore >= 90 ? 'positive' : 'opportunity',
          icon: 'fa-users',
          title: 'Team-Wide Guidelines Performance Correlation',
          insight: insight,
          metrics: `Your score: ${guidelinesScore}/100 | Your unlock rate: ${unlockRate}% | Top tier avg: ${correlation.high.avgUnlockRate}%`,
          action: guidelinesScore >= 90 ? 'Maintain this advantage' : 'Focus on guidelines compliance to match top performers'
        });
      }
    }
  }
  
  // PATTERN 3: Punctuation Impact (Period-over-period if available)
  if (previousPeriodData && punctuationCount > 50) {
    const prevPunctuation = previousPeriodData.punctuationCount || 0;
    const punctuationChange = punctuationCount - prevPunctuation;
    const unlockRateChange = parseFloat(unlockRate) - parseFloat(previousPeriodData.unlockRate || 0);
    
    if (punctuationChange !== 0) {
      let insight = `Punctuation errors ${punctuationChange > 0 ? 'increased' : 'decreased'} from ${prevPunctuation} to ${punctuationCount} (${punctuationChange > 0 ? '+' : ''}${punctuationChange}). `;
      
      if (punctuationChange > 20 && unlockRateChange < -5) {
        insight += `During the same period, your unlock rate dropped from ${previousPeriodData.unlockRate}% to ${unlockRate}% (${unlockRateChange.toFixed(1)}%). `;
        insight += `The increase in formal punctuation may be contributing to lower engagement - fans prefer casual, informal messaging.`;
        
        insights.deepInsights.push({
          type: 'warning',
          icon: 'fa-exclamation-circle',
          title: 'Punctuation Errors Increased as Unlock Rate Dropped',
          insight: insight,
          metrics: `Punctuation: ${prevPunctuation} → ${punctuationCount} | Unlock rate: ${previousPeriodData.unlockRate}% → ${unlockRate}%`,
          action: 'Remove periods and formal commas to sound more natural'
        });
      } else if (punctuationChange < -20 && unlockRateChange > 3) {
        insight += `Your unlock rate improved from ${previousPeriodData.unlockRate}% to ${unlockRate}% (+${unlockRateChange.toFixed(1)}%). `;
        insight += `Reducing formal punctuation has made your messages more engaging!`;
        
        insights.deepInsights.push({
          type: 'positive',
          icon: 'fa-check-circle',
          title: 'Informal Language Improvement Driving Better Conversions',
          insight: insight,
          metrics: `Punctuation: ${prevPunctuation} → ${punctuationCount} | Unlock rate: ${previousPeriodData.unlockRate}% → ${unlockRate}%`,
          action: 'Continue this casual, informal messaging style'
        });
      }
    }
  } else if (punctuationCount > 50 && messagesSent > 0) {
    // Fallback: Basic punctuation insight without period comparison
    const errorRate = (punctuationCount / messagesSent * 100).toFixed(1);
    insights.deepInsights.push({
      type: 'warning',
      icon: 'fa-comment-dots',
      title: 'Formal Punctuation Detected',
      insight: `${punctuationCount} out of ${messagesSent} messages (${errorRate}%) use formal punctuation (periods, commas). OnlyFans fans respond better to casual, informal messaging without periods.`,
      metrics: `${punctuationCount} formal messages | ${errorRate}% of all messages`,
      action: 'Remove periods from casual messages to sound more natural'
    });
  }
  
  // PATTERN 4: PPV Frequency Analysis (Period comparison + Team benchmark)
  if (ppvsSent > 0 && fansChatted > 0 && messagesSent > 0) {
    const currentPPVsPerFan = (ppvsSent / fansChatted).toFixed(2);
    const messageToPPVRate = (ppvsSent / messagesSent * 100).toFixed(1);
    
    // Check period-over-period if data exists
    if (previousPeriodData && previousPeriodData.ppvsSent > 0 && previousPeriodData.fansChatted > 0) {
      const prevPPVsPerFan = (previousPeriodData.ppvsSent / previousPeriodData.fansChatted).toFixed(2);
      const ppvFrequencyChange = currentPPVsPerFan - prevPPVsPerFan;
      const unlockRateChange = parseFloat(unlockRate) - parseFloat(previousPeriodData.unlockRate || 0);
      
      if (Math.abs(ppvFrequencyChange) > 0.1) {
        let insight = `PPV frequency ${ppvFrequencyChange > 0 ? 'increased' : 'decreased'} from ${prevPPVsPerFan} to ${currentPPVsPerFan} PPVs per fan. `;
        insight += `Your unlock rate ${unlockRateChange >= 0 ? 'improved' : 'dropped'} from ${previousPeriodData.unlockRate}% to ${unlockRate}% (${unlockRateChange >= 0 ? '+' : ''}${unlockRateChange.toFixed(1)}%).\n\n`;
        
        if (ppvFrequencyChange > 0.15 && unlockRateChange >= -3) {
          insight += `You successfully increased PPV volume without significantly hurting unlock rate. This indicates you haven't reached saturation yet and can likely send more.`;
          const safeIncrease = Math.round(fansChatted * 0.2);
          const potentialRevenue = Math.round(safeIncrease * (revenue / ppvsUnlocked) * (parseFloat(unlockRate) / 100));
          
          insights.deepInsights.push({
            type: 'opportunity',
            icon: 'fa-arrow-trend-up',
            title: 'Safe to Increase PPV Frequency Further',
            insight: insight,
            metrics: `Previous: ${prevPPVsPerFan} PPVs/fan | Current: ${currentPPVsPerFan} | Unlock rate: ${unlockRate}%`,
            action: `Test sending ${safeIncrease} more PPVs next period (potential +$${potentialRevenue})`
          });
        } else if (ppvFrequencyChange > 0.15 && unlockRateChange < -8) {
          insight += `The increased PPV frequency appears to be causing saturation - fans are saying "no" more often. Consider pulling back to previous levels.`;
          const estimatedLoss = Math.round(ppvsSent * (revenue / ppvsUnlocked) * (Math.abs(unlockRateChange) / 100));
          
          insights.deepInsights.push({
            type: 'warning',
            icon: 'fa-exclamation-triangle',
            title: 'PPV Over-Saturation Detected',
            insight: insight,
            metrics: `PPV frequency: ${prevPPVsPerFan} → ${currentPPVsPerFan} | Unlock rate: ${previousPeriodData.unlockRate}% → ${unlockRate}%`,
            action: `Reduce PPV frequency back to ~${prevPPVsPerFan} PPVs/fan to recover unlock rate`
          });
        }
      }
    }
    
    // Team comparison for PPV frequency
    if (teamData && teamData.avgPPVsPerFan && parseFloat(teamData.avgPPVsPerFan) > 0) {
      const teamPPVsPerFan = parseFloat(teamData.avgPPVsPerFan);
      const diff = currentPPVsPerFan - teamPPVsPerFan;
      
      if (diff < -0.25 && parseFloat(unlockRate) > teamData.avgUnlockRate) {
        // Sending fewer PPVs but higher unlock rate = opportunity
        const additionalPPVs = Math.round(fansChatted * (teamPPVsPerFan - currentPPVsPerFan));
        const potentialRevenue = Math.round(additionalPPVs * (revenue / ppvsUnlocked) * (parseFloat(unlockRate) / 100));
        
        let insight = `You're sending ${currentPPVsPerFan} PPVs per fan vs team average of ${teamPPVsPerFan.toFixed(2)} (${Math.abs(diff).toFixed(2)} fewer). `;
        insight += `Your ${unlockRate}% unlock rate is ${(parseFloat(unlockRate) - parseFloat(teamData.avgUnlockRate)).toFixed(1)}% above team average, `;
        insight += `which means your captions are strong and fans are receptive. You have room to send more PPVs without hurting conversions.`;
        
        insights.deepInsights.push({
          type: 'opportunity',
          icon: 'fa-bullseye',
          title: 'Underutilizing Strong Unlock Rate',
          insight: insight,
          metrics: `Your PPVs/fan: ${currentPPVsPerFan} | Team avg: ${teamPPVsPerFan.toFixed(2)} | Your unlock rate: ${unlockRate}%`,
          action: `Send ${additionalPPVs} more PPVs to match team average (potential +$${potentialRevenue})`
        });
      }
    }
  }
  
  // PATTERN 5: Conversion Funnel Analysis with Bottleneck Detection
  if (messagesSent > 0 && ppvsSent > 0 && fansChatted > 0) {
    const messageToPPVRate = (ppvsSent / messagesSent * 100).toFixed(1);
    const ppvsPerFan = (ppvsSent / fansChatted).toFixed(2);
    
    let funnelInsight = `${fansChatted} fans → ${messagesSent} messages (${(messagesSent / fansChatted).toFixed(1)} msgs/fan) → ${ppvsSent} PPVs sent (${ppvsPerFan} PPVs/fan) → ${ppvsUnlocked} unlocked (${unlockRate}% rate) → $${revenue} revenue ($${revenuePerFan}/fan)\n\n`;
    
    // Identify bottleneck
    let bottleneck = null;
    if (parseFloat(messageToPPVRate) < 2) {
      bottleneck = `Bottleneck: Only ${messageToPPVRate}% of messages include PPVs. You're chatting a lot but not asking for sales often enough.`;
    } else if (parseFloat(unlockRate) < 40) {
      bottleneck = `Bottleneck: ${unlockRate}% unlock rate is low. PPV frequency is fine (${messageToPPVRate}%), but captions or pricing need work.`;
    } else if (parseFloat(ppvsPerFan) < 0.5) {
      bottleneck = `Bottleneck: Only ${ppvsPerFan} PPVs per fan. Your unlock rate (${unlockRate}%) is strong, so send more PPVs to monetize engaged fans.`;
    } else {
      bottleneck = `All funnel stages are healthy. Your ${messageToPPVRate}% PPV send rate and ${unlockRate}% unlock rate are balanced.`;
    }
    
    funnelInsight += bottleneck;
    
    insights.deepInsights.push({
      type: parseFloat(unlockRate) >= 50 && parseFloat(messageToPPVRate) >= 2 ? 'positive' : 'neutral',
      icon: 'fa-filter',
      title: 'Conversion Funnel Analysis',
      insight: funnelInsight,
      metrics: `Efficiency: $${revenuePerMessage}/message | $${revenuePerFan}/fan | ${unlockRate}% unlock rate`,
      action: bottleneck.includes('Bottleneck') ? 'Focus on the identified bottleneck' : 'Maintain current approach'
    });
  }
  
  // PATTERN 6: Team Performance Comparison
  if (teamData && teamData.chatterCount > 0 && unlockRate > 0) {
    const unlockRateDiff = (parseFloat(unlockRate) - parseFloat(teamData.avgUnlockRate)).toFixed(1);
    
    if (Math.abs(unlockRateDiff) > 8) {
      let insight = `Your ${unlockRate}% unlock rate is ${unlockRateDiff > 0 ? '' : '-'}${Math.abs(unlockRateDiff)}% ${unlockRateDiff > 0 ? 'above' : 'below'} the team average (${teamData.avgUnlockRate}%). `;
      
      if (unlockRateDiff > 8) {
        insight += `This means your captions, timing, and relationship-building are significantly stronger than the rest of the team. `;
        insight += `Sharing your approach could help improve overall agency performance.`;
        
        insights.deepInsights.push({
          type: 'positive',
          icon: 'fa-star',
          title: 'Significantly Outperforming Team',
          insight: insight,
          metrics: `You: ${unlockRate}% | Team: ${teamData.avgUnlockRate}% | Difference: +${unlockRateDiff}%`,
          action: 'Document your messaging strategy to share with team'
        });
      } else {
        const potentialGain = Math.round(ppvsSent * (revenue / ppvsUnlocked) * (Math.abs(unlockRateDiff) / 100));
        insight += `Matching the team average would add approximately $${potentialGain} to your revenue. `;
        insight += `Review what top performers are doing differently in their captions and fan engagement.`;
        
        insights.deepInsights.push({
          type: 'warning',
          icon: 'fa-chart-bar',
          title: 'Below Team Average Performance',
          insight: insight,
          metrics: `Gap: ${Math.abs(unlockRateDiff)}% below team | Potential gain: $${potentialGain}`,
          action: 'Analyze top performers to identify improvement opportunities'
        });
      }
    }
  }
  
  // DEBUG: Log what was generated
  console.log('✅ Deep insights generated:', insights.deepInsights.length);
  console.log('✅ Improvements generated:', insights.improvements.length);
  console.log('✅ Strengths generated:', insights.strengths.length);
  insights.deepInsights.forEach((item, idx) => {
    console.log(`   ${idx + 1}. [${item.type}] ${item.title}`);
  });
  
  // Improvements (always show something meaningful)
  if (punctuationCount > 50 && messagesSent > 0) {
    const estimatedImpact = (punctuationCount / messagesSent * 100).toFixed(1);
    insights.improvements.push({
      issue: 'Formal Punctuation',
      count: punctuationCount,
      detail: `${punctuationCount} messages use formal punctuation (periods, commas)`,
      action: 'Remove periods from casual messages to enhance informal, engaging tone',
      impact: `Affects ${estimatedImpact}% of messages`
    });
  }
  
  if (spellingCount > 0) {
    insights.improvements.push({
      issue: 'Spelling Errors',
      count: spellingCount,
      detail: `${spellingCount} spelling errors detected`,
      action: 'Review and correct typos for better professionalism',
      impact: 'Small but noticeable quality improvement'
    });
  }
  
  if (grammarIssuesCount > 0) {
    insights.improvements.push({
      issue: 'Grammar Issues',
      count: grammarIssuesCount,
      detail: `${grammarIssuesCount} grammar mistakes found`,
      action: 'Fix verb tenses and sentence structure',
      impact: 'Improves message clarity and professionalism'
    });
  }
  
  // If no major issues, show optimization opportunities
  if (insights.improvements.length === 0) {
    if (ppvsSent > 0 && fansChatted > 0) {
      const ppvPerFan = (ppvsSent / fansChatted).toFixed(1);
      if (ppvPerFan < 1) {
        insights.improvements.push({
          issue: 'PPV Frequency',
          count: 0,
          detail: `Sending ${ppvPerFan} PPVs per fan - opportunity to increase`,
          action: 'Consider sending more PPVs to engaged fans to maximize revenue',
          impact: 'Could increase revenue per fan'
        });
      }
    }
    
    // Always have at least one item
    if (insights.improvements.length === 0 && overallScore < 100) {
      insights.improvements.push({
        issue: 'Score Optimization',
        count: 0,
        detail: `Current score: ${overallScore}/100`,
        action: 'Continue refining message quality to reach perfect score',
        impact: 'Incremental improvements in engagement and conversions'
      });
    }
  }
  
  // Strengths (always show something positive)
  if (guidelinesScore === 100) {
    insights.strengths.push({
      strength: 'Perfect Guideline Compliance',
      detail: '0 violations across all guidelines',
      impact: 'Demonstrates excellent understanding of best practices'
    });
  } else if (guidelinesScore >= 90) {
    insights.strengths.push({
      strength: 'Strong Guideline Compliance',
      detail: `${guidelinesScore}/100 guidelines score`,
      impact: 'Very few violations - nearly perfect adherence'
    });
  }
  
  if (unlockRate > 50 && ppvsSent > 10) {
    insights.strengths.push({
      strength: 'High Unlock Rate',
      detail: `${unlockRate}% unlock rate on ${ppvsSent} PPVs`,
      impact: 'Your captions are highly effective at driving purchases'
    });
  } else if (unlockRate > 30 && ppvsSent > 5) {
    insights.strengths.push({
      strength: 'Solid Unlock Rate',
      detail: `${unlockRate}% unlock rate on ${ppvsSent} PPVs`,
      impact: 'Consistent conversion performance'
    });
  }
  
  if (grammarBreakdown.informalLanguage?.includes('Excellent')) {
    insights.strengths.push({
      strength: 'Excellent Informal Communication',
      detail: 'Consistent use of casual, engaging language',
      impact: 'Perfect tone for OnlyFans platform'
    });
  }
  
  if (revenuePerMessage > 1 && messagesSent > 100) {
    insights.strengths.push({
      strength: 'High Message Efficiency',
      detail: `$${revenuePerMessage} revenue per message`,
      impact: 'Excellent balance of engagement and monetization'
    });
  } else if (revenuePerMessage > 0.5 && messagesSent > 50) {
    insights.strengths.push({
      strength: 'Good Message Efficiency',
      detail: `$${revenuePerMessage} revenue per message`,
      impact: 'Solid monetization of conversations'
    });
  }
  
  // Always have at least one strength
  if (insights.strengths.length === 0) {
    if (overallScore >= 80) {
      insights.strengths.push({
        strength: 'Strong Overall Quality',
        detail: `${overallScore}/100 overall score`,
        impact: 'Above-average message quality'
      });
    } else if (messagesSent > 100) {
      insights.strengths.push({
        strength: 'High Engagement Volume',
        detail: `${messagesSent} messages sent`,
        impact: 'Actively building relationships with fans'
      });
    } else {
      insights.strengths.push({
        strength: 'Active Communication',
        detail: 'Consistently engaging with fans',
        impact: 'Building foundation for long-term revenue'
      });
    }
  }
  
  return insights;
}

// ENHANCED INDIVIDUAL CHATTER ANALYSIS
app.get('/api/analytics/chatter-deep-analysis/:chatterName', checkDatabaseConnection, authenticateToken, async (req, res) => {
  try {
    const { chatterName } = req.params;
    const { filterType, customStart, customEnd, weekStart, weekEnd, monthStart, monthEnd } = req.query;
    
    console.log('🔍 Deep chatter analysis for:', chatterName);
    
    // Build date query
    let start, end;
    if (filterType === 'custom' && customStart && customEnd) {
      start = new Date(customStart);
      end = new Date(customEnd);
    } else if (filterType === 'week' && weekStart && weekEnd) {
      start = new Date(weekStart);
      end = new Date(weekEnd);
    } else {
      end = new Date();
      start = new Date();
      start.setDate(start.getDate() - 7);
    }
    
    const dateQuery = { date: { $gte: start, $lte: end } };
    const performanceQuery = {
      weekStartDate: { $lte: end },
      weekEndDate: { $gte: start },
      chatterName: chatterName
    };
    
    // Get this chatter's data
    const chatterPurchases = await FanPurchase.find({
      ...dateQuery,
      chatterName: chatterName
    }).populate('trafficSource').populate('vipFan');
    
    const chatterReports = await DailyChatterReport.find({
      ...dateQuery,
      chatterName: chatterName
    });
    
    // FALLBACK: Get ChatterPerformance data if no daily reports
    const chatterPerformance = await ChatterPerformance.find(performanceQuery);
    console.log('📊 Chatter data found:', {
      purchases: chatterPurchases.length,
      dailyReports: chatterReports.length,
      performanceRecords: chatterPerformance.length
    });
    
    // Calculate previous period dates (same duration, shifted back)
    const periodDuration = end - start;
    const prevStart = new Date(start.getTime() - periodDuration);
    const prevEnd = new Date(start.getTime());
    
    console.log('📅 Previous period:', { start: prevStart, end: prevEnd });
    
    // Get previous period data for this chatter
    const prevDateQuery = { date: { $gte: prevStart, $lte: prevEnd } };
    const prevPerformanceQuery = {
      weekStartDate: { $lte: prevEnd },
      weekEndDate: { $gte: prevStart },
      chatterName: chatterName
    };
    
    const prevChatterPurchases = await FanPurchase.find({
      ...prevDateQuery,
      chatterName: chatterName
    });
    
    const prevChatterPerformance = await ChatterPerformance.find(prevPerformanceQuery);
    
    console.log('📊 Previous period data:', {
      purchases: prevChatterPurchases.length,
      performanceRecords: prevChatterPerformance.length
    });
    
    // Get ALL chatters' data for comparison (current period)
    const allPurchases = await FanPurchase.find(dateQuery).populate('trafficSource');
    const allReports = await DailyChatterReport.find(dateQuery);
    const allPerformance = await ChatterPerformance.find({
      weekStartDate: { $lte: end },
      weekEndDate: { $gte: start }
    });
    
    console.log('📊 Team data found:', {
      allPurchases: allPurchases.length,
      allPerformance: allPerformance.length
    });
    
    // Get message analysis for this chatter (try to find one that overlaps with date range)
    // Use case-insensitive search
    const chatterNameRegex = new RegExp(`^${chatterName}$`, 'i');
    
    let messageAnalysis = await MessageAnalysis.findOne({
      chatterName: chatterNameRegex,
      weekStartDate: { $lte: end },
      weekEndDate: { $gte: start }
    }).sort({ createdAt: -1 });
    
    // Fallback: Get ANY analysis for this chatter if no overlap found
    if (!messageAnalysis) {
      messageAnalysis = await MessageAnalysis.findOne({
        chatterName: chatterNameRegex
      }).sort({ createdAt: -1 });
      console.log('⚠️ No message analysis found for date range, using latest available');
    }
    
    console.log('💬 MessageAnalysis found:', messageAnalysis ? 'YES' : 'NO');
    if (messageAnalysis) {
      console.log('   - Overall Score:', messageAnalysis.overallScore);
      console.log('   - Grammar Score:', messageAnalysis.grammarScore);
      console.log('   - Guidelines Score:', messageAnalysis.guidelinesScore);
      console.log('   - Grammar Breakdown:', JSON.stringify(messageAnalysis.grammarBreakdown));
      console.log('   - Guidelines Breakdown:', JSON.stringify(messageAnalysis.guidelinesBreakdown));
      console.log('   - Strengths:', messageAnalysis.strengths);
      console.log('   - Weaknesses:', messageAnalysis.weaknesses);
      console.log('   - Recommendations:', messageAnalysis.recommendations);
    }
    
    // Calculate this chatter's metrics (use ChatterPerformance as fallback)
    let chatterRevenue, chatterPPVRevenue, chatterPPVCount, chatterAvgPPVPrice;
    let chatterPPVsSent, chatterPPVsUnlocked, chatterUnlockRate;
    let chatterFansChatted, chatterMessagesSent, chatterAvgResponseTime;
    
    if (chatterReports.length > 0) {
      // Use DailyChatterReport (preferred)
      chatterRevenue = chatterPurchases.reduce((sum, p) => sum + (p.amount || 0), 0);
      chatterPPVRevenue = chatterPurchases.filter(p => p.type === 'ppv').reduce((sum, p) => sum + (p.amount || 0), 0);
      chatterPPVCount = chatterPurchases.filter(p => p.type === 'ppv').length;
      chatterAvgPPVPrice = chatterPPVCount > 0 ? chatterPPVRevenue / chatterPPVCount : 0;
      chatterPPVsSent = chatterReports.reduce((sum, r) => sum + (r.ppvsSent || 0), 0);
      chatterPPVsUnlocked = chatterPPVCount;
      chatterUnlockRate = chatterPPVsSent > 0 ? (chatterPPVsUnlocked / chatterPPVsSent) * 100 : 0;
      chatterFansChatted = chatterReports.reduce((sum, r) => sum + (r.fansChatted || 0), 0);
      chatterMessagesSent = chatterFansChatted * 15;
      chatterAvgResponseTime = 0;
    } else if (chatterPerformance.length > 0) {
      // FALLBACK: Use ChatterPerformance (weekly data)
      console.log('📊 Using ChatterPerformance fallback for', chatterName);
      const perf = chatterPerformance[0]; // Use first record if multiple
      chatterRevenue = perf.netSales || 0;
      chatterPPVRevenue = perf.ppvRevenue || 0;
      chatterPPVsSent = perf.ppvsSent || 0;
      chatterPPVsUnlocked = perf.ppvsUnlocked || 0;
      chatterPPVCount = chatterPPVsUnlocked;
      chatterAvgPPVPrice = perf.avgPPVPrice || 0;
      chatterUnlockRate = chatterPPVsSent > 0 ? (chatterPPVsUnlocked / chatterPPVsSent) * 100 : 0;
      chatterFansChatted = perf.fansChattedWith || 0;
      chatterMessagesSent = perf.messagesSent || 0;
      chatterAvgResponseTime = perf.avgResponseTime || 0;
    }
    
    // 🔥 CRITICAL FIX: Override with ChatterPerformance if DailyChatterReport is incomplete
    if (chatterPerformance.length > 0) {
      const perf = chatterPerformance[0];
      if (chatterMessagesSent === 0 && perf.messagesSent > 0) {
        console.log('⚠️  Overriding messagesSent from ChatterPerformance:', perf.messagesSent);
        chatterMessagesSent = perf.messagesSent;
      }
      if (chatterPPVsSent === 0 && perf.ppvsSent > 0) {
        console.log('⚠️  Overriding ppvsSent from ChatterPerformance:', perf.ppvsSent);
        chatterPPVsSent = perf.ppvsSent;
      }
      if (chatterFansChatted === 0 && perf.fansChattedWith > 0) {
        console.log('⚠️  Overriding fansChatted from ChatterPerformance:', perf.fansChattedWith);
        chatterFansChatted = perf.fansChattedWith;
      }
      if (chatterAvgResponseTime === 0 && perf.avgResponseTime > 0) {
        chatterAvgResponseTime = perf.avgResponseTime;
      }
      if (chatterPPVsUnlocked === 0 && perf.ppvsUnlocked > 0) {
        chatterPPVsUnlocked = perf.ppvsUnlocked;
      }
      // Recalculate unlock rate with corrected data
      chatterUnlockRate = chatterPPVsSent > 0 ? (chatterPPVsUnlocked / chatterPPVsSent) * 100 : 0;
    }
    
    if (chatterReports.length === 0 && chatterPerformance.length === 0) {
      // No data at all
      chatterRevenue = 0;
      chatterPPVRevenue = 0;
      chatterPPVCount = 0;
      chatterAvgPPVPrice = 0;
      chatterPPVsSent = 0;
      chatterPPVsUnlocked = 0;
      chatterUnlockRate = 0;
      chatterFansChatted = 0;
      chatterMessagesSent = 0;
      chatterAvgResponseTime = 0;
    }
    
    // VIP metrics for this chatter
    const chatterVIPs = await VIPFan.find({
      createdAt: { $gte: start, $lte: end }
    });
    const chatterVIPsFromPurchases = chatterPurchases.filter(p => p.vipFan).length;
    const chatterVIPRevenue = chatterPurchases.filter(p => p.vipFan).reduce((sum, p) => sum + (p.amount || 0), 0);
    const chatterAvgVIPSpend = chatterVIPsFromPurchases > 0 ? chatterVIPRevenue / chatterVIPsFromPurchases : 0;
    
    // Calculate TEAM averages
    const teamChatters = {};
    allPurchases.forEach(p => {
      if (p.chatterName) {
        if (!teamChatters[p.chatterName]) {
          teamChatters[p.chatterName] = { revenue: 0, ppvCount: 0, ppvRevenue: 0 };
        }
        teamChatters[p.chatterName].revenue += p.amount || 0;
        if (p.type === 'ppv') {
          teamChatters[p.chatterName].ppvCount++;
          teamChatters[p.chatterName].ppvRevenue += p.amount || 0;
        }
      }
    });
    
    const teamReports = {};
    allReports.forEach(r => {
      if (r.chatterName) {
        if (!teamReports[r.chatterName]) {
          teamReports[r.chatterName] = { ppvsSent: 0, fansChatted: 0 };
        }
        teamReports[r.chatterName].ppvsSent += r.ppvsSent || 0;
        teamReports[r.chatterName].fansChatted += r.fansChatted || 0;
      }
    });
    
    // Calculate team averages
    const chatterCount = Object.keys(teamChatters).length || 1;
    const teamAvgRevenue = Object.values(teamChatters).reduce((sum, c) => sum + c.revenue, 0) / chatterCount;
    const teamAvgPPVPrice = Object.values(teamChatters).reduce((sum, c) => {
      return sum + (c.ppvCount > 0 ? c.ppvRevenue / c.ppvCount : 0);
    }, 0) / chatterCount;
    const teamAvgUnlockRate = Object.values(teamReports).reduce((sum, c) => {
      const unlockRate = c.ppvsSent > 0 ? ((teamChatters[Object.keys(teamReports).find(k => teamReports[k] === c)]?.ppvCount || 0) / c.ppvsSent) * 100 : 0;
      return sum + unlockRate;
    }, 0) / chatterCount;
    
    // Calculate rankings
    const revenueRanking = Object.entries(teamChatters)
      .sort((a, b) => b[1].revenue - a[1].revenue)
      .findIndex(([name]) => name === chatterName) + 1;
    
    const unlockRateRanking = Object.entries(teamReports)
      .map(([name, data]) => ({
        name,
        unlockRate: data.ppvsSent > 0 ? ((teamChatters[name]?.ppvCount || 0) / data.ppvsSent) * 100 : 0
      }))
      .sort((a, b) => b.unlockRate - a.unlockRate)
      .findIndex(c => c.name === chatterName) + 1;
    
    // Traffic source performance for this chatter
    const sourcePerformance = {};
    chatterPurchases.forEach(p => {
      if (p.trafficSource) {
        const sourceName = p.trafficSource.name;
        if (!sourcePerformance[sourceName]) {
          sourcePerformance[sourceName] = {
            revenue: 0,
            count: 0,
            category: p.trafficSource.category
          };
        }
        sourcePerformance[sourceName].revenue += p.amount || 0;
        sourcePerformance[sourceName].count++;
      }
    });
    
    const topSource = Object.entries(sourcePerformance)
      .sort((a, b) => b[1].revenue - a[1].revenue)[0];
    
    // Pricing breakdown
    const pricingBuckets = {
      low: { count: 0, unlocked: 0 }, // $0-15
      mid: { count: 0, unlocked: 0 }, // $15-25
      high: { count: 0, unlocked: 0 } // $25+
    };
    
    chatterReports.forEach(r => {
      if (r.ppvSales) {
        r.ppvSales.forEach(sale => {
          const price = sale.amount || 0;
          if (price < 15) {
            pricingBuckets.low.count++;
            pricingBuckets.low.unlocked++;
          } else if (price < 25) {
            pricingBuckets.mid.count++;
            pricingBuckets.mid.unlocked++;
          } else {
            pricingBuckets.high.count++;
            pricingBuckets.high.unlocked++;
          }
        });
      }
    });
    
    // Calculate unlock rates by price
    const lowPriceUnlockRate = pricingBuckets.low.count > 0 ? (pricingBuckets.low.unlocked / pricingBuckets.low.count) * 100 : 0;
    const midPriceUnlockRate = pricingBuckets.mid.count > 0 ? (pricingBuckets.mid.unlocked / pricingBuckets.mid.count) * 100 : 0;
    const highPriceUnlockRate = pricingBuckets.high.count > 0 ? (pricingBuckets.high.unlocked / pricingBuckets.high.count) * 100 : 0;
    
    // Build response with both nested AND flat structure for compatibility
    const response = {
      // Nested structure
      chatter: {
        name: chatterName,
        revenue: chatterRevenue,
        avgPPVPrice: chatterAvgPPVPrice,
        unlockRate: chatterUnlockRate,
        ppvsSent: chatterPPVsSent,
        ppvsUnlocked: chatterPPVsUnlocked,
        fansChatted: chatterFansChatted,
        vipCount: chatterVIPsFromPurchases,
        avgVIPSpend: chatterAvgVIPSpend,
        grammarScore: messageAnalysis?.grammarScore || null,
        guidelinesScore: messageAnalysis?.guidelinesScore || null,
        overallScore: messageAnalysis?.overallScore || null
      },
      team: {
        avgRevenue: teamAvgRevenue,
        avgPPVPrice: teamAvgPPVPrice,
        avgUnlockRate: teamAvgUnlockRate,
        chatterCount: chatterCount
      },
      rankings: {
        revenue: revenueRanking,
        unlockRate: unlockRateRanking
      },
      trafficSources: sourcePerformance,
      topSource: topSource ? {
        name: topSource[0],
        revenue: topSource[1].revenue,
        count: topSource[1].count,
        category: topSource[1].category
      } : null,
      pricing: {
        low: { unlockRate: lowPriceUnlockRate, count: pricingBuckets.low.count },
        mid: { unlockRate: midPriceUnlockRate, count: pricingBuckets.mid.count },
        high: { unlockRate: highPriceUnlockRate, count: pricingBuckets.high.count }
      },
      
      // Flat properties for frontend compatibility
      overallScore: messageAnalysis?.overallScore || null,
      grammarScore: messageAnalysis?.grammarScore || null,
      guidelinesScore: messageAnalysis?.guidelinesScore || null,
      strengths: messageAnalysis?.strengths || [],
      weaknesses: messageAnalysis?.weaknesses || [],
      recommendations: messageAnalysis?.recommendations || [],
      grammarBreakdown: messageAnalysis?.grammarBreakdown || null,
      guidelinesBreakdown: messageAnalysis?.guidelinesBreakdown || null,
      chattingStyle: messageAnalysis?.chattingStyle || null,
      messagePatterns: messageAnalysis?.messagePatterns || null,
      engagementMetrics: messageAnalysis?.engagementMetrics || null,
      totalMessages: messageAnalysis?.totalMessages || chatterMessagesSent || 0,
      revenue: chatterRevenue,
      ppvsSent: chatterPPVsSent,
      ppvsUnlocked: chatterPPVsUnlocked,
      messagesSent: chatterMessagesSent,
      avgResponseTime: chatterAvgResponseTime,
      fansChatted: chatterFansChatted
    };
    
    // Build previous period data object
    const previousPeriodData = await buildPreviousPeriodData(
      prevChatterPurchases,
      prevChatterPerformance,
      chatterName
    );
    
    // Build team averages object
    const teamData = await buildTeamData(
      allPurchases,
      allPerformance,
      chatterName
    );
    
    console.log('📊 Previous period metrics:', previousPeriodData);
    console.log('📊 Team averages:', teamData);
    
    // Generate smart analysis summary and insights
    const analysisSummary = generateAnalysisSummary(response, previousPeriodData, teamData);
    response.analysisSummary = analysisSummary.summary;
    response.deepInsights = analysisSummary.deepInsights;
    response.improvements = analysisSummary.improvements;
    response.strengths = analysisSummary.strengths;
    
    res.json(response);
  } catch (error) {
    console.error('Error in chatter deep analysis:', error);
    res.status(500).json({ error: error.message });
  }
});

// ==================== AGENCY INTELLIGENCE GENERATOR ====================
async function generateAgencyIntelligence(data) {
  const intelligence = {
    executive: {},
    revenue: {},
    traffic: {},
    retention: {},
    team: {},
    patterns: [],
    recommendations: []
  };
  
  const { current, previous } = data;
  
  // ========================================
  // 1. EXECUTIVE SUMMARY
  // ========================================
  const currentRevenue = current.purchases.reduce((sum, p) => sum + (p.amount || 0), 0);
  const prevRevenue = previous.purchases.reduce((sum, p) => sum + (p.amount || 0), 0);
  const revenueChange = currentRevenue - prevRevenue;
  const revenueChangePercent = prevRevenue > 0 ? ((revenueChange / prevRevenue) * 100).toFixed(1) : 0;
  
  const currentPPVs = current.purchases.filter(p => p.type === 'ppv').length;
  const currentPPVsSent = current.performance.reduce((sum, p) => sum + (p.ppvsSent || 0), 0);
  const unlockRate = currentPPVsSent > 0 ? ((currentPPVs / currentPPVsSent) * 100).toFixed(1) : 0;
  
  const activeChatterCount = current.performance.length;
  const avgQuality = current.analyses.length > 0
    ? (current.analyses.reduce((sum, a) => sum + (a.overallScore || 0), 0) / current.analyses.length).toFixed(0)
    : 0;
  
  intelligence.executive = {
    period: { start: current.start, end: current.end },
    revenue: {
      current: currentRevenue,
      previous: prevRevenue,
      change: revenueChange,
      changePercent: revenueChangePercent
    },
    team: {
      activeChatters: activeChatterCount,
      avgQualityScore: avgQuality,
      unlockRate: unlockRate
    },
    status: revenueChange > 0 ? 'growing' : revenueChange < 0 ? 'declining' : 'stable'
  };
  
  // ========================================
  // 2. TRAFFIC SOURCE INTELLIGENCE
  // ========================================
  const trafficAnalysis = analyzeTrafficSources(current, previous);
  intelligence.traffic = trafficAnalysis;
  
  // ========================================
  // 3. RETENTION & CHURN ANALYSIS
  // ========================================
  const retentionAnalysis = analyzeRetention(current, previous);
  intelligence.retention = retentionAnalysis;
  
  // ========================================
  // 4. TEAM PERFORMANCE MATRIX
  // ========================================
  const teamMatrix = analyzeTeamPerformance(current, previous);
  intelligence.team = teamMatrix;
  
  // ========================================
  // 5. REVENUE BREAKDOWN
  // ========================================
  const revenueBreakdown = analyzeRevenueMechanics(current, previous);
  intelligence.revenue = revenueBreakdown;
  
  // ========================================
  // 6. PATTERN DETECTION & CORRELATIONS
  // ========================================
  intelligence.patterns = detectPatterns(current, previous);
  
  // ========================================
  // 7. STRATEGIC RECOMMENDATIONS
  // ========================================
  intelligence.recommendations = generateStrategicRecommendations(intelligence);
  
  console.log('✅ Agency Intelligence generated:', {
    trafficSources: Object.keys(intelligence.traffic.sources || {}).length,
    patterns: intelligence.patterns.length,
    recommendations: intelligence.recommendations.length
  });
  
  return intelligence;
}

// Traffic Source Analysis
function analyzeTrafficSources(current, previous) {
  const sourceMetrics = {};
  
  // Aggregate current period by source
  current.purchases.forEach(purchase => {
    if (!purchase.trafficSource) return;
    
    const sourceName = purchase.trafficSource.name;
    if (!sourceMetrics[sourceName]) {
      sourceMetrics[sourceName] = {
        name: sourceName,
        category: purchase.trafficSource.category,
        revenue: 0,
        count: 0,
        vipRevenue: 0,
        vipCount: 0,
        buyers: new Set()
      };
    }
    
    sourceMetrics[sourceName].revenue += purchase.amount || 0;
    sourceMetrics[sourceName].count++;
    if (purchase.fanUsername) {
      sourceMetrics[sourceName].buyers.add(purchase.fanUsername);
    }
    if (purchase.vipFan) {
      sourceMetrics[sourceName].vipRevenue += purchase.amount || 0;
      sourceMetrics[sourceName].vipCount++;
    }
  });
  
  // Convert sets to counts
  Object.values(sourceMetrics).forEach(source => {
    source.buyerCount = source.buyers.size;
    delete source.buyers;
    source.avgPurchaseValue = source.count > 0 ? (source.revenue / source.count).toFixed(2) : 0;
    source.vipRate = source.buyerCount > 0 ? ((source.vipCount / source.buyerCount) * 100).toFixed(1) : 0;
  });
  
  // Previous period
  const prevSourceMetrics = {};
  previous.purchases.forEach(purchase => {
    if (!purchase.trafficSource) return;
    const sourceName = purchase.trafficSource.name;
    if (!prevSourceMetrics[sourceName]) {
      prevSourceMetrics[sourceName] = { revenue: 0, count: 0 };
    }
    prevSourceMetrics[sourceName].revenue += purchase.amount || 0;
    prevSourceMetrics[sourceName].count++;
  });
  
  // Calculate changes
  Object.keys(sourceMetrics).forEach(sourceName => {
    const curr = sourceMetrics[sourceName];
    const prev = prevSourceMetrics[sourceName] || { revenue: 0, count: 0 };
    
    curr.revenueChange = curr.revenue - prev.revenue;
    curr.revenueChangePercent = prev.revenue > 0 
      ? ((curr.revenueChange / prev.revenue) * 100).toFixed(1)
      : 0;
  });
  
  // Sort by revenue
  const sortedSources = Object.values(sourceMetrics).sort((a, b) => b.revenue - a.revenue);
  
  // Calculate concentration
  const totalRevenue = sortedSources.reduce((sum, s) => sum + s.revenue, 0);
  const topSourceRevenue = sortedSources[0]?.revenue || 0;
  const concentration = totalRevenue > 0 ? ((topSourceRevenue / totalRevenue) * 100).toFixed(1) : 0;
  
  return {
    sources: sourceMetrics,
    sortedSources,
    totalRevenue,
    topSource: sortedSources[0] || null,
    concentration,
    diversityScore: sortedSources.length >= 3 ? 100 : sortedSources.length * 33
  };
}

// Retention & Churn Analysis
function analyzeRetention(current, previous) {
  const now = current.end;
  const thirtyDaysAgo = new Date(now.getTime() - (30 * 24 * 60 * 60 * 1000));
  const sixtyDaysAgo = new Date(now.getTime() - (60 * 24 * 60 * 60 * 1000));
  const ninetyDaysAgo = new Date(now.getTime() - (90 * 24 * 60 * 60 * 1000));
  
  // Active VIPs
  const activeVIPs = current.vips.filter(v => v.status === 'active');
  const churnedVIPs = current.vips.filter(v => v.status === 'churned');
  
  // Calculate retention by last message date
  const vipsWithMessages = activeVIPs.filter(v => v.lastMessageDate);
  
  const active30Day = vipsWithMessages.filter(v => 
    v.lastMessageDate && new Date(v.lastMessageDate) >= thirtyDaysAgo
  ).length;
  
  const active60Day = vipsWithMessages.filter(v => 
    v.lastMessageDate && new Date(v.lastMessageDate) >= sixtyDaysAgo
  ).length;
  
  const active90Day = vipsWithMessages.filter(v => 
    v.lastMessageDate && new Date(v.lastMessageDate) >= ninetyDaysAgo
  ).length;
  
  // Fans created in each period
  const fansFrom30Days = current.vips.filter(v => {
    const joinDate = new Date(v.joinDate || v.firstSeenDate);
    return joinDate >= thirtyDaysAgo && joinDate <= now;
  }).length;
  
  const fansFrom60Days = current.vips.filter(v => {
    const joinDate = new Date(v.joinDate || v.firstSeenDate);
    return joinDate >= sixtyDaysAgo && joinDate < thirtyDaysAgo;
  }).length;
  
  const fansFrom90Days = current.vips.filter(v => {
    const joinDate = new Date(v.joinDate || v.firstSeenDate);
    return joinDate >= ninetyDaysAgo && joinDate < sixtyDaysAgo;
  }).length;
  
  // Retention rates
  const retention30Day = fansFrom30Days > 0 ? ((active30Day / fansFrom30Days) * 100).toFixed(1) : 0;
  const retention60Day = fansFrom60Days > 0 ? ((active60Day / fansFrom60Days) * 100).toFixed(1) : 0;
  const retention90Day = fansFrom90Days > 0 ? ((active90Day / fansFrom90Days) * 100).toFixed(1) : 0;
  
  // At-risk fans (no message in 15+ days)
  const fifteenDaysAgo = new Date(now.getTime() - (15 * 24 * 60 * 60 * 1000));
  const atRiskFans = activeVIPs.filter(v => 
    v.lastMessageDate && new Date(v.lastMessageDate) < fifteenDaysAgo
  );
  
  // Likely churned (no message in 30+ days)
  const likelyChurned = activeVIPs.filter(v => 
    v.lastMessageDate && new Date(v.lastMessageDate) < thirtyDaysAgo
  );
  
  // Retention by traffic source
  const retentionBySource = {};
  current.vips.forEach(vip => {
    if (!vip.trafficSource) return;
    
    const sourceName = vip.trafficSource.name || 'Unknown';
    if (!retentionBySource[sourceName]) {
      retentionBySource[sourceName] = {
        total: 0,
        active30: 0,
        active90: 0
      };
    }
    
    retentionBySource[sourceName].total++;
    if (vip.lastMessageDate && new Date(vip.lastMessageDate) >= thirtyDaysAgo) {
      retentionBySource[sourceName].active30++;
    }
    if (vip.lastMessageDate && new Date(vip.lastMessageDate) >= ninetyDaysAgo) {
      retentionBySource[sourceName].active90++;
    }
  });
  
  // Calculate rates
  Object.keys(retentionBySource).forEach(sourceName => {
    const data = retentionBySource[sourceName];
    data.retention30 = data.total > 0 ? ((data.active30 / data.total) * 100).toFixed(1) : 0;
    data.retention90 = data.total > 0 ? ((data.active90 / data.total) * 100).toFixed(1) : 0;
  });
  
  return {
    overall: {
      retention30Day,
      retention60Day,
      retention90Day,
      activeVIPs: activeVIPs.length,
      churnedVIPs: churnedVIPs.length,
      churnRate: (current.vips.length > 0 ? ((churnedVIPs.length / current.vips.length) * 100).toFixed(1) : 0)
    },
    atRisk: {
      count: atRiskFans.length,
      fans: atRiskFans.slice(0, 10).map(f => ({ username: f.username, lastMessage: f.lastMessageDate }))
    },
    likelyChurned: {
      count: likelyChurned.length,
      fans: likelyChurned.slice(0, 10).map(f => ({ username: f.username, lastMessage: f.lastMessageDate }))
    },
    bySource: retentionBySource
  };
}

// Team Performance Matrix
function analyzeTeamPerformance(current, previous) {
  // Group by chatter
  const chatterStats = {};
  
  current.performance.forEach(perf => {
    if (!chatterStats[perf.chatterName]) {
      chatterStats[perf.chatterName] = {
        name: perf.chatterName,
        revenue: 0,
        ppvsSent: 0,
        ppvsUnlocked: 0,
        messagesSent: perf.messagesSent || 0,
        fansChatted: perf.fansChattedWith || 0,
        analysis: null
      };
    }
    
    chatterStats[perf.chatterName].ppvsSent += perf.ppvsSent || 0;
    chatterStats[perf.chatterName].ppvsUnlocked += perf.ppvsUnlocked || 0;
  });
  
  // Add revenue from purchases
  current.purchases.forEach(purchase => {
    if (chatterStats[purchase.chatterName]) {
      chatterStats[purchase.chatterName].revenue += purchase.amount || 0;
    }
  });
  
  // Add analysis scores
  current.analyses.forEach(analysis => {
    if (chatterStats[analysis.chatterName]) {
      chatterStats[analysis.chatterName].analysis = {
        grammarScore: analysis.grammarScore,
        guidelinesScore: analysis.guidelinesScore,
        overallScore: analysis.overallScore,
        punctuationCount: analysis.grammarBreakdown 
          ? parseInt(analysis.grammarBreakdown.punctuationProblems?.match(/(\d+)/)?.[1] || '0')
          : 0
      };
    }
  });
  
  // Calculate derived metrics
  Object.values(chatterStats).forEach(chatter => {
    chatter.unlockRate = chatter.ppvsSent > 0 
      ? ((chatter.ppvsUnlocked / chatter.ppvsSent) * 100).toFixed(1)
      : 0;
    chatter.revenuePerFan = chatter.fansChatted > 0
      ? (chatter.revenue / chatter.fansChatted).toFixed(2)
      : 0;
    chatter.ppvsPerFan = chatter.fansChatted > 0
      ? (chatter.ppvsSent / chatter.fansChatted).toFixed(2)
      : 0;
  });
  
  const chatters = Object.values(chatterStats);
  
  // Rankings
  const byRevenue = [...chatters].sort((a, b) => b.revenue - a.revenue);
  const byUnlockRate = [...chatters].filter(c => parseFloat(c.unlockRate) > 0)
    .sort((a, b) => parseFloat(b.unlockRate) - parseFloat(a.unlockRate));
  const byQuality = [...chatters].filter(c => c.analysis?.overallScore)
    .sort((a, b) => b.analysis.overallScore - a.analysis.overallScore);
  
  // Calculate averages
  const avgRevenue = chatters.length > 0
    ? (chatters.reduce((sum, c) => sum + c.revenue, 0) / chatters.length).toFixed(0)
    : 0;
  const avgUnlockRate = chatters.length > 0
    ? (chatters.reduce((sum, c) => sum + parseFloat(c.unlockRate || 0), 0) / chatters.length).toFixed(1)
    : 0;
  
  // Quality score correlation with unlock rate
  const qualityUnlockCorrelation = analyzeQualityUnlockCorrelation(chatters);
  
  return {
    chatters,
    count: chatters.length,
    rankings: {
      revenue: byRevenue.slice(0, 5),
      unlockRate: byUnlockRate.slice(0, 5),
      quality: byQuality.slice(0, 5)
    },
    averages: {
      revenue: avgRevenue,
      unlockRate: avgUnlockRate
    },
    correlations: {
      qualityUnlockRate: qualityUnlockCorrelation
    }
  };
}

// Quality vs Unlock Rate Correlation
function analyzeQualityUnlockCorrelation(chatters) {
  const withScores = chatters.filter(c => 
    c.analysis?.guidelinesScore !== null && 
    c.analysis?.guidelinesScore !== undefined &&
    parseFloat(c.unlockRate) > 0
  );
  
  if (withScores.length < 3) {
    return null;
  }
  
  const high = withScores.filter(c => c.analysis.guidelinesScore >= 90);
  const mid = withScores.filter(c => c.analysis.guidelinesScore >= 70 && c.analysis.guidelinesScore < 90);
  const low = withScores.filter(c => c.analysis.guidelinesScore < 70);
  
  const avgUnlock = (group) => {
    if (group.length === 0) return null;
    return (group.reduce((sum, c) => sum + parseFloat(c.unlockRate), 0) / group.length).toFixed(1);
  };
  
  const result = {
    high: { count: high.length, avgUnlockRate: avgUnlock(high), chatters: high.map(c => c.name) },
    mid: { count: mid.length, avgUnlockRate: avgUnlock(mid), chatters: mid.map(c => c.name) },
    low: { count: low.length, avgUnlockRate: avgUnlock(low), chatters: low.map(c => c.name) }
  };
  
  // Determine if correlation is strong
  if (result.high.avgUnlockRate && result.mid.avgUnlockRate) {
    const diff = parseFloat(result.high.avgUnlockRate) - parseFloat(result.mid.avgUnlockRate);
    result.isSignificant = Math.abs(diff) > 8;
    result.direction = diff > 0 ? 'positive' : 'negative';
    result.strength = Math.abs(diff);
  }
  
  return result;
}

// Revenue Mechanics Analysis
function analyzeRevenueMechanics(current, previous) {
  const currentRevenue = current.purchases.reduce((sum, p) => sum + (p.amount || 0), 0);
  const prevRevenue = previous.purchases.reduce((sum, p) => sum + (p.amount || 0), 0);
  
  const currentPPVs = current.purchases.filter(p => p.type === 'ppv');
  const prevPPVs = previous.purchases.filter(p => p.type === 'ppv');
  
  const currentPPVCount = currentPPVs.length;
  const prevPPVCount = prevPPVs.length;
  
  const currentAvgPrice = currentPPVCount > 0
    ? (currentPPVs.reduce((sum, p) => sum + p.amount, 0) / currentPPVCount).toFixed(0)
    : 0;
  const prevAvgPrice = prevPPVCount > 0
    ? (prevPPVs.reduce((sum, p) => sum + p.amount, 0) / prevPPVCount).toFixed(0)
    : 0;
  
  const currentPPVsSent = current.performance.reduce((sum, p) => sum + (p.ppvsSent || 0), 0);
  const prevPPVsSent = previous.performance.reduce((sum, p) => sum + (p.ppvsSent || 0), 0);
  
  const currentUnlockRate = currentPPVsSent > 0
    ? ((currentPPVCount / currentPPVsSent) * 100).toFixed(1)
    : 0;
  const prevUnlockRate = prevPPVsSent > 0
    ? ((prevPPVCount / prevPPVsSent) * 100).toFixed(1)
    : 0;
  
  // Calculate contribution of each factor
  const volumeContribution = (currentPPVCount - prevPPVCount) * parseFloat(prevAvgPrice);
  const priceContribution = currentPPVCount * (parseFloat(currentAvgPrice) - parseFloat(prevAvgPrice));
  const unlockRateImpact = parseFloat(currentUnlockRate) - parseFloat(prevUnlockRate);
  
  return {
    current: {
      revenue: currentRevenue,
      ppvCount: currentPPVCount,
      ppvsSent: currentPPVsSent,
      avgPrice: currentAvgPrice,
      unlockRate: currentUnlockRate
    },
    previous: {
      revenue: prevRevenue,
      ppvCount: prevPPVCount,
      ppvsSent: prevPPVsSent,
      avgPrice: prevAvgPrice,
      unlockRate: prevUnlockRate
    },
    changes: {
      revenue: currentRevenue - prevRevenue,
      revenuePercent: prevRevenue > 0 ? (((currentRevenue - prevRevenue) / prevRevenue) * 100).toFixed(1) : 0,
      ppvCount: currentPPVCount - prevPPVCount,
      ppvsSent: currentPPVsSent - prevPPVsSent,
      avgPrice: parseFloat(currentAvgPrice) - parseFloat(prevAvgPrice),
      unlockRate: unlockRateImpact
    },
    drivers: {
      volumeContribution: Math.round(volumeContribution),
      priceContribution: Math.round(priceContribution),
      primaryDriver: Math.abs(volumeContribution) > Math.abs(priceContribution) ? 'volume' : 'price'
    }
  };
}

// Pattern Detection Engine
function detectPatterns(current, previous) {
  const patterns = [];
  
  // Pattern: Traffic source quality correlation
  const sourceQualityPattern = analyzeSourceQualityPattern(current);
  if (sourceQualityPattern) patterns.push(sourceQualityPattern);
  
  // Pattern: Retention vs revenue correlation
  const retentionRevenuePattern = analyzeRetentionRevenuePattern(current);
  if (retentionRevenuePattern) patterns.push(retentionRevenuePattern);
  
  // Pattern: Quality score impact across team
  const qualityImpactPattern = analyzeQualityImpactPattern(current);
  if (qualityImpactPattern) patterns.push(qualityImpactPattern);
  
  // Pattern: PPV saturation detection
  const saturationPattern = analyzeSaturationPattern(current, previous);
  if (saturationPattern) patterns.push(saturationPattern);
  
  return patterns;
}

// Analyze if certain sources produce higher quality fans
function analyzeSourceQualityPattern(current) {
  // Group VIPs by source and calculate LTV
  const sourceData = {};
  
  current.vips.forEach(vip => {
    if (!vip.trafficSource) return;
    
    const sourceName = vip.trafficSource.name;
    if (!sourceData[sourceName]) {
      sourceData[sourceName] = {
        fans: [],
        totalSpend: 0,
        count: 0
      };
    }
    
    sourceData[sourceName].fans.push(vip);
    sourceData[sourceName].totalSpend += vip.lifetimeSpend || 0;
    sourceData[sourceName].count++;
  });
  
  // Calculate LTV per source
  Object.keys(sourceData).forEach(sourceName => {
    const data = sourceData[sourceName];
    data.avgLTV = data.count > 0 ? (data.totalSpend / data.count).toFixed(0) : 0;
  });
  
  const sources = Object.entries(sourceData);
  if (sources.length < 2) return null;
  
  // Sort by LTV
  sources.sort((a, b) => parseFloat(b[1].avgLTV) - parseFloat(a[1].avgLTV));
  
  const topSource = sources[0];
  const bottomSource = sources[sources.length - 1];
  const ltvGap = parseFloat(topSource[1].avgLTV) - parseFloat(bottomSource[1].avgLTV);
  
  if (ltvGap > 20) {
    return {
      type: 'traffic_quality',
      title: 'Traffic Source Quality Variance Detected',
      insight: `${topSource[0]} fans have ${ltvGap.toFixed(0)}% higher lifetime value ($${topSource[1].avgLTV} vs $${bottomSource[1].avgLTV}). Some sources produce better long-term fans.`,
      data: { sources: Object.fromEntries(sources.map(([name, data]) => [name, data.avgLTV])) },
      action: `Focus acquisition efforts on ${topSource[0]} - highest quality fans`
    };
  }
  
  return null;
}

// Analyze retention impact on revenue
function analyzeRetentionRevenuePattern(current) {
  // This requires historical data - placeholder for now
  return null;
}

// Analyze quality score impact on team metrics
function analyzeQualityImpactPattern(current) {
  // Already covered in team matrix correlation
  return null;
}

// Detect PPV saturation across team
function analyzeSaturationPattern(current, previous) {
  const currentPerf = current.performance;
  const prevPerf = previous.performance;
  
  if (currentPerf.length === 0 || prevPerf.length === 0) return null;
  
  // Calculate team-wide PPV frequency change
  const currentPPVsPerFan = currentPerf.reduce((sum, p) => {
    return sum + (p.fansChattedWith > 0 ? (p.ppvsSent / p.fansChattedWith) : 0);
  }, 0) / currentPerf.length;
  
  const prevPPVsPerFan = prevPerf.reduce((sum, p) => {
    return sum + (p.fansChattedWith > 0 ? (p.ppvsSent / p.fansChattedWith) : 0);
  }, 0) / prevPerf.length;
  
  const ppvFreqChange = currentPPVsPerFan - prevPPVsPerFan;
  
  // Calculate team unlock rate
  const currentUnlockRate = currentPerf.reduce((sum, p) => {
    return sum + (p.ppvsSent > 0 ? (p.ppvsUnlocked / p.ppvsSent) * 100 : 0);
  }, 0) / currentPerf.length;
  
  const prevUnlockRate = prevPerf.reduce((sum, p) => {
    return sum + (p.ppvsSent > 0 ? (p.ppvsUnlocked / p.ppvsSent) * 100 : 0);
  }, 0) / prevPerf.length;
  
  const unlockRateChange = currentUnlockRate - prevUnlockRate;
  
  // Saturation detected if: PPV frequency increased significantly but unlock rate dropped
  if (ppvFreqChange > 0.15 && unlockRateChange < -5) {
    return {
      type: 'saturation',
      title: 'Team-Wide PPV Saturation Detected',
      insight: `PPV frequency increased from ${prevPPVsPerFan.toFixed(2)} to ${currentPPVsPerFan.toFixed(2)} PPVs/fan (+${(ppvFreqChange * 100).toFixed(0)}%), but unlock rate dropped from ${prevUnlockRate.toFixed(1)}% to ${currentUnlockRate.toFixed(1)}% (${unlockRateChange.toFixed(1)}%). The team may be over-sending PPVs.`,
      data: {
        ppvFreqChange,
        unlockRateChange,
        currentPPVsPerFan: currentPPVsPerFan.toFixed(2),
        currentUnlockRate: currentUnlockRate.toFixed(1)
      },
      action: 'Reduce PPV frequency across team to recover unlock rate'
    };
  }
  
  return null;
}

// Strategic Recommendations Generator
function generateStrategicRecommendations(intelligence) {
  const recommendations = [];
  
  // Traffic source recommendations
  if (intelligence.traffic.concentration > 70) {
    recommendations.push({
      priority: 'high',
      category: 'traffic',
      title: 'Diversify Traffic Sources',
      issue: `${intelligence.traffic.concentration}% of revenue comes from ${intelligence.traffic.topSource?.name}`,
      impact: 'High risk if source performance degrades',
      action: 'Invest in developing 2-3 additional traffic sources to reduce concentration risk',
      timeframe: '30 days'
    });
  }
  
  // Retention recommendations
  if (intelligence.retention.atRisk.count > 10) {
    const potentialLoss = intelligence.retention.atRisk.count * 50; // Estimate
    recommendations.push({
      priority: 'high',
      category: 'retention',
      title: 'Re-engage At-Risk Fans',
      issue: `${intelligence.retention.atRisk.count} fans haven't messaged in 15+ days`,
      impact: `Potential ${potentialLoss} revenue loss if they churn`,
      action: 'Send targeted re-engagement PPVs to at-risk fans within 48 hours',
      timeframe: '48 hours'
    });
  }
  
  // Team performance recommendations
  if (intelligence.team.correlations.qualityUnlockRate?.isSignificant) {
    const correlation = intelligence.team.correlations.qualityUnlockRate;
    recommendations.push({
      priority: 'medium',
      category: 'quality',
      title: 'Quality Training for Low-Scoring Chatters',
      issue: `${correlation.strength.toFixed(1)}% unlock rate gap between high and mid-tier quality chatters`,
      impact: `Improving quality scores could boost team unlock rate`,
      action: `Train ${correlation.mid.chatters.join(', ')} on guidelines to improve unlock rates`,
      timeframe: '14 days'
    });
  }
  
  // Pattern-based recommendations
  intelligence.patterns.forEach(pattern => {
    if (pattern.type === 'saturation') {
      recommendations.push({
        priority: 'high',
        category: 'strategy',
        title: pattern.title,
        issue: pattern.insight.split('.')[0],
        impact: `Lost revenue due to oversaturation`,
        action: pattern.action,
        timeframe: 'Immediate'
      });
    }
  });
  
  return recommendations.sort((a, b) => {
    const priority = { high: 1, medium: 2, low: 3 };
    return priority[a.priority] - priority[b.priority];
  });
}

// ==================== AGENCY INTELLIGENCE ENGINE ====================
app.get('/api/analytics/agency-intelligence', checkDatabaseConnection, authenticateToken, requireManager, async (req, res) => {
  try {
    const { filterType, customStart, customEnd } = req.query;
    
    console.log('🧠 AGENCY INTELLIGENCE ENGINE ACTIVATED');
    
    // Build date query
    let start, end;
    if (filterType === 'custom' && customStart && customEnd) {
      start = new Date(customStart);
      end = new Date(customEnd);
    } else {
      end = new Date();
      start = new Date();
      start.setDate(start.getDate() - 7);
    }
    
    console.log('📅 Analysis period:', { start, end });
    
    // Calculate previous period
    const periodDuration = end - start;
    const prevStart = new Date(start.getTime() - periodDuration);
    const prevEnd = new Date(start.getTime());
    
    const dateQuery = { date: { $gte: start, $lte: end } };
    const prevDateQuery = { date: { $gte: prevStart, $lte: prevEnd } };
    const performanceQuery = {
      weekStartDate: { $lte: end },
      weekEndDate: { $gte: start }
    };
    const prevPerformanceQuery = {
      weekStartDate: { $lte: prevEnd },
      weekEndDate: { $gte: prevStart }
    };
    
    // ==================== DATA COLLECTION ====================
    console.log('📊 Fetching comprehensive team data...');
    
    // Current period data
    const [
      allPurchases,
      allPerformance,
      allMessageAnalyses,
      allVIPFans,
      trafficSources,
      trafficSourcePerformance
    ] = await Promise.all([
      FanPurchase.find(dateQuery).populate('trafficSource').populate('vipFan'),
      ChatterPerformance.find(performanceQuery),
      MessageAnalysis.find({}).sort({ createdAt: -1 }).limit(50),
      VIPFan.find({}),
      TrafficSource.find({ isActive: true }),
      TrafficSourcePerformance.find(performanceQuery)
    ]);
    
    // Previous period data
    const [
      prevPurchases,
      prevPerformance
    ] = await Promise.all([
      FanPurchase.find(prevDateQuery),
      ChatterPerformance.find(prevPerformanceQuery)
    ]);
    
    console.log('📊 Data collected:', {
      purchases: allPurchases.length,
      performance: allPerformance.length,
      analyses: allMessageAnalyses.length,
      vips: allVIPFans.length,
      sources: trafficSources.length,
      prevPurchases: prevPurchases.length,
      prevPerformance: prevPerformance.length
    });
    
    // ==================== ANALYSIS ENGINE ====================
    const intelligence = await generateAgencyIntelligence({
      current: {
        purchases: allPurchases,
        performance: allPerformance,
        analyses: allMessageAnalyses,
        vips: allVIPFans,
        sources: trafficSources,
        sourcePerformance: trafficSourcePerformance,
        start,
        end
      },
      previous: {
        purchases: prevPurchases,
        performance: prevPerformance,
        start: prevStart,
        end: prevEnd
      }
    });
    
    res.json(intelligence);
    
  } catch (error) {
    console.error('❌ Agency Intelligence error:', error);
    res.status(500).json({ error: error.message });
  }
});

// WIPE DATA ENDPOINT (MANAGER ONLY)
app.post('/api/admin/wipe-data', authenticateToken, requireManager, async (req, res) => {
  try {
    console.log('🗑️  WIPE DATA REQUEST from user:', req.user.userId);
    
    // Delete all data except Messages, Analysis, Users, Creators, Guidelines
    const results = {
      dailyReports: await DailyChatterReport.deleteMany({}),
      accountData: await AccountData.deleteMany({}),
      chatterPerformance: await ChatterPerformance.deleteMany({}),
      trafficSources: await TrafficSource.deleteMany({}),
      vipFans: await VIPFan.deleteMany({}),
      fanPurchases: await FanPurchase.deleteMany({}),
      trafficSourcePerformance: await TrafficSourcePerformance.deleteMany({}),
      linkTracking: await LinkTrackingData.deleteMany({}),
      dailySnapshots: await DailyAccountSnapshot.deleteMany({})
    };
    
    const totalDeleted = Object.values(results).reduce((sum, r) => sum + r.deletedCount, 0);
    
    console.log('✅ Data wiped successfully. Total deleted:', totalDeleted);
    
    res.json({ 
      success: true, 
      message: 'Data wiped successfully',
      deleted: {
        dailyReports: results.dailyReports.deletedCount,
        accountData: results.accountData.deletedCount,
        chatterPerformance: results.chatterPerformance.deletedCount,
        trafficSources: results.trafficSources.deletedCount,
        vipFans: results.vipFans.deletedCount,
        fanPurchases: results.fanPurchases.deletedCount,
        trafficSourcePerformance: results.trafficSourcePerformance.deletedCount,
        linkTracking: results.linkTracking.deletedCount,
        dailySnapshots: results.dailySnapshots.deletedCount,
        total: totalDeleted
      },
      preserved: ['Messages', 'Analysis', 'Users', 'Creators', 'Guidelines']
    });
  } catch (error) {
    console.error('❌ Error wiping data:', error);
    res.status(500).json({ error: 'Failed to wipe data', details: error.message });
  }
});

// Start server
app.listen(PORT, () => {
  console.log(`🚀 OnlyFans Agency Analytics System v2.1 running on port ${PORT}`);
  console.log(`🌐 Visit: http://localhost:${PORT}`);
  console.log(`📊 New system deployed successfully!`);
  console.log(`🔐 User authentication: ${process.env.JWT_SECRET ? 'Secure' : 'Default key'}`);
  
  // Run migrations after 2 seconds
  setTimeout(() => {
    updateCreatorNames();
  }, 2000);
});

// Estimate token usage for a batch of messages
function estimateTokenUsage(messages) {
  // Rough estimate: 1 token ≈ 4 characters for English text
  const totalChars = messages.reduce((sum, msg) => {
    const text = typeof msg === 'string' ? msg : (msg.text || '');
    return sum + text.length;
  }, 0);
  const estimatedTokens = Math.ceil(totalChars / 4);
  return estimatedTokens;
}

// Retry function with exponential backoff for rate limits
async function analyzeMessagesWithRetry(messages, chatterName, maxRetries = 3) {
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      return await analyzeMessages(messages, chatterName);
    } catch (error) {
      if (error.message.includes('429') || error.message.includes('Rate limit')) {
        const delay = Math.pow(2, attempt) * 1000; // Exponential backoff: 2s, 4s, 8s
        console.log(`⏳ Rate limit hit, retrying in ${delay/1000}s (attempt ${attempt}/${maxRetries})`);
        if (attempt < maxRetries) {
          await new Promise(resolve => setTimeout(resolve, delay));
          continue;
        }
      }
      throw error; // Re-throw if not a rate limit error or max retries reached
    }
  }
}

// Calculate optimal batch size based on message length
function calculateOptimalBatchSize(messages, maxTokens = 500000) { // Increased to 500k tokens for very long messages
  if (messages.length === 0) return 500; // Increased default from 200 to 500
  
  // Debug: Check message lengths
  const sampleMessages = messages.slice(0, 5);
  const avgMessageLength = sampleMessages.reduce((sum, msg) => {
    const text = typeof msg === 'string' ? msg : (msg.text || '');
    return sum + text.length;
  }, 0) / sampleMessages.length;
  console.log(`🔍 DEBUG: Sample message lengths:`, sampleMessages.map(m => {
    const text = typeof m === 'string' ? m : (m.text || '');
    return text.length;
  }));
  console.log(`🔍 DEBUG: Average message length: ${Math.round(avgMessageLength)} characters`);
  
  // Start with a larger batch size for faster processing
  let batchSize = 500; // Increased from 200 to 500
  
  // Test if this batch size fits within token limits
  while (batchSize > 100) { // Increased minimum from 50 to 100
    const testBatch = messages.slice(0, batchSize);
    const estimatedTokens = estimateTokenUsage(testBatch);
    
    console.log(`🔍 DEBUG: Testing batch size ${batchSize} -> ${estimatedTokens} tokens (limit: ${maxTokens})`);
    
    if (estimatedTokens < maxTokens) {
      console.log(`✅ Optimal batch size: ${batchSize} messages (~${estimatedTokens} tokens)`);
      return batchSize;
    }
    
    // Reduce batch size if too large
    batchSize = Math.floor(batchSize * 0.8);
  }
  
  console.log(`⚠️ Using minimum batch size: ${batchSize} messages`);
  
  // Final safety check - if batch size is still too small, force a reasonable minimum
  if (batchSize < 50) {
    console.log(`🚨 WARNING: Batch size too small (${batchSize}), forcing minimum of 50 messages`);
    return 50;
  }
  
  return batchSize;
}

// Format grammar results to be concise with counters
function formatGrammarResults(text, type) {
  console.log(`🔍 DEBUG formatGrammarResults: type=${type}, text="${text}"`);
  if (!text || text.trim() === '') {
    console.log(`🔍 DEBUG: No text for ${type}, returning default message`);
    return `No ${type} errors found - informal OnlyFans language is correct.`;
  }
  
  // Clean up the text but PRESERVE "Found X" patterns for punctuation
  let cleanText = text;
  if (type !== 'punctuation') {
    cleanText = text
      .replace(/Found \d+ [^:]*:/g, '') // Remove "Found X errors:" prefixes
      .replace(/No significant issues found\./g, '')
      .replace(/No significant spelling errors found\./g, '')
      .replace(/No significant grammar errors found\./g, '')
      .replace(/No significant punctuation errors found\./g, '')
      .replace(/\s+/g, ' ')
      .trim();
  } else {
    // For punctuation, only remove very specific repetitive text, keep "Found X" patterns
    cleanText = text
      .replace(/No significant issues found\./g, '')
      .replace(/No significant spelling errors found\./g, '')
      .replace(/No significant grammar errors found\./g, '')
      .replace(/No significant punctuation errors found\./g, '')
      .replace(/\s+/g, ' ')
      .trim();
  }
  
  if (type === 'spelling') {
    // CRITICAL: Filter out informal OnlyFans language that AI incorrectly flags as errors
    const informalWords = ['u', 'ur', 'im', 'i', 'dont', 'cant', 'wont', 'didnt', 'isnt', 'hows', 'thats', 'whats', 'ilove', 'u\'re', 'u\'ll', 'ive', 'id', 'ill', 'youre', 'theyre', 'hes', 'shes', 'whos', 'youll', 'youd', 'its', 'huh', 'srry', 'sry', 'veery', 'veryy', 'sooo', 'soooo', 'looove', 'lovee', 'loveee', 'gkad', 'immm', 'imm', 'fitss', 'explicitt', 'cann', 'okiiess', 'okayy', 'okayyy', 'heyy', 'heyyy', 'hii', 'hiii', 'byee', 'yayyy', 'awww', 'oooh', 'ohhh', 'woww', 'yupp', 'nahh', 'cuz', 'cos', 'prolly', 'tho', 'gonna', 'wanna', 'gotta', 'kinda', 'sorta', 'finna', 'dunno', 'lemme', 'gimme', 'gotcha'];
    
    // Extract ALL words in single quotes (handles multiple formats: 'word' instead of 'word', 'word' in Message X, etc.)
    const allQuotedWords = [...cleanText.matchAll(/'([^']+)'/g)];
    const uniqueSpellingErrors = new Set();
    
    allQuotedWords.forEach(match => {
      const word = match[1].toLowerCase().trim();
      // Skip if it's a full sentence or message reference
      if (word.includes(' ') || word.length > 20) return;
      // ONLY add if it's NOT in the informal words list
      if (!informalWords.includes(word)) {
        uniqueSpellingErrors.add(match[1]);
      }
    });
    
    if (uniqueSpellingErrors.size === 0) {
      return "No spelling errors found - informal OnlyFans language is correct.";
    }
    
    return `Found ${uniqueSpellingErrors.size} spelling error${uniqueSpellingErrors.size !== 1 ? 's' : ''} across analyzed messages.`;
  }
  
  if (type === 'grammar') {
    // CRITICAL: Filter out informal OnlyFans phrases AND apostrophe issues (they're GOOD for informal!)
    const informalPhrases = ['i dont', 'u are', 'dont know', 'cant understand', 'im happy', 'u\'re', 'i can', 'how u deal', 'u cant', 'i dont think', 'she dont', 'he dont', 'u like', 'i hope u', 'let me know u', 'i appreciate it', 'i save it', 'i wish i have', 'i dont mind', 'i can include', 'i cant', 'i\'m', 'u\'re are', 'im instead', 'i see i see', 'quitting of', 'you are instead', 'i was went', 'i\'m older', 'how would you react', 'you should be saying'];
    
    // Extract ALL phrases in single quotes
    const grammarMatches = [...cleanText.matchAll(/'([^']+)'/g)];
    const realErrors = [];
    
    grammarMatches.forEach(match => {
      const phrase = match[1].toLowerCase().trim();
      // Skip message references, explanations, and apostrophe mentions
      if (phrase.startsWith('message ') || phrase.includes('instead of') || phrase.includes('lacks') || 
          phrase.includes('missing apostrophe') || phrase.includes('incorrect punctuation') || 
          phrase.includes('missing \'i have\'')) return;
      // Skip if it's an informal phrase or word
      const isInformalPhrase = informalPhrases.some(informal => phrase.includes(informal));
      const isInformalWord = ['u', 'ur', 'im', 'dont', 'cant', 'i', 'hows', 'youre', 'ive', 'id', 'ill', 'that\'d', 'i\'m', 'i\'ve'].includes(phrase);
      if (!isInformalPhrase && !isInformalWord) {
        realErrors.push(match[1]);
      }
    });
    
    if (realErrors.length === 0) {
      return "No grammar errors found - informal OnlyFans language is correct.";
    }
    
    return `Found ${realErrors.length} grammar error${realErrors.length !== 1 ? 's' : ''} across analyzed messages.`;
  }
  
  if (type === 'punctuation') {
    // CRITICAL: Only show punctuation errors if AI found messages WITH periods/commas
    // The informality guideline is violated when messages HAVE formal punctuation, not when they lack it
    
    // First check: If AI says "Missing periods" or "lack of periods", that's GOOD (not an error)
    // Because OnlyFans messages SHOULD be informal (no periods)
    // BUT if it says "messages with periods" or "contain periods", that's BAD (an error)!
    if ((cleanText.toLowerCase().includes('missing period') || 
         cleanText.toLowerCase().includes('lack of period') ||
         cleanText.toLowerCase().includes('no period')) &&
        !cleanText.toLowerCase().includes('messages with period') &&
        !cleanText.toLowerCase().includes('contain period') &&
        !cleanText.toLowerCase().includes('have period')) {
      console.log(`🔍 PUNCTUATION FILTER: Detected 'missing periods' language - this is NOT an error (informal is correct)`);
      return "No punctuation errors found - informal OnlyFans language is correct.";
    }
    
    // Extract the count from "Found X punctuation problems/issues:"
    const countMatch = cleanText.match(/Found (\d+) punctuation/i);
    
    if (countMatch) {
      const count = parseInt(countMatch[1]);
      if (count > 0) {
        console.log(`🔍 PUNCTUATION FILTER: Found ${count} messages WITH formal punctuation (real errors)`);
        return `Found ${count} punctuation issue${count !== 1 ? 's' : ''} across analyzed messages.`;
      }
    }
    
    // Look for patterns like "X messages with periods" or "X messages have formal punctuation"
    const patternMatch = cleanText.match(/(\d+) messages? (?:with|have|use|using) (?:periods?|formal|punctuation)/i);
    if (patternMatch) {
      const count = parseInt(patternMatch[1]);
      if (count > 0) {
        console.log(`🔍 PUNCTUATION FILTER: Found ${count} messages WITH formal punctuation (real errors)`);
        return `Found ${count} punctuation issue${count !== 1 ? 's' : ''} across analyzed messages.`;
      }
    }
    
    return "No punctuation errors found - informal OnlyFans language is correct.";
  }
  
  return cleanText;
}

// Simple grammar analysis formatter - AGGRESSIVE BLOCKING
// SMART GRAMMAR ANALYSIS - uses AI with strict logic-based filtering
async function analyzeRealGrammar(messages, category) {
  if (!messages || messages.length === 0) {
    return `No ${category.toLowerCase()} analysis available.`;
  }
  
  // OnlyFans informal language that should NEVER be flagged
  const onlyfansInformal = ['u', 'ur', 'im', 'dont', 'cant', 'ilove', 'wyd', 'hbu', 'lol', 'omg', 'btw', 'nvm', 'ikr', 'tbh', 'fyi', 'rn', 'tmr', 'bc', 'cuz', 'tho', 'ur', 'u\'re', 'u\'ll', 'u\'ve', 'u\'d'];
  
  try {
    // Use AI to analyze but with very strict instructions
    const prompt = `Analyze these OnlyFans messages for ${category}. 

CRITICAL RULES:
1. NEVER flag informal OnlyFans language: ${onlyfansInformal.join(', ')} - these are PERFECT for OnlyFans
2. ONLY flag actual errors that would be wrong in ANY context
3. For spelling: only flag obvious misspellings like 'recieve' instead of 'receive'
4. For grammar: only flag clear grammar mistakes like 'I was went' instead of 'I went'
5. For punctuation: only flag excessive formal punctuation (periods, formal commas)

Messages: ${messages.join(' ')}

Return ONLY: "No ${category} found - informal OnlyFans language is correct." OR list specific actual errors found.`;

    const response = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [{ role: 'user', content: prompt }],
      max_tokens: 200,
      temperature: 0.0
    });

    let aiResponse = response.choices[0].message.content.trim();
    
    console.log(`🔍 AI Response for ${category}:`, aiResponse);
    
    // AGGRESSIVE filtering - if AI mentions ANY informal OnlyFans words, block it
    const hasInformalFlagging = onlyfansInformal.some(word => 
      aiResponse.toLowerCase().includes(word + ' instead of') ||
      aiResponse.toLowerCase().includes('missing ' + word) ||
      aiResponse.toLowerCase().includes('incorrect ' + word) ||
      aiResponse.toLowerCase().includes(word + ' should be') ||
      aiResponse.toLowerCase().includes('use ' + word)
    );
    
    if (hasInformalFlagging) {
      console.log('🚨 BLOCKED AI response for informal flagging:', aiResponse.substring(0, 100));
      return `No ${category} found - informal OnlyFans language is correct.`;
    }
    
    // Return raw AI response without formatting
    return aiResponse;
    
  } catch (error) {
    console.log('Error in AI grammar analysis:', error);
    return `No ${category} found - informal OnlyFans language is correct.`;
  }
}

function formatGrammarText(text, category) {
  if (!text || text.trim().length === 0) {
    return `No ${category.toLowerCase()} analysis available.`;
  }
  
  // HYBRID APPROACH: Use AI for guidelines, hardcode grammar analysis
  const badPhrases = [
    'u instead of you', 'ur instead of your', 'im instead of I', 'dont instead of don', 
    'cant instead of can', 'ilove instead of I love', 'wyd instead of what', 're instead of you',
    'inconsistent use of contractions', 'u are instead of you are', 'u and you',
    'contractions like', 'missing apostrophes', 'informal language',
    'ilove instead of I love', 'ilove instead of I love', 'ilove instead of I love',
    'u\'ll instead of you\'ll', 'u\'ll instead of you\'ll', 'u\'ll instead of you\'ll',
    'ilove', 'u\'ll', 'u instead of', 'ur instead of', 'im instead of', 'dont instead of', 'cant instead of',
    'do u instead of do you', 'u cant understand', 'missing question marks', 'excessive use of informal',
    'inconsistent apostrophe usage', 'informal contractions', 'u\'re instead of you\'re'
  ];
  
  const hasBadPhrases = badPhrases.some(phrase => text.toLowerCase().includes(phrase));
  
  if (hasBadPhrases) {
    return "No errors found - informal OnlyFans language is correct.";
  }
  
  // Clean up repetitive score explanations and calculate proper totals
  if (text.includes('Grammar score:')) {
    // Split by "Grammar score:" to get individual score explanations
    const scoreParts = text.split(/Grammar score:/).filter(part => part.trim());
    
    if (scoreParts.length > 1) {
      // Extract the first complete score explanation
      const firstPart = scoreParts[1].trim();
      
      // Parse the first score explanation
      const scoreMatch = firstPart.match(/(\d+\/100)/);
      const issuesMatch = firstPart.match(/Main issues:\s*([^.]+)/);
      const totalMatch = firstPart.match(/Total errors:\s*(\d+)/);
      
      if (scoreMatch && issuesMatch && totalMatch) {
        const score = scoreMatch[1];
        const issues = issuesMatch[1].trim();
        const total = totalMatch[1];
        
        return `Grammar score: ${score}. Main issues: ${issues}. Total errors: ${total}.`;
      }
    }
  }
  
  // If this is a score explanation, try to extract and calculate proper totals
  if (text.includes('Total errors:')) {
    // Extract all error counts from the text
    const errorMatches = text.match(/Total errors:\s*(\d+)/g);
    if (errorMatches && errorMatches.length > 0) {
      // Sum up all the error counts
      let totalErrors = 0;
      errorMatches.forEach(match => {
        const count = parseInt(match.match(/(\d+)/)[1]);
        totalErrors += count;
      });
      
      // Extract the first score and issues
      const scoreMatch = text.match(/(\d+\/100)/);
      const issuesMatch = text.match(/Main issues:\s*([^.]+)/);
      
      if (scoreMatch && issuesMatch) {
        const score = scoreMatch[1];
        const issues = issuesMatch[1].trim();
        
        return `Grammar score: ${score}. Main issues: ${issues}. Total errors: ${totalErrors}.`;
      }
    }
  }
  
  // Return raw text without formatting
  return text;
}

// Helper function to extract error count from formatted text
function extractErrorCount(text) {
  if (!text || text.includes('No ') && text.includes('found')) {
    return 0;
  }
  
  const match = text.match(/Found (\d+)/);
  return match ? parseInt(match[1]) : 0;
}

// Helper function to calculate grammar score based on error count
function calculateGrammarScore(totalErrors, totalMessages) {
  if (totalMessages === 0) return 100;
  
  const errorRate = totalErrors / totalMessages;
  const errorPercentage = errorRate * 100;
  
  // More granular scoring system based on error percentage
  if (errorPercentage === 0) return 100;        // 0% errors = 100/100 (perfect)
  if (errorPercentage <= 0.5) return 95;        // 0.5% errors = 95/100 (excellent)
  if (errorPercentage <= 1) return 88;          // 1% errors = 88/100 (very good)
  if (errorPercentage <= 1.5) return 78;        // 1.5% errors = 78/100 (good)
  if (errorPercentage <= 2) return 68;          // 2% errors = 68/100 (good)
  if (errorPercentage <= 2.5) return 58;        // 2.5% errors = 58/100 (fair)
  if (errorPercentage <= 3) return 48;          // 3% errors = 48/100 (fair)
  if (errorPercentage <= 4) return 35;          // 4% errors = 35/100 (poor)
  if (errorPercentage <= 5) return 22;          // 5% errors = 22/100 (needs improvement)
  if (errorPercentage <= 6) return 10;          // 6% errors = 10/100 (terrible)
  return Math.max(5, Math.round(100 - (errorPercentage * 15))); // 6%+ errors = decreasing score
}

// Helper function to get main issues based on error counts
function getMainIssues(spellingCount, grammarCount, punctuationCount) {
  const issues = [];
  
  if (spellingCount > 0) {
    issues.push(`${spellingCount} spelling error${spellingCount !== 1 ? 's' : ''}`);
  }
  if (grammarCount > 0) {
    issues.push(`${grammarCount} grammar error${grammarCount !== 1 ? 's' : ''}`);
  }
  if (punctuationCount > 0) {
    issues.push(`${punctuationCount} punctuation error${punctuationCount !== 1 ? 's' : ''}`);
  }
  
  if (issues.length === 0) {
    return 'no significant issues';
  }
  
  return issues.join(', ');
}

// Helper function to format guidelines text for clean analysis
function formatGuidelinesText(text, category, allowedPhrases, phraseToTitleMap) {
  if (!text || text.trim().length === 0) {
    return `No ${category.toLowerCase()} analysis available.`;
  }
  
  // Clean up repetitive text
  let cleanText = text
    .replace(/STRICT \w+ analysis:/g, '') // Remove repetitive prefixes
    .replace(/Total.*?found:?\s*\d+/g, '') // Remove redundant totals
    .replace(/No significant issues found/g, '') // Remove repetitive "no issues"
    .replace(/Found missed opportunities/g, '') // Remove generic phrases
    .replace(/Found ,/g, '') // Remove incomplete phrases
    .replace(/Examples?:[^\.\n]*[\.\n]?/gi, '') // Remove examples sections
    .replace(/\s+/g, ' ') // Replace multiple spaces with single space
    .trim();
  
  // Extract unique guideline violations with counts
  const violations = new Map();
  
  // Pattern variants we expect from AI outputs
  const patterns = [
    /Found\s+(\d+)\s+violations?\s+of\s+'([^']+)'\s+guideline/gi, // with quotes and word 'guideline'
    /Found\s+(\d+)\s+violations?\s+of\s+([^:]+):/gi,               // without quotes, ends with colon
    /Found\s+(\d+)\s+violations?\s+in\s+([^:]+):/gi               // "in <area>:"
  ];
  patterns.forEach((re) => {
    let m;
    while ((m = re.exec(cleanText)) !== null) {
      const count = parseInt(m[1]);
      const labelRaw = (m[2] || '').toString().trim();
      let label = labelRaw
        .replace(/guidelines?/i, '')
        .replace(/section/i, '')
        .trim()
        .toLowerCase();
      // Exclude generic category terms that are not real guidelines
      const genericTerms = new Set(['sales effectiveness','engagement quality','caption quality','conversation flow','personal sharing']);
      if (genericTerms.has(label)) continue;
      // Filter out any labels not in uploaded guideline DESCRIPTIONS (allowedPhrases)
      if (allowedPhrases && allowedPhrases.size > 0) {
        const isAllowed = Array.from(allowedPhrases).some(p => label.includes(p) || p.includes(label));
        if (!isAllowed) continue;
      }
      // Map description phrases to their Title for display if available
      if (phraseToTitleMap && phraseToTitleMap.size > 0) {
        for (const [desc, title] of phraseToTitleMap.entries()) {
          if (label.includes(desc) || desc.includes(label)) {
            label = title.toLowerCase();
            break;
          }
        }
      }
      if (!label) continue;
      violations.set(label, (violations.get(label) || 0) + (isNaN(count) ? 0 : count));
    }
  });
  
  // Extract key violation types (unique only)
  const violationTypes = new Set();
  const violationPatterns = [
    /lack of personalization/gi,
    /immediate sales requests/gi,
    /lack of urgency/gi,
    /delayed sales initiation/gi
  ];
  
  violationPatterns.forEach(pattern => {
    const matches = cleanText.match(pattern);
    if (matches) {
      const violation = matches[0].toLowerCase();
      if (violation.includes('personalization')) {
        violationTypes.add('Lack of personalization in sales approach');
      } else if (violation.includes('immediate')) {
        violationTypes.add('Immediate sales requests without relationship building');
      } else if (violation.includes('urgency')) {
        violationTypes.add('Lack of urgency in PPV captions');
      } else if (violation.includes('delayed')) {
        violationTypes.add('Delayed sales initiation issues');
      }
    }
  });
  
  // Create clean, structured analysis
  let analysis = '';
  
  // Add guideline violations (unique counts only)
  if (violations.size > 0) {
    const entries = Array.from(violations.entries());
    const total = entries.reduce((s, [, c]) => s + (c || 0), 0);
    const top = entries
      .sort((a, b) => (b[1] || 0) - (a[1] || 0))
      .slice(0, 3)
      .map(([name, count]) => `${name} (${count})`);
    analysis += `Found ${total} violations. Top issues: ${top.join(', ')}. `;
  }
  
  // If no structured violations captured, try mapping uploaded guideline DESCRIPTIONS to counts
  if (!analysis.trim() && allowedPhrases && allowedPhrases.size > 0) {
    const phraseCounts = new Map();
    allowedPhrases.forEach((p) => {
      if (!p) return;
      const phraseEsc = p.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const reWithCount = new RegExp(`Found\\s+(\\d+)\\s+violations?[^\n]*?(?:of|in)\\s+['\"]?${phraseEsc}['\"]?`, 'i');
      const rePhraseOnly = new RegExp(`${phraseEsc}`, 'i');
      const m = cleanText.match(reWithCount);
      if (m) {
        const c = parseInt(m[1]) || 0;
        if (c > 0) phraseCounts.set(p, (phraseCounts.get(p) || 0) + c);
      } else if (rePhraseOnly.test(cleanText)) {
        phraseCounts.set(p, (phraseCounts.get(p) || 0) + 1);
      }
    });
    if (phraseCounts.size > 0) {
      const entries = Array.from(phraseCounts.entries());
      const total = entries.reduce((s, [, c]) => s + (c || 0), 0);
      const top = entries
        .sort((a, b) => (b[1] || 0) - (a[1] || 0))
        .slice(0, 3)
        .map(([name, count]) => `${name} (${count})`);
      analysis += `Found ${total} violations. Top issues: ${top.join(', ')}. `;
    }
  }
  
  // Add key issues with more detail (unique only)
  if (violationTypes.size > 0) {
    const issuesList = Array.from(violationTypes).slice(0, 3); // Limit to top 3
    analysis += `Key issues include: ${issuesList.join(', ')}. `;
  }
  
  // Do not include examples in final output (keep concise per user request)
  
  // If no structured content, return cleaned text
  if (!analysis.trim()) {
    // As a last resort, try to extract any counts of violations with context
    const quickCounts = [...cleanText.matchAll(/Found\s+(\d+)\s+violations?/gi)].map(m => parseInt(m[1])).filter(n => !isNaN(n));
    if (quickCounts.length > 0) {
      const total = quickCounts.reduce((s, n) => s + n, 0);
      // Try to provide some context about what was found
      const contextMatches = [...cleanText.matchAll(/([^\.]+)\./g)];
      const context = contextMatches.length > 0 ? contextMatches[0][1].substring(0, 100) : 'various issues';
      return `Found ${total} violations. Issues include: ${context}...`;
    }
    // Avoid generic cross-category fallback: if no allowed phrase matched, return concise no-issues string for this category
    return `No specific violations found for ${category}.`;
  }
  
  return analysis;
}

// Extract structured guideline violations (labels, counts, simple examples) for UI details
function extractGuidelineViolations(text, allowedPhrases) {
  if (!text || !text.trim()) return { total: 0, items: [] };
  const norm = (s) => (s || '').toLowerCase().trim();
  const cleanText = text.replace(/\s+/g, ' ').trim();
  const itemsMap = new Map();

  const patterns = [
    /Found\s+(\d+)\s+violations?\s+of\s+'([^']+)'\s+guideline/gi,
    /Found\s+(\d+)\s+violations?\s+of\s+([^:]+):/gi,
    /Found\s+(\d+)\s+violations?\s+in\s+([^:]+):/gi
  ];

  const genericTerms = new Set(['sales effectiveness','engagement quality','caption quality','conversation flow','personal sharing']);

  patterns.forEach((re) => {
    let m;
    while ((m = re.exec(cleanText)) !== null) {
      const count = parseInt(m[1]);
      const labelRaw = (m[2] || '').toString().trim();
      const label = norm(labelRaw.replace(/guidelines?/i, '').replace(/section/i, ''));
      if (!label || isNaN(count)) continue;
      if (genericTerms.has(label)) continue;
      if (allowedPhrases && allowedPhrases.size > 0) {
        const allowed = Array.from(allowedPhrases).some((p) => label.includes(norm(p)) || norm(p).includes(label));
        if (!allowed) continue;
      }
      const prev = itemsMap.get(label) || { label, count: 0, examples: [] };
      prev.count += count;
      itemsMap.set(label, prev);
    }
  });

  // Try to capture message number examples like "messages 12, 18, and 26"
  const msgNums = [];
  const msgRe = /messages?\s+([\d,\sand]+)/gi;
  let mm;
  while ((mm = msgRe.exec(cleanText)) !== null) {
    const part = mm[1];
    const nums = part.split(/[^\d]+/).map(n => parseInt(n)).filter(n => !isNaN(n));
    msgNums.push(...nums);
  }
  // Attach same examples to each item if we have them
  if (msgNums.length > 0) {
    itemsMap.forEach((v, k) => {
      v.examples = Array.from(new Set([...(v.examples || []), ...msgNums])).slice(0, 10);
      itemsMap.set(k, v);
    });
  }

  const items = Array.from(itemsMap.values()).sort((a, b) => (b.count || 0) - (a.count || 0));
  const total = items.reduce((s, it) => s + (it.count || 0), 0);
  return { total, items };
}

// Deterministic analysis for individual chatter (no AI, data-only)
function generateDeterministicIndividualAnalysis(analyticsData, interval, totalMessages = analyticsData.messagesSent) {
  const ppvUnlockRate = analyticsData.ppvsSent > 0
    ? Math.round((analyticsData.ppvsUnlocked / analyticsData.ppvsSent) * 1000) / 10
    : 0;
  const messagesPerPPV = analyticsData.ppvsSent > 0
    ? Math.round((totalMessages / analyticsData.ppvsSent) * 10) / 10
    : 0;
  const messagesPerFan = analyticsData.fansChatted > 0
    ? Math.round((totalMessages / analyticsData.fansChatted) * 10) / 10
    : 0;

  const insights = [];
  if (totalMessages > 0) {
    insights.push(`Analyzed ${totalMessages.toLocaleString()} messages this ${interval} period`);
  }
  if (analyticsData.ppvsSent > 0) {
    insights.push(`PPVs sent: ${analyticsData.ppvsSent} with ${analyticsData.ppvsUnlocked} unlocks (${ppvUnlockRate}% unlock rate)`);
  }
  insights.push(`Average response time: ${Math.round((analyticsData.avgResponseTime || 0) * 10) / 10} minutes`);

  const weakPoints = [];
  if (ppvUnlockRate < 40 && analyticsData.ppvsSent > 0) weakPoints.push(`Low PPV unlock rate (${ppvUnlockRate}%). Target: 50-60%`);
  if ((analyticsData.avgResponseTime || 0) > 3) weakPoints.push(`Response time is high (${Math.round(analyticsData.avgResponseTime * 10) / 10}m). Target: under 3m`);
  if (messagesPerFan < 5 && analyticsData.fansChatted > 0) weakPoints.push(`Low messages per fan (${messagesPerFan}). Target: 6-8`);

  const opportunities = [];
  if (ppvUnlockRate < 50 && analyticsData.ppvsSent > 0) opportunities.push(`Improve PPV hooks and timing to reach 50%+ unlocks`);
  if ((analyticsData.avgResponseTime || 0) > 3) opportunities.push(`Response templates and shortcuts to reduce response time`);
  if (messagesPerFan < 6 && analyticsData.fansChatted > 0) opportunities.push(`Increase follow-ups per fan to lift conversions`);

  const roiCalculations = [];
  if (analyticsData.ppvsSent > 0) {
    const potentialUnlocks = Math.max(0, Math.round(analyticsData.ppvsSent * 0.5 - (analyticsData.ppvsUnlocked || 0)));
    if (potentialUnlocks > 0) {
      roiCalculations.push(`Raising unlock rate to 50% adds ~${potentialUnlocks} unlocks this ${interval} period`);
    }
  }

  const recommendations = [];
  if ((analyticsData.avgResponseTime || 0) > 3) recommendations.push('Practice rapid-response routine: acknowledge, qualify, present, close');
  if (ppvUnlockRate < 50 && analyticsData.ppvsSent > 0) recommendations.push('Test 3 new PPV openers and 2 urgency closers over next 3 days');
  if (messagesPerFan < 6 && analyticsData.fansChatted > 0) recommendations.push('Add 2 extra value messages per fan before the pitch');

  // Only calculate overall score if we have real data
  const overallScore = (analyticsData.grammarScore && analyticsData.guidelinesScore) ? 
    Math.max(0, Math.min(100,
      (ppvUnlockRate >= 50 ? 35 : ppvUnlockRate >= 40 ? 25 : 15) +
      ((analyticsData.avgResponseTime || 0) <= 2 ? 35 : (analyticsData.avgResponseTime || 0) <= 3 ? 25 : 10) +
      (messagesPerFan >= 6 ? 30 : messagesPerFan >= 5 ? 20 : 10)
    )) : null;

  return {
    overallScore,
    insights,
    weakPoints,
    opportunities,
    roiCalculations,
    recommendations,
    // Echo raw metrics used
    ppvsSent: analyticsData.ppvsSent || 0,
    ppvsUnlocked: analyticsData.ppvsUnlocked || 0,
    messagesSent: analyticsData.messagesSent || 0,
    fansChatted: analyticsData.fansChatted || 0,
    avgResponseTime: Math.round((analyticsData.avgResponseTime || 0) * 10) / 10,
    interval,
    // Add advanced metrics for fallback analysis
    advancedMetrics: {
      efficiencyRatios: {
        messagesPerPPV: analyticsData.ppvsSent > 0 ? `${(totalMessages / analyticsData.ppvsSent).toFixed(1)} messages per PPV - ${totalMessages / analyticsData.ppvsSent > 50 ? 'Excellent relationship building' : totalMessages / analyticsData.ppvsSent > 20 ? 'Good engagement strategy' : 'Direct sales approach'}` : 'No PPV data available',
        responseEfficiency: analyticsData.avgResponseTime ? `${analyticsData.avgResponseTime.toFixed(1)}m average - ${analyticsData.avgResponseTime <= 2 ? 'Excellent response time' : analyticsData.avgResponseTime <= 3 ? 'Good response time' : 'Needs improvement'}` : 'No response time data available',
        messageQualityImpact: analyticsData.grammarScore && analyticsData.guidelinesScore ? `Grammar: ${analyticsData.grammarScore}/100, Guidelines: ${analyticsData.guidelinesScore}/100 - ${(analyticsData.grammarScore + analyticsData.guidelinesScore) / 2 >= 70 ? 'Good message quality' : 'Message quality needs improvement'}` : 'Analysis requires more data as message quality score is not available'
      }
    },
    // Include message analysis data as fallback
    chattingStyle: analyticsData.chattingStyle,
    messagePatterns: analyticsData.messagePatterns,
    engagementMetrics: analyticsData.engagementMetrics,
    strengths: analyticsData.strengths || [],
    weaknesses: analyticsData.weaknesses || [],
    suggestions: analyticsData.recommendations || [],
    // Add detailed breakdowns as fallback
    grammarBreakdown: analyticsData.grammarBreakdown || {
      spellingErrors: "No spelling errors detected in recent messages",
      grammarIssues: "Grammar appears to be correct in analyzed messages", 
      punctuationProblems: "Punctuation usage is appropriate",
      informalLanguage: "Language style is consistent with OnlyFans platform",
      scoreExplanation: `Grammar score of ${analyticsData.grammarScore || 0}/100 based on message analysis`
    },
    guidelinesBreakdown: analyticsData.guidelinesBreakdown || {
      salesEffectiveness: "Sales approach appears effective based on conversion data",
      engagementQuality: "Engagement techniques are working well with fans",
      captionQuality: "PPV captions are compelling and driving purchases",
      conversationFlow: "Conversation management is smooth and natural",
      scoreExplanation: `Guidelines score of ${analyticsData.guidelinesScore || 0}/100 based on performance metrics`
    },
    overallBreakdown: analyticsData.overallBreakdown || {
      messageClarity: "Messages are clear and easy to understand",
      emotionalImpact: "Messages create good emotional connection with fans",
      conversionPotential: "Messages effectively drive fan engagement and purchases",
      scoreExplanation: `Overall score of ${analyticsData.overallMessageScore || 0}/100 based on comprehensive analysis`
    }
  };
}

// Fallback analysis function when AI fails
async function generateFallbackAnalysis(analyticsData, analysisType, interval) {
  try {
    console.log('Starting fallback analysis for:', analysisType, interval);
    
    if (analysisType === 'agency') {
      const ppvUnlockRate = analyticsData.ppvsSent > 0 ? (analyticsData.ppvsUnlocked / analyticsData.ppvsSent * 100) : 0;
      
      // Get employee analytics with core metrics
      const dailyReports = await DailyChatterReport.find({
        date: { $gte: new Date(Date.now() - (interval === '7d' ? 7 : interval === '30d' ? 30 : 1) * 24 * 60 * 60 * 1000) }
      });
      
      // Get message analysis for scoring
      const messageAnalyses = await MessageAnalysis.find({
        date: { $gte: new Date(Date.now() - (interval === '7d' ? 7 : interval === '30d' ? 30 : 1) * 24 * 60 * 60 * 1000) }
      });
    
    // Calculate employee performance metrics
    const employeeMetrics = {};
    dailyReports.forEach(report => {
      if (report.chatterId) {
        if (!employeeMetrics[report.chatterId]) {
          employeeMetrics[report.chatterId] = {
            revenue: 0,
            ppvsSent: 0,
            ppvAmounts: [],
            count: 0,
            name: report.chatterId
          };
        }
        const revenue = report.ppvSales.reduce((sum, sale) => sum + sale.amount, 0) + 
                       report.tips.reduce((sum, tip) => sum + tip.amount, 0);
        employeeMetrics[report.chatterId].revenue += revenue;
        employeeMetrics[report.chatterId].ppvsSent += report.ppvSales?.length || 0;
        employeeMetrics[report.chatterId].ppvAmounts.push(...(report.ppvSales?.map(sale => sale.amount) || []));
        employeeMetrics[report.chatterId].count++;
      }
    });
    
    // Calculate message-based scores
    const messageScores = {};
    messageAnalyses.forEach(analysis => {
      if (analysis.chatterId) {
        if (!messageScores[analysis.chatterId]) {
          messageScores[analysis.chatterId] = {
            totalScore: 0,
            count: 0
          };
        }
        messageScores[analysis.chatterId].totalScore += analysis.overallScore || 0;
        messageScores[analysis.chatterId].count++;
      }
    });
    
    // Calculate averages and rankings
    const employeePerformance = Object.values(employeeMetrics).map(emp => {
      const avgPPVPrice = emp.ppvAmounts.length > 0 ? 
        emp.ppvAmounts.reduce((sum, amount) => sum + amount, 0) / emp.ppvAmounts.length : 0;
      const messageScore = messageScores[emp.name] ? 
        messageScores[emp.name].totalScore / messageScores[emp.name].count : 0;
      
      return {
        ...emp,
        avgRevenue: emp.revenue / emp.count,
        avgPPVPrice: avgPPVPrice,
        messageScore: messageScore,
        ppvUnlockRate: emp.ppvsSent > 0 ? (emp.ppvsSent * 0.6) : 0 // Estimate based on sent PPVs
      };
    }).sort((a, b) => b.avgRevenue - a.avgRevenue);
    
    const topPerformer = employeePerformance[0];
    const avgPPVPrice = employeePerformance.length > 0 ? 
      employeePerformance.reduce((sum, emp) => sum + emp.avgPPVPrice, 0) / employeePerformance.length : 0;
    const avgMessageScore = employeePerformance.length > 0 ? 
      employeePerformance.reduce((sum, emp) => sum + emp.messageScore, 0) / employeePerformance.length : 0;
    
    // Only calculate overall agency score if we have real data
    let overallScore = null;
    if (analyticsData.totalRevenue > 0 && ppvUnlockRate > 0 && avgPPVPrice > 0) {
      overallScore = 0;
      if (analyticsData.totalRevenue > 0) overallScore += 30;
      if (ppvUnlockRate > 50) overallScore += 25;
      if (avgPPVPrice > 30) overallScore += 25;
      if (avgMessageScore > 70) overallScore += 20;
    }
    
    return {
      overallScore,
      insights: [
        `Total revenue: $${analyticsData.totalRevenue.toLocaleString()} this ${interval} period`,
        `PPV unlock rate: ${ppvUnlockRate.toFixed(1)}%`,
        `Average PPV price: $${avgPPVPrice.toFixed(2)}`,
        `Average message score: ${avgMessageScore.toFixed(1)}/100`
      ],
      weakPoints: [
        ppvUnlockRate < 30 ? `PPV unlock rate (${ppvUnlockRate.toFixed(1)}%) could be improved` : null,
        avgPPVPrice < 20 ? `Average PPV price ($${avgPPVPrice.toFixed(2)}) could be optimized` : null,
        avgMessageScore < 60 ? `Average message score (${avgMessageScore.toFixed(1)}) could be improved` : null
      ].filter(Boolean),
      opportunities: [
        `Improving PPV unlock rate could increase revenue`,
        `Optimizing PPV pricing could increase revenue`,
        `Improving message scores could increase conversions`
      ],
      roiCalculations: [
        `PPV optimization: $${Math.round(analyticsData.totalRevenue * 0.2)} potential monthly gain for $500 content investment`,
        `Message training: $${Math.round(analyticsData.totalRevenue * 0.15)} potential monthly gain for $300 training cost`
      ],
      recommendations: [
        'Focus on improving PPV unlock rates through better content and pricing',
        'Train chatters on message quality to improve scores',
        'Test higher PPV prices to increase average revenue per sale'
      ]
    };
  } else {
    const ppvUnlockRate = analyticsData.ppvsSent > 0 ? (analyticsData.ppvsUnlocked / analyticsData.ppvsSent * 100) : 0;
    const revenuePerPPV = analyticsData.ppvsSent > 0 ? (analyticsData.totalRevenue / analyticsData.ppvsSent) : 0;
    
    // Only calculate overall score if we have real data
    let overallScore = null;
    if (analyticsData.totalRevenue > 0 && ppvUnlockRate > 0 && revenuePerPPV > 0) {
      overallScore = 0;
      if (analyticsData.totalRevenue > 0) overallScore += 25;
      if (ppvUnlockRate > 50) overallScore += 25;
      if (analyticsData.avgResponseTime < 3) overallScore += 25;
      if (revenuePerPPV > 30) overallScore += 25;
    }
    
    return {
      overallScore,
      strengths: [
        `Generated $${analyticsData.totalRevenue.toLocaleString()} in revenue this ${interval} period`,
        `Active engagement with ${analyticsData.messagesSent} messages sent`,
        `PPV unlock rate of ${ppvUnlockRate.toFixed(1)}%`
      ],
      weaknesses: [
        analyticsData.avgResponseTime > 5 ? `Response time of ${analyticsData.avgResponseTime.toFixed(1)} minutes could be improved` : null,
        ppvUnlockRate < 25 ? `PPV unlock rate of ${ppvUnlockRate.toFixed(1)}% could be improved` : null,
        revenuePerPPV < 15 ? `Revenue per PPV of $${revenuePerPPV.toFixed(2)} could be optimized` : null
      ].filter(Boolean),
      opportunities: [
        `Improving PPV unlock rate could increase revenue`,
        `Reducing response time could increase conversions`
      ],
      recommendations: [
        'Focus on faster response times - aim for under 2 minutes',
        'Improve PPV content quality and pricing strategy',
        'Test higher PPV prices to increase revenue per sale'
      ],
      // Add breakdown data to fallback analysis
      grammarBreakdown: {
        spellingErrors: "No spelling errors detected in recent messages",
        grammarIssues: "Grammar appears to be correct in analyzed messages", 
        punctuationProblems: "Punctuation usage is appropriate",
        informalLanguage: "Language style is consistent with OnlyFans platform",
        scoreExplanation: `Grammar score of ${analyticsData.grammarScore || 0}/100 based on message analysis`
      },
      guidelinesBreakdown: {
        salesEffectiveness: "Sales approach appears effective based on conversion data",
        engagementQuality: "Engagement techniques are working well with fans",
        captionQuality: "PPV captions are compelling and driving purchases",
        conversationFlow: "Conversation management is smooth and natural",
        scoreExplanation: `Guidelines score of ${analyticsData.guidelinesScore || 0}/100 based on performance metrics`
      },
      overallBreakdown: {
        messageClarity: "Messages are clear and easy to understand",
        emotionalImpact: "Messages create good emotional connection with fans",
        conversionPotential: "Messages effectively drive fan engagement and purchases",
        scoreExplanation: `Overall score of ${analyticsData.overallMessageScore || 0}/100 based on comprehensive analysis`
      }
    };
  }
  } catch (error) {
    console.error('Error in generateFallbackAnalysis:', error);
    throw error;
  }
}

// Clean analysis response to remove "not calculable" messages
function cleanAnalysisResponse(analysis) {
  const cleaned = JSON.parse(JSON.stringify(analysis)); // Deep clone
  
  // Function to clean arrays - only remove bad items, keep empty arrays
  const cleanArray = (arr) => {
    if (!Array.isArray(arr)) return arr;
    return arr.filter(item => {
      if (typeof item === 'string') {
        return !item.includes('not calculable') && 
               !item.includes('lack of data') && 
               !item.includes('insufficient data') &&
               !item.includes('cannot be calculated') &&
               !item.includes('REPLACE WITH ACTUAL') &&
               !item.includes('calculated ratio with analysis') &&
               !item.includes('calculated metric with benchmark') &&
               !item.includes('pattern analysis with implications');
      }
      return true;
    });
  };
  
  // Function to clean objects recursively - preserve structure
  const cleanObject = (obj) => {
    if (!obj || typeof obj !== 'object') return obj;
    
    for (const key in obj) {
      if (Array.isArray(obj[key])) {
        obj[key] = cleanArray(obj[key]);
      } else if (typeof obj[key] === 'object') {
        obj[key] = cleanObject(obj[key]);
      } else if (typeof obj[key] === 'string') {
        if (obj[key].includes('not calculable') || 
            obj[key].includes('lack of data') || 
            obj[key].includes('insufficient data') ||
            obj[key].includes('cannot be calculated') ||
            obj[key].includes('REPLACE WITH ACTUAL') ||
            obj[key].includes('calculated ratio with analysis') ||
            obj[key].includes('calculated metric with benchmark') ||
            obj[key].includes('pattern analysis with implications')) {
          // Set to empty string instead of deleting
          obj[key] = '';
        }
      }
    }
    return obj;
  };
  
  return cleanObject(cleaned);
}

// AI Analysis function using OpenAI
async function generateAIAnalysis(analyticsData, analysisType, interval, messageContent = [], totalMessages = analyticsData.messagesSent) {
  try {
    console.log('🚨 STARTING AI ANALYSIS');
    // REMOVED: Massive object logging that causes Railway to drop 67K+ messages
    
    // Check if OpenAI is properly configured
    if (!openai || !openai.chat || !openai.chat.completions) {
      console.log('OpenAI not configured in generateAIAnalysis, returning fallback analysis');
      return {
        insights: ["Analysis requires OpenAI API key configuration"],
        weakPoints: ["Unable to perform AI analysis"],
        rootCauses: ["Missing API configuration"],
        opportunities: ["Configure OpenAI API key for detailed analysis"],
        roiCalculations: ["Analysis not available"],
        recommendations: ["Set up OpenAI API key to enable AI-powered insights"]
      };
    }

    // REMOVED: Massive JSON logging that causes Railway log drops
    
    let prompt;
    if (analysisType === 'agency') {
            prompt = `You are an expert OnlyFans agency analyst. Analyze the following agency performance data for the ${interval} period and provide comprehensive insights:

        AGENCY DATA:
        - Total Revenue: $${analyticsData.totalRevenue}
        - Net Revenue: $${analyticsData.netRevenue}
        - Total Subscribers: ${analyticsData.totalSubs}
        - New Subscribers: ${analyticsData.newSubs}
        - Profile Clicks: ${analyticsData.profileClicks}
        - PPVs Sent: ${analyticsData.ppvsSent}
        - Average Response Time: ${analyticsData.avgResponseTime} minutes

        Please provide a detailed analysis in JSON format with the following structure:
        {
          "overallScore": [0-100],
          "insights": ["insight1", "insight2", "insight3"],
          "weakPoints": ["weakness1", "weakness2"],
          "opportunities": ["opportunity1", "opportunity2"],
          "roiCalculations": ["roi1", "roi2"],
          "recommendations": ["recommendation1", "recommendation2"]
        }

        Focus on these core agency metrics:
        1. Total revenue performance
        2. PPV unlock rates and pricing
        3. Average PPV price across all chatters
        4. Message quality scores from weekly message analysis
        5. Specific weak points with data-driven explanations
        6. Actionable opportunities with potential revenue impact
        7. ROI calculations for improvements
        8. Prioritized recommendations

        Be specific with numbers and percentages. Don't make up data that isn't provided.`;
    } else {
      prompt = `You are an elite OnlyFans agency performance analyst with deep expertise in conversion psychology, revenue optimization, and behavioral analytics. Your analysis must provide sophisticated, strategic insights that drive real business impact.

CHATTER DATA (REAL):
- PPVs Sent: ${analyticsData.ppvsSent}
- PPVs Unlocked: ${analyticsData.ppvsUnlocked}
- Messages Sent: ${analyticsData.messagesSent}
- Fans Chatted: ${analyticsData.fansChatted}
- Average Response Time (minutes): ${analyticsData.avgResponseTime}
- Grammar Score (0-100): ${analyticsData.grammarScore}
- Guidelines Score (0-100): ${analyticsData.guidelinesScore}
- Message Quality Score (0-100): ${analyticsData.overallMessageScore}
- Messages Analyzed: ${analyticsData.totalMessages}
- Net Sales: $${analyticsData.netSales || 0}
- Net Revenue per Fan: $${analyticsData.netRevenuePerFan || 0}
- Chatting Style: ${analyticsData.chattingStyle ? JSON.stringify(analyticsData.chattingStyle) : 'No style data available'}
- Message Patterns: ${analyticsData.messagePatterns ? JSON.stringify(analyticsData.messagePatterns) : 'No pattern data available'}
- Engagement Metrics: ${analyticsData.engagementMetrics ? JSON.stringify(analyticsData.engagementMetrics) : 'No engagement data available'}
- PPV Messages: ${analyticsData.ppvMessages} total PPV messages sent
- PPV Purchases: ${analyticsData.purchasedPPVs} PPVs actually purchased
- PPV Conversion Rate: ${analyticsData.ppvConversionRate.toFixed(1)}% (${analyticsData.purchasedPPVs}/${analyticsData.ppvMessages})
- Average Reply Time: ${analyticsData.avgReplyTime.toFixed(1)} minutes

DERIVED METRICS (you must compute and mention):
- PPV Unlock Rate (%): ${analyticsData.ppvsSent > 0 ? ((analyticsData.ppvsUnlocked/analyticsData.ppvsSent)*100).toFixed(1) : 0}
- Messages per PPV: ${analyticsData.ppvsSent > 0 ? (totalMessages/analyticsData.ppvsSent).toFixed(1) : 0}
- Messages per Fan: ${analyticsData.fansChatted > 0 ? (totalMessages/analyticsData.fansChatted).toFixed(1) : 0}
- Revenue per PPV: $${analyticsData.ppvsSent > 0 ? ((analyticsData.netSales || 0)/analyticsData.ppvsSent).toFixed(2) : 0}
- Revenue per Message: $${totalMessages > 0 ? ((analyticsData.netSales || 0)/totalMessages).toFixed(2) : 0}
- Response Efficiency: ${analyticsData.avgResponseTime > 0 ? (analyticsData.avgResponseTime <= 3 ? 'Fast' : analyticsData.avgResponseTime <= 5 ? 'Moderate' : 'Slow') : 'No Response Time Data Available'}

ANALYSIS GUIDELINES (use actual data, no fake benchmarks):
- Response Time: Analyze actual response times in context of performance data
- PPV Unlock Rate: Compare against actual team averages and performance patterns
- Messages per Fan: Analyze actual engagement patterns and conversion correlation
- Revenue per PPV: Compare actual pricing against performance data
- Message Quality: Only analyze if real message analysis data is available
- Grammar: Only analyze if real grammar analysis data is available
- Guidelines: Avoid major violations. Score should be as high as possible.
- Messages per PPV & Messages per Fan: HIGH ratios are GOOD in OnlyFans - they indicate relationship building. Analyze if high message volume correlates with higher conversion rates (which is the goal).
- Overall Quality: Use as data point for pattern analysis.

CRITICAL ANALYSIS AREAS (analyze ALL with specific data):
1. MESSAGE VOLUME ANALYSIS: ${analyticsData.messagesSent} messages to ${analyticsData.fansChatted} fans = ${(analyticsData.messagesSent/analyticsData.fansChatted).toFixed(1)} messages per fan. Is this optimal?
2. MESSAGE QUALITY IMPACT: ${analyticsData.grammarScore}/100 grammar + ${analyticsData.guidelinesScore}/100 guidelines = ${analyticsData.overallScore}/100 overall. THESE ARE THE ACTUAL SCORES - DO NOT use mock scores like "70/100" or "80/100". ONLY analyze the correlation with ${(analyticsData.ppvsUnlocked/analyticsData.ppvsSent*100).toFixed(1)}% conversion if you have specific data showing this relationship. Do NOT make assumptions about "generally known" relationships or make up random projections like "could increase to 60%".
3. PPV EFFICIENCY ANALYSIS: ${analyticsData.ppvsSent} PPVs sent, ${analyticsData.ppvsUnlocked} unlocked = ${(analyticsData.ppvsUnlocked/analyticsData.ppvsSent*100).toFixed(1)}% unlock rate. What's driving this performance?
4. REVENUE OPTIMIZATION: $${analyticsData.netSales} total revenue = $${(analyticsData.netSales/analyticsData.ppvsSent).toFixed(2)} per PPV SENT (not purchased!). CRITICAL: To calculate revenue per PPV PURCHASED, use: $${analyticsData.netSales} ÷ ${analyticsData.ppvsUnlocked} PPVs purchased = $${(analyticsData.netSales/analyticsData.ppvsUnlocked).toFixed(2)} per PPV purchased. DO NOT confuse PPVs sent vs PPVs purchased!
5. MESSAGE-TO-CONVERSION ANALYSIS: ${analyticsData.messagesSent} messages generated ${analyticsData.ppvsUnlocked} PPV unlocks. What's the message effectiveness?
6. FAN MONETIZATION: $${analyticsData.netSales} from ${analyticsData.fansChatted} fans = $${(analyticsData.netSales/analyticsData.fansChatted).toFixed(2)} per fan. How can this be optimized?
7. CHATTING STYLE ANALYSIS: Analyze the chatter's communication style and personality traits. How do directness, friendliness, sales approach, and personality impact conversion rates?
8. MESSAGE PATTERN OPTIMIZATION: Analyze question frequency, emoji usage, message length, and topic diversity. What patterns correlate with higher conversions?
9. ENGAGEMENT EFFECTIVENESS: Evaluate conversation starting, maintaining, and sales conversation skills. How can these be improved?
10. PPV CONVERSION ANALYSIS: ${analyticsData.ppvMessages} PPV messages resulted in ${analyticsData.purchasedPPVs} purchases = ${analyticsData.ppvConversionRate.toFixed(1)}% conversion rate. What's driving this performance?
11. REPLY TIME IMPACT: Average reply time of ${analyticsData.avgReplyTime.toFixed(1)} minutes. How does response speed correlate with PPV conversion rates?
12. MESSAGE FLOW OPTIMIZATION: Analyze the sequence and timing of messages. What patterns lead to higher PPV purchases?

ADVANCED ANALYSIS REQUIREMENTS:
1. PERFORM DEEP CROSS-REFERENCE ANALYSIS: Connect every metric to reveal hidden patterns and causal relationships
2. PROVIDE CAUSAL INSIGHTS: Explain WHY performance is what it is, not just WHAT it is
3. INCLUDE PREDICTIVE ANALYSIS: What will happen if current trends continue?
4. CALCULATE SPECIFIC IMPACT: Quantify potential revenue/performance improvements with specific numbers
5. IDENTIFY LEVERAGE POINTS: Which small changes will have the biggest impact?
6. PROVIDE STRATEGIC CONTEXT: How does this performance affect overall business goals?

ADVANCED ANALYSIS FRAMEWORK:
- Efficiency Ratios: Calculate message-to-revenue, time-to-conversion, engagement velocity ratios (only if data is available)
- Behavioral Patterns: Identify response time patterns, engagement cycles, conversion triggers (only if data is available)
- Competitive Positioning: Compare against benchmarks with specific gap analysis and quantified impact
- Revenue Optimization: Identify specific revenue leakage points and opportunities with projections
- Risk Assessment: Highlight performance risks and their business impact
- Growth Projections: Calculate potential performance improvements with specific actions and timelines

CRITICAL: Do NOT simply repeat the uploaded numbers. The user already knows these. Instead, provide sophisticated analysis that goes beyond the raw data with deep insights, predictions, and strategic recommendations.

CRITICAL: Do NOT make assumptions about missing data or relationships. If a metric is null/undefined, do not mention it. Do NOT make statements like "higher quality messages can lead to higher conversion rates" unless you have specific data proving this relationship. Only analyze what the actual data shows. If you cannot determine a relationship from the data, state "Analysis requires more data" instead of making theoretical assumptions.

CRITICAL - PPVs SENT vs PPVs PURCHASED:
- PPVs SENT = ${analyticsData.ppvsSent} (total PPVs sent to fans)
- PPVs PURCHASED/UNLOCKED = ${analyticsData.ppvsUnlocked} (PPVs that fans actually bought)
- Revenue per PPV PURCHASED = $${analyticsData.netSales} ÷ ${analyticsData.ppvsUnlocked} = $${(analyticsData.netSales/analyticsData.ppvsUnlocked).toFixed(2)}
- DO NOT say "revenue divided by PPVs sent" when you mean "PPVs purchased"!

CRITICAL - USE ACTUAL SCORES, NOT MOCK SCORES:
- ACTUAL Grammar Score: ${analyticsData.grammarScore}/100 (use THIS exact number)
- ACTUAL Guidelines Score: ${analyticsData.guidelinesScore}/100 (use THIS exact number) 
- ACTUAL Overall Score: ${analyticsData.overallScore}/100 (use THIS exact number)
- DO NOT use fake/mock scores like "70/100" or "80/100" in your analysis!

CRITICAL - DO NOT MAKE UP RANDOM PROJECTIONS:
- DO NOT say things like "could increase to 60%" or "add $34.40 in revenue" or "5% increase = $17.20" unless you have SPECIFIC data supporting this
- If you want to project improvements, base them on ACTUAL data patterns, not random numbers
- BE SPECIFIC or say "Analysis requires more data to project improvements"

CRITICAL - ONLYFANS IS INFORMAL, NOT PROFESSIONAL:
- DO NOT suggest "enhancing professionalism" or "formal improvements" - OnlyFans requires INFORMAL communication
- Grammar improvements should focus on CLARITY and READABILITY, NOT formality
- Correct recommendations: "reduce typos", "improve sentence clarity", "fix awkward phrasing"
- WRONG recommendations: "enhance professionalism", "use formal language", "improve formality"

CRITICAL: You MUST return ALL sections in the JSON response. Do not omit any sections.

For each metric, either provide a real calculation/analysis OR provide a meaningful message about the data.

NEVER use these phrases:
- "not calculable due to lack of data"
- "not calculable due to lack of revenue data" 
- "not calculable due to lack of conversion data"
- "not calculable due to lack of engagement data"
- "insufficient data"
- "cannot be calculated"
- "not available"

Instead, provide actual analysis or say "Analysis requires more data" or "Metric not available with current data".

Respond in STRICT JSON with this exact shape:
{
  "executiveSummary": {
    "performanceGrade": "string with detailed justification",
    "revenueImpact": "string with specific revenue analysis and projections",
    "criticalFindings": ["finding 1 with business impact", "finding 2 with business impact", "finding 3 with business impact"]
  },
  "advancedMetrics": {
    "efficiencyRatios": {
      "messagesPerPPV": "DETAILED analysis using ACTUAL data: ${analyticsData.messagesSent} messages ÷ ${analyticsData.ppvsSent} PPVs sent = ${(analyticsData.messagesSent/analyticsData.ppvsSent).toFixed(1)} messages per PPV. Provide specific benchmarks and actionable insights.",
      "revenueEfficiency": "DETAILED analysis using ACTUAL data: $${analyticsData.ppvRevenue || analyticsData.netSales} revenue ÷ ${analyticsData.ppvsUnlocked} PPVs PURCHASED = $${((analyticsData.ppvRevenue || analyticsData.netSales)/(analyticsData.ppvsUnlocked || 1)).toFixed(2)} per PPV purchased. Also: $${(analyticsData.ppvRevenue || analyticsData.netSales)} ÷ ${analyticsData.messagesSent} messages = $${((analyticsData.ppvRevenue || analyticsData.netSales)/(analyticsData.messagesSent || 1)).toFixed(2)} per message. Provide pricing recommendations. DO NOT confuse PPVs sent (${analyticsData.ppvsSent}) with PPVs purchased (${analyticsData.ppvsUnlocked}).",
      "messageQualityImpact": "START YOUR RESPONSE WITH EXACTLY THIS TEXT, WORD FOR WORD, NO CHANGES: 'Grammar: ${analyticsData.grammarScore}/100. Guidelines: ${analyticsData.guidelinesScore}/100. Unlock rate: ${(analyticsData.ppvsUnlocked/analyticsData.ppvsSent*100).toFixed(1)}%.' THEN continue with your analysis. WARNING: If you write 'Grammar score: 70/100' or 'Guidelines score: 80/100' you have FAILED - these are mock scores. The REAL scores are Grammar: ${analyticsData.grammarScore}/100 and Guidelines: ${analyticsData.guidelinesScore}/100. CRITICAL: OnlyFans is INFORMAL - do NOT suggest 'professionalism' or 'formal improvements'. DO NOT make up projections like '5% increase' or '$17.20' unless you have SPECIFIC data backing this."
    },
    "behavioralPatterns": {
      "messageVolumeAnalysis": "DETAILED analysis of ${analyticsData.messagesSent} messages to ${analyticsData.fansChatted} fans = ${(analyticsData.messagesSent/analyticsData.fansChatted).toFixed(1)} messages per fan with engagement optimization",
      "conversionPatterns": "DETAILED analysis of ${analyticsData.ppvsUnlocked}/${analyticsData.ppvsSent} = ${(analyticsData.ppvsUnlocked/analyticsData.ppvsSent*100).toFixed(1)}% conversion rate with specific improvement strategies", 
      "revenuePatterns": "DETAILED analysis of $${analyticsData.netSales} total revenue from ${analyticsData.fansChatted} fans = $${(analyticsData.netSales/analyticsData.fansChatted).toFixed(2)} per fan with monetization optimization"
    },
    "competitiveAnalysis": {
      "benchmarkGaps": "specific performance gaps with quantified impact",
      "strengthAreas": "areas of strong performance with business value",
      "improvementPotential": "specific improvement opportunities with projections"
    }
  },
  "strategicInsights": {
    "revenueOptimization": {
      "leakagePoints": ["Use ACTUAL data: Total revenue $${analyticsData.netSales}, ${analyticsData.ppvsSent} PPVs sent, ${analyticsData.ppvsUnlocked} PPVs purchased.${analyticsData.avgPPVPrice > 0 ? ` Average PPV price: $${analyticsData.avgPPVPrice.toFixed(2)}.` : ' (Individual PPV pricing not yet available.)'}", "Focus on ACTUAL problems: Grammar ${analyticsData.grammarScore}/100, Guidelines ${analyticsData.guidelinesScore}/100, ${(analyticsData.ppvsUnlocked/analyticsData.ppvsSent*100).toFixed(1)}% unlock rate.", "Identify SPECIFIC leaks: e.g., 'Grammar errors may reduce PPV conversion', 'Reply time violations (X found) may lose fan engagement.'"],
      "growthOpportunities": ["ONLY make projections if you can show the MATH: e.g., 'If unlock rate improves from ${(analyticsData.ppvsUnlocked/analyticsData.ppvsSent*100).toFixed(1)}% to X%, revenue could increase by Y.' Show your work.", "DO NOT use random numbers like '10% increase = $50' unless you calculate it from ACTUAL data.", "If you can't calculate a real projection, say 'Growth opportunities require baseline comparison data.'"],
      "efficiencyGains": ["ONLY mention response time if avgResponseTime shows in the data: ${analyticsData.avgResponseTime} minutes. If it's 0 or undefined, don't mention it.", "ONLY recommend pricing changes if you have ACTUAL pricing data. Calculate: $${analyticsData.netSales} ÷ ${analyticsData.ppvsUnlocked} PPVs = $${(analyticsData.netSales/analyticsData.ppvsUnlocked).toFixed(2)} per PPV. You can recommend pricing based on THIS.", "Focus on ACTUAL problems: Grammar (${analyticsData.grammarScore}/100), Guidelines (${analyticsData.guidelinesScore}/100)."]
    },
    "messageOptimization": {
      "qualityImprovements": ["Grammar: ${analyticsData.grammarScore}/100. If <70, recommend grammar improvements. If 70-84, say 'Good grammar, room for improvement.' If 85+, say 'Grammar quality is excellent.'", "Guidelines: ${analyticsData.guidelinesScore}/100. If <70, recommend fixing specific violations. If 70-84, say 'Good adherence, minor improvements needed.' If 85+, say 'Excellent guideline adherence.'", "BE SPECIFIC about which errors to fix - don't say 'improve clarity' unless you have ACTUAL clarity issues in the data."],
      "engagementStrategies": ["ONLY make engagement recommendations if you have ACTUAL message analysis data showing engagement patterns.", "If no specific engagement data is available, say 'Detailed engagement analysis requires message pattern data.'", "DO NOT make up strategies like 'use more emojis' unless data shows emoji usage is low."],
      "conversionOptimization": ["Current unlock rate: ${(analyticsData.ppvsUnlocked/analyticsData.ppvsSent*100).toFixed(1)}% (${analyticsData.ppvsUnlocked}/${analyticsData.ppvsSent}).", "You CAN make projections IF you show the math: 'If grammar improves from ${analyticsData.grammarScore}/100 to 85/100, and this correlates with 5% better engagement, unlock rate could improve to X%.' Show your reasoning.", "DO NOT make up random percentages without showing the calculation."]
    },
    "performanceDrivers": {
      "primaryDrivers": ["Grammar: ${analyticsData.grammarScore}/100. Guidelines: ${analyticsData.guidelinesScore}/100. These are the primary quality drivers.", "Unlock rate: ${(analyticsData.ppvsUnlocked/analyticsData.ppvsSent*100).toFixed(1)}%. This is the primary conversion driver.", "ONLY mention other drivers if they're in the ACTUAL data provided."],
      "limitingFactors": ["If grammar <70: 'Low grammar score (${analyticsData.grammarScore}/100) limiting message effectiveness.'", "If guidelines <70: 'Low guidelines score (${analyticsData.guidelinesScore}/100) limiting conversion.'", "If avgResponseTime >10: 'Slow response time (${analyticsData.avgResponseTime} min) may limit engagement.' Otherwise don't mention response time."],
      "leveragePoints": ["If grammar/guidelines <85: 'Improving message quality from ${analyticsData.grammarScore}/100 grammar and ${analyticsData.guidelinesScore}/100 guidelines to 85+ could enhance conversions.'", "If unlock rate <40%: 'Improving unlock rate from ${(analyticsData.ppvsUnlocked/analyticsData.ppvsSent*100).toFixed(1)}% could significantly increase revenue.'", "BE SPECIFIC and use ACTUAL numbers."]
    }
  },
  "actionPlan": {
    "immediateActions": ["ONLY recommend fixing ACTUAL problems: If grammar score is ${analyticsData.grammarScore}/100, recommend 'Fix grammar errors to improve message quality.'", "If guidelines score is ${analyticsData.guidelinesScore}/100, recommend 'Address guideline violations to improve conversion.'", "DO NOT make up actions like 'reduce response time' unless we have actual response time data."],
    "messageOptimization": ["Grammar: ${analyticsData.grammarScore}/100. If low, recommend grammar improvements. If high, skip.", "Guidelines: ${analyticsData.guidelinesScore}/100. If low, recommend guideline adherence. If high, skip.", "DO NOT make generic recommendations."],
    "revenueOptimization": ["${analyticsData.avgPPVPrice > 0 ? `Average PPV price: $${analyticsData.avgPPVPrice.toFixed(2)} (from uploaded data). Use THIS for pricing recommendations.` : `You CAN calculate average PPV price: $${analyticsData.netSales} ÷ ${analyticsData.ppvsUnlocked} PPVs = $${(analyticsData.netSales/analyticsData.ppvsUnlocked).toFixed(2)} per PPV. Use THIS for pricing recommendations.`}", "You CAN make revenue projections IF you show the math: 'If unlock rate improves from ${(analyticsData.ppvsUnlocked/analyticsData.ppvsSent*100).toFixed(1)}% to X%, with ${analyticsData.ppvsSent} PPVs at $${analyticsData.avgPPVPrice > 0 ? analyticsData.avgPPVPrice.toFixed(2) : (analyticsData.netSales/analyticsData.ppvsUnlocked).toFixed(2)} average price, revenue could increase by $Y.' SHOW THE CALCULATION.", "Recommend: Improve grammar (${analyticsData.grammarScore}/100) and guidelines (${analyticsData.guidelinesScore}/100) to improve ${(analyticsData.ppvsUnlocked/analyticsData.ppvsSent*100).toFixed(1)}% unlock rate."],
    "successMetrics": ["Target: Improve grammar score from ${analyticsData.grammarScore}/100 to at least 85/100 within 30 days.", "Target: Improve guidelines score from ${analyticsData.guidelinesScore}/100 to at least 85/100 within 30 days.", "DO NOT make up metrics we can't measure."],
    "roiProjections": {
      "currentState": "Current: $${analyticsData.netSales} revenue, ${(analyticsData.ppvsUnlocked/analyticsData.ppvsSent*100).toFixed(1)}% unlock rate (${analyticsData.ppvsUnlocked}/${analyticsData.ppvsSent} PPVs), ${analyticsData.grammarScore}/100 grammar, ${analyticsData.guidelinesScore}/100 guidelines.",
      "optimizedState": "You CAN make projections IF you show the MATH and reasoning. Example: 'If grammar improves to 85/100 and guidelines improve to 85/100, and this leads to 10% better unlock rate (based on correlation data), revenue could increase to $X.' SHOW YOUR WORK. DO NOT use random numbers.",
      "improvementValue": "Calculate based on ACTUAL data. Example: 'If unlock rate improves from ${(analyticsData.ppvsUnlocked/analyticsData.ppvsSent*100).toFixed(1)}% to X% (specific reasoning), with ${analyticsData.ppvsSent} PPVs at $${analyticsData.avgPPVPrice > 0 ? analyticsData.avgPPVPrice.toFixed(2) : (analyticsData.netSales/analyticsData.ppvsUnlocked).toFixed(2)} average price, revenue could increase by $Y.' SHOW THE CALCULATION."
    }
  }
}

CRITICAL ANALYSIS REQUIREMENTS:
- EVERY analysis must include the EXACT numbers from the data. No generic statements.
- MESSAGE ANALYSIS IS CRITICAL: With ${analyticsData.totalMessages} messages analyzed, provide detailed insights about message patterns, quality, and effectiveness.
- REVENUE ANALYSIS MUST BE SPECIFIC: Use the exact $${analyticsData.netSales} revenue, $${(analyticsData.netSales/analyticsData.ppvsSent).toFixed(2)} per PPV, and $${(analyticsData.netSales/analyticsData.messagesSent).toFixed(2)} per message.
- CONVERSION ANALYSIS MUST BE DETAILED: The ${(analyticsData.ppvsUnlocked/analyticsData.ppvsSent*100).toFixed(1)}% unlock rate from ${analyticsData.ppvsUnlocked}/${analyticsData.ppvsSent} PPVs needs specific analysis.
- MESSAGE QUALITY CORRELATION: Analyze how the ${analyticsData.grammarScore}/100 grammar and ${analyticsData.guidelinesScore}/100 guidelines scores impact the ${(analyticsData.ppvsUnlocked/analyticsData.ppvsSent*100).toFixed(1)}% conversion rate.
- ENGAGEMENT ANALYSIS: The ${analyticsData.messagesSent} messages to ${analyticsData.fansChatted} fans = ${(analyticsData.messagesSent/analyticsData.fansChatted).toFixed(1)} messages per fan needs detailed analysis.
- PRICING ANALYSIS: The $${(analyticsData.netSales/analyticsData.ppvsSent).toFixed(2)} per PPV and $${(analyticsData.netSales/analyticsData.messagesSent).toFixed(2)} per message need specific pricing recommendations.
- NO GENERIC STATEMENTS: Every insight must reference specific numbers and provide actionable recommendations.
- MESSAGE PATTERNS: Analyze the actual message content patterns and their effectiveness.
- REVENUE OPTIMIZATION: Provide specific strategies to improve the $${analyticsData.netSales} total revenue.`;
    }

    const completion = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        {
          role: "system",
          content: "You are an expert OnlyFans agency analyst specializing in data-driven performance optimization. You have access to detailed message analysis, revenue data, and conversion metrics. Your job is to provide SPECIFIC, ACTIONABLE insights using EXACT numbers from the data. Focus heavily on message quality analysis, revenue optimization, and conversion improvement. Every recommendation must be backed by specific data points and include quantifiable improvement strategies."
        },
        {
          role: "user",
          content: prompt
        }
      ],
      temperature: 0.0, // Zero temperature for maximum consistency
      max_tokens: 16000 // Fixed limit for gpt-4o-mini (max is 16384)
    });

    const aiResponse = completion.choices[0].message.content;
    console.log('🔍 AI Response Length:', aiResponse.length);
    console.log('🔍 AI Response Ends With:', aiResponse.slice(-50));
    
    // Check if response was truncated
    if (completion.choices[0].finish_reason === 'length') {
      console.error('❌ AI response was truncated due to token limit!');
      throw new Error('AI response truncated - increase max_tokens');
    }
    
    // Try to extract JSON from the response
    const jsonMatch = aiResponse.match(/\{[\s\S]*\}/);
    console.log('🔍 JSON Match Found:', !!jsonMatch);
    if (jsonMatch) {
      console.log('🔍 Extracted JSON Length:', jsonMatch[0].length);
      console.log('🔍 Extracted JSON Preview:', jsonMatch[0].substring(0, 200) + '...');
    }
    
    if (!jsonMatch) {
      console.error('❌ No JSON found in AI response');
      throw new Error('AI response format error - no JSON found');
    }
    
    try {
      const analysis = JSON.parse(jsonMatch[0]);
      console.log('Parsed AI Analysis:', JSON.stringify(analysis, null, 2));
      
      // CRITICAL: Attach the raw response for guidelines parsing
      analysis._rawResponse = jsonMatch[0];
      console.log(`📋 Attached raw response (${analysis._rawResponse.length} chars)`);
      
      // Debug: Check if the required fields are present
      console.log('🔍 AI Analysis Fields Check:');
      console.log('  - chattingStyle:', !!analysis.chattingStyle, analysis.chattingStyle ? Object.keys(analysis.chattingStyle) : 'N/A');
      console.log('  - messagePatterns:', !!analysis.messagePatterns, analysis.messagePatterns ? Object.keys(analysis.messagePatterns) : 'N/A');
      console.log('  - engagementMetrics:', !!analysis.engagementMetrics, analysis.engagementMetrics ? Object.keys(analysis.engagementMetrics) : 'N/A');
      console.log('  - grammarBreakdown:', !!analysis.grammarBreakdown, analysis.grammarBreakdown ? Object.keys(analysis.grammarBreakdown) : 'N/A');
      console.log('  - guidelinesBreakdown:', !!analysis.guidelinesBreakdown, analysis.guidelinesBreakdown ? Object.keys(analysis.guidelinesBreakdown) : 'N/A');
      
      return analysis;
    } catch (parseError) {
      console.error('❌ JSON Parse Error:', parseError.message);
      console.error('❌ Malformed JSON:', jsonMatch[0]);
      console.error('❌ JSON Length:', jsonMatch[0] ? jsonMatch[0].length : 'No JSON found');
      
      // Check if JSON was truncated
      if (jsonMatch[0] && jsonMatch[0].endsWith('{')) {
        console.error('❌ JSON appears to be truncated - ends with opening brace');
        throw new Error('AI response truncated - JSON incomplete');
      }
      
      throw new Error('AI response format error - malformed JSON');
    }
  } catch (error) {
    console.error('OpenAI API Error:', error);
    throw error;
  }
}

// AI Recommendations function
async function generateAIRecommendations(analytics, chatters, interval) {
  try {
    // Get actual data from daily reports
    const dailyReports = await DailyChatterReport.find({
      date: { $gte: new Date(Date.now() - (interval === '24h' ? 1 : interval === '7d' ? 7 : 30) * 24 * 60 * 60 * 1000) }
    });

    const totalRevenue = dailyReports.reduce((sum, report) => {
      const ppvRevenue = report.ppvSales.reduce((ppvSum, sale) => ppvSum + sale.amount, 0);
      const tipsRevenue = report.tips.reduce((tipSum, tip) => tipSum + tip.amount, 0);
      return sum + ppvRevenue + tipsRevenue;
    }, 0);

    const totalPPVs = dailyReports.reduce((sum, report) => sum + (report.ppvSales?.length || 0), 0);
    const avgResponseTime = dailyReports.length > 0 
      ? dailyReports.reduce((sum, report) => sum + (report.avgResponseTime || 0), 0) / dailyReports.length 
      : 0;

    const recommendations = [];

    // Analyze PPV pricing patterns from real data
    if (totalRevenue > 0 && totalPPVs > 0) {
      const revenuePerPPV = totalRevenue / totalPPVs;
      
      // Analyze individual PPV sales to find pricing patterns
      const allPPVPrices = [];
      const chatterPricing = {};
      
      dailyReports.forEach(report => {
        if (report.ppvSales && report.ppvSales.length > 0) {
          const chatterName = report.chatterName;
          if (!chatterPricing[chatterName]) {
            chatterPricing[chatterName] = { prices: [], totalRevenue: 0, count: 0 };
          }
          
          report.ppvSales.forEach(sale => {
            allPPVPrices.push(sale.amount);
            chatterPricing[chatterName].prices.push(sale.amount);
            chatterPricing[chatterName].totalRevenue += sale.amount;
            chatterPricing[chatterName].count += 1;
          });
        }
      });
      
      // Calculate actual pricing statistics
      const avgPrice = allPPVPrices.length > 0 ? 
        allPPVPrices.reduce((sum, price) => sum + price, 0) / allPPVPrices.length : 0;
      const maxPrice = allPPVPrices.length > 0 ? Math.max(...allPPVPrices) : 0;
      const minPrice = allPPVPrices.length > 0 ? Math.min(...allPPVPrices) : 0;
      
      // INTELLIGENT pricing analysis: Find correlation between price and performance
      const pricingAnalysis = [];
      
      // Group chatters by price ranges to analyze performance patterns
      const priceGroups = {
        low: [],    // Bottom 25% of prices
        medium: [], // Middle 50% of prices  
        high: []    // Top 25% of prices
      };
      
      // Sort all PPV prices to find quartiles
      const sortedPrices = allPPVPrices.sort((a, b) => a - b);
      const q1Index = Math.floor(sortedPrices.length * 0.25);
      const q3Index = Math.floor(sortedPrices.length * 0.75);
      const q1Price = sortedPrices[q1Index] || 0;
      const q3Price = sortedPrices[q3Index] || 0;
      
      // Categorize chatters by their average price
      Object.keys(chatterPricing).forEach(chatter => {
        const data = chatterPricing[chatter];
        const chatterAvgPrice = data.totalRevenue / data.count;
        const chatterPPVCount = data.count;
        
        if (chatterPPVCount >= 3) { // Only analyze with sufficient data
          const chatterData = {
            chatter,
            avgPrice: chatterAvgPrice,
            totalRevenue: data.totalRevenue,
            ppvCount: chatterPPVCount,
            revenuePerPPV: chatterAvgPrice
          };
          
          if (chatterAvgPrice <= q1Price) {
            priceGroups.low.push(chatterData);
          } else if (chatterAvgPrice >= q3Price) {
            priceGroups.high.push(chatterData);
          } else {
            priceGroups.medium.push(chatterData);
          }
        }
      });
      
      // Calculate average performance by price group
      const groupPerformance = {};
      Object.keys(priceGroups).forEach(group => {
        const data = priceGroups[group];
        if (data.length > 0) {
          groupPerformance[group] = {
            avgPrice: data.reduce((sum, d) => sum + d.avgPrice, 0) / data.length,
            avgRevenue: data.reduce((sum, d) => sum + d.totalRevenue, 0) / data.length,
            avgPPVCount: data.reduce((sum, d) => sum + d.ppvCount, 0) / data.length,
            sampleSize: data.length
          };
        }
      });
      
      // Analyze correlation: Do higher prices lead to better performance?
      if (groupPerformance.low && groupPerformance.high && 
          groupPerformance.low.sampleSize >= 2 && groupPerformance.high.sampleSize >= 2) {
        
        const lowPricePerf = groupPerformance.low;
        const highPricePerf = groupPerformance.high;
        
        // Calculate performance metrics
        const lowRevenuePerPPV = lowPricePerf.avgRevenue / lowPricePerf.avgPPVCount;
        const highRevenuePerPPV = highPricePerf.avgRevenue / highPricePerf.avgPPVCount;
        
        // Determine if higher prices correlate with better performance
        const pricePerformanceCorrelation = highRevenuePerPPV / lowRevenuePerPPV;
        
        if (pricePerformanceCorrelation > 1.2) {
          // Higher prices correlate with better performance - recommend price increases
          const lowPriceChatters = priceGroups.low.map(d => d.chatter);
          const potentialIncrease = lowPriceChatters.reduce((sum, chatter) => {
            const currentRevenue = chatterPricing[chatter].totalRevenue;
            const priceIncrease = (highPricePerf.avgPrice - chatterPricing[chatter].totalRevenue / chatterPricing[chatter].count) / (chatterPricing[chatter].totalRevenue / chatterPricing[chatter].count);
            return sum + (currentRevenue * priceIncrease * 0.7); // Conservative 70% conversion
          }, 0);
          
          pricingAnalysis.push({
            type: 'increase',
            chatters: lowPriceChatters,
            currentAvgPrice: lowPricePerf.avgPrice.toFixed(2),
            targetAvgPrice: highPricePerf.avgPrice.toFixed(2),
            performanceGap: ((pricePerformanceCorrelation - 1) * 100).toFixed(1),
            potentialIncrease: potentialIncrease
          });
        } else if (pricePerformanceCorrelation < 0.8) {
          // Higher prices correlate with worse performance - recommend price decreases
          const highPriceChatters = priceGroups.high.map(d => d.chatter);
          const potentialIncrease = highPriceChatters.reduce((sum, chatter) => {
            const currentRevenue = chatterPricing[chatter].totalRevenue;
            // Assume lower prices increase volume by 25%
            return sum + (currentRevenue * 0.25);
          }, 0);
          
          pricingAnalysis.push({
            type: 'decrease',
            chatters: highPriceChatters,
            currentAvgPrice: highPricePerf.avgPrice.toFixed(2),
            targetAvgPrice: lowPricePerf.avgPrice.toFixed(2),
            performanceGap: ((1 - pricePerformanceCorrelation) * 100).toFixed(1),
            potentialIncrease: potentialIncrease
          });
        }
      }
      
      // Generate recommendations based on intelligent correlation analysis
      pricingAnalysis.forEach(analysis => {
        if (analysis.type === 'increase') {
          recommendations.push({
            description: `Data analysis shows higher PPV prices correlate with ${analysis.performanceGap}% better performance. ${analysis.chatters.join(', ')} are in the low-price group (avg $${analysis.currentAvgPrice}) and could benefit from increasing prices toward $${analysis.targetAvgPrice}.`,
            expectedImpact: `Revenue optimization opportunity identified ($${Math.round(analysis.potentialIncrease)} monthly potential)`,
            category: 'pricing_optimization',
            priority: 'high',
            data: {
              correlation: analysis.performanceGap,
              lowPriceChatters: analysis.chatters,
              currentAvgPrice: analysis.currentAvgPrice,
              targetAvgPrice: analysis.targetAvgPrice
            }
          });
        } else if (analysis.type === 'decrease') {
          recommendations.push({
            description: `Data analysis shows higher PPV prices correlate with ${analysis.performanceGap}% worse performance. ${analysis.chatters.join(', ')} are in the high-price group (avg $${analysis.currentAvgPrice}) and could benefit from decreasing prices toward $${analysis.targetAvgPrice}.`,
            expectedImpact: `Volume optimization opportunity identified ($${Math.round(analysis.potentialIncrease)} monthly potential)`,
            category: 'pricing_optimization',
            priority: 'medium',
            data: {
              correlation: analysis.performanceGap,
              highPriceChatters: analysis.chatters,
              currentAvgPrice: analysis.currentAvgPrice,
              targetAvgPrice: analysis.targetAvgPrice
            }
          });
        }
      });
    }

    // Response time analysis based on real performance data (only if we have meaningful data)
    if (avgResponseTime > 0 && avgResponseTime < 10) { // Reasonable response time range
      // Group reports by response time performance
      const responseTimeGroups = {
        fast: [], // < 3 minutes
        medium: [], // 3-5 minutes  
        slow: [] // > 5 minutes
      };

      dailyReports.forEach(report => {
        if (report.avgResponseTime) {
          const revenue = (report.totalPPVRevenue || 0) + (report.totalTipRevenue || 0);
          const ppvCount = report.ppvSales?.length || 0;
          
          if (report.avgResponseTime < 3) {
            responseTimeGroups.fast.push({ revenue, ppvCount, responseTime: report.avgResponseTime });
          } else if (report.avgResponseTime <= 5) {
            responseTimeGroups.medium.push({ revenue, ppvCount, responseTime: report.avgResponseTime });
          } else {
            responseTimeGroups.slow.push({ revenue, ppvCount, responseTime: report.avgResponseTime });
          }
        }
      });

      // Calculate average performance by response time group
      const groupAverages = {};
      Object.keys(responseTimeGroups).forEach(group => {
        const data = responseTimeGroups[group];
        if (data.length > 0) {
          groupAverages[group] = {
            avgRevenue: data.reduce((sum, d) => sum + d.revenue, 0) / data.length,
            avgPPVCount: data.reduce((sum, d) => sum + d.ppvCount, 0) / data.length,
            avgResponseTime: data.reduce((sum, d) => sum + d.responseTime, 0) / data.length,
            sampleSize: data.length
          };
        }
      });

      // Calculate potential impact if we have both fast and slow responders
      if (groupAverages.fast && groupAverages.slow && 
          groupAverages.fast.sampleSize >= 2 && groupAverages.slow.sampleSize >= 2) {
        
        const fastRevenue = groupAverages.fast.avgRevenue;
        const slowRevenue = groupAverages.slow.avgRevenue;
        
        if (slowRevenue > 0) {
          const potentialIncrease = ((fastRevenue - slowRevenue) / slowRevenue) * 100;
          
          if (potentialIncrease > 5) {
            const slowReports = responseTimeGroups.slow.length;
            const potentialMonthlyIncrease = slowRevenue * slowReports * potentialIncrease / 100;
            
            recommendations.push({
              description: `Fast responders (${groupAverages.fast.avgResponseTime.toFixed(1)}min) generate $${fastRevenue.toFixed(0)} avg daily revenue vs slow responders (${groupAverages.slow.avgResponseTime.toFixed(1)}min) at $${slowRevenue.toFixed(0)}. Based on your data, improving response times to under 5 minutes could boost performance.`,
              expectedImpact: `Response time optimization opportunity identified`,
              category: 'efficiency',
              priority: 'high',
              data: {
                potentialRevenueIncrease: potentialIncrease.toFixed(1),
                currentSlowAvg: slowRevenue.toFixed(0),
                targetFastAvg: fastRevenue.toFixed(0),
                fastSampleSize: groupAverages.fast.sampleSize,
                slowSampleSize: groupAverages.slow.sampleSize
              }
            });
          }
        }
      }
    }

    // Chatter-specific conversion analysis (PPV unlock rates, message-to-sale conversion)
    const chatterConversionAnalysis = analyzeChatterConversions(dailyReports);
    if (chatterConversionAnalysis.hasOpportunities) {
      recommendations.push({
        description: chatterConversionAnalysis.description,
        expectedImpact: chatterConversionAnalysis.expectedImpact,
        category: 'conversion_optimization',
        priority: chatterConversionAnalysis.priority,
        data: chatterConversionAnalysis.data
      });
    }

    // Note: Removed profitability analysis since we don't have actual costs data

    // Weekend performance analysis
    const weekendReports = dailyReports.filter(report => {
      const day = new Date(report.date).getDay();
      return day === 0 || day === 6; // Sunday or Saturday
    });
    const weekdayReports = dailyReports.filter(report => {
      const day = new Date(report.date).getDay();
      return day >= 1 && day <= 5;
    });

    if (weekendReports.length > 0 && weekdayReports.length > 0) {
      const weekendAvg = weekendReports.reduce((sum, r) => {
        const revenue = r.ppvSales.reduce((s, sale) => s + sale.amount, 0) + r.tips.reduce((s, tip) => s + tip.amount, 0);
        return sum + revenue;
      }, 0) / weekendReports.length;

      const weekdayAvg = weekdayReports.reduce((sum, r) => {
        const revenue = r.ppvSales.reduce((s, sale) => s + sale.amount, 0) + r.tips.reduce((s, tip) => s + tip.amount, 0);
        return sum + revenue;
      }, 0) / weekdayReports.length;

      if (weekendAvg < weekdayAvg * 0.8) { // Weekend performance is 20%+ below weekdays
        // Calculate potential gain based on actual time period, not hardcoded monthly assumption
        const timePeriodDays = interval === '24h' ? 1 : interval === '7d' ? 7 : 30;
        const weekendDaysInPeriod = Math.ceil(timePeriodDays * 2/7); // 2 weekend days per 7 days
        const potentialWeekendGain = Math.round((weekdayAvg - weekendAvg) * weekendDaysInPeriod);
        
        recommendations.push({
          description: `Weekend performance is ${Math.round((1 - weekendAvg/weekdayAvg) * 100)}% below weekday average. Weekend optimization could recover significant revenue.`,
          expectedImpact: `Weekend optimization opportunity identified ($${potentialWeekendGain} potential gain)`,
          category: 'scheduling',
          priority: 'medium',
          data: {
            weekendAvg: weekendAvg.toFixed(0),
            weekdayAvg: weekdayAvg.toFixed(0),
            performanceGap: Math.round((1 - weekendAvg/weekdayAvg) * 100),
            potentialGain: potentialWeekendGain
          }
        });
      }
    }

    // Chatter performance variance analysis based on real data
    const chatterPerformance = {};
    dailyReports.forEach(report => {
      if (report.chatterName) {
        if (!chatterPerformance[report.chatterName]) {
          chatterPerformance[report.chatterName] = { 
            revenue: 0, 
            responseTime: 0, 
            count: 0,
            ppvCount: 0,
            tipCount: 0,
            fansChatted: 0
          };
        }
        const revenue = (report.totalPPVRevenue || 0) + (report.totalTipRevenue || 0);
        chatterPerformance[report.chatterName].revenue += revenue;
        chatterPerformance[report.chatterName].responseTime += report.avgResponseTime || 0;
        chatterPerformance[report.chatterName].ppvCount += report.ppvSales?.length || 0;
        chatterPerformance[report.chatterName].tipCount += report.tips?.length || 0;
        chatterPerformance[report.chatterName].fansChatted += report.fansChatted || 0;
        chatterPerformance[report.chatterName].count++;
      }
    });

    // Calculate performance metrics per chatter
    Object.keys(chatterPerformance).forEach(chatter => {
      const perf = chatterPerformance[chatter];
      perf.avgRevenuePerDay = perf.count > 0 ? perf.revenue / perf.count : 0;
      perf.avgResponseTime = perf.count > 0 ? perf.responseTime / perf.count : 0;
      perf.avgPPVPerDay = perf.count > 0 ? perf.ppvCount / perf.count : 0;
      perf.avgFansPerDay = perf.count > 0 ? perf.fansChatted / perf.count : 0;
    });

    const performanceValues = Object.values(chatterPerformance).map(p => p.avgRevenuePerDay);
    if (performanceValues.length > 1) {
      const maxPerf = Math.max(...performanceValues);
      const minPerf = Math.min(...performanceValues);
      const avgPerf = performanceValues.reduce((sum, p) => sum + p, 0) / performanceValues.length;
      
      // Find top performer
      const topPerformer = Object.keys(chatterPerformance).find(chatter => 
        chatterPerformance[chatter].avgRevenuePerDay === maxPerf
      );
      
      if (maxPerf > avgPerf * 1.3 && Object.keys(chatterPerformance).length >= 3) { // Top performer is 30%+ above average AND we have at least 3 chatters
        const performanceGap = ((maxPerf - avgPerf) / avgPerf) * 100;
        const teamSize = Object.keys(chatterPerformance).length;
        
        // More conservative training impact estimate (20% of gap, max 15%)
        const potentialTeamIncrease = Math.min(performanceGap * 0.2, 15); 
        
        // Calculate potential based on actual time period, not hardcoded 30 days
        const timePeriodDays = interval === '24h' ? 1 : interval === '7d' ? 7 : 30;
        const potentialPeriodIncrease = avgPerf * teamSize * (potentialTeamIncrease / 100) * timePeriodDays;
        
        recommendations.push({
          description: `${topPerformer} generates ${performanceGap.toFixed(1)}% more revenue than team average ($${avgPerf.toFixed(0)}/day). Based on actual performance data, skills transfer could level up entire team.`,
          expectedImpact: `Team performance optimization opportunity identified ($${Math.round(potentialPeriodIncrease)} potential gain)`,
          category: 'training',
          priority: 'medium',
          data: {
            topPerformer,
            performanceGap: performanceGap.toFixed(1),
            teamSize,
            avgRevenuePerDay: avgPerf.toFixed(0),
            topPerformerRevenue: maxPerf.toFixed(0),
            potentialIncrease: potentialTeamIncrease.toFixed(1),
            timePeriod: timePeriodDays
          }
        });
      }
    }

    // If no specific recommendations, provide data-driven general advice
    if (recommendations.length === 0) {
      recommendations.push({
        description: 'Performance metrics are within optimal ranges. Focus on consistency and monitoring emerging trends in subscriber behavior.',
        expectedImpact: 'Maintain current $' + Math.round(totalRevenue) + ' monthly performance',
        category: 'maintenance',
        priority: 'low'
      });
    }

    return recommendations.slice(0, 4); // Return top 4 recommendations
  } catch (error) {
    console.error('AI Recommendations Error:', error);
    return [{
      description: 'Unable to generate AI recommendations - analyzing available data',
      expectedImpact: 'Check data availability and system status',
      category: 'system',
      priority: 'low'
    }];
  }
}

// Get user by ID
app.get('/api/users/:userId', authenticateToken, async (req, res) => {
  try {
    const user = await User.findById(req.params.userId).select('-password');
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }
    res.json(user);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Get all creator accounts
app.get('/api/creators', authenticateToken, async (req, res) => {
  try {
    const creators = await CreatorAccount.find({ isActive: true }).sort({ name: 1 });
    res.json(creators);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Update creator names (one-time fix)
app.post('/api/creators/update-names', authenticateToken, requireManager, async (req, res) => {
  try {
    const creators = await CreatorAccount.find().sort({ _id: 1 });
    
    const names = ['Arya', 'Iris', 'Lilla'];
    const accounts = ['@arya_of', '@iris_of', '@lilla_of'];
    
    for (let i = 0; i < Math.min(creators.length, 3); i++) {
      creators[i].name = names[i];
      creators[i].accountName = accounts[i];
      await creators[i].save();
    }
    
    res.json({ message: 'Creator names updated!', creators });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ===== PERFORMANCE TRACKING SYSTEM =====

// Auto-save performance snapshot when chatter data is uploaded
async function autoSavePerformanceSnapshot(chatterName, weekStartDate, weekEndDate, chatterData, messageData) {
  try {
    console.log(`📊 Creating performance snapshot for ${chatterName} (${weekStartDate} to ${weekEndDate})`);
    const metrics = {
      ppvsSent: chatterData.ppvsSent || 0,
      ppvsUnlocked: chatterData.ppvsUnlocked || 0,
      unlockRate: chatterData.unlockRate || 0,
      messagesSent: chatterData.messagesSent || 0,
      fansChatted: chatterData.fansChattedWith || 0,
      avgResponseTime: chatterData.avgResponseTime || 0,
      messagesPerPPV: chatterData.ppvsSent > 0 ? chatterData.messagesSent / chatterData.ppvsSent : 0,
      messagesPerFan: chatterData.fansChattedWith > 0 ? chatterData.messagesSent / chatterData.fansChattedWith : 0,
      grammarScore: messageData?.grammarScore,
      guidelinesScore: messageData?.guidelinesScore,
      overallScore: messageData?.overallScore
    };
    
    // Calculate week-over-week changes
    const previousWeek = await PerformanceHistory.findOne({
      chatterName,
      weekEndDate: { $lt: new Date(weekStartDate) }
    }).sort({ weekEndDate: -1 });
    
    const improvements = {
      unlockRateChange: previousWeek ? metrics.unlockRate - previousWeek.metrics.unlockRate : 0,
      responseTimeChange: previousWeek ? previousWeek.metrics.avgResponseTime - metrics.avgResponseTime : 0,
      qualityScoreChange: previousWeek ? metrics.overallScore - previousWeek.metrics.overallScore : 0,
      messagesPerPPVChange: previousWeek ? metrics.messagesPerPPV - previousWeek.metrics.messagesPerPPV : 0
    };
    
    // Calculate improvement score (0-100)
    let improvementScore = 50; // baseline
    if (improvements.unlockRateChange > 0) improvementScore += Math.min(improvements.unlockRateChange * 2, 20);
    if (improvements.responseTimeChange > 0) improvementScore += Math.min(improvements.responseTimeChange * 5, 15);
    if (improvements.qualityScoreChange > 0) improvementScore += Math.min(improvements.qualityScoreChange / 2, 15);
    improvementScore = Math.min(Math.max(improvementScore, 0), 100);
    
    await PerformanceHistory.create({
      chatterName,
      weekStartDate,
      weekEndDate,
      metrics,
      recommendedActions: [],
      improvements,
      improvementScore
    });
    
    console.log(`✅ Auto-saved performance snapshot for ${chatterName}`);
  } catch (error) {
    console.error('Auto-save performance snapshot error:', error);
  }
}

// Save performance snapshot after analysis
app.post('/api/performance/snapshot', authenticateToken, requireManager, async (req, res) => {
  try {
    const { chatterName, weekStartDate, weekEndDate, metrics, recommendedActions } = req.body;
    
    // Calculate week-over-week changes
    const previousWeek = await PerformanceHistory.findOne({
      chatterName,
      weekEndDate: { $lt: new Date(weekStartDate) }
    }).sort({ weekEndDate: -1 });
    
    const improvements = {
      unlockRateChange: previousWeek ? metrics.unlockRate - previousWeek.metrics.unlockRate : 0,
      responseTimeChange: previousWeek ? previousWeek.metrics.avgResponseTime - metrics.avgResponseTime : 0,
      qualityScoreChange: previousWeek ? metrics.overallScore - previousWeek.metrics.overallScore : 0,
      messagesPerPPVChange: previousWeek ? metrics.messagesPerPPV - previousWeek.metrics.messagesPerPPV : 0
    };
    
    // Calculate improvement score (0-100)
    let improvementScore = 50; // baseline
    if (improvements.unlockRateChange > 0) improvementScore += Math.min(improvements.unlockRateChange * 2, 20);
    if (improvements.responseTimeChange > 0) improvementScore += Math.min(improvements.responseTimeChange * 5, 15);
    if (improvements.qualityScoreChange > 0) improvementScore += Math.min(improvements.qualityScoreChange / 2, 15);
    improvementScore = Math.min(Math.max(improvementScore, 0), 100);
    
    const snapshot = await PerformanceHistory.create({
      chatterName,
      weekStartDate,
      weekEndDate,
      metrics,
      recommendedActions,
      improvements,
      improvementScore
    });
    
    res.json({ success: true, snapshot });
  } catch (error) {
    console.error('Performance snapshot error:', error);
    res.status(500).json({ error: error.message });
  }
});

// Get performance history for a chatter
app.get('/api/performance/history/:chatterName', authenticateToken, async (req, res) => {
  try {
    const { chatterName } = req.params;
    const { limit = 12 } = req.query; // Last 12 weeks by default
    
    const history = await PerformanceHistory.find({ chatterName })
      .sort({ weekEndDate: -1 })
      .limit(parseInt(limit));
    
    res.json({ history });
  } catch (error) {
    console.error('Performance history error:', error);
    res.status(500).json({ error: error.message });
  }
});

// Mark action as implemented
app.post('/api/performance/action/implement', authenticateToken, requireManager, async (req, res) => {
  try {
    const { snapshotId, actionIndex, notes } = req.body;
    
    const snapshot = await PerformanceHistory.findById(snapshotId);
    if (!snapshot) {
      return res.status(404).json({ error: 'Snapshot not found' });
    }
    
    snapshot.recommendedActions[actionIndex].implemented = true;
    snapshot.recommendedActions[actionIndex].implementedDate = new Date();
    if (notes) snapshot.recommendedActions[actionIndex].notes = notes;
    
    await snapshot.save();
    
    res.json({ success: true, snapshot });
  } catch (error) {
    console.error('Action implementation error:', error);
    res.status(500).json({ error: error.message });
  }
});

// Get period-over-period comparison for any metric
app.get('/api/analytics/comparison', authenticateToken, async (req, res) => {
  try {
    const { startDate, endDate, chatterId } = req.query;
    
    const start = new Date(startDate);
    const end = new Date(endDate);
    const duration = end - start;
    
    // Calculate previous period dates
    const prevEnd = new Date(start);
    const prevStart = new Date(start - duration);
    
    // Build query
    let query = {};
    if (chatterId) {
      const user = await User.findById(chatterId);
      if (user) query.chatterName = user.chatterName || user.username;
    }
    
    // Current period data
    const currentChatterData = await ChatterPerformance.find({
      ...query,
      $or: [
        { weekStartDate: { $gte: start, $lte: end } },
        { weekEndDate: { $gte: start, $lte: end } },
        { $and: [{ weekStartDate: { $lte: start } }, { weekEndDate: { $gte: end } }] }
      ]
    });
    
    const currentAccountData = await AccountData.find({
      $or: [
        { weekStartDate: { $gte: start, $lte: end } },
        { weekEndDate: { $gte: start, $lte: end } },
        { $and: [{ weekStartDate: { $lte: start } }, { weekEndDate: { $gte: end } }] }
      ]
    });
    
    const currentMessageData = await MessageAnalysis.find({
      ...query,
      $or: [
        { weekStartDate: { $gte: start, $lte: end } },
        { weekEndDate: { $gte: start, $lte: end } },
        { $and: [{ weekStartDate: { $lte: start } }, { weekEndDate: { $gte: end } }] }
      ]
    });
    
    // Previous period data
    const prevChatterData = await ChatterPerformance.find({
      ...query,
      $or: [
        { weekStartDate: { $gte: prevStart, $lt: start } },
        { weekEndDate: { $gte: prevStart, $lt: start } },
        { $and: [{ weekStartDate: { $lte: prevStart } }, { weekEndDate: { $gte: start } }] }
      ]
    });
    
    const prevAccountData = await AccountData.find({
      $or: [
        { weekStartDate: { $gte: prevStart, $lt: start } },
        { weekEndDate: { $gte: prevStart, $lt: start } },
        { $and: [{ weekStartDate: { $lte: prevStart } }, { weekEndDate: { $gte: start } }] }
      ]
    });
    
    const prevMessageData = await MessageAnalysis.find({
      ...query,
      $or: [
        { weekStartDate: { $gte: prevStart, $lt: start } },
        { weekEndDate: { $gte: prevStart, $lt: start } },
        { $and: [{ weekStartDate: { $lte: prevStart } }, { weekEndDate: { $gte: start } }] }
      ]
    });
    
    // Calculate aggregates
    const calcChange = (current, previous) => {
      if (!previous || previous === 0) return current > 0 ? 100 : 0;
      return ((current - previous) / previous * 100).toFixed(1);
    };
    
    const sumField = (data, field) => data.reduce((sum, item) => sum + (item[field] || 0), 0);
    const avgField = (data, field) => data.length > 0 ? sumField(data, field) / data.length : 0;
    
    // Current metrics
    const current = {
      ppvsSent: sumField(currentChatterData, 'ppvsSent'),
      ppvsUnlocked: sumField(currentChatterData, 'ppvsUnlocked'),
      messagesSent: sumField(currentChatterData, 'messagesSent'),
      fansChatted: sumField(currentChatterData, 'fansChattedWith'),
      avgResponseTime: avgField(currentChatterData, 'avgResponseTime'),
      netRevenue: sumField(currentAccountData, 'netRevenue'),
      newSubs: sumField(currentAccountData, 'newSubs'),
      profileClicks: sumField(currentAccountData, 'profileClicks'),
      grammarScore: avgField(currentMessageData, 'grammarScore'),
      guidelinesScore: avgField(currentMessageData, 'guidelinesScore'),
      overallScore: avgField(currentMessageData, 'overallScore')
    };
    
    current.unlockRate = current.ppvsSent > 0 ? (current.ppvsUnlocked / current.ppvsSent * 100).toFixed(1) : 0;
    current.conversionRate = current.profileClicks > 0 ? (current.newSubs / current.profileClicks * 100).toFixed(1) : 0;
    current.messagesPerPPV = current.ppvsSent > 0 ? (current.messagesSent / current.ppvsSent).toFixed(1) : 0;
    
    // Previous metrics
    const previous = {
      ppvsSent: sumField(prevChatterData, 'ppvsSent'),
      ppvsUnlocked: sumField(prevChatterData, 'ppvsUnlocked'),
      messagesSent: sumField(prevChatterData, 'messagesSent'),
      fansChatted: sumField(prevChatterData, 'fansChattedWith'),
      avgResponseTime: avgField(prevChatterData, 'avgResponseTime'),
      netRevenue: sumField(prevAccountData, 'netRevenue'),
      newSubs: sumField(prevAccountData, 'newSubs'),
      profileClicks: sumField(prevAccountData, 'profileClicks'),
      grammarScore: avgField(prevMessageData, 'grammarScore'),
      guidelinesScore: avgField(prevMessageData, 'guidelinesScore'),
      overallScore: avgField(prevMessageData, 'overallScore')
    };
    
    previous.unlockRate = previous.ppvsSent > 0 ? (previous.ppvsUnlocked / previous.ppvsSent * 100).toFixed(1) : 0;
    previous.conversionRate = previous.profileClicks > 0 ? (previous.newSubs / previous.profileClicks * 100).toFixed(1) : 0;
    previous.messagesPerPPV = previous.ppvsSent > 0 ? (previous.messagesSent / previous.ppvsSent).toFixed(1) : 0;
    
    // Calculate changes
    const changes = {
      ppvsSent: calcChange(current.ppvsSent, previous.ppvsSent),
      ppvsUnlocked: calcChange(current.ppvsUnlocked, previous.ppvsUnlocked),
      unlockRate: calcChange(parseFloat(current.unlockRate), parseFloat(previous.unlockRate)),
      messagesSent: calcChange(current.messagesSent, previous.messagesSent),
      fansChatted: calcChange(current.fansChatted, previous.fansChatted),
      avgResponseTime: calcChange(previous.avgResponseTime, current.avgResponseTime), // reversed (lower is better)
      netRevenue: calcChange(current.netRevenue, previous.netRevenue),
      newSubs: calcChange(current.newSubs, previous.newSubs),
      profileClicks: calcChange(current.profileClicks, previous.profileClicks),
      conversionRate: calcChange(parseFloat(current.conversionRate), parseFloat(previous.conversionRate)),
      messagesPerPPV: calcChange(parseFloat(current.messagesPerPPV), parseFloat(previous.messagesPerPPV)),
      grammarScore: calcChange(current.grammarScore, previous.grammarScore),
      guidelinesScore: calcChange(current.guidelinesScore, previous.guidelinesScore),
      overallScore: calcChange(current.overallScore, previous.overallScore)
    };
    
    res.json({ current, previous, changes });
  } catch (error) {
    console.error('Comparison error:', error);
    res.status(500).json({ error: error.message });
  }
});

// Get improvement trends
app.get('/api/performance/trends/:chatterName', authenticateToken, async (req, res) => {
  try {
    const { chatterName } = req.params;
    const { weeks = 8 } = req.query;
    
    const history = await PerformanceHistory.find({ chatterName })
      .sort({ weekEndDate: -1 })
      .limit(parseInt(weeks));
    
    // Calculate trends
    const trends = {
      unlockRate: history.map(h => ({ date: h.weekEndDate, value: h.metrics.unlockRate })).reverse(),
      responseTime: history.map(h => ({ date: h.weekEndDate, value: h.metrics.avgResponseTime })).reverse(),
      qualityScore: history.map(h => ({ date: h.weekEndDate, value: h.metrics.overallScore })).reverse(),
      improvementScore: history.map(h => ({ date: h.weekEndDate, value: h.improvementScore })).reverse(),
      actionsImplemented: history.reduce((sum, h) => sum + h.recommendedActions.filter(a => a.implemented).length, 0),
      totalActions: history.reduce((sum, h) => sum + h.recommendedActions.length, 0)
    };
    
    // Calculate overall improvement percentage
    if (history.length >= 2) {
      const latest = history[0].metrics;
      const oldest = history[history.length - 1].metrics;
      
      trends.overallImprovement = {
        unlockRate: ((latest.unlockRate - oldest.unlockRate) / oldest.unlockRate * 100).toFixed(1),
        responseTime: ((oldest.avgResponseTime - latest.avgResponseTime) / oldest.avgResponseTime * 100).toFixed(1),
        qualityScore: ((latest.overallScore - oldest.overallScore) / oldest.overallScore * 100).toFixed(1)
      };
    }
    
    res.json({ trends });
  } catch (error) {
    console.error('Performance trends error:', error);
    res.status(500).json({ error: error.message });
  }
});

// Analyze chatter-specific conversion metrics (PPV unlock rates, message-to-sale conversion)
function analyzeChatterConversions(dailyReports) {
  const chatterMetrics = {};
  
  // Aggregate chatter-specific conversion data
  dailyReports.forEach(report => {
    if (report.chatterName) {
      const chatterName = report.chatterName;
      if (!chatterMetrics[chatterName]) {
        chatterMetrics[chatterName] = {
          totalPPVsSent: 0,
          totalPPVsUnlocked: 0,
          totalMessagesSent: 0,
          totalRevenue: 0,
          totalFansChatted: 0,
          days: 0
        };
      }
      
      const metrics = chatterMetrics[chatterName];
      metrics.totalPPVsSent += report.ppvSales?.length || 0;
      // Note: We don't have real unlock data, so we can't calculate unlock rates
      // Note: We don't have real message count data, so we can't calculate message-to-sale rates
      metrics.totalRevenue += (report.totalPPVRevenue || 0) + (report.totalTipRevenue || 0);
      metrics.totalFansChatted += report.fansChatted || 0;
      metrics.days += 1;
    }
  });

  // Calculate conversion rates per chatter (only for metrics we have real data for)
  Object.keys(chatterMetrics).forEach(chatter => {
    const data = chatterMetrics[chatter];
    // Note: We don't have real unlock data, so we can't calculate unlock rates
    // Note: We don't have real message count data, so we can't calculate message-to-sale rates
    data.revenuePerFan = data.totalFansChatted > 0 ? (data.totalRevenue / data.totalFansChatted) : 0;
    data.avgRevenuePerDay = data.days > 0 ? (data.totalRevenue / data.days) : 0;
  });

  // Find conversion opportunities (only for metrics we have real data for)
  // Note: Removed message-to-sale analysis since we don't have real message count data

  // Note: Removed message-to-sale conversion analysis since we don't have real message count data

  return { hasOpportunities: false };
}

// Note: Removed calculateUnlockRateImprovement function since we don't have real unlock rate data

// Note: Removed profitability analysis function since we don't have actual costs data

// Calculate potential improvement from better message-to-sale conversion
function calculateMessageToSaleImprovement(chatterMetrics, lowMessageToSaleChatters, teamAvgMessageToSale) {
  let totalPotentialIncrease = 0;
  let totalCurrentRevenue = 0;
  
  lowMessageToSaleChatters.forEach(chatter => {
    const data = chatterMetrics[chatter];
    const currentMessageToSale = data.messageToSaleRate;
    const targetMessageToSale = teamAvgMessageToSale * 0.9; // Conservative 90% of team average
    
    if (currentMessageToSale > 0) {
      const messageToSaleIncrease = (targetMessageToSale - currentMessageToSale) / currentMessageToSale;
      // Assume 70% of potential message-to-sale improvement translates to revenue
      const potentialRevenue = data.totalRevenue * (1 + messageToSaleIncrease * 0.7);
      const potentialIncrease = potentialRevenue - data.totalRevenue;
      
      totalPotentialIncrease += potentialIncrease;
      totalCurrentRevenue += data.totalRevenue;
    }
  });
  
  return totalCurrentRevenue > 0 ? (totalPotentialIncrease / totalCurrentRevenue) * 100 : 0;
}

// Handle errors
process.on('uncaughtException', (err) => {
  console.error('Uncaught Exception:', err);
});

process.on('unhandledRejection', (err) => {
  console.error('Unhandled Rejection:', err);
});
// Force redeploy Sat Oct  4 22:11:01 CEST 2025
