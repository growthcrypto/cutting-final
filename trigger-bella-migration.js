// Script to trigger Bella migration via API
const readline = require('readline');

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

console.log('🔧 Bella Migration Trigger');
console.log('This will call the /api/migrate/add-bella endpoint');
console.log('');
console.log('Please provide:');
console.log('1. Your Railway app URL (e.g., https://your-app.railway.app)');
console.log('2. Your auth token (from browser localStorage: authToken)');
console.log('');

rl.question('Railway URL (or localhost:3000): ', (url) => {
  const baseUrl = url.trim() || 'http://localhost:3000';
  
  rl.question('Auth Token (from browser console: localStorage.getItem("authToken")): ', (token) => {
    if (!token.trim()) {
      console.log('❌ Token required');
      rl.close();
      return;
    }

    console.log('\n🔄 Calling migration endpoint...');
    fetch(`${baseUrl}/api/migrate/add-bella`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token.trim()}`,
        'Content-Type': 'application/json'
      }
    })
    .then(response => response.json())
    .then(data => {
      console.log('✅ Response:', JSON.stringify(data, null, 2));
      if (data.account) {
        console.log('\n✅ Bella added successfully!');
        console.log(`   Name: ${data.account.name}`);
        console.log(`   ID: ${data.account._id}`);
      }
      rl.close();
    })
    .catch(error => {
      console.error('❌ Error:', error.message);
      rl.close();
    });
  });
});

