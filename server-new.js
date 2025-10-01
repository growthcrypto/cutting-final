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
const PORT = process.env.PORT || 5000;

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

    // Get data from all sources with proper date filtering
    const dailyReports = await DailyChatterReport.find(dateQuery);
    const ofAccountData = await AccountData.find(dateQuery);
    
    // Get chatter performance data with proper date range matching
    let chatterPerformanceQuery = {};
    if (startDate && endDate) {
      // Find records that overlap with the requested date range
      chatterPerformanceQuery = {
        $or: [
          { weekStartDate: { $lte: new Date(endDate) }, weekEndDate: { $gte: new Date(startDate) } },
          { weekStartDate: { $gte: new Date(startDate), $lte: new Date(endDate) } },
          { weekEndDate: { $gte: new Date(startDate), $lte: new Date(endDate) } }
        ]
      };
    } else {
      const days = interval === '24h' ? 1 : interval === '7d' ? 7 : interval === '30d' ? 30 : 7;
      const end = new Date();
      const start = new Date();
      start.setDate(start.getDate() - days);
      
      // For now, query last 30 days of data to catch any uploads
      const wideStart = new Date();
      wideStart.setDate(wideStart.getDate() - 30);
      
      chatterPerformanceQuery = { 
        $or: [
          { weekStartDate: { $lte: end }, weekEndDate: { $gte: wideStart } },
          { weekStartDate: { $gte: wideStart, $lte: end } },
          { weekEndDate: { $gte: wideStart, $lte: end } }
        ]
      };
      console.log('Dashboard querying ChatterPerformance with dates:', { start: wideStart, end, interval });
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
    
    // Add metrics from chatter performance data
    const chatterPPVsSent = chatterPerformance.reduce((sum, data) => sum + (data.ppvsSent || 0), 0);
    const chatterPPVsUnlocked = chatterPerformance.reduce((sum, data) => sum + (data.ppvsUnlocked || 0), 0);
    const chatterMessagesSent = chatterPerformance.reduce((sum, data) => sum + (data.messagesSent || 0), 0);
    const chatterFansChatted = chatterPerformance.reduce((sum, data) => sum + (data.fansChattedWith || 0), 0);
    const totalPPVsUnlocked = dailyReports.reduce((sum, report) => sum + (report.ppvSales?.length || 0), 0); // Assume sent = unlocked for now
    
    // Calculate response time from both sources
    const dailyReportsResponseTime = dailyReports.length > 0 
      ? dailyReports.reduce((sum, report) => sum + (report.avgResponseTime || 0), 0) / dailyReports.length 
      : 0;
    
    const chatterPerformanceResponseTime = chatterPerformance.length > 0
      ? chatterPerformance.reduce((sum, data) => sum + (data.avgResponseTime || 0), 0) / chatterPerformance.length
      : 0;
    
    // Use response time from either source, preferring daily reports if available
    const avgResponseTime = dailyReportsResponseTime > 0 ? dailyReportsResponseTime : chatterPerformanceResponseTime;

    // Get real data from OF Account data
    const netRevenue = ofAccountData.reduce((sum, data) => sum + (data.netRevenue || 0), 0);
    const recurringRevenue = ofAccountData.reduce((sum, data) => sum + (data.recurringRevenue || 0), 0);
    const totalSubs = ofAccountData.reduce((sum, data) => sum + (data.totalSubs || 0), 0);
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
    const accountData = new AccountData({
      ...req.body,
      submittedBy: req.user.id,
      submittedAt: new Date()
    });
    
    await accountData.save();
    res.json({ message: 'OF Account data saved successfully', data: accountData });
  } catch (error) {
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
    
    const chatterData = new ChatterPerformance({
      chatterName: req.body.chatter,
      creatorAccount: creatorAccount._id,
      weekStartDate: new Date(req.body.startDate),
      weekEndDate: new Date(req.body.endDate),
      messagesSent: req.body.messagesSent || 0,
      ppvsSent: req.body.ppvsSent || 0,
      ppvsUnlocked: req.body.ppvsUnlocked || 0,
      fansChattedWith: req.body.fansChatted || 0,
      avgResponseTime: req.body.avgResponseTime || 0
    });
    
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
      const avgResponseTime = dailyReports.length > 0 
        ? dailyReports.reduce((sum, report) => sum + (report.avgResponseTime || 0), 0) / dailyReports.length 
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
      const avgResponseTime = chatterData.length > 0 
        ? chatterData.reduce((sum, data) => sum + (data.avgResponseTime || 0), 0) / chatterData.length 
        : 0;

      const messagesSent = chatterData.reduce((sum, data) => sum + (data.messagesSent || 0), 0);
      const fansChatted = chatterData.reduce((sum, data) => sum + (data.fansChattedWith || 0), 0);

      // Aggregate message analysis scores
      const grammarScore = messagesAnalysis.length > 0 ? Math.round(messagesAnalysis.reduce((s,m)=> s + (m.grammarScore || 0), 0) / messagesAnalysis.length) : 0;
      const guidelinesScore = messagesAnalysis.length > 0 ? Math.round(messagesAnalysis.reduce((s,m)=> s + (m.guidelinesScore || 0), 0) / messagesAnalysis.length) : 0;
      const overallMessageScore = messagesAnalysis.length > 0 ? Math.round(messagesAnalysis.reduce((s,m)=> s + (m.overallScore || 0), 0) / messagesAnalysis.length) : 0;
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
            `Improving response time could increase conversions by 15-20%`
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
          grammarScore: analyticsData.grammarScore || 0,
          guidelinesScore: analyticsData.guidelinesScore || 0
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

// Start server
app.listen(PORT, () => {
  console.log(`🚀 OnlyFans Agency Analytics System v2.0 running on port ${PORT}`);
  console.log(`🌐 Visit: http://localhost:${PORT}`);
  console.log(`📊 New system deployed successfully!`);
  console.log(`🔐 User authentication: ${process.env.JWT_SECRET ? 'Secure' : 'Default key'}`);
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
        `Improving PPV unlock rate to 60% could increase revenue by $${Math.round(analyticsData.totalRevenue * 0.2)}`,
        `Increasing average PPV price to $35 could increase revenue by $${Math.round(analyticsData.totalRevenue * 0.15)}`,
        `Improving message scores to 80+ could increase conversions by 15-20%`
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
        `Improving PPV unlock rate to 50% could increase revenue by ${Math.round(analyticsData.totalRevenue * 0.25)}`,
        `Reducing response time to 2 minutes could increase conversions by 20%`
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

DERIVED METRICS (you must compute and mention):
- PPV Unlock Rate (%): ${analyticsData.ppvsSent > 0 ? ((analyticsData.ppvsUnlocked/analyticsData.ppvsSent)*100).toFixed(1) : 0}
- Messages per PPV: ${analyticsData.ppvsSent > 0 ? (analyticsData.messagesSent/analyticsData.ppvsSent).toFixed(1) : 0}
- Messages per Fan: ${analyticsData.fansChatted > 0 ? (analyticsData.messagesSent/analyticsData.fansChatted).toFixed(1) : 0}

BENCHMARKS (use these for justification and cite them explicitly):
- Response Time: <5 minutes = Acceptable, ≥5 minutes = Needs Improvement
- PPV Unlock Rate: 32% = Current average, 50%+ = Target objective, higher is better
- Grammar: Informal OnlyFans style is expected (u/you, whats up dude, etc.). Score should be as high as possible while accounting for informal chatting norms.
- Guidelines: Avoid major violations. Score should be as high as possible.
- Messages per PPV & Messages per Fan: Use as data points in combination with other metrics to identify patterns (e.g., higher message-to-PPV ratio + higher sales = more time in selling phase is effective).
- Overall Quality: Use as data point for pattern analysis.

ADVANCED ANALYSIS REQUIREMENTS:
1. PERFORM DEEP CROSS-REFERENCE ANALYSIS: Connect every metric to reveal hidden patterns and causal relationships
2. PROVIDE CAUSAL INSIGHTS: Explain WHY performance is what it is, not just WHAT it is
3. INCLUDE PREDICTIVE ANALYSIS: What will happen if current trends continue?
4. CALCULATE SPECIFIC IMPACT: Quantify potential revenue/performance improvements with specific numbers
5. IDENTIFY LEVERAGE POINTS: Which small changes will have the biggest impact?
6. PROVIDE STRATEGIC CONTEXT: How does this performance affect overall business goals?

ADVANCED ANALYSIS FRAMEWORK:
- Efficiency Ratios: Calculate message-to-revenue, time-to-conversion, engagement velocity ratios
- Behavioral Patterns: Identify response time patterns, engagement cycles, conversion triggers
- Competitive Positioning: Compare against benchmarks with specific gap analysis and quantified impact
- Revenue Optimization: Identify specific revenue leakage points and opportunities with projections
- Risk Assessment: Highlight performance risks and their business impact
- Growth Projections: Calculate potential performance improvements with specific actions and timelines

CRITICAL: Do NOT simply repeat the uploaded numbers. The user already knows these. Instead, provide sophisticated analysis that goes beyond the raw data with deep insights, predictions, and strategic recommendations.

Respond in STRICT JSON with this exact shape:
{
  "executiveSummary": {
    "performanceGrade": "string with detailed justification",
    "revenueImpact": "string with specific revenue analysis and projections",
    "criticalFindings": ["finding 1 with business impact", "finding 2 with business impact", "finding 3 with business impact"]
  },
  "advancedMetrics": {
    "efficiencyRatios": {
      "messagesPerDollar": "calculated ratio with analysis",
      "timeToConversion": "calculated metric with benchmark comparison",
      "engagementVelocity": "calculated metric with trend analysis"
    },
    "behavioralPatterns": {
      "responseTimeDistribution": "pattern analysis with implications",
      "conversionTriggers": "identified triggers with success rates",
      "engagementCycles": "pattern analysis with optimization opportunities"
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
- Cross-reference metrics to find hidden patterns (e.g., "Response time of ${analyticsData.avgResponseTime} minutes combined with ${analyticsData.grammarScore}/100 grammar score suggests rushed, low-quality interactions").
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
    
    try {
      const analysis = JSON.parse(aiResponse);
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

    // Analyze revenue patterns and ROI opportunities
    if (totalRevenue > 0) {
      const revenuePerPPV = totalPPVs > 0 ? totalRevenue / totalPPVs : 0;
      
      if (revenuePerPPV < 35) {
        recommendations.push({
          description: `Average PPV value is $${revenuePerPPV.toFixed(2)}. Industry leaders achieve $45-65 per PPV. Testing premium content could increase revenue by 40-60%.`,
          expectedImpact: `Potential $${Math.round((45 - revenuePerPPV) * totalPPVs)} monthly increase`,
          category: 'pricing_optimization',
          priority: 'high',
          roiCalculation: `ROI: ${Math.round(((45 - revenuePerPPV) * totalPPVs * 12) / 800 * 100)}% annually for $800 content investment`
        });
      }
    }

    // Response time analysis with specific ROI
    if (avgResponseTime > 3) {
      const potentialIncrease = Math.round(totalRevenue * 0.18); // 18% increase for sub-2min responses
      recommendations.push({
        description: `Response time averaging ${avgResponseTime.toFixed(1)} minutes. Reducing to under 2 minutes increases conversion rates by 18-25%.`,
        expectedImpact: `$${potentialIncrease} monthly revenue increase`,
        category: 'efficiency',
        priority: 'high',
        roiCalculation: `ROI: ${Math.round(potentialIncrease * 12 / 400 * 100)}% annually for $400 training program`
      });
    }

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
        const potentialWeekendGain = Math.round((weekdayAvg - weekendAvg) * 8.5); // 8.5 weekends per month
        recommendations.push({
          description: `Weekend performance is ${Math.round((1 - weekendAvg/weekdayAvg) * 100)}% below weekday average. Weekend optimization could recover significant revenue.`,
          expectedImpact: `$${potentialWeekendGain} monthly recovery potential`,
          category: 'scheduling',
          priority: 'medium',
          roiCalculation: `ROI: ${Math.round(potentialWeekendGain * 12 / 1200 * 100)}% annually for $1,200 weekend staffing`
        });
      }
    }

    // Chatter performance variance
    const chatterPerformance = {};
    dailyReports.forEach(report => {
      if (report.chatterId) {
        if (!chatterPerformance[report.chatterId]) {
          chatterPerformance[report.chatterId] = { revenue: 0, responseTime: 0, count: 0 };
        }
        const revenue = report.ppvSales.reduce((s, sale) => s + sale.amount, 0) + report.tips.reduce((s, tip) => s + tip.amount, 0);
        chatterPerformance[report.chatterId].revenue += revenue;
        chatterPerformance[report.chatterId].responseTime += report.avgResponseTime || 0;
        chatterPerformance[report.chatterId].count++;
      }
    });

    const performanceValues = Object.values(chatterPerformance).map(p => p.revenue / p.count);
    if (performanceValues.length > 1) {
      const maxPerf = Math.max(...performanceValues);
      const minPerf = Math.min(...performanceValues);
      
      if (maxPerf > minPerf * 1.5) { // Top performer is 50%+ better
        const performanceGap = Math.round((maxPerf - minPerf) * dailyReports.length / performanceValues.length);
        recommendations.push({
          description: `Performance variance detected: Top chatter generates ${Math.round((maxPerf/minPerf - 1) * 100)}% more revenue. Training programs could level up all chatters.`,
          expectedImpact: `$${performanceGap} monthly potential if all reach top performance`,
          category: 'training',
          priority: 'medium',
          roiCalculation: `ROI: ${Math.round(performanceGap * 12 / 600 * 100)}% annually for $600 comprehensive training`
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
      grammarScore: messageData?.grammarScore || 0,
      guidelinesScore: messageData?.guidelinesScore || 0,
      overallScore: messageData?.overallScore || 0
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

// Handle errors
process.on('uncaughtException', (err) => {
  console.error('Uncaught Exception:', err);
});

process.on('unhandledRejection', (err) => {
  console.error('Unhandled Rejection:', err);
});
