/**
 * FacebookGroupAutomator
 * Facebook Group এ navigate করে, smooth scroll করে recent posts খুঁজে, comment করে
 */
class FacebookGroupAutomator {
  constructor(page, db, logger, sendToRenderer) {
    this.page = page;
    this.db = db;
    this.logger = logger;
    this.sendToRenderer = sendToRenderer;
  }

  async navigateToGroup(groupUrl) {
    this.logger.info(`Navigating to group: ${groupUrl}`);
    await this.page.goto(groupUrl, { waitUntil: 'domcontentloaded', timeout: 60000 });
    await this.randomDelay(3000, 5000);
    await this.checkForRestrictions();
  }

  async smoothScrollFeed(scrollCount = 5) {
    this.logger.info('Smooth scrolling group feed...');
    for (let i = 0; i < scrollCount; i++) {
      const scrollAmount = Math.floor(Math.random() * 300) + 200;
      await this.page.evaluate((amount) => {
        window.scrollBy({ top: amount, left: 0, behavior: 'smooth' });
      }, scrollAmount);
      await this.randomDelay(800, 1500);
    }
    this.logger.info('Smooth scroll complete');
  }

  /**
   * Recent posts খুঁজে
   *
   * নতুন approach:
   * - Selector এর উপর নির্ভর না করে সরাসরি সব <a> tag scan করে
   * - Post pattern URL গুলো collect করে (pfbid, /posts/, story_fbid)
   * - প্রতিটা link এর parent এ উঠে time text খোঁজে
   * - Random 1-59 minute filter apply করে
   * - Fallback: time না পেলে top 3 posts দেয়
   */
  async findRecentPosts() {
    // প্রতিবার random minute limit — 1 to 59
    const maxAgeMinutes = Math.floor(Math.random() * 59) + 1;
    this.logger.info(`[findRecentPosts] Random age limit: ${maxAgeMinutes} minute(s)`);

    await this.smoothScrollFeed(3);
    await this.randomDelay(2000, 3000);

    const data = await this.page.evaluate((maxMins) => {
      const logs = [];

      // Bengali numeral → Arabic
      function bnToAr(s) {
        const m = { '০': '0', '১': '1', '২': '2', '৩': '3', '৪': '4', '৫': '5', '৬': '6', '৭': '7', '৮': '8', '৯': '9' };
        return (s || '').replace(/[০-৯]/g, c => m[c] || c);
      }

      // Time string → minutes
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

      // Valid post URL check
      function isPostHref(href) {
        if (!href || !href.includes('facebook.com')) return false;
        if (href.includes('comment_id=') || href.includes('notif_id=')) return false;
        if (href.includes('ref=notif') || href.includes('__cft__')) return false;
        if (href.includes('#')) return false;
        if (href.includes('/photos/') || href.includes('/videos/')) return false;
        if (href.includes('/events/') || href.includes('/members/')) return false;
        if (href.includes('/comment/') || href.includes('/permalink/likes')) return false;
        return href.includes('/posts/') || href.includes('story_fbid') || href.includes('pfbid');
      }

      function cleanUrl(href) {
        return href.split('?')[0].split('#')[0].replace(/\/$/, '');
      }

      // Debug: DOM structure
      logs.push(`DOM articles=${document.querySelectorAll('[role="article"]').length} | feeds=${document.querySelectorAll('[role="feed"]').length}`);

      // সব post pattern links collect করো — কোনো container selector নয়
      const allLinks = Array.from(document.querySelectorAll('a[href]'))
        .filter(a => isPostHref(a.href));

      logs.push(`Post-pattern links found: ${allLinks.length}`);

      // Unique URLs
      const seen = new Set();
      const uniqueLinks = [];
      for (const a of allLinks) {
        const url = cleanUrl(a.href);
        if (!seen.has(url)) {
          seen.add(url);
          uniqueLinks.push({ url, el: a });
        }
      }
      logs.push(`Unique post URLs: ${uniqueLinks.length}`);

      // প্রতিটা link এর কাছে time খোঁজো
      const posts = [];

      for (const { url, el } of uniqueLinks) {
        let ageMinutes = null;
        let node = el.parentElement;
        let level = 0;

        while (node && node !== document.body && level < 15) {
          // innerText candidates — leaf/near-leaf elements
          const candidates = Array.from(node.querySelectorAll('a, span, abbr')).concat([node]);
          for (const c of candidates) {
            if (c.childElementCount > 3) continue;
            const txt = (c.innerText || c.textContent || '').trim();
            if (!txt || txt.length > 25) continue;
            const mins = toMin(txt);
            if (mins !== null) { ageMinutes = mins; break; }
          }

          // aria-label check
          if (ageMinutes === null) {
            const ariaEls = node.querySelectorAll('[aria-label]');
            for (const ar of ariaEls) {
              const lbl = ar.getAttribute('aria-label') || '';
              if (/minute|hour|second|ago|just now|মি\.|ঘণ্টা|এখন/i.test(lbl)) {
                const mins = toMin(lbl);
                if (mins !== null) { ageMinutes = mins; break; }
              }
            }
          }

          // data-utime check
          if (ageMinutes === null) {
            const ut = node.querySelector('[data-utime]');
            if (ut) {
              const utime = parseInt(ut.getAttribute('data-utime'));
              if (utime) ageMinutes = Math.floor((Date.now() / 1000 - utime) / 60);
            }
          }

          if (ageMinutes !== null) break;
          node = node.parentElement;
          level++;
        }

        posts.push({ url, ageMinutes });
      }

      // Filter by time
      const recent = posts.filter(p => p.ageMinutes !== null && p.ageMinutes <= maxMins);
      recent.sort((a, b) => a.ageMinutes - b.ageMinutes);

      const unknownTime = posts.filter(p => p.ageMinutes === null);
      const fallback = posts.slice(0, 3);

      logs.push(`Recent (≤${maxMins}m): ${recent.length} | Unknown time: ${unknownTime.length}`);
      recent.forEach(p => logs.push(`  ✅ ${p.ageMinutes}m ago | ${p.url}`));

      return { recent, fallback, unknownTime, posts, logs, maxMins };
    }, maxAgeMinutes);

    // Log everything
    data.logs.forEach(l => this.logger.info(`[findRecentPosts] ${l}`));

    // Recent posts পাওয়া গেলে
    if (data.recent.length > 0) {
      this.logger.info(`[findRecentPosts] ✅ Returning ${data.recent.length} recent post(s)`);
      // url field থেকে object তৈরি করো যেটা caller expect করে
      return data.recent.map(p => ({ url: p.url, isRecent: true, ageMinutes: p.ageMinutes }));
    }

    // Time detect হয়নি কিন্তু posts আছে → fallback
    if (data.unknownTime.length > 0 && data.fallback.length > 0) {
      this.logger.info(`[findRecentPosts] ⚠️ Time unknown — fallback top ${data.fallback.length} post(s)`);
      return data.fallback.map(p => ({ url: p.url, isRecent: false, ageMinutes: null }));
    }

    this.logger.info(`[findRecentPosts] ❌ No posts found`);
    return [];
  }

  async commentOnPost(postUrl, commentText) {
    this.logger.info(`Navigating to post for commenting: ${postUrl}`);

    await this.page.goto(postUrl, { waitUntil: 'domcontentloaded', timeout: 30000 });
    await this.randomDelay(3000, 5000);
    await this.checkForRestrictions();

    await this.page.evaluate(() => {
      window.scrollBy({ top: 300, behavior: 'smooth' });
    });
    await this.randomDelay(1500, 2500);

    const commentBoxSelectors = [
      'div[aria-label="Write a comment"][role="textbox"]',
      'div[aria-label="Write a comment…"][role="textbox"]',
      'div[aria-label="Write a comment..."][role="textbox"]',
      'div[aria-label="Write a public comment…"][role="textbox"]',
      'div[contenteditable="true"][aria-label*="comment" i]',
      'div[contenteditable="true"][data-lexical-editor="true"]',
      'div[contenteditable="true"][role="textbox"]',
      'div.notranslate[contenteditable="true"]'
    ];

    let commentBox = null;

    for (const selector of commentBoxSelectors) {
      try {
        commentBox = await this.page.$(selector);
        if (commentBox) {
          this.logger.info(`Found comment box: ${selector}`);
          break;
        }
      } catch (e) { continue; }
    }

    if (!commentBox) {
      const clickSelectors = [
        'div[aria-label="Write a public comment…"]',
        'div[aria-label="Write a comment"]',
        'div[aria-label="Write a comment…"]',
        'div[aria-label="Write a comment..."]',
      ];

      for (const selector of clickSelectors) {
        try {
          await this.page.click(selector, { timeout: 3000 });
          await this.randomDelay(1500, 2500);
          for (const boxSelector of commentBoxSelectors) {
            commentBox = await this.page.$(boxSelector);
            if (commentBox) break;
          }
          if (commentBox) break;
        } catch (e) { continue; }
      }
    }

    if (!commentBox) {
      this.logger.error('Comment box not found on post');
      return { success: false, error: 'Comment box not found' };
    }

    await commentBox.click();
    await this.randomDelay(500, 1000);

    for (const char of commentText) {
      await this.page.keyboard.type(char, { delay: Math.random() * 80 + 30 });
    }

    await this.randomDelay(1000, 2000);
    await this.page.keyboard.press('Enter');
    await this.randomDelay(2000, 3000);

    this.logger.info(`Comment submitted: "${commentText}"`);
    return { success: true };
  }

  async checkForRestrictions() {
    const r = await this.page.evaluate(() => {
      const text = document.body.innerText.toLowerCase();
      return {
        checkpoint: text.includes('checkpoint') || text.includes('verify your identity'),
        restricted: text.includes('restricted') || text.includes('temporarily blocked'),
        disabled: text.includes('account disabled') || text.includes('account suspended')
      };
    });
    if (r.checkpoint || r.restricted || r.disabled) {
      throw new Error('Account checkpoint or restriction detected');
    }
  }

  randomDelay(min, max) {
    const ms = Math.floor(Math.random() * (max - min + 1)) + min;
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

module.exports = FacebookGroupAutomator;
