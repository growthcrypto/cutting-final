# Railway Deployment Guide

## 🚀 Deploying to Railway

Railway is perfect for this application because it provides:
- **Easy deployment** from GitHub
- **Automatic scaling** 
- **Built-in database** options
- **Environment variable** management
- **Custom domains**

## 📋 Step-by-Step Deployment

### 1. Prepare Your Repository

First, make sure your code is in a GitHub repository:

```bash
# Initialize git if not already done
git init

# Add all files
git add .

# Commit your changes
git commit -m "Initial commit: Chatter Analytics System"

# Create a new repository on GitHub and push
git remote add origin https://github.com/yourusername/chatter-analytics.git
git push -u origin main
```

### 2. Deploy to Railway

1. **Go to Railway**: Visit [railway.app](https://railway.app)
2. **Sign up/Login**: Use your GitHub account
3. **New Project**: Click "New Project"
4. **Deploy from GitHub**: Select your repository
5. **Auto-deploy**: Railway will automatically detect it's a Node.js app

### 3. Configure Environment Variables

In your Railway project dashboard, go to **Variables** tab and add:

```
MONGODB_URI=mongodb+srv://username:password@cluster.mongodb.net/chatter_analytics
OPENAI_API_KEY=your_openai_api_key_here
NODE_ENV=production
PORT=5000
```

### 4. Database Options

#### Option A: Railway MongoDB (Recommended)
1. In Railway dashboard, click **+ New**
2. Select **Database** → **MongoDB**
3. Railway will automatically provide `MONGO_URL` environment variable

#### Option B: MongoDB Atlas (More Control)
1. Go to [MongoDB Atlas](https://www.mongodb.com/atlas)
2. Create a free cluster
3. Get connection string
4. Add to Railway environment variables as `MONGODB_URI`

### 5. Custom Domain (Optional)

1. In Railway dashboard, go to **Settings**
2. Click **Domains**
3. Add your custom domain
4. Railway will provide DNS instructions

## 🔧 Environment Variables Reference

| Variable | Description | Required | Example |
|----------|-------------|----------|---------|
| `MONGODB_URI` | MongoDB connection string | Yes | `mongodb+srv://user:pass@cluster.mongodb.net/db` |
| `OPENAI_API_KEY` | OpenAI API key for AI analysis | Yes | `sk-...` |
| `NODE_ENV` | Environment mode | No | `production` |
| `PORT` | Server port | No | `5000` (Railway sets this automatically) |

## 📊 Setting Up Sample Data

After deployment, you can set up sample data:

1. **Access your deployed app**: `https://your-app.railway.app`
2. **Go to Upload Data tab**
3. **Upload the sample CSV files** from `sample_data/` folder
4. **Start using the system!**

## 🔍 Monitoring & Logs

Railway provides excellent monitoring:
- **Logs**: View real-time application logs
- **Metrics**: CPU, memory, and network usage
- **Deployments**: Track deployment history

## 💰 Cost Considerations

Railway pricing:
- **Free tier**: $5 credit monthly (usually enough for small teams)
- **Pro plan**: $20/month for more resources
- **Database**: Included in Railway MongoDB

## 🚨 Troubleshooting

### Common Issues:

1. **Build Fails**
   - Check that all dependencies are in `package.json`
   - Ensure `start` script is defined

2. **Database Connection Error**
   - Verify MongoDB URI is correct
   - Check if database is accessible from Railway

3. **OpenAI API Error**
   - Verify API key is correct
   - Check API quota and billing

4. **File Upload Issues**
   - Railway has ephemeral file system
   - Files are processed and then cleaned up automatically

## 🔐 Security Best Practices

1. **Environment Variables**: Never commit secrets to git
2. **API Keys**: Use Railway's secure environment variable storage
3. **Database**: Use connection strings with proper authentication
4. **HTTPS**: Railway provides HTTPS by default

## 📈 Scaling

Railway automatically handles:
- **Traffic spikes**: Auto-scaling based on demand
- **Resource allocation**: CPU and memory scaling
- **Database connections**: Connection pooling

## 🎯 Team Access

Once deployed:
1. **Share the Railway URL** with your team
2. **Set up user authentication** (optional - can be added later)
3. **Train team members** on uploading data and using the dashboard

## 📱 Mobile Access

The dashboard is fully responsive and works great on:
- Desktop computers
- Tablets
- Mobile phones

Perfect for managers to check performance on the go!

## 🔄 Updates & Maintenance

To update your application:
1. **Push changes** to your GitHub repository
2. **Railway auto-deploys** the changes
3. **Zero downtime** deployments

## 📞 Support

- **Railway Docs**: [docs.railway.app](https://docs.railway.app)
- **Railway Discord**: Community support
- **GitHub Issues**: For application-specific issues
