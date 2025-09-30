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
    const chatterPerformance = await ChatterPerformance.find(chatterPerformanceQuery);
    
    console.log('Dashboard data query results:', {
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
    
    // Use 0 if no response time data available
    // TODO: Add response time field to ChatterPerformance schema if needed
    const avgResponseTime = dailyReportsResponseTime > 0 ? dailyReportsResponseTime : 0;

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
      conversionRate: combinedFansChatted > 0 ? Math.round((combinedPPVsUnlocked / combinedFansChatted) * 100) : 0
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
      fansChattedWith: req.body.fansChatted || 0
    });
    
    await chatterData.save();
    console.log('Chatter data saved successfully:', chatterData._id);
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
          fansChattedWith: c.fansChattedWith
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
      const dailyReports = await DailyChatterReport.find({ ...dateQuery, chatterId });
      
      const totalRevenue = dailyReports.reduce((sum, report) => {
        const ppvRevenue = report.ppvSales.reduce((ppvSum, sale) => ppvSum + sale.amount, 0);
        const tipsRevenue = report.tips.reduce((tipSum, tip) => tipSum + tip.amount, 0);
        return sum + ppvRevenue + tipsRevenue;
      }, 0);

      const totalPPVsSent = dailyReports.reduce((sum, report) => sum + (report.ppvSales?.length || 0), 0);
      const avgResponseTime = dailyReports.length > 0 
        ? dailyReports.reduce((sum, report) => sum + (report.avgResponseTime || 0), 0) / dailyReports.length 
        : 0;

      const messagesSent = dailyReports.reduce((sum, report) => sum + (report.fansChatted || 0) * 15, 0);

      analyticsData = {
        totalRevenue,
        ppvsSent: totalPPVsSent,
        messagesSent,
        avgResponseTime,
        interval
      };
    } else {
      return res.status(400).json({ error: 'Invalid analysis type or missing chatterId for individual analysis' });
    }

    // Generate AI analysis using OpenAI
    try {
      const aiAnalysis = await generateAIAnalysis(analyticsData, analysisType, interval);
      res.json(aiAnalysis);
    } catch (aiError) {
      console.error('AI Analysis failed, falling back to basic analysis:', aiError);
      
      // Fallback to basic analysis if AI fails
      try {
        const fallbackAnalysis = await generateFallbackAnalysis(analyticsData, analysisType, interval);
        res.json(fallbackAnalysis);
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
          ]
        };
        res.json(simpleAnalysis);
      }
    }
  } catch (error) {
    console.error('AI Analysis Error:', error);
    res.status(500).json({ error: error.message });
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
      prompt = `You are an expert OnlyFans chatter performance analyst. Analyze the following individual chatter performance data for the ${interval} period:

CHATTER DATA:
- Total Revenue: $${analyticsData.totalRevenue}
- PPVs Sent: ${analyticsData.ppvsSent}
- Messages Sent: ${analyticsData.messagesSent}
- Average Response Time: ${analyticsData.avgResponseTime} minutes

Please provide a detailed analysis in JSON format with the following structure:
{
  "overallScore": [0-100],
  "strengths": ["strength1", "strength2"],
  "weaknesses": ["weakness1", "weakness2"],
  "opportunities": ["opportunity1", "opportunity2"],
  "recommendations": ["recommendation1", "recommendation2"]
}

Focus on:
1. Individual performance strengths and weaknesses
2. Specific improvement opportunities
3. Actionable recommendations for this chatter
4. Performance metrics analysis

Be specific with numbers and percentages. Don't make up data that isn't provided.`;
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

// Handle errors
process.on('uncaughtException', (err) => {
  console.error('Uncaught Exception:', err);
});

process.on('unhandledRejection', (err) => {
  console.error('Unhandled Rejection:', err);
});
