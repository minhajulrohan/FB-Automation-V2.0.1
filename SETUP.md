# Quick Setup Guide

## Installation Steps

### 1. Install Node.js
Download and install Node.js from: https://nodejs.org/
(Choose LTS version - recommended)

### 2. Extract Project
Extract the fb-comment-automation folder to your desired location

### 3. Open Command Prompt
- Press `Win + R`
- Type `cmd` and press Enter
- Navigate to project folder:
```
cd C:\path\to\fb-comment-automation
```

### 4. Install Dependencies
Run this command:
```
npm install
```
Wait for installation to complete (2-5 minutes)

### 5. Install Playwright Browser
Run this command:
```
npx playwright install chromium
```

### 6. Start Application
Run this command:
```
npm start
```

The application window will open!

## First Time Usage

### Step 1: Export Facebook Cookies

1. Install Chrome Extension: "Cookie-Editor"
   - https://chrome.google.com/webstore (search "Cookie-Editor")

2. Login to Facebook in Chrome

3. Click Cookie-Editor extension icon

4. Click "Export" → "JSON"

5. Copy the JSON text

### Step 2: Add First Account

1. In the app, click "Accounts" in sidebar
2. Click "Add Account"
3. Fill in:
   - Name: "My Account 1"
   - Cookies: Paste the JSON you copied
   - Proxy: Leave empty (optional)
   - User Agent: Leave empty (optional)
4. Click "Save Account"

### Step 3: Add Facebook Groups

1. Click "Groups" in sidebar
2. Click "Import Multiple"
3. Paste group URLs (one per line):
```
https://www.facebook.com/groups/123456789
https://www.facebook.com/groups/987654321
```
4. Click "Import Groups"

### Step 4: Setup Comment Templates

1. Click "Templates" in sidebar
2. Select your account from dropdown
3. Add templates:
   - First Comment: "Hi"
   - Regular templates (click "+ Add Template" for each):
     - "Nice post!"
     - "Great content!"
     - "Thanks for sharing!"
4. Click "Save Templates"

### Step 5: Configure Settings

1. Click "Settings" in sidebar
2. Review and adjust:
   - Comment delay: 30-120 seconds
   - Max comments: 20
   - Enable auto-react: ✓
   - Reaction probability: 70%
3. Click "Save Settings"

### Step 6: Start Automation!

1. Click "Dashboard" in sidebar
2. Click "Start Automation"
3. Watch the live logs!

## Troubleshooting

### "npm: command not found"
→ Node.js not installed correctly. Reinstall Node.js

### "Cannot find module"
→ Run `npm install` again

### "Cookies expired"
→ Export fresh cookies from Facebook

### Account shows "Banned"
→ Account has checkpoint. Use different account

### Comments not posting
→ Check:
- Account is enabled
- Templates are saved
- Group allows posts from members

## Tips

1. **Start with 1 account and 5 groups** to test
2. **Use incognito to export cookies** for cleaner data
3. **Update cookies every 2 weeks** for best results
4. **Watch logs carefully** on first run
5. **Increase delays** if getting too many pending comments

## Daily Usage

1. Open application: `npm start`
2. Check dashboard stats
3. Click "Start Automation"
4. Monitor live logs
5. Review activity page

## Support

If you encounter issues:
1. Check `logs/error.log` file
2. Review live logs in dashboard
3. Verify account cookies are fresh
4. Ensure groups are public/member accessible

---

Need help? Contact: [Your Support Contact]
