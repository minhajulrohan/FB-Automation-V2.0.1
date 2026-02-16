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
  initTemplateManagement();
  initSettings();
  initActivity();
  initUpdateChecker();
  initLicenseInfo();
  loadInitialData();
  setupIPCListeners();
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
function initAccountManagement() {
  const addAccountBtn = document.getElementById('addAccountBtn');
  const modal = document.getElementById('accountModal');
  const closeBtn = modal.querySelector('.close');
  const saveBtn = document.getElementById('saveAccountBtn');

  addAccountBtn.addEventListener('click', () => {
    openModal('accountModal');
  });

  closeBtn.addEventListener('click', () => {
    closeModal('accountModal');
  });

  saveBtn.addEventListener('click', async () => {
    const name = document.getElementById('accountName').value;
    const cookiesText = document.getElementById('accountCookies').value;
    const proxy = document.getElementById('accountProxy').value;
    const userAgent = document.getElementById('accountUserAgent').value;

    if (!name || !cookiesText) {
      alert('Please fill in required fields');
      return;
    }

    try {
      const cookies = JSON.parse(cookiesText);

      const account = {
        name,
        cookies,
        proxy: proxy || null,
        userAgent: userAgent || null
      };

      await ipcRenderer.invoke('add-account', account);
      closeModal('accountModal');
      clearAccountForm();
      loadAccounts();
      loadStats();
      showSuccessModal('Account Added!', `Account "${name}" has been successfully added and is ready to use.`);
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

  tbody.innerHTML = accounts.map(acc => `
    <tr>
      <td>${acc.name}</td>
      <td>
        <span class="badge ${getStatusBadgeClass(acc)}">${getStatusText(acc)}</span>
      </td>
      <td>${acc.commentsToday} / ${settings.maxCommentsPerAccount || 20}</td>
      <td>${acc.totalComments}</td>
      <td>${acc.totalReacts}</td>
      <td>${acc.lastUsed ? formatDate(acc.lastUsed * 1000) : 'Never'}</td>
      <td>
        <button class="btn btn-sm btn-secondary" onclick="toggleAccount('${acc.id}', ${!acc.enabled})">
          ${acc.enabled ? '⏸️ Disable' : '▶️ Enable'}
        </button>
        <button class="btn btn-sm btn-danger" onclick="deleteAccount('${acc.id}')">🗑️</button>
      </td>
    </tr>
  `).join('');
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

function clearAccountForm() {
  document.getElementById('accountName').value = '';
  document.getElementById('accountCookies').value = '';
  document.getElementById('accountProxy').value = '';
  document.getElementById('accountUserAgent').value = '';
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

  saveBtn.addEventListener('click', async () => {
    const newSettings = {
      commentDelayMin: parseInt(document.getElementById('commentDelayMin').value),
      commentDelayMax: parseInt(document.getElementById('commentDelayMax').value),
      maxCommentsPerAccount: parseInt(document.getElementById('maxCommentsPerAccount').value),
      accountSwitchDelay: parseInt(document.getElementById('accountSwitchDelay').value),
      postRotationDelay: parseInt(document.getElementById('postRotationDelay').value),
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
      respectWorkingHours: document.getElementById('respectWorkingHours').checked
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
  document.getElementById('postRotationDelay').value = settings.postRotationDelay;
  document.getElementById('autoDeletePending').checked = settings.autoDeletePending;
  document.getElementById('autoReact').checked = settings.autoReact;
  document.getElementById('reactionProbability').value = settings.reactionProbability;
  document.getElementById('reactionDelayMin').value = settings.reactionDelayMin;
  document.getElementById('reactionDelayMax').value = settings.reactionDelayMax;
  document.getElementById('headless').checked = settings.headless;
  document.getElementById('workingHoursStart').value = settings.workingHoursStart;
  document.getElementById('workingHoursEnd').value = settings.workingHoursEnd;
  document.getElementById('respectWorkingHours').checked = settings.respectWorkingHours;

  // Reaction types
  document.querySelectorAll('input[name="reactionType"]').forEach(cb => {
    cb.checked = settings.reactionTypes.includes(cb.value);
  });
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
  document.getElementById('totalComments').textContent = stats.totalComments;
  document.getElementById('totalReacts').textContent = stats.totalReacts;
  document.getElementById('totalAccounts').textContent = stats.totalAccounts;
  document.getElementById('activeAccounts').textContent = stats.activeAccounts;
  document.getElementById('disabledAccounts').textContent = stats.disabledAccounts;
  document.getElementById('bannedAccounts').textContent = stats.bannedAccounts;
  document.getElementById('totalPosts').textContent = stats.totalPosts;
  document.getElementById('pendingComments').textContent = stats.pendingComments;
  document.getElementById('declinedComments').textContent = stats.declinedComments;
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
