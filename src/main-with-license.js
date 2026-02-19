const { app, BrowserWindow, ipcMain, dialog } = require('electron');
const path = require('path');
const Database = require('./database/db');
const AutomationEngine = require('./automation/engine');
const Logger = require('./utils/logger');
const Updater = require('./utils/updater');


// ==========================================
// LICENSE SYSTEM INTEGRATION
// ==========================================
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

// ==========================================
// LICENSE ACTIVATION WINDOW
// ==========================================

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
    // If license not activated, quit app
    if (!licenseStatus || !licenseStatus.valid) {
      app.quit();
    }
  });
}

// ==========================================
// MAIN APPLICATION WINDOW
// ==========================================

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

  // Send license info to renderer
  mainWindow.webContents.on('did-finish-load', () => {
    if (licenseStatus && licenseStatus.valid) {
      mainWindow.webContents.send('license-info', {
        daysRemaining: licenseStatus.daysRemaining,
        expiryDate: licenseStatus.expiryDate
      });
    }
  });
}

// ==========================================
// LICENSE VERIFICATION ON STARTUP
// ==========================================
async function verifyLicense() {
  try {
    const localLicense = loadLocalLicense();

    if (!localLicense) {
      // No license found - show activation window
      console.log('No license found. Activation required.');
      return false;
    }

    // Verify license status
    licenseStatus = await checkLicenseStatus();

    if (!licenseStatus.valid) {
      console.error('License verification failed:', licenseStatus.error);

      // Show error dialog
      if (licenseStatus.expired) {
        dialog.showErrorBox(
          'License Expired',
          'Your license has expired.\n\nPlease contact support to renew your license.'
        );
      } else {
        dialog.showErrorBox(
          'License Invalid',
          `License verification failed:\n\n${licenseStatus.error}`
        );
      }

      return false;
    }

    console.log(`License valid. Days remaining: ${licenseStatus.daysRemaining}`);

    // Show warning if license expiring soon
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
    dialog.showErrorBox(
      'License Error',
      `Failed to verify license:\n\n${error.message}`
    );
    return false;
  }
}

// ==========================================
// APP INITIALIZATION
// ==========================================
app.whenReady().then(async () => {
  // Verify license first
  const isLicensed = await verifyLicense();

  if (!isLicensed) {
    // Show license activation window
    createLicenseWindow();
    return;
  }

  // License valid - initialize app
  logger = new Logger();
  db = new Database();
  automationEngine = new AutomationEngine(db, logger, sendToRenderer);

  // Setup periodic license check (every hour)
  setInterval(async () => {
    const status = await checkLicenseStatus();
    if (!status.valid) {
      console.error('License check failed:', status.error);

      // Stop automation
      if (automationEngine.isRunning) {
        automationEngine.stop();
      }

      // Show error and quit
      dialog.showErrorBox(
        'License Invalid',
        `License verification failed:\n\n${status.error}\n\nApplication will now close.`
      );

      app.quit();
    }
  }, 60 * 60 * 1000); // Every hour

  createWindow();
  setupIPCHandlers();
  setupDailyReset();
});

function sendToRenderer(event, data) {
  if (mainWindow && mainWindow.webContents) {
    mainWindow.webContents.send(event, data);
  }
}

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow();
  }
});

// ==========================================
// LICENSE IPC HANDLERS
// ==========================================
ipcMain.handle('activate-license', async (event, licenseKey) => {
  try {
    const result = await activateLicense(licenseKey);

    if (result.valid) {
      licenseStatus = result;

      // Close license window
      if (licenseWindow) {
        licenseWindow.close();
      }

      // Initialize app
      logger = new Logger();
      db = new Database();
      automationEngine = new AutomationEngine(db, logger, sendToRenderer);

      // Create main window
      createWindow();
      setupIPCHandlers();
      setupDailyReset();
    }

    return result;
  } catch (error) {
    return {
      valid: false,
      error: error.message
    };
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
// EXISTING IPC HANDLERS (Protected)
// ==========================================

function setupIPCHandlers() {
  // Dashboard Stats
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

  ipcMain.handle('import-posts', async (event, postUrls) => {
    return db.importPosts(postUrls);
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

  // Automation Control - WITH LICENSE CHECK
  ipcMain.handle('start-automation', async () => {
    // Verify license before starting automation
    const status = await checkLicenseStatus();
    if (!status.valid) {
      return {
        success: false,
        error: `License invalid: ${status.error}`
      };
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

  // ==========================================
  // UPDATE CHECKER HANDLERS
  // ==========================================

  // 1. Update Check Handler - GitHub থেকে নতুন version check করে
  ipcMain.handle('check-for-updates', async () => {
    try {
      if (!updater) {
        updater = new Updater();
      }
      const updateInfo = await updater.checkForUpdates();
      return {
        success: true,
        ...updateInfo
      };
    } catch (error) {
      return {
        success: false,
        error: error.message
      };
    }
  });

  // 2. Download Update Handler - Installer download করে progress সহ
  ipcMain.handle('download-update', async (event, downloadUrl) => {
    try {
      if (!updater) {
        updater = new Updater();
      }

      const installerPath = await updater.downloadUpdate((progress, downloaded, total) => {
        // Download progress renderer এ পাঠায়
        if (mainWindow && mainWindow.webContents) {
          mainWindow.webContents.send('update-download-progress', {
            progress: Math.round(progress),
            downloaded,
            total
          });
        }
      });

      return {
        success: true,
        installerPath
      };
    } catch (error) {
      return {
        success: false,
        error: error.message
      };
    }
  });

  // 3. Install Update Handler - Downloaded installer run করে এবং app restart করে
  ipcMain.handle('install-update', async (event, installerPath) => {
    try {
      if (!updater) {
        updater = new Updater();
      }

      await updater.installUpdate(installerPath);
      return {
        success: true
      };
    } catch (error) {
      return {
        success: false,
        error: error.message
      };
    }
  });
}

// Daily reset cron job
function setupDailyReset() {
  const cron = require('node-cron');

  // Reset at midnight
  cron.schedule('0 0 * * *', () => {
    logger.info('Running daily reset');
    db.resetDailyComments();
    logger.info('Daily counters reset');
  });
}
