/**
 * Cookie Fixer Utility
 * Converts Facebook cookies to Playwright-compatible format
 */

class CookieFixer {
  /**
   * Fix a single cookie to be Playwright-compatible
   * @param {Object} cookie - Original cookie object
   * @returns {Object} Fixed cookie object
   */
  static fixCookie(cookie) {
    const fixed = {
      name: cookie.name,
      value: cookie.value,
      domain: cookie.domain,
      path: cookie.path || '/',
      secure: cookie.secure || false,
      httpOnly: cookie.httpOnly || false
    };

    // Fix sameSite values
    let sameSite = cookie.sameSite;
    
    if (sameSite === 'no_restriction') {
      sameSite = 'None';
    } else if (sameSite === null || sameSite === undefined) {
      sameSite = 'Lax';
    } else if (typeof sameSite === 'string') {
      // Capitalize first letter
      sameSite = sameSite.charAt(0).toUpperCase() + sameSite.slice(1).toLowerCase();
      
      // Ensure it's valid (Strict, Lax, or None)
      if (!['Strict', 'Lax', 'None'].includes(sameSite)) {
        sameSite = 'Lax';
      }
    } else {
      sameSite = 'Lax';
    }

    fixed.sameSite = sameSite;

    // Add expiration if exists
    if (cookie.expirationDate) {
      fixed.expires = Math.floor(cookie.expirationDate);
    }

    return fixed;
  }

  /**
   * Fix an array of cookies
   * @param {Array} cookies - Array of cookie objects
   * @returns {Array} Fixed cookies array
   */
  static fixCookies(cookies) {
    if (!Array.isArray(cookies)) {
      throw new Error('Cookies must be an array');
    }

    return cookies.map(cookie => this.fixCookie(cookie));
  }

  /**
   * Validate that cookies are Playwright-compatible
   * @param {Array} cookies - Array of cookie objects
   * @returns {Boolean} True if all cookies are valid
   */
  static validateCookies(cookies) {
    const validSameSite = ['Strict', 'Lax', 'None'];
    
    for (const cookie of cookies) {
      if (!cookie.name || !cookie.value) {
        console.error('Invalid cookie: missing name or value', cookie);
        return false;
      }

      if (!cookie.domain) {
        console.error('Invalid cookie: missing domain', cookie);
        return false;
      }

      if (cookie.sameSite && !validSameSite.includes(cookie.sameSite)) {
        console.error('Invalid sameSite value:', cookie.sameSite, 'in cookie:', cookie.name);
        return false;
      }
    }

    return true;
  }

  /**
   * Clean and fix cookies in one step
   * @param {Array|String} cookies - Cookies array or JSON string
   * @returns {Array} Fixed and validated cookies
   */
  static cleanCookies(cookies) {
    // If string, parse it
    if (typeof cookies === 'string') {
      try {
        cookies = JSON.parse(cookies);
      } catch (error) {
        throw new Error('Invalid JSON format for cookies');
      }
    }

    // Fix all cookies
    const fixedCookies = this.fixCookies(cookies);

    // Validate
    if (!this.validateCookies(fixedCookies)) {
      throw new Error('Cookie validation failed after fixing');
    }

    return fixedCookies;
  }
}

module.exports = CookieFixer;
