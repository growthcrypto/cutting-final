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
    const { username, password } = req.body;

    const user = await User.findOne({ username, isActive: true });
    if (!user) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    const isValidPassword = await bcrypt.compare(password, user.password);
    if (!isValidPassword) {
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
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/auth/register', checkDatabaseConnection, authenticateToken, requireManager, async (req, res) => {
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

    // Get daily reports data
    const dailyReports = await DailyChatterReport.find(dateQuery);
    const ofAccountData = await AccountData.find(dateQuery);
    
    // Calculate metrics from daily reports
    const totalRevenue = dailyReports.reduce((sum, report) => {
      const ppvRevenue = report.ppvSales.reduce((ppvSum, sale) => ppvSum + sale.amount, 0);
      const tipsRevenue = report.tips.reduce((tipSum, tip) => tipSum + tip.amount, 0);
      return sum + ppvRevenue + tipsRevenue;
    }, 0);

    const totalPPVsSent = dailyReports.reduce((sum, report) => sum + (report.ppvSales?.length || 0), 0);
    const totalPPVsUnlocked = dailyReports.reduce((sum, report) => sum + (report.ppvSales?.length || 0), 0); // Assume sent = unlocked for now
    const avgResponseTime = dailyReports.length > 0 
      ? dailyReports.reduce((sum, report) => sum + (report.avgResponseTime || 0), 0) / dailyReports.length 
      : 0;

    // Get real data from OF Account data
    const netRevenue = ofAccountData.reduce((sum, data) => sum + (data.netRevenue || 0), 0);
    const recurringRevenue = ofAccountData.reduce((sum, data) => sum + (data.recurringRevenue || 0), 0);
    const totalSubs = ofAccountData.reduce((sum, data) => sum + (data.totalSubs || 0), 0);
    const newSubs = ofAccountData.reduce((sum, data) => sum + (data.newSubs || 0), 0);
    const profileClicks = ofAccountData.reduce((sum, data) => sum + (data.profileClicks || 0), 0);

    const analytics = {
      totalRevenue: Math.round(totalRevenue),
      netRevenue: Math.round(netRevenue),
      recurringRevenue: Math.round(recurringRevenue),
      totalSubs: Math.round(totalSubs),
      newSubs: Math.round(newSubs),
      profileClicks: Math.round(profileClicks),
      messagesSent: dailyReports.reduce((sum, report) => sum + (report.fansChatted || 0) * 15, 0), // Estimate
      ppvsSent: totalPPVsSent,
      ppvsUnlocked: totalPPVsUnlocked,
      avgResponseTime: Math.round(avgResponseTime * 10) / 10,
      avgPPVPrice: totalPPVsSent > 0 ? Math.round((totalRevenue / totalPPVsSent) * 100) / 100 : 0
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
    const chatterData = new ChatterPerformance({
      ...req.body,
      submittedBy: req.user.id,
      submittedAt: new Date()
    });
    
    await chatterData.save();
    res.json({ message: 'Chatter data saved successfully', data: chatterData });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Test endpoint to verify server is working
app.get('/api/test', (req, res) => {
  res.json({ message: 'Server is working', timestamp: new Date().toISOString() });
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
      const fallbackAnalysis = generateFallbackAnalysis(analyticsData, analysisType, interval);
      res.json(fallbackAnalysis);
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
  if (analysisType === 'agency') {
    const clickToSubRate = analyticsData.profileClicks > 0 ? (analyticsData.newSubs / analyticsData.profileClicks * 100) : 0;
    const ppvUnlockRate = analyticsData.ppvsSent > 0 ? (analyticsData.ppvsUnlocked / analyticsData.ppvsSent * 100) : 0;
    const revenuePerSub = analyticsData.totalSubs > 0 ? (analyticsData.totalRevenue / analyticsData.totalSubs) : 0;
    const revenuePerHour = analyticsData.totalRevenue / (interval === '7d' ? 168 : interval === '30d' ? 720 : 24);
    const messagesPerPPV = analyticsData.ppvsSent > 0 ? (analyticsData.messagesSent / analyticsData.ppvsSent) : 0;
    
    // Get employee analytics
    const dailyReports = await DailyChatterReport.find({
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
            responseTime: 0,
            count: 0,
            name: report.chatterId // Will be replaced with actual name if available
          };
        }
        const revenue = report.ppvSales.reduce((sum, sale) => sum + sale.amount, 0) + 
                       report.tips.reduce((sum, tip) => sum + tip.amount, 0);
        employeeMetrics[report.chatterId].revenue += revenue;
        employeeMetrics[report.chatterId].ppvsSent += report.ppvSales?.length || 0;
        employeeMetrics[report.chatterId].responseTime += report.avgResponseTime || 0;
        employeeMetrics[report.chatterId].count++;
      }
    });
    
    // Calculate averages and rankings
    const employeePerformance = Object.values(employeeMetrics).map(emp => ({
      ...emp,
      avgRevenue: emp.revenue / emp.count,
      avgResponseTime: emp.responseTime / emp.count,
      revenuePerPPV: emp.ppvsSent > 0 ? emp.revenue / emp.ppvsSent : 0
    })).sort((a, b) => b.avgRevenue - a.avgRevenue);
    
    const topPerformer = employeePerformance[0];
    const performanceGap = employeePerformance.length > 1 ? 
      employeePerformance[0].avgRevenue - employeePerformance[employeePerformance.length - 1].avgRevenue : 0;
    
    let overallScore = 0;
    if (analyticsData.totalRevenue > 0) overallScore += 20;
    if (clickToSubRate > 10) overallScore += 20;
    if (ppvUnlockRate > 50) overallScore += 20;
    if (analyticsData.avgResponseTime < 3) overallScore += 20;
    if (revenuePerSub > 10) overallScore += 20;
    
    return {
      overallScore,
      insights: [
        `Total revenue of $${analyticsData.totalRevenue.toLocaleString()} generated this ${interval} period`,
        `Click-to-subscription conversion rate is ${clickToSubRate.toFixed(1)}%`,
        `Average response time is ${analyticsData.avgResponseTime.toFixed(1)} minutes`,
        `PPV unlock rate is ${ppvUnlockRate.toFixed(1)}%`,
        `Revenue per hour: $${revenuePerHour.toFixed(2)}`,
        `Messages per PPV: ${messagesPerPPV.toFixed(1)}`
      ],
      weakPoints: [
        clickToSubRate < 10 ? `Low conversion rate (${clickToSubRate.toFixed(1)}%) - industry average is 12%` : null,
        analyticsData.avgResponseTime > 3 ? `Response time of ${analyticsData.avgResponseTime.toFixed(1)} minutes is above optimal (2-3 minutes)` : null,
        ppvUnlockRate < 50 ? `PPV unlock rate (${ppvUnlockRate.toFixed(1)}%) is below industry average (45-60%)` : null,
        performanceGap > 500 ? `High performance variance: $${performanceGap.toFixed(0)} gap between top and bottom performers` : null
      ].filter(Boolean),
      opportunities: [
        `Improving conversion rate to 12% could increase revenue by $${Math.round(analyticsData.totalRevenue * 0.2)}`,
        `Reducing response time to 2 minutes could increase conversions by 15-20%`,
        performanceGap > 500 ? `Leveling up all chatters to top performer could increase revenue by $${Math.round(performanceGap * employeePerformance.length)}` : null
      ].filter(Boolean),
      roiCalculations: [
        `Response time improvement: $${Math.round(analyticsData.totalRevenue * 0.15)} potential monthly gain for $400 training cost`,
        `Conversion optimization: $${Math.round(analyticsData.totalRevenue * 0.2)} potential monthly gain for $600 funnel improvements`,
        performanceGap > 500 ? `Team training ROI: $${Math.round(performanceGap * employeePerformance.length * 12)} annual potential for $2,000 training investment` : null
      ].filter(Boolean),
      recommendations: [
        'Focus on faster response times - aim for under 2 minutes',
        'Test premium PPV pricing strategy',
        'Plan weekend coverage optimization',
        performanceGap > 500 ? 'Implement team training to level up all chatters' : null
      ].filter(Boolean),
      employeeAnalytics: {
        totalEmployees: employeePerformance.length,
        topPerformer: topPerformer ? {
          name: topPerformer.name,
          avgRevenue: topPerformer.avgRevenue,
          avgResponseTime: topPerformer.avgResponseTime,
          revenuePerPPV: topPerformer.revenuePerPPV
        } : null,
        performanceGap: performanceGap,
        teamConsistency: employeePerformance.length > 1 ? 
          (1 - (performanceGap / (topPerformer?.avgRevenue || 1))) * 100 : 100,
        averageTeamRevenue: employeePerformance.length > 0 ? 
          employeePerformance.reduce((sum, emp) => sum + emp.avgRevenue, 0) / employeePerformance.length : 0
      },
      complexAgencyMetrics: {
        revenueEfficiency: revenuePerHour,
        conversionFunnel: {
          clicksToSubs: clickToSubRate,
          subsToRevenue: revenuePerSub,
          messagesToPPV: messagesPerPPV
        },
        operationalMetrics: {
          avgResponseTime: analyticsData.avgResponseTime,
          ppvUnlockRate: ppvUnlockRate,
          revenuePerSub: revenuePerSub
        },
        growthPotential: {
          conversionUpside: Math.max(0, 12 - clickToSubRate),
          responseTimeUpside: Math.max(0, analyticsData.avgResponseTime - 2),
          teamUpside: performanceGap
        }
      }
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
          "recommendations": ["recommendation1", "recommendation2"],
          "employeeAnalytics": {
            "totalEmployees": [number],
            "topPerformer": {
              "name": "chatter_name",
              "avgRevenue": [number],
              "avgResponseTime": [number],
              "revenuePerPPV": [number]
            },
            "performanceGap": [number],
            "teamConsistency": [percentage],
            "averageTeamRevenue": [number]
          },
          "complexAgencyMetrics": {
            "revenueEfficiency": [revenue per hour],
            "conversionFunnel": {
              "clicksToSubs": [percentage],
              "subsToRevenue": [revenue per sub],
              "messagesToPPV": [ratio]
            },
            "operationalMetrics": {
              "avgResponseTime": [minutes],
              "ppvUnlockRate": [percentage],
              "revenuePerSub": [dollars]
            },
            "growthPotential": {
              "conversionUpside": [percentage improvement possible],
              "responseTimeUpside": [minutes improvement possible],
              "teamUpside": [revenue improvement possible]
            }
          }
        }

        Focus on:
        1. Performance insights based on real data
        2. Employee performance analysis and team dynamics
        3. Complex agency metrics including conversion funnels and efficiency
        4. Specific weak points with data-driven explanations
        5. Actionable opportunities with potential revenue impact
        6. ROI calculations for improvements
        7. Prioritized recommendations

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
