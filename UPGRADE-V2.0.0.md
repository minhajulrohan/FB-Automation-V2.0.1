# FB Automation Tool - Version 2.0.0
## Account Isolation & Account-Specific Posting Update

---

## 🎉 What's New in Version 2.0.0

### **Complete Account Isolation**
Version 2.0.0 introduces a major architectural upgrade that provides complete isolation between accounts. This means:

✅ **Account-Specific Posts** - Each post is now assigned to a specific account
✅ **Independent Processing** - Multiple accounts can work on the same URL simultaneously  
✅ **Account-Specific Templates** - Templates remain linked to individual accounts
✅ **Better Control** - Granular control over which account handles which posts
✅ **No More Global Conflicts** - Removed global "hasAnyAccountPosted" checks

---

## 🚀 Key Features

### 1. **Account Assignment in Posts**
- Every post must now be assigned to a specific account
- Posts are ONLY processed by their assigned account
- Same URL can be assigned to multiple accounts for parallel processing

### 2. **Enhanced UI**
- **Add Post Modal**: Account selector dropdown added
- **Import Posts Modal**: Bulk import with account assignment
- **Posts Table**: Shows which account is assigned to each post
- **Templates Page**: Already had account-specific template support

### 3. **Improved Automation Engine**
- `engine.js` now fetches posts filtered by `accountId`
- `worker.js` checks per-account posting history, not global
- Each account operates independently with its own post queue

---

## 📦 Installation & Migration

### For New Users:
Just install and use! The new database schema will be created automatically.

### For Existing Users (Upgrading from v1.0.0):

#### ⚠️ IMPORTANT: Backup Your Data First!

```bash
# 1. Stop the application if running

# 2. Locate your database file:
# Windows: C:\Users\YourName\AppData\Roaming\fb-comment-automation\automation.db
# Mac: ~/Library/Application Support/fb-comment-automation/automation.db
# Linux: ~/.config/fb-comment-automation/automation.db

# 3. Create a manual backup (optional, migration script does this automatically)
# Copy automation.db to automation_backup.db
```

#### Migration Options:

**Option 1: Automatic Migration (Recommended)**
The migration script will automatically run when you first start v2.0.0:
- Creates a timestamped backup
- Migrates all posts to the first account in your database
- Shows detailed progress

**Option 2: Manual Migration**
Run the migration script separately:
```bash
npm run migrate
```

**Option 3: Fresh Start**
If you prefer to start fresh:
1. Delete the old database file
2. Re-add your accounts
3. Add posts with proper account assignments

---

## 📚 How to Use

### Adding a Single Post
1. Go to **Posts** tab
2. Click **Add Post**
3. **Select Account** from dropdown (Required!)
4. Enter Post URL
5. Optional: Add a title
6. Click **Save Post**

### Bulk Import Posts
1. Go to **Posts** tab
2. Click **Import Posts**
3. **Select Account** from dropdown (Required!)
4. Paste URLs (one per line)
5. Click **Import Posts**

### Viewing Posts
The Posts table now shows:
- **Assigned Account** (as a badge)
- Post URL
- Title
- Total Comments
- Last Visited
- Actions (Delete)

### Managing Templates
Templates work the same as before:
1. Go to **Templates** tab
2. Select an account
3. Add/edit templates for that specific account
4. Templates are automatically used by the assigned account

---

## 🔧 Technical Changes

### Database Schema Updates

#### **Posts Table (Updated)**
```sql
CREATE TABLE posts (
  id TEXT PRIMARY KEY,
  url TEXT NOT NULL,
  title TEXT,
  accountId TEXT NOT NULL,           -- NEW FIELD
  enabled INTEGER DEFAULT 1,
  totalComments INTEGER DEFAULT 0,
  lastVisited INTEGER,
  createdAt INTEGER DEFAULT (strftime('%s', 'now')),
  UNIQUE(url, accountId),             -- NEW CONSTRAINT
  FOREIGN KEY (accountId) REFERENCES accounts(id) ON DELETE CASCADE
)
```

### Code Changes

#### **db.js**
- `addPost(post)` - Now requires `post.accountId`
- `importPosts(urls, accountId)` - Now requires `accountId` parameter
- `getPostsByAccount(accountId)` - New method to fetch account-specific posts

#### **engine.js**
- `runAutomationLoop()` - Now calls `getPostsByAccount(account.id)` instead of global `getPosts()`
- Each account only processes its assigned posts

#### **worker.js**
- `processPosts()` - Removed global URL check
- Now checks `hasPostedToUrl(accountId, url)` for account-specific tracking
- Multiple accounts can process the same URL independently

#### **renderer.js**
- `populateAccountDropdowns()` - New function to populate account selectors
- `savePostBtn` - Updated to require account selection
- `importPosts` - Updated to require account selection
- `renderPostsTable()` - Shows assigned account name

#### **index.html**
- Added account selector in `postModal`
- Added account selector in `importPostsModal`
- Updated posts table to show "Assigned Account" column

---

## 🐛 Bug Fixes

✅ Fixed: Global posting check preventing multiple accounts from commenting on same post
✅ Fixed: Templates not properly isolated between accounts (already was working, now enforced in UI)
✅ Fixed: Worker not filtering posts by account
✅ Fixed: Engine distributing all posts to all accounts

---

## ⚙️ Configuration

No configuration changes needed! All settings from v1.0.0 remain compatible:
- Comment delays
- Account switching delays
- Max comments per account
- Reaction settings
- Working hours
- All other settings

---

## 📋 Migration Checklist

After upgrading to v2.0.0:

- [ ] Run the application (automatic migration should occur)
- [ ] Verify backup was created
- [ ] Check Posts tab - all posts should show assigned account
- [ ] Review post assignments
- [ ] Reassign posts to different accounts if needed
- [ ] Add new posts with specific account assignments
- [ ] Test automation with multiple accounts
- [ ] Verify templates are still accessible per account

---

## 🆘 Troubleshooting

### Issue: "No posts added yet" after migration
**Solution**: Check if accounts exist. Migration requires at least one account.

### Issue: Posts not showing in table
**Solution**: Reload the page or switch to another tab and back.

### Issue: Cannot add post without account
**Solution**: This is intentional! Add accounts first, then assign posts.

### Issue: Migration failed
**Solution**: 
1. Check the backup file created during migration
2. Restore from backup if needed
3. Contact support with error details

### Issue: Old posts not visible
**Solution**: All old posts are now assigned to your first account. They should be visible in the Posts tab.

---

## 📞 Support

If you encounter any issues:
1. Check the backup files in your application data directory
2. Review the logs in the Logs section
3. Contact support with detailed error information

---

## 🎯 Best Practices

### Account Assignment Strategy

**Option 1: URL-Based Assignment**
- Assign different post URLs to different accounts
- Prevents any overlapping
- Good for small-scale operations

**Option 2: Parallel Processing**
- Assign the SAME URLs to multiple accounts
- Each account will independently comment
- Great for high-volume operations
- Monitor for potential rate limiting

**Option 3: Hybrid Approach**
- Some URLs exclusive to specific accounts
- Some URLs shared across multiple accounts
- Balance between safety and volume

### Template Management
- Create unique templates for each account
- Vary your message style between accounts
- Use the mutation feature for additional variation
- Review and update templates regularly

### Monitoring
- Check Activity tab regularly
- Monitor pending/declined comments
- Watch for checkpoint warnings
- Adjust delays if seeing issues

---

## 🔮 Future Enhancements

Planned for future versions:
- Bulk reassign posts to different accounts
- Post filtering and search
- Account performance analytics
- Smart post distribution suggestions
- Template sharing between accounts (optional)

---

## 📄 License

This software requires an active license. Your existing license from v1.0.0 remains valid.

---

## ✨ Upgrade Summary

```
Version 1.0.0 → Version 2.0.0

OLD BEHAVIOR:
❌ Global post pool
❌ First account to reach a URL "claims" it
❌ Other accounts skip that URL
❌ No control over which account handles which post

NEW BEHAVIOR:
✅ Account-specific post assignments
✅ Each account has its own post queue
✅ Multiple accounts can process same URL independently
✅ Complete control over account-post relationships
✅ True account isolation
```

---

**Version**: 2.0.0  
**Release Date**: February 2026  
**Compatibility**: Requires migration from v1.0.0  
**Status**: Stable Release
