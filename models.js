const mongoose = require('mongoose');

// User Management
const userSchema = new mongoose.Schema({
  username: { type: String, required: true, unique: true },
  email: { type: String, required: true, unique: true },
  password: { type: String, required: true },
  role: { type: String, enum: ['manager', 'chatter', 'marketer'], required: true },
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
  // Accept both legacy and new categories for backward compatibility
  category: { 
    type: String, 
    enum: [
      // Legacy
      'sales', 'engagement', 'language', 'professionalism', 'messaging',
      // New
      'General Chatting', 'Psychology', 'Captions', 'Sales'
    ], 
    required: true 
  },
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
    trafficSource: { type: mongoose.Schema.Types.ObjectId, ref: 'TrafficSource' }, // NEW: Track source
    vipFanUsername: { type: String }, // NEW: VIP fan username (optional)
    timestamp: { type: Date, default: Date.now }
  }],
  
  // Tips Data
  tips: [{
    amount: { type: Number, required: true },
    creatorAccount: { type: mongoose.Schema.Types.ObjectId, ref: 'CreatorAccount' },
    trafficSource: { type: mongoose.Schema.Types.ObjectId, ref: 'TrafficSource' }, // NEW: Track source
    vipFanUsername: { type: String }, // NEW: VIP fan username (optional)
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
  
  // NEW: Individual Message Records (for flow analysis)
  messageRecords: [{
    fanUsername: { type: String, required: true },
    originalFanUsername: { type: String, required: true }, // Keep original for reference
    messageText: { type: String, required: true },
    timestamp: { type: Date, required: true },
    date: { type: Date, required: true },
    replyTime: { type: Number, default: 0 }, // minutes between fan's last message and this message
    creatorPage: { type: String, required: true },
    isPPV: { type: Boolean, default: false },
    ppvRevenue: { type: Number, default: 0 }, // revenue if this message is a PPV
    ppvPurchased: { type: Boolean, default: false }, // whether the PPV was actually purchased
    isDeletedUser: { type: Boolean, default: false } // flag for deleted user accounts
  }],
  
  // AI Scores
  overallScore: { type: Number, min: 0, max: 100, default: 0 },
  guidelinesScore: { type: Number, min: 0, max: 100, default: 0 },
  grammarScore: { type: Number, min: 0, max: 100, default: 0 },
  
  // DETAILED SCORE BREAKDOWNS
  grammarBreakdown: {
    spellingErrors: { type: String },
    grammarIssues: { type: String },
    punctuationProblems: { type: String },
    informalLanguage: { type: String },
    scoreExplanation: { type: String }
  },
  guidelinesBreakdown: {
    salesEffectiveness: { type: String },
    engagementQuality: { type: String },
    captionQuality: { type: String },
    conversationFlow: { type: String },
    scoreExplanation: { type: String }
  },
  overallBreakdown: {
    messageClarity: { type: String },
    emotionalImpact: { type: String },
    conversionPotential: { type: String },
    scoreExplanation: { type: String }
  },
  engagementScore: { type: Number, min: 0, max: 100, default: 0 },
  
  // Detailed Analysis
  strengths: [{ type: String }],
  weaknesses: [{ type: String }],
  recommendations: [{ type: String }],
  suggestions: [{ type: String }], // Added for compatibility
  
  // NEW: Chatting Style Analysis
  chattingStyle: {
    directness: { type: String },
    friendliness: { type: String },
    salesApproach: { type: String },
    personality: { type: String },
    emojiUsage: { type: String },
    messageLength: { type: String },
    responsePattern: { type: String }
  },
  
  // NEW: Message Pattern Analysis
  messagePatterns: {
    questionFrequency: { type: String },
    exclamationUsage: { type: String },
    capitalizationStyle: { type: String },
    punctuationStyle: { type: String },
    topicDiversity: { type: String },
    sexualContent: { type: String },
    personalSharing: { type: String }
  },
  
  // NEW: Engagement Effectiveness
  engagementMetrics: {
    conversationStarter: { type: String },
    conversationMaintainer: { type: String },
    salesConversation: { type: String },
    fanRetention: { type: String }
  },
  
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
  
  // Revenue
  netSales: { type: Number, default: 0 }, // Net revenue after costs
  
  // Calculated Rates (only chatter-specific metrics)
  unlockRate: { type: Number, default: 0 }, // (ppvsUnlocked / ppvsSent) * 100
  avgPPVPrice: { type: Number, default: 0 }, // netSales / ppvsUnlocked - average revenue per PPV purchased
  // Note: Removed profitMargin since we don't have actual costs data
  netRevenuePerFan: { type: Number, default: 0 }, // netSales / fansChattedWith - chatter-specific
  
  createdAt: { type: Date, default: Date.now }
});

// AI Analysis Results
const aiAnalysisSchema = new mongoose.Schema({
  chatterName: { type: String, required: true }, // Chatter username
  timestamp: { type: Date, default: Date.now },
  
  // Core Scores
  grammarScore: { type: Number, min: 0, max: 100, default: 0 },
  guidelinesScore: { type: Number, min: 0, max: 100, default: 0 },
  overallScore: { type: Number, min: 0, max: 100, default: 0 },
  
  // Detailed Breakdowns
  grammarBreakdown: { type: mongoose.Schema.Types.Mixed, default: {} },
  guidelinesBreakdown: { type: mongoose.Schema.Types.Mixed, default: {} },
  overallBreakdown: { type: mongoose.Schema.Types.Mixed, default: {} },
  
  // Executive Analysis
  executiveSummary: { type: mongoose.Schema.Types.Mixed, default: {} },
  advancedMetrics: { type: mongoose.Schema.Types.Mixed, default: {} },
  strategicInsights: { type: mongoose.Schema.Types.Mixed, default: {} },
  actionPlan: { type: mongoose.Schema.Types.Mixed, default: {} },
  
  // Legacy fields (optional - for backwards compatibility with old agency analysis)
  analysisType: { type: String, enum: ['agency_health', 'chatter_individual', 'opportunity_sizing'] },
  dateRange: {
    start: { type: Date },
    end: { type: Date }
  },
  criticalIssues: [{ type: mongoose.Schema.Types.Mixed }],
  recommendations: [{ type: mongoose.Schema.Types.Mixed }],
  opportunities: [{ type: mongoose.Schema.Types.Mixed }],
  keyInsights: [{ type: String }],
  performanceMetrics: { type: mongoose.Schema.Types.Mixed },
  
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

// ==================== MARKETING ANALYTICS SCHEMAS ====================

// Traffic Sources - Track different marketing channels
const trafficSourceSchema = new mongoose.Schema({
  name: { type: String, required: true }, // "Reddit - r/fitness"
  category: { type: String, enum: ['reddit', 'twitter', 'instagram', 'tiktok', 'youtube', 'other'], required: true },
  subcategory: { type: String }, // "r/fitness", "viral_thread_123"
  isActive: { type: Boolean, default: true },
  createdAt: { type: Date, default: Date.now },
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' }
});

// VIP Fans - High-value fans tracked individually
const vipFanSchema = new mongoose.Schema({
  username: { type: String, required: true }, // OnlyFans username
  creatorAccount: { type: mongoose.Schema.Types.ObjectId, ref: 'CreatorAccount', required: true },
  trafficSource: { type: mongoose.Schema.Types.ObjectId, ref: 'TrafficSource' },
  
  // Fan Details
  joinDate: { type: Date, required: true },
  firstSeenDate: { type: Date }, // NEW: When we first tracked this fan
  status: { 
    type: String, 
    enum: ['active', 'churned'], 
    default: 'active' 
  },
  
  // Financial Metrics
  lifetimeSpend: { type: Number, default: 0 },
  lastPurchaseDate: { type: Date },
  purchaseCount: { type: Number, default: 0 },
  avgPurchaseValue: { type: Number, default: 0 },
  
  // Engagement
  isEngaged: { type: Boolean, default: false }, // Has responded to messages
  isGhost: { type: Boolean, default: false }, // Never responds
  firstResponseDate: { type: Date },
  lastMessageDate: { type: Date }, // NEW: Last time they messaged (for retention tracking)
  
  // Metadata
  notes: { type: String },
  tags: [{ type: String }],
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now }
});

// Fan Purchases - Individual purchase tracking (linked to daily logs)
const fanPurchaseSchema = new mongoose.Schema({
  vipFan: { type: mongoose.Schema.Types.ObjectId, ref: 'VIPFan' },
  fanUsername: { type: String }, // For non-VIP purchases
  
  amount: { type: Number, required: true },
  type: { type: String, enum: ['ppv', 'tip', 'subscription', 'message'], required: true },
  trafficSource: { type: mongoose.Schema.Types.ObjectId, ref: 'TrafficSource' },
  
  date: { type: Date, required: true },
  creatorAccount: { type: mongoose.Schema.Types.ObjectId, ref: 'CreatorAccount', required: true },
  chatterName: { type: String, required: true },
  
  // Link to daily report
  dailyReport: { type: mongoose.Schema.Types.ObjectId, ref: 'DailyChatterReport' },
  
  createdAt: { type: Date, default: Date.now }
});

// Traffic Source Performance - Aggregated weekly metrics
const trafficSourcePerformanceSchema = new mongoose.Schema({
  trafficSource: { type: mongoose.Schema.Types.ObjectId, ref: 'TrafficSource', required: true },
  creatorAccount: { type: mongoose.Schema.Types.ObjectId, ref: 'CreatorAccount', required: true },
  
  weekStartDate: { type: Date, required: true },
  weekEndDate: { type: Date, required: true },
  
  // Subscriber Metrics
  newSubscribers: { type: Number, default: 0 },
  totalSubscribers: { type: Number, default: 0 }, // Cumulative
  activeSubscribers: { type: Number, default: 0 },
  churnedSubscribers: { type: Number, default: 0 },
  
  // Revenue Metrics
  totalRevenue: { type: Number, default: 0 },
  vipRevenue: { type: Number, default: 0 },
  regularRevenue: { type: Number, default: 0 },
  revenuePerSub: { type: Number, default: 0 },
  
  // Engagement Metrics
  vipCount: { type: Number, default: 0 },
  vipConversionRate: { type: Number, default: 0 }, // % who become VIPs
  ghostCount: { type: Number, default: 0 },
  ghostRate: { type: Number, default: 0 },
  engagedCount: { type: Number, default: 0 },
  engagementRate: { type: Number, default: 0 },
  buyerCount: { type: Number, default: 0 },
  buyerRate: { type: Number, default: 0 },
  
  // Funnel Metrics (from link tracking)
  landingPageViews: { type: Number, default: 0 },
  onlyFansClicks: { type: Number, default: 0 },
  clickThroughRate: { type: Number, default: 0 },
  subscriptionConversionRate: { type: Number, default: 0 },
  
  // Retention (calculated monthly)
  retentionRate30Day: { type: Number, default: 0 },
  retentionRate60Day: { type: Number, default: 0 },
  retentionRate90Day: { type: Number, default: 0 },
  
  // Quality Score (A+ to F)
  qualityScore: { type: String },
  qualityGrade: { type: Number, default: 0 }, // 0-100
  
  createdAt: { type: Date, default: Date.now }
});

// Link Tracking Data - Weekly uploads from Bitly/Linktree
const linkTrackingDataSchema = new mongoose.Schema({
  category: { type: String, enum: ['reddit', 'twitter', 'instagram', 'tiktok', 'youtube', 'other'], required: true }, // NEW: Track by category, not specific source
  creatorAccount: { type: mongoose.Schema.Types.ObjectId, ref: 'CreatorAccount', required: true },
  
  weekStartDate: { type: Date, required: true },
  weekEndDate: { type: Date, required: true },
  
  landingPageViews: { type: Number, required: true },
  onlyFansClicks: { type: Number, required: true },
  clickThroughRate: { type: Number, default: 0 },
  
  // Optional detailed metrics
  uniqueVisitors: { type: Number },
  avgTimeOnPage: { type: Number }, // seconds
  bounceRate: { type: Number },
  topCountries: [{ country: String, views: Number }],
  topDevices: [{ device: String, views: Number }],
  
  uploadedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  createdAt: { type: Date, default: Date.now }
});

const TrafficSource = mongoose.model('TrafficSource', trafficSourceSchema);
const VIPFan = mongoose.model('VIPFan', vipFanSchema);
const FanPurchase = mongoose.model('FanPurchase', fanPurchaseSchema);
const TrafficSourcePerformance = mongoose.model('TrafficSourcePerformance', trafficSourcePerformanceSchema);
const LinkTrackingData = mongoose.model('LinkTrackingData', linkTrackingDataSchema);

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
  Analytics,
  TrafficSource,
  VIPFan,
  FanPurchase,
  TrafficSourcePerformance,
  LinkTrackingData
};
