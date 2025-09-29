const mongoose = require('mongoose');
require('dotenv').config();

// Database Models (same as in server.js)
const chatterSchema = new mongoose.Schema({
  name: { type: String, required: true },
  email: { type: String, required: true },
  team: { type: String, required: true },
  joinDate: { type: Date, default: Date.now },
  isActive: { type: Boolean, default: true }
});

const Chatter = mongoose.model('Chatter', chatterSchema);

async function setupDatabase() {
  try {
    console.log('🔌 Connecting to MongoDB...');
    await mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/chatter_analytics', {
      useNewUrlParser: true,
      useUnifiedTopology: true,
    });
    console.log('✅ Connected to MongoDB successfully!');

    // Create sample chatters
    console.log('👥 Creating sample chatters...');
    
    const sampleChatters = [
      {
        name: 'Sarah Johnson',
        email: 'sarah.johnson@agency.com',
        team: 'sales',
        joinDate: new Date('2023-06-01'),
        isActive: true
      },
      {
        name: 'Mike Chen',
        email: 'mike.chen@agency.com',
        team: 'sales',
        joinDate: new Date('2023-07-15'),
        isActive: true
      },
      {
        name: 'Emma Davis',
        email: 'emma.davis@agency.com',
        team: 'sales',
        joinDate: new Date('2023-05-20'),
        isActive: true
      },
      {
        name: 'Alex Rodriguez',
        email: 'alex.rodriguez@agency.com',
        team: 'sales',
        joinDate: new Date('2023-08-10'),
        isActive: true
      }
    ];

    // Clear existing chatters and insert new ones
    await Chatter.deleteMany({});
    await Chatter.insertMany(sampleChatters);
    
    console.log('✅ Sample chatters created successfully!');
    console.log('📊 You can now upload analytics and messages data using the sample CSV files.');
    console.log('🚀 Start the server with: npm start');
    
  } catch (error) {
    console.error('❌ Setup failed:', error.message);
  } finally {
    await mongoose.disconnect();
    console.log('🔌 Disconnected from MongoDB');
  }
}

// Check if .env file exists
const fs = require('fs');
if (!fs.existsSync('.env')) {
  console.log('⚠️  .env file not found!');
  console.log('📝 Please copy env.example to .env and configure your settings:');
  console.log('   cp env.example .env');
  console.log('   # Then edit .env with your MongoDB URI and OpenAI API key');
  process.exit(1);
}

// Run setup
setupDatabase();
