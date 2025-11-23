const mongoose = require('mongoose');
require('dotenv').config();
const { CreatorAccount } = require('./models');

const mongoUri = process.env.MONGODB_URI || process.env.MONGO_URL || 'mongodb://localhost:27017/onlyfans_analytics';

async function addBella() {
  try {
    console.log('🔌 Connecting to MongoDB...');
    console.log('📍 Database:', mongoUri.replace(/\/\/.*@/, '//***@'));
    
    await mongoose.connect(mongoUri);
    console.log('✅ Connected to MongoDB');

    // Check if Bella already exists
    const existing = await CreatorAccount.findOne({ name: 'Bella' });
    
    if (existing) {
      console.log('✅ Bella already exists:');
      console.log(`   Name: ${existing.name}`);
      console.log(`   Account: ${existing.accountName}`);
      console.log(`   Active: ${existing.isActive}`);
      console.log(`   ID: ${existing._id}`);
      
      // Ensure it's active
      if (!existing.isActive) {
        existing.isActive = true;
        await existing.save();
        console.log('✅ Activated Bella');
      }
    } else {
      // Create Bella
      const bella = new CreatorAccount({
        name: 'Bella',
        accountName: 'bella_account',
        isActive: true,
        isMainAccount: true
      });
      
      await bella.save();
      console.log('✅ Created Bella:');
      console.log(`   Name: ${bella.name}`);
      console.log(`   Account: ${bella.accountName}`);
      console.log(`   ID: ${bella._id}`);
    }

    // List all active accounts
    const allActive = await CreatorAccount.find({ isActive: true }).sort({ name: 1 });
    console.log('\n📋 All active creator accounts:');
    allActive.forEach(acc => {
      console.log(`   - ${acc.name} (${acc.accountName})`);
    });
    console.log(`\n✅ Total: ${allActive.length} active accounts`);

    await mongoose.disconnect();
    console.log('\n✅ Done!');
    process.exit(0);
  } catch (error) {
    console.error('❌ Error:', error.message);
    process.exit(1);
  }
}

addBella();

