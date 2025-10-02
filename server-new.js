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
  Analytics
} = require('./models');

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.static('public'));

// OpenAI Configuration
let openai;
if (process.env.OPENAI_API_KEY) {
  openai = new OpenAI({
    apiKey: process.env.OPENAI_API_KEY
  });
  console.log('✅ OpenAI configured');
} else {
  console.warn('⚠️  OPENAI_API_KEY not set - AI analysis will be limited');
}

// MongoDB Connection
const mongoUri = process.env.MONGODB_URI || process.env.MONGO_URL || 'mongodb://localhost:27017/onlyfans_analytics';
console.log('🔌 Attempting to connect to MongoDB...');
console.log('🔗 MongoDB URI format check:', mongoUri ? 'Set' : 'Not set');

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
    await initializeData();
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
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];

  if (!token) {
    return res.sendStatus(401);
  }

  jwt.verify(token, process.env.JWT_SECRET || 'your-secret-key', (err, user) => {
    if (err) return res.sendStatus(403);
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
  if (mongoose.connection.readyState !== 1) {
    return res.status(503).json({ 
      error: 'Database connection not ready. Please try again in a moment.' 
    });
  }
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

// Get all chatters/employees
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

// Get dashboard analytics
app.get('/api/analytics/dashboard', checkDatabaseConnection, authenticateToken, async (req, res) => {
  try {
    const { interval = '7d', startDate, endDate } = req.query;

    // Define start and end dates first
    let start, end;
    if (startDate && endDate) {
      start = new Date(startDate);
      end = new Date(endDate);
    } else {
      const days = interval === '24h' ? 1 : interval === '7d' ? 7 : interval === '30d' ? 30 : 7;
      end = new Date();
      start = new Date();
      start.setDate(start.getDate() - days);
    }

    let dateQuery = {};
    if (startDate && endDate) {
      dateQuery = {
        date: {
          $gte: start,
          $lte: end
        }
      };
    } else {
      dateQuery = { date: { $gte: start } };
    }

    // Get data from all sources with proper date filtering
    const dailyReports = await DailyChatterReport.find(dateQuery);
    
    // AccountData uses weekStartDate/weekEndDate, not date
    let accountDataQuery = {};
    if (startDate && endDate) {
      accountDataQuery = {
        $or: [
          { weekStartDate: { $lte: end }, weekEndDate: { $gte: start } },
          { weekStartDate: { $gte: start, $lte: end } },
          { weekEndDate: { $gte: start, $lte: end } }
        ]
      };
    } else {
      // Strict overlap: data period must actually overlap with query period
      accountDataQuery = {
        weekStartDate: { $lte: end },
        weekEndDate: { $gte: start }
      };
    }
    const ofAccountData = await AccountData.find(accountDataQuery);
    
    // Get chatter performance data with proper date range matching
    let chatterPerformanceQuery = {};
    if (startDate && endDate) {
      // Find records that overlap with the requested date range
      chatterPerformanceQuery = {
        $or: [
          { weekStartDate: { $lte: end }, weekEndDate: { $gte: start } },
          { weekStartDate: { $gte: start, $lte: end } },
          { weekEndDate: { $gte: start, $lte: end } }
        ]
      };
    } else {
      // Strict overlap: data period must actually overlap with query period
      chatterPerformanceQuery = { 
        weekStartDate: { $lte: end },
        weekEndDate: { $gte: start }
      };
      console.log('Dashboard querying ChatterPerformance with dates:', { start, end, interval });
    }
    const chatterPerformance = await ChatterPerformance.find(chatterPerformanceQuery);
    
    console.log('=== DASHBOARD QUERY DEBUG ===');
    console.log('Query used:', JSON.stringify(chatterPerformanceQuery, null, 2));
    console.log('Dashboard data query results:', {
      dailyReports: dailyReports.length,
      ofAccountData: ofAccountData.length,
      chatterPerformance: chatterPerformance.length
    });
    console.log('ChatterPerformance data found:', JSON.stringify(chatterPerformance, null, 2));
    
    console.log('Dashboard query:', {
      dailyReports: dailyReports.length,
      ofAccountData: ofAccountData.length,
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
    
    // Calculate metrics from daily reports (PPV sales and tips)
    const totalRevenue = dailyReports.reduce((sum, report) => {
      const ppvRevenue = report.ppvSales.reduce((ppvSum, sale) => ppvSum + sale.amount, 0);
      const tipsRevenue = report.tips.reduce((tipSum, tip) => tipSum + tip.amount, 0);
      return sum + ppvRevenue + tipsRevenue;
    }, 0);

    const totalPPVsSent = dailyReports.reduce((sum, report) => sum + (report.ppvSales?.length || 0), 0);
    
    // Add metrics from chatter performance data (only count non-null values)
    const chatterPPVsSent = chatterPerformance.reduce((sum, data) => sum + (data.ppvsSent || 0), 0);
    const chatterPPVsUnlocked = chatterPerformance.reduce((sum, data) => sum + (data.ppvsUnlocked || 0), 0);
    const chatterMessagesSent = chatterPerformance.reduce((sum, data) => sum + (data.messagesSent || 0), 0);
    const chatterFansChatted = chatterPerformance.reduce((sum, data) => sum + (data.fansChattedWith || 0), 0);
    const totalPPVsUnlocked = dailyReports.reduce((sum, report) => sum + (report.ppvSales?.length || 0), 0); // Assume sent = unlocked for now
    
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

    // Get real data from OF Account data
    const netRevenue = ofAccountData.reduce((sum, data) => sum + (data.netRevenue || 0), 0);
    const recurringRevenue = ofAccountData.reduce((sum, data) => sum + (data.recurringRevenue || 0), 0);
    
    // Total subs should be averaged (it's a snapshot, not cumulative)
    const totalSubs = ofAccountData.length > 0 
      ? Math.round(ofAccountData.reduce((sum, data) => sum + (data.totalSubs || 0), 0) / ofAccountData.length)
      : 0;
    
    // New subs and clicks are cumulative (sum them)
    const newSubs = ofAccountData.reduce((sum, data) => sum + (data.newSubs || 0), 0);
    const profileClicks = ofAccountData.reduce((sum, data) => sum + (data.profileClicks || 0), 0);

    // Combine data from all sources
    const combinedPPVsSent = totalPPVsSent + chatterPPVsSent;
    const combinedPPVsUnlocked = totalPPVsUnlocked + chatterPPVsUnlocked;
    const combinedMessagesSent = dailyReports.reduce((sum, report) => sum + (report.fansChatted || 0) * 15, 0) + chatterMessagesSent;
    const combinedFansChatted = dailyReports.reduce((sum, report) => sum + (report.fansChatted || 0), 0) + chatterFansChatted;

    const analytics = {
      totalRevenue: Math.round(totalRevenue),
      netRevenue: Math.round(netRevenue),
      recurringRevenue: Math.round(recurringRevenue),
      totalSubs: Math.round(totalSubs),
      newSubs: Math.round(newSubs),
      profileClicks: Math.round(profileClicks),
      messagesSent: combinedMessagesSent,
      ppvsSent: combinedPPVsSent,
      ppvsUnlocked: combinedPPVsUnlocked,
      fansChatted: combinedFansChatted,
      avgResponseTime: Math.round(avgResponseTime * 10) / 10,
      avgPPVPrice: combinedPPVsSent > 0 ? Math.round((totalRevenue / combinedPPVsSent) * 100) / 100 : 0,
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
      totalSubs: sumField(prevAccountData, 'totalSubs')
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

// Submit OF Account data
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
    
    autoSavePerformanceSnapshot(req.body.chatter, req.body.startDate, req.body.endDate, chatterData, messageData);
    
    res.json({ message: 'Chatter data saved successfully', data: chatterData });
  } catch (error) {
    console.error('Chatter data submission error:', error);
    res.status(500).json({ error: error.message });
  }
});

// Message upload endpoint
app.post('/api/upload/messages', checkDatabaseConnection, authenticateToken, upload.single('messages'), async (req, res) => {
  try {
    console.log('Message upload received:', req.body);
    console.log('File:', req.file);
    
    if (!req.file) {
      return res.status(400).json({ error: 'No file uploaded' });
    }
    
    const { chatter, startDate, endDate } = req.body;
    
    if (!chatter) {
      return res.status(400).json({ error: 'Chatter/employee selection is required' });
    }
    
    if (!startDate || !endDate) {
      return res.status(400).json({ error: 'Start date and end date are required' });
    }
    
    const chatterName = chatter;
    
    // Parse CSV file
    const messages = [];
    const filePath = req.file.path;
    
    await new Promise((resolve, reject) => {
      fs.createReadStream(filePath)
        .pipe(csv())
        .on('data', (row) => {
          if (row.message_text) {
            messages.push(row.message_text);
          }
        })
        .on('end', () => {
          fs.unlinkSync(filePath); // Delete uploaded file after parsing
          resolve();
        })
        .on('error', reject);
    });
    
    if (messages.length === 0) {
      return res.status(400).json({ error: 'No messages found in CSV file' });
    }
    
    console.log(`Parsed ${messages.length} messages for analysis`);
    
    // Analyze messages using AI
    const analysisResult = await analyzeMessages(messages, chatterName);
    
    // Save to MessageAnalysis collection
    const messageAnalysis = new MessageAnalysis({
      chatterName,
      weekStartDate: new Date(startDate),
      weekEndDate: new Date(endDate),
      messageCount: messages.length,
      overallScore: analysisResult.overallScore || 0,
      grammarScore: analysisResult.grammarScore || 0,
      guidelinesScore: analysisResult.guidelinesScore || 0,
      strengths: analysisResult.strengths || [],
      weaknesses: analysisResult.weaknesses || [],
      suggestions: analysisResult.suggestions || []
    });
    
    await messageAnalysis.save();
    console.log('Message analysis saved successfully:', messageAnalysis._id);
    
    res.json({ 
      message: 'Messages analyzed and saved successfully',
      analysis: {
        messageCount: messages.length,
        overallScore: messageAnalysis.overallScore,
        grammarScore: messageAnalysis.grammarScore,
        guidelinesScore: messageAnalysis.guidelinesScore
      }
    });
  } catch (error) {
    console.error('Message upload error:', error);
    res.status(500).json({ error: error.message });
  }
});

// Helper function to analyze messages using AI
async function analyzeMessages(messages, chatterName) {
  try {
    // Sample messages if there are too many (to avoid token limits)
    const sampleSize = Math.min(messages.length, 50);
    const sampledMessages = messages
      .sort(() => Math.random() - 0.5)
      .slice(0, sampleSize);
    
    const prompt = `Analyze these ${sampledMessages.length} OnlyFans chat messages from chatter "${chatterName}":

${sampledMessages.map((msg, i) => `${i + 1}. ${msg}`).join('\n')}

Provide a detailed analysis in JSON format with:
- overallScore (0-100): Overall message quality
- grammarScore (0-100): Grammar and spelling correctness
- guidelinesScore (0-100): Adherence to sales/engagement guidelines
- strengths (array): Key strengths in messaging
- weaknesses (array): Areas needing improvement
- suggestions (array): Actionable improvement recommendations

Focus on: engagement quality, sales effectiveness, professionalism, grammar, and customer service.`;
    
    const completion = await openai.chat.completions.create({
      model: 'gpt-4',
      messages: [
        {
          role: 'system',
          content: 'You are an expert OnlyFans chat quality analyst. Provide constructive, actionable feedback in valid JSON format.'
        },
        {
          role: 'user',
          content: prompt
        }
      ],
      temperature: 0.7,
      max_tokens: 1000
    });
    
    const analysisText = completion.choices[0].message.content;
    const jsonMatch = analysisText.match(/\{[\s\S]*\}/);
    
    if (!jsonMatch) {
      throw new Error('Failed to parse AI analysis response');
    }
    
    return JSON.parse(jsonMatch[0]);
  } catch (error) {
    console.error('AI analysis error:', error);
    // Return default scores if AI analysis fails
    return {
      overallScore: 50,
      grammarScore: 50,
      guidelinesScore: 50,
      strengths: ['Analysis pending'],
      weaknesses: ['Analysis pending'],
      suggestions: ['Upload more data for detailed analysis']
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

// Debug endpoint to check all data in database
app.get('/api/debug/data', checkDatabaseConnection, async (req, res) => {
  try {
    const dailyReports = await DailyChatterReport.find({});
    const accountData = await AccountData.find({});
    const chatterPerformance = await ChatterPerformance.find({});
    const creatorAccounts = await CreatorAccount.find({});
    
    res.json({
      message: 'Database data summary',
      counts: {
        dailyReports: dailyReports.length,
        accountData: accountData.length,
        chatterPerformance: chatterPerformance.length,
        creatorAccounts: creatorAccounts.length
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
      
      const totalRevenue = dailyReports.reduce((sum, report) => {
        const ppvRevenue = report.ppvSales.reduce((ppvSum, sale) => ppvSum + sale.amount, 0);
        const tipsRevenue = report.tips.reduce((tipSum, tip) => tipSum + tip.amount, 0);
        return sum + ppvRevenue + tipsRevenue;
      }, 0);

      const totalPPVsSent = dailyReports.reduce((sum, report) => sum + (report.ppvSales?.length || 0), 0);
      // Calculate avg response time only from reports that have response time data
      const dailyReportsWithResponseTime = dailyReports.filter(report => report.avgResponseTime != null && report.avgResponseTime > 0);
      const avgResponseTime = dailyReportsWithResponseTime.length > 0 
        ? dailyReportsWithResponseTime.reduce((sum, report) => sum + report.avgResponseTime, 0) / dailyReportsWithResponseTime.length 
        : 0;

      const netRevenue = ofAccountData.reduce((sum, data) => sum + (data.netRevenue || 0), 0);
      const totalSubs = ofAccountData.reduce((sum, data) => sum + (data.totalSubs || 0), 0);
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
      // Resolve chatter identifier to match how data was stored
      let nameCandidates = [String(chatterId)];
      try {
        const userDoc = await User.findById(chatterId).select('chatterName username');
        if (userDoc) {
          if (userDoc.chatterName) nameCandidates.push(userDoc.chatterName);
          if (userDoc.username) nameCandidates.push(userDoc.username);
        }
      } catch (_) {}

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

      // Also load message analysis for same chatter and date range
      let messageQuery = { chatterName: { $in: [...new Set(nameCandidates)] } };
      if (startDate && endDate) {
        messageQuery.weekStartDate = { $gte: new Date(startDate) };
        messageQuery.weekEndDate = { $lte: new Date(endDate) };
      } else {
        // approximate by using weekStartDate >= start
        const days = interval === '24h' ? 1 : interval === '7d' ? 7 : interval === '30d' ? 30 : 7;
        const start = new Date();
        start.setDate(start.getDate() - days);
        messageQuery.weekStartDate = { $gte: start };
      }
      const messagesAnalysis = await MessageAnalysis.find(messageQuery);
      
      const totalRevenue = 0; // Revenue not captured in ChatterPerformance
      const totalPPVsSent = chatterData.reduce((sum, data) => sum + (data.ppvsSent || 0), 0);
      const totalPPVsUnlocked = chatterData.reduce((sum, data) => sum + (data.ppvsUnlocked || 0), 0);
      // Calculate avg response time only from records that have response time data
      const chatterDataWithResponseTime = chatterData.filter(data => data.avgResponseTime != null && data.avgResponseTime > 0);
      const avgResponseTime = chatterDataWithResponseTime.length > 0 
        ? chatterDataWithResponseTime.reduce((sum, data) => sum + data.avgResponseTime, 0) / chatterDataWithResponseTime.length 
        : 0;

      const messagesSent = chatterData.reduce((sum, data) => sum + (data.messagesSent || 0), 0);
      const fansChatted = chatterData.reduce((sum, data) => sum + (data.fansChattedWith || 0), 0);

      // Aggregate message analysis scores (only if message data exists)
      const grammarScore = messagesAnalysis.length > 0 ? Math.round(messagesAnalysis.reduce((s,m)=> s + (m.grammarScore || 0), 0) / messagesAnalysis.length) : null;
      const guidelinesScore = messagesAnalysis.length > 0 ? Math.round(messagesAnalysis.reduce((s,m)=> s + (m.guidelinesScore || 0), 0) / messagesAnalysis.length) : null;
      const overallMessageScore = messagesAnalysis.length > 0 ? Math.round(messagesAnalysis.reduce((s,m)=> s + (m.overallScore || 0), 0) / messagesAnalysis.length) : null;
      const totalMessages = messagesAnalysis.length > 0 ? messagesAnalysis.reduce((s,m)=> s + (m.totalMessages || 0), 0) : 0;

      analyticsData = {
        totalRevenue,
        ppvsSent: totalPPVsSent,
        ppvsUnlocked: totalPPVsUnlocked,
        messagesSent,
        fansChatted,
        avgResponseTime,
        interval,
        // message analysis context
        grammarScore,
        guidelinesScore,
        overallMessageScore,
        totalMessages
      };
    } else {
      return res.status(400).json({ error: 'Invalid analysis type or missing chatterId for individual analysis' });
    }

    // Generate AI analysis using OpenAI (agency and individual)
    try {
      const aiAnalysis = await generateAIAnalysis(analyticsData, analysisType, interval);
      
      // Add raw metrics to response for UI display
      aiAnalysis.ppvsSent = analyticsData.ppvsSent;
      aiAnalysis.ppvsUnlocked = analyticsData.ppvsUnlocked;
      aiAnalysis.messagesSent = analyticsData.messagesSent;
      aiAnalysis.fansChatted = analyticsData.fansChatted;
      aiAnalysis.avgResponseTime = analyticsData.avgResponseTime;
      aiAnalysis.grammarScore = analyticsData.grammarScore;
      aiAnalysis.guidelinesScore = analyticsData.guidelinesScore;
      aiAnalysis.overallScore = analyticsData.overallMessageScore;
      
      res.json(aiAnalysis);
    } catch (aiError) {
      console.error('AI Analysis failed, falling back to basic analysis:', aiError);
      
      // Fallback to basic analysis if AI fails
      try {
        if (analysisType === 'individual') {
          const deterministic = generateDeterministicIndividualAnalysis(analyticsData, interval);
          // Add raw metrics
          deterministic.ppvsSent = analyticsData.ppvsSent;
          deterministic.ppvsUnlocked = analyticsData.ppvsUnlocked;
          deterministic.messagesSent = analyticsData.messagesSent;
          deterministic.fansChatted = analyticsData.fansChatted;
          deterministic.avgResponseTime = analyticsData.avgResponseTime;
          deterministic.grammarScore = analyticsData.grammarScore;
          deterministic.guidelinesScore = analyticsData.guidelinesScore;
          deterministic.overallScore = analyticsData.overallMessageScore;
          res.json(deterministic);
        } else {
          const fallbackAnalysis = await generateFallbackAnalysis(analyticsData, analysisType, interval);
          res.json(fallbackAnalysis);
        }
      } catch (fallbackError) {
        console.error('Fallback analysis also failed:', fallbackError);
        
        // Ultimate fallback - simple analysis without database queries
        const simpleAnalysis = {
          overallScore: analyticsData.totalRevenue > 0 ? 75 : 0,
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
    const { title, description, category, weight, examples, counterExamples } = req.body;
    const guideline = new Guideline({
      title,
      description,
      category,
      weight,
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
    const { title, description, category, weight, examples, counterExamples } = req.body;
    const guideline = await Guideline.findByIdAndUpdate(
      req.params.id,
      {
        title,
        description,
        category,
        weight,
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
    res.json({ message: 'Daily report saved successfully', report });
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

// Start server
app.listen(PORT, () => {
  console.log(`🚀 OnlyFans Agency Analytics System v2.0 running on port ${PORT}`);
  console.log(`🌐 Visit: http://localhost:${PORT}`);
  console.log(`📊 New system deployed successfully!`);
  console.log(`🔐 User authentication: ${process.env.JWT_SECRET ? 'Secure' : 'Default key'}`);
  
  // Run migrations after 2 seconds
  setTimeout(() => {
    updateCreatorNames();
  }, 2000);
});

// Deterministic analysis for individual chatter (no AI, data-only)
function generateDeterministicIndividualAnalysis(analyticsData, interval) {
  const ppvUnlockRate = analyticsData.ppvsSent > 0
    ? Math.round((analyticsData.ppvsUnlocked / analyticsData.ppvsSent) * 1000) / 10
    : 0;
  const messagesPerPPV = analyticsData.ppvsSent > 0
    ? Math.round((analyticsData.messagesSent / analyticsData.ppvsSent) * 10) / 10
    : 0;
  const messagesPerFan = analyticsData.fansChatted > 0
    ? Math.round((analyticsData.messagesSent / analyticsData.fansChatted) * 10) / 10
    : 0;

  const insights = [];
  if (analyticsData.messagesSent > 0) {
    insights.push(`Sent ${analyticsData.messagesSent.toLocaleString()} messages this ${interval} period`);
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

  const overallScore = Math.max(0, Math.min(100,
    (ppvUnlockRate >= 50 ? 35 : ppvUnlockRate >= 40 ? 25 : 15) +
    ((analyticsData.avgResponseTime || 0) <= 2 ? 35 : (analyticsData.avgResponseTime || 0) <= 3 ? 25 : 10) +
    (messagesPerFan >= 6 ? 30 : messagesPerFan >= 5 ? 20 : 10)
  ));

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
    interval
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
    
    // Calculate overall agency score
    let overallScore = 0;
    if (analyticsData.totalRevenue > 0) overallScore += 30;
    if (ppvUnlockRate > 50) overallScore += 25;
    if (avgPPVPrice > 30) overallScore += 25;
    if (avgMessageScore > 70) overallScore += 20;
    
    return {
      overallScore,
      insights: [
        `Total revenue: $${analyticsData.totalRevenue.toLocaleString()} this ${interval} period`,
        `PPV unlock rate: ${ppvUnlockRate.toFixed(1)}%`,
        `Average PPV price: $${avgPPVPrice.toFixed(2)}`,
        `Average message score: ${avgMessageScore.toFixed(1)}/100`
      ],
      weakPoints: [
        ppvUnlockRate < 50 ? `PPV unlock rate (${ppvUnlockRate.toFixed(1)}%) is below target (50%+)` : null,
        avgPPVPrice < 30 ? `Average PPV price ($${avgPPVPrice.toFixed(2)}) is below target ($30+)` : null,
        avgMessageScore < 70 ? `Average message score (${avgMessageScore.toFixed(1)}) needs improvement (70+ target)` : null
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
    
    let overallScore = 0;
    if (analyticsData.totalRevenue > 0) overallScore += 25;
    if (ppvUnlockRate > 50) overallScore += 25;
    if (analyticsData.avgResponseTime < 3) overallScore += 25;
    if (revenuePerPPV > 30) overallScore += 25;
    
    return {
      overallScore,
      strengths: [
        `Generated $${analyticsData.totalRevenue.toLocaleString()} in revenue this ${interval} period`,
        `Active engagement with ${analyticsData.messagesSent} messages sent`,
        ppvUnlockRate > 60 ? `Excellent PPV unlock rate of ${ppvUnlockRate.toFixed(1)}%` : `Good PPV unlock rate of ${ppvUnlockRate.toFixed(1)}%`
      ],
      weaknesses: [
        analyticsData.avgResponseTime > 4 ? `Slow response time of ${analyticsData.avgResponseTime.toFixed(1)} minutes (target: <3 minutes)` : null,
        ppvUnlockRate < 40 ? `Low PPV unlock rate of ${ppvUnlockRate.toFixed(1)}% (target: 50-60%)` : null,
        revenuePerPPV < 25 ? `Low revenue per PPV of $${revenuePerPPV.toFixed(2)} (target: $30-50)` : null
      ].filter(Boolean),
      opportunities: [
        `Improving PPV unlock rate could increase revenue`,
        `Reducing response time could increase conversions`
      ],
      recommendations: [
        'Focus on faster response times - aim for under 2 minutes',
        'Improve PPV content quality and pricing strategy',
        'Test higher PPV prices to increase revenue per sale'
      ]
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
async function generateAIAnalysis(analyticsData, analysisType, interval) {
  try {
    if (!process.env.OPENAI_API_KEY) {
      throw new Error('OpenAI API key not configured');
    }

    const openai = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY,
    });

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

DERIVED METRICS (you must compute and mention):
- PPV Unlock Rate (%): ${analyticsData.ppvsSent > 0 ? ((analyticsData.ppvsUnlocked/analyticsData.ppvsSent)*100).toFixed(1) : 0}
- Messages per PPV: ${analyticsData.ppvsSent > 0 ? (analyticsData.messagesSent/analyticsData.ppvsSent).toFixed(1) : 0}
- Messages per Fan: ${analyticsData.fansChatted > 0 ? (analyticsData.messagesSent/analyticsData.fansChatted).toFixed(1) : 0}
- Revenue per PPV: $${analyticsData.ppvsSent > 0 ? ((analyticsData.netSales || 0)/analyticsData.ppvsSent).toFixed(2) : 0}
- Revenue per Message: $${analyticsData.messagesSent > 0 ? ((analyticsData.netSales || 0)/analyticsData.messagesSent).toFixed(2) : 0}
- Response Efficiency: ${analyticsData.avgResponseTime > 0 ? (analyticsData.avgResponseTime <= 3 ? 'Fast' : analyticsData.avgResponseTime <= 5 ? 'Moderate' : 'Slow') : 'Unknown'}

BENCHMARKS (use these for justification and cite them explicitly):
- Response Time: <3 minutes = Excellent, 3-5 minutes = Good, >5 minutes = Needs Improvement
- PPV Unlock Rate: 32% = Current average, 50%+ = Target objective, higher is better
- Messages per Fan: 6-8 = Optimal range, <5 = Under-engaging, >10 = Over-messaging
- Revenue per PPV: $25-50 = Good range, <$20 = Underpricing, >$60 = May be overpricing
- Message Quality: 70+ = Good, 80+ = Excellent, <60 = Needs improvement
- Grammar: Informal OnlyFans style is expected (u/you, whats up dude, etc.). Score should be as high as possible while accounting for informal chatting norms.
- Guidelines: Avoid major violations. Score should be as high as possible.
- Messages per PPV & Messages per Fan: Use as data points in combination with other metrics to identify patterns (e.g., higher message-to-PPV ratio + higher sales = more time in selling phase is effective).
- Overall Quality: Use as data point for pattern analysis.

ANALYSIS AREAS (analyze ALL of these, not just PPVs):
1. RESPONSE TIME ANALYSIS: How does response time affect performance and what can be improved?
2. MESSAGE QUALITY ANALYSIS: How do grammar/guidelines scores impact results?
3. MESSAGE FREQUENCY ANALYSIS: Is the chatter over-messaging or under-messaging fans?
4. REVENUE EFFICIENCY ANALYSIS: How effective is the chatter at generating revenue per interaction?
5. PPV PERFORMANCE ANALYSIS: How well are PPVs performing and what can be optimized?
6. FAN ENGAGEMENT ANALYSIS: How well is the chatter engaging with fans?

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

IMPORTANT: Do NOT make assumptions about missing data. If a metric is null/undefined (like response time or message quality scores), do not assume it's 0 or bad - simply don't mention it in your analysis. Only analyze metrics that have actual data.

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
      "messagesPerPPV": "Calculate messages sent divided by PPVs sent with analysis",
      "responseEfficiency": "Calculate response time vs unlock rate correlation with analysis", 
      "messageQualityImpact": "Calculate message quality score vs performance correlation with analysis"
    },
    "behavioralPatterns": {
      "responseTimePatterns": "Analyze response time data and its impact on performance",
      "messageFrequencyPatterns": "Analyze message sending patterns and effectiveness", 
      "ppvTimingPatterns": "Analyze PPV sending patterns and unlock rates"
    },
    "competitiveAnalysis": {
      "benchmarkGaps": "specific gaps with quantified impact",
      "strengthAreas": "areas exceeding benchmarks with business value",
      "improvementPotential": "specific improvement opportunities with projections"
    }
  },
  "strategicInsights": {
    "revenueOptimization": {
      "leakagePoints": ["specific revenue loss with quantification", "specific revenue loss with quantification"],
      "growthOpportunities": ["opportunity 1 with projected impact", "opportunity 2 with projected impact"],
      "efficiencyGains": ["efficiency gain 1 with calculation", "efficiency gain 2 with calculation"]
    },
    "performanceDrivers": {
      "primaryDrivers": ["driver 1 with impact analysis", "driver 2 with impact analysis"],
      "limitingFactors": ["factor 1 with solution", "factor 2 with solution"],
      "leveragePoints": ["leverage point 1 with expected outcome", "leverage point 2 with expected outcome"]
    },
    "riskAssessment": {
      "performanceRisks": ["risk 1 with mitigation strategy", "risk 2 with mitigation strategy"],
      "trendAnalysis": "trend analysis with future projections",
      "interventionNeeds": ["intervention 1 with urgency", "intervention 2 with urgency"]
    }
  },
  "actionPlan": {
    "immediateActions": ["action 1 with expected outcome and timeline", "action 2 with expected outcome and timeline"],
    "strategicInitiatives": ["initiative 1 with projected impact", "initiative 2 with projected impact"],
    "successMetrics": ["metric 1 with target and timeline", "metric 2 with target and timeline"],
    "roiProjections": {
      "currentState": "current performance with revenue impact",
      "optimizedState": "projected performance with revenue impact",
      "improvementValue": "quantified improvement with timeline"
    }
  }
}

Rules:
- Use only the provided metrics and the derived metrics above.
- NEVER simply state "PPV unlock rate is X%" - instead explain what this means and why it matters.
- Focus on WHY performance is at current levels, not just WHAT the numbers are.
- Cross-reference metrics to find hidden patterns, but only use metrics that have actual data (e.g., if grammarScore is null, don't mention it).
- Quote actual numbers in every point but explain their implications.
- Do not mention metrics that were not provided (e.g., revenue, subscribers, clicks).
- Keep it concise and actionable.
- NO DUPLICATION ACROSS SECTIONS: Each list (insights, weakPoints, rootCauses, opportunities, roiCalculations, recommendations) must contain unique points. If a concept appears in insights, do not repeat the same statement in weakPoints; instead, evolve it (e.g., add cause, action, or impact).
- ACTION-ORIENTED: For weakPoints/opportunities/recommendations, include a concrete action and expected impact tied to the benchmarks (e.g., "Reduce avg response from 9m to <5m to align with benchmark; expect unlocks to improve if message quality is maintained").`;
    }

    const completion = await openai.chat.completions.create({
      model: "gpt-4",
      messages: [
        {
          role: "system",
          content: "You are an expert OnlyFans agency analyst. Provide detailed, data-driven analysis in JSON format. Be specific with numbers and actionable insights."
        },
        {
          role: "user",
          content: prompt
        }
      ],
      temperature: 0.3,
      max_tokens: 2000
    });

    const aiResponse = completion.choices[0].message.content;
    console.log('AI Response:', aiResponse);
    
    try {
      const analysis = JSON.parse(aiResponse);
      console.log('Parsed AI Analysis:', JSON.stringify(analysis, null, 2));
      
      console.log('Raw AI Analysis:', JSON.stringify(analysis, null, 2));
      return analysis;
    } catch (parseError) {
      console.error('Failed to parse AI response:', aiResponse);
      throw new Error('AI response format error');
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
    const targetMessageToSale = teamAvgMessageToSale * 0.8; // Conservative 80% of team average
    
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
