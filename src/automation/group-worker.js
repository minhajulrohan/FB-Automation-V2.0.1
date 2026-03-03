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
    // settings থেকে commentsPerGroup নেবে, default 3
    const commentsPerGroup = (this.settings.commentsPerGroup && this.settings.commentsPerGroup > 0)
      ? this.settings.commentsPerGroup
      : 3;

    for (let gi = 0; gi < this.groups.length; gi++) {
      const group = this.groups[gi];

      const acc = this.db.getAccounts().find(a => a.id === this.account.id);
      if (!acc || acc.commentsToday >= this.settings.maxCommentsPerAccount) {
        this.logger.info(`[GROUP] Daily limit reached for ${this.account.name}`);
        break;
      }

      this.log('warning', `📂 Group ${gi + 1}/${this.groups.length}: ${group.name || group.url}`);
      this.logger.info(`[GROUP] === Navigating to: ${group.url}`);

      try {
        // প্রথমবার group এ navigate করো
        await this.page.goto(group.url, { waitUntil: 'domcontentloaded', timeout: 60000 });
        await this.sleep(10000);

        const title = await this.page.title();
        this.logger.info(`[GROUP] Page: "${title}" | URL: ${this.page.url()}`);

        // ── মূল loop: commentsPerGroup বার comment করবে এই group এ ──
        // প্রতিবার: group এ ফিরে যাও → scroll → নতুন post খোঁজো → comment করো
        let done = 0;
        const usedUrls = new Set(); // এই session এ already used post URLs

        for (let ci = 0; ci < commentsPerGroup; ci++) {
          // Daily limit check
          const freshAcc = this.db.getAccounts().find(a => a.id === this.account.id);
          if (!freshAcc || freshAcc.commentsToday >= this.settings.maxCommentsPerAccount) {
            this.log('warning', `⚠️ Daily limit reached. Stopping group loop.`);
            break;
          }

          this.log('info', `🔄 Comment ${ci + 1}/${commentsPerGroup} in group: ${group.name || group.url}`);

          // ── প্রতিটা iteration এ group এ ফিরে যাও (ci > 0 হলে) ──
          if (ci > 0) {
            try {
              await this.page.goto(group.url, { waitUntil: 'domcontentloaded', timeout: 60000 });
              await this.sleep(8000);
            } catch (navErr) {
              this.logger.error(`[GROUP] Re-navigate error: ${navErr.message}`);
              continue;
            }
          }

          // ── Scroll করে নতুন posts load করো ──
          await this.scrollToLoadFeed();

          // ── Post URLs বের করো ──
          const postUrls = await this.getPostUrlsFromPage();
          this.logger.info(`[GROUP] Found ${postUrls.length} post URLs (iteration ${ci + 1})`);

          if (postUrls.length === 0) {
            this.log('warning', `⚠️ No posts found in iteration ${ci + 1}. Skipping.`);
            continue;
          }

          // ── এমন একটা post খোঁজো যেটায় আগে comment করা হয়নি ──
          // usedUrls (এই session) এবং db.hasPostedToUrl (সব সময়ের) দুটোই check করো
          let targetUrl = null;
          for (const url of postUrls) {
            if (usedUrls.has(url)) continue;
            if (this.db.hasPostedToUrl(this.account.id, url)) {
              this.logger.info(`[GROUP] Already commented (DB): ${url}`);
              continue;
            }
            targetUrl = url;
            break;
          }

          if (!targetUrl) {
            this.log('warning', `⚠️ No new post found in iteration ${ci + 1}. All already commented.`);
            continue;
          }

          // ── Comment করো ──
          usedUrls.add(targetUrl); // session এ mark করো
          try {
            await this.commentOnPost(targetUrl, group);
            done++;
          } catch (e) {
            this.logger.error(`[GROUP] Comment error: ${e.message}`);
          }

          // ── পরের iteration এর আগে delay ──
          if (ci < commentsPerGroup - 1) {
            const d = this.randomDelay(this.settings.commentDelayMin, this.settings.commentDelayMax);
            this.log('info', `⏱️ Waiting ${d}s before next comment...`);
            await this.sleep(d * 1000);
          }
        }

        this.db.updateGroupVisit(group.id);
        this.log('success', `✅ Group done: ${done}/${commentsPerGroup} comment(s) posted`);

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

    try {
      this.db.toggleAccount(this.account.id, false);
      this.log('warning', `Account ${this.account.name} auto-disabled after completing all groups.`);
    } catch (e) { }
  }

  // Scroll করে feed posts load করো
  async scrollToLoadFeed() {
    this.logger.info('[GROUP] Scrolling to load more posts...');
    for (let i = 0; i < 10; i++) {
      await this.page.evaluate(() => window.scrollBy(0, 700));
      await this.sleep(900 + Math.random() * 600);
    }
    await this.sleep(2000);
    await this.page.evaluate(() => window.scrollTo(0, 0));
    await this.sleep(1500);
    this.logger.info('[GROUP] Scroll done, back to top');
  }

  async getPostUrlsFromPage() {
    // Random minute limit — 1 to 59
    const maxAgeMinutes = Math.floor(Math.random() * 59) + 1;
    this.logger.info(`[GROUP] Time filter: ≤${maxAgeMinutes}m`);

    // ── FIX: current page এর group ID বের করো ──
    // শুধু এই group এর posts নেওয়া হবে, অন্য group এর না
    const currentGroupId = await this.page.evaluate(() => {
      const url = window.location.href;
      // /groups/123456789/ বা /groups/GroupName/ — দুটোই handle করো
      const m = url.match(/facebook\.com\/groups\/([^/?#]+)/);
      return m ? m[1] : null;
    });
    this.logger.info(`[GROUP] Current group ID: ${currentGroupId}`);

    const result = await this.page.evaluate((params) => {
      const { maxMins, groupId } = params;
      const logs = [];

      function bnToAr(s) {
        const m = { '০': '0', '১': '1', '২': '2', '৩': '3', '৪': '4', '৫': '5', '৬': '6', '৭': '7', '৮': '8', '৯': '9' };
        return (s || '').replace(/[০-৯]/g, c => m[c] || c);
      }

      function toMin(raw) {
        if (!raw) return null;
        const s = bnToAr(raw).trim().toLowerCase();
        if (/এখন|এখনই|এইমাত্র/.test(raw)) return 0;
        if (/সেকেন্ড/.test(raw)) return 0;
        const bm = bnToAr(raw).match(/(\d+)\s*(মি\.|মিনিট)/);
        if (bm) return +bm[1];
        const bh = bnToAr(raw).match(/(\d+)\s*(ঘণ্টা|ঘন্টা)/);
        if (bh) return +bh[1] * 60;
        if (/^just\s*now$/.test(s)) return 0;
        if (/\d+\s*s(ec)?(\s+ago)?$/.test(s)) return 0;
        if (/(\d+)\s*second/.test(s)) return 0;
        const mm = s.match(/^(\d+)\s*m(in(ute)?s?)?(\s+ago)?$/);
        if (mm) return +mm[1];
        const ml = s.match(/(\d+)\s*minute/);
        if (ml) return +ml[1];
        const hm = s.match(/^(\d+)\s*h(r|our)?s?(\s+ago)?$/);
        if (hm) return +hm[1] * 60;
        const hl = s.match(/(\d+)\s*hour/);
        if (hl) return +hl[1] * 60;
        return null;
      }

      function isPostHref(href) {
        if (!href || !href.includes('facebook.com')) return false;
        if (href.includes('/photos/') || href.includes('/videos/')) return false;
        if (href.includes('/events/') || href.includes('/about')) return false;
        if (href.includes('/members/') || href.includes('/user/')) return false;
        if (href.includes('/files/') || href.includes('/announcements')) return false;
        if (href.includes('/media/') || href.includes('/search')) return false;
        if (href.includes('/permalink/likes')) return false;
        return href.includes('/posts/') || href.includes('story_fbid') || href.includes('pfbid');
      }

      function cleanUrl(href) {
        return href.split('?')[0].split('#')[0].replace(/\/$/, '');
      }

      // সব post links collect করো
      const allLinks = Array.from(document.querySelectorAll('a[href]'))
        .filter(a => isPostHref(a.href));

      logs.push(`Post-pattern links found: ${allLinks.length}`);

      // ── FIX: শুধু current group এর posts রাখো ──
      // groupId দিয়ে filter করো যাতে sidebar/notification এর অন্য group এর links না ঢোকে
      const groupLinks = groupId
        ? allLinks.filter(a => a.href.includes(`/groups/${groupId}/`))
        : allLinks;

      logs.push(`Current group (${groupId}) links: ${groupLinks.length}`);

      // Unique base URLs — শুধু current group এর
      const seen = new Set();
      const uniqueLinks = [];
      for (const a of groupLinks) {
        const url = cleanUrl(a.href);
        if (!seen.has(url)) {
          seen.add(url);
          uniqueLinks.push({ url, el: a });
          logs.push(`  Found: ${url}`);
        }
      }
      logs.push(`Unique post URLs: ${uniqueLinks.length}`);

      // প্রতিটা link এর কাছে time খোঁজো
      const posts = [];
      for (const { url, el } of uniqueLinks) {
        let ageMinutes = null;
        let node = el.parentElement;

        for (let level = 0; level < 20 && node && node !== document.body; level++) {
          // data-utime — সবচেয়ে reliable
          const ut = node.querySelector('[data-utime]');
          if (ut) {
            const utime = parseInt(ut.getAttribute('data-utime'));
            if (utime) { ageMinutes = Math.floor((Date.now() / 1000 - utime) / 60); break; }
          }

          // aria-label time
          const ariaEls = node.querySelectorAll('[aria-label]');
          for (const ar of ariaEls) {
            const lbl = ar.getAttribute('aria-label') || '';
            if (/minute|hour|second|ago|just now|মি\.|ঘণ্টা|এখন/i.test(lbl)) {
              const mins = toMin(lbl);
              if (mins !== null) { ageMinutes = mins; break; }
            }
          }
          if (ageMinutes !== null) break;

          // innerText candidates
          const candidates = Array.from(node.querySelectorAll('a, span, abbr')).concat([node]);
          for (const c of candidates) {
            if (c.childElementCount > 3) continue;
            const txt = (c.innerText || c.textContent || '').trim();
            if (!txt || txt.length > 25) continue;
            const mins = toMin(txt);
            if (mins !== null) { ageMinutes = mins; break; }
          }
          if (ageMinutes !== null) break;

          node = node.parentElement;
        }

        logs.push(`  age=${ageMinutes === null ? '?' : ageMinutes + 'm'} | ${url}`);
        posts.push({ url, ageMinutes });
      }

      // Recent filter
      const recent = posts.filter(p => p.ageMinutes !== null && p.ageMinutes <= maxMins);
      recent.sort((a, b) => a.ageMinutes - b.ageMinutes);

      // Fallback: time না পেলে সব posts দাও (DOM order = newest first)
      const fallback = posts.map(p => p.url);

      return { recent: recent.map(p => p.url), fallback, logs, maxMins, total: posts.length };
    }, { maxMins: maxAgeMinutes, groupId: currentGroupId });

    result.logs.forEach(l => this.logger.info(`[GROUP] ${l}`));
    this.logger.info(`[GROUP] Total: ${result.total} | Recent(≤${result.maxMins}m): ${result.recent.length}`);

    if (result.recent.length > 0) {
      this.log('info', `✅ ${result.recent.length} recent post(s) within ${result.maxMins}m`);
      return result.recent;
    }

    if (result.fallback.length > 0) {
      this.log('warning', `⚠️ Time not detected — using all ${result.fallback.length} found post(s)`);
      return result.fallback;
    }

    return [];
  }

  async commentOnPost(postUrl, group) {
    this.logger.info(`[GROUP] Commenting on: ${postUrl}`);
    this.log('info', `💬 Navigating to post...`);

    await this.page.goto(postUrl, { waitUntil: 'domcontentloaded', timeout: 30000 });
    await this.sleep(3000);

    // Step 1: Starter comment
    const starter = this.getRandomStarter();
    const r1 = await this.fbAutomator.addComment(starter);
    if (!r1.success) {
      this.logger.error('[GROUP] Failed to add initial comment');
      return;
    }
    await this.sleep(this.randomDelay(2, 5) * 1000);

    // Step 2: Edit with final template
    const template = await this.getTemplateComment();
    const final = `Hi ${template}`;
    await this.fbAutomator.editLastComment(final);
    await this.sleep(this.randomDelay(2, 4) * 1000);

    // Step 3: Status check — React এর আগেই করতে হবে
    // Pending/Declined detect করে delete করবে, react skip করবে
    const status = await this.fbAutomator.checkCommentStatus(final);
    this.logger.info(`[GROUP] Comment status: ${status}`);

    // FIX: postId = null — group.id পাঠালে activity table এ FOREIGN KEY error হয়
    // কারণ activity.postId → posts table reference করে, fb_groups না
    try {
      this.db.logActivity({
        accountId: this.account.id,
        postId: null,
        postUrl,
        action: 'comment',
        status,
        comment: final
      });
    } catch (e) {
      this.logger.error(`[GROUP] logActivity error: ${e.message}`);
    }

    // Step 4: Pending বা Declined → delete করো, return
    if (status === 'pending' || status === 'declined') {
      this.log('warning', `⚠️ Comment is ${status} — attempting delete...`);
      if (this.settings.autoDeletePending) {
        await this.sleep(2000);
        // facebook.js এর deleteLastComment এ final text পাঠাও
        // সে pending/declined keyword বা text দিয়ে comment খুঁজে delete করে
        const del = await this.fbAutomator.deleteLastComment(final);
        if (del && del.success) {
          this.log('warning', `🗑️ Deleted ${status} comment`);
        } else {
          this.log('warning', `⚠️ Delete failed: ${(del && del.error) || 'unknown'}`);
        }
      } else {
        this.log('warning', `ℹ️ Auto-delete disabled. ${status} comment left on post.`);
      }
      this.sendToRenderer('stats-update', this.db.getStats());
      return; // react skip, success count বাড়বে না
    }

    // Step 5: Success → react করো
    if (this.settings.autoReact && this.shouldReact()) {
      await this.sleep(this.randomDelay(
        this.settings.reactionDelayMin,
        this.settings.reactionDelayMax
      ) * 1000);
      try {
        const reactResult = await this.fbAutomator.reactToComment();
        if (reactResult && reactResult.success) {
          this.db.incrementAccountReacts(this.account.id);
          try {
            this.db.logActivity({
              accountId: this.account.id,
              postId: null,
              postUrl,
              action: 'react',
              status: 'success'
            });
          } catch (e) { }
        }
      } catch (e) {
        this.logger.info(`[GROUP] React skipped: ${e.message}`);
      }
    }

    // Step 6: Success stats
    this.db.incrementAccountComments(this.account.id);
    this.db.incrementGroupComments(group.id);
    this.db.markUrlAsPosted(this.account.id, postUrl);
    this.log('success', `✅ Comment posted successfully!`);
    this.sendToRenderer('stats-update', this.db.getStats());
  }
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