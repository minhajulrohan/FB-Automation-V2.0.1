/**
 * Standalone Facebook Login Example with Fixed Cookies
 * This shows how to use the CookieFixer with Playwright
 */

const { chromium } = require('playwright');

// Cookie Fixer - Copy this if you want to use separately
class CookieFixer {
  static fixCookie(cookie) {
    const fixed = {
      name: cookie.name,
      value: cookie.value,
      domain: cookie.domain,
      path: cookie.path || '/',
      secure: cookie.secure || false,
      httpOnly: cookie.httpOnly || false
    };

    let sameSite = cookie.sameSite;
    
    if (sameSite === 'no_restriction') {
      sameSite = 'None';
    } else if (sameSite === null || sameSite === undefined) {
      sameSite = 'Lax';
    } else if (typeof sameSite === 'string') {
      sameSite = sameSite.charAt(0).toUpperCase() + sameSite.slice(1).toLowerCase();
      if (!['Strict', 'Lax', 'None'].includes(sameSite)) {
        sameSite = 'Lax';
      }
    } else {
      sameSite = 'Lax';
    }

    fixed.sameSite = sameSite;

    if (cookie.expirationDate) {
      fixed.expires = Math.floor(cookie.expirationDate);
    }

    return fixed;
  }

  static cleanCookies(cookies) {
    if (typeof cookies === 'string') {
      cookies = JSON.parse(cookies);
    }
    return cookies.map(cookie => this.fixCookie(cookie));
  }
}

// Your Facebook cookies (paste here from browser extension)
const FACEBOOK_COOKIES = [
  {
    "name": "c_user",
    "value": "100095342976488",
    "domain": ".facebook.com",
    "path": "/",
    "secure": true,
    "httpOnly": false,
    "sameSite": "no_restriction",
    "expirationDate": 1801474287.262
  },
  {
    "name": "xs",
    "value": "5%3ACbc--pvtWEg42A%3A2%3A1769924467%3A-1%3A-1%3A%3AAcwOHKG2F1ab3y5w-TSMX2Xo57-Mmd3TJTwsS8mxcA",
    "domain": ".facebook.com",
    "path": "/",
    "secure": true,
    "httpOnly": true,
    "sameSite": "no_restriction",
    "expirationDate": 1801474287.269
  },
  {
    "name": "datr",
    "value": "uZh9aY56Lm1-WsFRMaqdjSL_",
    "domain": ".facebook.com",
    "path": "/",
    "secure": true,
    "httpOnly": true,
    "sameSite": "no_restriction",
    "expirationDate": 1804398777.237
  },
  {
    "name": "fr",
    "value": "1wvTAYmHrjrkKGmBr.AWfv0jdUTPIeFCDqRIpQU_Q4Fy-1F1Qpv6GjuljRdg9oTCHGcGM.Bpfx1w..AAA.0.0.Bpfx1w.AWdv25eZwIyb6t6XKvOcpIVZyeY",
    "domain": ".facebook.com",
    "path": "/",
    "secure": true,
    "httpOnly": true,
    "sameSite": "no_restriction",
    "expirationDate": 1777714287.268
  },
  {
    "name": "sb",
    "value": "uZh9aUCidahCQo8a1g_M6zcH",
    "domain": ".facebook.com",
    "path": "/",
    "secure": true,
    "httpOnly": true,
    "sameSite": "no_restriction",
    "expirationDate": 1804484468.322
  }
  // Add more cookies as needed
];

async function loginToFacebook() {
  console.log('🚀 Starting Facebook login with fixed cookies...\n');

  // Step 1: Launch browser
  console.log('Step 1: Launching browser...');
  const browser = await chromium.launch({
    headless: false, // Set to true for headless mode
    args: [
      '--disable-blink-features=AutomationControlled',
      '--no-sandbox'
    ]
  });

  // Step 2: Create context
  console.log('Step 2: Creating browser context...');
  const context = await browser.newContext({
    viewport: { width: 1366, height: 768 },
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    locale: 'en-US'
  });

  // Step 3: Fix cookies
  console.log('Step 3: Fixing cookies...');
  const fixedCookies = CookieFixer.cleanCookies(FACEBOOK_COOKIES);
  console.log(`   ✅ Fixed ${fixedCookies.length} cookies`);
  
  // Show what was fixed
  console.log('\n   Cookie transformations:');
  FACEBOOK_COOKIES.forEach((original, index) => {
    const fixed = fixedCookies[index];
    if (original.sameSite !== fixed.sameSite) {
      console.log(`   • ${original.name}: "${original.sameSite}" → "${fixed.sameSite}"`);
    }
  });

  // Step 4: Add cookies
  console.log('\nStep 4: Adding cookies to browser...');
  try {
    await context.addCookies(fixedCookies);
    console.log('   ✅ Cookies added successfully (no errors!)');
  } catch (error) {
    console.log('   ❌ Error adding cookies:', error.message);
    await browser.close();
    return;
  }

  // Step 5: Navigate to Facebook
  console.log('\nStep 5: Navigating to Facebook...');
  const page = await context.newPage();
  await page.goto('https://www.facebook.com', { 
    waitUntil: 'networkidle',
    timeout: 30000 
  });

  // Step 6: Check if logged in
  console.log('\nStep 6: Verifying login...');
  await page.waitForTimeout(3000);

  const isLoggedIn = await page.evaluate(() => {
    // Check for user navigation menu
    const navSelectors = [
      '[aria-label="Your profile"]',
      '[aria-label="Account"]',
      'div[role="navigation"]'
    ];

    for (const selector of navSelectors) {
      if (document.querySelector(selector)) {
        return true;
      }
    }

    // Check if we're NOT on login page
    return !document.querySelector('input[name="email"]');
  });

  if (isLoggedIn) {
    console.log('   ✅ Successfully logged in to Facebook!');
    console.log('\n🎉 You can now interact with Facebook!\n');
  } else {
    console.log('   ❌ Not logged in - cookies may be expired');
    console.log('   💡 Try exporting fresh cookies from your browser\n');
  }

  // Keep browser open for manual testing
  console.log('Browser will stay open for 60 seconds...');
  console.log('(Close manually or wait for auto-close)\n');
  
  await page.waitForTimeout(60000);
  await browser.close();
  console.log('✅ Browser closed.');
}

// Run the example
loginToFacebook().catch(error => {
  console.error('❌ Error:', error.message);
  process.exit(1);
});

// Export for use in other files
module.exports = { CookieFixer, loginToFacebook };
