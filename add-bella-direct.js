const mongoose = require('mongoose');
require('dotenv').config();
const { CreatorAccount } = require('./models');

// Use the same connection logic as server-new.js
const mongoUri = process.env.MONGODB_URI || process.env.MONGO_URL || 'mongodb://localhost:27017/onlyfans_analytics';

async function addBellaDirect() {
  try {
    console.log('🔌 Connecting to MongoDB...');
    console.log('📍 URI:', mongoUri.replace(/\/\/.*@/, '//***@'));
    
    await mongoose.connect(mongoUri, {
      serverSelectionTimeoutMS: 10000,
    });
    
    console.log('✅ Connected to MongoDB');
    
    // Check if Bella exists
    let bella = await CreatorAccount.findOne({ name: 'Bella' });
    
    if (bella) {
      console.log('📋 Bella already exists:');
      console.log(`   ID: ${bella._id}`);
      console.log(`   Active: ${bella.isActive}`);
      
      if (!bella.isActive) {
        bella.isActive = true;
        await bella.save();
        console.log('✅ Activated Bella');
      } else {
        console.log('✅ Bella is already active');
      }
    } else {
      // Create Bella
      bella = new CreatorAccount({
        name: 'Bella',
        accountName: 'bella_account',
        isActive: true,
        isMainAccount: true
      });
      
      await bella.save();
      console.log('✅ Created Bella:');
      console.log(`   ID: ${bella._id}`);
      console.log(`   Name: ${bella.name}`);
      console.log(`   Account: ${bella.accountName}`);
    }
    
    // Verify all active accounts
    const allActive = await CreatorAccount.find({ isActive: true }).sort({ name: 1 });
    console.log('\n📋 All active creator accounts:');
    allActive.forEach(acc => {
      console.log(`   - ${acc.name} (${acc._id})`);
    });
    console.log(`\n✅ Total: ${allActive.length} active accounts`);
    
    await mongoose.disconnect();
    console.log('\n✅ Done!');
    process.exit(0);
  } catch (error) {
    console.error('❌ Error:', error.message);
    if (error.message.includes('authentication')) {
      console.error('💡 Make sure MONGODB_URI is set correctly');
    }
    process.exit(1);
  }
}

addBellaDirect();

