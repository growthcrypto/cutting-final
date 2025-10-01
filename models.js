const mongoose = require('mongoose');

// User Management
const userSchema = new mongoose.Schema({
  username: { type: String, required: true, unique: true },
  email: { type: String, required: true, unique: true },
  password: { type: String, required: true },
  role: { type: String, enum: ['manager', 'chatter'], required: true },
  chatterName: { type: String }, // For chatter accounts
  isActive: { type: Boolean, default: true },
  createdAt: { type: Date, default: Date.now }
});

// Creator/Account Management
const creatorAccountSchema = new mongoose.Schema({
  name: { type: String, required: true }, // "Creator 1", "Creator 2", etc.
  accountName: { type: String, required: true }, // OnlyFans account name
  isActive: { type: Boolean, default: true },
  isMainAccount: { type: Boolean, default: true }, // Which account is primarily used
  createdAt: { type: Date, default: Date.now }
});

// Guidelines Management
const guidelineSchema = new mongoose.Schema({
  title: { type: String, required: true },
  description: { type: String, required: true },
  category: { type: String, enum: ['sales', 'engagement', 'language', 'professionalism'], required: true },
  weight: { type: Number, default: 1, min: 1, max: 5 }, // Importance weighting
  examples: [{ type: String }], // Good examples
  counterExamples: [{ type: String }], // What not to do
  isActive: { type: Boolean, default: true },
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now }
});

// Daily Chatter Reports
const dailyChatterReportSchema = new mongoose.Schema({
  chatterName: { type: String, required: true },
  date: { type: Date, required: true },
  shift: { type: String, enum: ['morning', 'afternoon', 'evening', 'night'], required: true },
  
  // PPV Data
  ppvSales: [{
    amount: { type: Number, required: true },
    creatorAccount: { type: mongoose.Schema.Types.ObjectId, ref: 'CreatorAccount' },
    timestamp: { type: Date, default: Date.now }
  }],
  
  // Tips Data
  tips: [{
    amount: { type: Number, required: true },
    creatorAccount: { type: mongoose.Schema.Types.ObjectId, ref: 'CreatorAccount' },
    timestamp: { type: Date, default: Date.now }
  }],
  
  // Performance Metrics
  fansChatted: { type: Number, default: 0 },
  avgResponseTime: { type: Number, default: 0 }, // in minutes
  
  // Calculated Fields
  totalPPVRevenue: { type: Number, default: 0 },
  totalTipRevenue: { type: Number, default: 0 },
  totalRevenue: { type: Number, default: 0 },
  avgPPVPrice: { type: Number, default: 0 },
  avgTipAmount: { type: Number, default: 0 },
  
  notes: { type: String },
  createdAt: { type: Date, default: Date.now }
});

// Weekly Message Analysis
const messageAnalysisSchema = new mongoose.Schema({
  chatterName: { type: String, required: true },
  weekStartDate: { type: Date, required: true },
  weekEndDate: { type: Date, required: true },
  
  // Message Data
  totalMessages: { type: Number, default: 0 },
  messagesSample: [{ type: String }], // Sample messages for analysis
  
  // AI Scores
  overallScore: { type: Number, min: 0, max: 100, default: 0 },
  guidelinesScore: { type: Number, min: 0, max: 100, default: 0 },
  grammarScore: { type: Number, min: 0, max: 100, default: 0 },
  engagementScore: { type: Number, min: 0, max: 100, default: 0 },
  
  // Detailed Analysis
  strengths: [{ type: String }],
  weaknesses: [{ type: String }],
  recommendations: [{ type: String }],
  
  // Guidelines Breakdown
  guidelinesAnalysis: [{
    guidelineId: { type: mongoose.Schema.Types.ObjectId, ref: 'Guideline' },
    score: { type: Number, min: 0, max: 100 },
    feedback: { type: String },
    examples: [{ type: String }]
  }],
  
  // Performance Metrics
  avgMessageLength: { type: Number, default: 0 },
  avgResponseTime: { type: Number, default: 0 },
  keywordUsage: [{ keyword: String, count: Number }],
  
  processedAt: { type: Date, default: Date.now }
});

// Weekly Account Data (from Infloww)
const accountDataSchema = new mongoose.Schema({
  creatorAccount: { type: mongoose.Schema.Types.ObjectId, ref: 'CreatorAccount', required: true },
  weekStartDate: { type: Date, required: true },
  weekEndDate: { type: Date, required: true },
  
  // Account Metrics
  netRevenue: { type: Number, default: 0 },
  totalSubs: { type: Number, default: 0 },
  newSubs: { type: Number, default: 0 },
  profileClicks: { type: Number, default: 0 },
  recurringRevenue: { type: Number, default: 0 },
  
  // Calculated Rates
  clickToSubRate: { type: Number, default: 0 }, // (newSubs / profileClicks) * 100
  renewalRate: { type: Number, default: 0 }, // (recurringRevenue / totalRevenue) * 100
  
  createdAt: { type: Date, default: Date.now }
});

// Chatter Performance Data (from Infloww)
const chatterPerformanceSchema = new mongoose.Schema({
  chatterName: { type: String, required: true },
  creatorAccount: { type: mongoose.Schema.Types.ObjectId, ref: 'CreatorAccount', required: true },
  weekStartDate: { type: Date, required: true },
  weekEndDate: { type: Date, required: true },
  
  // Performance Metrics
  messagesSent: { type: Number, default: 0 },
  ppvsSent: { type: Number, default: 0 },
  ppvsUnlocked: { type: Number, default: 0 },
  fansChattedWith: { type: Number, default: 0 },
  avgResponseTime: { type: Number, default: 0 }, // in minutes
  
  // Revenue & Profitability
  totalRevenue: { type: Number, default: 0 }, // Gross revenue
  netSales: { type: Number, default: 0 }, // Net revenue after costs
  
  // Calculated Rates (only chatter-specific metrics)
  unlockRate: { type: Number, default: 0 }, // (ppvsUnlocked / ppvsSent) * 100
  profitMargin: { type: Number, default: 0 }, // (netSales / totalRevenue) * 100 - chatter-specific
  netRevenuePerFan: { type: Number, default: 0 }, // netSales / fansChattedWith - chatter-specific
  
  createdAt: { type: Date, default: Date.now }
});

// AI Analysis Results
const aiAnalysisSchema = new mongoose.Schema({
  analysisType: { type: String, enum: ['agency_health', 'chatter_individual', 'opportunity_sizing'], required: true },
  dateRange: {
    start: { type: Date, required: true },
    end: { type: Date, required: true }
  },
  
  // Analysis Results
  criticalIssues: [{
    issue: { type: String, required: true },
    severity: { type: String, enum: ['low', 'medium', 'high', 'critical'], required: true },
    affectedMetrics: [{ type: String }],
    description: { type: String }
  }],
  
  recommendations: [{
    title: { type: String, required: true },
    description: { type: String, required: true },
    priority: { type: String, enum: ['low', 'medium', 'high'], required: true },
    expectedImpact: { type: String },
    roiCalculation: {
      currentValue: { type: Number },
      potentialValue: { type: Number },
      weeklyImpact: { type: Number },
      monthlyImpact: { type: Number }
    }
  }],
  
  opportunities: [{
    title: { type: String, required: true },
    description: { type: String, required: true },
    potentialRevenue: { type: Number },
    implementationDifficulty: { type: String, enum: ['easy', 'medium', 'hard'] }
  }],
  
  keyInsights: [{ type: String }],
  performanceMetrics: { type: mongoose.Schema.Types.Mixed }, // Flexible data structure
  
  generatedAt: { type: Date, default: Date.now }
});

// Performance History - Track improvement over time
const performanceHistorySchema = new mongoose.Schema({
  chatterName: { type: String, required: true },
  weekStartDate: { type: Date, required: true },
  weekEndDate: { type: Date, required: true },
  
  // Key Metrics Snapshot
  metrics: {
    ppvsSent: { type: Number, default: 0 },
    ppvsUnlocked: { type: Number, default: 0 },
    unlockRate: { type: Number, default: 0 },
    messagesSent: { type: Number, default: 0 },
    fansChatted: { type: Number, default: 0 },
    avgResponseTime: { type: Number, default: 0 },
    messagesPerPPV: { type: Number, default: 0 },
    messagesPerFan: { type: Number, default: 0 },
    
    // Message Quality Scores
    grammarScore: { type: Number, default: 0 },
    guidelinesScore: { type: Number, default: 0 },
    overallScore: { type: Number, default: 0 }
  },
  
  // Actions Recommended from AI Analysis
  recommendedActions: [{
    action: { type: String },
    priority: { type: String, enum: ['low', 'medium', 'high'] },
    expectedImpact: { type: String },
    implemented: { type: Boolean, default: false },
    implementedDate: { type: Date },
    notes: { type: String }
  }],
  
  // Week-over-Week Changes
  improvements: {
    unlockRateChange: { type: Number, default: 0 }, // percentage points
    responseTimeChange: { type: Number, default: 0 }, // minutes
    qualityScoreChange: { type: Number, default: 0 }, // points
    messagesPerPPVChange: { type: Number, default: 0 }
  },
  
  // Overall Improvement Score (0-100)
  improvementScore: { type: Number, default: 0 },
  
  // Analysis Summary
  aiAnalysisId: { type: mongoose.Schema.Types.ObjectId, ref: 'AIAnalysis' },
  
  createdAt: { type: Date, default: Date.now }
});

// Export all models
const User = mongoose.model('User', userSchema);
const CreatorAccount = mongoose.model('CreatorAccount', creatorAccountSchema);
const Guideline = mongoose.model('Guideline', guidelineSchema);
const DailyChatterReport = mongoose.model('DailyChatterReport', dailyChatterReportSchema);
const MessageAnalysis = mongoose.model('MessageAnalysis', messageAnalysisSchema);
const AccountData = mongoose.model('AccountData', accountDataSchema);
const ChatterPerformance = mongoose.model('ChatterPerformance', chatterPerformanceSchema);
const AIAnalysis = mongoose.model('AIAnalysis', aiAnalysisSchema);
const PerformanceHistory = mongoose.model('PerformanceHistory', performanceHistorySchema);

// Legacy models for compatibility
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
  responseTime: { type: Number, default: 0 },
  customerSatisfaction: { type: Number, default: 0 },
  upsells: { type: Number, default: 0 },
  refunds: { type: Number, default: 0 },
  activeSubscribers: { type: Number, default: 0 },
  newSubscribers: { type: Number, default: 0 },
  churnRate: { type: Number, default: 0 },
  profileClicks: { type: Number, default: 0 },
  ppvsSent: { type: Number, default: 0 },
  ppvsUnlocked: { type: Number, default: 0 },
  totalSubs: { type: Number, default: 0 }
});

const Chatter = mongoose.model('Chatter', chatterSchema);
const Analytics = mongoose.model('Analytics', analyticsSchema);

module.exports = {
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
};
