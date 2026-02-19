/**
 * ADMIN LICENSE KEY GENERATOR
 * For FB Automation Tool
 * Firebase Firestore Backend
 */

const admin = require('firebase-admin');
const readlineSync = require('readline-sync');
const chalk = require('chalk');

// ==========================================
// FIREBASE ADMIN INITIALIZATION
// ==========================================
// Replace with your Firebase service account key
const serviceAccount = require('./serviceAccountKey.json');

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount)
});

const db = admin.firestore();
const licensesCollection = db.collection('licenses');

// ==========================================
// HELPER FUNCTIONS
// ==========================================

/**
 * Generate random license key
 * Format: XXXX-XXXX-XXXX-XXXX
 */
function generateLicenseKey() {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  const segments = 4;
  const segmentLength = 4;
  
  let key = '';
  for (let i = 0; i < segments; i++) {
    let segment = '';
    for (let j = 0; j < segmentLength; j++) {
      segment += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    key += segment;
    if (i < segments - 1) key += '-';
  }
  
  return key;
}

/**
 * Check if license key already exists
 */
async function keyExists(licenseKey) {
  const doc = await licensesCollection.doc(licenseKey).get();
  return doc.exists;
}

/**
 * Create new license in Firestore
 */
async function createLicense(licenseKey, duration) {
  try {
    await licensesCollection.doc(licenseKey).set({
      key: licenseKey,
      duration: duration,
      isUsed: false,
      activationDate: null,
      expiryDate: null,
      deviceId: null,
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
      createdBy: 'admin'
    });
    
    return true;
  } catch (error) {
    console.error(chalk.red('Error creating license:'), error);
    return false;
  }
}

/**
 * Generate multiple unique keys
 */
async function generateKeys(count, duration) {
  const keys = [];
  const failed = [];
  
  console.log(chalk.cyan(`\n🔑 Generating ${count} license key(s) for ${duration} days...\n`));
  
  for (let i = 0; i < count; i++) {
    let attempts = 0;
    let key;
    let unique = false;
    
    // Try to generate unique key (max 10 attempts)
    while (!unique && attempts < 10) {
      key = generateLicenseKey();
      unique = !(await keyExists(key));
      attempts++;
    }
    
    if (unique) {
      const success = await createLicense(key, duration);
      if (success) {
        keys.push(key);
        console.log(chalk.green(`✅ [${i + 1}/${count}] Generated: ${key}`));
      } else {
        failed.push(key);
        console.log(chalk.red(`❌ [${i + 1}/${count}] Failed to save: ${key}`));
      }
    } else {
      failed.push(`Unable to generate unique key after 10 attempts`);
      console.log(chalk.red(`❌ [${i + 1}/${count}] Could not generate unique key`));
    }
  }
  
  return { keys, failed };
}

/**
 * View all licenses
 */
async function viewAllLicenses() {
  try {
    const snapshot = await licensesCollection.get();
    
    if (snapshot.empty) {
      console.log(chalk.yellow('\n⚠️  No licenses found in database.\n'));
      return;
    }
    
    console.log(chalk.cyan('\n📋 All Licenses:\n'));
    console.log(chalk.gray('─'.repeat(100)));
    
    let index = 1;
    snapshot.forEach(doc => {
      const data = doc.data();
      const status = data.isUsed ? chalk.red('USED') : chalk.green('AVAILABLE');
      const expiry = data.expiryDate 
        ? new Date(data.expiryDate.toDate()).toLocaleString() 
        : 'N/A';
      
      console.log(chalk.white(`${index}. Key: ${chalk.yellow(data.key)}`));
      console.log(`   Status: ${status} | Duration: ${data.duration} days | Expiry: ${expiry}`);
      if (data.deviceId) {
        console.log(`   Device: ${chalk.gray(data.deviceId)}`);
      }
      console.log(chalk.gray('─'.repeat(100)));
      index++;
    });
    
    console.log(chalk.cyan(`\nTotal licenses: ${snapshot.size}\n`));
  } catch (error) {
    console.error(chalk.red('Error fetching licenses:'), error);
  }
}

/**
 * Delete a license
 */
async function deleteLicense(licenseKey) {
  try {
    const doc = await licensesCollection.doc(licenseKey).get();
    
    if (!doc.exists) {
      console.log(chalk.red('\n❌ License key not found!\n'));
      return false;
    }
    
    await licensesCollection.doc(licenseKey).delete();
    console.log(chalk.green(`\n✅ License ${licenseKey} deleted successfully!\n`));
    return true;
  } catch (error) {
    console.error(chalk.red('Error deleting license:'), error);
    return false;
  }
}

/**
 * Search license by key
 */
async function searchLicense(licenseKey) {
  try {
    const doc = await licensesCollection.doc(licenseKey).get();
    
    if (!doc.exists) {
      console.log(chalk.red('\n❌ License key not found!\n'));
      return;
    }
    
    const data = doc.data();
    
    console.log(chalk.cyan('\n📋 License Details:\n'));
    console.log(chalk.gray('─'.repeat(60)));
    console.log(chalk.white(`Key:            ${chalk.yellow(data.key)}`));
    console.log(chalk.white(`Duration:       ${data.duration} days`));
    console.log(chalk.white(`Status:         ${data.isUsed ? chalk.red('USED') : chalk.green('AVAILABLE')}`));
    
    if (data.isUsed) {
      console.log(chalk.white(`Activation:     ${new Date(data.activationDate.toDate()).toLocaleString()}`));
      console.log(chalk.white(`Expiry:         ${new Date(data.expiryDate.toDate()).toLocaleString()}`));
      console.log(chalk.white(`Device ID:      ${chalk.gray(data.deviceId)}`));
    }
    
    console.log(chalk.gray('─'.repeat(60)));
    console.log('');
  } catch (error) {
    console.error(chalk.red('Error searching license:'), error);
  }
}

/**
 * Export licenses to text file
 */
async function exportLicenses(filename = 'licenses.txt') {
  try {
    const fs = require('fs');
    const snapshot = await licensesCollection.where('isUsed', '==', false).get();
    
    if (snapshot.empty) {
      console.log(chalk.yellow('\n⚠️  No unused licenses to export.\n'));
      return;
    }
    
    let content = '==============================================\n';
    content += 'FB AUTOMATION - LICENSE KEYS (UNUSED)\n';
    content += `Generated: ${new Date().toLocaleString()}\n`;
    content += '==============================================\n\n';
    
    let index = 1;
    snapshot.forEach(doc => {
      const data = doc.data();
      content += `${index}. ${data.key} (${data.duration} days)\n`;
      index++;
    });
    
    content += `\n==============================================\n`;
    content += `Total: ${snapshot.size} unused licenses\n`;
    content += `==============================================\n`;
    
    fs.writeFileSync(filename, content);
    console.log(chalk.green(`\n✅ Exported ${snapshot.size} unused licenses to ${filename}\n`));
  } catch (error) {
    console.error(chalk.red('Error exporting licenses:'), error);
  }
}

// ==========================================
// MAIN MENU
// ==========================================

async function showMenu() {
  console.clear();
  console.log(chalk.bold.cyan('\n╔════════════════════════════════════════════╗'));
  console.log(chalk.bold.cyan('║   FB AUTOMATION - LICENSE ADMIN PANEL     ║'));
  console.log(chalk.bold.cyan('╚════════════════════════════════════════════╝\n'));
  
  console.log(chalk.white('1. Generate New License Keys'));
  console.log(chalk.white('2. View All Licenses'));
  console.log(chalk.white('3. Search License by Key'));
  console.log(chalk.white('4. Delete License'));
  console.log(chalk.white('5. Export Unused Licenses'));
  console.log(chalk.white('6. Exit\n'));
  
  const choice = readlineSync.question(chalk.yellow('Select option (1-6): '));
  
  switch (choice) {
    case '1':
      await generateKeysMenu();
      break;
    case '2':
      await viewAllLicenses();
      readlineSync.question(chalk.gray('\nPress Enter to continue...'));
      break;
    case '3':
      const searchKey = readlineSync.question(chalk.yellow('\nEnter license key: '));
      await searchLicense(searchKey.toUpperCase());
      readlineSync.question(chalk.gray('Press Enter to continue...'));
      break;
    case '4':
      const deleteKey = readlineSync.question(chalk.yellow('\nEnter license key to delete: '));
      const confirm = readlineSync.keyInYNStrict(chalk.red('Are you sure you want to delete this license?'));
      if (confirm) {
        await deleteLicense(deleteKey.toUpperCase());
      }
      readlineSync.question(chalk.gray('Press Enter to continue...'));
      break;
    case '5':
      const filename = readlineSync.question(chalk.yellow('\nFilename (default: licenses.txt): ')) || 'licenses.txt';
      await exportLicenses(filename);
      readlineSync.question(chalk.gray('Press Enter to continue...'));
      break;
    case '6':
      console.log(chalk.green('\n👋 Goodbye!\n'));
      process.exit(0);
      break;
    default:
      console.log(chalk.red('\n❌ Invalid option!\n'));
      await new Promise(resolve => setTimeout(resolve, 1000));
  }
  
  // Loop back to menu
  await showMenu();
}

async function generateKeysMenu() {
  console.log(chalk.cyan('\n═══════════════════════════════════════'));
  console.log(chalk.cyan('       LICENSE KEY GENERATOR'));
  console.log(chalk.cyan('═══════════════════════════════════════\n'));
  
  const count = parseInt(readlineSync.question(chalk.yellow('How many keys to generate? ')));
  
  if (isNaN(count) || count < 1) {
    console.log(chalk.red('\n❌ Invalid number!\n'));
    await new Promise(resolve => setTimeout(resolve, 1500));
    return;
  }
  
  console.log(chalk.white('\nSelect Duration:'));
  console.log(chalk.white('1. 7 Days'));
  console.log(chalk.white('2. 30 Days'));
  
  const durationChoice = readlineSync.question(chalk.yellow('\nSelect (1 or 2): '));
  const duration = durationChoice === '1' ? 7 : 30;
  
  const result = await generateKeys(count, duration);
  
  console.log(chalk.cyan('\n═══════════════════════════════════════'));
  console.log(chalk.green(`✅ Successfully generated: ${result.keys.length} keys`));
  if (result.failed.length > 0) {
    console.log(chalk.red(`❌ Failed: ${result.failed.length} keys`));
  }
  console.log(chalk.cyan('═══════════════════════════════════════\n'));
  
  if (result.keys.length > 0) {
    const save = readlineSync.keyInYNStrict(chalk.yellow('Save keys to file?'));
    if (save) {
      const fs = require('fs');
      const filename = `licenses_${Date.now()}.txt`;
      const content = result.keys.join('\n');
      fs.writeFileSync(filename, content);
      console.log(chalk.green(`\n✅ Keys saved to ${filename}\n`));
    }
  }
  
  readlineSync.question(chalk.gray('Press Enter to continue...'));
}

// ==========================================
// START APPLICATION
// ==========================================

console.log(chalk.cyan('\n🔥 Initializing Firebase Admin...\n'));

// Start menu
showMenu().catch(error => {
  console.error(chalk.red('Fatal error:'), error);
  process.exit(1);
});
