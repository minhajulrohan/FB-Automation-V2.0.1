# Quick Start Guide - Version 2.0.0

## 🚀 Getting Started with Account-Specific Posting

### New to v2.0.0? Here's What You Need to Know

Version 2.0.0 introduces **account-specific post assignments**. This means:
- Every post belongs to ONE account
- Each account has its own post queue
- Same URL can be assigned to multiple accounts

---

## 📋 Setup Workflow

### Step 1: Add Your Accounts
1. Click **Accounts** tab
2. Click **Add Account**
3. Enter account details and cookies
4. Save

**Repeat for all accounts you want to use**

---

### Step 2: Add Posts (Method 1 - Single Post)
1. Click **Posts** tab
2. Click **Add Post**
3. **⚠️ IMPORTANT**: Select an account from the dropdown
4. Enter the Facebook post URL
5. (Optional) Add a title
6. Click **Save Post**

**The post is now assigned to that specific account**

---

### Step 3: Add Posts (Method 2 - Bulk Import)
1. Click **Posts** tab
2. Click **Import Posts**
3. **⚠️ IMPORTANT**: Select an account from the dropdown
4. Paste multiple URLs (one per line)
5. Click **Import Posts**

**All imported posts will be assigned to the selected account**

---

### Step 4: Configure Templates
1. Click **Templates** tab
2. Select an account from the dropdown
3. Add comment templates for that account
4. Click **Save Templates**

**Each account can have its own unique templates**

---

### Step 5: Configure Settings (Optional)
1. Click **Settings** tab
2. Adjust:
   - Comment delays
   - Max comments per account
   - Reaction settings
   - Working hours
3. Click **Save Settings**

---

### Step 6: Start Automation
1. Ensure at least one account is enabled
2. Ensure at least one post is assigned to that account
3. Click **Start Automation** button
4. Monitor the **Activity** tab

---

## 🎯 Common Use Cases

### Use Case 1: Different Accounts for Different Posts
**Scenario**: You have 3 accounts and want each to handle different posts

**Setup**:
```
Account A → Post URLs: 1, 2, 3
Account B → Post URLs: 4, 5, 6
Account C → Post URLs: 7, 8, 9
```

**How to**:
1. Add Post 1, assign to Account A
2. Add Post 2, assign to Account A
3. Add Post 3, assign to Account A
4. Add Post 4, assign to Account B
... and so on

---

### Use Case 2: Multiple Accounts on Same Posts
**Scenario**: You want all 3 accounts to comment on the same 5 posts

**Setup**:
```
Account A → Post URLs: 1, 2, 3, 4, 5
Account B → Post URLs: 1, 2, 3, 4, 5
Account C → Post URLs: 1, 2, 3, 4, 5
```

**How to**:
1. Add Post 1, assign to Account A
2. Add Post 1 again, assign to Account B
3. Add Post 1 again, assign to Account C
4. Repeat for posts 2, 3, 4, 5

**OR use bulk import**:
1. Import all 5 URLs, assign to Account A
2. Import all 5 URLs again, assign to Account B
3. Import all 5 URLs again, assign to Account C

---

### Use Case 3: Load Distribution
**Scenario**: You have 100 posts and 5 accounts

**Setup**:
```
Account A → Posts 1-20
Account B → Posts 21-40
Account C → Posts 41-60
Account D → Posts 61-80
Account E → Posts 81-100
```

**How to**:
1. Prepare 5 text files with 20 URLs each
2. Import file 1, assign to Account A
3. Import file 2, assign to Account B
... and so on

---

## ⚙️ Understanding the Posts Table

When you view the **Posts** tab, you'll see:

| Assigned Account | Post URL | Title | Total Comments | Last Visited | Actions |
|-----------------|----------|-------|----------------|--------------|---------|
| **Account A** | facebook.com/... | My Post | 5 | 2 hours ago | 🗑️ |
| **Account B** | facebook.com/... | Another Post | 3 | 1 hour ago | 🗑️ |

The **Assigned Account** badge shows which account will process that post.

---

## 🔍 Monitoring Your Automation

### Dashboard Stats
- Total Comments
- Total Reacts
- Active Accounts
- Total Posts (across all accounts)

### Activity Log
Shows:
- Which account performed the action
- Which post was processed
- Success/failure status
- Pending/declined comments

### Posts Table
Shows:
- Which account is assigned to each post
- How many times it's been commented on
- When it was last visited

---

## ⚠️ Important Notes

### ❌ Don't Do This:
- ~~Add a post without selecting an account~~ (Will show error)
- ~~Expect posts to be automatically assigned~~ (Manual assignment required)
- ~~Assume old behavior where any account can pick up any post~~ (Account isolation now enforced)

### ✅ Do This:
- Always select an account when adding posts
- Review the Posts table to see assignments
- Use bulk import for efficiency
- Create unique templates per account for variety
- Monitor Activity tab for issues

---

## 🆘 Troubleshooting

### Problem: "Cannot add post" or "Please select an account"
**Solution**: You must select an account from the dropdown before saving

### Problem: "No posts configured for account X"
**Solution**: That account has no posts assigned to it. Add posts for that account.

### Problem: Posts not appearing in table
**Solution**: Click the Posts tab to refresh. Check if you have any accounts added.

### Problem: Automation not starting
**Solution**: 
1. Check if at least one account is enabled
2. Check if that account has posts assigned to it
3. Check if you've reached daily comment limits

### Problem: Same URL shows multiple times
**Solution**: This is normal! Each entry is for a different account. This is the new account isolation feature.

---

## 💡 Pro Tips

1. **Testing Strategy**: Start with one account and a few posts to test your setup
2. **Template Variety**: Create different template styles for each account
3. **Stagger Timing**: Adjust account switch delays to spread out activity
4. **Monitor Carefully**: Watch for checkpoint warnings or failed comments
5. **Regular Maintenance**: Review and update templates periodically
6. **Strategic Assignment**: Consider which accounts should handle which types of posts

---

## 📊 Example Workflow

**Scenario**: You have 2 accounts and 10 posts, want both to comment everywhere

```
Step 1: Add Account "Personal" ✅
Step 2: Add Account "Business" ✅

Step 3: Import 10 URLs for "Personal" ✅
Result: 10 posts assigned to Personal

Step 4: Import same 10 URLs for "Business" ✅
Result: 10 more posts assigned to Business

Total in Posts Table: 20 entries
- 10 for Personal
- 10 for Business

Automation Behavior:
- Personal processes its 10 posts
- Business processes its 10 posts
- Both can comment on the same URL independently
```

---

## 🎓 Best Practices

### Account Management
- Enable/disable accounts to control which ones are active
- Monitor checkpoint warnings
- Keep track of daily comment counts

### Post Management
- Group similar posts to the same account
- Use descriptive titles for easier identification
- Delete posts that are no longer needed

### Template Management
- Keep templates varied and natural
- Test new templates with one account first
- Update regularly to avoid detection patterns

### Settings Optimization
- Start with conservative delays (higher values)
- Reduce delays gradually if needed
- Enable auto-delete for pending comments
- Use working hours to avoid late-night activity

---

## 🚀 Ready to Go!

You're now ready to use FB Comment Automation v2.0.0 with complete account isolation!

### Quick Checklist:
- [ ] Accounts added
- [ ] Posts added and assigned to accounts
- [ ] Templates configured per account
- [ ] Settings reviewed
- [ ] Automation started
- [ ] Activity monitored

**Happy Automating! 🎉**

---

## 📚 Further Reading

- `UPGRADE-V2.0.0.md` - Detailed upgrade information
- `CHANGELOG.md` - Complete list of changes
- `README.md` - Full documentation
- `SETUP.md` - Initial setup guide

---

**Need Help?** Check the troubleshooting section or contact support with specific details about your issue.
