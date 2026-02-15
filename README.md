# Facebook Group Comment Automation Desktop Software

A powerful Windows desktop application for automating Facebook group comments with advanced anti-ban systems, built with Electron.js, Node.js, and Playwright.

![Dashboard Preview](https://img.shields.io/badge/Platform-Windows-blue)
![Node](https://img.shields.io/badge/Node.js-18+-green)
![Electron](https://img.shields.io/badge/Electron-28+-purple)

## 🎯 Features

### Core Automation
- ✅ Manage 10-20 Facebook accounts simultaneously
- ✅ Automate comments on specific posts (post URLs)
- ✅ **NEW:** Random initial comment → Edit with template
- ✅ **NEW:** "Hi" + your template automatic formatting
- ✅ Auto-react to own comments (Like, Love, Haha, Wow)
- ✅ Smart status checking (pending/declined detection)
- ✅ Auto-delete pending/declined comments
- ✅ Duplicate post prevention

### Anti-Ban System
- 🛡️ Human behavior simulation
- 🛡️ Random delays and timing
- 🛡️ Mouse movement & scroll simulation
- 🛡️ Typing simulation (no instant paste)
- 🛡️ Account cooldown & sleep cycles
- 🛡️ Proxy support per account
- 🛡️ Custom User-Agent support
- 🛡️ Working hours scheduler
- 🛡️ Checkpoint/ban detection

### Dashboard
- 📊 Real-time statistics
- 📊 Live activity logs
- 📊 Account health monitoring
- 📊 Group performance tracking
- 📊 Automation controls

### Comment Management
- 💬 Per-account comment templates
- 💬 **NEW:** Random starter comment (10 variations)
- 💬 **NEW:** Auto-edit with your template
- 💬 **NEW:** "Hi" prefix added automatically
- 💬 Mutated variations (emoji, synonyms, spacing)
- 💬 Auto-delete pending/declined comments
- 💬 Complete status tracking

### React System
- ❤️ Auto-react after commenting
- ❤️ Random reaction selection
- ❤️ Configurable reaction types
- ❤️ Reaction probability settings
- ❤️ Smart timing delays

## 🖥️ Installation

### Prerequisites
- Node.js 18+ installed
- Windows 10/11
- Active Facebook accounts
- Group URLs to automate

### Setup Steps

1. **Clone or download this repository**
```bash
cd fb-comment-automation
```

2. **Install dependencies**
```bash
npm install
```

3. **Install Playwright browsers**
```bash
npx playwright install chromium
```

4. **Start the application**
```bash
npm start
```

## 📖 Usage Guide

### 1. Add Facebook Accounts

1. Go to **Accounts** page
2. Click **"Add Account"**
3. Fill in:
   - **Account Name**: Any identifier (e.g., "Account 1")
   - **Cookies**: Export cookies from your browser using cookie extension
   - **Proxy** (optional): Format `http://username:password@host:port`
   - **User Agent** (optional): Custom user agent string

**How to export cookies:**
- Install extension: "Cookie-Editor" or "EditThisCookie"
- Login to Facebook
- Export cookies as JSON
- Copy and paste into the Cookies field

**Important:** The system automatically fixes cookie format issues:
- Converts "no_restriction" → "None"
- Converts null → "Lax"
- Capitalizes "lax" → "Lax"
- All cookies are Playwright-compatible ✅

### 2. Add Facebook Posts

**IMPORTANT:** Add **specific post URLs**, not group URLs!

**Single Post:**
1. Go to **Posts** page
2. Click **"Add Post"**
3. Paste post URL (e.g., `https://www.facebook.com/groups/123/posts/456789`)
4. Optionally add a title

**Multiple Posts:**
1. Click **"Import Multiple"**
2. Paste URLs (one per line)
3. Click **"Import Posts"**

**How to get post URLs:**
- Go to the post on Facebook
- Copy URL from browser address bar
- Examples:
  - `https://www.facebook.com/groups/123456789/posts/987654321`
  - `https://www.facebook.com/groups/123456789/permalink/987654321`

### 3. Setup Comment Templates

1. Go to **Templates** page
2. Select an account
3. Add templates (bot will add "Hi " automatically)

**Example Templates:**
```
Nice post!
Great content!
Love this information!
Thanks for sharing!
```

**What happens:**
1. Bot posts random comment: "Interesting!"
2. Bot edits to: "Hi Nice post! 😊" (your template)
3. Bot reacts with ❤️
4. Bot checks if pending/declined
5. Bot deletes if needed

The system automatically:
- Adds "Hi " prefix
- Mutates your template
- Creates variations

### 4. Configure Settings

Go to **Settings** page and adjust:

**Comment Settings:**
- Comment delay: 30-120 seconds (randomized)
- Max comments per account: 20
- Account switch delay: 60 seconds
- Auto-delete pending: Enabled

**React Settings:**
- Enable auto-react: Yes
- Reaction types: Like, Love, Haha, Wow
- Reaction probability: 70%
- Reaction delay: 2-8 seconds

**Browser Settings:**
- Headless mode: Off (recommended for testing)

**Working Hours:**
- Enable restrictions: Optional
- Hours: 9 AM - 9 PM

### 5. Start Automation

1. Review dashboard statistics
2. Click **"Start Automation"**
3. Monitor live logs
4. View activity in Activity page

## 🏗️ Project Structure

```
fb-comment-automation/
├── src/
│   ├── main.js                 # Electron main process
│   ├── database/
│   │   └── db.js              # SQLite database management
│   ├── automation/
│   │   ├── engine.js          # Automation orchestrator
│   │   ├── worker.js          # Individual account worker
│   │   └── facebook.js        # Facebook interaction logic
│   └── utils/
│       ├── mutator.js         # Comment text mutation
│       └── logger.js          # Logging system
├── renderer/
│   ├── index.html             # Main UI
│   ├── styles.css             # Dashboard styles
│   └── renderer.js            # UI logic
├── data/
│   └── automation.db          # Database (auto-created)
├── logs/
│   ├── combined.log           # All logs
│   └── error.log              # Error logs
├── package.json
└── README.md
```

## 🔧 Technical Details

### Technology Stack
- **Electron.js**: Desktop application framework
- **Node.js**: Backend runtime
- **Playwright**: Browser automation
- **SQLite**: Local database (better-sqlite3)
- **Winston**: Logging
- **Crypto-js**: Cookie encryption

### Database Schema

**Tables:**
- `accounts` - Facebook account data
- `groups` - Facebook group URLs
- `templates` - Comment templates per account
- `activity` - Action logs (comments, reacts)
- `settings` - Application settings
- `logs` - System logs
- `posted_urls` - Duplicate prevention

### Anti-Ban Features

1. **Human Behavior Simulation**
   - Random scroll patterns
   - Mouse movement
   - Typing with delays (50-150ms per char)
   - Random pauses during typing

2. **Smart Timing**
   - Randomized delays between actions
   - Account cooldown periods
   - Working hours compliance
   - Post skipping randomization

3. **Detection Avoidance**
   - Stealth scripts to hide automation
   - Custom fingerprints per account
   - Proxy rotation support
   - User-agent randomization

4. **Safety Limits**
   - Max 20 comments per account per day
   - Auto-disable on checkpoint detection
   - Pending comment auto-deletion
   - Account health monitoring

## ⚙️ Configuration

### Settings Explained

| Setting | Default | Description |
|---------|---------|-------------|
| Comment Delay Min | 30s | Minimum wait between comments |
| Comment Delay Max | 120s | Maximum wait between comments |
| Max Comments Per Account | 20 | Daily limit per account |
| Account Switch Delay | 60s | Wait time when switching accounts |
| Group Rotation Delay | 10s | Wait time between groups |
| Auto Delete Pending | Yes | Remove pending comments |
| Auto React | Yes | React to own comments |
| Reaction Probability | 70% | Chance to add reaction |
| Reaction Delay | 2-8s | Wait before reacting |

## 🔒 Security & Privacy

- All data stored locally
- Cookies encrypted with AES
- No cloud connectivity
- No Facebook API usage
- Logs stored locally only

## 🐛 Troubleshooting

### Cookie sameSite Error (FIXED! ✅)
The app **automatically fixes** all cookie format issues:
- Converts `"no_restriction"` → `"None"`
- Converts `null` → `"Lax"`  
- Capitalizes `"lax"` → `"Lax"`

You can paste cookies directly from browser extensions - no manual fixing needed!

See [COOKIE-GUIDE.md](COOKIE-GUIDE.md) for detailed information.

### Account Not Working
- ✅ Verify cookies are up-to-date
- ✅ Check if account has checkpoint
- ✅ Try logging in manually first
- ✅ Export fresh cookies

### Comments Not Posting
- ✅ Check group permissions
- ✅ Verify account is not restricted
- ✅ Ensure templates are saved
- ✅ Check browser selectors in logs

### Automation Stopping
- ✅ Review error logs
- ✅ Check account status
- ✅ Verify working hours settings
- ✅ Ensure groups are accessible

## 📝 Best Practices

1. **Start Slow**
   - Begin with 5-10 comments/day per account
   - Gradually increase over weeks

2. **Use Quality Accounts**
   - Aged accounts (3+ months old)
   - Active engagement history
   - Profile pictures and friends

3. **Rotate Content**
   - Change templates weekly
   - Use diverse comment styles
   - Mix short and long comments

4. **Monitor Health**
   - Check dashboard daily
   - Watch for checkpoints
   - Adjust delays if needed

5. **Proxy Usage**
   - Use residential proxies
   - One proxy per account
   - Avoid free proxies

## 🚀 Building Executable

To create a standalone Windows EXE:

```bash
npm run build:win
```

The installer will be in the `dist/` folder.

## ⚠️ Disclaimer

This software is for educational purposes only. Users are responsible for:
- Complying with Facebook's Terms of Service
- Using the software ethically and legally
- Any consequences of automation

The developers are not liable for:
- Account bans or restrictions
- Misuse of the software
- Violations of platform policies

## 🤝 Support

For issues or questions:
1. Check troubleshooting section
2. Review error logs in `logs/` folder
3. Examine live logs in dashboard
4. Check account and group status

## 📄 License

MIT License - See LICENSE file for details

## 🔄 Updates & Maintenance

**Recommended:**
- Update dependencies monthly
- Re-export cookies every 2 weeks
- Monitor Facebook UI changes
- Adjust selectors if needed

---

**Version**: 1.0.0
**Last Updated**: February 2026

**Built with ❤️ for safe and smart automation**
