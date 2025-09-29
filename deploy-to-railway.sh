#!/bin/bash

echo "🚀 Railway Deployment Setup"
echo "=========================="

# Check if git is initialized
if [ ! -d ".git" ]; then
    echo "📦 Initializing Git repository..."
    git init
    git add .
    git commit -m "Initial commit: Chatter Analytics System for Railway"
    echo "✅ Git repository initialized"
else
    echo "✅ Git repository already exists"
fi

# Check if we're connected to a remote
if ! git remote | grep -q origin; then
    echo ""
    echo "🔗 You need to connect to a GitHub repository:"
    echo "1. Create a new repository on GitHub"
    echo "2. Run these commands:"
    echo "   git remote add origin https://github.com/yourusername/your-repo-name.git"
    echo "   git push -u origin main"
    echo ""
    echo "Then deploy to Railway:"
    echo "1. Go to https://railway.app"
    echo "2. Sign up with GitHub"
    echo "3. Click 'New Project' → 'Deploy from GitHub'"
    echo "4. Select your repository"
    echo "5. Add environment variables:"
    echo "   - MONGODB_URI (or use Railway's MongoDB)"
    echo "   - OPENAI_API_KEY"
    echo ""
else
    echo "✅ Git remote configured"
    echo "🔄 Pushing to GitHub..."
    git add .
    git commit -m "Update for Railway deployment" || echo "No changes to commit"
    git push origin main
    echo "✅ Code pushed to GitHub"
    echo ""
    echo "🚀 Now deploy to Railway:"
    echo "1. Go to https://railway.app"
    echo "2. Sign up with GitHub"
    echo "3. Click 'New Project' → 'Deploy from GitHub'"
    echo "4. Select your repository"
    echo "5. Add environment variables in Railway dashboard"
fi

echo ""
echo "📋 Required Environment Variables:"
echo "   MONGODB_URI=mongodb+srv://username:password@cluster.mongodb.net/chatter_analytics"
echo "   OPENAI_API_KEY=your_openai_api_key_here"
echo "   NODE_ENV=production"
echo ""
echo "📚 For detailed instructions, see railway-setup.md"
