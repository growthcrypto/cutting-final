
# 📊 MARKETING ANALYTICS - HOW METRICS ARE CALCULATED

## Data Sources

The system uses 3 main data sources:

1. **FanPurchase** - Every PPV sale and tip logged by chatters
2. **LinkTrackingData** - Link clicks/views uploaded by marketers (by category)
3. **VIPFan** - Individual fan tracking with firstSeenDate

---

## 🎯 KEY METRICS BREAKDOWN

### 1. **SPENDER RATE** (Conversion Efficiency)
**Formula:** `(Unique Spenders / Link Clicks) × 100`

**How it's calculated:**
```javascript
// Line 5119: Count unique VIP fans who purchased from this source
const spenderCount = source.vipPurchases.size;

// Line 5122-5123: Get link clicks for this source's CATEGORY
const linkData = linkTrackingMap[source.category] || { clicks: 0, views: 0 };
const linkClicks = linkData.clicks;

// Line 5126: Calculate spender rate
const spenderRate = linkClicks > 0 ? (spenderCount / linkClicks) * 100 : 0;
```

**Example:**
- 100 people clicked your Reddit link
- 3 of them became spenders
- Spender Rate = 3%

**Good benchmark:** 2-5% is excellent

---

### 2. **REVENUE PER CLICK** (ROI Metric)
**Formula:** `Total Revenue / Link Clicks`

**How it's calculated:**
```javascript
// Line 5129: Calculate revenue per click
const revenuePerClick = linkClicks > 0 ? source.revenue / linkClicks : 0;
```

**Example:**
- 100 clicks from Twitter
- $150 total revenue from Twitter fans
- Rev/Click = $1.50

**Good benchmark:** $1+ is profitable

---

### 3. **7-DAY RETENTION** (Stickiness)
**Formula:** `(Fans who purchased within 7 days of first purchase / Total tracked fans) × 100`

**How it's calculated:**
```javascript
// Line 5135-5138: Get all VIP fans from this source
const vipFans = await VIPFan.find({
  _id: { $in: Array.from(source.vipPurchases) },
  trafficSource: source.id
});

// Line 5143-5156: Check each fan's retention
vipFans.forEach(fan => {
  if (fan.firstSeenDate) {
    totalTracked++;
    const daysSinceFirstSeen = (new Date() - fan.firstSeenDate) / (1000 * 60 * 60 * 24);
    
    if (daysSinceFirstSeen >= 7) {
      // Check if they purchased within 7 days of first seen
      const sevenDaysAfterFirst = new Date(fan.firstSeenDate);
      sevenDaysAfterFirst.setDate(sevenDaysAfterFirst.getDate() + 7);
      
      if (fan.lastPurchaseDate >= fan.firstSeenDate && 
          fan.lastPurchaseDate <= sevenDaysAfterFirst) {
        retainedCount++;
      }
    }
  }
});

// Line 5158: Calculate retention rate
const retentionRate = totalTracked > 0 ? (retainedCount / totalTracked) * 100 : 0;
```

**Example:**
- 10 fans from Instagram made first purchase
- 7 of them purchased again within 7 days
- Retention = 70%

**Good benchmark:** 50%+ is excellent

---

### 4. **QUALITY SCORE** (A+ to F)
**Formula:** Weighted composite of 4 metrics (0-100 scale)

**How it's calculated:**
```javascript
// Line 5161-5164: Calculate component scores
const spenderRateScore = Math.min(spenderRate * 6, 30);      // Max 30 points
const revenuePerClickScore = Math.min(revenuePerClick * 10, 20); // Max 20 points
const retentionScore = retentionRate * 0.3;                  // Max 30 points
const avgSpenderScore = Math.min(avgPerSpender / 2, 20);     // Max 20 points

// Line 5166-5169: Sum to get quality grade
const qualityGrade = Math.min(
  spenderRateScore + revenuePerClickScore + retentionScore + avgSpenderScore,
  100
);

// Line 5171-5177: Convert to letter grade
if (qualityGrade >= 90) qualityScore = 'A+';
else if (qualityGrade >= 80) qualityScore = 'A';
else if (qualityGrade >= 70) qualityScore = 'B';
else if (qualityGrade >= 60) qualityScore = 'C';
else if (qualityGrade >= 50) qualityScore = 'D';
else qualityScore = 'F';
```

**Breakdown:**
- **30 points** - Spender Rate (5% = 30pts, scales at 6pts per %)
- **20 points** - Revenue per Click ($2 = 20pts, scales at 10pts per $)
- **30 points** - Retention Rate (100% = 30pts, scales at 0.3pts per %)
- **20 points** - Avg per Spender ($40 = 20pts, scales at 0.5pts per $)

**Example:**
- Spender Rate: 3% → 18 points
- Rev/Click: $1.50 → 15 points
- Retention: 60% → 18 points
- Avg Spender: $30 → 15 points
- **Total: 66 points = C grade**

---

### 5. **AVG PER SPENDER**
**Formula:** `Total Revenue / Unique Spenders`

**How it's calculated:**
```javascript
// Line 5132: Calculate average per spender
const avgPerSpender = spenderCount > 0 ? source.revenue / spenderCount : 0;
```

**Example:**
- $300 total revenue from TikTok
- 10 unique spenders
- Avg per Spender = $30

---

## 🔄 DATA FLOW

### When a Chatter Logs a Sale:

1. **Daily Report Submitted** (`POST /api/daily-reports`)
   ```javascript
   // For each PPV sale or tip:
   {
     amount: 25.00,
     trafficSource: "reddit_nsfw_id",
     vipFanUsername: "john123"
   }
   ```

2. **FanPurchase Created** (Line 4859-4875 in server-new.js)
   ```javascript
   const purchase = new FanPurchase({
     fanUsername: sale.vipFanUsername,
     amount: sale.amount,
     type: 'ppv',
     trafficSource: sale.trafficSource,
     date: reportDate,
     creatorAccount: report.creatorAccount,
     chatterName: req.user.username,
     dailyReport: savedReport._id
   });
   ```

3. **VIP Fan Auto-Created/Updated** (Line 4877-4917)
   ```javascript
   let vipFan = await VIPFan.findOne({
     username: sale.vipFanUsername,
     creatorAccount: report.creatorAccount
   });
   
   if (!vipFan) {
     vipFan = new VIPFan({
       username: sale.vipFanUsername,
       trafficSource: sale.trafficSource,
       firstSeenDate: reportDate,  // ← KEY for retention!
       lifetimeSpend: sale.amount,
       lastPurchaseDate: reportDate,
       purchaseCount: 1
     });
   } else {
     vipFan.lifetimeSpend += sale.amount;
     vipFan.lastPurchaseDate = reportDate;
     vipFan.purchaseCount += 1;
   }
   ```

### When a Marketer Uploads Link Data:

1. **Link Tracking Uploaded** (`POST /api/marketing/link-tracking`)
   ```javascript
   {
     category: "reddit",  // ← Not specific source!
     weekStart: "2025-01-01",
     weekEnd: "2025-01-07",
     landingPageViews: 1000,
     onlyFansClicks: 50
   }
   ```

2. **Stored by Category** (Line 4969-4978)
   ```javascript
   const linkData = new LinkTrackingData({
     category: req.body.category,  // reddit, twitter, etc.
     weekStart: new Date(req.body.weekStart),
     weekEnd: new Date(req.body.weekEnd),
     landingPageViews: parseInt(req.body.landingPageViews),
     onlyFansClicks: parseInt(req.body.onlyFansClicks)
   });
   ```

### When Dashboard Loads:

1. **Aggregate Purchases by Traffic Source** (Line 5063-5096)
   - Groups all purchases by their traffic source
   - Counts unique spenders (VIP fans)
   - Sums revenue

2. **Aggregate Link Data by Category** (Line 5098-5112)
   - Groups all link tracking by category
   - Sums clicks and views per category

3. **Match Source to Category** (Line 5122-5123)
   - Each traffic source has a category (e.g., "reddit")
   - Link clicks for that source = total clicks for its category

4. **Calculate All Metrics** (Line 5117-5202)
   - Spender rate, revenue/click, retention, quality score

5. **Sort by Quality** (Line 5205)
   - Best sources appear first!

---

## 📈 EXAMPLE CALCULATION

**Traffic Source:** "Reddit - r/nsfw"
**Category:** reddit

### Input Data:
- **Purchases:** 5 fans bought, $150 total revenue
- **Link Tracking:** 100 clicks on Reddit category
- **VIP Fans:** 
  - Fan A: First seen Jan 1, last purchase Jan 5 ✅ (retained)
  - Fan B: First seen Jan 1, last purchase Jan 10 ❌ (not retained)
  - Fan C: First seen Jan 1, last purchase Jan 3 ✅ (retained)
  - Fan D: First seen Jan 2, last purchase Jan 2 ❌ (only 0 days)
  - Fan E: First seen Jan 3, last purchase Jan 8 ✅ (retained)

### Calculated Metrics:
1. **Spender Rate:** 5 / 100 = **5%** ✅ Excellent!
2. **Revenue/Click:** $150 / 100 = **$1.50** ✅ Profitable!
3. **7-Day Retention:** 3 / 5 = **60%** ✅ Good!
4. **Avg per Spender:** $150 / 5 = **$30**
5. **Quality Score:**
   - Spender Rate: 5 × 6 = 30 pts
   - Rev/Click: 1.5 × 10 = 15 pts
   - Retention: 60 × 0.3 = 18 pts
   - Avg Spender: 30 / 2 = 15 pts
   - **Total: 78 pts = B grade** 🎯

---

## ✅ DATA INTEGRITY

### Prevents Double Counting:
- **Purchases** are logged once per sale by chatters
- **Link tracking** is uploaded once per week/category by marketers
- **Revenue** comes ONLY from FanPurchase records (not estimated)

### Accurate Attribution:
- Each purchase has a traffic source ID
- Each VIP fan has a traffic source ID (set on first purchase)
- Retention tracks from `firstSeenDate` (set when VIP is created)

### Category-Level Tracking:
- Link data is per category (one Reddit link for all subreddits)
- Each traffic source belongs to a category
- Metrics use category-level clicks for all sources in that category

---

## 🎯 KEY INSIGHTS

**What makes a source "high quality"?**
1. High spender rate (efficient conversion)
2. High revenue per click (profitable)
3. High retention (fans stick around)
4. High average per spender (valuable customers)

**Why sort by quality grade?**
- Shows which sources to double down on
- Shows which sources to cut
- Balances all important metrics, not just revenue

**Why track by category?**
- One link per platform (e.g., one Reddit link)
- Still see performance of specific subreddits
- Marketers don't need to create 100 different links

