const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('path');
const Database = require('./database/db');
const AutomationEngine = require('./automation/engine');
const Logger = require('./utils/logger');

let mainWindow;
let db;
let automationEngine;
let logger;

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
}

app.whenReady().then(() => {
  // Initialize components
  logger = new Logger();
  db = new Database();
  automationEngine = new AutomationEngine(db, logger, sendToRenderer);

  createWindow();
  setupIPC();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    if (automationEngine) {
      automationEngine.stop();
    }
    app.quit();
  }
});

function sendToRenderer(channel, data) {
  if (mainWindow && mainWindow.webContents) {
    mainWindow.webContents.send(channel, data);
  }
}

function setupIPC() {
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

  // Post Management (changed from Group Management)
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

  // Comment Templates
  ipcMain.handle('save-templates', async (event, accountId, templates) => {
    return db.saveTemplates(accountId, templates);
  });

  ipcMain.handle('get-templates', async (event, accountId) => {
    return db.getTemplates(accountId);
  });

  // Settings
  ipcMain.handle('save-settings', async (event, settings) => {
    return db.saveSettings(settings);
  });

  ipcMain.handle('get-settings', async () => {
    return db.getSettings();
  });

  // Automation Control
  ipcMain.handle('start-automation', async () => {
    try {
      await automationEngine.start();
      return { success: true };
    } catch (error) {
      logger.error('Failed to start automation:', error);
      return { success: false, error: error.message };
    }
  });

  ipcMain.handle('stop-automation', async () => {
    try {
      await automationEngine.stop();
      return { success: true };
    } catch (error) {
      logger.error('Failed to stop automation:', error);
      return { success: false, error: error.message };
    }
  });

  ipcMain.handle('get-automation-status', async () => {
    return automationEngine.getStatus();
  });

  // Logs
  ipcMain.handle('get-logs', async (event, limit = 100) => {
    return db.getLogs(limit);
  });

  ipcMain.handle('clear-logs', async () => {
    return db.clearLogs();
  });

  // Activity History
  ipcMain.handle('get-activity', async (event, filters) => {
    return db.getActivity(filters);
  });
}

// Graceful shutdown
process.on('SIGINT', async () => {
  if (automationEngine) {
    await automationEngine.stop();
  }
  app.quit();
});

process.on('SIGTERM', async () => {
  if (automationEngine) {
    await automationEngine.stop();
  }
  app.quit();
});
