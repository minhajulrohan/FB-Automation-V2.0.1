/**
 * Cookie Fixer Test
 * This demonstrates how the cookie fixer works with your actual Facebook cookies
 */

const CookieFixer = require('./src/utils/cookie-fixer');

// Your actual Facebook cookies (from the document you provided)
const originalCookies = [
    {
        "name": "ps_l",
        "value": "1",
        "domain": ".facebook.com",
        "hostOnly": false,
        "path": "/",
        "secure": true,
        "httpOnly": true,
        "sameSite": "lax",
        "session": false,
        "firstPartyDomain": "",
        "partitionKey": null,
        "expirationDate": 1804484440.683,
        "storeId": null
    },
    {
        "name": "datr",
        "value": "uZh9aY56Lm1-WsFRMaqdjSL_",
        "domain": ".facebook.com",
        "hostOnly": false,
        "path": "/",
        "secure": true,
        "httpOnly": true,
        "sameSite": "no_restriction",
        "session": false,
        "firstPartyDomain": "",
        "partitionKey": null,
        "expirationDate": 1804398777.237,
        "storeId": null
    },
    {
        "name": "fr",
        "value": "1wvTAYmHrjrkKGmBr.AWfv0jdUTPIeFCDqRIpQU_Q4Fy-1F1Qpv6GjuljRdg9oTCHGcGM.Bpfx1w..AAA.0.0.Bpfx1w.AWdv25eZwIyb6t6XKvOcpIVZyeY",
        "domain": ".facebook.com",
        "hostOnly": false,
        "path": "/",
        "secure": true,
        "httpOnly": true,
        "sameSite": "no_restriction",
        "session": false,
        "firstPartyDomain": "",
        "partitionKey": null,
        "expirationDate": 1777714287.268,
        "storeId": null
    },
    {
        "name": "xs",
        "value": "5%3ACbc--pvtWEg42A%3A2%3A1769924467%3A-1%3A-1%3A%3AAcwOHKG2F1ab3y5w-TSMX2Xo57-Mmd3TJTwsS8mxcA",
        "domain": ".facebook.com",
        "hostOnly": false,
        "path": "/",
        "secure": true,
        "httpOnly": true,
        "sameSite": "no_restriction",
        "session": false,
        "firstPartyDomain": "",
        "partitionKey": null,
        "expirationDate": 1801474287.269,
        "storeId": null
    },
    {
        "name": "locale",
        "value": "en_GB",
        "domain": ".facebook.com",
        "hostOnly": false,
        "path": "/",
        "secure": true,
        "httpOnly": false,
        "sameSite": "no_restriction",
        "session": false,
        "firstPartyDomain": "",
        "partitionKey": null,
        "expirationDate": 1770529239.566,
        "storeId": null
    },
    {
        "name": "c_user",
        "value": "100095342976488",
        "domain": ".facebook.com",
        "hostOnly": false,
        "path": "/",
        "secure": true,
        "httpOnly": false,
        "sameSite": "no_restriction",
        "session": false,
        "firstPartyDomain": "",
        "partitionKey": null,
        "expirationDate": 1801474287.262,
        "storeId": null
    },
    {
        "name": "presence",
        "value": "C%7B%22t3%22%3A%5B%5D%2C%22utc3%22%3A1769938289179%2C%22v%22%3A1%7D",
        "domain": ".facebook.com",
        "hostOnly": false,
        "path": "/",
        "secure": true,
        "httpOnly": false,
        "sameSite": null,
        "session": true,
        "firstPartyDomain": "",
        "partitionKey": null,
        "storeId": null
    },
    {
        "name": "dpr",
        "value": "1.25",
        "domain": ".facebook.com",
        "hostOnly": false,
        "path": "/",
        "secure": true,
        "httpOnly": false,
        "sameSite": "no_restriction",
        "session": false,
        "firstPartyDomain": "",
        "partitionKey": null,
        "expirationDate": 1770543088,
        "storeId": null
    },
    {
        "name": "ps_n",
        "value": "1",
        "domain": ".facebook.com",
        "hostOnly": false,
        "path": "/",
        "secure": true,
        "httpOnly": true,
        "sameSite": "no_restriction",
        "session": false,
        "firstPartyDomain": "",
        "partitionKey": null,
        "expirationDate": 1804484440.688,
        "storeId": null
    },
    {
        "name": "sb",
        "value": "uZh9aUCidahCQo8a1g_M6zcH",
        "domain": ".facebook.com",
        "hostOnly": false,
        "path": "/",
        "secure": true,
        "httpOnly": true,
        "sameSite": "no_restriction",
        "session": false,
        "firstPartyDomain": "",
        "partitionKey": null,
        "expirationDate": 1804484468.322,
        "storeId": null
    },
    {
        "name": "wd",
        "value": "1485x711",
        "domain": ".facebook.com",
        "hostOnly": false,
        "path": "/",
        "secure": true,
        "httpOnly": false,
        "sameSite": "lax",
        "session": false,
        "firstPartyDomain": "",
        "partitionKey": null,
        "expirationDate": 1770543088,
        "storeId": null
    }
];

console.log('=== ORIGINAL COOKIES ===');
console.log('Total cookies:', originalCookies.length);
console.log('\nSameSite values in original cookies:');
originalCookies.forEach(cookie => {
    console.log(`  ${cookie.name}: "${cookie.sameSite}"`);
});

console.log('\n=== FIXING COOKIES ===');
const fixedCookies = CookieFixer.cleanCookies(originalCookies);

console.log('\n=== FIXED COOKIES ===');
console.log('Total fixed cookies:', fixedCookies.length);
console.log('\nSameSite values after fixing:');
fixedCookies.forEach(cookie => {
    console.log(`  ${cookie.name}: "${cookie.sameSite}"`);
});

console.log('\n=== VALIDATION ===');
const isValid = CookieFixer.validateCookies(fixedCookies);
console.log('All cookies valid?', isValid ? '✅ YES' : '❌ NO');

console.log('\n=== PLAYWRIGHT-READY COOKIES ===');
console.log('You can now use these cookies with Playwright:\n');
console.log('const fixedCookies =', JSON.stringify(fixedCookies, null, 2));

console.log('\n=== USAGE EXAMPLE ===');
console.log(`
const { chromium } = require('playwright');
const CookieFixer = require('./src/utils/cookie-fixer');

async function login() {
  const browser = await chromium.launch({ headless: false });
  const context = await browser.newContext();
  
  // Your original cookies
  const cookies = [ /* paste your cookies here */ ];
  
  // Fix and add cookies
  const fixedCookies = CookieFixer.cleanCookies(cookies);
  await context.addCookies(fixedCookies);
  
  // Navigate to Facebook
  const page = await context.newPage();
  await page.goto('https://www.facebook.com');
  
  // You should now be logged in!
}

login();
`);

// Export for testing
module.exports = { originalCookies, fixedCookies };
