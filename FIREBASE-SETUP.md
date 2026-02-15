# Firebase Setup Guide

## Step 1: Create Firebase Project

1. Go to [Firebase Console](https://console.firebase.google.com/)
2. Click **"Add project"**
3. Enter project name: `fb-automation-licensing`
4. Disable Google Analytics (optional)
5. Click **"Create project"**

## Step 2: Enable Firestore Database

1. In Firebase Console, go to **Build → Firestore Database**
2. Click **"Create database"**
3. Select **"Start in production mode"**
4. Choose location (closest to your users)
5. Click **"Enable"**

## Step 3: Set Firestore Security Rules

Go to **Firestore Database → Rules** and paste:

```javascript
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    // Only authenticated requests can read/write
    match /{document=**} {
      allow read, write: if request.auth != null;
    }
  }
}
```

Click **"Publish"**

## Step 4: Generate Service Account Key

1. Go to **Project Settings** (gear icon)
2. Click **"Service accounts"** tab
3. Click **"Generate new private key"**
4. Click **"Generate key"**
5. Save the downloaded JSON file as `serviceAccountKey.json`

**IMPORTANT:** Keep this file secure! Never share it publicly.

## Step 5: Place Service Account Key

Copy `serviceAccountKey.json` to your project folder:

```
license-system/
├── serviceAccountKey.json  ← Place here
├── admin.js
├── app.js
├── license.js
└── package.json
```

## Step 6: Verify Setup

Your `serviceAccountKey.json` should look like:

```json
{
  "type": "service_account",
  "project_id": "your-project-id",
  "private_key_id": "...",
  "private_key": "-----BEGIN PRIVATE KEY-----\n...\n-----END PRIVATE KEY-----\n",
  "client_email": "firebase-adminsdk-xxxxx@your-project.iam.gserviceaccount.com",
  "client_id": "...",
  "auth_uri": "https://accounts.google.com/o/oauth2/auth",
  "token_uri": "https://oauth2.googleapis.com/token",
  "auth_provider_x509_cert_url": "https://www.googleapis.com/oauth2/v1/certs",
  "client_x509_cert_url": "..."
}
```

## Firestore Collection Structure

The system will automatically create this structure:

### Collection: `licenses`

**Document ID:** License Key (e.g., "ABCD-1234-EFGH-5678")

**Fields:**
```
{
  key: "ABCD-1234-EFGH-5678",
  duration: 7 or 30,
  isUsed: false,
  activationDate: null,
  expiryDate: null,
  deviceId: null,
  createdAt: Timestamp,
  createdBy: "admin"
}
```

**After User Activation:**
```
{
  key: "ABCD-1234-EFGH-5678",
  duration: 30,
  isUsed: true,
  activationDate: Timestamp("2026-02-03T10:00:00Z"),
  expiryDate: Timestamp("2026-03-05T10:00:00Z"),
  deviceId: "abc123-def456-ghi789",
  createdAt: Timestamp,
  createdBy: "admin"
}
```

## Security Best Practices

### 1. Never Commit Service Account Key
Add to `.gitignore`:
```
serviceAccountKey.json
*.json
!package.json
```

### 2. Use Environment Variables (Production)
For production, use environment variables instead of JSON file:

```javascript
admin.initializeApp({
  credential: admin.credential.cert({
    projectId: process.env.FIREBASE_PROJECT_ID,
    clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
    privateKey: process.env.FIREBASE_PRIVATE_KEY.replace(/\\n/g, '\n')
  })
});
```

### 3. Firestore Indexes
For better performance with large license databases:

1. Go to **Firestore → Indexes**
2. Create composite index:
   - Collection: `licenses`
   - Fields: `isUsed (Ascending)`, `createdAt (Descending)`

## Testing Firebase Connection

Create `test-firebase.js`:

```javascript
const admin = require('firebase-admin');
const serviceAccount = require('./serviceAccountKey.json');

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount)
});

const db = admin.firestore();

async function test() {
  try {
    const testDoc = await db.collection('test').doc('test').set({
      message: 'Firebase connected!',
      timestamp: admin.firestore.FieldValue.serverTimestamp()
    });
    console.log('✅ Firebase connection successful!');
    
    const doc = await db.collection('test').doc('test').get();
    console.log('Data:', doc.data());
    
    await db.collection('test').doc('test').delete();
    console.log('✅ Test complete!');
    
    process.exit(0);
  } catch (error) {
    console.error('❌ Firebase connection failed:', error);
    process.exit(1);
  }
}

test();
```

Run:
```bash
node test-firebase.js
```

## Troubleshooting

### Error: "PERMISSION_DENIED"
- Check Firestore security rules
- Verify service account has proper permissions

### Error: "Module not found: serviceAccountKey.json"
- Ensure file is in correct location
- Check file name (case-sensitive)

### Error: "Invalid private key"
- Re-download service account key
- Don't modify the JSON file

### Error: "Network timeout"
- Check internet connection
- Verify Firebase project is active

## Next Steps

After Firebase setup:
1. Install dependencies: `npm install`
2. Generate licenses: `npm run admin`
3. Test client app: `npm start`

---

**Setup Complete!** 🎉

Your Firebase Firestore is now ready for the licensing system.
