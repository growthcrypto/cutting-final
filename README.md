# Chatter Analytics & AI Feedback System

A comprehensive analytics and AI-powered feedback system for sales chatters in OnlyFans agencies. This system allows you to upload analytics data, visualize performance metrics, and receive AI-generated insights and recommendations.

## Features

### 📊 Analytics Dashboard
- **Real-time Metrics**: Revenue, conversions, response time, customer satisfaction
- **Visual Charts**: Revenue trends, team performance distribution
- **Individual Performance**: Detailed breakdown per chatter
- **Team Overview**: Aggregate team statistics

### 🤖 AI-Powered Analysis
- **Individual Chatter Analysis**: Personalized feedback and recommendations
- **Team Analysis**: Team-wide insights and improvement suggestions
- **Message Analysis**: AI analysis of conversation patterns
- **Trend Detection**: Identifies patterns and opportunities

### 📤 Data Upload System
- **CSV/Excel Support**: Upload analytics and message data
- **Batch Processing**: Handle large datasets efficiently
- **Data Validation**: Ensures data integrity

## Quick Start

### Prerequisites
- Node.js (v14 or higher)
- MongoDB (local or cloud)
- OpenAI API key

### Installation

1. **Clone and Install Dependencies**
   ```bash
   cd /Users/marcosmiguelwhelan/ew
   npm install
   ```

2. **Environment Setup**
   ```bash
   cp env.example .env
   # Edit .env with your configuration
   ```

3. **Configure Environment Variables**
   ```bash
   # Required: OpenAI API Key
   OPENAI_API_KEY=your_openai_api_key_here
   
   # Required: MongoDB Connection
   MONGODB_URI=mongodb://localhost:27017/chatter_analytics
   
   # Optional: Server Port
   PORT=5000
   ```

4. **Start the Application**
   ```bash
   npm start
   # or for development
   npm run dev
   ```

5. **Access the Application**
   Open your browser and go to: `http://localhost:5000`

## Data Format Requirements

### Analytics Data (CSV/Excel)
Required columns for analytics upload:
- `chatterName` - Name of the chatter
- `date` - Date of the analytics (YYYY-MM-DD)
- `messagesSent` - Number of messages sent
- `messagesReceived` - Number of messages received
- `revenue` - Revenue generated
- `conversions` - Number of conversions
- `responseTime` - Average response time in minutes
- `customerSatisfaction` - Customer satisfaction rating (1-10)
- `upsells` - Number of upsells
- `refunds` - Number of refunds
- `activeSubscribers` - Number of active subscribers
- `newSubscribers` - Number of new subscribers
- `churnRate` - Churn rate percentage

### Messages Data (CSV/Excel)
Required columns for messages upload:
- `chatterName` - Name of the chatter
- `timestamp` - Message timestamp
- `messageType` - Either "sent" or "received"
- `content` - Message content
- `customerId` - Customer identifier
- `conversationId` - Conversation identifier

## Usage Guide

### 1. Upload Data
- Go to the "Upload Data" tab
- Upload your analytics CSV/Excel file
- Upload your messages CSV/Excel file
- Wait for processing confirmation

### 2. View Dashboard
- Navigate to the "Dashboard" tab
- View team metrics and individual performance
- Analyze revenue trends and performance charts

### 3. AI Analysis
- Go to the "AI Analysis" tab
- Select a chatter and date range
- Click "Analyze Individual" for personal insights
- Click "Analyze Team" for team-wide analysis

## API Endpoints

### Analytics
- `GET /api/analytics/:chatterId` - Get chatter analytics
- `GET /api/analytics/team/:team` - Get team analytics
- `POST /api/upload/analytics` - Upload analytics data

### Messages
- `POST /api/upload/messages` - Upload messages data

### AI Analysis
- `POST /api/analyze/chatter/:chatterId` - Analyze individual chatter
- `POST /api/analyze/team/:team` - Analyze team performance

## AI Analysis Features

### Individual Chatter Analysis
- **Performance Rating**: Overall 1-10 rating
- **Strengths**: Top 3 identified strengths
- **Weaknesses**: Top 3 areas for improvement
- **Recommendations**: Specific actionable advice
- **Trend Analysis**: Performance pattern insights
- **Revenue Opportunities**: Ways to increase revenue

### Team Analysis
- **Team Rating**: Overall team performance
- **Team Strengths/Weaknesses**: Collective insights
- **Training Needs**: Identified training requirements
- **Process Improvements**: Workflow optimization suggestions
- **Top Performer Insights**: Learn from best performers
- **Underperformer Support**: Support strategies

## Customization

### Adding New Metrics
1. Update the `analyticsSchema` in `server.js`
2. Modify the upload form validation
3. Update the dashboard visualization
4. Adjust AI analysis prompts

### Modifying AI Analysis
1. Edit the `generateAIAnalysis` function
2. Update the AI prompts for different insights
3. Add new analysis categories
4. Customize feedback templates

## Troubleshooting

### Common Issues

1. **MongoDB Connection Error**
   - Ensure MongoDB is running
   - Check connection string in `.env`
   - Verify database permissions

2. **OpenAI API Error**
   - Verify API key is correct
   - Check API quota and billing
   - Ensure internet connectivity

3. **File Upload Issues**
   - Check file format (CSV/Excel)
   - Verify required columns exist
   - Ensure file size is reasonable

4. **Analysis Not Working**
   - Check if data is uploaded
   - Verify date ranges
   - Ensure chatter exists in database

## Security Considerations

- Store API keys securely
- Use environment variables for sensitive data
- Implement authentication for production use
- Validate all uploaded data
- Use HTTPS in production

## Production Deployment

1. **Environment Setup**
   - Use production MongoDB instance
   - Set secure API keys
   - Configure proper CORS settings

2. **Performance Optimization**
   - Implement data pagination
   - Add caching for frequent queries
   - Optimize database indexes

3. **Monitoring**
   - Add logging and error tracking
   - Monitor API usage and costs
   - Set up performance metrics

## Support

For issues or questions:
1. Check the troubleshooting section
2. Review the API documentation
3. Check server logs for errors
4. Verify data format requirements

## License

MIT License - Feel free to modify and use for your agency needs.
# Force redeploy - Thu Oct  2 23:37:57 CEST 2025
# Redeploy trigger - Mon Oct  6 03:10:05 CEST 2025
# Force redeploy - Mon Oct  6 03:33:54 CEST 2025
