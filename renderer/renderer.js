const { ipcRenderer } = require('electron');

// Global state
let currentPage = 'dashboard';
let accounts = [];
let posts = [];
let settings = {};
let selectedAccount = null;

// Theme System
function initThemeSystem() {
  const themeSelect = document.getElementById('themeSelect');

  // Load saved theme from localStorage or default to 'default'
  const savedTheme = localStorage.getItem('selectedTheme') || 'default';
  applyTheme(savedTheme);
  themeSelect.value = savedTheme;

  // Listen for theme changes
  themeSelect.addEventListener('change', (e) => {
    const selectedTheme = e.target.value;
    applyTheme(selectedTheme);
    localStorage.setItem('selectedTheme', selectedTheme);
  });
}

function applyTheme(themeName) {
  document.documentElement.setAttribute('data-theme', themeName);

  // Add smooth transition class temporarily
  document.body.style.transition = 'all 0.3s ease';
  setTimeout(() => {
    document.body.style.transition = '';
  }, 300);
}

// Initialize app
document.addEventListener('DOMContentLoaded', () => {
  initThemeSystem(); // Initialize theme system first
  initNavigation();
  initAutomationControls();
  initAccountManagement();
  initPostManagement();
  initGroupManagement();
  initTemplateManagement();
  initSettings();
  initActivity();
  initUpdateChecker();
  initLicenseInfo();
  loadInitialData();
  setupIPCListeners();

  // Auto-check for updates on startup (silent check)
  setTimeout(() => {
    checkForUpdatesInBackground();
  }, 3000); // Wait 3 seconds after load
});

// Populate account dropdowns in modals
async function populateAccountDropdowns() {
  const accountsList = await ipcRenderer.invoke('get-accounts');

  console.log('Populating account dropdowns, accounts count:', accountsList.length);
  console.log('Accounts list:', accountsList);

  // Populate Add Post modal
  const postAccountSelect = document.getElementById('postAccountId');
  if (postAccountSelect) {
    postAccountSelect.innerHTML = '<option value="">-- Select Account --</option>' +
      accountsList.map(acc => `<option value="${acc.id}">${acc.name}</option>`).join('');
    console.log('Add Post dropdown populated with', postAccountSelect.options.length, 'options');
  }

  // Populate Import Posts modal
  const importAccountSelect = document.getElementById('importAccountId');
  if (importAccountSelect) {
    importAccountSelect.innerHTML = '<option value="">-- Select Account --</option>' +
      accountsList.map(acc => `<option value="${acc.id}">${acc.name}</option>`).join('');
    console.log('Import Posts dropdown populated with', importAccountSelect.options.length, 'options');

    // Auto-select first account if available
    if (accountsList.length > 0) {
      importAccountSelect.selectedIndex = 1; // Select first real account (index 0 is "-- Select Account --")
      console.log('Auto-selected account:', importAccountSelect.value);
    }
  }

  // Populate Group dropdowns
  ['groupAccountId', 'importGroupAccountId'].forEach(id => {
    const sel = document.getElementById(id);
    if (sel) {
      sel.innerHTML = '<option value="">-- Select Account --</option>' +
        accountsList.map(acc => `<option value="${acc.id}">${acc.name}</option>`).join('');
    }
  });

  return accountsList;
}

// Navigation
function initNavigation() {
  const navItems = document.querySelectorAll('.nav-item');

  navItems.forEach(item => {
    item.addEventListener('click', (e) => {
      e.preventDefault();
      const page = item.dataset.page;
      switchPage(page);
    });
  });
}

function switchPage(page) {
  // Update nav
  document.querySelectorAll('.nav-item').forEach(item => {
    item.classList.remove('active');
  });
  document.querySelector(`[data-page="${page}"]`).classList.add('active');

  // Update page
  document.querySelectorAll('.page').forEach(p => {
    p.classList.remove('active');
  });
  document.getElementById(`${page}-page`).classList.add('active');

  currentPage = page;

  // Reload data for specific pages
  if (page === 'accounts') loadAccounts();
  if (page === 'posts') loadPosts();
  if (page === 'groups') loadGroups();
  if (page === 'activity') loadActivity();
  if (page === 'templates') loadTemplateAccounts();
}

// Automation Controls
function initAutomationControls() {
  const startBtn = document.getElementById('startBtn');
  const stopBtn = document.getElementById('stopBtn');

  startBtn.addEventListener('click', async () => {
    const result = await ipcRenderer.invoke('start-automation');
    if (result.success) {
      startBtn.disabled = true;
      stopBtn.disabled = false;
      updateStatusBadge('running', 'Running');
      addLog('success', 'Automation started successfully');
    } else {
      addLog('error', `Failed to start: ${result.error}`);
    }
  });

  stopBtn.addEventListener('click', async () => {
    const result = await ipcRenderer.invoke('stop-automation');
    if (result.success) {
      startBtn.disabled = false;
      stopBtn.disabled = true;
      updateStatusBadge('stopped', 'Stopped');
      addLog('info', 'Automation stopped');
    }
  });

  document.getElementById('clearLogsBtn').addEventListener('click', () => {
    document.getElementById('logsContainer').innerHTML = '';
    ipcRenderer.invoke('clear-logs');
  });

  // Live Logs page clear logs button
  document.getElementById('clearLiveLogsBtn').addEventListener('click', () => {
    document.getElementById('liveLogsContainer').innerHTML = '';
    ipcRenderer.invoke('clear-logs');
  });
}

function updateStatusBadge(status, text) {
  const badge = document.getElementById('statusBadge');
  const statusText = document.getElementById('statusText');

  badge.className = 'status-badge ' + status;
  statusText.textContent = text;
}

// Account Management
// ─── UA Generator Engine ────────────────────────────────────────────────────

// Device profile pool — browser version slots filled at generate-time
const UA_DEVICE_PROFILES = [
  {
    label: '💻 Windows – Chrome',
    type: 'windows-chrome',
    viewport: { width: 1920, height: 1080 },
    platform: 'Win32',
    buildUA: (chromeVer) =>
      `Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/${chromeVer} Safari/537.36`
  },
  {
    label: '💻 Windows – Edge',
    type: 'windows-edge',
    viewport: { width: 1920, height: 1080 },
    platform: 'Win32',
    buildUA: (chromeVer, edgeVer) =>
      `Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/${chromeVer} Safari/537.36 Edg/${edgeVer}`
  },
  {
    label: '💻 Windows – Firefox',
    type: 'windows-firefox',
    viewport: { width: 1920, height: 1080 },
    platform: 'Win32',
    buildUA: (_, __, ffVer) =>
      `Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:${ffVer}) Gecko/20100101 Firefox/${ffVer}`
  },
  {
    label: '🖥️ MacBook – Chrome',
    type: 'mac-chrome',
    viewport: { width: 1440, height: 900 },
    platform: 'MacIntel',
    buildUA: (chromeVer) =>
      `Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/${chromeVer} Safari/537.36`
  },
  {
    label: '🖥️ MacBook – Safari',
    type: 'mac-safari',
    viewport: { width: 1440, height: 900 },
    platform: 'MacIntel',
    buildUA: (_, __, ___, safariVer) =>
      `Mozilla/5.0 (Macintosh; Intel Mac OS X 14_3) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/${safariVer} Safari/605.1.15`
  },
  {
    label: '📱 iPad Mini',
    type: 'ipad-mini',
    viewport: { width: 1366, height: 768 },
    platform: 'iPad',
    buildUA: (_, __, ___, safariVer) =>
      `Mozilla/5.0 (iPad; CPU OS 17_3 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/${safariVer} Mobile/15E148 Safari/604.1`
  },
  {
    label: '💼 Surface Pro – Edge',
    type: 'surface-edge',
    viewport: { width: 1368, height: 912 },
    platform: 'Win32',
    buildUA: (chromeVer, edgeVer) =>
      `Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/${chromeVer} Safari/537.36 Edg/${edgeVer}`
  },
  {
    label: '💼 Surface Pro – Chrome',
    type: 'surface-chrome',
    viewport: { width: 1368, height: 912 },
    platform: 'Win32',
    buildUA: (chromeVer) =>
      `Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/${chromeVer} Safari/537.36`
  }
];

// Fetch latest browser versions from GitHub / public APIs (network-free fallback included)
async function fetchLatestBrowserVersions() {
  // Stable fallback versions (updated to current as of early 2025)
  let chromeVer = '132.0.6834.110';
  let edgeVer = '132.0.2957.127';
  let ffVer = '134.0';
  let safariVer = '17.3';

  try {
    // Chrome: fetch from chromiumdash JSON
    const chromeRes = await fetch(
      'https://chromiumdash.appspot.com/fetch_releases?channel=Stable&platform=Windows&num=1&offset=0'
    );
    if (chromeRes.ok) {
      const data = await chromeRes.json();
      if (data && data[0] && data[0].version) {
        chromeVer = data[0].version;
      }
    }
  } catch (_) { }

  try {
    // Firefox: fetch from product-details API
    const ffRes = await fetch('https://product-details.mozilla.org/1.0/firefox_versions.json');
    if (ffRes.ok) {
      const data = await ffRes.json();
      if (data && data.LATEST_FIREFOX_VERSION) {
        ffVer = data.LATEST_FIREFOX_VERSION;
      }
    }
  } catch (_) { }

  // Edge version typically tracks Chrome major
  const chromeMajor = chromeVer.split('.')[0];
  edgeVer = `${chromeMajor}.0.0.0`;

  return { chromeVer, edgeVer, ffVer, safariVer };
}

// Generate a unique UA — auto-retries if duplicate found
// Generate UA based on selected device (Chrome only)
async function generateUniqueUA(existingAgents = [], deviceType = null) {
  const versions = await fetchLatestBrowserVersions();
  const chromeVer = versions.chromeVer;

  // Device-specific UA generators (Chrome only)
  const deviceGenerators = {
    windows: () => ({
      ua: `Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/${chromeVer} Safari/537.36`,
      profile: {
        label: '💻 Windows – Chrome',
        type: 'windows-chrome',
        viewport: { width: 1920, height: 1080 },
        platform: 'Win32'
      }
    }),
    mac: () => ({
      ua: `Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/${chromeVer} Safari/537.36`,
      profile: {
        label: '🖥️ MacBook – Chrome',
        type: 'mac-chrome',
        viewport: { width: 1440, height: 900 },
        platform: 'MacIntel'
      }
    }),
    macmini: () => ({
      ua: `Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/${chromeVer} Safari/537.36`,
      profile: {
        label: '🖥️ Mac Mini – Chrome',
        type: 'macmini-chrome',
        viewport: { width: 1920, height: 1080 },
        platform: 'MacIntel'
      }
    }),
    ipad: () => ({
      ua: `Mozilla/5.0 (iPad; CPU OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/${chromeVer.split('.')[0]}.0.0.0 Mobile/15E148 Safari/604.1`,
      profile: {
        label: '📱 iPad – Chrome',
        type: 'ipad-chrome',
        viewport: { width: 1366, height: 1024 },
        platform: 'iPad'
      }
    })
  };

  // If specific device type requested
  if (deviceType && deviceGenerators[deviceType]) {
    const result = deviceGenerators[deviceType]();

    // Check if unique
    if (!existingAgents.includes(result.ua)) {
      return result;
    }

    // Add minor version randomization to make unique
    const minor = Math.floor(Math.random() * 99);
    result.ua = result.ua.replace(chromeVer, `${chromeVer}.${minor}`);
    return result;
  }

  // Random device if no type specified (fallback)
  const devices = ['windows', 'mac', 'macmini', 'ipad'];
  const shuffled = devices.sort(() => Math.random() - 0.5);

  for (const device of shuffled) {
    const result = deviceGenerators[device]();
    if (!existingAgents.includes(result.ua)) {
      return result;
    }
  }

  // All used — add randomization
  const result = deviceGenerators[shuffled[0]]();
  const minor = Math.floor(Math.random() * 99);
  result.ua = result.ua.replace(chromeVer, `${chromeVer}.${minor}`);
  return result;
}

// ─── Account Management ──────────────────────────────────────────────────────

function initAccountManagement() {
  const addAccountBtn = document.getElementById('addAccountBtn');
  const modal = document.getElementById('accountModal');
  const closeBtn = modal.querySelector('.close');
  const saveBtn = document.getElementById('saveAccountBtn');
  const generateBtn = document.getElementById('generateUABtn');

  addAccountBtn.addEventListener('click', () => {
    openModal('accountModal');
  });

  closeBtn.addEventListener('click', () => {
    closeModal('accountModal');
  });

  // Generate UA button
  // Manual UA toggle
  const manualUAToggle = document.getElementById('manualUAToggle');
  const deviceTypeSelect = document.getElementById('deviceTypeSelect');

  manualUAToggle.addEventListener('change', (e) => {
    const uaInput = document.getElementById('accountUserAgent');
    if (e.target.checked) {
      // Manual mode
      uaInput.readOnly = false;
      uaInput.style.cursor = 'text';
      uaInput.style.background = '';
      uaInput.placeholder = 'Enter your User Agent here...';
      generateBtn.disabled = true;
      deviceTypeSelect.disabled = true;
    } else {
      // Auto mode
      uaInput.readOnly = false;
      uaInput.style.cursor = '';
      uaInput.style.background = 'var(--bg-tertiary,#181825)';
      uaInput.placeholder = 'Generated UA will appear here, or type manually';
      generateBtn.disabled = false;
      deviceTypeSelect.disabled = false;
    }
  });

  generateBtn.addEventListener('click', async () => {
    const uaInput = document.getElementById('accountUserAgent');
    const uaLabel = document.getElementById('uaDeviceLabel');
    const uaGenerating = document.getElementById('uaGenerating');
    const uaStatus = document.getElementById('uaStatus');
    const deviceType = deviceTypeSelect.value;

    // Validate device selection
    if (!deviceType) {
      alert('⚠️ Please select a device type first!');
      deviceTypeSelect.focus();
      return;
    }

    generateBtn.disabled = true;
    generateBtn.textContent = '⏳ Generating...';
    uaGenerating.style.display = 'block';
    uaStatus.style.display = 'none';
    uaInput.style.borderColor = '';

    try {
      const existingAccounts = await ipcRenderer.invoke('get-accounts');
      const existingAgents = existingAccounts.map(a => a.userAgent).filter(Boolean);

      // Generate UA for selected device
      const { ua, profile } = await generateUniqueUA(existingAgents, deviceType);

      uaInput.value = ua;
      uaLabel.textContent = `✅ ${profile.label}`;
      uaLabel.style.color = '#27ae60';
      uaInput.style.borderColor = '#27ae60';

      // Store device profile data for worker.js
      uaInput.dataset.deviceType = profile.type;
      uaInput.dataset.viewportW = profile.viewport.width;
      uaInput.dataset.viewportH = profile.viewport.height;
      uaInput.dataset.platform = profile.platform;

    } catch (err) {
      uaLabel.textContent = '❌ Failed to generate. Try again.';
      uaLabel.style.color = '#e74c3c';
      console.error('UA generation error:', err);
    } finally {
      generateBtn.disabled = false;
      generateBtn.textContent = '🎲 Generate UA';
      uaGenerating.style.display = 'none';
    }
  });


  // Manual UA input handler - auto-detect device type
  const accountUserAgent = document.getElementById('accountUserAgent');
  accountUserAgent.addEventListener('input', (e) => {
    const manualToggle = document.getElementById('manualUAToggle');
    if (!manualToggle.checked) return; // Only for manual mode

    const ua = e.target.value;
    const uaLabel = document.getElementById('uaDeviceLabel');

    // Auto-detect device from UA string
    let deviceLabel = 'Custom UA';
    let deviceType = 'windows-chrome';
    let viewport = { width: 1920, height: 1080 };
    let platform = 'Win32';

    if (ua.includes('iPad')) {
      deviceLabel = '📱 iPad (Manual)';
      deviceType = 'ipad-chrome';
      viewport = { width: 1366, height: 1024 };
      platform = 'iPad';
    } else if (ua.includes('Macintosh')) {
      deviceLabel = '🖥️ Mac (Manual)';
      deviceType = 'mac-chrome';
      viewport = { width: 1440, height: 900 };
      platform = 'MacIntel';
    } else if (ua.includes('Windows')) {
      deviceLabel = '💻 Windows (Manual)';
      deviceType = 'windows-chrome';
      viewport = { width: 1920, height: 1080 };
      platform = 'Win32';
    }

    // Set device profile
    accountUserAgent.dataset.deviceType = deviceType;
    accountUserAgent.dataset.viewportW = viewport.width;
    accountUserAgent.dataset.viewportH = viewport.height;
    accountUserAgent.dataset.platform = platform;

    uaLabel.textContent = deviceLabel;
    uaLabel.style.color = ua ? '#3498db' : '#aaa';
  });

  saveBtn.addEventListener('click', async () => {
    const name = document.getElementById('accountName').value;
    const cookiesText = document.getElementById('accountCookies').value;
    const proxyRaw = document.getElementById('accountProxy').value.trim();
    const uaInput = document.getElementById('accountUserAgent');
    const userAgent = uaInput.value;

    if (!name || !cookiesText) {
      alert('Please fill in required fields (Name and Cookies)');
      return;
    }

    // User Agent is required
    if (!userAgent) {
      alert('⚠️ User Agent is required!\n\nPlease either:\n1. Select a device and click "Generate UA", or\n2. Check "Enter manually" and type your own UA');
      document.getElementById('accountUserAgent').focus();
      return;
    }

    // Final duplicate check before saving (skip current account if editing)
    const existingAccounts = await ipcRenderer.invoke('get-accounts');
    const isDuplicateUA = existingAccounts.some(acc =>
      acc.userAgent === userAgent && acc.id !== editingAccountId
    );
    if (isDuplicateUA) {
      alert('⚠️ This User Agent is already used by another account!\n\nPlease click "🎲 Generate UA" to generate a new unique one.');
      return;
    }

    // Parse proxy: format hostname:port:login:password
    // Example: b2b-s11.liveproxies.io:7383:LV71764889-lv_us_hqips-266862:jbW5C1IlwugaVKOx2Idt
    let proxyFormatted = null;
    if (proxyRaw) {
      const firstColon = proxyRaw.indexOf(':');
      const secondColon = proxyRaw.indexOf(':', firstColon + 1);
      const thirdColon = proxyRaw.indexOf(':', secondColon + 1);

      if (firstColon !== -1 && secondColon !== -1 && thirdColon !== -1) {
        const hostname = proxyRaw.substring(0, firstColon);
        const port = proxyRaw.substring(firstColon + 1, secondColon);
        const login = proxyRaw.substring(secondColon + 1, thirdColon);
        const password = proxyRaw.substring(thirdColon + 1);

        if (!hostname || !port || isNaN(parseInt(port)) || !login || !password) {
          alert('⚠️ Invalid proxy format!\n\nExpected: hostname:port:login:password\nExample: b2b-s11.liveproxies.io:7383:myuser:mypassword\n\nOr leave empty if not using proxy.');
          return;
        }

        proxyFormatted = JSON.stringify({
          server: `http://${hostname}:${port}`,
          username: login,
          password: password
        });

      } else if (proxyRaw.startsWith('http://') || proxyRaw.startsWith('https://') || proxyRaw.startsWith('socks5://')) {
        proxyFormatted = JSON.stringify({ server: proxyRaw });
      } else {
        alert('⚠️ Invalid proxy format!\n\nExpected: hostname:port:login:password\nExample: b2b-s11.liveproxies.io:7383:myuser:mypassword\n\nOr leave empty if not using proxy.');
        return;
      }
    }

    try {
      const cookies = JSON.parse(cookiesText);

      // Include device profile metadata with account
      const account = {
        name,
        cookies,
        proxy: proxyFormatted || null,
        userAgent: userAgent,
        deviceProfile: {
          type: uaInput.dataset.deviceType || 'windows-chrome',
          viewportW: parseInt(uaInput.dataset.viewportW) || 1920,
          viewportH: parseInt(uaInput.dataset.viewportH) || 1080,
          platform: uaInput.dataset.platform || 'Win32'
        }
      };

      // Check if editing or adding new
      if (editingAccountId) {
        // UPDATE existing account
        await ipcRenderer.invoke('update-account', editingAccountId, {
          name,
          cookies,
          proxy: proxyFormatted || null,
          userAgent: userAgent,
          deviceProfile: account.deviceProfile
        });

        closeModal('accountModal');
        cancelEdit(); // Reset edit mode
        loadAccounts();
        loadStats();

        const deviceLabel = document.getElementById('uaDeviceLabel')?.textContent || '';
        showSuccessModal('Account Updated!', `Account "${name}" has been successfully updated.\n\nDevice: ${deviceLabel}`);
      } else {
        // ADD new account
        await ipcRenderer.invoke('add-account', account);
        closeModal('accountModal');
        clearAccountForm();
        loadAccounts();
        loadStats();

        const deviceLabel = document.getElementById('uaDeviceLabel')?.textContent || '';
        showSuccessModal('Account Added!', `Account "${name}" has been successfully added.\n\nDevice: ${deviceLabel}`);
      }
    } catch (error) {
      alert('Invalid cookies JSON format');
    }
  });
}

async function loadAccounts() {
  accounts = await ipcRenderer.invoke('get-accounts');
  renderAccountsTable();
}

function renderAccountsTable() {
  const tbody = document.getElementById('accountsTableBody');

  if (accounts.length === 0) {
    tbody.innerHTML = '<tr><td colspan="7" class="text-center">No accounts added yet</td></tr>';
    return;
  }

  tbody.innerHTML = accounts.map(acc => {
    // Extract short UA label for display
    let uaLabel = 'Not set';
    if (acc.userAgent) {
      if (acc.userAgent.includes('iPad')) uaLabel = '📱 iPad Mini';
      else if (acc.userAgent.includes('Windows NT') && (acc.userAgent.includes('Edg/') || acc.userAgent.includes('EdgA/'))) uaLabel = '💼 Surface/Win – Edge';
      else if (acc.userAgent.includes('Windows NT') && acc.userAgent.includes('Firefox')) uaLabel = '💻 Windows – Firefox';
      else if (acc.userAgent.includes('Windows NT') && acc.userAgent.includes('Chrome')) uaLabel = '💻 Windows – Chrome';
      else if (acc.userAgent.includes('Macintosh') && acc.userAgent.includes('Chrome')) uaLabel = '🖥️ MacBook – Chrome';
      else if (acc.userAgent.includes('Macintosh')) uaLabel = '🖥️ MacBook – Safari';
      else if (acc.userAgent.includes('Linux')) uaLabel = '🐧 Linux – Chrome';
      else uaLabel = acc.userAgent.substring(0, 30) + '...';
    }
    return `
    <tr>
      <td>${acc.name}</td>
      <td>
        <span class="badge ${getStatusBadgeClass(acc)}">${getStatusText(acc)}</span>
      </td>
      <td><small title="${acc.userAgent || ''}">${uaLabel}</small></td>
      <td>${acc.commentsToday} / ${settings.maxCommentsPerAccount || 20}</td>
      <td>${acc.totalComments}</td>
      <td>${acc.totalReacts}</td>
      <td>${acc.lastUsed ? formatDate(acc.lastUsed * 1000) : 'Never'}</td>
      <td>
        <button class="btn btn-sm btn-primary" onclick="editAccount('${acc.id}')" title="Edit Account">✏️ Edit</button>
        <button class="btn btn-sm btn-secondary" onclick="toggleAccount('${acc.id}', ${!acc.enabled})" title="${acc.enabled ? 'Disable' : 'Enable'} Account">
          ${acc.enabled ? '⏸️' : '▶️'}
        </button>
        <button class="btn btn-sm btn-danger" onclick="deleteAccount('${acc.id}')" title="Delete Account">🗑️</button>
      </td>
    </tr>
  `;
  }).join('');
}

function getStatusBadgeClass(acc) {
  if (acc.checkpointDetected) return 'badge-danger';
  if (!acc.enabled) return 'badge-secondary';
  return 'badge-success';
}

function getStatusText(acc) {
  if (acc.checkpointDetected) return 'Banned';
  if (!acc.enabled) return 'Disabled';
  return 'Active';
}

async function toggleAccount(id, enabled) {
  await ipcRenderer.invoke('toggle-account', id, enabled);
  loadAccounts();
  loadStats();
}

async function deleteAccount(id) {
  if (confirm('Are you sure you want to delete this account?')) {
    await ipcRenderer.invoke('delete-account', id);
    loadAccounts();
    loadStats();
    addLog('info', 'Account deleted');
  }
}

// =====================================================
// EDIT ACCOUNT FUNCTIONALITY
// =====================================================
let editingAccountId = null;

async function editAccount(id) {
  // Find the account
  const account = accounts.find(acc => acc.id === id);
  if (!account) {
    alert('Account not found!');
    return;
  }

  // Set editing mode
  editingAccountId = id;

  // Open the account modal
  openModal('accountModal');

  // Populate form with existing data
  document.getElementById('accountName').value = account.name || '';
  document.getElementById('accountCookies').value = JSON.stringify(account.cookies, null, 2) || '';

  // Parse and display proxy
  if (account.proxy) {
    try {
      const proxyConfig = typeof account.proxy === 'string' ? JSON.parse(account.proxy) : account.proxy;

      // Convert back to hostname:port:username:password format
      if (proxyConfig.server && proxyConfig.username && proxyConfig.password) {
        const serverUrl = new URL(proxyConfig.server);
        const hostname = serverUrl.hostname;
        const port = serverUrl.port;
        document.getElementById('accountProxy').value = `${hostname}:${port}:${proxyConfig.username}:${proxyConfig.password}`;
      } else {
        document.getElementById('accountProxy').value = proxyConfig.server || '';
      }
    } catch (e) {
      document.getElementById('accountProxy').value = account.proxy || '';
    }
  } else {
    document.getElementById('accountProxy').value = '';
  }

  // Set User Agent
  const uaInput = document.getElementById('accountUserAgent');
  if (uaInput && account.userAgent) {
    uaInput.value = account.userAgent;

    // Restore device profile metadata
    if (account.deviceProfile) {
      uaInput.dataset.deviceType = account.deviceProfile.type || '';
      uaInput.dataset.viewportW = account.deviceProfile.viewportW || '';
      uaInput.dataset.viewportH = account.deviceProfile.viewportH || '';
      uaInput.dataset.platform = account.deviceProfile.platform || '';
    }

    // Update UA label
    const uaLabel = document.getElementById('uaDeviceLabel');
    if (uaLabel) {
      let deviceLabel = 'Custom UA';
      if (account.userAgent.includes('iPad')) deviceLabel = '📱 iPad Mini';
      else if (account.userAgent.includes('Windows NT') && account.userAgent.includes('Chrome')) deviceLabel = '💻 Windows – Chrome';
      else if (account.userAgent.includes('Macintosh')) deviceLabel = '🖥️ MacBook – Chrome';

      uaLabel.textContent = deviceLabel;
      uaLabel.style.color = '#4CAF50';
    }

    uaInput.style.borderColor = '#4CAF50';
  }

  // Change Save button to Update
  const saveBtn = document.getElementById('saveAccountBtn');
  if (saveBtn) {
    saveBtn.textContent = '💾 Update Account';
    saveBtn.className = 'btn btn-warning';
  }

  // Add Cancel button if not exists
  let cancelBtn = document.getElementById('cancelEditBtn');
  if (!cancelBtn) {
    cancelBtn = document.createElement('button');
    cancelBtn.id = 'cancelEditBtn';
    cancelBtn.className = 'btn btn-secondary';
    cancelBtn.textContent = '❌ Cancel';
    cancelBtn.style.marginLeft = '10px';
    cancelBtn.onclick = cancelEdit;
    saveBtn.parentNode.insertBefore(cancelBtn, saveBtn.nextSibling);
  }
  cancelBtn.style.display = 'inline-block';

  // Scroll to form
  document.getElementById('accountName').scrollIntoView({ behavior: 'smooth', block: 'center' });

  addLog('info', `Editing account: ${account.name}`);
}

function cancelEdit() {
  editingAccountId = null;
  clearAccountForm();

  // Reset Save button
  const saveBtn = document.getElementById('saveAccountBtn');
  if (saveBtn) {
    saveBtn.textContent = '💾 Save Account';
    saveBtn.className = 'btn btn-primary';
  }

  // Hide Cancel button
  const cancelBtn = document.getElementById('cancelEditBtn');
  if (cancelBtn) {
    cancelBtn.style.display = 'none';
  }

  addLog('info', 'Edit cancelled');
}

function clearAccountForm() {
  // Reset edit mode
  editingAccountId = null;

  // Clear form fields
  document.getElementById('accountName').value = '';
  document.getElementById('accountCookies').value = '';
  document.getElementById('accountProxy').value = '';

  const uaInput = document.getElementById('accountUserAgent');
  if (uaInput) {
    uaInput.value = '';
    uaInput.style.borderColor = '';
    uaInput.dataset.deviceType = '';
    uaInput.dataset.viewportW = '';
    uaInput.dataset.viewportH = '';
    uaInput.dataset.platform = '';
  }

  const uaLabel = document.getElementById('uaDeviceLabel');
  if (uaLabel) {
    uaLabel.textContent = 'No UA generated yet';
    uaLabel.style.color = '#aaa';
  }

  const uaStatus = document.getElementById('uaStatus');
  if (uaStatus) uaStatus.style.display = 'none';

  // Reset Save button
  const saveBtn = document.getElementById('saveAccountBtn');
  if (saveBtn) {
    saveBtn.textContent = '💾 Save Account';
    saveBtn.className = 'btn btn-primary';
  }

  // Hide Cancel button
  const cancelBtn = document.getElementById('cancelEditBtn');
  if (cancelBtn) {
    cancelBtn.style.display = 'none';
  }

  const generateBtn = document.getElementById('generateUABtn');
  if (generateBtn) {
    generateBtn.disabled = false;
    generateBtn.textContent = '🎲 Generate UA';
  }
}

// Post Management
function initPostManagement() {
  const addPostBtn = document.getElementById('addPostBtn');
  const importPostsBtn = document.getElementById('importPostsBtn');
  const savePostBtn = document.getElementById('savePostBtn');
  const importConfirmBtn = document.getElementById('importPostsConfirmBtn');

  addPostBtn.addEventListener('click', async () => {
    await populateAccountDropdowns();
    openModal('postModal');
  });

  importPostsBtn.addEventListener('click', async () => {
    console.log('Import Posts button clicked - opening modal');
    const accounts = await populateAccountDropdowns();
    console.log('Accounts loaded:', accounts.length);

    if (accounts.length === 0) {
      alert('Please add at least one account before importing posts!');
      return;
    }

    openModal('importPostsModal');

    // Small delay to ensure modal is rendered
    setTimeout(() => {
      const dropdown = document.getElementById('importAccountId');
      console.log('After modal open - dropdown value:', dropdown.value);
      console.log('After modal open - dropdown options:', dropdown.options.length);
    }, 100);
  });

  savePostBtn.addEventListener('click', async () => {
    try {
      const accountId = document.getElementById('postAccountId').value;
      const url = document.getElementById('postUrl').value;
      const title = document.getElementById('postTitle').value;

      console.log('Add post clicked - Account:', accountId, 'URL:', url);

      if (!accountId) {
        alert('Please select an account');
        return;
      }

      if (!url) {
        alert('Please enter post URL');
        return;
      }

      const result = await ipcRenderer.invoke('add-post', { url, title: title || null, accountId });
      console.log('Add post result:', result);

      if (!result) {
        alert('Failed to add post - no response from server');
        return;
      }

      closeModal('postModal');
      clearPostForm();

      await loadPosts();
      await loadStats();

      showSuccessModal('Post Added!', `Post has been successfully added and assigned to the selected account.`);

    } catch (error) {
      console.error('Add post error:', error);
      alert(`Error adding post: ${error.message}`);
      addLog('error', `Failed to add post: ${error.message}`);
    }
  });

  importConfirmBtn.addEventListener('click', async () => {
    try {
      console.log('=== IMPORT POSTS CLICKED ===');

      // Get the dropdown element
      const importAccountDropdown = document.getElementById('importAccountId');
      console.log('Dropdown element found:', !!importAccountDropdown);

      if (!importAccountDropdown) {
        alert('ERROR: Import account dropdown not found!');
        return;
      }

      // Get the selected value - trying multiple ways
      let accountId = importAccountDropdown.value;
      console.log('Method 1 - dropdown.value:', accountId);

      // If value is empty, try getting from selected option
      if (!accountId || accountId === '') {
        const selectedOption = importAccountDropdown.options[importAccountDropdown.selectedIndex];
        accountId = selectedOption ? selectedOption.value : '';
        console.log('Method 2 - selected option value:', accountId);
      }

      // If still empty, try to get first non-empty option
      if (!accountId || accountId === '') {
        for (let i = 1; i < importAccountDropdown.options.length; i++) {
          if (importAccountDropdown.options[i].value) {
            accountId = importAccountDropdown.options[i].value;
            importAccountDropdown.selectedIndex = i;
            console.log('Method 3 - forced to first account:', accountId);
            break;
          }
        }
      }

      console.log('FINAL Account ID:', accountId);
      console.log('Dropdown selectedIndex:', importAccountDropdown.selectedIndex);
      console.log('Dropdown options count:', importAccountDropdown.options.length);

      // Log all options for debugging
      for (let i = 0; i < importAccountDropdown.options.length; i++) {
        console.log(`Option ${i}: value="${importAccountDropdown.options[i].value}", text="${importAccountDropdown.options[i].text}"`);
      }

      const urlsText = document.getElementById('postUrlsList').value;
      const urls = urlsText.split('\n').filter(u => u.trim());

      console.log('URLs count:', urls.length);
      console.log('URLs to import:', urls);

      // Validation
      if (!accountId || accountId === '' || accountId === 'null' || accountId === 'undefined') {
        alert('Please select an account from the dropdown!\n\nIf dropdown is empty, please add an account first from the Accounts page.');
        console.error('No valid account selected!');
        return;
      }

      if (urls.length === 0) {
        alert('Please enter at least one URL');
        return;
      }

      console.log('=== CALLING IPC ===');
      console.log('Passing accountId:', accountId, 'type:', typeof accountId);
      console.log('Passing URLs:', urls);

      // Pass as object to avoid parameter order issues
      const imported = await ipcRenderer.invoke('import-posts', {
        urls: urls,
        accountId: accountId
      });

      console.log('=== IPC RESPONSE ===');
      console.log('Import result:', imported);
      console.log('Actually imported count:', imported ? imported.length : 0);

      if (!imported) {
        alert('Import failed - no response from server');
        return;
      }

      if (imported.length === 0) {
        alert(`No posts were imported!\n\nThis could mean:\n1. All URLs failed to import (check console)\n2. Database error occurred\n\nPlease check the console logs for details.`);
        addLog('error', `Import failed - 0 URLs imported from ${urls.length} provided`);
      } else if (imported.length < urls.length) {
        const failed = urls.length - imported.length;
        showSuccessModal('Partial Import Success', `Successfully imported ${imported.length} posts!\n\n${failed} posts failed to import. Check logs for details.`);
      } else {
        showSuccessModal('Import Successful!', `Successfully imported ${imported.length} posts! All posts are now ready for automation.`);
      }

      closeModal('importPostsModal');
      document.getElementById('postUrlsList').value = '';
      // Don't reset dropdown - keep it selected

      await loadPosts();
      await loadStats();

    } catch (error) {
      console.error('=== IMPORT ERROR ===');
      console.error('Error:', error);
      console.error('Error stack:', error.stack);
      alert(`Error importing posts: ${error.message}\n\nCheck console for details.`);
      addLog('error', `Import failed: ${error.message}`);
    }
  });

  // Close buttons
  document.querySelectorAll('.close').forEach(btn => {
    btn.addEventListener('click', () => {
      btn.closest('.modal').classList.remove('active');
    });
  });

  // Select All functionality
  const selectAllCheckbox = document.getElementById('selectAllPosts');
  selectAllCheckbox.addEventListener('change', (e) => {
    const checkboxes = document.querySelectorAll('.post-checkbox');
    checkboxes.forEach(checkbox => {
      checkbox.checked = e.target.checked;
    });
    updateDeleteButtonVisibility();
  });

  // Delete Selected functionality
  const deleteSelectedBtn = document.getElementById('deleteSelectedBtn');
  deleteSelectedBtn.addEventListener('click', async () => {
    const selectedCheckboxes = document.querySelectorAll('.post-checkbox:checked');
    const selectedIds = Array.from(selectedCheckboxes).map(cb => cb.dataset.postId);

    if (selectedIds.length === 0) {
      alert('Please select at least one post to delete');
      return;
    }

    if (confirm(`Are you sure you want to delete ${selectedIds.length} post(s)?`)) {
      try {
        // Delete each selected post
        for (const id of selectedIds) {
          await ipcRenderer.invoke('delete-post', id);
        }

        await loadPosts();
        await loadStats();

        addLog('success', `${selectedIds.length} posts deleted successfully`);
        alert(`Successfully deleted ${selectedIds.length} post(s)!`);

      } catch (error) {
        console.error('Delete error:', error);
        alert(`Error deleting posts: ${error.message}`);
        addLog('error', `Failed to delete posts: ${error.message}`);
      }
    }
  });

  // Listen for checkbox changes (using event delegation)
  document.getElementById('postsTableBody').addEventListener('change', (e) => {
    if (e.target.classList.contains('post-checkbox')) {
      updateDeleteButtonVisibility();
    }
  });
}

function updateDeleteButtonVisibility() {
  const selectedCheckboxes = document.querySelectorAll('.post-checkbox:checked');
  const deleteBtn = document.getElementById('deleteSelectedBtn');
  const selectedCountSpan = document.getElementById('selectedCount');
  const selectAllCheckbox = document.getElementById('selectAllPosts');

  if (selectedCheckboxes.length > 0) {
    deleteBtn.style.display = 'inline-block';
    selectedCountSpan.textContent = selectedCheckboxes.length;
  } else {
    deleteBtn.style.display = 'none';
    selectedCountSpan.textContent = '0';
  }

  // Update select all checkbox state
  const allCheckboxes = document.querySelectorAll('.post-checkbox');
  if (allCheckboxes.length > 0) {
    selectAllCheckbox.checked = selectedCheckboxes.length === allCheckboxes.length;
  }
}

async function loadPosts() {
  posts = await ipcRenderer.invoke('get-posts');
  accounts = await ipcRenderer.invoke('get-accounts');
  renderPostsTable();
}

function renderPostsTable() {
  const tbody = document.getElementById('postsTableBody');

  if (posts.length === 0) {
    tbody.innerHTML = '<tr><td colspan="7" class="text-center">No posts added yet</td></tr>';
    document.getElementById('selectAllPosts').checked = false;
    document.getElementById('deleteSelectedBtn').style.display = 'none';
    return;
  }

  // Create account lookup map
  const accountMap = {};
  accounts.forEach(acc => {
    accountMap[acc.id] = acc.name;
  });

  tbody.innerHTML = posts.map(post => `
    <tr>
      <td><input type="checkbox" class="post-checkbox" data-post-id="${post.id}"></td>
      <td><span class="badge" style="background: #1d9bf0; color: white; padding: 4px 8px; border-radius: 4px;">${accountMap[post.accountId] || 'Unknown'}</span></td>
      <td><a href="${post.url}" target="_blank" style="color: #1d9bf0;">${post.url.substring(0, 50)}...</a></td>
      <td>${post.title || '-'}</td>
      <td>${post.totalComments}</td>
      <td>${post.lastVisited ? formatDate(post.lastVisited * 1000) : 'Never'}</td>
      <td>
        <button class="btn btn-sm btn-danger" onclick="deletePost('${post.id}')">🗑️</button>
      </td>
    </tr>
  `).join('');

  // Reset select all checkbox
  document.getElementById('selectAllPosts').checked = false;

  // Add event listeners to checkboxes
  updateDeleteButtonVisibility();
}

async function deletePost(id) {
  if (confirm('Are you sure you want to delete this post?')) {
    await ipcRenderer.invoke('delete-post', id);
    loadPosts();
    loadStats();
    addLog('info', 'Post deleted');
  }
}

function clearPostForm() {
  document.getElementById('postAccountId').value = '';
  document.getElementById('postUrl').value = '';
  document.getElementById('postTitle').value = '';
}

// =====================================================
// Facebook Group Management
// =====================================================

function initGroupManagement() {
  const addGroupBtn = document.getElementById('addGroupBtn');
  const importGroupsBtn = document.getElementById('importGroupsBtn');
  const saveGroupBtn = document.getElementById('saveGroupBtn');
  const importGroupsConfirmBtn = document.getElementById('importGroupsConfirmBtn');
  const deleteSelectedGroupsBtn = document.getElementById('deleteSelectedGroupsBtn');
  const selectAllGroups = document.getElementById('selectAllGroups');

  // Open add group modal
  addGroupBtn.addEventListener('click', async () => {
    await populateGroupAccountDropdowns();
    document.querySelector('#groupModal .modal-header h2').textContent = 'Add Facebook Group';
    document.getElementById('groupUrl').value = '';
    document.getElementById('groupName').value = '';
    document.getElementById('groupModal').style.display = 'flex';
  });

  // Open import groups modal
  importGroupsBtn.addEventListener('click', async () => {
    await populateGroupAccountDropdowns();
    document.getElementById('groupUrlsList').value = '';
    document.getElementById('importGroupsModal').style.display = 'flex';
  });

  // Save group
  saveGroupBtn.addEventListener('click', async () => {
    const accountId = document.getElementById('groupAccountId').value;
    const url = document.getElementById('groupUrl').value.trim();
    const name = document.getElementById('groupName').value.trim();

    if (!accountId) { alert('Please select an account'); return; }
    if (!url) { alert('Please enter a group URL'); return; }
    if (!url.includes('facebook.com/groups/')) { alert('Please enter a valid Facebook group URL'); return; }

    try {
      await ipcRenderer.invoke('add-group', { accountId, url, name });
      document.getElementById('groupModal').style.display = 'none';
      loadGroups();
      addLog('success', `Group added: ${name || url}`);
    } catch (e) {
      alert('❌ Error: ' + e.message + '\n\nPlease fully close the app and reopen it.');
    }
  });

  // Import groups confirm
  importGroupsConfirmBtn.addEventListener('click', async () => {
    const accountId = document.getElementById('importGroupAccountId').value;
    const urlsText = document.getElementById('groupUrlsList').value;

    if (!accountId) { alert('Please select an account'); return; }
    if (!urlsText.trim()) { alert('Please enter at least one group URL'); return; }

    const urls = urlsText.split('\n').map(u => u.trim()).filter(u => u && u.includes('facebook.com/groups/'));
    if (urls.length === 0) { alert('No valid Facebook group URLs found'); return; }

    const result = await ipcRenderer.invoke('import-groups', { urls, accountId });
    document.getElementById('importGroupsModal').style.display = 'none';
    loadGroups();
    addLog('success', `Imported ${result.length} group(s)`);
  });

  // Select all groups checkbox
  selectAllGroups.addEventListener('change', () => {
    const checkboxes = document.querySelectorAll('.group-checkbox');
    checkboxes.forEach(cb => cb.checked = selectAllGroups.checked);
    updateDeleteGroupsBtn();
  });

  // Delete selected
  deleteSelectedGroupsBtn.addEventListener('click', async () => {
    const selected = Array.from(document.querySelectorAll('.group-checkbox:checked'))
      .map(cb => cb.dataset.id);
    if (selected.length === 0) return;
    if (!confirm(`Delete ${selected.length} group(s)?`)) return;

    for (const id of selected) {
      await ipcRenderer.invoke('delete-group', id);
    }
    loadGroups();
    addLog('info', `Deleted ${selected.length} group(s)`);
  });

  // Close modals
  document.querySelectorAll('#groupModal .close, #importGroupsModal .close').forEach(btn => {
    btn.addEventListener('click', () => {
      document.getElementById('groupModal').style.display = 'none';
      document.getElementById('importGroupsModal').style.display = 'none';
    });
  });
}

function updateDeleteGroupsBtn() {
  const selected = document.querySelectorAll('.group-checkbox:checked').length;
  const btn = document.getElementById('deleteSelectedGroupsBtn');
  const count = document.getElementById('selectedGroupCount');
  if (selected > 0) {
    btn.style.display = 'inline-flex';
    count.textContent = selected;
  } else {
    btn.style.display = 'none';
  }
}

async function populateGroupAccountDropdowns() {
  const accountsList = await ipcRenderer.invoke('get-accounts');

  ['groupAccountId', 'importGroupAccountId'].forEach(id => {
    const sel = document.getElementById(id);
    if (sel) {
      sel.innerHTML = '<option value="">-- Select Account --</option>' +
        accountsList.map(acc => `<option value="${acc.id}">${acc.name}</option>`).join('');
    }
  });
}

async function loadGroups() {
  let groups = [];
  try {
    groups = await ipcRenderer.invoke('get-groups');
  } catch (e) {
    console.error('get-groups error:', e.message);
    document.getElementById('groupsTableBody').innerHTML =
      '<tr><td colspan="7" class="text-center" style="color:red;">⚠️ Handler not found. Please restart the app completely (close & reopen).</td></tr>';
    return;
  }
  const accounts = await ipcRenderer.invoke('get-accounts');
  const tbody = document.getElementById('groupsTableBody');

  if (groups.length === 0) {
    tbody.innerHTML = '<tr><td colspan="7" class="text-center">No groups added yet</td></tr>';
    return;
  }

  tbody.innerHTML = groups.map(group => {
    const account = accounts.find(a => a.id === group.accountId);
    const accountName = account ? account.name : 'Unknown';
    const lastVisited = group.lastVisited
      ? new Date(group.lastVisited * 1000).toLocaleString()
      : 'Never';
    const groupUrl = group.url.length > 50 ? group.url.substring(0, 50) + '...' : group.url;
    const enabledClass = group.enabled ? 'badge-success' : 'badge-warning';
    const enabledText = group.enabled ? 'Active' : 'Disabled';

    return `<tr>
      <td><input type="checkbox" class="group-checkbox" data-id="${group.id}" onchange="updateDeleteGroupsBtn()"></td>
      <td>${accountName}</td>
      <td><a href="${group.url}" target="_blank" style="color:var(--primary);word-break:break-all;">${groupUrl}</a></td>
      <td>${group.name || '<span style="color:var(--text-secondary)">—</span>'}</td>
      <td>${group.totalComments || 0}</td>
      <td>${lastVisited}</td>
      <td>
        <div class="action-btns">
          <button class="btn btn-sm ${group.enabled ? 'btn-warning' : 'btn-success'}"
            onclick="toggleGroup('${group.id}', ${!group.enabled})">
            ${group.enabled ? '⏸️ Disable' : '▶️ Enable'}
          </button>
          <button class="btn btn-sm btn-danger" onclick="deleteGroup('${group.id}')">
            🗑️ Delete
          </button>
        </div>
      </td>
    </tr>`;
  }).join('');
}

async function toggleGroup(id, enabled) {
  await ipcRenderer.invoke('toggle-group', id, enabled);
  loadGroups();
}

async function deleteGroup(id) {
  if (!confirm('Delete this group?')) return;
  await ipcRenderer.invoke('delete-group', id);
  loadGroups();
  addLog('info', 'Group deleted');
}

// Templates Management
function initTemplateManagement() {
  const accountSelect = document.getElementById('templateAccount');
  const saveBtn = document.getElementById('saveTemplatesBtn');
  const addTemplateBtn = document.getElementById('addTemplateBtn');

  accountSelect.addEventListener('change', (e) => {
    if (e.target.value) {
      selectedAccount = e.target.value;
      loadTemplates(selectedAccount);
      document.getElementById('templatesEditor').style.display = 'block';
    } else {
      document.getElementById('templatesEditor').style.display = 'none';
    }
  });

  addTemplateBtn.addEventListener('click', () => {
    addTemplateInput();
  });


  // Manual UA input handler - auto-detect device type
  const accountUserAgent = document.getElementById('accountUserAgent');
  accountUserAgent.addEventListener('input', (e) => {
    const manualToggle = document.getElementById('manualUAToggle');
    if (!manualToggle.checked) return; // Only for manual mode

    const ua = e.target.value;
    const uaLabel = document.getElementById('uaDeviceLabel');

    // Auto-detect device from UA string
    let deviceLabel = 'Custom UA';
    let deviceType = 'windows-chrome';
    let viewport = { width: 1920, height: 1080 };
    let platform = 'Win32';

    if (ua.includes('iPad')) {
      deviceLabel = '📱 iPad (Manual)';
      deviceType = 'ipad-chrome';
      viewport = { width: 1366, height: 1024 };
      platform = 'iPad';
    } else if (ua.includes('Macintosh')) {
      deviceLabel = '🖥️ Mac (Manual)';
      deviceType = 'mac-chrome';
      viewport = { width: 1440, height: 900 };
      platform = 'MacIntel';
    } else if (ua.includes('Windows')) {
      deviceLabel = '💻 Windows (Manual)';
      deviceType = 'windows-chrome';
      viewport = { width: 1920, height: 1080 };
      platform = 'Win32';
    }

    // Set device profile
    accountUserAgent.dataset.deviceType = deviceType;
    accountUserAgent.dataset.viewportW = viewport.width;
    accountUserAgent.dataset.viewportH = viewport.height;
    accountUserAgent.dataset.platform = platform;

    uaLabel.textContent = deviceLabel;
    uaLabel.style.color = ua ? '#3498db' : '#aaa';
  });

  saveBtn.addEventListener('click', async () => {
    if (!selectedAccount) return;

    const templates = [];

    // First template
    const firstTemplate = document.getElementById('firstTemplate').value;
    if (firstTemplate) {
      templates.push({ type: 'first', content: firstTemplate });
    }

    // Other templates
    const inputs = document.querySelectorAll('.template-input-row textarea');
    inputs.forEach(input => {
      if (input.value.trim()) {
        templates.push({ type: 'regular', content: input.value.trim() });
      }
    });

    await ipcRenderer.invoke('save-templates', selectedAccount, templates);
    const accountName = accounts.find(a => a.id === selectedAccount)?.name || 'Selected account';
    showSuccessModal('Templates Saved!', `Comment templates for "${accountName}" have been successfully updated.`);
  });
}

async function loadTemplateAccounts() {
  accounts = await ipcRenderer.invoke('get-accounts');
  const select = document.getElementById('templateAccount');

  select.innerHTML = '<option value="">-- Select Account --</option>' +
    accounts.map(acc => `<option value="${acc.id}">${acc.name}</option>`).join('');
}

async function loadTemplates(accountId) {
  const templates = await ipcRenderer.invoke('get-templates', accountId);

  // Clear first
  document.getElementById('firstTemplate').value = '';
  document.getElementById('templatesList').innerHTML = '';

  templates.forEach(template => {
    if (template.templateType === 'first') {
      document.getElementById('firstTemplate').value = template.content;
    } else {
      addTemplateInput(template.content);
    }
  });

  // Add empty input if no templates
  if (templates.filter(t => t.templateType !== 'first').length === 0) {
    addTemplateInput();
  }
}

function addTemplateInput(value = '') {
  const container = document.getElementById('templatesList');
  const div = document.createElement('div');
  div.className = 'template-input-row';
  div.innerHTML = `
    <textarea class="form-control" rows="2" placeholder="Enter template text">${value}</textarea>
    <button class="btn btn-sm btn-danger" onclick="this.parentElement.remove()">🗑️</button>
  `;
  container.appendChild(div);
}

// Settings Management
function initSettings() {
  const saveBtn = document.getElementById('saveSettingsBtn');


  // Manual UA input handler - auto-detect device type
  const accountUserAgent = document.getElementById('accountUserAgent');
  accountUserAgent.addEventListener('input', (e) => {
    const manualToggle = document.getElementById('manualUAToggle');
    if (!manualToggle.checked) return; // Only for manual mode

    const ua = e.target.value;
    const uaLabel = document.getElementById('uaDeviceLabel');

    // Auto-detect device from UA string
    let deviceLabel = 'Custom UA';
    let deviceType = 'windows-chrome';
    let viewport = { width: 1920, height: 1080 };
    let platform = 'Win32';

    if (ua.includes('iPad')) {
      deviceLabel = '📱 iPad (Manual)';
      deviceType = 'ipad-chrome';
      viewport = { width: 1366, height: 1024 };
      platform = 'iPad';
    } else if (ua.includes('Macintosh')) {
      deviceLabel = '🖥️ Mac (Manual)';
      deviceType = 'mac-chrome';
      viewport = { width: 1440, height: 900 };
      platform = 'MacIntel';
    } else if (ua.includes('Windows')) {
      deviceLabel = '💻 Windows (Manual)';
      deviceType = 'windows-chrome';
      viewport = { width: 1920, height: 1080 };
      platform = 'Win32';
    }

    // Set device profile
    accountUserAgent.dataset.deviceType = deviceType;
    accountUserAgent.dataset.viewportW = viewport.width;
    accountUserAgent.dataset.viewportH = viewport.height;
    accountUserAgent.dataset.platform = platform;

    uaLabel.textContent = deviceLabel;
    uaLabel.style.color = ua ? '#3498db' : '#aaa';
  });

  saveBtn.addEventListener('click', async () => {
    const newSettings = {
      commentDelayMin: parseInt(document.getElementById('commentDelayMin').value),
      commentDelayMax: parseInt(document.getElementById('commentDelayMax').value),
      maxCommentsPerAccount: parseInt(document.getElementById('maxCommentsPerAccount').value),
      accountSwitchDelay: parseInt(document.getElementById('accountSwitchDelay').value),
      groupDelayMin: parseInt(document.getElementById('groupDelayMin').value),
      groupDelayMax: parseInt(document.getElementById('groupDelayMax').value),
      autoDeletePending: document.getElementById('autoDeletePending').checked,
      autoReact: document.getElementById('autoReact').checked,
      reactionTypes: Array.from(document.querySelectorAll('input[name="reactionType"]:checked'))
        .map(cb => cb.value),
      reactionProbability: parseInt(document.getElementById('reactionProbability').value),
      reactionDelayMin: parseInt(document.getElementById('reactionDelayMin').value),
      reactionDelayMax: parseInt(document.getElementById('reactionDelayMax').value),
      headless: document.getElementById('headless').checked,
      workingHoursStart: parseInt(document.getElementById('workingHoursStart').value),
      workingHoursEnd: parseInt(document.getElementById('workingHoursEnd').value),
      respectWorkingHours: document.getElementById('respectWorkingHours').checked,
      automationMode: document.querySelector('input[name="automationMode"]:checked')?.value || 'posts'
    };

    await ipcRenderer.invoke('save-settings', newSettings);
    settings = newSettings;
    showSuccessModal('Settings Saved!', 'Your automation settings have been successfully updated and will take effect immediately.');
  });
}

async function loadSettings() {
  settings = await ipcRenderer.invoke('get-settings');

  // Populate form
  document.getElementById('commentDelayMin').value = settings.commentDelayMin;
  document.getElementById('commentDelayMax').value = settings.commentDelayMax;
  document.getElementById('maxCommentsPerAccount').value = settings.maxCommentsPerAccount;
  document.getElementById('accountSwitchDelay').value = settings.accountSwitchDelay;
  document.getElementById('groupDelayMin').value = settings.groupDelayMin || 30;
  document.getElementById('groupDelayMax').value = settings.groupDelayMax || 120;
  document.getElementById('autoDeletePending').checked = settings.autoDeletePending;
  document.getElementById('autoReact').checked = settings.autoReact;
  document.getElementById('reactionProbability').value = settings.reactionProbability;
  document.getElementById('reactionDelayMin').value = settings.reactionDelayMin;
  document.getElementById('reactionDelayMax').value = settings.reactionDelayMax;
  document.getElementById('headless').checked = settings.headless;
  document.getElementById('workingHoursStart').value = settings.workingHoursStart;
  document.getElementById('workingHoursEnd').value = settings.workingHoursEnd;
  document.getElementById('respectWorkingHours').checked = settings.respectWorkingHours;

  // Automation mode
  const modeVal = settings.automationMode || 'posts';
  const modeRadio = document.querySelector(`input[name="automationMode"][value="${modeVal}"]`);
  if (modeRadio) modeRadio.checked = true;
  updateModeLabels(modeVal);

  // Add mode radio change listeners
  document.querySelectorAll('input[name="automationMode"]').forEach(radio => {
    radio.addEventListener('change', () => updateModeLabels(radio.value));
  });

  // Reaction types
  document.querySelectorAll('input[name="reactionType"]').forEach(cb => {
    cb.checked = settings.reactionTypes.includes(cb.value);
  });
}

function updateModeLabels(mode) {
  const postsLabel = document.getElementById('modePostsLabel');
  const groupsLabel = document.getElementById('modeGroupsLabel');
  if (postsLabel) postsLabel.style.borderColor = mode === 'posts' ? 'var(--primary)' : 'var(--border)';
  if (groupsLabel) groupsLabel.style.borderColor = mode === 'groups' ? '#27ae60' : 'var(--border)';
}

// Activity
function initActivity() {
  const filter = document.getElementById('activityFilter');

  filter.addEventListener('change', () => {
    loadActivity();
  });
}

async function loadActivity() {
  const filterValue = document.getElementById('activityFilter').value;
  const filters = {
    action: filterValue || undefined,
    limit: 100
  };

  const activities = await ipcRenderer.invoke('get-activity', filters);
  renderActivityTable(activities);
}

function renderActivityTable(activities) {
  const tbody = document.getElementById('activityTableBody');

  if (activities.length === 0) {
    tbody.innerHTML = '<tr><td colspan="5" class="text-center">No activity yet</td></tr>';
    return;
  }

  tbody.innerHTML = activities.map(activity => `
    <tr>
      <td>${formatDate(activity.timestamp * 1000)}</td>
      <td>${activity.accountName || 'Unknown'}</td>
      <td><span class="badge badge-secondary">${activity.action.toUpperCase()}</span></td>
      <td><span class="badge ${getActivityStatusClass(activity.status)}">${activity.status.toUpperCase()}</span></td>
      <td>
        ${activity.comment ? `Comment: "${activity.comment.substring(0, 50)}..."` : ''}
        ${activity.reaction ? `Reaction: ${activity.reaction}` : ''}
      </td>
    </tr>
  `).join('');
}

function getActivityStatusClass(status) {
  switch (status) {
    case 'success': return 'badge-success';
    case 'pending': return 'badge-warning';
    case 'declined': return 'badge-danger';
    case 'failed': return 'badge-danger';
    default: return 'badge-secondary';
  }
}

// Stats
async function loadStats() {
  const stats = await ipcRenderer.invoke('get-stats');
  updateStats(stats);
}

function updateStats(stats) {
  const set = (id, val) => {
    const el = document.getElementById(id);
    if (el) el.textContent = val;
  };
  set('totalComments', stats.totalComments);
  set('totalReacts', stats.totalReacts);
  set('totalAccounts', stats.totalAccounts);
  set('activeAccounts', stats.activeAccounts);
  set('disabledAccounts', stats.disabledAccounts);
  set('bannedAccounts', stats.bannedAccounts);
  set('totalPosts', stats.totalPosts);
  set('pendingComments', stats.pendingComments);
  set('declinedComments', stats.declinedComments);
  set('totalGroups', stats.totalGroups || 0);
  set('activeGroups', stats.activeGroups || 0);
  set('totalGroupComments', stats.totalGroupComments || 0);
}

// Logs
function addLog(level, message) {
  // Dashboard logs container
  const dashboardContainer = document.getElementById('logsContainer');
  // Live Logs page container
  const liveLogsContainer = document.getElementById('liveLogsContainer');

  const time = new Date().toLocaleTimeString();

  // Create log item HTML
  const logHTML = `
    <span class="log-time">${time}</span>
    <span class="log-message">${message}</span>
  `;

  // Add to dashboard
  if (dashboardContainer) {
    const dashboardLogItem = document.createElement('div');
    dashboardLogItem.className = `log-item ${level}`;
    dashboardLogItem.innerHTML = logHTML;
    dashboardContainer.insertBefore(dashboardLogItem, dashboardContainer.firstChild);

    // Keep only last 100 logs
    while (dashboardContainer.children.length > 100) {
      dashboardContainer.removeChild(dashboardContainer.lastChild);
    }
  }

  // Add to Live Logs page
  if (liveLogsContainer) {
    const liveLogItem = document.createElement('div');
    liveLogItem.className = `log-item ${level}`;
    liveLogItem.innerHTML = logHTML;
    liveLogsContainer.insertBefore(liveLogItem, liveLogsContainer.firstChild);

    // Keep only last 100 logs
    while (liveLogsContainer.children.length > 100) {
      liveLogsContainer.removeChild(liveLogsContainer.lastChild);
    }
  }
}

// Utilities
function formatDate(timestamp) {
  const date = new Date(timestamp);
  const now = new Date();
  const diff = now - date;

  if (diff < 60000) return 'Just now';
  if (diff < 3600000) return `${Math.floor(diff / 60000)}m ago`;
  if (diff < 86400000) return `${Math.floor(diff / 3600000)}h ago`;

  return date.toLocaleDateString() + ' ' + date.toLocaleTimeString();
}

function openModal(modalId) {
  document.getElementById(modalId).classList.add('active');
}

function closeModal(modalId) {
  document.getElementById(modalId).classList.remove('active');
}

// Initial data load
async function loadInitialData() {
  await loadSettings();
  await loadStats();
  await loadAccounts();
  await loadPosts();

  // Auto refresh stats every 5 seconds
  setInterval(loadStats, 5000);
}

// ==========================================
// UPDATE CHECKER
// ==========================================
function initUpdateChecker() {
  const checkUpdateBtn = document.getElementById('checkUpdateBtn');
  const updateModal = document.getElementById('updateModal');
  const closeBtn = updateModal.querySelector('.close');

  checkUpdateBtn.addEventListener('click', async () => {
    openModal('updateModal');
    checkForUpdates();
  });

  closeBtn.addEventListener('click', () => {
    closeModal('updateModal');
  });
}

async function checkForUpdates() {
  const checkingDiv = document.getElementById('updateChecking');
  const resultDiv = document.getElementById('updateResult');

  checkingDiv.style.display = 'block';
  resultDiv.style.display = 'none';

  try {
    const result = await ipcRenderer.invoke('check-for-updates');

    checkingDiv.style.display = 'none';
    resultDiv.style.display = 'block';

    if (!result.success) {
      resultDiv.innerHTML = `
        <div class="update-status info">
          <h3>❌ Update Check Failed</h3>
          <p>${result.error}</p>
        </div>
      `;
      return;
    }

    if (!result.updateAvailable) {
      resultDiv.innerHTML = `
        <div class="update-status success">
          <h3>✅ You're up to date!</h3>
          <p>You are using the latest version (${result.currentVersion})</p>
        </div>
      `;
    } else {
      resultDiv.innerHTML = `
        <div class="update-status info">
          <h3>🎉 Update Available!</h3>
          <p>A new version is available</p>
        </div>
        
        <div class="version-info">
          <div class="version-box">
            <div class="label">Current Version</div>
            <div class="version">${result.currentVersion}</div>
          </div>
          <div class="version-box">
            <div class="label">Latest Version</div>
            <div class="version">${result.latestVersion}</div>
          </div>
        </div>
        
        ${result.releaseNotes ? `
          <div class="release-notes">
            <h4>📋 Release Notes:</h4>
            <p>${result.releaseNotes}</p>
          </div>
        ` : ''}
        
        <div class="update-actions">
          <button class="btn btn-success" onclick="downloadAndInstallUpdate('${result.downloadUrl}')">
            <span class="icon">⬇️</span> Update Now
          </button>
          <button class="btn btn-secondary" onclick="closeModal('updateModal')">
            Later
          </button>
        </div>
      `;
    }
  } catch (error) {
    checkingDiv.style.display = 'none';
    resultDiv.style.display = 'block';
    resultDiv.innerHTML = `
      <div class="update-status info">
        <h3>❌ Error</h3>
        <p>${error.message}</p>
      </div>
    `;
  }
}

// =====================================================
// BACKGROUND UPDATE CHECK WITH NOTIFICATION
// =====================================================
async function checkForUpdatesInBackground() {
  try {
    const result = await ipcRenderer.invoke('check-for-updates');

    if (result.success && result.updateAvailable) {
      // Show notification popup
      showUpdateNotification(result);
    }
  } catch (error) {
    console.error('Background update check failed:', error);
  }
}

function showUpdateNotification(updateInfo) {
  // Create notification element
  const notification = document.createElement('div');
  notification.id = 'updateNotification';
  notification.style.cssText = `
    position: fixed;
    top: 20px;
    right: 20px;
    background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
    color: white;
    padding: 20px 25px;
    border-radius: 12px;
    box-shadow: 0 10px 40px rgba(0,0,0,0.3);
    z-index: 10000;
    min-width: 320px;
    max-width: 400px;
    animation: slideIn 0.5s ease-out;
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
  `;

  notification.innerHTML = `
    <style>
      @keyframes slideIn {
        from {
          transform: translateX(400px);
          opacity: 0;
        }
        to {
          transform: translateX(0);
          opacity: 1;
        }
      }
      @keyframes slideOut {
        from {
          transform: translateX(0);
          opacity: 1;
        }
        to {
          transform: translateX(400px);
          opacity: 0;
        }
      }
      .update-notification-header {
        display: flex;
        align-items: center;
        margin-bottom: 12px;
      }
      .update-notification-icon {
        font-size: 28px;
        margin-right: 12px;
      }
      .update-notification-title {
        font-size: 18px;
        font-weight: 600;
        margin: 0;
      }
      .update-notification-body {
        margin-bottom: 15px;
        font-size: 14px;
        opacity: 0.95;
      }
      .update-notification-versions {
        display: flex;
        gap: 10px;
        margin-bottom: 15px;
        font-size: 13px;
      }
      .update-notification-version {
        flex: 1;
        background: rgba(255,255,255,0.15);
        padding: 8px 10px;
        border-radius: 6px;
        text-align: center;
      }
      .update-notification-version-label {
        font-size: 11px;
        opacity: 0.8;
        margin-bottom: 4px;
      }
      .update-notification-version-number {
        font-weight: 600;
        font-size: 15px;
      }
      .update-notification-actions {
        display: flex;
        gap: 10px;
      }
      .update-notification-btn {
        flex: 1;
        padding: 10px;
        border: none;
        border-radius: 6px;
        font-size: 14px;
        font-weight: 600;
        cursor: pointer;
        transition: all 0.2s;
      }
      .update-notification-btn-primary {
        background: white;
        color: #667eea;
      }
      .update-notification-btn-primary:hover {
        transform: translateY(-2px);
        box-shadow: 0 4px 12px rgba(255,255,255,0.3);
      }
      .update-notification-btn-secondary {
        background: rgba(255,255,255,0.15);
        color: white;
      }
      .update-notification-btn-secondary:hover {
        background: rgba(255,255,255,0.25);
      }
      .update-notification-close {
        position: absolute;
        top: 10px;
        right: 10px;
        background: rgba(255,255,255,0.2);
        border: none;
        color: white;
        width: 24px;
        height: 24px;
        border-radius: 50%;
        cursor: pointer;
        font-size: 16px;
        line-height: 1;
        transition: background 0.2s;
      }
      .update-notification-close:hover {
        background: rgba(255,255,255,0.3);
      }
    </style>
    
    <button class="update-notification-close" onclick="dismissUpdateNotification()">×</button>
    
    <div class="update-notification-header">
      <div class="update-notification-icon">🎉</div>
      <h3 class="update-notification-title">Update Available!</h3>
    </div>
    
    <div class="update-notification-body">
      A new version of FB Comment Automation is ready to install.
    </div>
    
    <div class="update-notification-versions">
      <div class="update-notification-version">
        <div class="update-notification-version-label">Current</div>
        <div class="update-notification-version-number">${updateInfo.currentVersion}</div>
      </div>
      <div class="update-notification-version">
        <div class="update-notification-version-label">Latest</div>
        <div class="update-notification-version-number">${updateInfo.latestVersion}</div>
      </div>
    </div>
    
    <div class="update-notification-actions">
      <button class="update-notification-btn update-notification-btn-primary" onclick="openUpdateModal()">
        ⬇️ Update Now
      </button>
      <button class="update-notification-btn update-notification-btn-secondary" onclick="dismissUpdateNotification()">
        Later
      </button>
    </div>
  `;

  document.body.appendChild(notification);

  // Auto-dismiss after 30 seconds
  setTimeout(() => {
    dismissUpdateNotification();
  }, 30000);
}

function dismissUpdateNotification() {
  const notification = document.getElementById('updateNotification');
  if (notification) {
    notification.style.animation = 'slideOut 0.3s ease-in';
    setTimeout(() => {
      notification.remove();
    }, 300);
  }
}

function openUpdateModal() {
  dismissUpdateNotification();
  document.getElementById('checkUpdateBtn').click();
}

async function downloadAndInstallUpdate(downloadUrl) {
  const resultDiv = document.getElementById('updateResult');
  const downloadDiv = document.getElementById('updateDownload');

  resultDiv.style.display = 'none';
  downloadDiv.style.display = 'block';

  try {
    // Start download
    const result = await ipcRenderer.invoke('download-update', downloadUrl);

    if (!result.success) {
      downloadDiv.innerHTML = `
        <h3>❌ Download Failed</h3>
        <p style="color: #f4212e;">${result.error}</p>
        <button class="btn btn-secondary mt-3" onclick="closeModal('updateModal')">Close</button>
      `;
      return;
    }

    // Install update
    downloadDiv.innerHTML = `
      <h3>✅ Download Complete</h3>
      <p>Installing update and restarting application...</p>
      <p style="font-size: 12px; color: var(--text-secondary); margin-top: 10px;">
        Note: The app will close automatically. If you see an error, please close the app manually and run the installer from Downloads folder.
      </p>
      <div class="spinner"></div>
    `;

    const installResult = await ipcRenderer.invoke('install-update', result.installerPath);

    if (!installResult.success) {
      downloadDiv.innerHTML = `
        <h3>⚠️ Manual Installation Required</h3>
        <p style="color: var(--warning);">The automatic installation couldn't complete.</p>
        <p style="margin: 15px 0;">Please follow these steps:</p>
        <ol style="text-align: left; padding-left: 30px; line-height: 1.8;">
          <li>Close this application completely</li>
          <li>Go to your Downloads or Temp folder</li>
          <li>Run the installer manually</li>
          <li>Follow the installation wizard</li>
        </ol>
        <p style="font-size: 12px; margin-top: 15px; color: var(--text-secondary);">
          Installer location: ${result.installerPath}
        </p>
        <div style="display: flex; gap: 10px; margin-top: 20px;">
          <button class="btn btn-primary" onclick="require('electron').shell.openPath('${result.installerPath.replace(/\\/g, '\\\\')}')">
            📂 Open Installer
          </button>
          <button class="btn btn-secondary" onclick="closeModal('updateModal')">Close</button>
        </div>
      `;
    }
  } catch (error) {
    downloadDiv.innerHTML = `
      <h3>❌ Error</h3>
      <p style="color: #f4212e;">${error.message}</p>
      <button class="btn btn-secondary mt-3" onclick="closeModal('updateModal')">Close</button>
    `;
  }
}

// ==========================================
// LICENSE INFO DISPLAY
// ==========================================
function initLicenseInfo() {
  loadLicenseInfo();
  // Refresh license info every 5 minutes for dynamic updates
  setInterval(loadLicenseInfo, 5 * 60 * 1000);
}

async function loadLicenseInfo() {
  try {
    const licenseInfo = await ipcRenderer.invoke('get-license-info');

    if (licenseInfo && licenseInfo.valid) {
      const expiryDate = new Date(licenseInfo.expiryDate);
      const today = new Date();
      const daysRemaining = licenseInfo.daysRemaining;

      // Format expiry date
      const expiryFormatted = expiryDate.toLocaleDateString('en-US', {
        year: 'numeric',
        month: 'short',
        day: 'numeric'
      });

      // Update UI
      const licenseExpiryEl = document.getElementById('licenseExpiry');
      const licenseDaysEl = document.getElementById('licenseDays');

      licenseExpiryEl.textContent = expiryFormatted;
      licenseDaysEl.textContent = daysRemaining + ' days';

      // Color coding based on days remaining
      if (daysRemaining <= 3) {
        licenseDaysEl.classList.add('danger');
        licenseDaysEl.classList.remove('warning');
      } else if (daysRemaining <= 7) {
        licenseDaysEl.classList.add('warning');
        licenseDaysEl.classList.remove('danger');
      } else {
        licenseDaysEl.classList.remove('warning', 'danger');
      }
    }
  } catch (error) {
    console.error('Failed to load license info:', error);
  }
}

// Make functions globally accessible
window.downloadAndInstallUpdate = downloadAndInstallUpdate;

// IPC Listeners
function setupIPCListeners() {
  // Automation status updates
  ipcRenderer.on('automation-status', (event, data) => {
    updateStatusBadge(data.status, data.message);
    if (data.status === 'running') {
      document.getElementById('startBtn').disabled = true;
      document.getElementById('stopBtn').disabled = false;
    } else {
      document.getElementById('startBtn').disabled = false;
      document.getElementById('stopBtn').disabled = true;
    }
  });

  // Live logs
  ipcRenderer.on('log', (event, data) => {
    addLog(data.level, data.message);
  });

  // Stats updates
  ipcRenderer.on('stats-update', (event, stats) => {
    updateStats(stats);
  });

  // Update download progress
  ipcRenderer.on('update-download-progress', (event, data) => {
    const progressFill = document.getElementById('downloadProgress');
    const downloadStatus = document.getElementById('downloadStatus');

    if (progressFill && downloadStatus) {
      progressFill.style.width = data.progress + '%';
      progressFill.textContent = data.progress + '%';

      const downloadedMB = (data.downloaded / (1024 * 1024)).toFixed(2);
      const totalMB = (data.total / (1024 * 1024)).toFixed(2);
      downloadStatus.textContent = `Downloaded: ${downloadedMB} MB / ${totalMB} MB`;
    }
  });

  // License info updates
  ipcRenderer.on('license-info', (event, data) => {
    if (data.daysRemaining !== undefined) {
      const expiryDate = new Date(data.expiryDate);
      const expiryFormatted = expiryDate.toLocaleDateString('en-US', {
        year: 'numeric',
        month: 'short',
        day: 'numeric'
      });

      const licenseExpiryEl = document.getElementById('licenseExpiry');
      const licenseDaysEl = document.getElementById('licenseDays');

      if (licenseExpiryEl && licenseDaysEl) {
        licenseExpiryEl.textContent = expiryFormatted;
        licenseDaysEl.textContent = data.daysRemaining + ' days';

        if (data.daysRemaining <= 3) {
          licenseDaysEl.classList.add('danger');
        } else if (data.daysRemaining <= 7) {
          licenseDaysEl.classList.add('warning');
        }
      }
    }
  });

  // ==========================================
  // AUTOMATIC UPDATE NOTIFICATIONS
  // ==========================================

  // Listen for update available notification
  ipcRenderer.on('update-available', (event, data) => {
    console.log('Update available notification received:', data);
    showUpdateNotificationBanner(data);
  });

  // Listen for show update modal event
  ipcRenderer.on('show-update-modal', () => {
    const updateModal = document.getElementById('updateModal');
    if (updateModal) {
      updateModal.classList.add('active');
    }
  });

  // Listen for start update download event
  ipcRenderer.on('start-update-download', (event, updateInfo) => {
    // Automatically start download
    downloadAndInstallUpdate();
  });
}

// ==========================================
// UPDATE NOTIFICATION BANNER
// ==========================================
function showUpdateNotificationBanner(updateData) {
  // Remove existing banner if any
  const existingBanner = document.getElementById('updateNotificationBanner');
  if (existingBanner) {
    existingBanner.remove();
  }

  // Create notification banner
  const banner = document.createElement('div');
  banner.id = 'updateNotificationBanner';
  banner.className = 'update-notification-banner';
  banner.innerHTML = `
    <div class="update-banner-content">
      <div class="update-banner-icon">🎉</div>
      <div class="update-banner-text">
        <strong>New Update Available!</strong>
        <span>Version ${updateData.latestVersion} is ready to install (Current: ${updateData.currentVersion})</span>
      </div>
      <div class="update-banner-actions">
        <button class="btn btn-primary btn-sm" onclick="showUpdateModal()">
          <span class="icon">⬇️</span> Update Now
        </button>
        <button class="btn btn-secondary btn-sm" onclick="dismissUpdateBanner()">
          <span class="icon">✕</span> Later
        </button>
      </div>
    </div>
  `;

  // Insert banner at the top of content area
  const contentArea = document.querySelector('.content');
  if (contentArea) {
    contentArea.insertBefore(banner, contentArea.firstChild);
  }

  // Auto-hide after 30 seconds
  setTimeout(() => {
    if (banner && banner.parentElement) {
      banner.style.animation = 'slideUp 0.3s ease';
      setTimeout(() => banner.remove(), 300);
    }
  }, 30000);
}

function dismissUpdateBanner() {
  const banner = document.getElementById('updateNotificationBanner');
  if (banner) {
    banner.style.animation = 'slideUp 0.3s ease';
    setTimeout(() => banner.remove(), 300);
  }
}

function showUpdateModal() {
  dismissUpdateBanner();
  const updateModal = document.getElementById('updateModal');
  if (updateModal) {
    updateModal.classList.add('active');
  }
  // Trigger update check to show latest info
  document.getElementById('checkUpdateBtn').click();
}

// Make functions globally accessible
window.toggleAccount = toggleAccount;
window.deleteAccount = deleteAccount;
window.deletePost = deletePost;

// ==========================================
// SUCCESS MODAL FUNCTIONS
// ==========================================
function showSuccessModal(title, message) {
  const modal = document.getElementById('successModal');
  const titleEl = document.getElementById('successTitle');
  const textEl = document.getElementById('successText');

  titleEl.textContent = title;
  textEl.textContent = message;

  modal.classList.add('active');

  // Auto close after 3 seconds
  setTimeout(() => {
    closeSuccessModal();
  }, 3000);
}

function closeSuccessModal() {
  const modal = document.getElementById('successModal');
  modal.classList.remove('active');
}

// Make success modal functions globally accessible
window.showSuccessModal = showSuccessModal;
window.closeSuccessModal = closeSuccessModal;
