/**
 * LICENSE VERIFICATION MODULE
 * Client-Side License Check for FB Automation Tool
 * Firebase Firestore Backend
 */

const admin = require('firebase-admin');
const { machineIdSync } = require('node-machine-id');
const fs = require('fs');
const path = require('path');

const { app } = require('electron');

// ==========================================
// CONFIGURATION
// ==========================================

// লাইসেন্স ফাইল এবং সার্ভিস কি এখন userData ফোল্ডারে বা সঠিক অ্যাপ পাথে থাকবে
const LICENSE_FILE = path.join(app.getPath('userData'), 'license.json');
const SERVICE_ACCOUNT_PATH = path.join(__dirname, 'serviceAccountKey.json');

let db = null;
let isInitialized = false;

// ==========================================
// FIREBASE INITIALIZATION
// ==========================================

function initializeFirebase() {
  if (isInitialized) return;

  try {
    // সার্ভিস একাউন্ট কি বিল্ডের সময় রিসোর্স হিসেবে থাকে, তাই __dirname এখানে কাজ করতে পারে
    // তবে নিশ্চিত করুন ফাইলটি আপনার সোর্স ফোল্ডারে আছে
    const serviceAccount = require(SERVICE_ACCOUNT_PATH);

    if (!admin.apps.length) {
      admin.initializeApp({
        credential: admin.credential.cert(serviceAccount)
      });
    }

    db = admin.firestore();
    isInitialized = true;
  } catch (error) {
    console.error('❌ Firebase initialization failed:', error.message);
    // বিল্ড ভার্সনে অ্যাপ ক্র্যাশ না করে এরর লগ করা ভালো
  }
}

// ==========================================
// HARDWARE ID
// ==========================================

function getHardwareId() {
  try {
    return machineIdSync({ original: true });
  } catch (error) {
    console.error('❌ Failed to get hardware ID:', error.message);
    process.exit(1);
  }
}

// ==========================================
// LICENSE FILE MANAGEMENT
// ==========================================

function saveLicenseLocally(licenseData) {
  try {
    fs.writeFileSync(LICENSE_FILE, JSON.stringify(licenseData, null, 2));
    return true;
  } catch (error) {
    console.error('❌ Failed to save license file:', error.message);
    return false;
  }
}

function loadLocalLicense() {
  try {
    if (fs.existsSync(LICENSE_FILE)) {
      const data = fs.readFileSync(LICENSE_FILE, 'utf8');
      return JSON.parse(data);
    }
    return null;
  } catch (error) {
    console.error('⚠️  Corrupted license file. Please re-activate.');
    return null;
  }
}

function deleteLicenseFile() {
  try {
    if (fs.existsSync(LICENSE_FILE)) {
      fs.unlinkSync(LICENSE_FILE);
    }
  } catch (error) {
    // Silent fail
  }
}

// ==========================================
// LICENSE VERIFICATION
// ==========================================

async function verifyLicenseKey(licenseKey) {
  initializeFirebase();
  
  const hwid = getHardwareId();
  const licensesCollection = db.collection('licenses');
  
  try {
    const licenseDoc = await licensesCollection.doc(licenseKey).get();
    
    if (!licenseDoc.exists) {
      return {
        valid: false,
        error: 'Invalid license key. Please contact support.'
      };
    }
    
    const licenseData = licenseDoc.data();
    
    // Check if key is already used
    if (licenseData.isUsed) {
      // Verify device matches
      if (licenseData.deviceId !== hwid) {
        return {
          valid: false,
          error: 'This license is already activated on another device.'
        };
      }
      
      // Check expiry using server timestamp
      const now = admin.firestore.Timestamp.now();
      const expiry = licenseData.expiryDate;
      
      if (now.toMillis() > expiry.toMillis()) {
        return {
          valid: false,
          error: 'License has expired. Please renew your subscription.',
          expired: true
        };
      }
      
      // Valid and active
      return {
        valid: true,
        licenseData: {
          key: licenseData.key,
          expiryDate: expiry.toDate().toISOString(),
          duration: licenseData.duration,
          deviceId: hwid
        }
      };
    } else {
      // First-time activation
      const now = admin.firestore.Timestamp.now();
      const expiryTimestamp = new Date(now.toMillis() + (licenseData.duration * 24 * 60 * 60 * 1000));
      const expiry = admin.firestore.Timestamp.fromDate(expiryTimestamp);
      
      await licensesCollection.doc(licenseKey).update({
        isUsed: true,
        deviceId: hwid,
        activationDate: now,
        expiryDate: expiry
      });
      
      return {
        valid: true,
        licenseData: {
          key: licenseData.key,
          expiryDate: expiry.toDate().toISOString(),
          duration: licenseData.duration,
          deviceId: hwid
        },
        firstActivation: true
      };
    }
  } catch (error) {
    console.error('❌ License verification error:', error.message);
    return {
      valid: false,
      error: 'Failed to verify license. Check your internet connection.'
    };
  }
}

// ==========================================
// LICENSE CHECKING (RUNTIME)
// ==========================================

async function checkLicenseStatus() {
  initializeFirebase();
  
  const localLicense = loadLocalLicense();
  
  if (!localLicense || !localLicense.key) {
    return {
      valid: false,
      error: 'No license found. Please activate.'
    };
  }
  
  const hwid = getHardwareId();
  
  // Verify HWID matches
  if (localLicense.deviceId !== hwid) {
    deleteLicenseFile();
    return {
      valid: false,
      error: 'Hardware mismatch. License file tampered or moved to another device.'
    };
  }
  
  // Fetch from Firestore for real-time expiry check
  const licensesCollection = db.collection('licenses');
  
  try {
    const licenseDoc = await licensesCollection.doc(localLicense.key).get();
    
    if (!licenseDoc.exists) {
      deleteLicenseFile();
      return {
        valid: false,
        error: 'License revoked by administrator.'
      };
    }
    
    const licenseData = licenseDoc.data();
    
    // Verify device still matches
    if (licenseData.deviceId !== hwid) {
      deleteLicenseFile();
      return {
        valid: false,
        error: 'License device mismatch.'
      };
    }
    
    // Check expiry using server timestamp
    const now = admin.firestore.Timestamp.now();
    const expiry = licenseData.expiryDate;
    
    if (now.toMillis() > expiry.toMillis()) {
      deleteLicenseFile();
      return {
        valid: false,
        error: 'License expired.',
        expired: true
      };
    }
    
    // Calculate days remaining
    const msRemaining = expiry.toMillis() - now.toMillis();
    const daysRemaining = Math.ceil(msRemaining / (24 * 60 * 60 * 1000));
    
    return {
      valid: true,
      daysRemaining,
      expiryDate: expiry.toDate()
    };
  } catch (error) {
    console.error('❌ License status check error:', error.message);
    return {
      valid: false,
      error: 'Failed to verify license status. Check internet connection.'
    };
  }
}

// ==========================================
// HARD LOCK FUNCTION
// ==========================================

async function requireValidLicense(functionName = 'this function') {
  const status = await checkLicenseStatus();
  
  if (!status.valid) {
    console.error('\n╔════════════════════════════════════════════╗');
    console.error('║          LICENSE VERIFICATION FAILED       ║');
    console.error('╚════════════════════════════════════════════╝\n');
    console.error(`❌ ${status.error}\n`);
    console.error(`Cannot execute: ${functionName}\n`);
    console.error('Please contact support or renew your license.\n');
    
    process.exit(1);
  }
  
  return status;
}

// ==========================================
// LICENSE ACTIVATION
// ==========================================

async function activateLicense(licenseKey) {
  console.log('\n🔐 Activating license...\n');
  
  const result = await verifyLicenseKey(licenseKey);
  
  if (!result.valid) {
    return result;
  }
  
  // Save license locally
  const saved = saveLicenseLocally(result.licenseData);
  
  if (!saved) {
    return {
      valid: false,
      error: 'Failed to save license file.'
    };
  }
  
  return result;
}

// ==========================================
// EXPORTS
// ==========================================

module.exports = {
  activateLicense,
  checkLicenseStatus,
  requireValidLicense,
  loadLocalLicense,
  getHardwareId
};