const mongoose = require('mongoose');
require('dotenv').config();

async function deepCheck() {
  try {
    const mongoUri = process.env.MONGODB_URI || process.env.MONGO_URL || 'mongodb://localhost:27017/onlyfans_analytics';
    console.log('🔌 Connecting to MongoDB...');
    console.log('🔗 URI:', mongoUri);
    await mongoose.connect(mongoUri);
    console.log('✅ Connected\n');
    
    const db = mongoose.connection.db;
    const dbName = db.databaseName;
    console.log('📊 Database Name:', dbName, '\n');
    
    // Check accountdatas specifically
    const accountDatas = await db.collection('accountdatas').find({}).toArray();
    console.log('accountdatas collection:', accountDatas.length, 'documents');
    if (accountDatas.length > 0) {
      console.log('Sample:', JSON.stringify(accountDatas[0], null, 2));
    }
    
    // Check for any revenue-related data
    const collections = await db.listCollections().toArray();
    
    for (const col of collections) {
      const count = await db.collection(col.name).countDocuments();
      if (count > 0) {
        const sample = await db.collection(col.name).findOne();
        // Check if it has revenue, subs, or clicks
        if (sample && (sample.totalRevenue || sample.netRevenue || sample.totalSubs || sample.profileClicks)) {
          console.log('\n🚨 FOUND DATA IN:', col.name);
          console.log('Count:', count);
          console.log('Sample:', JSON.stringify(sample, null, 2));
        }
      }
    }
    
    process.exit(0);
  } catch (error) {
    console.error('❌ Error:', error);
    process.exit(1);
  }
}

deepCheck();

