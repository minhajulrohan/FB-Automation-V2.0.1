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
    // randomStarters replaced by dynamic random word generator in getRandomStarter()
    this.randomStarters = null;
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

  // Scroll করে feed posts collect করো
  // Facebook DOM virtualization এর কারণে top এ ফিরলে posts চলে যায়
  // তাই scroll করতে করতেই post URLs collect করি
  async scrollToLoadFeed() {
    this.logger.info('[GROUP] Scrolling to collect post URLs...');
    this._collectedPostUrls = new Set(); // scroll এর সময় collect করা URLs

    for (let i = 0; i < 20; i++) {
      await this.page.evaluate(() => window.scrollBy(0, 700));
      await this.sleep(900 + Math.random() * 600);

      // প্রতি step এ visible articles থেকে post URLs collect করো
      const urls = await this.page.evaluate(() => {
        function isPostHref(href) {
          if (!href || !href.includes('facebook.com')) return false;
          if (href.includes('/photos/') || href.includes('/videos/') || href.includes('/events/')) return false;
          if (href.includes('/about') || href.includes('/members/') || href.includes('/user/')) return false;
          if (href.includes('/files/') || href.includes('/announcements') || href.includes('/media/')) return false;
          if (href.includes('/search') || href.includes('/permalink/likes')) return false;
          return href.includes('/posts/') || href.includes('/permalink/') ||
            href.includes('story_fbid') || href.includes('pfbid');
        }
        function cleanUrl(href) {
          return href.split('?')[0].split('#')[0].replace(/\/$/, '');
        }
        return Array.from(document.querySelectorAll('a[href]'))
          .filter(a => isPostHref(a.href))
          .map(a => cleanUrl(a.href))
          .filter((u, i, arr) => arr.indexOf(u) === i); // unique
      });

      urls.forEach(u => this._collectedPostUrls.add(u));

      if (i % 5 === 4) {
        this.logger.info(`[GROUP] Scroll step ${i + 1}/20 — collected: ${this._collectedPostUrls.size} post URLs`);
      }
    }

    await this.sleep(2000);
    this.logger.info(`[GROUP] Scroll done — total collected: ${this._collectedPostUrls.size} post URLs`);
  }

  async getPostUrlsFromPage() {
    const maxAgeMinutes = (this.settings.maxPostAge && this.settings.maxPostAge > 0)
      ? this.settings.maxPostAge : 60;
    this.log('info', `⏱️ Post time filter: ≤${maxAgeMinutes} min`);

    // scrollToLoadFeed এ collect করা URLs use করো
    const collectedUrls = this._collectedPostUrls
      ? Array.from(this._collectedPostUrls)
      : [];
    this.logger.info(`[GROUP] Collected URLs from scroll: ${collectedUrls.length}`);

    // Current group ID বের করো
    const currentGroupId = await this.page.evaluate(() => {
      const m = window.location.href.match(/facebook\.com\/groups\/([^/?#]+)/);
      return m ? m[1] : null;
    });
    this.logger.info(`[GROUP] Current group ID: ${currentGroupId}`);

    // Group ID দিয়ে filter
    const groupUrls = currentGroupId
      ? collectedUrls.filter(u => u.includes(`/groups/${currentGroupId}/`) || u.includes(`/groups/${currentGroupId}?`))
      : collectedUrls;

    // Fallback: group filter এ কিছু না পেলে সব group post নাও
    const finalUrls = groupUrls.length > 0
      ? groupUrls
      : collectedUrls.filter(u => u.includes('/groups/'));

    this.logger.info(`[GROUP] After group filter: ${finalUrls.length} URLs`);

    // Time detection এর জন্য page এ যাওয়া দরকার — কিন্তু virtualization এর কারণে
    // এখন page এ আর সব posts নেই।
    // তাই: collected URLs কে সরাসরি return করো, time filter skip করো
    // (user এর maxPostAge setting অনুযায়ী filter করা যাবে না এই ক্ষেত্রে)
    if (finalUrls.length > 0) {
      this.log('info', `✅ ${finalUrls.length} post URL(s) collected from scroll`);
      this._collectedPostUrls = new Set(); // reset
      return finalUrls;
    }

    // Collected URLs নেই — page এ যা আছে তা দিয়ে চেষ্টা করো
    this.logger.info('[GROUP] No collected URLs, scanning current DOM...');
    try { await this.page.waitForLoadState('networkidle', { timeout: 5000 }); } catch (e) { }
    await this.sleep(2000);

    const result = await this.page.evaluate((params) => {
      const { maxMins, groupId } = params;
      const logs = [];
      const nowMs = Date.now();
      const nowSec = nowMs / 1000;

      // ── Bengali → Arabic ──
      function bnToAr(s) {
        const map = { '০': '0', '১': '1', '২': '2', '৩': '3', '৪': '4', '৫': '5', '৬': '6', '৭': '7', '৮': '8', '৯': '9' };
        return (s || '').replace(/[০-৯]/g, c => map[c] || c);
      }

      // ── Time string → minutes ──
      function toMin(raw) {
        if (!raw) return null;
        const s = bnToAr(raw).trim().toLowerCase();

        // Bengali
        if (/এখন|এখনই|এইমাত্র/.test(raw)) return 0;
        if (/সেকেন্ড/.test(raw)) return 0;
        const bm = bnToAr(raw).match(/(\d+)\s*(মি\.|মিনিট)/);
        if (bm) return +bm[1];
        const bh = bnToAr(raw).match(/(\d+)\s*(ঘণ্টা|ঘন্টা)/);
        if (bh) return +bh[1] * 60;

        // just now / seconds
        if (/^(just\s*now|now)$/.test(s)) return 0;
        if (/^\d+\s*s(ec(ond)?s?)?(?:\s+ago)?$/.test(s)) return 0;

        // Short: "4m" "2h" "1d" "3w"
        const short = s.match(/^(\d+)([smhdw])$/);
        if (short) {
          const n = +short[1], u = short[2];
          if (u === 's') return 0;
          if (u === 'm') return n;
          if (u === 'h') return n * 60;
          if (u === 'd') return n * 1440;
          if (u === 'w') return n * 10080;
        }

        // Minutes
        const mm = s.match(/^(\d+)\s*m(?:in(?:ute)?s?)?(?:\s+ago)?$/);
        if (mm) return +mm[1];

        // Hours
        const hh = s.match(/^(\d+)\s*h(?:r|our)?s?(?:\s+ago)?$/);
        if (hh) return +hh[1] * 60;

        // Days
        const dd = s.match(/^(\d+)\s*days?(?:\s+ago)?$/);
        if (dd) return +dd[1] * 1440;

        // Weeks
        const ww = s.match(/^(\d+)\s*weeks?(?:\s+ago)?$/);
        if (ww) return +ww[1] * 10080;

        // "about an hour ago" / "an hour ago"
        if (/^(?:about\s+)?an?\s+hour(?:\s+ago)?$/.test(s)) return 60;

        // "about X hours ago"
        const abh = s.match(/^(?:about\s+)?(\d+)\s*hours?(?:\s+ago)?$/);
        if (abh) return +abh[1] * 60;

        // "a day ago"
        if (/^(?:about\s+)?a\s+day(?:\s+ago)?$/.test(s)) return 1440;

        // "a week ago"
        if (/^(?:about\s+)?a\s+week(?:\s+ago)?$/.test(s)) return 10080;

        // "yesterday at 3:45 PM"
        const yest = s.match(/yesterday\s+at\s+(\d+):(\d+)\s*(am|pm)/);
        if (yest) {
          let h = +yest[1], mi = +yest[2];
          if (yest[3] === 'pm' && h !== 12) h += 12;
          if (yest[3] === 'am' && h === 12) h = 0;
          const d = new Date(nowMs); d.setDate(d.getDate() - 1); d.setHours(h, mi, 0, 0);
          return Math.floor((nowMs - d) / 60000);
        }

        // "Monday at 3:45 PM"
        const days = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
        const dayAt = s.match(/^(sunday|monday|tuesday|wednesday|thursday|friday|saturday)\s+at\s+(\d+):(\d+)\s*(am|pm)/);
        if (dayAt) {
          const td = days.indexOf(dayAt[1]);
          let h = +dayAt[2], mi = +dayAt[3];
          if (dayAt[4] === 'pm' && h !== 12) h += 12;
          if (dayAt[4] === 'am' && h === 12) h = 0;
          const now = new Date(nowMs);
          let diff = now.getDay() - td; if (diff < 0) diff += 7;
          const d = new Date(nowMs); d.setDate(d.getDate() - diff); d.setHours(h, mi, 0, 0);
          return Math.floor((nowMs - d) / 60000);
        }

        // "March 15 at 2:30 PM"
        const months = ['january', 'february', 'march', 'april', 'may', 'june', 'july', 'august', 'september', 'october', 'november', 'december'];
        const monAt = s.match(/(january|february|march|april|may|june|july|august|september|october|november|december)\s+(\d{1,2})(?:,?\s*(\d{4}))?\s+at\s+(\d+):(\d+)\s*(am|pm)/);
        if (monAt) {
          const mo = months.indexOf(monAt[1]), day = +monAt[2], yr = monAt[3] ? +monAt[3] : new Date(nowMs).getFullYear();
          let h = +monAt[4], mi = +monAt[5];
          if (monAt[6] === 'pm' && h !== 12) h += 12;
          if (monAt[6] === 'am' && h === 12) h = 0;
          return Math.floor((nowMs - new Date(yr, mo, day, h, mi, 0)) / 60000);
        }
        return null;
      }

      // ── aria-labelledby → hidden span text (canvas obfuscation fix) ──
      function labelledByTime(el) {
        if (!el) return null;
        const lblId = el.getAttribute && el.getAttribute('aria-labelledby');
        if (lblId) {
          const lbl = document.getElementById(lblId);
          if (lbl) { const m = toMin((lbl.textContent || '').trim()); if (m !== null) return { age: m, method: 'labelledby' }; }
        }
        const children = el.querySelectorAll && el.querySelectorAll('[aria-labelledby]');
        if (children) {
          for (const c of children) {
            const cid = c.getAttribute('aria-labelledby');
            if (!cid) continue;
            const lbl = document.getElementById(cid);
            if (!lbl) continue;
            const m = toMin((lbl.textContent || '').trim());
            if (m !== null) return { age: m, method: 'child-labelledby' };
          }
        }
        return null;
      }

      // ── Full element scan ──
      function scanForTime(el) {
        if (!el) return null;
        // 1. aria-labelledby (canvas obfuscation — most important)
        const lb = labelledByTime(el); if (lb) return lb;
        // 2. data-utime
        const ut = el.getAttribute && el.getAttribute('data-utime');
        if (ut) { const t = parseInt(ut); if (t > 0) return { age: Math.floor((nowSec - t) / 60), method: 'data-utime' }; }
        const utc = el.querySelector && el.querySelector('[data-utime]');
        if (utc) { const t = parseInt(utc.getAttribute('data-utime')); if (t > 0) return { age: Math.floor((nowSec - t) / 60), method: 'data-utime-child' }; }
        // 3. aria-label self
        const aria = el.getAttribute && el.getAttribute('aria-label') || '';
        if (aria) { const m = toMin(aria); if (m !== null) return { age: m, method: 'aria-self' }; }
        // 4. title self
        const title = el.getAttribute && el.getAttribute('title') || '';
        if (title) { const m = toMin(title); if (m !== null) return { age: m, method: 'title-self' }; }
        // 5. text self (leaf)
        if ((el.childElementCount || 0) <= 1) {
          const txt = (el.innerText || el.textContent || '').trim();
          if (txt && txt.length <= 50) { const m = toMin(txt); if (m !== null) return { age: m, method: 'text-self' }; }
        }
        // 6. children scan
        const allC = el.querySelectorAll && el.querySelectorAll('*') || [];
        for (const c of allC) {
          const ca = c.getAttribute && c.getAttribute('aria-label') || '';
          if (ca && ca.length <= 80) { const m = toMin(ca); if (m !== null) return { age: m, method: 'aria-child' }; }
          const ct = c.getAttribute && c.getAttribute('title') || '';
          if (ct && ct.length >= 3 && ct.length <= 60) { const m = toMin(ct); if (m !== null) return { age: m, method: 'title-child' }; }
          if ((c.childElementCount || 0) <= 1) {
            const ctxt = (c.innerText || c.textContent || '').trim();
            if (ctxt && ctxt.length <= 50) { const m = toMin(ctxt); if (m !== null) return { age: m, method: 'text-child' }; }
          }
        }
        return null;
      }

      // ── React Fiber ──
      function fiberAge(el) {
        try {
          const key = Object.keys(el).find(k => k.startsWith('__reactFiber') || k.startsWith('__reactInternalInstance'));
          if (!key) return null;
          let fiber = el[key];
          for (let i = 0; i < 60 && fiber; i++) {
            const p = fiber.memoizedProps || fiber.pendingProps || {};
            for (const f of ['creation_time', 'publish_time', 'story_time', 'created_time', 'timestamp']) {
              if (typeof p[f] === 'number' && p[f] > 1000000000)
                return { age: Math.floor((nowSec - p[f]) / 60), method: 'fiber' };
            }
            if (p.story?.creation_time) return { age: Math.floor((nowSec - p.story.creation_time) / 60), method: 'fiber-story' };
            if (p.node?.creation_time) return { age: Math.floor((nowSec - p.node.creation_time) / 60), method: 'fiber-node' };
            fiber = fiber.return;
          }
        } catch (e) { }
        return null;
      }

      function isPostHref(href) {
        if (!href || !href.includes('facebook.com')) return false;
        if (href.includes('/photos/') || href.includes('/videos/') || href.includes('/events/')) return false;
        if (href.includes('/about') || href.includes('/members/') || href.includes('/user/')) return false;
        if (href.includes('/files/') || href.includes('/announcements') || href.includes('/media/')) return false;
        if (href.includes('/search') || href.includes('/permalink/likes')) return false;
        // /posts/ OR /permalink/ (group post format) OR story_fbid OR pfbid
        return href.includes('/posts/') || href.includes('/permalink/') ||
          href.includes('story_fbid') || href.includes('pfbid');
      }

      function cleanUrl(href) {
        return href.split('?')[0].split('#')[0].replace(/\/$/, '');
      }

      // groupId match: numeric id OR slug name
      function matchesGroup(href) {
        if (!groupId) return true;
        return href.includes(`/groups/${groupId}/`) ||
          href.includes(`/groups/${groupId}?`);
      }

      // Loose match: just /groups/ যেকোনো post (groupId filter fail হলে fallback)
      function isAnyGroupPostHref(href) {
        return isPostHref(href) && href.includes('/groups/');
      }

      // ════════════════════════════════════
      // MAIN: role="article" based
      // ════════════════════════════════════
      const allArticles = Array.from(document.querySelectorAll('[role="article"]'));
      const rootArticles = allArticles.filter(a => {
        let p = a.parentElement;
        while (p && p !== document.body) {
          if (p.getAttribute && p.getAttribute('role') === 'article') return false;
          p = p.parentElement;
        }
        return true;
      });
      logs.push(`articles=${rootArticles.length} groupId=${groupId}`);

      const posts = [];
      const seenUrls = new Set();

      for (const article of rootArticles) {
        const allPostLinks = Array.from(article.querySelectorAll('a[href]'))
          .filter(a => isPostHref(a.href));

        if (!allPostLinks.length) continue;

        // group filter: exact groupId match
        let groupLinks = groupId ? allPostLinks.filter(a => matchesGroup(a.href)) : allPostLinks;

        // Fallback: groupId match না হলে /groups/ যেকোনো post link নাও
        if (!groupLinks.length && allPostLinks.length > 0) {
          const looseLinks = allPostLinks.filter(a => isAnyGroupPostHref(a.href));
          if (looseLinks.length) {
            logs.push(`  loose-match: ${looseLinks.length} group post link(s)`);
            groupLinks = looseLinks;
          } else {
            logs.push(`  skip: no group links (${allPostLinks.length} post links, groupId=${groupId})`);
            continue;
          }
        }
        if (!groupLinks.length) continue;

        const url = cleanUrl(groupLinks[0].href);
        if (seenUrls.has(url)) continue;
        seenUrls.add(url);

        let res = null;
        // Strategy 1: Fiber
        if (!res) res = fiberAge(article);
        // Strategy 2: Timestamp link (?__cft__ pattern)
        if (!res) {
          const tsLinks = allPostLinks.filter(a => a.href.includes('?'));
          for (const l of tsLinks) { res = scanForTime(l); if (res) break; }
        }
        // Strategy 3: All group links
        if (!res) {
          for (const l of groupLinks) { res = scanForTime(l); if (res) break; }
        }
        // Strategy 4: Article children
        if (!res) {
          for (const c of Array.from(article.children)) { res = scanForTime(c); if (res) break; }
        }
        // Strategy 5: Full article
        if (!res) res = scanForTime(article);

        const age = res ? res.age : null;
        logs.push(`  [${res ? res.method : '?'}] ${age !== null ? age + 'm' : '?'} | ${url}`);
        posts.push({ url, ageMinutes: age });
      }

      // ════════════════════════════════════
      // FALLBACK: link scan (articles=0 বা সব filter হলে)
      // ════════════════════════════════════
      if (posts.length === 0) {
        logs.push('FALLBACK: link scan');
        const allLinks = Array.from(document.querySelectorAll('a[href]')).filter(a => isPostHref(a.href));
        logs.push(`  total post links: ${allLinks.length}`);
        const groupLinks = groupId ? allLinks.filter(a => matchesGroup(a.href)) : allLinks;
        logs.push(`  group-matched links: ${groupLinks.length}`);
        const seen2 = new Set();
        for (const a of groupLinks) {
          const url = cleanUrl(a.href);
          if (seen2.has(url)) continue;
          seen2.add(url);
          let res = null, node = a;
          for (let lvl = 0; lvl < 20 && node && node !== document.body; lvl++) {
            res = scanForTime(node);
            if (res) { res.method = `walk${lvl}-${res.method}`; break; }
            node = node.parentElement;
          }
          const age = res ? res.age : null;
          logs.push(`  [${res ? res.method : '?'}] ${age !== null ? age + 'm' : '?'} | ${url}`);
          posts.push({ url, ageMinutes: age });
        }
      }

      // Time filter
      const recent = posts.filter(p => p.ageMinutes !== null && p.ageMinutes <= maxMins);
      recent.sort((a, b) => a.ageMinutes - b.ageMinutes);

      // ── IMPORTANT: time detect না হলে সব post দাও ──
      // Better to comment on an old post than skip entirely
      const undetected = posts.filter(p => p.ageMinutes === null);
      const detected = posts.length - undetected.length;
      logs.push(`RESULT: total=${posts.length} detected=${detected} within_${maxMins}m=${recent.length} undetected=${undetected.length}`);

      // recent আছে → recent ফেরত দাও
      // recent নেই কিন্তু undetected আছে → undetected দাও (time বোঝা যায়নি)
      // দুটোই নেই → empty
      const finalList = recent.length > 0 ? recent.map(p => p.url) :
        undetected.length > 0 ? undetected.map(p => p.url) : [];

      return { urls: finalList, logs, maxMins, total: posts.length, detected, recentCount: recent.length, undetectedCount: undetected.length };
    }, { maxMins: maxAgeMinutes, groupId: currentGroupId });

    result.logs.forEach(l => this.logger.info(`[GROUP] ${l}`));
    this.logger.info(`[GROUP] total=${result.total} detected=${result.detected} recent=${result.recentCount} undetected=${result.undetectedCount}`);

    if (result.urls.length > 0) {
      if (result.recentCount > 0) {
        this.log('info', `✅ ${result.recentCount} post(s) within ${result.maxMins}m`);
      } else {
        this.log('warning', `⚠️ Time undetected — using ${result.undetectedCount} post(s) anyway`);
      }
      return result.urls;
    }

    this.log('warning', `⚠️ No posts found on page. Skipping.`);
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
    const final = template;
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
      if (this.settings.autoDeletePendingGroup !== false && this.settings.autoDeletePendingGroup !== undefined ? this.settings.autoDeletePendingGroup : this.settings.autoDeletePending) {
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
      // Wait exactly 5 seconds after comment before hovering
      this.logger.info('[GROUP] Waiting 5s after comment before reacting...');
      await this.sleep(5000);
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
    const letters = 'abcdefghijklmnopqrstuvwxyz';
    const length = Math.floor(Math.random() * 4) + 4; // random length: 4 to 7
    let word = '';
    for (let i = 0; i < length; i++) {
      word += letters[Math.floor(Math.random() * letters.length)];
    }
    return word;
  }

  async getTemplateComment() {
    const templates = this.db.getTemplates(this.account.id);
    if (!templates.length) return this.getRandomStarter();
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