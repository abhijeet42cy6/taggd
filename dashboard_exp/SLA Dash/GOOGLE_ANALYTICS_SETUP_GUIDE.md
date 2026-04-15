# 📊 GOOGLE ANALYTICS 4 SETUP GUIDE

## ✅ COMPLETE STEP-BY-STEP INSTRUCTIONS

---

## **PART 1: CREATE GOOGLE ANALYTICS 4 PROPERTY**

### Step 1: Access Google Analytics
1. Go to: **https://analytics.google.com**
2. Sign in with your Google account
3. If you don't have an account, click "Start for free"

### Step 2: Create Account (If First Time)
1. Click **"Start measuring"**
2. **Account Name**: Enter "TAGGD" or your organization name
3. Check all boxes for account data sharing settings
4. Click **"Next"**

### Step 3: Create Property
1. **Property Name**: Enter **"TAGGD SLA Dashboard"**
2. **Reporting Time Zone**: Select your timezone (e.g., "India - Kolkata")
3. **Currency**: Select "Indian Rupee (₹)" or your currency
4. Click **"Next"**

### Step 4: Business Information
1. **Industry Category**: Select "Business Support & Logistics"
2. **Business Size**: Select your organization size
3. **Business Objectives**: Check:
   - ✅ Examine user behavior
   - ✅ Measure online conversions
   - ✅ Get to know your customers
4. Click **"Create"**

### Step 5: Accept Terms of Service
1. Select your country: **India** (or your country)
2. Check both boxes:
   - ✅ I accept the Google Analytics Terms of Service Agreement
   - ✅ I accept the Data Processing Terms
3. Click **"I Accept"**

---

## **PART 2: SET UP DATA STREAM**

### Step 6: Create Web Data Stream
1. You'll see "Choose a platform" screen
2. Click **"Web"** (globe icon)

### Step 7: Configure Stream Details
1. **Website URL**: Enter your dashboard URL
   - **Production**: `https://businessexcellence.github.io/SLA-DASHBOARD/` (GitHub Pages)
   - **Sandbox**: `https://3000-in27j4kvifkpo1odihjj8-b237eb32.sandbox.novita.ai`
2. **Stream Name**: "TAGGD SLA Dashboard - Production"
3. ✅ Check **"Enhanced measurement"** (leave ON)
4. Click **"Create stream"**

### Step 8: Copy Measurement ID
1. After stream creation, you'll see stream details
2. Find **"Measurement ID"** at the top right
   - Format: `G-XXXXXXXXXX` (e.g., `G-ABC123DEF4`)
3. **COPY THIS ID** - you'll need it in next step

**Example:**
```
Measurement ID
G-ABC123DEF4
```

---

## **PART 3: UPDATE DASHBOARD CODE**

### Step 9: Update Tracking ID in Code

**Find and Replace in `index.html`:**

**Current Code (Line ~2800):**
```html
<!-- Google Analytics 4 (GA4) -->
<script async src="https://www.googletagmanager.com/gtag/js?id=G-XXXXXXXXXX"></script>
<script>
    window.dataLayer = window.dataLayer || [];
    function gtag(){dataLayer.push(arguments);}
    gtag('js', new Date());
    
    // Replace 'G-XXXXXXXXXX' with your actual GA4 Measurement ID
    gtag('config', 'G-XXXXXXXXXX', {
        'page_title': document.title,
        'page_location': window.location.href,
        'page_path': window.location.pathname
    });
</script>
```

**Updated Code (Replace BOTH occurrences):**
```html
<!-- Google Analytics 4 (GA4) -->
<script async src="https://www.googletagmanager.com/gtag/js?id=G-ABC123DEF4"></script>
<script>
    window.dataLayer = window.dataLayer || [];
    function gtag(){dataLayer.push(arguments);}
    gtag('js', new Date());
    
    // Your actual GA4 Measurement ID
    gtag('config', 'G-ABC123DEF4', {
        'page_title': document.title,
        'page_location': window.location.href,
        'page_path': window.location.pathname
    });
</script>
```

**⚠️ IMPORTANT**: Replace `G-ABC123DEF4` with YOUR actual Measurement ID from Step 8!

---

## **PART 4: DEPLOY & VERIFY**

### Step 10: Push Updated Code to GitHub
```bash
cd /home/user/webapp
git add index.html
git commit -m "chore: Add Google Analytics tracking ID"
git push origin main
```

### Step 11: Wait for Data Collection
- **First 24 hours**: GA4 needs time to start collecting data
- **Data appears in**: 24-48 hours typically
- **Real-time data**: Available after 5-10 minutes

### Step 12: Verify Tracking is Working

**Method 1: Real-time Report**
1. Go to: https://analytics.google.com
2. Click on your property "TAGGD SLA Dashboard"
3. In left sidebar, click **"Reports" → "Realtime"**
4. Open your dashboard in a new tab
5. Within 30 seconds, you should see **1 user** in Real-time report

**Method 2: Browser Console**
1. Open dashboard
2. Press F12 → Console tab
3. Look for: `📊 Google Analytics initialized`
4. Type: `dataLayer` and press Enter
5. You should see an array with tracking events

**Method 3: Chrome Extension (Recommended)**
1. Install: "Google Analytics Debugger" Chrome extension
2. Enable the extension
3. Open dashboard
4. Press F12 → Console tab
5. Look for GA4 debug messages

---

## **PART 5: VIEW ANALYTICS DATA**

### Where to See Dashboard Usage Stats

#### **A) Realtime Report** (Immediate)
**Path**: Reports → Realtime

**Shows:**
- 👥 Current active users (right now)
- 📍 Users by country (geographic location)
- 📄 Most viewed pages (which dashboard views)
- 🔄 User activity in last 30 minutes

**Use Case**: See who's using the dashboard RIGHT NOW

---

#### **B) Engagement Report** (Historical)
**Path**: Reports → Engagement → Overview

**Shows:**
- 📊 **Total Users**: Unique visitors
- 👀 **Total Views**: Page views count
- ⏱️ **Avg Engagement Time**: How long users stay
- 📱 **New vs Returning**: First-time vs repeat users
- 📈 **Engagement Rate**: % of engaged sessions

**Use Case**: Understand overall dashboard usage trends

---

#### **C) Pages and Screens Report**
**Path**: Reports → Engagement → Pages and screens

**Shows:**
- 📄 Most popular pages/views:
  - Overview Dashboard
  - Forecasting
  - Industry Met% Analysis
  - Project-wise Analysis
  - etc.
- 🕐 Time spent on each page
- 📊 Engagement metrics per page

**Use Case**: Which dashboard views are most used?

---

#### **D) User Attributes Report**
**Path**: Reports → User → User attributes

**Shows:**
- 🌍 **Country**: Where users are from
- 🏙️ **City**: Specific cities
- 🗣️ **Language**: Browser language
- 💻 **Device Category**: Desktop, Mobile, Tablet
- 🌐 **Browser**: Chrome, Firefox, Safari, etc.
- 🖥️ **OS**: Windows, Mac, Linux, etc.

**Use Case**: Understand your dashboard audience

---

#### **E) Traffic Acquisition Report**
**Path**: Reports → Acquisition → Traffic acquisition

**Shows:**
- 🔗 **Referral Sources**: How users found the dashboard
  - Direct (typed URL)
  - Organic Search (Google, Bing)
  - Referral (from other websites)
  - Email (if shared via email)
  - Social (if shared on social media)

**Use Case**: How are users discovering the dashboard?

---

#### **F) Custom Reports (Advanced)**
**Path**: Reports → Library → Create new report

**You Can Track:**
- Admin panel access (event: `admin_access`)
- Failed login attempts (event: `admin_access_failed`)
- Specific view loads (pageviews)
- Excel file uploads (if you add event tracking)
- Filter usage (if you add event tracking)
- Export actions (if you add event tracking)

---

## **PART 6: ACCESS VIA ADMIN PANEL**

### Step 13: Use Dashboard's Admin Panel
1. Open your dashboard
2. Press **`Ctrl + Shift + A`** on keyboard
3. Enter password: **`Taggd@2026`**
4. Click **"Open Google Analytics Dashboard"** button
5. You'll be redirected to GA4 with instructions

---

## **COMMON QUESTIONS & ANSWERS**

### Q1: When will I see data?
**A**: Real-time data appears in 5-30 minutes. Historical reports appear in 24-48 hours.

### Q2: Can I track specific user names?
**A**: No. GA4 is privacy-compliant and doesn't track personal identifiable information (PII). You'll see anonymous user counts only.

### Q3: How long is data stored?
**A**: GA4 stores data for 14 months by default (configurable to 2-14 months).

### Q4: Is it free?
**A**: Yes! Google Analytics 4 is completely free for up to 10 million events per month.

### Q5: What if my Measurement ID doesn't work?
**A**: 
1. Double-check you copied the entire ID (G-XXXXXXXXXX)
2. Ensure you replaced BOTH occurrences in code
3. Clear browser cache after updating code
4. Wait 24 hours for data to appear

### Q6: Can I have multiple dashboards tracked?
**A**: Yes! You can either:
- Use same Measurement ID for all (combined tracking)
- Create separate Data Streams for each (separate tracking)

### Q7: How do I export analytics data?
**A**:
1. Go to any report in GA4
2. Click "Share this report" (top right)
3. Choose: Download as PDF, CSV, or Google Sheets
4. Set date range and download

---

## **TROUBLESHOOTING**

### Issue 1: No Data Appearing After 24 Hours

**Check:**
1. ✅ Measurement ID is correct (G-XXXXXXXXXX format)
2. ✅ Code is updated in both places
3. ✅ Changes are pushed to GitHub / deployed
4. ✅ You're viewing correct property in GA4
5. ✅ Data Stream is enabled (not paused)

**Solution:**
- Open browser DevTools (F12) → Network tab
- Look for request to `www.google-analytics.com/g/collect`
- If present: Tracking works, wait for data
- If missing: Check Measurement ID again

---

### Issue 2: Real-time Shows 0 Users But I'm Using Dashboard

**Check:**
1. ✅ Using correct dashboard URL (not localhost)
2. ✅ Browser isn't blocking analytics (check ad-blockers)
3. ✅ Not using Incognito/Private mode (may block tracking)
4. ✅ Cookies enabled in browser

**Solution:**
- Disable ad-blocker temporarily
- Use regular browser window
- Check browser console for errors

---

### Issue 3: See Traffic But Can't Identify Departments/Teams

**Solution (Add Custom Dimensions):**
1. In GA4, go to: Admin → Data display → Custom definitions
2. Create custom dimension:
   - **Dimension name**: "User Department"
   - **Scope**: User
   - **User property**: department
3. Update dashboard code to send department info
4. Requires code modification (ask if needed)

---

## **NEXT STEPS AFTER SETUP**

### Week 1: Monitor Real-time
- Check if tracking is working
- Verify events are being recorded
- Test admin panel access tracking

### Week 2: Analyze Engagement
- Review which views are most popular
- Check average session duration
- Identify peak usage times

### Month 1: Generate Reports
- Export monthly usage report
- Share with stakeholders
- Identify improvement areas

### Ongoing: Optimize
- Add custom events for key actions
- Create custom reports for specific needs
- Set up automated email reports

---

## **QUICK REFERENCE**

| Task | URL / Shortcut |
|------|----------------|
| **GA4 Dashboard** | https://analytics.google.com |
| **Admin Panel** | Press `Ctrl + Shift + A` |
| **Admin Password** | `Taggd@2026` |
| **Real-time Report** | Reports → Realtime |
| **Engagement Report** | Reports → Engagement → Overview |
| **User Report** | Reports → User → User attributes |

---

## **SUPPORT CONTACTS**

**Google Analytics Help:**
- Help Center: https://support.google.com/analytics
- Community: https://support.google.com/analytics/community

**Dashboard Support:**
- Admin Panel: Press `Ctrl + Shift + A`
- GitHub Repo: https://github.com/Businessexcellence/SLA-DASHBOARD

---

## **SUMMARY CHECKLIST**

- [ ] Created GA4 property "TAGGD SLA Dashboard"
- [ ] Set up Web Data Stream
- [ ] Copied Measurement ID (G-XXXXXXXXXX)
- [ ] Updated code with real Measurement ID (both places)
- [ ] Pushed changes to GitHub
- [ ] Waited 24 hours for data collection
- [ ] Verified tracking in Real-time report
- [ ] Checked Engagement reports
- [ ] Set up automated email reports (optional)
- [ ] Shared analytics access with team (optional)

---

**Status**: 📊 **READY FOR GOOGLE ANALYTICS INTEGRATION**  
**Time Required**: ⏱️ **15-20 minutes setup + 24 hours wait**  
**Cost**: 💰 **FREE**  
**Difficulty**: 🟢 **Easy** (Just copy-paste Measurement ID)

