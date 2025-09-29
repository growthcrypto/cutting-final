const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const csv = require('csv-parser');
const XLSX = require('xlsx');
const OpenAI = require('openai');
require('dotenv').config();

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
} else {
  console.warn('⚠️  OPENAI_API_KEY not set - AI analysis will be disabled');
}

// MongoDB Connection
const mongoUri = process.env.MONGODB_URI || process.env.MONGO_URL || 'mongodb://localhost:27017/chatter_analytics';
console.log('🔌 Attempting to connect to MongoDB...');
mongoose.connect(mongoUri, {
  useNewUrlParser: true,
  useUnifiedTopology: true,
}).then(() => {
  console.log('✅ Connected to MongoDB successfully!');
}).catch((error) => {
  console.error('❌ MongoDB connection error:', error);
  console.log('⚠️  App will continue without database connection');
});

// Database Models
const chatterSchema = new mongoose.Schema({
  name: { type: String, required: true },
  email: { type: String, required: true },
  team: { type: String, required: true },
  joinDate: { type: Date, default: Date.now },
  isActive: { type: Boolean, default: true }
});

const analyticsSchema = new mongoose.Schema({
  chatterId: { type: mongoose.Schema.Types.ObjectId, ref: 'Chatter', required: true },
  date: { type: Date, required: true },
  messagesSent: { type: Number, default: 0 },
  messagesReceived: { type: Number, default: 0 },
  revenue: { type: Number, default: 0 },
  conversions: { type: Number, default: 0 },
  responseTime: { type: Number, default: 0 }, // in minutes
  customerSatisfaction: { type: Number, default: 0 }, // 1-10 scale
  upsells: { type: Number, default: 0 },
  refunds: { type: Number, default: 0 },
  activeSubscribers: { type: Number, default: 0 },
  newSubscribers: { type: Number, default: 0 },
  churnRate: { type: Number, default: 0 }
});

const messageSchema = new mongoose.Schema({
  chatterId: { type: mongoose.Schema.Types.ObjectId, ref: 'Chatter', required: true },
  timestamp: { type: Date, required: true },
  messageType: { type: String, enum: ['sent', 'received'], required: true },
  content: { type: String, required: true },
  customerId: { type: String, required: true },
  conversationId: { type: String, required: true },
  sentiment: { type: String, enum: ['positive', 'neutral', 'negative'], default: 'neutral' },
  category: { type: String, enum: ['greeting', 'sales', 'support', 'upsell', 'closing'], default: 'sales' },
  aiAnalysis: {
    effectiveness: { type: Number, min: 1, max: 10 },
    suggestions: [String],
    strengths: [String],
    weaknesses: [String]
  }
});

const Chatter = mongoose.model('Chatter', chatterSchema);
const Analytics = mongoose.model('Analytics', analyticsSchema);
const Message = mongoose.model('Message', messageSchema);

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

// Routes

// Get all chatters
app.get('/api/chatters', async (req, res) => {
  try {
    const chatters = await Chatter.find({ isActive: true });
    res.json(chatters);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Get analytics for a specific chatter
app.get('/api/analytics/:chatterId', async (req, res) => {
  try {
    const { chatterId } = req.params;
    const { startDate, endDate } = req.query;
    
    let query = { chatterId };
    if (startDate && endDate) {
      query.date = { $gte: new Date(startDate), $lte: new Date(endDate) };
    }
    
    const analytics = await Analytics.find(query).sort({ date: -1 });
    res.json(analytics);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Get team analytics
app.get('/api/analytics/team/:team', async (req, res) => {
  try {
    const { team } = req.params;
    const { startDate, endDate } = req.query;
    
    const chatters = await Chatter.find({ team, isActive: true });
    const chatterIds = chatters.map(c => c._id);
    
    let query = { chatterId: { $in: chatterIds } };
    if (startDate && endDate) {
      query.date = { $gte: new Date(startDate), $lte: new Date(endDate) };
    }
    
    const analytics = await Analytics.find(query).sort({ date: -1 });
    res.json(analytics);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Upload analytics data
app.post('/api/upload/analytics', upload.single('file'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No file uploaded' });
    }

    const filePath = req.file.path;
    const fileExtension = path.extname(req.file.originalname).toLowerCase();
    
    let data = [];
    
    if (fileExtension === '.csv') {
      data = await parseCSV(filePath);
    } else if (fileExtension === '.xlsx' || fileExtension === '.xls') {
      data = await parseExcel(filePath);
    } else {
      return res.status(400).json({ error: 'Unsupported file format' });
    }

    // Process and save analytics data
    const savedAnalytics = [];
    for (const row of data) {
      const chatter = await Chatter.findOne({ name: row.chatterName });
      if (chatter) {
        const analytics = new Analytics({
          chatterId: chatter._id,
          date: new Date(row.date),
          messagesSent: parseInt(row.messagesSent) || 0,
          messagesReceived: parseInt(row.messagesReceived) || 0,
          revenue: parseFloat(row.revenue) || 0,
          conversions: parseInt(row.conversions) || 0,
          responseTime: parseFloat(row.responseTime) || 0,
          customerSatisfaction: parseFloat(row.customerSatisfaction) || 0,
          upsells: parseInt(row.upsells) || 0,
          refunds: parseInt(row.refunds) || 0,
          activeSubscribers: parseInt(row.activeSubscribers) || 0,
          newSubscribers: parseInt(row.newSubscribers) || 0,
          churnRate: parseFloat(row.churnRate) || 0
        });
        
        await analytics.save();
        savedAnalytics.push(analytics);
      }
    }

    // Clean up uploaded file
    fs.unlinkSync(filePath);

    res.json({ 
      message: 'Analytics data uploaded successfully', 
      count: savedAnalytics.length 
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Upload messages data
app.post('/api/upload/messages', upload.single('file'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No file uploaded' });
    }

    const filePath = req.file.path;
    const fileExtension = path.extname(req.file.originalname).toLowerCase();
    
    let data = [];
    
    if (fileExtension === '.csv') {
      data = await parseCSV(filePath);
    } else if (fileExtension === '.xlsx' || fileExtension === '.xls') {
      data = await parseExcel(filePath);
    } else {
      return res.status(400).json({ error: 'Unsupported file format' });
    }

    // Process and save messages data
    const savedMessages = [];
    for (const row of data) {
      const chatter = await Chatter.findOne({ name: row.chatterName });
      if (chatter) {
        const message = new Message({
          chatterId: chatter._id,
          timestamp: new Date(row.timestamp),
          messageType: row.messageType,
          content: row.content,
          customerId: row.customerId,
          conversationId: row.conversationId
        });
        
        await message.save();
        savedMessages.push(message);
      }
    }

    // Clean up uploaded file
    fs.unlinkSync(filePath);

    res.json({ 
      message: 'Messages data uploaded successfully', 
      count: savedMessages.length 
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// AI Analysis endpoint
app.post('/api/analyze/chatter/:chatterId', async (req, res) => {
  try {
    const { chatterId } = req.params;
    const { startDate, endDate } = req.query;
    
    // Get chatter info
    const chatter = await Chatter.findById(chatterId);
    if (!chatter) {
      return res.status(404).json({ error: 'Chatter not found' });
    }
    
    // Get analytics data
    let analyticsQuery = { chatterId };
    if (startDate && endDate) {
      analyticsQuery.date = { $gte: new Date(startDate), $lte: new Date(endDate) };
    }
    const analytics = await Analytics.find(analyticsQuery).sort({ date: -1 });
    
    // Get messages data
    let messagesQuery = { chatterId };
    if (startDate && endDate) {
      messagesQuery.timestamp = { $gte: new Date(startDate), $lte: new Date(endDate) };
    }
    const messages = await Message.find(messagesQuery).sort({ timestamp: -1 });
    
    // Generate AI analysis
    const analysis = await generateAIAnalysis(chatter, analytics, messages);
    
    res.json(analysis);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Team analysis endpoint
app.post('/api/analyze/team/:team', async (req, res) => {
  try {
    const { team } = req.params;
    const { startDate, endDate } = req.query;
    
    // Get team chatters
    const chatters = await Chatter.find({ team, isActive: true });
    const chatterIds = chatters.map(c => c._id);
    
    // Get team analytics
    let analyticsQuery = { chatterId: { $in: chatterIds } };
    if (startDate && endDate) {
      analyticsQuery.date = { $gte: new Date(startDate), $lte: new Date(endDate) };
    }
    const analytics = await Analytics.find(analyticsQuery).sort({ date: -1 });
    
    // Get team messages
    let messagesQuery = { chatterId: { $in: chatterIds } };
    if (startDate && endDate) {
      messagesQuery.timestamp = { $gte: new Date(startDate), $lte: new Date(endDate) };
    }
    const messages = await Message.find(messagesQuery).sort({ timestamp: -1 });
    
    // Generate team AI analysis
    const analysis = await generateTeamAIAnalysis(team, chatters, analytics, messages);
    
    res.json(analysis);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Helper functions
async function parseCSV(filePath) {
  return new Promise((resolve, reject) => {
    const results = [];
    fs.createReadStream(filePath)
      .pipe(csv())
      .on('data', (data) => results.push(data))
      .on('end', () => resolve(results))
      .on('error', reject);
  });
}

async function parseExcel(filePath) {
  const workbook = XLSX.readFile(filePath);
  const sheetName = workbook.SheetNames[0];
  const worksheet = workbook.Sheets[sheetName];
  return XLSX.utils.sheet_to_json(worksheet);
}

async function generateAIAnalysis(chatter, analytics, messages) {
  try {
    // Prepare data for AI analysis
    const analyticsSummary = {
      totalRevenue: analytics.reduce((sum, a) => sum + a.revenue, 0),
      totalConversions: analytics.reduce((sum, a) => sum + a.conversions, 0),
      avgResponseTime: analytics.reduce((sum, a) => sum + a.responseTime, 0) / analytics.length,
      avgSatisfaction: analytics.reduce((sum, a) => sum + a.customerSatisfaction, 0) / analytics.length,
      totalUpsells: analytics.reduce((sum, a) => sum + a.upsells, 0),
      totalRefunds: analytics.reduce((sum, a) => sum + a.refunds, 0),
      avgChurnRate: analytics.reduce((sum, a) => sum + a.churnRate, 0) / analytics.length
    };

    const messageSamples = messages.slice(0, 50).map(m => ({
      type: m.messageType,
      content: m.content.substring(0, 200) // Truncate for token limits
    }));

    const prompt = `
    Analyze the performance of chatter "${chatter.name}" based on the following data:

    ANALYTICS SUMMARY:
    - Total Revenue: $${analyticsSummary.totalRevenue}
    - Total Conversions: ${analyticsSummary.totalConversions}
    - Average Response Time: ${analyticsSummary.avgResponseTime} minutes
    - Average Customer Satisfaction: ${analyticsSummary.avgSatisfaction}/10
    - Total Upsells: ${analyticsSummary.totalUpsells}
    - Total Refunds: ${analyticsSummary.totalRefunds}
    - Average Churn Rate: ${analyticsSummary.avgChurnRate}%

    RECENT MESSAGES SAMPLE:
    ${JSON.stringify(messageSamples, null, 2)}

    Provide a comprehensive analysis including:
    1. Performance Overview (1-10 rating)
    2. Key Strengths (top 3)
    3. Areas for Improvement (top 3)
    4. Specific Recommendations
    5. Trend Analysis
    6. Revenue Optimization Opportunities

    Format as JSON with the following structure:
    {
      "overallRating": number,
      "strengths": ["strength1", "strength2", "strength3"],
      "weaknesses": ["weakness1", "weakness2", "weakness3"],
      "recommendations": ["rec1", "rec2", "rec3"],
      "trends": "trend analysis text",
      "revenueOpportunities": ["opp1", "opp2", "opp3"]
    }
    `;

    const completion = await openai.chat.completions.create({
      model: "gpt-4",
      messages: [{ role: "user", content: prompt }],
      temperature: 0.7,
    });

    const analysis = JSON.parse(completion.choices[0].message.content);
    
    return {
      chatter: chatter,
      analytics: analyticsSummary,
      aiAnalysis: analysis,
      messageCount: messages.length,
      analysisDate: new Date()
    };
  } catch (error) {
    console.error('AI Analysis Error:', error);
    return {
      chatter: chatter,
      analytics: {},
      aiAnalysis: {
        overallRating: 5,
        strengths: ["Data analysis unavailable"],
        weaknesses: ["AI analysis failed"],
        recommendations: ["Check AI service configuration"],
        trends: "Unable to analyze trends",
        revenueOpportunities: ["Manual review required"]
      },
      messageCount: messages.length,
      analysisDate: new Date()
    };
  }
}

async function generateTeamAIAnalysis(team, chatters, analytics, messages) {
  try {
    // Calculate team metrics
    const teamMetrics = {
      totalRevenue: analytics.reduce((sum, a) => sum + a.revenue, 0),
      totalConversions: analytics.reduce((sum, a) => sum + a.conversions, 0),
      avgResponseTime: analytics.reduce((sum, a) => sum + a.responseTime, 0) / analytics.length,
      avgSatisfaction: analytics.reduce((sum, a) => sum + a.customerSatisfaction, 0) / analytics.length,
      totalUpsells: analytics.reduce((sum, a) => sum + a.upsells, 0),
      totalRefunds: analytics.reduce((sum, a) => sum + a.refunds, 0),
      avgChurnRate: analytics.reduce((sum, a) => sum + a.churnRate, 0) / analytics.length,
      teamSize: chatters.length
    };

    // Get top performers
    const chatterPerformance = {};
    chatters.forEach(chatter => {
      const chatterAnalytics = analytics.filter(a => a.chatterId.toString() === chatter._id.toString());
      chatterPerformance[chatter.name] = {
        revenue: chatterAnalytics.reduce((sum, a) => sum + a.revenue, 0),
        conversions: chatterAnalytics.reduce((sum, a) => sum + a.conversions, 0),
        satisfaction: chatterAnalytics.reduce((sum, a) => sum + a.customerSatisfaction, 0) / chatterAnalytics.length
      };
    });

    const prompt = `
    Analyze the performance of team "${team}" with ${teamMetrics.teamSize} chatters:

    TEAM METRICS:
    - Total Revenue: $${teamMetrics.totalRevenue}
    - Total Conversions: ${teamMetrics.totalConversions}
    - Average Response Time: ${teamMetrics.avgResponseTime} minutes
    - Average Customer Satisfaction: ${teamMetrics.avgSatisfaction}/10
    - Total Upsells: ${teamMetrics.totalUpsells}
    - Total Refunds: ${teamMetrics.totalRefunds}
    - Average Churn Rate: ${teamMetrics.avgChurnRate}%

    INDIVIDUAL PERFORMANCE:
    ${JSON.stringify(chatterPerformance, null, 2)}

    Provide team-level analysis including:
    1. Team Performance Overview (1-10 rating)
    2. Team Strengths (top 3)
    3. Team Weaknesses (top 3)
    4. Team Recommendations
    5. Training Needs
    6. Process Improvements
    7. Top Performer Insights
    8. Underperformer Support

    Format as JSON with the following structure:
    {
      "teamRating": number,
      "strengths": ["strength1", "strength2", "strength3"],
      "weaknesses": ["weakness1", "weakness2", "weakness3"],
      "recommendations": ["rec1", "rec2", "rec3"],
      "trainingNeeds": ["training1", "training2"],
      "processImprovements": ["process1", "process2"],
      "topPerformerInsights": "insights text",
      "underperformerSupport": "support recommendations"
    }
    `;

    const completion = await openai.chat.completions.create({
      model: "gpt-4",
      messages: [{ role: "user", content: prompt }],
      temperature: 0.7,
    });

    const analysis = JSON.parse(completion.choices[0].message.content);
    
    return {
      team: team,
      metrics: teamMetrics,
      chatterPerformance: chatterPerformance,
      aiAnalysis: analysis,
      totalMessages: messages.length,
      analysisDate: new Date()
    };
  } catch (error) {
    console.error('Team AI Analysis Error:', error);
    return {
      team: team,
      metrics: {},
      chatterPerformance: {},
      aiAnalysis: {
        teamRating: 5,
        strengths: ["Data analysis unavailable"],
        weaknesses: ["AI analysis failed"],
        recommendations: ["Check AI service configuration"],
        trainingNeeds: ["Manual review required"],
        processImprovements: ["Manual review required"],
        topPerformerInsights: "Unable to analyze",
        underperformerSupport: "Manual review required"
      },
      totalMessages: messages.length,
      analysisDate: new Date()
    };
  }
}

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({ 
    status: 'OK', 
    timestamp: new Date().toISOString(),
    port: PORT,
    hasOpenAI: !!process.env.OPENAI_API_KEY,
    hasMongoDB: !!mongoose.connection.readyState
  });
});

// Serve static files
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Error handling middleware
app.use((err, req, res, next) => {
  console.error('Server error:', err);
  res.status(500).json({ error: 'Internal server error' });
});

app.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
  console.log(`🌐 Health check: http://localhost:${PORT}/health`);
});
