#!/bin/bash

echo "🚀 Installing Chatter Analytics & AI Feedback System"
echo "=================================================="

# Check if Node.js is installed
if ! command -v node &> /dev/null; then
    echo "❌ Node.js is not installed. Please install Node.js first."
    echo "   Visit: https://nodejs.org/"
    exit 1
fi

# Check if npm is installed
if ! command -v npm &> /dev/null; then
    echo "❌ npm is not installed. Please install npm first."
    exit 1
fi

echo "✅ Node.js and npm are installed"

# Install dependencies
echo "📦 Installing dependencies..."
npm install

# Check if .env file exists
if [ ! -f .env ]; then
    echo "📝 Creating .env file from template..."
    cp env.example .env
    echo "⚠️  Please edit .env file with your configuration:"
    echo "   - MongoDB URI"
    echo "   - OpenAI API Key"
    echo ""
    echo "   You can edit it with: nano .env"
    echo ""
    read -p "Press Enter after you've configured .env file..."
fi

# Check if MongoDB is running (optional)
echo "🔍 Checking MongoDB connection..."
if command -v mongod &> /dev/null; then
    if pgrep -x "mongod" > /dev/null; then
        echo "✅ MongoDB is running"
    else
        echo "⚠️  MongoDB is not running. Please start MongoDB:"
        echo "   - macOS: brew services start mongodb-community"
        echo "   - Linux: sudo systemctl start mongod"
        echo "   - Windows: net start MongoDB"
    fi
else
    echo "⚠️  MongoDB not found. Please install MongoDB:"
    echo "   - macOS: brew install mongodb-community"
    echo "   - Linux: sudo apt-get install mongodb"
    echo "   - Windows: Download from https://www.mongodb.com/try/download/community"
fi

# Setup database
echo "🗄️  Setting up database..."
node setup.js

echo ""
echo "🎉 Installation complete!"
echo ""
echo "📋 Next steps:"
echo "1. Make sure MongoDB is running"
echo "2. Configure your .env file with OpenAI API key"
echo "3. Start the server: npm start"
echo "4. Open your browser: http://localhost:5000"
echo "5. Upload sample data from sample_data/ folder"
echo ""
echo "📚 For more information, see README.md"
