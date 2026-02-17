const { chromium } = require('playwright');
const FacebookAutomator = require('./facebook');
const CommentMutator = require('../utils/mutator');
const CookieFixer = require('../utils/cookie-fixer');

class AutomationWorker {
  constructor(account, posts, settings, db, logger, sendToRenderer) {
    this.account = account;
    this.posts = posts;
    this.settings = settings;
    this.db = db;
    this.logger = logger;
    this.sendToRenderer = sendToRenderer;
    this.browser = null;
    this.context = null;
    this.page = null;
    this.fbAutomator = null;
    this.mutator = new CommentMutator();

    // Random comment starters for initial comment
    this.randomStarters = [
      'Interesting!',
      'Nice one!',
      'Great!',
      'Wow!',
      'Cool!',
      'Awesome!',
      'Good!',
      'Nice!',
      'Love it!',
      'Amazing!'
    ];
  }

  async run() {
    try {
      this.logger.info(`========================================`);
      this.logger.info(`STARTING: Account ${this.account.name}`);
      this.logger.info(`Posts to process: ${this.posts.length}`);
      this.logger.info(`========================================`);

      await this.initBrowser();
      await this.processPosts();

      this.logger.info(`========================================`);
      this.logger.info(`COMPLETED: Account ${this.account.name}`);
      this.logger.info(`Browser will now close`);
      this.logger.info(`========================================`);
    } finally {
      await this.cleanup();
    }
  }

  async initBrowser() {
    this.logger.info(`Initializing browser for ${this.account.name}`);

    // ── Device profile resolution ──────────────────────────────────────────
    // deviceProfile is saved with the account at add-time from the UA generator
    const profile = this.account.deviceProfile || {};
    const deviceType = profile.type || 'windows-chrome';

    // Resolve viewport — use saved profile or derive from UA type
    let viewportW = profile.viewportW || 1920;
    let viewportH = profile.viewportH || 1080;
    let platform = profile.platform || 'Win32';

    // Fallback: derive from UA string if deviceProfile not saved (older accounts)
    if (!this.account.deviceProfile && this.account.userAgent) {
      const ua = this.account.userAgent;
      if (ua.includes('iPad')) {
        viewportW = 1366; viewportH = 768; platform = 'iPad';
      } else if (ua.includes('Macintosh')) {
        viewportW = 1440; viewportH = 900; platform = 'MacIntel';
      } else {
        viewportW = 1920; viewportH = 1080; platform = 'Win32';
      }
    }

    const accountUserAgent = this.account.userAgent ||
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/132.0.0.0 Safari/537.36';

    this.logger.info(`Device: ${deviceType} | Viewport: ${viewportW}x${viewportH} | Platform: ${platform}`);
    this.logger.info(`UA: ${accountUserAgent.substring(0, 90)}...`);

    const launchOptions = {
      headless: this.settings.headless,
      args: [
        '--disable-blink-features=AutomationControlled',
        '--disable-dev-shm-usage',
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-web-security',
        `--window-size=${viewportW},${viewportH}`,
        '--force-device-scale-factor=1'
      ]
    };

    if (this.account.proxy) {
      launchOptions.proxy = { server: this.account.proxy };
      this.logger.info(`Proxy: ${this.account.proxy}`);
    }

    this.browser = await chromium.launch(launchOptions);

    const contextOptions = {
      viewport: { width: viewportW, height: viewportH },
      screen: { width: viewportW, height: viewportH },
      userAgent: accountUserAgent,
      locale: 'en-US',
      timezoneId: 'America/New_York',
      deviceScaleFactor: 1,
      isMobile: false,
      hasTouch: false
    };

    this.context = await this.browser.newContext(contextOptions);

    // Inject per-device fingerprint to match the UA profile exactly
    const injectViewportW = viewportW;
    const injectViewportH = viewportH;
    const injectPlatform = platform;
    const injectDeviceType = deviceType;

    await this.context.addInitScript(({ w, h, plat, dtype }) => {
      // Screen dimensions match viewport
      Object.defineProperty(screen, 'width', { get: () => w });
      Object.defineProperty(screen, 'height', { get: () => h });
      Object.defineProperty(screen, 'availWidth', { get: () => w });
      Object.defineProperty(screen, 'availHeight', { get: () => h - 40 });

      // Platform string matches device
      Object.defineProperty(navigator, 'platform', { get: () => plat });

      // Touch: always 0 (desktop mode even for iPad UA)
      Object.defineProperty(navigator, 'maxTouchPoints', { get: () => 0 });

      // Hardware concurrency — realistic per device
      const cores = dtype.includes('mac') ? 8 : dtype.includes('ipad') ? 6 : 8;
      Object.defineProperty(navigator, 'hardwareConcurrency', { get: () => cores });

      // Device memory — realistic
      const mem = dtype.includes('ipad') ? 4 : 8;
      Object.defineProperty(navigator, 'deviceMemory', { get: () => mem });

    }, { w: injectViewportW, h: injectViewportH, plat: injectPlatform, dtype: injectDeviceType });

    // Fix and add cookies
    try {
      const fixedCookies = CookieFixer.cleanCookies(this.account.cookies);
      this.logger.info(`Adding ${fixedCookies.length} cookies for ${this.account.name}`);
      await this.context.addCookies(fixedCookies);
    } catch (error) {
      this.logger.error('Cookie fixing error:', error);
      throw new Error(`Failed to add cookies: ${error.message}`);
    }

    this.page = await this.context.newPage();

    // Add stealth scripts
    await this.addStealthScripts();

    this.fbAutomator = new FacebookAutomator(
      this.page,
      this.db,
      this.logger,
      this.sendToRenderer
    );

    // Verify login
    const isLoggedIn = await this.fbAutomator.verifyLogin();
    if (!isLoggedIn) {
      throw new Error('Failed to verify Facebook login - cookies may be expired');
    }

    this.logger.info(`Browser initialized successfully for ${this.account.name}`);
  }

  async addStealthScripts() {
    await this.page.addInitScript(() => {
      // Override navigator properties
      Object.defineProperty(navigator, 'webdriver', {
        get: () => false
      });

      // Override plugins
      Object.defineProperty(navigator, 'plugins', {
        get: () => [1, 2, 3, 4, 5]
      });

      // Override languages
      Object.defineProperty(navigator, 'languages', {
        get: () => ['en-US', 'en']
      });

      // Remove automation indicators
      window.chrome = {
        runtime: {}
      };

      // Override permissions
      const originalQuery = window.navigator.permissions.query;
      window.navigator.permissions.query = (parameters) => (
        parameters.name === 'notifications' ?
          Promise.resolve({ state: Notification.permission }) :
          originalQuery(parameters)
      );
    });
  }

  async processPosts() {
    // Shuffle posts for randomness
    const shuffledPosts = this.shuffleArray([...this.posts]);

    this.logger.info(`Account ${this.account.name}: Starting to process ${shuffledPosts.length} posts sequentially`);
    let processedCount = 0;

    for (const post of shuffledPosts) {
      processedCount++;
      this.logger.info(`Account ${this.account.name}: Processing post ${processedCount}/${shuffledPosts.length}`);

      // Check if account still has quota
      const currentAccount = this.db.getAccounts().find(a => a.id === this.account.id);
      if (!currentAccount || currentAccount.commentsToday >= this.settings.maxCommentsPerAccount) {
        this.logger.info(`Account ${this.account.name} reached daily limit after ${processedCount - 1} posts`);
        break;
      }

      // Check if THIS ACCOUNT has already posted to THIS URL
      if (this.db.hasPostedToUrl(this.account.id, post.url)) {
        this.logger.info(`Account ${this.account.name} already posted to ${post.url}, skipping...`);
        continue;
      }

      try {
        this.logger.info(`Processing post: ${post.url}`);
        this.sendToRenderer('log', {
          level: 'warning',
          message: `[${this.account.name}] Post ${processedCount}/${shuffledPosts.length}: ${post.title || post.url}`,
          timestamp: Date.now()
        });

        await this.processPost(post);

        // Update post visit time
        this.db.updatePostVisit(post.id);

        // Random delay before next post
        const delay = this.randomDelay(
          this.settings.commentDelayMin,
          this.settings.commentDelayMax
        );
        this.logger.info(`Account ${this.account.name}: Completed post ${processedCount}/${shuffledPosts.length}. Waiting ${delay}s before next post...`);
        await this.sleep(delay * 1000);

      } catch (error) {
        this.logger.error(`Error processing post ${post.url}:`, error);

        if (error.message.includes('checkpoint') || error.message.includes('restricted')) {
          throw error; // Propagate to mark account
        }

        // Continue with next post
        continue;
      }
    }

    this.logger.info(`Account ${this.account.name}: Finished processing all posts`);

    try {
      this.logger.info(`Auto-disabling account ${this.account.name} as tasks are complete.`);

      // Disable the account using toggleAccount method
      this.db.toggleAccount(this.account.id, false);


      this.sendToRenderer('log', {
        level: 'warning',
        message: `Account ${this.account.name} has been auto-disabled after completing posts.`,
        timestamp: Date.now()
      });

      // Send event to refresh account list in UI
      this.sendToRenderer('accounts-updated', {
        reason: 'account-disabled',
        accountId: this.account.id,
        accountName: this.account.name
      });
    } catch (err) {
      this.logger.error(`Failed to auto-disable account: ${err.message}`);
    }

  }

  async processPost(post) {
    // Navigate to post
    await this.fbAutomator.navigateToPost(post.url);

    // Wait for page to load
    await this.sleep(3000);

    // STEP 1: Post random comment
    const randomComment = this.getRandomStarter();
    this.logger.info(`Step 1: Posting random comment: "${randomComment}"`);

    const initialResult = await this.fbAutomator.addComment(randomComment);

    if (!initialResult.success) {
      this.logger.error('Failed to post initial comment');
      return;
    }

    // Wait a bit
    await this.sleep(this.randomDelay(2, 5) * 1000);

    // STEP 2: Edit comment with template
    const templateComment = await this.getTemplateComment();
    const finalComment = `Hi ${templateComment}`;

    this.logger.info(`Step 2: Editing comment to: "${finalComment}"`);

    const editResult = await this.fbAutomator.editLastComment(finalComment);

    if (!editResult.success) {
      this.logger.warn('Failed to edit comment, will proceed with original');
    }

    // Wait a bit
    await this.sleep(this.randomDelay(2, 4) * 1000);

    // STEP 3: React to comment
    if (this.settings.autoReact && this.shouldReact()) {
      const reactionDelay = this.randomDelay(
        this.settings.reactionDelayMin,
        this.settings.reactionDelayMax
      );

      this.logger.info(`Step 3: Waiting ${reactionDelay}s before reacting...`);
      await this.sleep(reactionDelay * 1000);

      const reaction = this.getRandomReaction();
      const reactResult = await this.fbAutomator.reactToComment(reaction);

      if (reactResult.success) {
        this.db.incrementAccountReacts(this.account.id);
        this.db.logActivity({
          accountId: this.account.id,
          postId: post.id,
          postUrl: post.url,
          action: 'react',
          status: 'success',
          reaction: reaction
        });

        this.logger.info(`Step 3: Reacted with ${reaction}`);
        this.sendToRenderer('stats-update', this.db.getStats());
      }
    }

    // Wait before checking status
    await this.sleep(3000);

    // STEP 4: Check comment status
    const status = await this.fbAutomator.checkCommentStatus(finalComment);
    this.logger.info(`Step 4: Comment status: ${status}`);

    // Log the comment activity
    this.db.logActivity({
      accountId: this.account.id,
      postId: post.id,
      postUrl: post.url,
      action: 'comment',
      status: status,
      comment: finalComment
    });

    // STEP 5: Handle pending/declined comments
    if ((status === 'pending' || status === 'declined') && this.settings.autoDeletePending) {
      this.logger.info(`Step 5: Deleting ${status} comment...`);

      await this.sleep(2000);
      const deleteResult = await this.fbAutomator.deleteLastComment();

      if (deleteResult.success) {
        this.logger.info('Comment deleted successfully');
        this.sendToRenderer('log', {
          level: 'warning',
          message: `Deleted ${status} comment on post`,
          timestamp: Date.now()
        });
      }
    } else if (status === 'success') {
      // Increment counters only if successful
      this.db.incrementAccountComments(this.account.id);
      this.db.incrementPostComments(post.id);
      this.db.markUrlAsPosted(this.account.id, post.url);

      this.sendToRenderer('log', {
        level: 'success',
        message: `Comment posted successfully on post`,
        timestamp: Date.now()
      });

      this.sendToRenderer('stats-update', this.db.getStats());
    }
  }

  getRandomStarter() {
    return this.randomStarters[Math.floor(Math.random() * this.randomStarters.length)];
  }

  async getTemplateComment() {
    const templates = this.db.getTemplates(this.account.id);

    if (templates.length === 0) {
      return 'Nice post!';
    }

    // Use template and mutate it
    const randomTemplate = templates[Math.floor(Math.random() * templates.length)];
    return this.mutator.mutateComment(randomTemplate.content);
  }

  shouldReact() {
    return Math.random() * 100 < this.settings.reactionProbability;
  }

  getRandomReaction() {
    const reactions = this.settings.reactionTypes;
    return reactions[Math.floor(Math.random() * reactions.length)];
  }

  randomDelay(min, max) {
    return Math.floor(Math.random() * (max - min + 1)) + min;
  }

  shuffleArray(array) {
    for (let i = array.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [array[i], array[j]] = [array[j], array[i]];
    }
    return array;
  }

  sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  async cleanup() {
    try {
      if (this.page) await this.page.close();
      if (this.context) await this.context.close();
      if (this.browser) await this.browser.close();
      this.logger.info(`Browser closed for ${this.account.name}`);
    } catch (error) {
      this.logger.error('Cleanup error:', error);
    }
  }

  async stop() {
    await this.cleanup();
  }
}

module.exports = AutomationWorker;
