const Database = require('better-sqlite3');
const path = require('path');
const os = require('os');

// Database path
const dbPath = path.join(os.homedir(), '.fb-automation', 'data.db');

console.log('🔄 Starting database migration...');
console.log('📂 Database path:', dbPath);

try {
  const db = new Database(dbPath);

  // Check current table structure
  const tableInfo = db.prepare("PRAGMA table_info(posts)").all();
  console.log('\n📋 Current posts table structure:');
  console.table(tableInfo);

  // Get existing data
  const existingPosts = db.prepare("SELECT * FROM posts").all();
  console.log(`\n📊 Found ${existingPosts.length} existing posts`);

  // Drop the old table
  console.log('\n🗑️  Dropping old posts table...');
  db.exec('DROP TABLE IF EXISTS posts_backup');
  db.exec('ALTER TABLE posts RENAME TO posts_backup');

  // Create new table without UNIQUE constraint
  console.log('✨ Creating new posts table without UNIQUE constraint...');
  db.exec(`
    CREATE TABLE posts (
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

  // Copy data from backup
  console.log('📥 Copying data from backup...');
  db.exec(`
    INSERT INTO posts (id, url, title, accountId, enabled, totalComments, lastVisited, createdAt)
    SELECT id, url, title, accountId, enabled, totalComments, lastVisited, createdAt
    FROM posts_backup
  `);

  // Verify migration
  const newPostsCount = db.prepare("SELECT COUNT(*) as count FROM posts").get();
  console.log(`\n✅ Migration complete! ${newPostsCount.count} posts migrated successfully`);

  // Drop backup table
  console.log('🧹 Cleaning up backup table...');
  db.exec('DROP TABLE posts_backup');

  console.log('\n🎉 Database migration completed successfully!');
  console.log('ℹ️  You can now add duplicate URLs to the same account.');

  db.close();
} catch (error) {
  console.error('\n❌ Migration failed:', error.message);
  console.error(error.stack);
  process.exit(1);
}
