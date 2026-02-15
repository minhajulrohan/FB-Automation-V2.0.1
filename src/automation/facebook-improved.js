class FacebookAutomator {
  constructor(page, db, logger, sendToRenderer) {
    this.page = page;
    this.db = db;
    this.logger = logger;
    this.sendToRenderer = sendToRenderer;
  }

  async verifyLogin() {
    try {
      await this.page.goto('https://www.facebook.com/', { 
        waitUntil: 'networkidle',
        timeout: 30000 
      });

      await this.page.waitForTimeout(2000);

      // Check if we're logged in by looking for navigation elements
      const isLoggedIn = await this.page.evaluate(() => {
        // Check for user navigation menu
        const navSelectors = [
          '[aria-label="Your profile"]',
          '[aria-label="Account"]',
          'div[role="navigation"]',
          'a[href*="/profile.php"]'
        ];

        for (const selector of navSelectors) {
          if (document.querySelector(selector)) {
            return true;
          }
        }

        // Check if we're on login page
        return !document.querySelector('input[name="email"]');
      });

      if (!isLoggedIn) {
        throw new Error('Not logged in to Facebook');
      }

      this.logger.info('Facebook login verified');
      return true;

    } catch (error) {
      this.logger.error('Login verification failed:', error);
      return false;
    }
  }

  async navigateToPost(postUrl) {
    this.logger.info(`Navigating to post: ${postUrl}`);
    
    await this.page.goto(postUrl, { 
      waitUntil: 'domcontentloaded',
      timeout: 30000 
    });

    // Human-like delay
    await this.randomDelay(3000, 5000);

    // Check for checkpoint/restrictions
    await this.checkForRestrictions();
    
    // Scroll to load comments section
    await this.page.evaluate(() => {
      window.scrollBy(0, 300);
    });
    
    await this.randomDelay(1000, 2000);
  }

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

  async addComment(commentText) {
    try {
      this.logger.info(`Adding comment: "${commentText}"`);

      // Wait for page to be ready
      await this.page.waitForTimeout(2000);

      // Find comment box with improved selectors
      const commentBoxSelectors = [
        'div[aria-label="Write a comment"][role="textbox"]',
        'div[aria-label="Write a comment..."][role="textbox"]',
        'div[contenteditable="true"][aria-label*="comment" i]',
        'div[contenteditable="true"][data-lexical-editor="true"]',
        'div[contenteditable="true"][role="textbox"]',
        'div.notranslate[contenteditable="true"]'
      ];

      let commentBox = null;
      
      // First try to find existing comment box
      for (const selector of commentBoxSelectors) {
        try {
          commentBox = await this.page.$(selector);
          if (commentBox) {
            this.logger.info(`Found comment box with selector: ${selector}`);
            break;
          }
        } catch (e) {
          continue;
        }
      }

      // If not found, try to click to reveal
      if (!commentBox) {
        this.logger.info('Comment box not visible, trying to reveal...');
        
        const clickSelectors = [
          'div[aria-label="Write a comment"]',
          'div[aria-label="Write a comment..."]',
          '[placeholder*="Write a comment" i]',
          'span:text("Write a comment")',
          'div:text("Write a comment")'
        ];

        for (const selector of clickSelectors) {
          try {
            await this.page.click(selector, { timeout: 3000 });
            await this.randomDelay(1500, 2500);
            
            // Try to find comment box again
            for (const boxSelector of commentBoxSelectors) {
              commentBox = await this.page.$(boxSelector);
              if (commentBox) {
                this.logger.info(`Comment box revealed with: ${selector}`);
                break;
              }
            }
            if (commentBox) break;
          } catch (e) {
            continue;
          }
        }
      }

      if (!commentBox) {
        // Last resort - use evaluate to find and click
        const found = await this.page.evaluate(() => {
          const elements = document.querySelectorAll('div[contenteditable="true"]');
          for (const el of elements) {
            const ariaLabel = el.getAttribute('aria-label');
            if (ariaLabel && ariaLabel.toLowerCase().includes('comment')) {
              el.click();
              return true;
            }
          }
          return false;
        });

        if (found) {
          await this.randomDelay(1000, 2000);
          commentBox = await this.page.$('div[contenteditable="true"][aria-label*="comment" i]');
        }
      }

      if (!commentBox) {
        throw new Error('Could not find comment box after all attempts');
      }

      // Click comment box to focus
      await commentBox.click();
      await this.randomDelay(500, 1000);

      // Clear any existing text
      await this.page.keyboard.down('Control');
      await this.page.keyboard.press('A');
      await this.page.keyboard.up('Control');
      await this.page.keyboard.press('Backspace');
      await this.randomDelay(300, 600);

      // Type comment with human-like delays
      await this.humanTypeText(commentBox, commentText);

      // Random delay before posting
      await this.randomDelay(1500, 2500);

      // Find and click post/comment button
      const postButtonSelectors = [
        'div[aria-label="Comment"][role="button"]',
        'div[aria-label="Post"][role="button"]',
        'div[aria-label="Post comment"][role="button"]',
        'div[role="button"]:has-text("Comment")',
        'div[role="button"]:has-text("Post")',
        '[type="submit"][value="Post"]'
      ];

      let posted = false;
      for (const selector of postButtonSelectors) {
        try {
          const button = await this.page.$(selector);
          if (button) {
            const isEnabled = await this.page.evaluate(btn => {
              return !btn.hasAttribute('disabled') && 
                     btn.getAttribute('aria-disabled') !== 'true';
            }, button);
            
            if (isEnabled) {
              await button.click();
              posted = true;
              this.logger.info(`Posted using button: ${selector}`);
              break;
            }
          }
        } catch (e) {
          continue;
        }
      }

      if (!posted) {
        // Try with evaluate
        posted = await this.page.evaluate(() => {
          const buttons = Array.from(document.querySelectorAll('div[role="button"]'));
          for (const btn of buttons) {
            const ariaLabel = btn.getAttribute('aria-label');
            const text = btn.textContent;
            if ((ariaLabel && (ariaLabel.includes('Comment') || ariaLabel.includes('Post'))) ||
                (text && (text.includes('Comment') || text.includes('Post')))) {
              if (!btn.hasAttribute('disabled')) {
                btn.click();
                return true;
              }
            }
          }
          return false;
        });
      }

      if (!posted) {
        // Final fallback - press Enter
        this.logger.info('Trying Enter key as fallback');
        await this.page.keyboard.press('Enter');
        posted = true;
      }

      // Wait for comment to process
      await this.randomDelay(3000, 4000);

      this.sendToRenderer('log', {
        level: 'success',
        message: `Comment posted: "${commentText}"`,
        timestamp: Date.now()
      });

      return {
        success: true,
        status: 'success'
      };

    } catch (error) {
      this.logger.error('Failed to add comment:', error);
      
      this.sendToRenderer('log', {
        level: 'error',
        message: `Failed to comment: ${error.message}`,
        timestamp: Date.now()
      });

      return {
        success: false,
        status: 'failed',
        error: error.message
      };
    }
  }

  async checkCommentStatus(commentText) {
    try {
      await this.page.waitForTimeout(2000);

      const status = await this.page.evaluate((comment) => {
        // Check for pending indicators
        const bodyText = document.body.innerText.toLowerCase();
        
        const pendingIndicators = [
          'awaiting approval',
          'pending approval',
          'under review',
          'waiting for approval',
          'your comment is pending'
        ];

        for (const indicator of pendingIndicators) {
          if (bodyText.includes(indicator)) {
            return 'pending';
          }
        }

        // Check if comment appears (look for exact text match)
        const commentElements = document.querySelectorAll('div[dir="auto"]');
        for (const el of commentElements) {
          if (el.textContent.trim() === comment.trim()) {
            return 'success';
          }
        }

        return 'unknown';
      }, commentText);

      return status;

    } catch (error) {
      this.logger.error('Error checking comment status:', error);
      return 'unknown';
    }
  }

  async editLastComment(newText) {
    try {
      this.logger.info(`Editing comment to: "${newText}"`);

      // Wait for comment to be available
      await this.page.waitForTimeout(2000);

      // Find the three-dot menu for our comment (should be the most recent)
      const menuFound = await this.page.evaluate(() => {
        // Look for menu buttons - our comment should be first
        const menus = Array.from(document.querySelectorAll('[aria-label="More"]'));
        const menuButtons = Array.from(document.querySelectorAll('div[aria-label*="Action" i], div[aria-label*="More" i]'));
        
        const allMenus = [...menus, ...menuButtons];
        
        if (allMenus.length === 0) return false;

        // Click first menu
        allMenus[0].click();
        return true;
      });

      if (!menuFound) {
        this.logger.warn('Could not find comment menu for editing');
        return { success: false, error: 'Menu not found' };
      }

      // Wait for menu to appear
      await this.randomDelay(1000, 1500);

      // Click Edit option
      const edited = await this.page.evaluate(() => {
        // Look for Edit menu item
        const menuItems = Array.from(document.querySelectorAll('[role="menuitem"]'));
        for (const item of menuItems) {
          const text = item.textContent.toLowerCase();
          if (text.includes('edit')) {
            item.click();
            return true;
          }
        }
        return false;
      });

      if (!edited) {
        this.logger.warn('Could not find Edit option');
        return { success: false, error: 'Edit option not found' };
      }

      // Wait for edit box to appear
      await this.randomDelay(1500, 2000);

      // Find the editable text area
      const editBox = await this.page.$('div[contenteditable="true"][role="textbox"]');

      if (!editBox) {
        this.logger.warn('Could not find edit box');
        return { success: false, error: 'Edit box not found' };
      }

      // Select all and delete
      await editBox.click();
      await this.randomDelay(300, 600);
      
      await this.page.keyboard.down('Control');
      await this.page.keyboard.press('A');
      await this.page.keyboard.up('Control');
      await this.page.keyboard.press('Backspace');

      await this.randomDelay(500, 800);

      // Type new text
      await this.humanTypeText(editBox, newText);

      // Wait before saving
      await this.randomDelay(1500, 2000);

      // Press Enter to save (or click Save button if exists)
      await this.page.keyboard.press('Enter');

      // Wait for edit to complete
      await this.randomDelay(2000, 3000);

      this.logger.info('Comment edited successfully');

      this.sendToRenderer('log', {
        level: 'success',
        message: 'Comment edited successfully',
        timestamp: Date.now()
      });

      return { success: true };

    } catch (error) {
      this.logger.error('Failed to edit comment:', error);
      
      this.sendToRenderer('log', {
        level: 'warning',
        message: `Failed to edit: ${error.message}`,
        timestamp: Date.now()
      });

      return { success: false, error: error.message };
    }
  }

  async reactToComment(reactionType = 'LIKE') {
    try {
      this.logger.info(`Adding ${reactionType} reaction`);

      await this.page.waitForTimeout(1000);

      // Find like button on our comment (most recent)
      const reacted = await this.page.evaluate((reaction) => {
        // Find all like/react buttons
        const likeButtons = Array.from(document.querySelectorAll(
          '[aria-label="Like"], [aria-label*="React" i], [aria-label*="Like" i]'
        ));
        
        if (likeButtons.length === 0) return false;

        // Click the first one (our most recent comment)
        likeButtons[0].click();
        return true;
      }, reactionType);

      if (!reacted) {
        throw new Error('Could not find like button');
      }

      // Wait a moment for reactions menu (if not simple like)
      await this.randomDelay(800, 1200);

      // If specific reaction requested, click it
      if (reactionType !== 'LIKE') {
        const reactionMap = {
          'LOVE': 'Love',
          'HAHA': 'Haha',
          'WOW': 'Wow',
          'SAD': 'Sad',
          'ANGRY': 'Angry'
        };

        const reactionLabel = reactionMap[reactionType];
        
        if (reactionLabel) {
          try {
            await this.page.click(`[aria-label="${reactionLabel}"]`, { timeout: 2000 });
          } catch (e) {
            this.logger.warn(`Could not click ${reactionLabel}, using default Like`);
          }
        }
      }

      await this.randomDelay(500, 1000);

      this.sendToRenderer('log', {
        level: 'success',
        message: `Added ${reactionType} reaction`,
        timestamp: Date.now()
      });

      return { success: true };

    } catch (error) {
      this.logger.error('Failed to react:', error);
      return { success: false, error: error.message };
    }
  }

  async deleteLastComment() {
    try {
      this.logger.info('Deleting last comment...');

      await this.page.waitForTimeout(1000);

      // Find and click menu
      const menuClicked = await this.page.evaluate(() => {
        const menus = Array.from(document.querySelectorAll('[aria-label="More"]'));
        if (menus.length === 0) return false;
        menus[0].click();
        return true;
      });

      if (!menuClicked) {
        return { success: false };
      }

      await this.randomDelay(1000, 1500);

      // Click delete option
      const deleted = await this.page.evaluate(() => {
        const menuItems = Array.from(document.querySelectorAll('[role="menuitem"]'));
        for (const item of menuItems) {
          const text = item.textContent.toLowerCase();
          if (text.includes('delete')) {
            item.click();
            
            // Confirm deletion after a moment
            setTimeout(() => {
              const confirmBtns = Array.from(document.querySelectorAll('[role="button"]'));
              for (const btn of confirmBtns) {
                const btnText = btn.textContent.toLowerCase();
                const ariaLabel = btn.getAttribute('aria-label');
                if (btnText.includes('delete') || (ariaLabel && ariaLabel.toLowerCase().includes('delete'))) {
                  btn.click();
                  break;
                }
              }
            }, 500);
            
            return true;
          }
        }
        return false;
      });

      await this.randomDelay(2000, 3000);

      this.logger.info('Comment deleted');
      return { success: deleted };

    } catch (error) {
      this.logger.error('Failed to delete comment:', error);
      return { success: false };
    }
  }

  async humanTypeText(element, text) {
    // Type with random delays to simulate human typing
    for (const char of text) {
      await element.type(char, { 
        delay: Math.random() * 100 + 50 // 50-150ms per character
      });
      
      // Occasional longer pauses (thinking)
      if (Math.random() < 0.1) {
        await this.randomDelay(200, 500);
      }
    }
  }

  async randomDelay(min, max) {
    const delay = Math.floor(Math.random() * (max - min + 1)) + min;
    await this.page.waitForTimeout(delay);
  }
}

module.exports = FacebookAutomator;
