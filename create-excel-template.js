// Quick script to show you how to structure your Excel
// You can copy this into Excel directly

console.log(`
📊 BULK UPLOAD EXCEL TEMPLATE
================================

Create an Excel file with these sheets:

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

📋 SHEET 1: "Chatter Performance"
Headers (Row 1):
Chatter Name | Date | Messages Sent | PPVs Sent | PPVs Unlocked | Fans Chatted | Avg Response Time

Example Data (Rows 2+):
Gypsy  | 10/09/2025 | 632  | 18 | 10 | 41 | 4.5
Gypsy  | 10/10/2025 | 725  | 17 | 5  | 45 | 3.2
CJ     | 10/09/2025 | 268  | 4  | 2  | 47 | 5.1
Agile  | 10/09/2025 | 31   | 0  | 0  | 15 | 7.2
John   | 10/09/2025 | 283  | 1  | 0  | 38 | 6.0

📍 Column Details:
- Chatter Name: The chatter's name (Gypsy, CJ, etc.)
- Date: MM/DD/YYYY format
- Messages Sent: Total messages sent that day
- PPVs Sent: Number of PPV messages sent
- PPVs Unlocked: Number of PPVs purchased by fans
- Fans Chatted: Unique fans messaged
- Avg Response Time: Minutes (optional)

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

📸 SHEET 2: "Account Snapshots"
Headers (Row 1):
Creator Name | Date | Total Subs | Active Fans | With Renew

Example Data (Rows 2+):
Arya  | 10/09/2025 | 171 | 163 | 25
Arya  | 10/10/2025 | 186 | 184 | 26
Iris  | 10/09/2025 | 282 | 358 | 35
Iris  | 10/10/2025 | 302 | 311 | 44
Lilla | 10/09/2025 | 286 | 318 | 20
Lilla | 10/10/2025 | 306 | 26  | 25

📍 Column Details:
- Creator Name: Model/creator name (Arya, Iris, Lilla)
- Date: MM/DD/YYYY format
- Total Subs: Total subscribers on that day
- Active Fans: Active fans on that day
- With Renew: Fans with auto-renew enabled

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

💰 SHEET 3: "Daily Sales"
Headers (Row 1):
Chatter Name | Date | Revenue

Example Data (Rows 2+):
Gypsy | 10/09/2025 | 666.00
Gypsy | 10/10/2025 | 223.69
Gypsy | 10/11/2025 | 320.00
CJ    | 10/09/2025 | 55.00
Agile | 10/10/2025 | 215.00
John  | 10/10/2025 | 1030.00

📍 Column Details:
- Chatter Name: The chatter's name
- Date: MM/DD/YYYY format
- Revenue: Total revenue (include $ or not, both work)

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

🔗 SHEET 4: "Link Tracking"
Headers (Row 1):
Category | Creator Name | Date | Landing Page Views | OnlyFans Clicks

Example Data (Rows 2+):
reddit    | Arya  | 10/09/2025 | 1250 | 456
twitter   | Arya  | 10/09/2025 | 890  | 123
reddit    | Iris  | 10/09/2025 | 2100 | 678
instagram | Lilla | 10/09/2025 | 1450 | 234

📍 Column Details:
- Category: reddit, twitter, instagram, tiktok, youtube, or other
- Creator Name: Which model/creator
- Date: MM/DD/YYYY format
- Landing Page Views: How many people saw your landing page
- OnlyFans Clicks: How many clicked through to OnlyFans

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

⭐ SHEET 5: "VIP Fans" (Optional)
Headers (Row 1):
Fan Username | Total Spent | Creator Name

Example Data (Rows 2+):
john_doe_123    | 587.50  | Arya
mike_premium    | 1250.00 | Iris
alex_vip        | 342.00  | Lilla
sarah_top_fan   | 2100.50 | Arya

📍 Column Details:
- Fan Username: Fan's username on OnlyFans
- Total Spent: Lifetime spend (must be $100+ to be VIP)
- Creator Name: Which model they're subbed to

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

💬 SHEET 6: "Messages" (Optional - for AI Analysis)
Headers (Row 1):
Chatter Name | Message Text | Timestamp | Fan Username

Example Data (Rows 2+):
Gypsy | hey babe how are you today        | 10/09/2025 10:30 | john123
Gypsy | want to see something special? 😏 | 10/09/2025 10:35 | john123
CJ    | good morning handsome             | 10/09/2025 09:15 | mike456

📍 Column Details:
- Chatter Name: Who sent the message
- Message Text: The actual message content
- Timestamp: When it was sent (optional)
- Fan Username: Who received it (optional)

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

✅ FLEXIBLE COLUMN NAMES - These all work:

"Chatter Name" = "chatterName" = "Chatter" = "chatter"
"PPVs Sent" = "PPV Sent" = "ppvsSent"
"Messages Sent" = "Messages" = "messagesSent"
"Total Subs" = "Subscribers" = "totalSubs"
"Creator Name" = "Model" = "creatorName"

System recognizes all variations!

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

🚀 USAGE:
1. Create Excel with these sheets
2. Fill in your data (rows = chatters/models, columns = metrics)
3. Save as .xlsx
4. Upload to "Data Upload" in dashboard
5. Review confirmation summary
6. Click Import!

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
`);

