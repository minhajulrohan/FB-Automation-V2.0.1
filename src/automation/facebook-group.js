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

  /**
   * Group URL এ navigate করে
   */
  async navigateToGroup(groupUrl) {
    this.logger.info(`Navigating to group: ${groupUrl}`);

    await this.page.goto(groupUrl, {
      waitUntil: 'domcontentloaded',
      timeout: 60000
    });

    await this.randomDelay(3000, 5000);
    await this.checkForRestrictions();
  }

  /**
   * Smooth scroll করে group feed এ
   */
  async smoothScrollFeed(scrollCount = 5) {
    this.logger.info('Smooth scrolling group feed...');

    for (let i = 0; i < scrollCount; i++) {
      // Random scroll amount per step - human-like
      const scrollAmount = Math.floor(Math.random() * 300) + 200;

      await this.page.evaluate((amount) => {
        window.scrollBy({
          top: amount,
          left: 0,
          behavior: 'smooth'
        });
      }, scrollAmount);

      // Small delay between scrolls
      await this.randomDelay(800, 1500);
    }

    this.logger.info('Smooth scroll complete');
  }

  /**
   * Recent posts খুঁজে (1 hour ago বা কম সময়ের মধ্যে)
   * Posts এর timestamp চেক করে সবচেয়ে recent গুলো return করে
   */
  async findRecentPosts(maxAgeHours = 1) {
    this.logger.info(`Looking for posts within last ${maxAgeHours} hour(s)...`);

    // Scroll করে posts load করি
    await this.smoothScrollFeed(3);
    await this.randomDelay(2000, 3000);

    // Page থেকে post links এবং timestamps খুঁজি
    const posts = await this.page.evaluate((maxAge) => {
      const result = [];
      const now = Date.now();
      const maxAgeMs = maxAge * 60 * 60 * 1000; // hours to ms

      // Possible post link selectors for Facebook groups
      const postSelectors = [
        'a[href*="/groups/"][href*="/posts/"]',
        'a[href*="/groups/"][href*="?id="]',
        'a[href*="permalink"]',
      ];

      // Time selectors - Facebook shows time on posts
      const timeSelectors = [
        'abbr[data-utime]',
        'span[data-utime]',
        'abbr[title]',
        'a[aria-label*="ago"]',
        'span[aria-label*="ago"]',
        'a[aria-label*="hour"]',
        'span[aria-label*="hour"]',
        'a[aria-label*="minute"]',
        'span[aria-label*="minute"]',
      ];

      // Get all post containers
      const postContainers = document.querySelectorAll(
        '[data-pagelet*="GroupFeed"] div[role="article"], ' +
        'div[role="feed"] > div, ' +
        '[data-testid="fbfeed_story"], ' +
        'div[class*="userContentWrapper"]'
      );

      const seen = new Set();

      postContainers.forEach(container => {
        // Try to find timestamp in this container
        let postTime = null;
        let postUrl = null;

        // Look for data-utime (Unix timestamp)
        const timeEl = container.querySelector('abbr[data-utime], span[data-utime]');
        if (timeEl) {
          const utime = parseInt(timeEl.getAttribute('data-utime'));
          if (utime) postTime = utime * 1000; // convert to ms
        }

        // Fallback: look for aria-label with time info
        if (!postTime) {
          for (const sel of ['a[aria-label*="ago"]', 'span[aria-label*="ago"]']) {
            const el = container.querySelector(sel);
            if (el) {
              const label = el.getAttribute('aria-label') || '';
              // Parse "X minutes ago" or "X hours ago"
              const minuteMatch = label.match(/(\d+)\s*minute/i);
              const hourMatch = label.match(/(\d+)\s*hour/i);
              const secondMatch = label.match(/(\d+)\s*second/i);
              if (secondMatch) {
                postTime = now - (parseInt(secondMatch[1]) * 1000);
              } else if (minuteMatch) {
                postTime = now - (parseInt(minuteMatch[1]) * 60 * 1000);
              } else if (hourMatch) {
                postTime = now - (parseInt(hourMatch[1]) * 60 * 60 * 1000);
              }
              if (postTime) break;
            }
          }
        }

        // Find post URL link
        for (const sel of postSelectors) {
          const linkEl = container.querySelector(sel);
          if (linkEl) {
            postUrl = linkEl.href;
            break;
          }
        }

        // Fallback: find any unique post link
        if (!postUrl) {
          const links = container.querySelectorAll('a[href*="facebook.com"]');
          for (const link of links) {
            const href = link.href;
            if ((href.includes('/posts/') || href.includes('story_fbid') || href.includes('pfbid')) && !seen.has(href)) {
              postUrl = href;
              break;
            }
          }
        }

        if (postUrl && !seen.has(postUrl)) {
          seen.add(postUrl);

          // Check if within maxAge
          let isRecent = false;
          if (postTime) {
            const ageMs = now - postTime;
            isRecent = ageMs <= maxAgeMs;
          }

          result.push({
            url: postUrl,
            isRecent: isRecent,
            postTime: postTime,
            ageMinutes: postTime ? Math.floor((now - postTime) / 60000) : null
          });
        }
      });

      return result;
    }, maxAgeHours);

    const recentPosts = posts.filter(p => p.isRecent);
    this.logger.info(`Found ${posts.length} total posts, ${recentPosts.length} within ${maxAgeHours} hour(s)`);

    // Log age info
    recentPosts.forEach(p => {
      this.logger.info(`Recent post: ${p.url} (${p.ageMinutes} min ago)`);
    });

    return recentPosts;
  }

  /**
   * একটি post এ comment করে (post URL এ navigate করে)
   * @param {string} postUrl - Post এর URL
   * @param {string} commentText - Comment text
   */
  async commentOnPost(postUrl, commentText) {
    this.logger.info(`Navigating to post for commenting: ${postUrl}`);

    await this.page.goto(postUrl, {
      waitUntil: 'domcontentloaded',
      timeout: 30000
    });

    await this.randomDelay(3000, 5000);
    await this.checkForRestrictions();

    // Scroll down একটু
    await this.page.evaluate(() => {
      window.scrollBy({ top: 300, behavior: 'smooth' });
    });
    await this.randomDelay(1500, 2500);

    // Comment box খুঁজে type করা
    const commentBoxSelectors = [
      'div[aria-label="Write a comment"][role="textbox"]',
      'div[aria-label="Write a comment..."][role="textbox"]',
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

    // If not found, try clicking to reveal
    if (!commentBox) {
      const clickSelectors = [
        'div[aria-label="Write a comment"]',
        'div[aria-label="Write a comment..."]',
        'span:text("Write a comment")',
        'div:text("Write a comment")'
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

    // Click comment box
    await commentBox.click();
    await this.randomDelay(500, 1000);

    // Type comment character by character (human-like)
    for (const char of commentText) {
      await this.page.keyboard.type(char, { delay: Math.random() * 80 + 30 });
    }

    await this.randomDelay(1000, 2000);

    // Submit comment (Enter)
    await this.page.keyboard.press('Enter');
    await this.randomDelay(2000, 3000);

    this.logger.info(`Comment submitted: "${commentText}"`);
    return { success: true };
  }

  /**
   * Restriction/checkpoint check
   */
  async checkForRestrictions() {
    const restrictionText = await this.page.evaluate(() => {
      const text = document.body.innerText.toLowerCase();
      return {
        checkpoint: text.includes('checkpoint') || text.includes('verify your identity'),
        restricted: text.includes('restricted') || text.includes('temporarily blocked'),
        disabled: text.includes('account disabled') || text.includes('account suspended')
      };
    });

    if (restrictionText.checkpoint || restrictionText.restricted || restrictionText.disabled) {
      throw new Error('Account checkpoint or restriction detected');
    }
  }

  /**
   * Random delay helper
   */
  randomDelay(min, max) {
    const ms = Math.floor(Math.random() * (max - min + 1)) + min;
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

module.exports = FacebookGroupAutomator;
