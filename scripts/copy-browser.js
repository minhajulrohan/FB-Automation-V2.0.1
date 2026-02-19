/**
 * copy-browser.js
 * 
 * Build করার আগে playwright এর chromium browser টা
 * browser-bundle/chromium ফোল্ডারে copy করে।
 * electron-builder এরপর এটা app এর সাথে bundle করে দেয়।
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');
const os = require('os');

console.log('🔍 Playwright Chromium browser খুঁজছি...');

// Playwright এর browser cache location find করা
function findChromiumPath() {
  const { chromium } = require('playwright');
  
  try {
    // playwright এর built-in method দিয়ে path বের করা
    const browserType = chromium;
    const executablePath = browserType.executablePath();
    
    if (executablePath && fs.existsSync(executablePath)) {
      // browser executable এর parent directory (chromium folder)
      // structure: .../chromium-xxxx/chrome-win/chrome.exe
      const chromiumDir = path.dirname(path.dirname(executablePath));
      return { executablePath, chromiumDir };
    }
  } catch (e) {
    console.log('Direct path detection failed, trying cache paths...');
  }
  
  // Manual fallback - common cache locations
  const possibleBasePaths = [
    path.join(os.homedir(), '.cache', 'ms-playwright'),                    // Linux/Mac
    path.join(process.env.LOCALAPPDATA || '', 'ms-playwright'),            // Windows AppData
    path.join(os.homedir(), 'AppData', 'Local', 'ms-playwright'),          // Windows fallback
    path.join(process.env.PLAYWRIGHT_BROWSERS_PATH || '', ''),              // Custom path
    path.join(__dirname, '..', 'node_modules', 'playwright', '.local-browsers'), // Local node_modules
    path.join(__dirname, '..', 'node_modules', 'playwright-core', '.local-browsers'), // playwright-core
  ];

  for (const basePath of possibleBasePaths) {
    if (!basePath || !fs.existsSync(basePath)) continue;
    
    try {
      const items = fs.readdirSync(basePath);
      const chromiumFolder = items.find(item => item.startsWith('chromium'));
      
      if (chromiumFolder) {
        const chromiumDir = path.join(basePath, chromiumFolder);
        
        // Windows executable খোঁজা
        const winExe = path.join(chromiumDir, 'chrome-win', 'chrome.exe');
        const linuxExe = path.join(chromiumDir, 'chrome-linux', 'chrome');
        const macExe = path.join(chromiumDir, 'chrome-mac', 'Chromium.app', 'Contents', 'MacOS', 'Chromium');
        
        const execPath = [winExe, linuxExe, macExe].find(p => fs.existsSync(p));
        
        if (execPath) {
          return { executablePath: execPath, chromiumDir };
        }
      }
    } catch (e) {
      continue;
    }
  }
  
  return null;
}

// Directory recursively copy করা
function copyDirSync(src, dest) {
  if (!fs.existsSync(dest)) {
    fs.mkdirSync(dest, { recursive: true });
  }
  
  const items = fs.readdirSync(src);
  
  for (const item of items) {
    const srcPath = path.join(src, item);
    const destPath = path.join(dest, item);
    const stat = fs.statSync(srcPath);
    
    if (stat.isDirectory()) {
      copyDirSync(srcPath, destPath);
    } else {
      fs.copyFileSync(srcPath, destPath);
    }
  }
}

// File size human readable format
function formatSize(bytes) {
  const gb = bytes / (1024 * 1024 * 1024);
  const mb = bytes / (1024 * 1024);
  if (gb >= 1) return `${gb.toFixed(2)} GB`;
  return `${mb.toFixed(2)} MB`;
}

// Directory size calculate করা
function getDirSize(dirPath) {
  let totalSize = 0;
  
  function walk(currentPath) {
    const items = fs.readdirSync(currentPath);
    for (const item of items) {
      const itemPath = path.join(currentPath, item);
      const stat = fs.statSync(itemPath);
      if (stat.isDirectory()) {
        walk(itemPath);
      } else {
        totalSize += stat.size;
      }
    }
  }
  
  walk(dirPath);
  return totalSize;
}

// Main function
async function main() {
  const projectRoot = path.join(__dirname, '..');
  const bundleDir = path.join(projectRoot, 'browser-bundle', 'chromium');
  
  // Already bundled check
  if (fs.existsSync(bundleDir)) {
    const contents = fs.readdirSync(bundleDir);
    if (contents.length > 0) {
      console.log('✅ Browser bundle ইতিমধ্যে আছে, skip করছি...');
      console.log(`   Location: ${bundleDir}`);
      return;
    }
  }
  
  // Playwright এর chromium find করা
  const result = findChromiumPath();
  
  if (!result) {
    console.error('❌ Playwright Chromium browser পাওয়া যায়নি!');
    console.error('');
    console.error('সমাধান: নিচের command টি run করুন:');
    console.error('   npx playwright install chromium');
    console.error('');
    process.exit(1);
  }
  
  const { executablePath, chromiumDir } = result;
  console.log(`✅ Chromium পাওয়া গেছে: ${chromiumDir}`);
  
  const sourceSize = getDirSize(chromiumDir);
  console.log(`📦 Browser size: ${formatSize(sourceSize)}`);
  console.log(`📁 Bundle করছি: ${bundleDir}`);
  console.log('⏳ এটা কিছুক্ষণ সময় নিতে পারে...');
  
  // browser-bundle directory তৈরি
  fs.mkdirSync(path.dirname(bundleDir), { recursive: true });
  
  // Copy করা
  try {
    copyDirSync(chromiumDir, bundleDir);
    
    const bundleSize = getDirSize(bundleDir);
    console.log(`✅ Browser bundle সফলভাবে copy হয়েছে!`);
    console.log(`   Bundle size: ${formatSize(bundleSize)}`);
  } catch (error) {
    console.error('❌ Browser copy করতে সমস্যা হয়েছে:', error.message);
    process.exit(1);
  }
}

main();
