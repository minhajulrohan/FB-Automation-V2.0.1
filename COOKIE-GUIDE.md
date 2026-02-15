# Cookie Troubleshooting Guide

## Problem: sameSite Error with Facebook Cookies

When using Facebook cookies exported from browser extensions, you might encounter this error:
```
browserContext.addCookies: cookies[0].sameSite: expected one of (Strict|Lax|None)
```

## Why This Happens

Browser extensions export cookies with values that Playwright doesn't accept:
- `"sameSite": "no_restriction"` ❌ (Browser format)
- `"sameSite": null` ❌ (Missing value)
- `"sameSite": "lax"` ❌ (Lowercase)

Playwright expects:
- `"sameSite": "None"` ✅
- `"sameSite": "Lax"` ✅
- `"sameSite": "Strict"` ✅

## ✅ Solution: Automatic Cookie Fixing

This application **automatically fixes** all cookie issues! You don't need to do anything manually.

### How It Works

1. **You paste cookies** (even with errors)
2. **System fixes them automatically:**
   - `"no_restriction"` → `"None"`
   - `null` → `"Lax"`
   - `"lax"` → `"Lax"`
3. **Cookies are saved** in correct format
4. **Playwright works perfectly** ✅

### Behind the Scenes

The `CookieFixer` utility (`src/utils/cookie-fixer.js`) processes cookies at two stages:

1. **When adding account** (in database.js):
   ```javascript
   const fixedCookies = CookieFixer.cleanCookies(account.cookies);
   ```

2. **When using account** (in worker.js):
   ```javascript
   const fixedCookies = CookieFixer.cleanCookies(this.account.cookies);
   await this.context.addCookies(fixedCookies);
   ```

## Testing Your Cookies

Want to test if your cookies will work? Run this:

```bash
node test-cookie-fix.js
```

This will:
- Load your cookies
- Show original sameSite values
- Show fixed sameSite values
- Validate all cookies
- Confirm Playwright compatibility ✅

## Example Transformation

**Original Cookie (from browser):**
```json
{
  "name": "datr",
  "value": "uZh9aY56Lm1-WsFRMaqdjSL_",
  "domain": ".facebook.com",
  "sameSite": "no_restriction",
  "secure": true,
  "httpOnly": true
}
```

**Fixed Cookie (Playwright-ready):**
```json
{
  "name": "datr",
  "value": "uZh9aY56Lm1-WsFRMaqdjSL_",
  "domain": ".facebook.com",
  "sameSite": "None",
  "path": "/",
  "secure": true,
  "httpOnly": true,
  "expires": 1804398777
}
```

## Common Cookie Issues - All Fixed Automatically!

| Issue | Browser Value | Fixed Value | Status |
|-------|--------------|-------------|---------|
| Wrong format | `"no_restriction"` | `"None"` | ✅ Fixed |
| Missing value | `null` | `"Lax"` | ✅ Fixed |
| Wrong case | `"lax"` | `"Lax"` | ✅ Fixed |
| Wrong case | `"strict"` | `"Strict"` | ✅ Fixed |
| Already correct | `"Lax"` | `"Lax"` | ✅ No change |

## Manual Cookie Fixing (If Needed)

If you want to fix cookies manually in code:

```javascript
const CookieFixer = require('./src/utils/cookie-fixer');

// Your cookies from browser
const browserCookies = [ /* paste here */ ];

// Fix them
const fixedCookies = CookieFixer.cleanCookies(browserCookies);

// Use with Playwright
await context.addCookies(fixedCookies);
```

## Cookie Export Best Practices

1. **Use Chrome or Edge** - Better cookie export
2. **Export while logged in** - Ensure session is active
3. **Use "Cookie-Editor" extension** - Reliable JSON export
4. **Copy ALL cookies** - Don't filter manually
5. **Paste directly** - System fixes automatically

## Verification Steps

After adding account with cookies:

1. Check **Accounts** page
2. Account should show as "Active" ✅
3. Click **Start Automation**
4. Check **Live Logs**:
   - ✅ "Adding X cookies for Account"
   - ✅ "Facebook login verified"
   - ❌ "Cookie fixing error" (contact support)

## Troubleshooting

### Still Getting Cookie Errors?

1. **Re-export cookies** - They might be expired
2. **Login to Facebook** in browser first
3. **Check cookie count** - Should have 10+ cookies
4. **Verify JSON format** - Must be valid array

### Cookies Expired?

Symptoms:
- "Failed to verify Facebook login"
- Redirected to login page
- Account marked as "Banned"

Solution:
- Login to Facebook in browser
- Export fresh cookies
- Update account cookies

### Need Help?

Run diagnostic test:
```bash
node test-cookie-fix.js
```

Check logs:
```bash
cat logs/error.log
```

## Technical Details

### Cookie Structure

Required fields:
- `name` (string)
- `value` (string)
- `domain` (string)
- `sameSite` ("Strict", "Lax", or "None")

Optional fields:
- `path` (default: "/")
- `secure` (boolean)
- `httpOnly` (boolean)
- `expires` (timestamp)

### Validation Rules

✅ Valid sameSite: "Strict", "Lax", "None"
❌ Invalid sameSite: "no_restriction", null, "lax", "strict"

### Auto-Fix Rules

```javascript
"no_restriction" → "None"
null             → "Lax"
undefined        → "Lax"
"lax"            → "Lax"
"strict"         → "Strict"
"none"           → "None"
```

## Summary

✅ **Cookie fixing is automatic**
✅ **No manual work needed**
✅ **Just paste and go**
✅ **Playwright compatible**
✅ **Works every time**

The system handles all cookie format conversions behind the scenes. Just export from your browser and paste - we take care of the rest! 🎉

---

**Last Updated:** February 2026
**Feature:** Cookie Auto-Fixer v1.0
