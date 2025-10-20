const mongoose = require('mongoose');
const { DailyChatterReport, FanPurchase, CreatorAccount } = require('./models');

// This script migrates old FanPurchase records to the correct CreatorAccount
// based on the creator name stored in their linked DailyChatterReport

async function migrateCreatorAccounts() {
  try {
    console.log('🔄 Starting creator account migration...');
    
    // Get all creator accounts
    const accounts = await CreatorAccount.find({});
    console.log('📋 CreatorAccounts found:');
    accounts.forEach(a => console.log(`  - ${a.name} (ID: ${a._id})`));
    
    // Create a map: lowercase name → CreatorAccount ID
    const nameToIdMap = {};
    accounts.forEach(account => {
      const normalizedName = account.name.toLowerCase();
      nameToIdMap[normalizedName] = account._id;
    });
    
    console.log('🗺️ Name to ID map:', nameToIdMap);
    
    // Get all daily reports with creator field
    const reports = await DailyChatterReport.find({ creator: { $exists: true, $ne: null, $ne: '' } });
    console.log(`📊 Found ${reports.length} daily reports with creator field set`);
    
    let updatedCount = 0;
    let notFoundCount = 0;
    
    // For each report, update its linked FanPurchase records
    for (const report of reports) {
      const creatorName = report.creator.toLowerCase();
      const creatorAccountId = nameToIdMap[creatorName];
      
      if (!creatorAccountId) {
        console.log(`⚠️ No CreatorAccount found for: "${report.creator}"`);
        notFoundCount++;
        continue;
      }
      
      // Update all FanPurchase records linked to this report
      const result = await FanPurchase.updateMany(
        { dailyReport: report._id },
        { $set: { creatorAccount: creatorAccountId } }
      );
      
      if (result.modifiedCount > 0) {
        updatedCount += result.modifiedCount;
        console.log(`✅ Updated ${result.modifiedCount} purchases for report ${report.creator} (${report.date.toISOString().split('T')[0]})`);
      }
    }
    
    console.log('\n🎉 Migration complete!');
    console.log(`   ✅ Updated: ${updatedCount} FanPurchase records`);
    console.log(`   ⚠️ Skipped: ${notFoundCount} reports (no matching CreatorAccount)`);
    
    // Verify results
    const purchasesByModel = await FanPurchase.aggregate([
      { $group: { _id: '$creatorAccount', count: { $sum: 1 } } }
    ]);
    
    console.log('\n📊 FanPurchase distribution after migration:');
    for (const group of purchasesByModel) {
      const account = await CreatorAccount.findById(group._id);
      console.log(`  - ${account ? account.name : 'Unknown'}: ${group.count} purchases`);
    }
    
  } catch (error) {
    console.error('❌ Migration error:', error);
  } finally {
    await mongoose.connection.close();
    process.exit(0);
  }
}

// Connect and run
const MONGO_URL = process.env.MONGO_URL || 'mongodb://localhost:27017/onlyfans-analytics';
mongoose.connect(MONGO_URL).then(() => {
  console.log('✅ Connected to MongoDB');
  migrateCreatorAccounts();
}).catch(err => {
  console.error('❌ MongoDB connection error:', err);
  process.exit(1);
});

