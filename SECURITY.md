# Security & Code Obfuscation Guide

## 🔐 Security Overview

This licensing system uses multiple layers of security:

1. **Firebase Firestore** - Cloud-based license storage
2. **Hardware Locking** - Device-specific activation
3. **Server-Side Validation** - Prevent clock tampering
4. **Code Obfuscation** - Hide implementation details
5. **Binary Compilation** - Create standalone executables

## 🛡️ Security Layers Explained

### 1. Firebase Service Account Protection

**Problem:** Service account key contains sensitive credentials.

**Solution:**

#### For Development:
Keep `serviceAccountKey.json` in project root but:
```bash
# Add to .gitignore
echo "serviceAccountKey.json" >> .gitignore
```

#### For Production:
Use environment variables:

```javascript
// Instead of:
const serviceAccount = require('./serviceAccountKey.json');

// Use:
const serviceAccount = {
  projectId: process.env.FIREBASE_PROJECT_ID,
  clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
  privateKey: process.env.FIREBASE_PRIVATE_KEY.replace(/\\n/g, '\n')
};
```

Set environment variables:
```bash
# Windows
set FIREBASE_PROJECT_ID=your-project-id
set FIREBASE_CLIENT_EMAIL=firebase-adminsdk@...
set FIREBASE_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\n...\n-----END PRIVATE KEY-----\n"

# Linux/Mac
export FIREBASE_PROJECT_ID="your-project-id"
export FIREBASE_CLIENT_EMAIL="firebase-adminsdk@..."
export FIREBASE_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\n...\n-----END PRIVATE KEY-----\n"
```

### 2. Hardware ID Binding

Uses `node-machine-id` to get unique machine identifier:

```javascript
const { machineIdSync } = require('node-machine-id');
const hwid = machineIdSync({ original: true });
```

**Why secure:**
- Cannot be spoofed without root access
- Changes if hardware changes significantly
- Consistent across reboots

### 3. Server Timestamp Validation

All time checks use Firebase server time:

```javascript
const now = admin.firestore.Timestamp.now(); // Server time, not local
```

**Why secure:**
- User cannot bypass by changing PC clock
- Synchronized across all devices
- Tamper-proof

### 4. License File Protection

Local `license.json` includes HWID:

```json
{
  "key": "ABCD-1234-EFGH-5678",
  "expiryDate": "2026-03-05T10:00:00.000Z",
  "duration": 30,
  "deviceId": "abc123-def456-ghi789"
}
```

**Protection:**
- If deviceId doesn't match current machine → delete file
- If file is corrupted → require re-activation
- If file is deleted → require re-activation

## 🔒 Code Obfuscation Methods

### Method 1: JavaScript Obfuscator (Recommended for Node.js)

#### Installation

```bash
npm install -g javascript-obfuscator
```

#### Basic Obfuscation

```bash
javascript-obfuscator license.js --output license.obfuscated.js
```

#### Advanced Obfuscation (Maximum Security)

```bash
javascript-obfuscator license.js \
  --output license.obfuscated.js \
  --compact true \
  --control-flow-flattening true \
  --control-flow-flattening-threshold 1 \
  --dead-code-injection true \
  --dead-code-injection-threshold 1 \
  --debug-protection true \
  --debug-protection-interval 4000 \
  --disable-console-output true \
  --identifier-names-generator hexadecimal \
  --log false \
  --numbers-to-expressions true \
  --renameGlobals true \
  --self-defending true \
  --shuffle-string-array true \
  --split-strings true \
  --split-strings-chunk-length 5 \
  --string-array true \
  --string-array-encoding 'rc4' \
  --string-array-threshold 1 \
  --transform-object-keys true \
  --unicode-escape-sequence true
```

#### Obfuscate All Files

```bash
# Obfuscate license module
javascript-obfuscator license.js --output license.obfuscated.js --compact true --self-defending true

# Obfuscate main app
javascript-obfuscator app.js --output app.obfuscated.js --compact true --self-defending true

# Replace originals
mv license.obfuscated.js license.js
mv app.obfuscated.js app.js
```

#### What Obfuscation Does:

**Original Code:**
```javascript
function checkLicenseStatus() {
  const license = loadLocalLicense();
  if (!license) {
    return { valid: false };
  }
  return { valid: true };
}
```

**Obfuscated Code:**
```javascript
var _0x4d8c=['valid','license','false'];(function(_0x2a9b5d,_0x4d8ce4){var _0x3e8b7f=function(_0x1c4b3a){while(--_0x1c4b3a){_0x2a9b5d['push'](_0x2a9b5d['shift']());}};_0x3e8b7f(++_0x4d8ce4);}(_0x4d8c,0x1a3));var _0x3e8b=function(_0x2a9b5d,_0x4d8ce4){_0x2a9b5d=_0x2a9b5d-0x0;var _0x3e8b7f=_0x4d8c[_0x2a9b5d];return _0x3e8b7f;};function _0x1c4b3a(){var _0x5d8e23=_0x2f4a9c();if(!_0x5d8e23){return{'\x76\x61\x6c\x69\x64':!![]};}return{'\x76\x61\x6c\x69\x64':![]};;}
```

Completely unreadable!

### Method 2: PKG (Binary Compilation)

Create standalone executable (best security):

#### Installation

```bash
npm install -g pkg
```

#### Create Windows EXE

```bash
pkg app.js --targets node18-win-x64 --output fb-automation.exe
```

#### Create for Multiple Platforms

```bash
pkg app.js --targets node18-win-x64,node18-macos-x64,node18-linux-x64
```

Output:
```
fb-automation-win.exe
fb-automation-macos
fb-automation-linux
```

#### With Obfuscation + PKG (Maximum Security)

```bash
# Step 1: Obfuscate
javascript-obfuscator app.js --output app.obfuscated.js --compact true --self-defending true

# Step 2: Compile
pkg app.obfuscated.js --targets node18-win-x64 --output fb-automation.exe

# Step 3: Delete obfuscated source
rm app.obfuscated.js
```

Now users get `fb-automation.exe` with:
- ✅ No source code visible
- ✅ Cannot extract code
- ✅ Cannot modify logic
- ✅ Cannot bypass license

### Method 3: Bytecode Compilation (Node.js V8)

Compile JavaScript to V8 bytecode:

#### Installation

```bash
npm install -g bytenode
```

#### Compile

```bash
bytenode -c app.js
bytenode -c license.js
```

Creates:
```
app.jsc
license.jsc
```

These are binary files, not readable JavaScript!

#### Run Bytecode

```javascript
// loader.js
require('bytenode');
require('./app.jsc');
```

Then compile loader:
```bash
pkg loader.js --targets node18-win-x64 --output fb-automation.exe
```

## 🎭 Anti-Debugging Measures

### Detect Debugger

Add to your code:

```javascript
// Detect debugger
setInterval(() => {
  const start = Date.now();
  debugger; // If debugger is open, this will pause
  if (Date.now() - start > 100) {
    console.error('Debugger detected! Exiting...');
    process.exit(1);
  }
}, 1000);
```

### Detect Code Modification

Calculate checksum of your code:

```javascript
const crypto = require('crypto');
const fs = require('fs');

function verifyIntegrity() {
  const code = fs.readFileSync(__filename, 'utf8');
  const hash = crypto.createHash('sha256').update(code).digest('hex');
  
  const expectedHash = 'your-pre-calculated-hash';
  
  if (hash !== expectedHash) {
    console.error('Code tampering detected!');
    process.exit(1);
  }
}

verifyIntegrity();
```

### Encrypt Sensitive Strings

Don't hardcode sensitive strings:

```javascript
// Bad
const apiKey = 'my-secret-api-key';

// Good
const CryptoJS = require('crypto-js');
const encrypted = 'U2FsdGVkX1+...'; // Pre-encrypted
const apiKey = CryptoJS.AES.decrypt(encrypted, 'secret').toString(CryptoJS.enc.Utf8);
```

## 📦 Distribution Best Practices

### For Windows EXE Distribution

1. **Obfuscate all source files**
```bash
javascript-obfuscator *.js --output obfuscated/ --compact true
```

2. **Create executable**
```bash
pkg obfuscated/app.js --targets node18-win-x64 --output fb-automation.exe
```

3. **Test on clean machine**
- No Node.js installed
- No npm modules
- Fresh Windows installation

4. **Create installer (optional)**
```bash
npm install -g electron-installer-windows
```

### What to Include in Distribution

**Include:**
- ✅ `fb-automation.exe` (your compiled app)
- ✅ `README.txt` (user guide)
- ✅ `LICENSE.txt` (terms of use)

**DO NOT Include:**
- ❌ `serviceAccountKey.json`
- ❌ Source `.js` files
- ❌ `node_modules/`
- ❌ `package.json`
- ❌ Any Firebase credentials

### Firebase Security Rules (Production)

Update Firestore rules to restrict access:

```javascript
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    // Only allow server-side (admin SDK) access
    match /licenses/{licenseKey} {
      allow read: if request.auth != null;
      allow write: if false; // Only admin can write
    }
  }
}
```

## 🔍 Testing Security

### Test 1: Can User See Code?

```bash
# Try to open executable in text editor
notepad fb-automation.exe
```

Should show binary gibberish, not JavaScript code.

### Test 2: Can User Extract Code?

```bash
# Try to decompile
asar extract app.asar extracted/
```

Should fail or extract only obfuscated code.

### Test 3: Can User Bypass License?

Try to:
- Change PC date/time → Should still expire (server-side check)
- Modify `license.json` → Should detect tampering
- Copy to another PC → Should fail (HWID mismatch)
- Delete `license.json` → Should require re-activation

### Test 4: Can User Reverse Engineer?

```bash
# Try to deobfuscate
node de-obfuscate.js fb-automation.exe
```

Should be extremely difficult or impossible.

## 🚨 Common Vulnerabilities & Fixes

### Vulnerability 1: Hardcoded Credentials

**Bad:**
```javascript
const apiKey = 'abc123def456';
```

**Good:**
```javascript
const apiKey = process.env.API_KEY || decrypt(encryptedKey);
```

### Vulnerability 2: Client-Side Time Checking

**Bad:**
```javascript
if (Date.now() > expiryTime) {
  // expired
}
```

**Good:**
```javascript
const serverTime = admin.firestore.Timestamp.now();
if (serverTime.toMillis() > expiryTime) {
  // expired
}
```

### Vulnerability 3: Readable Error Messages

**Bad:**
```javascript
throw new Error('License check failed at line 123 in license.js');
```

**Good:**
```javascript
console.error('License verification failed');
process.exit(1);
```

### Vulnerability 4: Predictable License Keys

**Bad:**
```javascript
const key = 'USER-0001';
```

**Good:**
```javascript
const key = generateRandomKey(); // ABCD-1234-EFGH-5678
```

## 📋 Security Checklist

Before distribution:

- [ ] All code obfuscated
- [ ] serviceAccountKey.json removed
- [ ] Compiled to binary (PKG or similar)
- [ ] Tested on clean machine
- [ ] Firebase rules set to production mode
- [ ] No debug logs in production code
- [ ] License checks in all critical functions
- [ ] Server-side timestamp validation enabled
- [ ] HWID binding working
- [ ] No hardcoded credentials
- [ ] Error messages don't reveal implementation
- [ ] Anti-debugging measures enabled
- [ ] Code integrity checks in place

## 🎯 Summary

**Best Security Setup:**

1. Obfuscate all `.js` files
2. Compile with PKG to `.exe`
3. Use server-side validation
4. Enable HWID binding
5. Remove all Firebase credentials from client
6. Test thoroughly before distribution

**Result:**
- ✅ Code is unreadable
- ✅ Cannot extract source
- ✅ Cannot bypass license checks
- ✅ Cannot use on multiple devices
- ✅ Cannot tamper with expiry dates

---

**Your software is now production-ready and secure!** 🔒
