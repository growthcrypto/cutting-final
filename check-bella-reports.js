const mongoose = require('mongoose');
require('dotenv').config();
const { DailyChatterReport } = require('./models');

const mongoUri = process.env.MONGODB_URI || process.env.MONGO_URL || 'mongodb://localhost:27017/onlyfans_analytics';

async function checkReports() {
  try {
    await mongoose.connect(mongoUri);
    console.log('✅ Connected to MongoDB\n');

    // Get all recent reports
    const allReports = await DailyChatterReport.find({}).sort({ date: -1 }).limit(20);
    console.log(`📊 Total recent reports: ${allReports.length}\n`);
    
    console.log('All recent daily reports:');
    allReports.forEach(r => {
      const creator = r.creator || 'NULL';
      const date = r.date.toISOString().split('T')[0];
      const revenue = r.totalRevenue || 0;
      console.log(`  Creator: "${creator}" | Chatter: ${r.chatterName} | Date: ${date} | Revenue: $${revenue}`);
    });

    // Check for Bella reports (case-insensitive)
    const bellaReports = await DailyChatterReport.find({ creator: /bella/i });
    console.log(`\n🔍 Bella reports (case-insensitive): ${bellaReports.length}`);
    bellaReports.forEach(r => {
      console.log(`  - Creator: "${r.creator}" | Chatter: ${r.chatterName} | Date: ${r.date.toISOString().split('T')[0]} | ID: ${r._id}`);
    });

    // Check what creator values exist
    const uniqueCreators = await DailyChatterReport.distinct('creator');
    console.log(`\n📋 Unique creator values in database: ${JSON.stringify(uniqueCreators)}`);

    await mongoose.disconnect();
    process.exit(0);
  } catch (error) {
    console.error('❌ Error:', error.message);
    process.exit(1);
  }
}

checkReports();

