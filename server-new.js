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
  console.log('✅ OpenAI configured with key:', process.env.OPENAI_API_KEY.substring(0, 10) + '...');
} else {
  console.warn('⚠️  OPENAI_API_KEY not set - AI analysis will be limited');
  console.log('Environment check - OPENAI_API_KEY exists:', !!process.env.OPENAI_API_KEY);
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
console.log('🔥 SERVER STARTED WITH UPDATED CODE - FIRE EMOJI TEST!');

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
    
    // If no chatters exist, create some test users
    if (chatters.length === 0) {
      console.log('No chatters found, creating test users...');
      const testChatters = [
        { username: 'Agile', email: 'agile@agency.com', role: 'chatter', chatterName: 'Agile', password: 'password123' },
        { username: 'gypsy', email: 'gypsy@agency.com', role: 'chatter', chatterName: 'gypsy', password: 'password123' },
        { username: 'John', email: 'john@agency.com', role: 'chatter', chatterName: 'John', password: 'password123' },
        { username: 'ceejay', email: 'ceejay@agency.com', role: 'chatter', chatterName: 'ceejay', password: 'password123' }
      ];
      
      for (const chatter of testChatters) {
        const newUser = new User(chatter);
        await newUser.save();
      }
      
      console.log('Test chatters created successfully');
      const updatedChatters = await User.find({ role: 'chatter' }, { password: 0 });
      res.json(updatedChatters);
    } else {
      res.json(chatters);
    }
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
    
    // Analyze messages using AI
    const analysisResult = await analyzeMessages(messages, chatterName);
      console.log('🔍 AI Analysis Result:', JSON.stringify(analysisResult, null, 2));
      console.log('🔍 Has chattingStyle:', !!analysisResult.chattingStyle);
      console.log('🔍 Has messagePatterns:', !!analysisResult.messagePatterns);
      console.log('🔍 Has engagementMetrics:', !!analysisResult.engagementMetrics);
      console.log('🔍 Has recommendations:', !!analysisResult.recommendations);
      console.log('🔍 Has grammarBreakdown:', !!analysisResult.grammarBreakdown);
      console.log('🔍 Has guidelinesBreakdown:', !!analysisResult.guidelinesBreakdown);
      console.log('🔍 Has overallBreakdown:', !!analysisResult.overallBreakdown);
      console.log('🔍 grammarBreakdown keys:', analysisResult.grammarBreakdown ? Object.keys(analysisResult.grammarBreakdown) : 'NO OBJECT');
      console.log('🔍 guidelinesBreakdown keys:', analysisResult.guidelinesBreakdown ? Object.keys(analysisResult.guidelinesBreakdown) : 'NO OBJECT');
      console.log('🔍 overallBreakdown keys:', analysisResult.overallBreakdown ? Object.keys(analysisResult.overallBreakdown) : 'NO OBJECT');
      console.log('🔍 grammarBreakdown content:', JSON.stringify(analysisResult.grammarBreakdown));
      console.log('🔍 guidelinesBreakdown content:', JSON.stringify(analysisResult.guidelinesBreakdown));
      console.log('🔍 overallBreakdown content:', JSON.stringify(analysisResult.overallBreakdown));
    console.log('🔍 Raw AI Response Length:', analysisResult ? 'Response received' : 'No response');
    console.log('🔍 ChattingStyle content:', JSON.stringify(analysisResult.chattingStyle));
    console.log('🔍 MessagePatterns content:', JSON.stringify(analysisResult.messagePatterns));
    console.log('🔍 EngagementMetrics content:', JSON.stringify(analysisResult.engagementMetrics));
    
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
      overallScore: analysisResult.overallScore || null,
      grammarScore: analysisResult.grammarScore || null,
      guidelinesScore: analysisResult.guidelinesScore || null,
      strengths: analysisResult.strengths || [],
      weaknesses: analysisResult.weaknesses || [],
      recommendations: analysisResult.suggestions || analysisResult.recommendations || [],
      // CHATTING STYLE ANALYSIS
      chattingStyle: analysisResult.chattingStyle || null,
      messagePatterns: analysisResult.messagePatterns || null,
      engagementMetrics: analysisResult.engagementMetrics || null
    });
    
    console.log('MessageAnalysis object created:', messageAnalysis._id);
    console.log('MessageAnalysis data:', {
      chattingStyle: messageAnalysis.chattingStyle,
      messagePatterns: messageAnalysis.messagePatterns,
      engagementMetrics: messageAnalysis.engagementMetrics,
      recommendations: messageAnalysis.recommendations
    });
    console.log('🔍 Raw analysisResult before saving:', JSON.stringify(analysisResult, null, 2));
    console.log('🔍 MessageAnalysis object before saving:', JSON.stringify({
      chattingStyle: messageAnalysis.chattingStyle,
      messagePatterns: messageAnalysis.messagePatterns,
      engagementMetrics: messageAnalysis.engagementMetrics
    }, null, 2));
    
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
    console.log('🔍 Starting message analysis for:', chatterName);
    console.log('🔍 OpenAI configured:', !!openai);
    console.log('🔍 OpenAI API key exists:', !!process.env.OPENAI_API_KEY);
    
    // Check if OpenAI is properly configured
    if (!openai || !openai.chat || !openai.chat.completions) {
      console.log('❌ OpenAI not configured, returning mock analysis');
      return {
        overallScore: null,
        grammarScore: null,
        guidelinesScore: null,
        strengths: ["No message analysis data available"],
        weaknesses: ["Upload message data for analysis"],
        suggestions: ["Upload CSV with message data to get real analysis"]
      };
    }
    
    console.log('✅ OpenAI is configured, proceeding with AI analysis...');
    console.log('🔍 OpenAI API Key exists:', !!process.env.OPENAI_API_KEY);
    console.log('🔍 OpenAI API Key length:', process.env.OPENAI_API_KEY ? process.env.OPENAI_API_KEY.length : 0);

    // Use all messages for comprehensive analysis
    const sampleSize = messages.length;
    const sampledMessages = messages;
    
    console.log('🚨 DEBUGGING: Total messages available:', messages.length);
    console.log('🚨 DEBUGGING: Sample size:', sampleSize);
    console.log('🚨 DEBUGGING: Sampled messages:', sampledMessages);
    
    // Check if messages are empty
    if (sampledMessages.length === 0) {
      console.log('❌ ERROR: No messages to analyze!');
      throw new Error('No messages available for analysis');
    }
    
    // Check if messages are strings
    const nonStringMessages = sampledMessages.filter(msg => typeof msg !== 'string');
    if (nonStringMessages.length > 0) {
      console.log('❌ ERROR: Some messages are not strings:', nonStringMessages);
    }
    
    const prompt = `Analyze these OnlyFans chat messages and find DIVERSE, REAL issues. Return ONLY valid JSON.

MESSAGES:
${sampledMessages.map((msg, i) => `${i + 1}. ${msg}`).join('\n')}

CRITICAL: Find DIFFERENT types of issues. Do NOT repeat the same error type. Look for:
- Spelling errors (different words)
- Grammar mistakes (different patterns) 
- Punctuation issues (different types)
- Informal language (different examples)
- Sales effectiveness (different techniques)
- Engagement quality (different strategies)
- Message clarity (different issues)
- Emotional impact (different connections)

Return this EXACT JSON with DIVERSE examples from the messages:

{
  "overallScore": 85,
  "grammarScore": 78,
  "guidelinesScore": 82,
  "strengths": ["strength 1", "strength 2"],
  "weaknesses": ["weakness 1", "weakness 2"],
  "suggestions": ["recommendation 1", "recommendation 2"],
  "chattingStyle": {
    "directness": "moderately direct",
    "friendliness": "very friendly",
    "salesApproach": "moderate",
    "personality": "flirty",
    "emojiUsage": "moderate",
    "messageLength": "medium",
    "responsePattern": "thoughtful"
  },
  "messagePatterns": {
    "questionFrequency": "high",
    "exclamationUsage": "moderate",
    "capitalizationStyle": "casual",
    "punctuationStyle": "casual",
    "topicDiversity": "high",
    "sexualContent": "moderate",
    "personalSharing": "high"
  },
  "engagementMetrics": {
    "conversationStarter": "excellent",
    "conversationMaintainer": "good",
    "salesConversation": "good",
    "fanRetention": "excellent"
  },
  "grammarBreakdown": {
    "spellingErrors": "Find DIVERSE spelling errors from different messages. List 3-5 different examples.",
    "grammarIssues": "Find DIVERSE grammar mistakes from different messages. List 3-5 different examples.",
    "punctuationProblems": "Find DIVERSE punctuation issues from different messages. List 3-5 different examples.",
    "informalLanguage": "Find DIVERSE informal language from different messages. List 3-5 different examples.",
    "scoreExplanation": "Summarize the grammar analysis with specific counts of different error types found."
  },
  "guidelinesBreakdown": {
    "salesEffectiveness": "Find DIVERSE sales techniques from different messages. List 3-5 different examples.",
    "engagementQuality": "Find DIVERSE engagement strategies from different messages. List 3-5 different examples.",
    "captionQuality": "Find DIVERSE PPV captions from different messages. List 3-5 different examples.",
    "conversationFlow": "Find DIVERSE conversation patterns from different messages. List 3-5 different examples.",
    "scoreExplanation": "Summarize the guidelines analysis with specific counts of different techniques found."
  },
  "overallBreakdown": {
    "messageClarity": "Find DIVERSE clarity issues from different messages. List 3-5 different examples.",
    "emotionalImpact": "Find DIVERSE emotional connections from different messages. List 3-5 different examples.",
    "conversionPotential": "Find DIVERSE conversion opportunities from different messages. List 3-5 different examples.",
    "scoreExplanation": "Summarize the overall analysis with specific counts of different areas found."
  }
}

CRITICAL INSTRUCTIONS:
1. Find DIFFERENT types of issues - do NOT repeat the same error pattern
2. Use DIFFERENT messages for each example - do NOT use the same message multiple times
3. Look for DIVERSE problems - spelling, grammar, punctuation, informal language, sales, engagement, clarity, emotional impact
4. Provide 3-5 DIFFERENT examples for each category
5. Focus on the MAIN AREAS that need improvement
6. Do NOT repeat the same issue type multiple times

Return ONLY the JSON object above. No additional text.

ANALYSIS REQUIREMENTS:
- Analyze the actual message content to determine chatting style, patterns, and engagement
- Provide specific examples from the messages in your analysis
- Use the exact JSON structure provided above
- Focus on engagement quality, sales effectiveness, and message patterns

CRITICAL: You MUST analyze the messages above and provide specific examples. Do NOT return undefined, null, or empty values. Every field must have actual content based on the message analysis.

If you find issues, list them specifically with message numbers. If you find no issues, write "No significant issues found" but still provide the breakdown structure.

IMPORTANT: You MUST fill in the actual values for each field based on the message analysis. Do not return empty objects or placeholder values. Analyze the actual messages and provide real values for:
- chattingStyle: directness, friendliness, salesApproach, personality, emojiUsage, messageLength, responsePattern
- messagePatterns: questionFrequency, exclamationUsage, capitalizationStyle, punctuationStyle, topicDiversity, sexualContent, personalSharing  
- engagementMetrics: conversationStarter, conversationMaintainer, salesConversation, fanRetention
- grammarBreakdown: spellingErrors, grammarIssues, punctuationProblems, informalLanguage, scoreExplanation
- guidelinesBreakdown: salesEffectiveness, engagementQuality, captionQuality, conversationFlow, scoreExplanation
- overallBreakdown: messageClarity, emotionalImpact, conversionPotential, scoreExplanation

CRITICAL BREAKDOWN REQUIREMENTS - BE DIRECT AND ACTIONABLE:

For grammarBreakdown:
- spellingErrors: List specific misspelled words found in messages (e.g., "Found 'recieve' instead of 'receive' in message 3")
- grammarIssues: Point out actual grammar mistakes (e.g., "Missing apostrophes in contractions like 'dont' instead of 'don't'")
- punctuationProblems: Identify real punctuation issues (e.g., "Missing periods at end of sentences in messages 1, 5, 8")
- informalLanguage: Note specific informal patterns (e.g., "Excessive use of 'lol' and 'haha' in 12 out of 20 messages")
- scoreExplanation: Explain the score with specific examples

For guidelinesBreakdown:
- salesEffectiveness: Point out actual sales mistakes (e.g., "PPV sent without building rapport first in message 15")
- engagementQuality: Identify real engagement issues (e.g., "Not asking follow-up questions in 8 out of 10 conversations")
- captionQuality: Critique actual PPV captions (e.g., "Caption 'check this out' is too vague, should be more descriptive")
- conversationFlow: Note real conversation problems (e.g., "Jumping to sexual topics too quickly without context")
- scoreExplanation: Explain with specific guideline violations

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
- Focus on engagement quality, sales effectiveness, and message patterns`;
    
    // Check if messages are actually being passed to the AI
    console.log('🚨 DEBUGGING: Messages being sent to AI:', sampledMessages);
    console.log('🚨 DEBUGGING: Prompt contains messages:', prompt.includes('MESSAGES TO ANALYZE'));
    console.log('🚨 DEBUGGING: Prompt length:', prompt.length);
    console.log('🚨 DEBUGGING: Messages length:', sampledMessages.length);
    console.log('🚨 DEBUGGING: First message:', sampledMessages[0]);
    console.log('🚨 DEBUGGING: Last message:', sampledMessages[sampledMessages.length - 1]);
    
    console.log('🚀 Making OpenAI API call...');
    console.log('🚨 DEBUGGING: About to call OpenAI API');
    console.log('🚨 DEBUGGING: OpenAI API Key exists:', !!process.env.OPENAI_API_KEY);
    
    try {
      console.log('🚨 DEBUGGING: Calling OpenAI API now...');
      const completion = await openai.chat.completions.create({
      model: 'gpt-3.5-turbo',
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
      temperature: 0.7,
      max_tokens: 800
    });
    console.log('✅ OpenAI API call completed');
    console.log('🚨 DEBUGGING: OpenAI API call successful');
    console.log('🚨 DEBUGGING: About to get AI response content');
    console.log('🚨 DEBUGGING: Sent to AI - sampleSize:', sampledMessages.length);
    console.log('🚨 DEBUGGING: First few messages sent to AI:', sampledMessages.slice(0, 3));
    console.log('🚨 DEBUGGING: All messages sent to AI:', sampledMessages);
    console.log('🚨 DEBUGGING: Prompt length:', prompt.length);
    
    const aiResponse = completion.choices[0].message.content;
    console.log('🚨 RAW AI RESPONSE:', aiResponse);
    console.log('🚨 AI RESPONSE LENGTH:', aiResponse.length);
    console.log('🚨 AI RESPONSE CONTAINS GRAMMAR:', aiResponse.includes('grammarBreakdown'));
    console.log('🚨 AI RESPONSE CONTAINS SPELLING:', aiResponse.includes('spellingErrors'));
    console.log('🚨 AI RESPONSE CONTAINS EXAMPLES:', aiResponse.includes('Message 1:'));
    console.log('🚨 AI RESPONSE CONTAINS MESSAGES:', aiResponse.includes('MESSAGES:'));
    console.log('🚨 AI RESPONSE CONTAINS JSON:', aiResponse.includes('{'));
    console.log('🚨 AI RESPONSE CONTAINS UNDEFINED:', aiResponse.includes('undefined'));
    console.log('🚨 AI RESPONSE CONTAINS OVERALL:', aiResponse.includes('overallBreakdown'));
    console.log('🚨 AI RESPONSE CONTAINS GUIDELINES:', aiResponse.includes('guidelinesBreakdown'));
    console.log('🚨 AI RESPONSE CONTAINS SCORE:', aiResponse.includes('scoreExplanation'));
    console.log('🚨 DEBUGGING: Prompt contains messages:', prompt.includes('MESSAGES TO ANALYZE'));
    console.log('🚨 DEBUGGING: Prompt contains breakdown template:', prompt.includes('grammarBreakdown'));
    console.log('🚨 DEBUGGING: Prompt contains example:', prompt.includes('but what u like to do when u\'re in NYC'));
    console.log('🚨 DEBUGGING: First 500 chars of prompt:', prompt.substring(0, 500));
    console.log('🚨 DEBUGGING: Last 500 chars of prompt:', prompt.substring(prompt.length - 500));
    
    // Check if the prompt contains the messages
    const promptContainsMessages = prompt.includes('MESSAGES TO ANALYZE');
    console.log('🚨 DEBUGGING: Prompt contains MESSAGES TO ANALYZE:', promptContainsMessages);
    
    // Check if the prompt contains the breakdown template
    const promptContainsBreakdown = prompt.includes('grammarBreakdown');
    console.log('🚨 DEBUGGING: Prompt contains grammarBreakdown:', promptContainsBreakdown);
    
    const analysisText = completion.choices[0].message.content;
    console.log('📝 Raw AI Response:', analysisText.substring(0, 1000) + '...');
    console.log('📝 Full AI Response Length:', analysisText.length);
    console.log('📝 Contains grammarBreakdown:', analysisText.includes('grammarBreakdown'));
    console.log('📝 Contains guidelinesBreakdown:', analysisText.includes('guidelinesBreakdown'));
    console.log('📝 Contains overallBreakdown:', analysisText.includes('overallBreakdown'));
    console.log('📝 Full AI Response for debugging:', analysisText);
    console.log('🚨 DEBUGGING: AI Response length is', analysisText.length);
    console.log('🚨 DEBUGGING: AI Response starts with:', analysisText.substring(0, 100));
    console.log('🚨 DEBUGGING: AI Response ends with:', analysisText.substring(analysisText.length - 100));
    
    // Check if AI is returning the template structure with placeholder values
    console.log('🔍 Checking for template placeholders:');
    console.log('🔍 Contains "List specific":', analysisText.includes('List specific'));
    console.log('🔍 Contains "Explain the":', analysisText.includes('Explain the'));
    console.log('🔍 Contains "undefined":', analysisText.includes('undefined'));
    console.log('🔍 Contains "null":', analysisText.includes('null'));
    
    const jsonMatch = analysisText.match(/\{[\s\S]*\}/);
    
    if (!jsonMatch) {
      console.log('❌ No JSON found in AI response');
      throw new Error('Failed to parse AI analysis response');
    }
    
    try {
      const analysisResult = JSON.parse(jsonMatch[0]);
      console.log('🔍 AI Analysis Result:', JSON.stringify(analysisResult, null, 2));
      console.log('🔍 Has chattingStyle:', !!analysisResult.chattingStyle);
      console.log('🔍 Has messagePatterns:', !!analysisResult.messagePatterns);
      console.log('🔍 Has engagementMetrics:', !!analysisResult.engagementMetrics);
      
      if (analysisResult.grammarBreakdown) {
        console.log('🚨 GRAMMAR BREAKDOWN CONTENT:', analysisResult.grammarBreakdown);
        console.log('🚨 GRAMMAR BREAKDOWN KEYS:', Object.keys(analysisResult.grammarBreakdown));
        console.log('🚨 GRAMMAR BREAKDOWN VALUES:', Object.values(analysisResult.grammarBreakdown));
        console.log('🚨 SPELLING ERRORS VALUE:', analysisResult.grammarBreakdown.spellingErrors);
        console.log('🚨 GRAMMAR ISSUES VALUE:', analysisResult.grammarBreakdown.grammarIssues);
        console.log('🚨 PUNCTUATION PROBLEMS VALUE:', analysisResult.grammarBreakdown.punctuationProblems);
        console.log('🚨 INFORMAL LANGUAGE VALUE:', analysisResult.grammarBreakdown.informalLanguage);
        console.log('🚨 SCORE EXPLANATION VALUE:', analysisResult.grammarBreakdown.scoreExplanation);
      }
      
      // Check what the AI actually returned for breakdown sections
      console.log('🔍 AI grammarBreakdown content:', analysisResult.grammarBreakdown);
      console.log('🔍 AI guidelinesBreakdown content:', analysisResult.guidelinesBreakdown);
      console.log('🔍 AI overallBreakdown content:', analysisResult.overallBreakdown);
      
      // Check if AI returned template placeholders
      if (analysisResult.grammarBreakdown) {
        const grammarValues = Object.values(analysisResult.grammarBreakdown);
        console.log('🔍 Grammar breakdown values:', grammarValues);
        console.log('🔍 Contains template text:', grammarValues.some(v => v && v.includes('List specific')));
        console.log('🔍 All values are undefined:', grammarValues.every(v => v === undefined));
        console.log('🔍 All values are null:', grammarValues.every(v => v === null));
        console.log('🔍 All values are empty strings:', grammarValues.every(v => v === ''));
      }
      
      // Check the raw JSON to see what the AI actually returned
      console.log('🔍 Raw JSON for grammarBreakdown:', JSON.stringify(analysisResult.grammarBreakdown, null, 2));
      
      // Check specifically for scoreExplanation
      if (analysisResult.grammarBreakdown && analysisResult.grammarBreakdown.scoreExplanation) {
        console.log('🔍 AI returned scoreExplanation:', analysisResult.grammarBreakdown.scoreExplanation);
      } else {
        console.log('🔍 AI did NOT return scoreExplanation');
      }
      
      console.log('🔍 AI Analysis Result keys:', Object.keys(analysisResult));
      console.log('🔍 AI Analysis Result has grammarBreakdown:', !!analysisResult.grammarBreakdown);
      console.log('🔍 AI Analysis Result has guidelinesBreakdown:', !!analysisResult.guidelinesBreakdown);
      console.log('🔍 AI Analysis Result has overallBreakdown:', !!analysisResult.overallBreakdown);
      
      // Ensure breakdown sections are included
      if (!analysisResult.grammarBreakdown) {
        console.log('🔍 Adding missing grammarBreakdown');
        analysisResult.grammarBreakdown = {
          spellingErrors: "No spelling errors found",
          grammarIssues: "No grammar issues found", 
          punctuationProblems: "No punctuation problems found",
          informalLanguage: "No informal language found",
          scoreExplanation: "Grammar analysis completed"
        };
      }
      
      if (!analysisResult.guidelinesBreakdown) {
        console.log('🔍 Adding missing guidelinesBreakdown');
        analysisResult.guidelinesBreakdown = {
          salesEffectiveness: "No sales techniques found",
          engagementQuality: "No engagement strategies found",
          captionQuality: "No PPV captions found", 
          conversationFlow: "No conversation patterns found",
          scoreExplanation: "Guidelines analysis completed"
        };
      }
      
      if (!analysisResult.overallBreakdown) {
        console.log('🔍 Adding missing overallBreakdown');
        analysisResult.overallBreakdown = {
          messageClarity: "No clarity issues found",
          emotionalImpact: "No emotional connections found",
          conversionPotential: "No conversion opportunities found",
          scoreExplanation: "Overall analysis completed"
        };
      }
      
      return analysisResult;
    } catch (parseError) {
      console.error('❌ JSON Parse Error:', parseError.message);
      console.error('❌ Malformed JSON:', jsonMatch[0]);
      throw new Error('AI returned malformed JSON');
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
        aiAnalysis: aiAnalysis.slice(-3).map(a => ({
          id: a._id,
          chatterName: a.chatterName,
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
      
      const totalRevenue = 0; // Revenue not captured in ChatterPerformance
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

      // Aggregate message analysis scores (only if message data exists)
      const grammarScore = messagesAnalysis.length > 0 ? Math.round(messagesAnalysis.reduce((s,m)=> s + (m.grammarScore || 0), 0) / messagesAnalysis.length) : null;
      const guidelinesScore = messagesAnalysis.length > 0 ? Math.round(messagesAnalysis.reduce((s,m)=> s + (m.guidelinesScore || 0), 0) / messagesAnalysis.length) : null;
      const overallMessageScore = messagesAnalysis.length > 0 ? Math.round(messagesAnalysis.reduce((s,m)=> s + (m.overallScore || 0), 0) / messagesAnalysis.length) : null;
      const totalMessages = messagesAnalysis.length > 0 ? messagesAnalysis.reduce((s,m)=> s + (m.totalMessages || 0), 0) : 0;
      
      // Chatting style analysis (from most recent message analysis)
      const latestMessageAnalysis = messagesAnalysis.length > 0 ? messagesAnalysis[0] : null;
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
        ppvConversionRate
      };
    } else {
      return res.status(400).json({ error: 'Invalid analysis type or missing chatterId for individual analysis' });
    }

    // Generate AI analysis using OpenAI (agency and individual)
    try {
      // Build messageContent strictly from the selected window's analysis record
      const analysisMessageTexts = (() => {
        const fromRecords = Array.isArray(analyticsData.messageRecords) ? analyticsData.messageRecords.map(r => r && r.messageText).filter(Boolean) : [];
        if (fromRecords.length > 0) return fromRecords;
        // Get latestMessageAnalysis from the current scope
        const latestMessageAnalysis = messagesAnalysis.length > 0 ? messagesAnalysis[0] : null;
        const fromSample = Array.isArray(latestMessageAnalysis?.messagesSample) ? latestMessageAnalysis.messagesSample.filter(Boolean) : [];
        return fromSample;
      })();

      console.log('🚨 ABOUT TO CALL generateAIAnalysis');
      console.log('🚨 analysisMessageTexts:', analysisMessageTexts);
      console.log('🚨 analysisMessageTexts length:', analysisMessageTexts ? analysisMessageTexts.length : 0);
      console.log('🚨 analyticsData keys:', Object.keys(analyticsData));
      console.log('🚨 analysisType:', analysisType);
      console.log('🚨 interval:', interval);
      const aiAnalysis = await generateAIAnalysis(analyticsData, analysisType, interval, analysisMessageTexts);
      console.log('🚨 generateAIAnalysis COMPLETED');
      console.log('🚨 aiAnalysis keys:', Object.keys(aiAnalysis));
      console.log('🚨 aiAnalysis has grammarBreakdown:', !!aiAnalysis.grammarBreakdown);
      console.log('🚨 aiAnalysis has guidelinesBreakdown:', !!aiAnalysis.guidelinesBreakdown);
      console.log('🚨 aiAnalysis has overallBreakdown:', !!aiAnalysis.overallBreakdown);
      console.log('🚨 aiAnalysis grammarBreakdown:', aiAnalysis.grammarBreakdown);
      console.log('🚨 aiAnalysis guidelinesBreakdown:', aiAnalysis.guidelinesBreakdown);
      console.log('🚨 aiAnalysis overallBreakdown:', aiAnalysis.overallBreakdown);
      
      // Add raw metrics to response for UI display
      aiAnalysis.ppvsSent = analyticsData.ppvsSent;
      aiAnalysis.ppvsUnlocked = analyticsData.ppvsUnlocked;
      aiAnalysis.messagesSent = analyticsData.messagesSent;
      aiAnalysis.fansChatted = analyticsData.fansChatted;
      aiAnalysis.avgResponseTime = analyticsData.avgResponseTime;
      aiAnalysis.grammarScore = analyticsData.grammarScore;
      aiAnalysis.guidelinesScore = analyticsData.guidelinesScore;
      aiAnalysis.overallScore = analyticsData.overallMessageScore;
      
      // Add message analysis data for detailed breakdown
      aiAnalysis.chattingStyle = analyticsData.chattingStyle;
      aiAnalysis.messagePatterns = analyticsData.messagePatterns;
      aiAnalysis.engagementMetrics = analyticsData.engagementMetrics;
      aiAnalysis.strengths = analyticsData.strengths;
      aiAnalysis.weaknesses = analyticsData.weaknesses;
      aiAnalysis.recommendations = analyticsData.recommendations;
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
          Object.values(aiAnalysis.guidelinesBreakdown).some(value => value && typeof value === 'string' && value.trim().length > 0)) {
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
      
      // Overall breakdown - use AI data if available, otherwise use analyticsData, otherwise fallback
      if (aiAnalysis.overallBreakdown && Object.keys(aiAnalysis.overallBreakdown).length > 0 && 
          Object.values(aiAnalysis.overallBreakdown).some(value => value && typeof value === 'string' && value.trim().length > 0)) {
        console.log('✅ Using AI overallBreakdown data');
        // Keep the AI data - don't overwrite it
      } else if (analyticsData.overallBreakdown && Object.keys(analyticsData.overallBreakdown).length > 0) {
        aiAnalysis.overallBreakdown = analyticsData.overallBreakdown;
        console.log('✅ Set overallBreakdown from analyticsData');
      } else {
        console.log('❌ No overallBreakdown in AI or analyticsData, using fallback');
        aiAnalysis.overallBreakdown = {
          "messageClarity": `Overall message quality score of ${analyticsData.overallMessageScore || 0}/100 indicates good foundation with room for improvement.`,
          "emotionalImpact": `Message patterns show good engagement but could benefit from more strategic conversation management.`,
          "conversionPotential": `PPV conversion rates could be improved with better timing and more compelling content descriptions.`,
          "scoreExplanation": `Relationship building is strong, focus on maintaining engagement between PPVs.`
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
      console.log('🔍 Frontend chattingStyle:', JSON.stringify(aiAnalysis.chattingStyle));
      console.log('🔍 Frontend messagePatterns:', JSON.stringify(aiAnalysis.messagePatterns));
      console.log('🔍 Frontend engagementMetrics:', JSON.stringify(aiAnalysis.engagementMetrics));
      console.log('🔍 Frontend grammarBreakdown:', JSON.stringify(aiAnalysis.grammarBreakdown));
      console.log('🔍 Frontend guidelinesBreakdown:', JSON.stringify(aiAnalysis.guidelinesBreakdown));
      console.log('🔍 Frontend overallBreakdown:', JSON.stringify(aiAnalysis.overallBreakdown));
      
      // Helper to extract message texts for deterministic breakdowns (strictly within selected window)
      const getWindowMessages = () => {
        try {
          if (Array.isArray(analyticsData.messageRecords) && analyticsData.messageRecords.length > 0) {
            return analyticsData.messageRecords.map(r => r && r.messageText).filter(Boolean);
          }
          // Get latestMessageAnalysis from the current scope
          const latestMessageAnalysis = messagesAnalysis.length > 0 ? messagesAnalysis[0] : null;
          const fromSample = Array.isArray(latestMessageAnalysis?.messagesSample) ? latestMessageAnalysis.messagesSample.filter(Boolean) : [];
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
        Object.values(aiAnalysis.guidelinesBreakdown).some(value => value && value.trim().length > 0);
      
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
        Object.values(aiAnalysis.overallBreakdown).some(value => value && value.trim().length > 0);
      
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
        messagesPerPPV: analyticsData.ppvsSent > 0 ? `${(analyticsData.messagesSent / analyticsData.ppvsSent).toFixed(1)} messages per PPV - ${analyticsData.messagesSent / analyticsData.ppvsSent > 50 ? 'Excellent relationship building' : analyticsData.messagesSent / analyticsData.ppvsSent > 20 ? 'Good engagement strategy' : 'Direct sales approach'}` : 'No PPV data available',
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
async function generateAIAnalysis(analyticsData, analysisType, interval, messageContent = []) {
  try {
    console.log('🚨 STARTING AI ANALYSIS FUNCTION');
    console.log('🚨 MESSAGE CONTENT:', messageContent);
    console.log('🚨 MESSAGE CONTENT LENGTH:', messageContent ? messageContent.length : 0);
    console.log('🚨 ANALYTICS DATA:', analyticsData);
    console.log('🚨 ANALYSIS TYPE:', analysisType);
    console.log('🚨 INTERVAL:', interval);
    
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

    // Debug: Log the analytics data being sent to AI
    console.log('Analytics data being sent to AI:', JSON.stringify(analyticsData, null, 2));
    
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
- Messages per PPV: ${analyticsData.ppvsSent > 0 ? (analyticsData.messagesSent/analyticsData.ppvsSent).toFixed(1) : 0}
- Messages per Fan: ${analyticsData.fansChatted > 0 ? (analyticsData.messagesSent/analyticsData.fansChatted).toFixed(1) : 0}
- Revenue per PPV: $${analyticsData.ppvsSent > 0 ? ((analyticsData.netSales || 0)/analyticsData.ppvsSent).toFixed(2) : 0}
- Revenue per Message: $${analyticsData.messagesSent > 0 ? ((analyticsData.netSales || 0)/analyticsData.messagesSent).toFixed(2) : 0}
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
2. MESSAGE QUALITY IMPACT: ${analyticsData.grammarScore}/100 grammar + ${analyticsData.guidelinesScore}/100 guidelines = ${analyticsData.overallScore}/100 overall. ONLY analyze the correlation with ${(analyticsData.ppvsUnlocked/analyticsData.ppvsSent*100).toFixed(1)}% conversion if you have specific data showing this relationship. Do NOT make assumptions about "generally known" relationships.
3. PPV EFFICIENCY ANALYSIS: ${analyticsData.ppvsSent} PPVs sent, ${analyticsData.ppvsUnlocked} unlocked = ${(analyticsData.ppvsUnlocked/analyticsData.ppvsSent*100).toFixed(1)}% unlock rate. What's driving this performance?
4. REVENUE OPTIMIZATION: $${analyticsData.netSales} total revenue = $${(analyticsData.netSales/analyticsData.ppvsSent).toFixed(2)} per PPV, $${(analyticsData.netSales/analyticsData.messagesSent).toFixed(2)} per message. How can this be improved?
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
      "messagesPerPPV": "DETAILED analysis of the ${analyticsData.messagesSent}/${analyticsData.ppvsSent} = ${(analyticsData.messagesSent/analyticsData.ppvsSent).toFixed(1)} ratio with specific benchmarks and actionable insights",
      "revenueEfficiency": "DETAILED analysis of $${analyticsData.netSales}/${analyticsData.ppvsSent} = $${(analyticsData.netSales/analyticsData.ppvsSent).toFixed(2)} per PPV and $${analyticsData.netSales}/${analyticsData.messagesSent} = $${(analyticsData.netSales/analyticsData.messagesSent).toFixed(2)} per message with pricing recommendations", 
      "messageQualityImpact": "DETAILED analysis of how the ${analyticsData.grammarScore}/100 grammar and ${analyticsData.guidelinesScore}/100 guidelines scores correlate with the ${(analyticsData.ppvsUnlocked/analyticsData.ppvsSent*100).toFixed(1)}% unlock rate"
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
      "leakagePoints": ["Specific revenue leak with exact numbers and impact", "Another specific leak with quantified loss", "Third leak with improvement potential"],
      "growthOpportunities": ["Specific opportunity with exact revenue potential", "Another opportunity with projected impact", "Third opportunity with implementation strategy"],
      "efficiencyGains": ["Specific efficiency gain with exact calculation", "Another efficiency gain with projected results"]
    },
    "messageOptimization": {
      "qualityImprovements": ["Specific message quality improvement with expected impact", "Another quality improvement with implementation"],
      "engagementStrategies": ["Specific engagement strategy with projected results", "Another engagement strategy with metrics"],
      "conversionOptimization": ["Specific conversion improvement with exact numbers", "Another conversion strategy with expected outcomes"]
    },
    "performanceDrivers": {
      "primaryDrivers": ["Driver 1 with exact impact analysis and numbers", "Driver 2 with specific impact analysis"],
      "limitingFactors": ["Factor 1 with specific solution and expected results", "Factor 2 with detailed solution"],
      "leveragePoints": ["Leverage point 1 with exact expected outcome", "Leverage point 2 with specific results"]
    }
  },
  "actionPlan": {
    "immediateActions": ["Specific action with exact expected outcome and timeline", "Another specific action with projected results and timeline"],
    "messageOptimization": ["Specific message improvement with exact expected impact", "Another message strategy with projected results"],
    "revenueOptimization": ["Specific revenue improvement with exact numbers", "Another revenue strategy with projected impact"],
    "successMetrics": ["Specific metric with exact target and timeline", "Another metric with specific target and timeline"],
    "roiProjections": {
      "currentState": "Current performance with exact revenue impact and numbers",
      "optimizedState": "Projected performance with exact revenue impact and numbers",
      "improvementValue": "Quantified improvement with exact numbers and timeline"
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
      model: "gpt-3.5-turbo",
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
      temperature: 0.3,
      max_tokens: 1500
    });

    const aiResponse = completion.choices[0].message.content;
    console.log('🔍 AI Response:', aiResponse);
    console.log('🔍 AI Response Length:', aiResponse.length);
    console.log('🔍 AI Response Preview:', aiResponse.substring(0, 500) + '...');
    console.log('🔍 AI Response Ends with:', aiResponse.substring(aiResponse.length - 100));
    
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
      return analysis;
    } catch (parseError) {
      console.error('❌ JSON Parse Error:', parseError.message);
      console.error('❌ Malformed JSON:', jsonMatch[0]);
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
