# Development Guide

## Project Architecture

### Overview
This is an Electron-based desktop application with a main process (Node.js backend) and renderer process (web UI).

### Key Components

#### 1. Main Process (`src/main.js`)
- Electron application entry point
- Manages windows and IPC communication
- Coordinates between database, automation, and UI

#### 2. Database (`src/database/db.js`)
- SQLite database management
- CRUD operations for accounts, groups, templates
- Activity logging and statistics
- Cookie encryption/decryption

#### 3. Automation Engine (`src/automation/engine.js`)
- Orchestrates automation workflow
- Manages worker lifecycle
- Handles account rotation
- Implements cooldown and scheduling

#### 4. Automation Worker (`src/automation/worker.js`)
- Per-account automation execution
- Browser initialization and management
- Group processing logic
- Error handling and recovery

#### 5. Facebook Automator (`src/automation/facebook.js`)
- Facebook-specific interactions
- DOM selectors and fallbacks
- Comment posting logic
- Reaction system
- Checkpoint detection

#### 6. Comment Mutator (`src/utils/mutator.js`)
- Text variation generation
- Synonym replacement
- Emoji insertion
- Spacing and punctuation changes

#### 7. Renderer (`renderer/`)
- Electron UI using HTML/CSS/JS
- IPC communication with main process
- Real-time updates and live logs
- Modal management

## Development Setup

### Prerequisites
- Node.js 18+
- Git
- Code editor (VS Code recommended)

### Clone and Install
```bash
git clone <repository>
cd fb-comment-automation
npm install
```

### Run in Development Mode
```bash
npm run dev
```
This opens DevTools automatically.

### Project Structure
```
fb-comment-automation/
├── src/                    # Main process (Node.js)
│   ├── main.js            # Entry point
│   ├── database/          # Database layer
│   ├── automation/        # Automation logic
│   └── utils/             # Utilities
├── renderer/              # Renderer process (UI)
│   ├── index.html         # Main page
│   ├── styles.css         # Styles
│   └── renderer.js        # UI logic
├── data/                  # Database storage
├── logs/                  # Application logs
└── assets/                # Icons and images
```

## Key Concepts

### IPC Communication
Main process and renderer communicate via IPC:

**Renderer → Main:**
```javascript
const result = await ipcRenderer.invoke('method-name', data);
```

**Main → Renderer:**
```javascript
mainWindow.webContents.send('event-name', data);
```

### Database Operations
All data is stored in SQLite:
```javascript
// Add account
db.addAccount({ name, cookies, proxy });

// Get stats
const stats = db.getStats();

// Log activity
db.logActivity({ accountId, action, status });
```

### Automation Flow
1. Engine starts workers for each account
2. Worker initializes browser with account
3. Worker processes groups sequentially
4. For each group: get posts → comment → react
5. Worker cleans up and returns to engine
6. Engine switches to next account

### Anti-Ban Strategy
- Random delays everywhere
- Human-like typing
- Scroll simulation
- Post skipping
- Account cooldowns
- Working hours
- Checkpoint detection

## Customization

### Adding New Features

#### 1. Add Database Method
Edit `src/database/db.js`:
```javascript
addNewFeature(data) {
  const stmt = this.db.prepare('INSERT INTO table ...');
  stmt.run(data);
}
```

#### 2. Add IPC Handler
Edit `src/main.js`:
```javascript
ipcMain.handle('new-feature', async (event, data) => {
  return db.addNewFeature(data);
});
```

#### 3. Add UI Component
Edit `renderer/index.html` and `renderer/renderer.js`:
```javascript
async function handleNewFeature() {
  const result = await ipcRenderer.invoke('new-feature', data);
  // Update UI
}
```

### Modifying Selectors

If Facebook changes their UI, update selectors in `src/automation/facebook.js`:

```javascript
const commentBoxSelectors = [
  'div[aria-label="Write a comment"][role="textbox"]',
  'div[contenteditable="true"][aria-label*="comment"]',
  // Add new selectors here
];
```

### Adjusting Behavior

**Change delays:**
Edit default settings in `src/database/db.js` → `initDefaultSettings()`

**Change mutation logic:**
Edit `src/utils/mutator.js` → add new mutation methods

**Change automation logic:**
Edit `src/automation/worker.js` → modify `processGroup()` method

## Testing

### Manual Testing
1. Add 1 test account
2. Add 1-2 test groups
3. Add simple templates
4. Start automation
5. Monitor logs carefully
6. Check for errors

### Debug Mode
Run with DevTools:
```bash
npm run dev
```

Check logs in:
- Dashboard live logs
- `logs/error.log`
- `logs/combined.log`
- Browser console (when DevTools open)

### Common Issues

**"Cannot find module"**
→ Run `npm install`

**Database locked**
→ Close all instances, delete `data/*.db-journal`

**Playwright errors**
→ Run `npx playwright install chromium`

**Selectors not working**
→ Facebook updated UI, need new selectors

## Building for Production

### Create Installer
```bash
npm run build:win
```

Output: `dist/FB Comment Automator Setup.exe`

### Build Configuration
Edit `package.json` → `build` section:
```json
{
  "build": {
    "appId": "com.fbautomation.app",
    "productName": "FB Comment Automator",
    "win": {
      "target": "nsis",
      "icon": "assets/icon.ico"
    }
  }
}
```

## Code Style

### Naming Conventions
- Variables: `camelCase`
- Functions: `camelCase`
- Classes: `PascalCase`
- Constants: `UPPER_CASE`
- Files: `kebab-case.js`

### Async/Await
Always use async/await, not callbacks:
```javascript
// Good
const result = await db.getAccounts();

// Bad
db.getAccounts((err, result) => { ... });
```

### Error Handling
Always wrap in try/catch:
```javascript
try {
  await doSomething();
} catch (error) {
  logger.error('Failed:', error);
  // Handle gracefully
}
```

## Performance

### Database
- Use prepared statements
- Index frequently queried columns
- Batch operations when possible

### Browser
- Reuse browser contexts
- Clean up properly
- Avoid memory leaks

### UI
- Limit log history (100 items)
- Debounce frequent updates
- Use virtual scrolling for large lists

## Security

### Cookie Encryption
Cookies are encrypted with AES before storage:
```javascript
encrypt(text) {
  return crypto.AES.encrypt(text, SECRET).toString();
}
```

### Best Practices
- Never log sensitive data
- Encrypt stored credentials
- No network calls except browser
- Local-only data storage

## Debugging Tips

### Enable Verbose Logging
Edit `src/utils/logger.js`:
```javascript
level: 'debug'  // instead of 'info'
```

### Inspect Database
```bash
sqlite3 data/automation.db
.tables
SELECT * FROM accounts;
```

### Browser DevTools
When running non-headless, you can:
- Inspect page elements
- Check console errors
- Monitor network requests
- Debug selectors

### Common Breakpoints
Add `debugger;` statements in:
- `worker.js` → `processGroup()`
- `facebook.js` → `addComment()`
- `renderer.js` → button handlers

## Contributing

### Before Submitting
1. Test thoroughly
2. Update documentation
3. Follow code style
4. Add comments for complex logic
5. Check for console errors

### Pull Request Template
- What does this change?
- Why is it needed?
- How was it tested?
- Any breaking changes?

## Troubleshooting Development

### Electron won't start
```bash
rm -rf node_modules
npm install
```

### Database errors
```bash
rm data/*.db
# Restart app (will recreate)
```

### Playwright issues
```bash
npx playwright install --force chromium
```

## Resources

- Electron: https://www.electronjs.org/docs
- Playwright: https://playwright.dev/docs/intro
- SQLite: https://www.sqlite.org/docs.html
- Node.js: https://nodejs.org/docs

## Maintenance

### Regular Updates
- Update dependencies monthly
- Test on latest Node.js LTS
- Monitor Playwright releases
- Check Facebook UI changes

### Version Management
Update version in `package.json`:
```json
{
  "version": "1.1.0"
}
```

---

Happy coding! 🚀
