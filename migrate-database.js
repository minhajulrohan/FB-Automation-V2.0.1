/**
 * Database Migration Script
 * Version 1.0.0 -> Version 2.0.0 (Account Isolation)
 * 
 * This script migrates the old database schema to the new schema where:
 * - Posts are now linked to specific accounts (accountId field added)
 * - Each account has its own isolated set of posts
 * 
 * IMPORTANT: Run this ONCE before using Version 2.0.0
 */

const Database = require('better-sqlite3');
const path = require('path');
const { app } = require('electron');
const fs = require('fs');

console.log('========================================');
console.log('FB Automation Database Migration Tool');
console.log('Version 1.0.0 -> 2.0.0');
console.log('========================================\n');

// Get database path
const dbPath = path.join(app.getPath('userData'), 'automation.db');

if (!fs.existsSync(dbPath)) {
  console.log('❌ No existing database found at:', dbPath);
  console.log('✅ This appears to be a fresh installation. No migration needed.');
  process.exit(0);
}

// Backup the database first
const backupPath = path.join(app.getPath('userData'), `automation_backup_${Date.now()}.db`);
console.log('📦 Creating backup at:', backupPath);
fs.copyFileSync(dbPath, backupPath);
console.log('✅ Backup created successfully\n');

// Open database
const db = new Database(dbPath);

try {
  console.log('🔍 Checking database schema...');
  
  // Check if migration is needed
  const tableInfo = db.prepare("PRAGMA table_info(posts)").all();
  const hasAccountId = tableInfo.some(col => col.name === 'accountId');
  
  if (hasAccountId) {
    console.log('✅ Database is already up to date. No migration needed.');
    db.close();
    process.exit(0);
  }
  
  console.log('🔄 Migration needed. Starting migration...\n');
  
  // Get all existing posts
  const posts = db.prepare('SELECT * FROM posts').all();
  console.log(`📊 Found ${posts.length} existing posts`);
  
  // Get all accounts
  const accounts = db.prepare('SELECT * FROM accounts').all();
  console.log(`👥 Found ${accounts.length} accounts\n`);
  
  if (accounts.length === 0) {
    console.log('⚠️  No accounts found. Posts cannot be migrated.');
    console.log('Please add accounts first, then re-run migration.');
    db.close();
    process.exit(1);
  }
  
  // Start transaction
  db.exec('BEGIN TRANSACTION');
  
  try {
    // Create new posts table with accountId
    console.log('🔨 Creating new posts table schema...');
    db.exec(`
      CREATE TABLE IF NOT EXISTS posts_new (
        id TEXT PRIMARY KEY,
        url TEXT NOT NULL,
        title TEXT,
        accountId TEXT NOT NULL,
        enabled INTEGER DEFAULT 1,
        totalComments INTEGER DEFAULT 0,
        lastVisited INTEGER,
        createdAt INTEGER DEFAULT (strftime('%s', 'now')),
        UNIQUE(url, accountId),
        FOREIGN KEY (accountId) REFERENCES accounts(id) ON DELETE CASCADE
      )
    `);
    
    // Migrate existing posts
    console.log('📝 Migrating posts...');
    console.log('Strategy: Assigning all posts to the first account\n');
    
    const firstAccount = accounts[0];
    const insertStmt = db.prepare(`
      INSERT INTO posts_new (id, url, title, accountId, enabled, totalComments, lastVisited, createdAt)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `);
    
    let migrated = 0;
    for (const post of posts) {
      try {
        insertStmt.run(
          post.id,
          post.url,
          post.title,
          firstAccount.id, // Assign to first account
          post.enabled,
          post.totalComments,
          post.lastVisited,
          post.createdAt
        );
        migrated++;
        console.log(`  ✓ Migrated post: ${post.url}`);
      } catch (err) {
        console.log(`  ✗ Error migrating post ${post.url}:`, err.message);
      }
    }
    
    // Drop old table and rename new one
    console.log('\n🔄 Replacing old table...');
    db.exec('DROP TABLE posts');
    db.exec('ALTER TABLE posts_new RENAME TO posts');
    
    // Commit transaction
    db.exec('COMMIT');
    
    console.log('\n✅ Migration completed successfully!');
    console.log(`📊 Migrated ${migrated} out of ${posts.length} posts`);
    console.log(`👤 All posts assigned to: ${firstAccount.name}\n`);
    
    console.log('💡 NEXT STEPS:');
    console.log('1. Review the migrated posts in the Posts tab');
    console.log('2. Reassign posts to different accounts as needed');
    console.log('3. Add new posts with specific account assignments');
    console.log('4. The backup file is saved at:', backupPath);
    
  } catch (error) {
    // Rollback on error
    db.exec('ROLLBACK');
    throw error;
  }
  
} catch (error) {
  console.error('\n❌ Migration failed:', error.message);
  console.error('Stack trace:', error.stack);
  console.log('\n🔄 Database has been rolled back to original state');
  console.log('📦 Backup is available at:', backupPath);
  process.exit(1);
} finally {
  db.close();
}

console.log('\n========================================');
console.log('Migration process completed');
console.log('========================================');
