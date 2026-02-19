# Changelog

All notable changes to FB Comment Automation Tool will be documented in this file.

## [2.0.0] - 2026-02-05

### 🎉 Major Release - Account Isolation

This is a major architectural upgrade that changes how posts and accounts interact.

### ✨ Added

#### Database
- **Account-Specific Posts**: Added `accountId` field to `posts` table
- **Unique Constraint**: Posts can now have the same URL for different accounts `UNIQUE(url, accountId)`
- **Foreign Key**: Added cascading delete for posts when account is deleted
- **New Method**: `getPostsByAccount(accountId)` - Fetch posts for a specific account
- **Migration Script**: Automatic database migration from v1.0.0 to v2.0.0

#### UI Components
- **Account Selector in Add Post Modal**: Required dropdown to assign post to an account
- **Account Selector in Import Posts Modal**: Bulk import with account assignment
- **Assigned Account Column**: Posts table now displays which account owns each post
- **Account Badge**: Visual badge showing account name in posts table
- **Account Dropdown Population**: Automatic population of account selectors from database

#### Automation Engine
- **Account-Filtered Post Queue**: Each account now only processes its assigned posts
- **Independent Processing**: Multiple accounts can work on the same URL simultaneously
- **Per-Account URL Tracking**: Removed global "hasAnyAccountPosted" check
- **Account-Specific Logging**: Log messages now show which account is processing

#### User Experience
- **Validation**: Cannot save post without selecting an account
- **Clear Account Labels**: Account names displayed prominently in UI
- **Migration Backup**: Automatic database backup before migration
- **Migration Progress**: Detailed progress and result reporting

### 🔄 Changed

#### Breaking Changes
- **Posts Structure**: All posts must now have an assigned account
- **Import Function**: `importPosts()` now requires `accountId` parameter
- **Add Post Function**: `addPost()` now requires `accountId` in post object
- **Engine Logic**: `runAutomationLoop()` uses `getPostsByAccount()` instead of `getPosts()`

#### Database Changes
```sql
-- OLD Schema
CREATE TABLE posts (
  id TEXT PRIMARY KEY,
  url TEXT UNIQUE NOT NULL,  -- Global uniqueness
  ...
)

-- NEW Schema
CREATE TABLE posts (
  id TEXT PRIMARY KEY,
  url TEXT NOT NULL,
  accountId TEXT NOT NULL,   -- NEW: Required field
  UNIQUE(url, accountId),    -- Per-account uniqueness
  FOREIGN KEY (accountId) REFERENCES accounts(id) ON DELETE CASCADE
)
```

#### Automation Behavior
- **Before**: Posts were globally shared, first account to reach a URL would "claim" it
- **After**: Each account has its own isolated post queue
- **Before**: Global check prevented any account from processing a URL twice
- **After**: Account-specific check allows independent processing per account

#### UI Flow
- **Before**: Add post → Enter URL → Save
- **After**: Add post → Select Account → Enter URL → Save

### 🐛 Fixed

- **Multi-Account Conflict**: Fixed issue where accounts couldn't process the same URL
- **Global State Pollution**: Removed shared post state between accounts
- **Template Isolation**: Enforced account-specific template usage (was working, now clearer)
- **Worker Post Filtering**: Worker now correctly filters posts by account
- **Engine Distribution**: Engine no longer distributes all posts to all accounts

### 🗑️ Removed

- **Global URL Tracking**: Removed `hasAnyAccountPosted` global check
- **Shared Post Pool**: No more global post queue shared by all accounts
- **Automatic Post Assignment**: Posts must now be explicitly assigned to accounts

### 📝 Documentation

- Added `UPGRADE-V2.0.0.md` - Comprehensive upgrade guide
- Added `migrate-database.js` - Automatic migration script
- Updated README sections for v2.0.0 features
- Added migration checklist and troubleshooting guide

### ⚠️ Migration Notes

**For Existing Users:**
1. **Automatic Backup**: A backup of your database will be created automatically
2. **Post Assignment**: All existing posts will be assigned to your first account
3. **Manual Reassignment**: You can reassign posts to different accounts after migration
4. **No Data Loss**: All posts, accounts, templates, and settings are preserved

**Migration Strategy:**
- Run application normally - migration happens automatically
- Or run: `npm run migrate` before starting the app
- Check backup location in application data folder
- Verify all posts are visible and correctly assigned

### 🔧 Technical Details

#### Files Modified
- `src/database/db.js` - Updated schema and methods
- `src/automation/engine.js` - Account-filtered post processing
- `src/automation/worker.js` - Per-account URL tracking
- `renderer/index.html` - Added account selectors
- `renderer/renderer.js` - Updated UI logic and post handling
- `src/main.js` - Updated IPC handlers
- `package.json` - Version bump and migrate script

#### Files Added
- `migrate-database.js` - Database migration tool
- `UPGRADE-V2.0.0.md` - Upgrade documentation
- `CHANGELOG.md` - This file

### 🎯 Use Cases Enabled

1. **Parallel Processing**: Multiple accounts commenting on same posts simultaneously
2. **Account Specialization**: Assign specific posts to specific accounts
3. **Load Distribution**: Distribute posts across accounts strategically
4. **Independent Scheduling**: Each account works through its own queue
5. **Isolated Testing**: Test new templates on specific accounts without affecting others

### ⚙️ Configuration

No configuration file changes required. All existing settings remain compatible:
- Comment delays
- Account switching
- Reaction settings
- Working hours
- All other automation settings

### 🔒 Security

- Maintained encryption for cookies
- Preserved license verification
- Account data remains isolated
- No cross-account data leakage

### 🚀 Performance

- **Improved**: No more waiting for global lock on URLs
- **Improved**: Parallel processing reduces overall execution time
- **Maintained**: Same browser resource usage per account
- **Maintained**: Same API rate limit considerations

---

## [1.0.0] - 2024-12-XX

### Initial Release

- Facebook comment automation
- Multi-account support
- Template system with mutation
- Auto-reaction feature
- Working hours scheduling
- Pending comment detection and deletion
- Activity logging
- License-based activation
- Cookie management with automatic fixing
- Proxy support
- Settings management
- Dashboard with statistics

---

## Version Comparison

| Feature | v1.0.0 | v2.0.0 |
|---------|--------|--------|
| Account Support | ✅ Multiple | ✅ Multiple |
| Post Management | ✅ Global Pool | ✅ Account-Specific |
| URL Reuse | ❌ No | ✅ Yes |
| Account Isolation | ⚠️ Partial | ✅ Complete |
| Template System | ✅ Per-Account | ✅ Per-Account |
| Parallel Processing | ❌ No | ✅ Yes |
| Account Assignment | ❌ Automatic | ✅ Manual |
| Migration Required | N/A | ✅ Yes |

---

## Upgrade Path

```
v1.0.0 → v2.0.0
├── Automatic migration script
├── Database backup created
├── Posts assigned to first account
└── Manual reassignment available
```

---

## Support

For issues related to:
- **Migration**: Check backup files, review migration logs
- **Post Assignment**: Use UI to reassign posts to accounts
- **Performance**: Monitor Activity tab for issues
- **Bugs**: Report with version number and error details

---

**Note**: Semantic versioning is followed. Major version bump (2.0.0) indicates breaking changes requiring migration.
