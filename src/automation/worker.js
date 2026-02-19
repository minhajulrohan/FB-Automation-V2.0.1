const { chromium } = require('playwright');
const FacebookAutomator = require('./facebook');
const CommentMutator = require('../utils/mutator');
const CookieFixer = require('../utils/cookie-fixer');
const path = require('path');
const fs = require('fs');

// ==========================================
// BUNDLED BROWSER PATH RESOLVER
// Packaged exe তে bundled chromium এর path বের করে
// Development এ playwright এর default path use করে
// ==========================================
function getBundledChromiumPath() {
  try {
    const { app } = require('electron');

    // Production: exe এর সাথে bundled chromium
    if (app.isPackaged) {
      const resourcesPath = process.resourcesPath;
      const chromiumBase = path.join(resourcesPath, 'chromium');

      if (!fs.existsSync(chromiumBase)) {
        console.warn('Bundled chromium folder not found:', chromiumBase);
        return null;
      }

      // Windows exe path খোঁজা
      const windowsExePaths = [
        path.join(chromiumBase, 'chrome-win', 'chrome.exe'),
        path.join(chromiumBase, 'chrome-win64', 'chrome.exe'),
        path.join(chromiumBase, 'chrome.exe'),
      ];

      // Mac path খোঁজা
      const macExePaths = [
        path.join(chromiumBase, 'chrome-mac', 'Chromium.app', 'Contents', 'MacOS', 'Chromium'),
        path.join(chromiumBase, 'Chromium.app', 'Contents', 'MacOS', 'Chromium'),
      ];

      // Linux path খোঁজা
      const linuxExePaths = [
        path.join(chromiumBase, 'chrome-linux', 'chrome'),
        path.join(chromiumBase, 'chrome'),
      ];

      const allPaths = [...windowsExePaths, ...macExePaths, ...linuxExePaths];
      const foundPath = allPaths.find(p => fs.existsSync(p));

      if (foundPath) {
        console.log('✅ Bundled Chromium found:', foundPath);
        return foundPath;
      }

      // Sub-folder এ খোঁজা (chromium-xxxx/chrome-win/chrome.exe structure)
      try {
        const items = fs.readdirSync(chromiumBase);
        for (const item of items) {
          const subDir = path.join(chromiumBase, item);
          if (fs.statSync(subDir).isDirectory()) {
            const subPaths = [
              path.join(subDir, 'chrome-win', 'chrome.exe'),
              path.join(subDir, 'chrome-win64', 'chrome.exe'),
              path.join(subDir, 'chrome-mac', 'Chromium.app', 'Contents', 'MacOS', 'Chromium'),
              path.join(subDir, 'chrome-linux', 'chrome'),
            ];
            const found = subPaths.find(p => fs.existsSync(p));
            if (found) {
              console.log('✅ Bundled Chromium found (nested):', found);
              return found;
            }
          }
        }
      } catch (e) {
        console.warn('Sub-folder search failed:', e.message);
      }

      console.warn('⚠️ Bundled Chromium executable not found, using playwright default');
      return null;
    }

    // Development: playwright এর default path use করবে
    return null;

  } catch (e) {
    // Electron not available or other error
    return null;
  }
}

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
        '--force-device-scale-factor=1',

        // 🔒 WebRTC IP Leak Prevention (MAXIMUM)
        '--disable-webrtc',
        '--disable-webrtc-hw-encoding',
        '--disable-webrtc-hw-decoding',
        '--disable-webrtc-encryption',
        '--disable-webrtc-hw-vp8-encoding',
        '--disable-webrtc-hw-vp9-encoding',
        '--enforce-webrtc-ip-permission-check',
        '--force-webrtc-ip-handling-policy=disable_non_proxied_udp',
        '--disable-features=WebRtcHideLocalIpsWithMdns',

        // 🎭 Additional Fingerprinting Protection
        '--disable-features=AudioServiceOutOfProcess',
        '--disable-features=IsolateOrigins,site-per-process',
        '--disable-site-isolation-trials',
        '--disable-features=BlockInsecurePrivateNetworkRequests'
      ]
    };

    // Bundled browser path use করা (packaged app এ)
    const bundledChromiumPath = getBundledChromiumPath();
    if (bundledChromiumPath) {
      launchOptions.executablePath = bundledChromiumPath;
      this.logger.info(`Using bundled Chromium: ${bundledChromiumPath}`);
    } else {
      this.logger.info('Using Playwright default Chromium');
    }

    if (this.account.proxy) {
      try {
        // proxy is stored as JSON: { server, username, password }
        const proxyConfig = typeof this.account.proxy === 'string'
          ? JSON.parse(this.account.proxy)
          : this.account.proxy;

        launchOptions.proxy = {
          server: proxyConfig.server,
          ...(proxyConfig.username && { username: proxyConfig.username }),
          ...(proxyConfig.password && { password: proxyConfig.password })
        };

        this.logger.info(`Proxy: ${proxyConfig.server} (user: ${proxyConfig.username || 'none'})`);
      } catch (e) {
        // Fallback: treat as plain server string (old format)
        launchOptions.proxy = { server: this.account.proxy };
        this.logger.info(`Proxy (legacy format): ${this.account.proxy}`);
      }
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

    // ========================================================================
    // 🔒 CRITICAL: WebRTC BLOCKING - MUST RUN BEFORE ANY PAGE LOADS
    // This runs on EVERY page in this context (including iframes)
    // ========================================================================
    await this.context.addInitScript(() => {
      // IMMEDIATE WebRTC elimination
      const webrtcAPIs = [
        'RTCPeerConnection', 'webkitRTCPeerConnection', 'mozRTCPeerConnection',
        'RTCDataChannel', 'RTCSessionDescription', 'RTCIceCandidate',
        'RTCIceServer', 'RTCRtpSender', 'RTCRtpReceiver', 'RTCRtpTransceiver',
        'RTCDtlsTransport', 'RTCIceTransport', 'RTCSctpTransport', 'RTCCertificate'
      ];

      // Step 1: Make all WebRTC APIs return undefined
      webrtcAPIs.forEach(api => {
        try {
          Object.defineProperty(window, api, {
            get: () => undefined,
            set: () => { },
            configurable: false,
            enumerable: false
          });
        } catch (e) { }
      });

      // Step 2: Override "in" operator for WebRTC detection
      const originalHasOwnProperty = Object.prototype.hasOwnProperty;
      Object.prototype.hasOwnProperty = function (prop) {
        if (webrtcAPIs.includes(prop)) {
          return false;
        }
        return originalHasOwnProperty.call(this, prop);
      };

      // Step 3: Block getUserMedia
      if (navigator.mediaDevices) {
        Object.defineProperty(navigator, 'mediaDevices', {
          get: () => ({
            getUserMedia: () => Promise.reject(new DOMException('Permission denied', 'NotAllowedError')),
            enumerateDevices: () => Promise.resolve([]),
            getSupportedConstraints: () => ({})
          }),
          configurable: false
        });
      }

      // Step 4: Console confirmation (only in dev)
      // console.log('🔒 WebRTC blocked at context level');
    });

    // Device fingerprint injection (runs after WebRTC blocking)
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

    // WebRTC blocking is now handled at context level (before page creation)
    // This ensures it runs BEFORE any page scripts, including detection tools

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
      // ==============================================================
      // BACKUP WebRTC BLOCKING (context level is primary)
      // This is a safety net in case context blocking is bypassed
      // ==============================================================

      // Nuclear option: Delete WebRTC from window completely
      try {
        delete window.RTCPeerConnection;
        delete window.webkitRTCPeerConnection;
        delete window.mozRTCPeerConnection;
        delete window.RTCDataChannel;
        delete window.RTCSessionDescription;
        delete window.RTCIceCandidate;
      } catch (e) { }

      // =====================================================
      // 🔒 ANTI-DETECTION & FINGERPRINT PROTECTION
      // =====================================================

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

      // =====================================================
      // 🌐 WEBRTC IP LEAK PROTECTION (AGGRESSIVE)
      // WebRTC সম্পূর্ণভাবে disable করে IP leak prevent করে
      // =====================================================

      // =================================================================
      // ULTRA-AGGRESSIVE WebRTC REMOVAL
      // Goal: Make WebRTC completely undetectable (False in tests)
      // =================================================================

      // Step 1: Define properties as non-existent (BEFORE deletion)
      const defineAsUndefined = (obj, prop) => {
        try {
          Object.defineProperty(obj, prop, {
            get: () => undefined,
            set: () => { },
            configurable: false,
            enumerable: false
          });
        } catch (e) {
          // Silently ignore if already defined
        }
      };

      // Step 2: Remove from window object completely
      const webrtcAPIs = [
        'RTCPeerConnection',
        'webkitRTCPeerConnection',
        'mozRTCPeerConnection',
        'RTCDataChannel',
        'RTCSessionDescription',
        'RTCIceCandidate',
        'RTCIceServer',
        'RTCRtpSender',
        'RTCRtpReceiver',
        'RTCRtpTransceiver',
        'RTCDtlsTransport',
        'RTCIceTransport',
        'RTCSctpTransport',
        'RTCCertificate'
      ];

      webrtcAPIs.forEach(api => {
        // First, define as undefined
        defineAsUndefined(window, api);

        // Then delete
        try {
          delete window[api];
        } catch (e) { }

        // Triple check: set to undefined
        try {
          window[api] = undefined;
        } catch (e) { }
      });

      // Step 3: Override "in" operator check
      const originalHasOwnProperty = Object.prototype.hasOwnProperty;
      Object.prototype.hasOwnProperty = function (prop) {
        if (webrtcAPIs.includes(prop)) {
          return false; // Pretend WebRTC APIs don't exist
        }
        return originalHasOwnProperty.call(this, prop);
      };

      // Step 4: Override Object.keys to hide WebRTC
      const originalKeys = Object.keys;
      Object.keys = function (obj) {
        const keys = originalKeys(obj);
        return keys.filter(key => !webrtcAPIs.includes(key));
      };

      // Step 5: Override getOwnPropertyNames
      const originalGetOwnPropertyNames = Object.getOwnPropertyNames;
      Object.getOwnPropertyNames = function (obj) {
        const names = originalGetOwnPropertyNames(obj);
        return names.filter(name => !webrtcAPIs.includes(name));
      };

      // Method 5: Block getUserMedia completely
      if (navigator.mediaDevices) {
        navigator.mediaDevices.getUserMedia = function () {
          return Promise.reject(new DOMException('Permission denied', 'NotAllowedError'));
        };

        navigator.mediaDevices.enumerateDevices = function () {
          return Promise.resolve([]);
        };
      }

      // Legacy getUserMedia
      if (navigator.getUserMedia) {
        navigator.getUserMedia = function (constraints, success, error) {
          if (error) {
            error(new DOMException('Permission denied', 'NotAllowedError'));
          }
        };
      }

      if (navigator.webkitGetUserMedia) {
        navigator.webkitGetUserMedia = function (constraints, success, error) {
          if (error) {
            error(new DOMException('Permission denied', 'NotAllowedError'));
          }
        };
      }

      if (navigator.mozGetUserMedia) {
        navigator.mozGetUserMedia = function (constraints, success, error) {
          if (error) {
            error(new DOMException('Permission denied', 'NotAllowedError'));
          }
        };
      }

      // Method 6: Override navigator.mediaDevices completely
      Object.defineProperty(navigator, 'mediaDevices', {
        get: function () {
          return {
            getUserMedia: function () {
              return Promise.reject(new DOMException('Permission denied', 'NotAllowedError'));
            },
            enumerateDevices: function () {
              return Promise.resolve([]);
            },
            getSupportedConstraints: function () {
              return {};
            }
          };
        }
      });

      // =====================================================
      // 🎨 CANVAS FINGERPRINT RANDOMIZATION
      // প্রতিবার আলাদা canvas fingerprint generate করে
      // =====================================================

      const getRandomNoise = () => Math.random() * 0.0001;

      const originalToDataURL = HTMLCanvasElement.prototype.toDataURL;
      HTMLCanvasElement.prototype.toDataURL = function (type) {
        const context = this.getContext('2d');
        if (context) {
          const imageData = context.getImageData(0, 0, this.width, this.height);
          for (let i = 0; i < imageData.data.length; i += 4) {
            imageData.data[i] += getRandomNoise();
            imageData.data[i + 1] += getRandomNoise();
            imageData.data[i + 2] += getRandomNoise();
          }
          context.putImageData(imageData, 0, 0);
        }
        return originalToDataURL.apply(this, arguments);
      };

      const originalToBlob = HTMLCanvasElement.prototype.toBlob;
      HTMLCanvasElement.prototype.toBlob = function (callback, type, quality) {
        const context = this.getContext('2d');
        if (context) {
          const imageData = context.getImageData(0, 0, this.width, this.height);
          for (let i = 0; i < imageData.data.length; i += 4) {
            imageData.data[i] += getRandomNoise();
            imageData.data[i + 1] += getRandomNoise();
            imageData.data[i + 2] += getRandomNoise();
          }
          context.putImageData(imageData, 0, 0);
        }
        return originalToBlob.apply(this, arguments);
      };

      const originalGetImageData = CanvasRenderingContext2D.prototype.getImageData;
      CanvasRenderingContext2D.prototype.getImageData = function () {
        const imageData = originalGetImageData.apply(this, arguments);
        for (let i = 0; i < imageData.data.length; i += 4) {
          imageData.data[i] += getRandomNoise();
          imageData.data[i + 1] += getRandomNoise();
          imageData.data[i + 2] += getRandomNoise();
        }
        return imageData;
      };

      // =====================================================
      // 🔊 AUDIO CONTEXT FINGERPRINT RANDOMIZATION
      // Audio fingerprinting থেকে বাঁচায়
      // =====================================================

      const AudioContext = window.AudioContext || window.webkitAudioContext;
      if (AudioContext) {
        const originalCreateAnalyser = AudioContext.prototype.createAnalyser;
        AudioContext.prototype.createAnalyser = function () {
          const analyser = originalCreateAnalyser.apply(this, arguments);
          const originalGetFloatFrequencyData = analyser.getFloatFrequencyData;
          analyser.getFloatFrequencyData = function (array) {
            originalGetFloatFrequencyData.apply(this, arguments);
            for (let i = 0; i < array.length; i++) {
              array[i] += getRandomNoise();
            }
            return array;
          };
          return analyser;
        };
      }

      // =====================================================
      // 🎮 WEBGL FINGERPRINT RANDOMIZATION
      // WebGL vendor/renderer info spoofing
      // =====================================================

      const getParameterProxyHandler = {
        apply: function (target, thisArg, args) {
          const param = args[0];

          // UNMASKED_VENDOR_WEBGL
          if (param === 37445) {
            return 'Intel Inc.';
          }

          // UNMASKED_RENDERER_WEBGL
          if (param === 37446) {
            return 'Intel Iris OpenGL Engine';
          }

          return target.apply(thisArg, args);
        }
      };

      const originalGetParameter = WebGLRenderingContext.prototype.getParameter;
      WebGLRenderingContext.prototype.getParameter = new Proxy(
        originalGetParameter,
        getParameterProxyHandler
      );

      if (typeof WebGL2RenderingContext !== 'undefined') {
        const originalGetParameter2 = WebGL2RenderingContext.prototype.getParameter;
        WebGL2RenderingContext.prototype.getParameter = new Proxy(
          originalGetParameter2,
          getParameterProxyHandler
        );
      }

      // =====================================================
      // 🔤 FONT FINGERPRINT PROTECTION
      // Font enumeration থেকে বাঁচায়
      // =====================================================

      // Common fonts list for consistency
      const commonFonts = [
        'Arial', 'Verdana', 'Helvetica', 'Times New Roman',
        'Courier New', 'Georgia', 'Palatino', 'Garamond',
        'Comic Sans MS', 'Trebuchet MS', 'Impact'
      ];

      // Override font detection
      Object.defineProperty(document, 'fonts', {
        get: () => ({
          check: () => true,
          ready: Promise.resolve(),
          values: () => commonFonts.map(f => ({ family: f }))
        })
      });

      // =====================================================
      // 📍 GEOLOCATION SPOOFING
      // Proxy অনুযায়ী location দেখায় (optional)
      // =====================================================

      if (navigator.geolocation) {
        const originalGetCurrentPosition = navigator.geolocation.getCurrentPosition;
        navigator.geolocation.getCurrentPosition = function (success, error) {
          // Return proxy location coordinates (New York as default)
          const position = {
            coords: {
              latitude: 40.7128,
              longitude: -74.0060,
              accuracy: 100,
              altitude: null,
              altitudeAccuracy: null,
              heading: null,
              speed: null
            },
            timestamp: Date.now()
          };
          if (success) success(position);
        };
      }

      // =====================================================
      // 🕒 TIMEZONE CONSISTENCY
      // Timezone proxy অনুযায়ী consistent রাখা
      // =====================================================

      Object.defineProperty(Intl.DateTimeFormat.prototype, 'resolvedOptions', {
        value: function () {
          return {
            locale: 'en-US',
            calendar: 'gregory',
            numberingSystem: 'latn',
            timeZone: 'America/New_York',
            hour12: true
          };
        }
      });

      // =====================================================
      // 🖥️ SCREEN & HARDWARE INFO CONSISTENCY
      // Already handled in context.addInitScript
      // =====================================================

      console.log('🔒 Anti-detection scripts loaded successfully');
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

      // =====================================================
      // HUMAN-LIKE BEHAVIOR: Increment and check breaks
      // =====================================================
      this.fbAutomator.incrementCommentCounters();

      this.logger.info(`📊 Comments since home scroll: ${this.fbAutomator.commentsSinceHomeScroll}, since reels: ${this.fbAutomator.commentsSinceReelsBreak}`);

      // Check if need to take a break (home scroll or reels)
      await this.fbAutomator.checkAndTakeBreak();
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
