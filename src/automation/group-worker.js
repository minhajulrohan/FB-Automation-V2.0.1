const { chromium } = require('playwright');
const FacebookAutomator = require('./facebook');
const CommentMutator = require('../utils/mutator');
const CookieFixer = require('../utils/cookie-fixer');
const path = require('path');
const fs = require('fs');

function getBundledChromiumPath() {
  try {
    const { app } = require('electron');
    if (!app.isPackaged) return null;
    const base = path.join(process.resourcesPath, 'chromium');
    if (!fs.existsSync(base)) return null;
    const paths = [
      path.join(base, 'chrome-win', 'chrome.exe'),
      path.join(base, 'chrome-win64', 'chrome.exe'),
      path.join(base, 'chrome-linux', 'chrome'),
    ];
    const found = paths.find(p => fs.existsSync(p));
    if (found) return found;
    try {
      for (const item of fs.readdirSync(base)) {
        const sub = path.join(base, item);
        if (!fs.statSync(sub).isDirectory()) continue;
        const subFound = [
          path.join(sub, 'chrome-win', 'chrome.exe'),
          path.join(sub, 'chrome-win64', 'chrome.exe'),
          path.join(sub, 'chrome-linux', 'chrome'),
        ].find(p => fs.existsSync(p));
        if (subFound) return subFound;
      }
    } catch (e) { }
    return null;
  } catch (e) { return null; }
}

class GroupAutomationWorker {
  constructor(account, groups, settings, db, logger, sendToRenderer) {
    this.account = account;
    this.groups = groups;
    this.settings = settings;
    this.db = db;
    this.logger = logger;
    this.sendToRenderer = sendToRenderer;
    this.browser = null;
    this.context = null;
    this.page = null;
    this.fbAutomator = null;
    this.mutator = new CommentMutator();
    this.randomStarters = [
      'Interesting!', 'Nice one!', 'Great!', 'Wow!', 'Cool!',
      'Awesome!', 'Good!', 'Nice!', 'Love it!', 'Amazing!'
    ];
  }

  async run() {
    try {
      this.logger.info(`[GROUP] Starting for account: ${this.account.name}`);
      await this.initBrowser();
      await this.processGroups();
    } finally {
      await this.cleanup();
    }
  }

  async initBrowser() {
    const profile = this.account.deviceProfile || {};
    const viewportW = profile.viewportW || 1920;
    const viewportH = profile.viewportH || 1080;
    const platform = profile.platform || 'Win32';
    const userAgent = this.account.userAgent ||
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/132.0.0.0 Safari/537.36';

    const launchOptions = {
      headless: this.settings.headless,
      args: [
        '--disable-blink-features=AutomationControlled',
        '--no-sandbox', '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        `--window-size=${viewportW},${viewportH}`,
        '--disable-webrtc',
        '--force-webrtc-ip-handling-policy=disable_non_proxied_udp',
      ]
    };

    const chromePath = getBundledChromiumPath();
    if (chromePath) launchOptions.executablePath = chromePath;

    if (this.account.proxy) {
      try {
        const p = typeof this.account.proxy === 'string' ? JSON.parse(this.account.proxy) : this.account.proxy;
        launchOptions.proxy = { server: p.server, ...(p.username && { username: p.username, password: p.password }) };
      } catch (e) { launchOptions.proxy = { server: this.account.proxy }; }
    }

    this.browser = await chromium.launch(launchOptions);
    this.context = await this.browser.newContext({
      viewport: { width: viewportW, height: viewportH },
      userAgent, locale: 'en-US', timezoneId: 'America/New_York',
    });

    await this.context.addInitScript(() => {
      Object.defineProperty(navigator, 'webdriver', { get: () => false });
      window.chrome = { runtime: {} };
    });

    const cookies = CookieFixer.cleanCookies(this.account.cookies);
    await this.context.addCookies(cookies);

    this.page = await this.context.newPage();
    this.fbAutomator = new FacebookAutomator(this.page, this.db, this.logger, this.sendToRenderer);

    const loggedIn = await this.fbAutomator.verifyLogin();
    if (!loggedIn) throw new Error('Login failed - cookies expired');

    this.logger.info(`[GROUP] Browser ready for ${this.account.name}`);
  }

  async processGroups() {
    const commentsPerGroup = 3;

    for (let gi = 0; gi < this.groups.length; gi++) {
      const group = this.groups[gi];

      // Daily limit check
      const acc = this.db.getAccounts().find(a => a.id === this.account.id);
      if (!acc || acc.commentsToday >= this.settings.maxCommentsPerAccount) {
        this.logger.info(`[GROUP] Daily limit reached for ${this.account.name}`);
        break;
      }

      this.log('warning', `📂 Group ${gi + 1}/${this.groups.length}: ${group.name || group.url}`);
      this.logger.info(`[GROUP] === Navigating to: ${group.url}`);

      try {
        // Navigate - networkidle দিয়ে wait করো
        await this.page.goto(group.url, { waitUntil: 'domcontentloaded', timeout: 60000 });
        await this.sleep(5000);

        // Page info log
        const title = await this.page.title();
        const url = this.page.url();
        this.logger.info(`[GROUP] Page loaded: "${title}" | URL: ${url}`);

        // Feed load হওয়ার জন্য scroll করো এবং ফিরে আসো
        await this.scrollAndReturn();

        // Post URLs খুঁজো
        const postUrls = await this.getPostUrlsFromPage();
        this.logger.info(`[GROUP] Found ${postUrls.length} post URLs`);

        if (postUrls.length === 0) {
          this.log('warning', `⚠️ No posts found in group. Skipping.`);
          this.db.updateGroupVisit(group.id);
          continue;
        }

        // Max 3 posts এ comment করো
        const targets = postUrls.slice(0, commentsPerGroup);
        this.log('info', `💬 Will comment on ${targets.length} post(s)`);

        let done = 0;
        for (const postUrl of targets) {
          const freshAcc = this.db.getAccounts().find(a => a.id === this.account.id);
          if (!freshAcc || freshAcc.commentsToday >= this.settings.maxCommentsPerAccount) break;

          if (this.db.hasPostedToUrl(this.account.id, postUrl)) {
            this.logger.info(`[GROUP] Already commented: ${postUrl}`);
            continue;
          }

          try {
            await this.commentOnPost(postUrl, group);
            done++;
            if (done < targets.length) {
              const d = this.randomDelay(this.settings.commentDelayMin, this.settings.commentDelayMax);
              await this.sleep(d * 1000);
            }
          } catch (e) {
            this.logger.error(`[GROUP] Comment error: ${e.message}`);
          }
        }

        this.db.updateGroupVisit(group.id);
        this.log('success', `✅ Group done: ${done} comment(s) posted`);

        // Next group delay - random between min and max
        if (gi < this.groups.length - 1) {
          const min = (this.settings.groupDelayMin || 30);
          const max = (this.settings.groupDelayMax || 120);
          const delaySec = this.randomDelay(min, max);
          this.log('info', `⏱️ Waiting ${delaySec}s before next group...`);
          await this.sleep(delaySec * 1000);
        }

      } catch (err) {
        this.logger.error(`[GROUP] Group error: ${err.message}`);
      }
    }

    // Auto-disable account
    try {
      this.db.toggleAccount(this.account.id, false);
      this.log('warning', `Account ${this.account.name} auto-disabled after completing all groups.`);
    } catch (e) { }
  }

  // Feed scroll করে content load করো তারপর top এ ফিরে আসো
  async scrollAndReturn() {
    this.logger.info('[GROUP] Scrolling to load feed...');
    for (let i = 0; i < 6; i++) {
      await this.page.evaluate(() => window.scrollBy(0, 500));
      await this.sleep(800 + Math.random() * 600);
    }
    await this.sleep(1500);
    // উপরে ফিরে আসো
    await this.page.evaluate(() => window.scrollTo(0, 0));
    await this.sleep(2000);
    this.logger.info('[GROUP] Back to top');
  }

  // Page থেকে post URL গুলো বের করো - multiple strategy
  async getPostUrlsFromPage() {
    const result = await this.page.evaluate(() => {
      const logs = [];

      // URL clean করো
      function clean(href) {
        return href.split('?')[0].split('#')[0].replace(/\/$/, '');
      }

      // Valid post URL check
      function isPostUrl(href) {
        if (!href || !href.includes('facebook.com')) return false;
        if (href.includes('comment_id=')) return false;
        if (href.includes('notif_id=')) return false;
        if (href.includes('ref=notif')) return false;
        if (href.includes('__cft__')) return false;
        if (href.includes('/photos/')) return false;
        if (href.includes('/videos/')) return false;
        if (href.includes('/comment/')) return false;
        if (href.includes('/events/')) return false;
        if (href.includes('/members/')) return false;
        if (href.includes('#')) return false;
        return href.includes('/posts/') ||
          href.includes('story_fbid') ||
          href.includes('pfbid');
      }

      // Time text → minutes
      function toMins(t) {
        t = (t || '').trim().toLowerCase();
        if (!t) return null;
        if (t === 'just now' || t === 'now') return 0;
        let m;
        m = t.match(/^(\d+)\s*s(ec)?/); if (m) return 0;
        m = t.match(/^(\d+)\s*m(in)?/); if (m) return +m[1];
        m = t.match(/^(\d+)\s*h(r|our)?/); if (m) return +m[1] * 60;
        return null;
      }

      // Strategy 1: role="feed" এর ভেতরে role="article" খোঁজো
      const feedEl = document.querySelector('[role="feed"]');
      const articles = feedEl
        ? Array.from(feedEl.querySelectorAll('[role="article"]'))
        : Array.from(document.querySelectorAll('[role="article"]'));

      logs.push(`Strategy1: ${articles.length} articles found`);

      const seen = new Set();
      const posts = [];

      for (const article of articles) {
        // Article এর সব links
        const links = Array.from(article.querySelectorAll('a[href]'))
          .filter(a => isPostUrl(a.href));

        if (links.length === 0) continue;

        const url = clean(links[0].href);
        if (seen.has(url)) continue;
        seen.add(url);

        // Time খোঁজো - article এর সব text node স্ক্যান করো
        let age = null;
        const allText = Array.from(article.querySelectorAll('*'))
          .filter(el => el.childElementCount === 0)
          .map(el => (el.innerText || el.textContent || '').trim())
          .filter(t => t.length > 0 && t.length <= 12);

        for (const t of allText) {
          const m = toMins(t);
          if (m !== null) { age = m; break; }
        }

        // aria-label এ time খোঁজো (যেমন: "29 minutes ago")
        if (age === null) {
          const timeEls = article.querySelectorAll('[aria-label]');
          for (const el of timeEls) {
            const label = el.getAttribute('aria-label') || '';
            const m = toMins(label);
            if (m !== null) { age = m; break; }
            // "X minutes ago" pattern
            const match = label.match(/(\d+)\s*(minute|hour|second)/i);
            if (match) {
              const val = +match[1];
              const unit = match[2].toLowerCase();
              if (unit.startsWith('s')) age = 0;
              else if (unit.startsWith('m')) age = val;
              else if (unit.startsWith('h')) age = val * 60;
              break;
            }
          }
        }

        posts.push({ url, age });
      }

      logs.push(`Strategy1 result: ${posts.length} posts`);

      // Strategy 2: article না পেলে সরাসরি link scan
      if (posts.length === 0) {
        logs.push('Falling back to Strategy2: direct link scan');
        const allLinks = Array.from(document.querySelectorAll('a[href]'))
          .filter(a => isPostUrl(a.href));

        for (const link of allLinks) {
          const url = clean(link.href);
          if (seen.has(url)) continue;
          seen.add(url);

          // Parent traverse করে time খোঁজো
          let age = null;
          let node = link.parentElement;
          for (let i = 0; i < 20 && node && node !== document.body; i++) {
            const texts = Array.from(node.querySelectorAll('*'))
              .filter(el => el.childElementCount === 0)
              .map(el => (el.innerText || el.textContent || '').trim())
              .filter(t => t.length > 0 && t.length <= 12);
            for (const t of texts) {
              const m = toMins(t);
              if (m !== null) { age = m; break; }
            }
            // aria-label check
            if (age === null) {
              const label = node.getAttribute('aria-label') || '';
              const match = label.match(/(\d+)\s*(minute|hour|second)/i);
              if (match) {
                const val = +match[1];
                const unit = match[2].toLowerCase();
                if (unit.startsWith('s')) age = 0;
                else if (unit.startsWith('m')) age = val;
                else if (unit.startsWith('h')) age = val * 60;
              }
            }
            if (age !== null) break;
            node = node.parentElement;
          }
          posts.push({ url, age });
        }
        logs.push(`Strategy2 result: ${posts.length} posts`);
      }

      return { posts, logs };
    });

    // সব log করো
    result.logs.forEach(l => this.logger.info(`[GROUP] ${l}`));
    result.posts.forEach(p =>
      this.logger.info(`[GROUP]   ${p.age === null ? 'age=?' : 'age=' + p.age + 'm'} | ${p.url}`)
    );

    const posts = result.posts;
    if (posts.length === 0) {
      this.logger.info('[GROUP] ❌ No post URLs found at all');
      return [];
    }

    // Recent posts ≤60 min
    const recent = posts.filter(p => p.age !== null && p.age <= 60).map(p => p.url);
    if (recent.length > 0) {
      this.log('info', `🕐 Found ${recent.length} recent post(s) within 1 hour`);
      return recent;
    }

    // Time detect হয়নি কিন্তু posts পাওয়া গেছে → first 3 use করো
    this.log('warning', `⚠️ Time not detected. Using first ${Math.min(3, posts.length)} post(s)`);
    return posts.slice(0, 3).map(p => p.url);
  }

  // Post এ comment করো - worker.js এর exact logic
  async commentOnPost(postUrl, group) {
    this.logger.info(`[GROUP] Commenting on: ${postUrl}`);
    this.log('info', `💬 Navigating to post...`);

    await this.fbAutomator.navigateToPost(postUrl);
    await this.sleep(3000);

    // Step 1: Starter comment
    const starter = this.getRandomStarter();
    const r1 = await this.fbAutomator.addComment(starter);
    if (!r1.success) {
      this.logger.error('[GROUP] Failed to add initial comment');
      return;
    }
    await this.sleep(this.randomDelay(2, 5) * 1000);

    // Step 2: Edit with template
    const template = await this.getTemplateComment();
    const final = `Hi ${template}`;
    await this.fbAutomator.editLastComment(final);
    await this.sleep(this.randomDelay(2, 4) * 1000);

    // Step 3: React
    if (this.settings.autoReact && this.shouldReact()) {
      await this.sleep(this.randomDelay(this.settings.reactionDelayMin, this.settings.reactionDelayMax) * 1000);
      const reactResult = await this.fbAutomator.reactToComment();
      if (reactResult.success) {
        this.db.incrementAccountReacts(this.account.id);
        this.db.logActivity({ accountId: this.account.id, postId: group.id, postUrl, action: 'react', status: 'success' });
      }
    }

    await this.sleep(3000);

    // Step 4: Check status
    const status = await this.fbAutomator.checkCommentStatus(final);
    this.logger.info(`[GROUP] Comment status: ${status}`);
    this.db.logActivity({ accountId: this.account.id, postId: group.id, postUrl, action: 'comment', status, comment: final });

    // Step 5: Delete if pending/declined
    if ((status === 'pending' || status === 'declined') && this.settings.autoDeletePending) {
      await this.sleep(2000);
      const del = await this.fbAutomator.deleteLastComment();
      if (del.success) {
        this.log('warning', `🗑️ Deleted ${status} comment`);
      }
    } else if (status === 'success') {
      this.db.incrementAccountComments(this.account.id);
      this.db.incrementGroupComments(group.id);
      this.db.markUrlAsPosted(this.account.id, postUrl);
      this.log('success', `✅ Comment posted successfully!`);
      this.sendToRenderer('stats-update', this.db.getStats());
    }
  }

  // Helpers
  getRandomStarter() {
    return this.randomStarters[Math.floor(Math.random() * this.randomStarters.length)];
  }

  async getTemplateComment() {
    const templates = this.db.getTemplates(this.account.id);
    if (!templates.length) return 'Nice post!';
    const t = templates[Math.floor(Math.random() * templates.length)];
    return this.mutator.mutateComment(t.content);
  }

  shouldReact() { return Math.random() * 100 < this.settings.reactionProbability; }

  getRandomReaction() {
    const r = this.settings.reactionTypes;
    return r[Math.floor(Math.random() * r.length)];
  }

  randomDelay(min, max) {
    return Math.floor(Math.random() * (max - min + 1)) + min;
  }

  log(level, message) {
    this.sendToRenderer('log', { level, message: `[${this.account.name}] ${message}`, timestamp: Date.now() });
  }

  sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

  async cleanup() {
    try { if (this.page) await this.page.close(); } catch (e) { }
    try { if (this.context) await this.context.close(); } catch (e) { }
    try { if (this.browser) await this.browser.close(); } catch (e) { }
    this.logger.info(`[GROUP] Browser closed for ${this.account.name}`);
  }

  async stop() { await this.cleanup(); }
}

module.exports = GroupAutomationWorker;
