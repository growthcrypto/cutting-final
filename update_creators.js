require('dotenv').config();
const mongoose = require('mongoose');
const { CreatorAccount } = require('./models');

mongoose.connect(process.env.MONGODB_URI)
  .then(async () => {
    console.log('Connected to MongoDB');
    
    const creators = await CreatorAccount.find().sort({ _id: 1 });
    console.log('Found creators:', creators.length);
    
    if (creators[0]) {
      creators[0].name = 'Arya';
      creators[0].accountName = '@arya_of';
      await creators[0].save();
      console.log('✅ Updated to Arya');
    }
    
    if (creators[1]) {
      creators[1].name = 'Iris';
      creators[1].accountName = '@iris_of';
      await creators[1].save();
      console.log('✅ Updated to Iris');
    }
    
    if (creators[2]) {
      creators[2].name = 'Lilla';
      creators[2].accountName = '@lilla_of';
      await creators[2].save();
      console.log('✅ Updated to Lilla');
    }
    
    console.log('🎉 All creators updated!');
    process.exit(0);
  })
  .catch(err => {
    console.error('Error:', err);
    process.exit(1);
  });
