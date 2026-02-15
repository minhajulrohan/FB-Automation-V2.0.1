# FB Automation Tool with Professional Licensing System

Complete Facebook Group Comment Automation Desktop Software with integrated Firebase-based licensing system.

## 🎯 Features

### Automation Features
- ✅ Multi-account management (10-20 accounts)
- ✅ Post-based commenting system (direct URLs)
- ✅ Random starter comment → Edit with template
- ✅ "Hi" + your template formatting
- ✅ Auto-react after commenting
- ✅ Smart status checking (pending/declined detection)
- ✅ Auto-delete failed comments
- ✅ Anti-ban protection with human-like behavior
- ✅ Cookie management with auto-fix

### Licensing Features
- ✅ Hardware-locked licenses (HWID binding)
- ✅ Server-side expiry validation (Firebase Firestore)
- ✅ 7-day or 30-day license duration
- ✅ Admin panel for license generation
- ✅ Real-time license status checking
- ✅ Automatic activation on first run
- ✅ Grace period warnings
- ✅ License info display in app

## 📦 What's Included

### Core Files
```
fb-automation-with-license/
├── src/
│   ├── main.js                  # 🔐 Licensed main process
│   ├── automation/              # Automation engine
│   ├── database/                # SQLite database
│   └── utils/
│       └── license.js           # 🔑 License verification
├── renderer/
│   ├── index.html               # Main dashboard
│   └── license.html             # 🔐 License activation UI
├── admin.js                     # 🔑 Admin license generator
├── package.json                 # With Firebase dependencies
├── FIREBASE-SETUP.md            # Firebase setup guide
├── SECURITY.md                  # Obfuscation guide
└── serviceAccountKey.json       # 🔥 Add your Firebase key
```

## 🚀 Quick Start

### Step 1: Install Dependencies

```bash
npm install
```

This installs:
- Electron, Playwright (automation)
- Firebase Admin SDK (licensing)
- node-machine-id (hardware ID)
- All other dependencies

### Step 2: Setup Firebase

Follow [FIREBASE-SETUP.md](./FIREBASE-SETUP.md):

1. Create Firebase project
2. Enable Firestore database
3. Generate service account key
4. Save as `serviceAccountKey.json` in project root

### Step 3: Generate License Keys (Admin)

```bash
npm run admin
```

Menu:
```
1. Generate New License Keys
How many? 5
Duration? 2 (30 days)

✅ Generated 5 keys
```

### Step 4: Start Application

```bash
npm start
```

First time:
- Shows license activation window
- Enter one of the generated keys
- License activated!
- Main app opens

## 🔐 How Licensing Works

### First Run - No License

1. App starts
2. Checks for `license.json`
3. Not found → Shows activation window
4. User enters license key
5. System verifies with Firebase
6. Binds to hardware ID
7. Saves `license.json` locally
8. Main app opens

### Subsequent Runs - License Exists

1. App starts
2. Loads `license.json`
3. Verifies hardware ID matches
4. Checks expiry with Firebase (server-side)
5. If valid → App opens
6. If expired/invalid → Shows error & exits

### While Running

1. License checked every hour
2. If becomes invalid → Automation stops
3. Error dialog shown
4. App exits

### Automation Start

1. User clicks "Start Automation"
2. License verified again
3. If valid → Automation starts
4. If invalid → Error shown

## 🎮 Admin Panel Usage

### Generate Licenses

```bash
npm run admin

Select: 1 (Generate New License Keys)
```

**Output:**
```
How many keys to generate? 10
Select Duration:
1. 7 Days
2. 30 Days
Select (1 or 2): 2

🔑 Generating 10 license key(s) for 30 days...

✅ [1/10] Generated: ABCD-1234-EFGH-5678
✅ [2/10] Generated: IJKL-9012-MNOP-3456
...

Save keys to file? (y/N): y
✅ Keys saved to licenses_1738543210.txt
```

### View All Licenses

```bash
npm run admin

Select: 2 (View All Licenses)
```

**Output:**
```
📋 All Licenses:

1. Key: ABCD-1234-EFGH-5678
   Status: AVAILABLE | Duration: 30 days | Expiry: N/A

2. Key: IJKL-9012-MNOP-3456
   Status: USED | Duration: 30 days | Expiry: 2026-03-05 10:30:00
   Device: abc123-def456-ghi789
```

### Search License

```bash
Select: 3 (Search License by Key)
Enter license key: ABCD-1234-EFGH-5678
```

### Delete License

```bash
Select: 4 (Delete License)
Enter license key: ABCD-1234-EFGH-5678
Are you sure? (y/N): y
✅ License deleted successfully!
```

### Export Unused Licenses

```bash
Select: 5 (Export Unused Licenses)
Filename (default: licenses.txt): my-keys.txt
✅ Exported 10 unused licenses to my-keys.txt
```

## 💻 Client Usage

### First-Time Activation

```
┌─────────────────────────────────┐
│     License Activation          │
│                                 │
│  Enter your license key to      │
│  activate FB Automation Tool    │
│                                 │
│  License Key                    │
│  ┌─────────────────────────┐   │
│  │ ABCD-1234-EFGH-5678     │   │
│  └─────────────────────────┘   │
│                                 │
│  [ Activate License ]           │
└─────────────────────────────────┘
```

After activation:
```
✅ License activated successfully!

Main application opens...
```

### Main Dashboard

Shows license info at startup:
```
✅ License Valid

Days Remaining: 28
Expires On: 2026-03-05 10:30:00 AM
```

If expiring soon (< 3 days):
```
⚠️ WARNING: Your license will expire in 2 days!
Please renew before expiry to avoid interruption.
```

### During Automation

License checked before starting:
```
Click "Start Automation"
→ License verified
→ If valid: Automation starts
→ If invalid: Error shown
```

## 🛡️ Security Features

### 1. Hardware Locking

```javascript
Device ID: abc123-def456-ghi789
```

- Cannot transfer to another PC
- Detects hardware changes
- Automatic validation

### 2. Server-Side Validation

```javascript
Firebase Timestamp (not local clock)
```

- User cannot bypass by changing date
- Real-time expiry checking
- Synchronized across all devices

### 3. Tamper Detection

```javascript
if (license.deviceId !== currentHWID) {
  deleteFile();
  exit();
}
```

- Detects file modifications
- Validates on every check
- Auto-cleanup on tamper

### 4. Real-Time Revocation

```javascript
Admin deletes from Firebase
→ Client checks
→ License invalid
→ App exits
```

- Instant license revocation
- No local bypass possible
- Admin has full control

## 📊 License States

### Available (Unused)
```json
{
  "key": "ABCD-1234-EFGH-5678",
  "duration": 30,
  "isUsed": false,
  "deviceId": null,
  "expiryDate": null
}
```

### Active (In Use)
```json
{
  "key": "ABCD-1234-EFGH-5678",
  "duration": 30,
  "isUsed": true,
  "deviceId": "abc123...",
  "activationDate": "2026-02-03T10:00:00Z",
  "expiryDate": "2026-03-05T10:00:00Z"
}
```

### Expired
```json
{
  "expiryDate": "2026-02-01T10:00:00Z" (past)
}
```

Server check fails → App exits

## 🔧 Automation Features

### Comment Flow

1. ✅ Navigate to post URL
2. ✅ Random starter: "Interesting!"
3. ✅ Edit to: "Hi Nice post! 😊"
4. ✅ React with ❤️
5. ✅ Check status (success/pending/declined)
6. ✅ Delete if pending/declined
7. ✅ Move to next post

### Anti-Ban Protection

- ✅ Random delays (30-120s)
- ✅ Human-like typing
- ✅ Scroll simulation
- ✅ Checkpoint detection
- ✅ Account cooldowns
- ✅ Daily limits
- ✅ Proxy support

### Settings

All configurable:
- Comment delays
- Max comments per account
- Auto-react probability
- Reaction types
- Auto-delete pending
- Working hours

## 📁 File Structure

```
fb-automation-with-license/
├── src/
│   ├── main.js                 # 🔐 Licensed Electron main
│   ├── automation/
│   │   ├── engine.js           # Automation orchestrator
│   │   ├── worker.js           # Per-account worker
│   │   └── facebook.js         # FB interactions
│   ├── database/
│   │   └── db.js               # SQLite database
│   └── utils/
│       ├── license.js          # 🔑 License verification
│       ├── cookie-fixer.js     # Cookie format fixer
│       ├── mutator.js          # Text mutation
│       └── logger.js           # Winston logging
├── renderer/
│   ├── index.html              # Main dashboard
│   ├── license.html            # 🔐 Activation UI
│   ├── renderer.js             # UI logic
│   └── styles.css              # Styles
├── admin.js                    # 🔑 License generator
├── package.json                # Dependencies
├── serviceAccountKey.json      # 🔥 Firebase (add this)
├── license.json                # User license (auto-created)
├── README.md                   # This file
├── FIREBASE-SETUP.md           # Setup guide
└── SECURITY.md                 # Obfuscation guide
```

## 🎯 Distribution

### For Users (Client Build)

1. **Obfuscate code:**
```bash
npm install -g javascript-obfuscator
javascript-obfuscator src/ --output src/ --compact true
```

2. **Build executable:**
```bash
npm run build:win
```

Output: `dist/FB Comment Automator Setup.exe`

3. **Distribute:**
- ✅ Setup.exe
- ✅ README.txt (user guide)
- ❌ NO serviceAccountKey.json
- ❌ NO source code

### For Admin (License Management)

Keep separately:
```
admin-panel/
├── admin.js
├── package.json
├── serviceAccountKey.json
└── README.md
```

Only admin needs Firebase credentials!

## ⚠️ Important Notes

### For Admin:
- ✅ Keep `serviceAccountKey.json` secure
- ✅ Never share Firebase credentials
- ✅ Generate keys from secure computer
- ✅ Monitor license usage in Firebase Console

### For Distribution:
- ✅ Obfuscate before building
- ✅ Test on clean machine
- ✅ Remove all Firebase credentials
- ✅ Include user documentation

### For Users:
- ✅ One license = One computer
- ✅ Cannot share or transfer
- ✅ Renew before expiry
- ✅ Contact support for issues

## 🐛 Troubleshooting

### License Activation Failed

**Problem:** "Invalid license key"
- ✅ Check if key exists in Firebase
- ✅ Verify typos (case-sensitive)
- ✅ Check internet connection

**Problem:** "License already activated on another device"
- ✅ License is hardware-locked
- ✅ Contact admin to reset
- ✅ Purchase new license

### License Expired

**Problem:** "License expired"
- ✅ Check expiry date in Firebase
- ✅ Contact admin to renew
- ✅ Purchase new license

### Firebase Connection Failed

**Problem:** "Failed to verify license"
- ✅ Check internet connection
- ✅ Verify Firebase project is active
- ✅ Check Firestore security rules

## 📞 Support

For issues:
1. Check [FIREBASE-SETUP.md](./FIREBASE-SETUP.md)
2. Review [SECURITY.md](./SECURITY.md)
3. Check Firebase Console
4. Contact administrator

## 📄 License

MIT License - See LICENSE file

---

**Complete FB Automation Tool with Professional Licensing** 🎉

Version: 2.0.0 (with Licensing)
Last Updated: February 2026
