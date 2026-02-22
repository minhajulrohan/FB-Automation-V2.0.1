const { app, BrowserWindow, ipcMain, dialog } = require('electron');
const path = require('path');
const Database = require('./database/db');
const AutomationEngine = require('./automation/engine');
const Logger = require('./utils/logger');
const Updater = require('./utils/updater');
let isActivating = false;

console.log('===========================================');
console.log('✅ MAIN.JS VERSION: GROUP-SUPPORT-v4');
console.log('===========================================');

const {
  checkLicenseStatus,
  loadLocalLicense,
  activateLicense
} = require('./utils/license');

let mainWindow;
let licenseWindow;
let db;
let automationEngine;
let logger;
let licenseStatus = null;
let updater = null;

function createLicenseWindow() {
  licenseWindow = new BrowserWindow({
    width: 500,
    height: 400,
    resizable: false,
    minimizable: false,
    maximizable: false,
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false
    },
    autoHideMenuBar: true,
    modal: true,
    title: 'License Activation Required'
  });

  licenseWindow.loadFile(path.join(__dirname, '../renderer/license.html'));

  licenseWindow.on('closed', () => {
    licenseWindow = null;
    if (!isActivating && (!licenseStatus || !licenseStatus.valid)) {
      app.quit();
    }
  });
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 1200,
    minHeight: 700,
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false,
      enableRemoteModule: true
    },
    autoHideMenuBar: true,
    icon: path.join(__dirname, '../assets/icon.png')
  });

  mainWindow.loadFile(path.join(__dirname, '../renderer/index.html'));

  if (process.argv.includes('--dev')) {
    mainWindow.webContents.openDevTools();
  }

  mainWindow.on('closed', () => {
    mainWindow = null;
  });

  mainWindow.webContents.on('did-finish-load', () => {
    if (licenseStatus && licenseStatus.valid) {
      mainWindow.webContents.send('license-info', {
        daysRemaining: licenseStatus.daysRemaining,
        expiryDate: licenseStatus.expiryDate
      });
    }
  });
}

async function verifyLicense() {
  try {
    const localLicense = loadLocalLicense();

    if (!localLicense) {
      console.log('No license found. Activation required.');
      return false;
    }

    licenseStatus = await checkLicenseStatus();

    if (!licenseStatus.valid) {
      console.error('License verification failed:', licenseStatus.error);

      if (licenseStatus.expired) {
        dialog.showErrorBox('License Expired', 'Your license has expired.\n\nPlease contact support to renew your license.');
      } else {
        dialog.showErrorBox('License Invalid', `License verification failed:\n\n${licenseStatus.error}`);
      }

      return false;
    }

    console.log(`License valid. Days remaining: ${licenseStatus.daysRemaining}`);

    if (licenseStatus.daysRemaining <= 3) {
      dialog.showMessageBox({
        type: 'warning',
        title: 'License Expiring Soon',
        message: `Your license will expire in ${licenseStatus.daysRemaining} day(s).`,
        detail: 'Please renew your license to avoid interruption.'
      });
    }

    return true;
  } catch (error) {
    console.error('License verification error:', error);
    dialog.showErrorBox('License Error', `Failed to verify license:\n\n${error.message}`);
    return false;
  }
}

// ==========================================
// UPDATE CHECKER HANDLERS
// ==========================================
ipcMain.handle('check-for-updates', async () => {
  try {
    if (!updater) updater = new Updater();
    const updateInfo = await updater.checkForUpdates();
    return { success: true, ...updateInfo };
  } catch (error) {
    return { success: false, error: error.message };
  }
});

ipcMain.handle('download-update', async (event, downloadUrl) => {
  try {
    if (!updater) updater = new Updater();
    const installerPath = await updater.downloadUpdate((progress, downloaded, total) => {
      if (mainWindow && mainWindow.webContents) {
        mainWindow.webContents.send('update-download-progress', { progress: Math.round(progress), downloaded, total });
      }
    });
    return { success: true, installerPath };
  } catch (error) {
    return { success: false, error: error.message };
  }
});

ipcMain.handle('install-update', async (event, installerPath) => {
  try {
    if (!updater) updater = new Updater();
    await updater.installUpdate(installerPath);
    return { success: true };
  } catch (error) {
    return { success: false, error: error.message };
  }
});

// ==========================================
// LICENSE HANDLERS
// ==========================================
ipcMain.handle('activate-license', async (event, licenseKey) => {
  try {
    const result = await activateLicense(licenseKey);
    if (result.valid) {
      isActivating = true;
      licenseStatus = result;

      logger = new Logger();
      db = new Database();
      automationEngine = new AutomationEngine(db, logger, sendToRenderer);

      setupIPCHandlers();

      // GROUP HANDLERS - directly here
      try { ipcMain.removeHandler('add-group'); } catch (e) { }
      try { ipcMain.removeHandler('get-groups'); } catch (e) { }
      try { ipcMain.removeHandler('delete-group'); } catch (e) { }
      try { ipcMain.removeHandler('toggle-group'); } catch (e) { }
      try { ipcMain.removeHandler('import-groups'); } catch (e) { }
      ipcMain.handle('add-group', async (event, group) => { return db.addGroup(group); });
      ipcMain.handle('get-groups', async () => { return db.getGroups(); });
      ipcMain.handle('delete-group', async (event, id) => { return db.deleteGroup(id); });
      ipcMain.handle('toggle-group', async (event, id, enabled) => { return db.toggleGroup(id, enabled); });
      ipcMain.handle('import-groups', async (event, params) => {
        const { urls, accountId } = params;
        if (!accountId || !urls || urls.length === 0) return [];
        return db.importGroups(urls, accountId);
      });

      createWindow();
      setupDailyReset();

      if (licenseWindow) {
        licenseWindow.destroy();
      }
    }
    return result;
  } catch (error) {
    return { valid: false, error: error.message };
  }
});

ipcMain.handle('get-license-info', async () => {
  if (licenseStatus && licenseStatus.valid) {
    const localLicense = loadLocalLicense();
    return {
      valid: true,
      key: localLicense.key,
      daysRemaining: licenseStatus.daysRemaining,
      expiryDate: licenseStatus.expiryDate.toISOString(),
      duration: localLicense.duration
    };
  }
  return { valid: false };
});

// ==========================================
// AUTO UPDATE CHECK
// ==========================================
async function checkAndNotifyUpdate() {
  try {
    console.log('Checking for updates automatically...');
    if (!updater) updater = new Updater();

    const updateInfo = await updater.checkForUpdates();

    if (updateInfo.updateAvailable) {
      console.log(`New version available: ${updateInfo.latestVersion}`);

      if (mainWindow && mainWindow.webContents) {
        mainWindow.webContents.send('update-available', {
          currentVersion: updateInfo.currentVersion,
          latestVersion: updateInfo.latestVersion,
          downloadUrl: updateInfo.downloadUrl,
          releaseNotes: updateInfo.releaseNotes
        });
      }

      const { Notification } = require('electron');
      if (Notification.isSupported()) {
        const notification = new Notification({
          title: '🎉 New Update Available!',
          body: `Version ${updateInfo.latestVersion} is now available! (Current: ${updateInfo.currentVersion})`,
          icon: path.join(__dirname, '../assets/icon.png'),
          urgency: 'normal'
        });
        notification.show();
        notification.on('click', () => {
          if (mainWindow) {
            mainWindow.focus();
            mainWindow.webContents.send('show-update-modal');
          }
        });
      }

      const response = await dialog.showMessageBox(mainWindow, {
        type: 'info',
        title: 'Update Available',
        message: `A new version (${updateInfo.latestVersion}) is available!`,
        detail: `Current version: ${updateInfo.currentVersion}\n\nWould you like to download and install the update now?`,
        buttons: ['Download Now', 'Remind Me Later', 'Skip This Version'],
        defaultId: 0,
        cancelId: 1
      });

      if (response.response === 0) {
        if (mainWindow) mainWindow.webContents.send('start-update-download', updateInfo);
      } else if (response.response === 2) {
        try {
          const Store = require('electron-store');
          const store = new Store();
          store.set('skippedVersion', updateInfo.latestVersion);
        } catch (error) {
          console.log('Skipped version tracking not available');
        }
      }
    } else {
      console.log('No updates available. Current version is up to date.');
    }
  } catch (error) {
    console.error('Auto update check failed:', error.message);
  }
}

// ==========================================
// BROWSER CHECK
// ==========================================
async function ensurePlaywrightBrowsers() {
  const fs = require('fs');
  const os = require('os');

  try {
    if (app.isPackaged) {
      const chromiumBase = path.join(process.resourcesPath, 'chromium');
      console.log('Checking bundled browser at:', chromiumBase);

      if (!fs.existsSync(chromiumBase)) {
        dialog.showErrorBox('Browser Not Found', 'Bundled browser files are missing. Please reinstall the application.');
        return false;
      }

      const winExe = path.join(chromiumBase, 'chrome-win', 'chrome.exe');
      const winExe64 = path.join(chromiumBase, 'chrome-win64', 'chrome.exe');
      const linuxExe = path.join(chromiumBase, 'chrome-linux', 'chrome');
      const macExe = path.join(chromiumBase, 'chrome-mac', 'Chromium.app', 'Contents', 'MacOS', 'Chromium');
      const browserExists = [winExe, winExe64, linuxExe, macExe].some(p => fs.existsSync(p));

      let nestedExists = false;
      if (!browserExists) {
        try {
          const items = fs.readdirSync(chromiumBase);
          for (const item of items) {
            const subDir = path.join(chromiumBase, item);
            if (fs.existsSync(subDir) && fs.statSync(subDir).isDirectory()) {
              const subPaths = [
                path.join(subDir, 'chrome-win', 'chrome.exe'),
                path.join(subDir, 'chrome-win64', 'chrome.exe'),
                path.join(subDir, 'chrome-linux', 'chrome'),
                path.join(subDir, 'chrome-mac', 'Chromium.app', 'Contents', 'MacOS', 'Chromium'),
              ];
              if (subPaths.some(p => fs.existsSync(p))) { nestedExists = true; break; }
            }
          }
        } catch (e) { console.warn('Nested browser check failed:', e.message); }
      }

      if (browserExists || nestedExists) {
        console.log('✅ Bundled browser verified successfully!');
        return true;
      } else {
        dialog.showErrorBox('Browser Error', 'Browser installation is corrupted. Please reinstall the application.');
        return false;
      }
    }

    console.log('Development mode: Checking Playwright browser installation...');
    const playwrightPath = path.join(os.homedir(), '.cache/ms-playwright');
    const windowsPath = path.join(process.env.LOCALAPPDATA || '', 'ms-playwright');
    const localPath1 = path.join(__dirname, '../../node_modules/playwright/.local-browsers');
    const localPath2 = path.join(__dirname, '../../node_modules/playwright-core/.local-browsers');

    const chromiumExists = [playwrightPath, windowsPath, localPath1, localPath2].some(p => {
      try {
        if (!p || !fs.existsSync(p)) return false;
        return fs.readdirSync(p).some(item => item.startsWith('chromium'));
      } catch (e) { return false; }
    });

    if (!chromiumExists) {
      console.log('Playwright browsers not found. Installing...');
      const response = dialog.showMessageBoxSync({
        type: 'info',
        title: 'First Time Setup',
        message: 'Browser components installing...',
        detail: 'Development mode: Installing Playwright Chromium. This is a one-time setup.',
        buttons: ['Install', 'Exit'],
        defaultId: 0,
        cancelId: 1
      });

      if (response === 1) { app.quit(); return false; }

      try {
        const { execSync } = require('child_process');
        execSync('npx playwright install chromium', { stdio: 'inherit', timeout: 300000 });
        console.log('Playwright browser installed successfully!');
        dialog.showMessageBoxSync({ type: 'info', title: 'Setup Complete', message: 'Browser components installed!', detail: 'Application is ready to use.' });
      } catch (installError) {
        console.error('Failed to install Playwright browser:', installError);
        dialog.showMessageBoxSync({ type: 'error', title: 'Installation Failed', message: 'Failed to install browser components.', detail: 'Please run manually:\n\nnpx playwright install chromium\n\nThen restart the app.', buttons: ['Exit'], defaultId: 0 });
        app.quit();
        return false;
      }
    } else {
      console.log('✅ Playwright browsers already installed (development mode).');
    }

    return true;
  } catch (error) {
    console.error('Error checking browser installation:', error);
    return true;
  }
}

// ==========================================
// APP INITIALIZATION
// ==========================================
app.whenReady().then(async () => {
  const browsersReady = await ensurePlaywrightBrowsers();
  if (!browsersReady) return;

  const isLicensed = await verifyLicense();
  if (!isLicensed) {
    createLicenseWindow();
    return;
  }

  logger = new Logger();
  db = new Database();
  automationEngine = new AutomationEngine(db, logger, sendToRenderer);

  setInterval(async () => {
    const status = await checkLicenseStatus();
    if (!status.valid) {
      console.error('License check failed:', status.error);
      if (automationEngine.isRunning) automationEngine.stop();
      dialog.showErrorBox('License Invalid', `License verification failed:\n\n${status.error}\n\nApplication will now close.`);
      app.quit();
    }
  }, 60 * 60 * 1000);

  setupIPCHandlers();

  // ============================================
  // GROUP HANDLERS - directly here, guaranteed
  // ============================================
  ipcMain.handle('add-group', async (event, group) => {
    console.log('[GROUP] add-group called', group);
    return db.addGroup(group);
  });
  ipcMain.handle('get-groups', async () => {
    console.log('[GROUP] get-groups called');
    return db.getGroups();
  });
  ipcMain.handle('delete-group', async (event, id) => {
    return db.deleteGroup(id);
  });
  ipcMain.handle('toggle-group', async (event, id, enabled) => {
    return db.toggleGroup(id, enabled);
  });
  ipcMain.handle('import-groups', async (event, params) => {
    const { urls, accountId } = params;
    if (!accountId || !urls || urls.length === 0) return [];
    return db.importGroups(urls, accountId);
  });

  createWindow();
  setupDailyReset();

  setTimeout(async () => { await checkAndNotifyUpdate(); }, 10000);
  setInterval(async () => { await checkAndNotifyUpdate(); }, 6 * 60 * 60 * 1000);
});

function sendToRenderer(event, data) {
  if (mainWindow && mainWindow.webContents) {
    mainWindow.webContents.send(event, data);
  }
}

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) createWindow();
});

// ==========================================
// ALL IPC HANDLERS
// ==========================================
function setupIPCHandlers() {
  // Stats
  ipcMain.handle('get-stats', async () => {
    return db.getStats();
  });

  // Account Management
  ipcMain.handle('add-account', async (event, account) => {
    return db.addAccount(account);
  });

  ipcMain.handle('get-accounts', async () => {
    return db.getAccounts();
  });

  ipcMain.handle('update-account', async (event, id, data) => {
    return db.updateAccount(id, data);
  });

  ipcMain.handle('delete-account', async (event, id) => {
    return db.deleteAccount(id);
  });

  ipcMain.handle('toggle-account', async (event, id, enabled) => {
    return db.toggleAccount(id, enabled);
  });

  // Post Management
  ipcMain.handle('add-post', async (event, post) => {
    return db.addPost(post);
  });

  ipcMain.handle('get-posts', async () => {
    return db.getPosts();
  });

  ipcMain.handle('delete-post', async (event, id) => {
    return db.deletePost(id);
  });

  ipcMain.handle('import-posts', async (event, params) => {
    console.log('\n=== IPC HANDLER: import-posts ===');
    const { urls, accountId } = params;
    console.log('Extracted urls:', urls);
    console.log('Extracted accountId:', accountId);

    try {
      if (!db) { console.error('❌ Database not initialized!'); return []; }
      if (!accountId) { console.error('❌ No accountId provided!'); return []; }
      if (!urls || urls.length === 0) { console.error('❌ No URLs provided!'); return []; }

      const result = db.importPosts(urls, accountId);
      console.log('db.importPosts returned:', result ? result.length : 0, 'items');
      return result;
    } catch (error) {
      console.error('❌ ERROR in import-posts handler:', error.message);
      return [];
    }
  });

  // Template Management
  ipcMain.handle('save-templates', async (event, accountId, templates) => {
    return db.saveTemplates(accountId, templates);
  });

  ipcMain.handle('get-templates', async (event, accountId) => {
    return db.getTemplates(accountId);
  });

  // Activity
  ipcMain.handle('get-activity', async (event, filters) => {
    return db.getActivity(filters);
  });

  // Settings
  ipcMain.handle('get-settings', async () => {
    return db.getSettings();
  });

  ipcMain.handle('save-settings', async (event, settings) => {
    return db.saveSettings(settings);
  });

  // Automation Control
  ipcMain.handle('start-automation', async () => {
    const status = await checkLicenseStatus();
    if (!status.valid) {
      return { success: false, error: `License invalid: ${status.error}` };
    }
    automationEngine.start();
    return { success: true };
  });

  ipcMain.handle('stop-automation', async () => {
    automationEngine.stop();
    return { success: true };
  });

  // Logs
  ipcMain.handle('get-logs', async () => {
    return db.getLogs(100);
  });

  ipcMain.handle('clear-logs', async () => {
    return db.clearLogs();
  });
}

// Daily reset
function setupDailyReset() {
  const cron = require('node-cron');
  cron.schedule('0 0 * * *', () => {
    logger.info('Running daily reset');
    db.resetDailyComments();
    logger.info('Daily counters reset');
  });
}
