// Quick script to wipe chatters and messages for clean testing
const mongoose = require('mongoose');
require('dotenv').config();

async function wipe() {
  try {
    await mongoose.connect(process.env.MONGO_URL);
    console.log('Connected to MongoDB');

    const db = mongoose.connection.db;
    
    // Delete chatters (but keep manager account)
    const usersResult = await db.collection('users').deleteMany({ role: { $ne: 'manager' } });
    console.log(`✅ Deleted ${usersResult.deletedCount} chatter accounts`);
    
    // Delete messages
    const messagesResult = await db.collection('messages').deleteMany({});
    console.log(`✅ Deleted ${messagesResult.deletedCount} messages`);
    
    // Delete message analysis
    const analysisResult = await db.collection('messageanalyses').deleteMany({});
    console.log(`✅ Deleted ${analysisResult.deletedCount} message analyses`);
    
    console.log('\n🎉 Database wiped for testing! You can now:');
    console.log('1. Create new chatter accounts');
    console.log('2. Upload fresh message data');
    console.log('3. Test all features from scratch\n');
    
    await mongoose.disconnect();
  } catch (error) {
    console.error('Error:', error);
  }
}

wipe();
