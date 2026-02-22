const Database = require('better-sqlite3');
const path = require('path');
const crypto = require('crypto-js');
const { v4: uuidv4 } = require('uuid');
const CookieFixer = require('../utils/cookie-fixer');
const { app } = require('electron'); // এটি যোগ করুন

class DatabaseManager {
  constructor() {
    // আগের dbPath পরিবর্তন করে নিচেরটি দিন
    const dbPath = path.join(app.getPath('userData'), 'automation.db');
    this.db = new Database(dbPath);
    this.initTables();
  }

  initTables() {
    // Accounts table
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS accounts (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        cookies TEXT NOT NULL,
        proxy TEXT,
        userAgent TEXT,
        deviceProfile TEXT,
        enabled INTEGER DEFAULT 1,
        status TEXT DEFAULT 'active',
        commentsToday INTEGER DEFAULT 0,
        totalComments INTEGER DEFAULT 0,
        totalReacts INTEGER DEFAULT 0,
        lastUsed INTEGER,
        checkpointDetected INTEGER DEFAULT 0,
        createdAt INTEGER DEFAULT (strftime('%s', 'now'))
      )
    `);

    // Migrate: add deviceProfile column if it doesn't exist (for existing databases)
    try {
      this.db.exec(`ALTER TABLE accounts ADD COLUMN deviceProfile TEXT`);
    } catch (_) { /* column already exists */ }

    // Posts table (changed from groups)
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS posts (
        id TEXT PRIMARY KEY,
        url TEXT NOT NULL,
        title TEXT,
        accountId TEXT NOT NULL,
        enabled INTEGER DEFAULT 1,
        totalComments INTEGER DEFAULT 0,
        lastVisited INTEGER,
        createdAt INTEGER DEFAULT (strftime('%s', 'now')),
        FOREIGN KEY (accountId) REFERENCES accounts(id) ON DELETE CASCADE
      )
    `);

    // Comment templates table
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS templates (
        id TEXT PRIMARY KEY,
        accountId TEXT NOT NULL,
        templateType TEXT NOT NULL,
        content TEXT NOT NULL,
        FOREIGN KEY (accountId) REFERENCES accounts(id) ON DELETE CASCADE
      )
    `);

    // Activity log table
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS activity (
        id TEXT PRIMARY KEY,
        accountId TEXT NOT NULL,
        postId TEXT,
        postUrl TEXT,
        action TEXT NOT NULL,
        status TEXT NOT NULL,
        comment TEXT,
        reaction TEXT,
        timestamp INTEGER DEFAULT (strftime('%s', 'now')),
        FOREIGN KEY (accountId) REFERENCES accounts(id) ON DELETE CASCADE,
        FOREIGN KEY (postId) REFERENCES posts(id) ON DELETE SET NULL
      )
    `);

    // Settings table
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS settings (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL
      )
    `);

    // Logs table
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS logs (
        id TEXT PRIMARY KEY,
        level TEXT NOT NULL,
        message TEXT NOT NULL,
        data TEXT,
        timestamp INTEGER DEFAULT (strftime('%s', 'now'))
      )
    `);

    // Posted URLs tracking
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS posted_urls (
        id TEXT PRIMARY KEY,
        accountId TEXT NOT NULL,
        postUrl TEXT NOT NULL,
        timestamp INTEGER DEFAULT (strftime('%s', 'now')),
        UNIQUE(accountId, postUrl)
      )
    `);

    // Facebook Groups table
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS fb_groups (
        id TEXT PRIMARY KEY,
        url TEXT NOT NULL,
        name TEXT,
        accountId TEXT NOT NULL,
        enabled INTEGER DEFAULT 1,
        totalComments INTEGER DEFAULT 0,
        lastVisited INTEGER,
        createdAt INTEGER DEFAULT (strftime('%s', 'now')),
        FOREIGN KEY (accountId) REFERENCES accounts(id) ON DELETE CASCADE
      )
    `);

    // Initialize default settings
    this.initDefaultSettings();
  }

  initDefaultSettings() {
    const defaultSettings = {
      commentDelayMin: 30,
      commentDelayMax: 120,
      maxCommentsPerAccount: 20,
      accountSwitchDelay: 60,
      groupRotationDelay: 10,
      groupDelayMin: 30,
      groupDelayMax: 120,
      autoDeletePending: true,
      autoReact: true,
      reactionTypes: ['LIKE', 'LOVE', 'HAHA', 'WOW'],
      reactionProbability: 70,
      reactionDelayMin: 2,
      reactionDelayMax: 8,
      headless: false,
      workingHoursStart: 9,
      workingHoursEnd: 21,
      respectWorkingHours: false,
      automationMode: 'posts'
    };

    const stmt = this.db.prepare('INSERT OR IGNORE INTO settings (key, value) VALUES (?, ?)');
    for (const [key, value] of Object.entries(defaultSettings)) {
      stmt.run(key, JSON.stringify(value));
    }
  }

  // Encryption helpers
  encrypt(text) {
    return crypto.AES.encrypt(text, 'fb-automation-secret-key').toString();
  }

  decrypt(ciphertext) {
    const bytes = crypto.AES.decrypt(ciphertext, 'fb-automation-secret-key');
    return bytes.toString(crypto.enc.Utf8);
  }

  // Account methods
  addAccount(account) {
    const id = uuidv4();

    // Fix cookies before saving
    const fixedCookies = CookieFixer.cleanCookies(account.cookies);

    const stmt = this.db.prepare(`
      INSERT INTO accounts (id, name, cookies, proxy, userAgent, deviceProfile)
      VALUES (?, ?, ?, ?, ?, ?)
    `);

    stmt.run(
      id,
      account.name,
      this.encrypt(JSON.stringify(fixedCookies)),
      account.proxy || null,
      account.userAgent || null,
      account.deviceProfile ? JSON.stringify(account.deviceProfile) : null
    );

    return { id, ...account, cookies: fixedCookies };
  }

  getAccounts() {
    const stmt = this.db.prepare('SELECT * FROM accounts ORDER BY createdAt DESC');
    const accounts = stmt.all();

    return accounts.map(acc => ({
      ...acc,
      cookies: JSON.parse(this.decrypt(acc.cookies)),
      enabled: Boolean(acc.enabled),
      checkpointDetected: Boolean(acc.checkpointDetected),
      deviceProfile: acc.deviceProfile ? JSON.parse(acc.deviceProfile) : null
    }));
  }

  updateAccount(id, data) {
    const fields = [];
    const values = [];

    if (data.name) {
      fields.push('name = ?');
      values.push(data.name);
    }
    if (data.cookies) {
      fields.push('cookies = ?');
      values.push(this.encrypt(JSON.stringify(data.cookies)));
    }
    if (data.proxy !== undefined) {
      fields.push('proxy = ?');
      values.push(data.proxy);
    }
    if (data.userAgent) {
      fields.push('userAgent = ?');
      values.push(data.userAgent);
    }
    if (data.status) {
      fields.push('status = ?');
      values.push(data.status);
    }

    values.push(id);

    const stmt = this.db.prepare(`
      UPDATE accounts SET ${fields.join(', ')} WHERE id = ?
    `);
    stmt.run(...values);
  }

  deleteAccount(id) {
    const stmt = this.db.prepare('DELETE FROM accounts WHERE id = ?');
    stmt.run(id);
  }

  toggleAccount(id, enabled) {
    const stmt = this.db.prepare('UPDATE accounts SET enabled = ? WHERE id = ?');
    stmt.run(enabled ? 1 : 0, id);
  }

  incrementAccountComments(id) {
    const stmt = this.db.prepare(`
      UPDATE accounts 
      SET commentsToday = commentsToday + 1,
          totalComments = totalComments + 1,
          lastUsed = strftime('%s', 'now')
      WHERE id = ?
    `);
    stmt.run(id);
  }

  incrementAccountReacts(id) {
    const stmt = this.db.prepare(`
      UPDATE accounts 
      SET totalReacts = totalReacts + 1
      WHERE id = ?
    `);
    stmt.run(id);
  }

  resetDailyComments() {
    const stmt = this.db.prepare('UPDATE accounts SET commentsToday = 0');
    stmt.run();
  }

  markAccountCheckpoint(id) {
    const stmt = this.db.prepare(`
      UPDATE accounts 
      SET checkpointDetected = 1, 
          enabled = 0,
          status = 'checkpoint'
      WHERE id = ?
    `);
    stmt.run(id);
  }

  // Post methods
  addPost(post) {
    const id = uuidv4();
    const stmt = this.db.prepare(`
      INSERT INTO posts (id, url, title, accountId)
      VALUES (?, ?, ?, ?)
    `);
    stmt.run(id, post.url, post.title || null, post.accountId);
    return { id, ...post };
  }

  getPosts() {
    const stmt = this.db.prepare('SELECT * FROM posts ORDER BY createdAt DESC');
    return stmt.all().map(p => ({
      ...p,
      enabled: Boolean(p.enabled)
    }));
  }

  getPostsByAccount(accountId) {
    const stmt = this.db.prepare('SELECT * FROM posts WHERE accountId = ? ORDER BY createdAt DESC');
    return stmt.all(accountId).map(p => ({
      ...p,
      enabled: Boolean(p.enabled)
    }));
  }

  deletePost(id) {
    const stmt = this.db.prepare('DELETE FROM posts WHERE id = ?');
    stmt.run(id);
  }

  importPosts(postUrls, accountId) {
    console.log('=== importPosts CALLED ===');
    console.log('Parameter 1 (postUrls):', postUrls);
    console.log('Parameter 2 (accountId):', accountId);

    // Handle both old and new calling patterns
    let urls, accId;

    if (typeof postUrls === 'object' && !Array.isArray(postUrls) && postUrls.urls) {
      // New pattern: object with urls and accountId
      console.log('📦 Receiving as object');
      urls = postUrls.urls;
      accId = postUrls.accountId;
    } else if (Array.isArray(postUrls) && accountId) {
      // Old pattern: separate parameters
      console.log('📋 Receiving as separate parameters');
      urls = postUrls;
      accId = accountId;
    } else {
      console.error('❌ Invalid parameters format');
      console.log('postUrls:', postUrls);
      console.log('accountId:', accountId);
      return [];
    }

    console.log('✅ Processed parameters:');
    console.log('  urls:', urls);
    console.log('  accountId:', accId);

    // Validate accountId
    if (!accId || accId === "" || accId === "null" || accId === "undefined") {
      console.error("❌ CRITICAL ERROR: No Account ID!");
      return [];
    }

    console.log('✅ Account ID validation passed');

    // Prepare statement
    let stmt;
    try {
      stmt = this.db.prepare(`
        INSERT INTO posts (id, url, accountId, enabled)
        VALUES (?, ?, ?, 1)
      `);
      console.log('✅ SQL statement prepared');
    } catch (err) {
      console.error('❌ Failed to prepare SQL:', err.message);
      return [];
    }

    const imported = [];

    for (let i = 0; i < urls.length; i++) {
      const url = urls[i];
      const id = uuidv4();
      const cleanUrl = url.trim();

      console.log(`Processing URL ${i + 1}/${urls.length}: ${cleanUrl}`);

      if (!cleanUrl) {
        console.log('⚠️  Skipping empty URL');
        continue;
      }

      try {
        stmt.run(id, cleanUrl, accId);
        imported.push({ id, url: cleanUrl, accountId: accId });
        console.log(`✅ Successfully imported: ${cleanUrl}`);
      } catch (err) {
        console.error(`❌ Error inserting URL: ${cleanUrl}`);
        console.error('Error:', err.message);
      }
    }

    console.log('=== IMPORT COMPLETE ===');
    console.log(`Successfully imported: ${imported.length} out of ${urls.length}`);

    return imported;
  }


  updatePostVisit(id) {
    const stmt = this.db.prepare(`
      UPDATE posts 
      SET lastVisited = strftime('%s', 'now')
      WHERE id = ?
    `);
    stmt.run(id);
  }

  incrementPostComments(id) {
    const stmt = this.db.prepare(`
      UPDATE posts 
      SET totalComments = totalComments + 1
      WHERE id = ?
    `);
    stmt.run(id);
  }

  // Template methods
  saveTemplates(accountId, templates) {
    // Delete existing templates for this account
    const deleteStmt = this.db.prepare('DELETE FROM templates WHERE accountId = ?');
    deleteStmt.run(accountId);

    // Insert new templates
    const insertStmt = this.db.prepare(`
      INSERT INTO templates (id, accountId, templateType, content)
      VALUES (?, ?, ?, ?)
    `);

    for (const template of templates) {
      insertStmt.run(uuidv4(), accountId, template.type, template.content);
    }
  }

  getTemplates(accountId) {
    const stmt = this.db.prepare('SELECT * FROM templates WHERE accountId = ?');
    return stmt.all(accountId);
  }

  // Posted URLs tracking
  hasPostedToUrl(accountId, postUrl) {
    const stmt = this.db.prepare(`
      SELECT COUNT(*) as count FROM posted_urls 
      WHERE accountId = ? AND postUrl = ?
    `);
    const result = stmt.get(accountId, postUrl);
    return result.count > 0;
  }

  markUrlAsPosted(accountId, postUrl) {
    const stmt = this.db.prepare(`
      INSERT OR IGNORE INTO posted_urls (id, accountId, postUrl)
      VALUES (?, ?, ?)
    `);
    stmt.run(uuidv4(), accountId, postUrl);
  }

  // Activity logging
  logActivity(activity) {
    const stmt = this.db.prepare(`
      INSERT INTO activity (id, accountId, postId, postUrl, action, status, comment, reaction)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `);
    stmt.run(
      uuidv4(),
      activity.accountId,
      activity.postId || null,
      activity.postUrl || null,
      activity.action,
      activity.status,
      activity.comment || null,
      activity.reaction || null
    );
  }

  getActivity(filters = {}) {
    let query = `
      SELECT 
        a.*,
        acc.name as accountName,
        p.title as postTitle
      FROM activity a
      LEFT JOIN accounts acc ON a.accountId = acc.id
      LEFT JOIN posts p ON a.postId = p.id
      WHERE 1=1
    `;

    const params = [];

    if (filters.accountId) {
      query += ' AND a.accountId = ?';
      params.push(filters.accountId);
    }

    if (filters.action) {
      query += ' AND a.action = ?';
      params.push(filters.action);
    }

    if (filters.status) {
      query += ' AND a.status = ?';
      params.push(filters.status);
    }

    query += ' ORDER BY a.timestamp DESC LIMIT ?';
    params.push(filters.limit || 100);

    const stmt = this.db.prepare(query);
    return stmt.all(...params);
  }

  // Settings
  saveSettings(settings) {
    const stmt = this.db.prepare(`
      INSERT OR REPLACE INTO settings (key, value)
      VALUES (?, ?)
    `);

    for (const [key, value] of Object.entries(settings)) {
      stmt.run(key, JSON.stringify(value));
    }
  }

  getSettings() {
    const stmt = this.db.prepare('SELECT * FROM settings');
    const rows = stmt.all();

    const settings = {};
    for (const row of rows) {
      settings[row.key] = JSON.parse(row.value);
    }
    return settings;
  }

  // Logs
  addLog(level, message, data = null) {
    const stmt = this.db.prepare(`
      INSERT INTO logs (id, level, message, data)
      VALUES (?, ?, ?, ?)
    `);
    stmt.run(uuidv4(), level, message, data ? JSON.stringify(data) : null);
  }

  getLogs(limit = 100) {
    const stmt = this.db.prepare(`
      SELECT * FROM logs 
      ORDER BY timestamp DESC 
      LIMIT ?
    `);
    return stmt.all(limit);
  }

  clearLogs() {
    const stmt = this.db.prepare('DELETE FROM logs');
    stmt.run();
  }

  // Stats
  getStats() {
    const accounts = this.db.prepare('SELECT * FROM accounts').all();
    const posts = this.db.prepare('SELECT * FROM posts').all();

    const totalComments = this.db.prepare(
      'SELECT SUM(totalComments) as total FROM accounts'
    ).get();

    const totalReacts = this.db.prepare(
      'SELECT SUM(totalReacts) as total FROM accounts'
    ).get();

    const pendingComments = this.db.prepare(`
      SELECT COUNT(*) as count FROM activity 
      WHERE action = 'comment' AND status = 'pending'
    `).get();

    const declinedComments = this.db.prepare(`
      SELECT COUNT(*) as count FROM activity 
      WHERE action = 'comment' AND status = 'declined'
    `).get();

    // Group stats
    let groups = [];
    let totalGroupComments = 0;
    let activeGroups = 0;
    try {
      groups = this.db.prepare('SELECT * FROM fb_groups').all();
      const gc = this.db.prepare('SELECT SUM(totalComments) as total FROM fb_groups').get();
      totalGroupComments = gc.total || 0;
      activeGroups = groups.filter(g => g.enabled).length;
    } catch (e) { }

    // totalComments = post mode comments + group mode comments (merged)
    const combinedComments = (totalComments.total || 0) + totalGroupComments;

    return {
      totalAccounts: accounts.length,
      activeAccounts: accounts.filter(a => a.enabled && a.status === 'active').length,
      disabledAccounts: accounts.filter(a => !a.enabled).length,
      bannedAccounts: accounts.filter(a => a.checkpointDetected).length,
      totalPosts: posts.length,
      totalComments: combinedComments,
      totalReacts: totalReacts.total || 0,
      pendingComments: pendingComments.count || 0,
      declinedComments: declinedComments.count || 0,
      totalGroups: groups.length,
      activeGroups,
      totalGroupComments,
    };
  }
  // =====================================================
  // Facebook Group Management
  // =====================================================

  addGroup(group) {
    const id = uuidv4();
    const stmt = this.db.prepare(`
      INSERT INTO fb_groups (id, url, name, accountId)
      VALUES (?, ?, ?, ?)
    `);
    stmt.run(id, group.url, group.name || null, group.accountId);
    return { id, ...group };
  }

  getGroups() {
    const stmt = this.db.prepare('SELECT * FROM fb_groups ORDER BY createdAt DESC');
    return stmt.all();
  }

  getGroupsByAccount(accountId) {
    const stmt = this.db.prepare('SELECT * FROM fb_groups WHERE accountId = ? ORDER BY createdAt DESC');
    return stmt.all(accountId);
  }

  deleteGroup(id) {
    const stmt = this.db.prepare('DELETE FROM fb_groups WHERE id = ?');
    stmt.run(id);
  }

  toggleGroup(id, enabled) {
    const stmt = this.db.prepare('UPDATE fb_groups SET enabled = ? WHERE id = ?');
    stmt.run(enabled ? 1 : 0, id);
  }

  updateGroupVisit(id) {
    const stmt = this.db.prepare('UPDATE fb_groups SET lastVisited = strftime(\'%s\', \'now\') WHERE id = ?');
    stmt.run(id);
  }

  incrementGroupComments(id) {
    const stmt = this.db.prepare('UPDATE fb_groups SET totalComments = totalComments + 1 WHERE id = ?');
    stmt.run(id);
  }

  importGroups(groupUrls, accountId) {
    const results = [];
    const stmt = this.db.prepare(`
      INSERT INTO fb_groups (id, url, accountId, enabled)
      VALUES (?, ?, ?, 1)
    `);
    for (const url of groupUrls) {
      if (url && url.trim()) {
        const id = uuidv4();
        stmt.run(id, url.trim(), accountId);
        results.push({ id, url: url.trim(), accountId });
      }
    }
    return results;
  }
}

module.exports = DatabaseManager;
