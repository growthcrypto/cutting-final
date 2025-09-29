const express = require('express');
const mongoose = require('mongoose');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 5000;

// Basic middleware
app.use(express.json());
app.use(express.static('public'));

// MongoDB Connection
let dbConnected = false;
const mongoUri = process.env.MONGODB_URI || process.env.MONGO_URL;

if (mongoUri) {
  console.log('🔌 Attempting to connect to MongoDB...');
  mongoose.connect(mongoUri, {
    useNewUrlParser: true,
    useUnifiedTopology: true,
  }).then(() => {
    console.log('✅ Connected to MongoDB successfully!');
    dbConnected = true;
  }).catch((error) => {
    console.error('❌ MongoDB connection error:', error.message);
    console.log('⚠️  App will continue without database connection');
  });
} else {
  console.log('⚠️  No MongoDB URI found - running without database');
}

// Simple database models
const chatterSchema = new mongoose.Schema({
  name: { type: String, required: true },
  email: { type: String, required: true },
  team: { type: String, required: true },
  joinDate: { type: Date, default: Date.now },
  isActive: { type: Boolean, default: true }
});

const Chatter = mongoose.model('Chatter', chatterSchema);

// Health check
app.get('/health', (req, res) => {
  res.json({ 
    status: 'OK', 
    message: 'Chatter Analytics System is running!',
    timestamp: new Date().toISOString(),
    port: PORT,
    database: dbConnected ? 'Connected' : 'Not connected',
    mongoUri: mongoUri ? 'Set' : 'Not set'
  });
});

// Test database endpoint
app.get('/api/test-db', async (req, res) => {
  if (!dbConnected) {
    return res.json({ error: 'Database not connected' });
  }
  
  try {
    const chatters = await Chatter.find();
    res.json({ 
      message: 'Database working!', 
      chatters: chatters.length,
      sample: chatters.slice(0, 3)
    });
  } catch (error) {
    res.json({ error: error.message });
  }
});

// Main route
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Start server
app.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
  console.log(`🌐 Visit: http://localhost:${PORT}`);
  console.log(`🔍 Health check: http://localhost:${PORT}/health`);
  console.log(`🗄️  Database test: http://localhost:${PORT}/api/test-db`);
});

// Handle errors
process.on('uncaughtException', (err) => {
  console.error('Uncaught Exception:', err);
});

process.on('unhandledRejection', (err) => {
  console.error('Unhandled Rejection:', err);
});
