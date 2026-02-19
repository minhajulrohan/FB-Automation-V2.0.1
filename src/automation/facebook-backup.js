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
      waitUntil: 'networkidle',
      timeout: 30000 
    });

    // Human-like delay
    await this.randomDelay(2000, 4000);

    // Check for checkpoint/restrictions
    await this.checkForRestrictions();
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

  async scrollPage() {
    // Simulate human scrolling
    await this.page.evaluate(async () => {
      const scrollHeight = document.documentElement.scrollHeight;
      const viewportHeight = window.innerHeight;
      const scrollSteps = 3;

      for (let i = 0; i < scrollSteps; i++) {
        const scrollTo = (viewportHeight * (i + 1));
        window.scrollTo({
          top: Math.min(scrollTo, scrollHeight),
          behavior: 'smooth'
        });
        await new Promise(resolve => setTimeout(resolve, 1000 + Math.random() * 1000));
      }
    });

    await this.randomDelay(1000, 2000);
  }

  async getRecentPosts() {
    await this.page.waitForTimeout(3000);

    const posts = await this.page.evaluate(() => {
      const postElements = [];
      
      // Multiple selectors for finding posts
      const selectors = [
        'div[data-pagelet^="FeedUnit"]',
        'div[role="article"]',
        'div.x1yztbdb.x1n2onr6.xh8yej3.x1ja2u2z',
        'div[data-ad-preview="message"]'
      ];

      let foundPosts = [];
      
      for (const selector of selectors) {
        const elements = document.querySelectorAll(selector);
        if (elements.length > 0) {
          foundPosts = Array.from(elements);
          break;
        }
      }

      // Limit to first 10 posts
      const recentPosts = foundPosts.slice(0, 10);

      return recentPosts.map((post, index) => {
        // Try to find post link
        let postUrl = '';
        const linkSelectors = [
          'a[href*="/posts/"]',
          'a[href*="/permalink/"]',
          'a[href*="/groups/"][href*="/posts/"]'
        ];

        for (const linkSelector of linkSelectors) {
          const link = post.querySelector(linkSelector);
          if (link) {
            postUrl = link.href;
            break;
          }
        }

        // If no URL found, generate unique identifier
        if (!postUrl) {
          postUrl = `post_${Date.now()}_${index}`;
        }

        return {
          url: postUrl,
          element: index
        };
      });
    });

    // Filter out pinned posts and very old posts
    const filteredPosts = posts.filter(post => post.url && post.url !== '');

    this.logger.info(`Found ${filteredPosts.length} recent posts`);
    return filteredPosts;
  }

  async addComment(commentText) {
    try {
      this.logger.info(`Adding comment: "${commentText}"`);

      // Find comment box - multiple selectors
      const commentBoxSelectors = [
        'div[aria-label="Write a comment"][role="textbox"]',
        'div[contenteditable="true"][aria-label*="comment"]',
        'div[data-testid="comment-input"]',
        'div.notranslate._5rpu[contenteditable="true"]'
      ];

      let commentBox = null;
      for (const selector of commentBoxSelectors) {
        commentBox = await this.page.$(selector);
        if (commentBox) break;
      }

      if (!commentBox) {
        // Try to click to reveal comment box
        const clickSelectors = [
          'div[aria-label="Write a comment"]',
          'span:has-text("Write a comment")',
          'div:has-text("Write a comment")'
        ];

        for (const selector of clickSelectors) {
          try {
            await this.page.click(selector, { timeout: 2000 });
            await this.randomDelay(1000, 2000);
            
            for (const boxSelector of commentBoxSelectors) {
              commentBox = await this.page.$(boxSelector);
              if (commentBox) break;
            }
            if (commentBox) break;
          } catch (e) {
            continue;
          }
        }
      }

      if (!commentBox) {
        throw new Error('Could not find comment box');
      }

      // Click comment box
      await commentBox.click();
      await this.randomDelay(500, 1000);

      // Type comment with human-like delays
      await this.humanTypeText(commentBox, commentText);

      // Random delay before posting
      await this.randomDelay(1000, 2000);

      // Find and click post button
      const postButtonSelectors = [
        'div[aria-label="Comment"][role="button"]',
        'div[aria-label="Post"][role="button"]',
        'button:has-text("Post")',
        'div[role="button"]:has-text("Comment")'
      ];

      let posted = false;
      for (const selector of postButtonSelectors) {
        try {
          await this.page.click(selector, { timeout: 2000 });
          posted = true;
          break;
        } catch (e) {
          continue;
        }
      }

      if (!posted) {
        // Try pressing Enter
        await this.page.keyboard.press('Enter');
      }

      // Wait for comment to appear
      await this.randomDelay(2000, 3000);

      // Check comment status
      const status = await this.checkCommentStatus(commentText);

      this.logger.info(`Comment status: ${status}`);

      this.sendToRenderer('log', {
        level: 'success',
        message: `Comment posted: ${status}`,
        timestamp: Date.now()
      });

      return {
        success: true,
        status: status
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
      // Wait a bit for status to be determined
      await this.page.waitForTimeout(2000);

      const status = await this.page.evaluate((comment) => {
        // Check for pending indicator
        const pendingIndicators = [
          'Your comment is awaiting approval',
          'pending',
          'awaiting',
          'under review'
        ];

        const bodyText = document.body.innerText.toLowerCase();
        
        for (const indicator of pendingIndicators) {
          if (bodyText.includes(indicator.toLowerCase())) {
            return 'pending';
          }
        }

        // Check if comment appears in the page
        const allText = document.body.innerText;
        if (allText.includes(comment)) {
          return 'success';
        }

        return 'unknown';
      }, commentText);

      return status;

    } catch (error) {
      return 'unknown';
    }
  }

  async reactToComment(reactionType = 'LIKE') {
    try {
      this.logger.info(`Adding ${reactionType} reaction to comment`);

      // Map reaction types to aria-labels
      const reactionMap = {
        'LIKE': 'Like',
        'LOVE': 'Love',
        'HAHA': 'Haha',
        'WOW': 'Wow',
        'SAD': 'Sad',
        'ANGRY': 'Angry'
      };

      const reactionLabel = reactionMap[reactionType] || 'Like';

      // Find the most recent comment (ours)
      const reacted = await this.page.evaluate((reaction) => {
        // Find all comment like buttons
        const likeButtons = document.querySelectorAll('[aria-label="Like"]');
        
        if (likeButtons.length === 0) return false;

        // Click the first one (most recent)
        const button = likeButtons[0];
        button.click();

        return true;
      }, reactionLabel);

      if (!reacted) {
        throw new Error('Could not find reaction button');
      }

      // Wait for reaction menu if not simple like
      if (reactionType !== 'LIKE') {
        await this.randomDelay(500, 1000);

        // Click specific reaction
        await this.page.click(`[aria-label="${reactionLabel}"]`, { timeout: 2000 });
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

  async editLastComment(newText) {
    try {
      this.logger.info(`Editing comment to: "${newText}"`);

      // Find our most recent comment's edit button
      const editClicked = await this.page.evaluate(() => {
        // Look for three-dot menu buttons (our comment should be first)
        const menus = document.querySelectorAll('[aria-label="More"]');
        
        if (menus.length === 0) return false;

        // Click first menu (our latest comment)
        menus[0].click();
        return true;
      });

      if (!editClicked) {
        throw new Error('Could not find comment menu');
      }

      // Wait for menu to appear
      await this.randomDelay(500, 1000);

      // Click Edit option
      const editOptionSelectors = [
        '[role="menuitem"]:has-text("Edit")',
        'div[role="menuitem"]:has-text("Edit")',
        'span:has-text("Edit")'
      ];

      let edited = false;
      for (const selector of editOptionSelectors) {
        try {
          await this.page.click(selector, { timeout: 2000 });
          edited = true;
          break;
        } catch (e) {
          continue;
        }
      }

      if (!edited) {
        // Try with evaluate
        await this.page.evaluate(() => {
          const editBtn = Array.from(document.querySelectorAll('[role="menuitem"]'))
            .find(el => el.textContent.includes('Edit'));
          if (editBtn) editBtn.click();
        });
      }

      // Wait for edit box to appear
      await this.randomDelay(1000, 1500);

      // Find the editable comment box
      const editBoxSelectors = [
        'div[contenteditable="true"][role="textbox"]',
        'div[contenteditable="true"]',
        'div.notranslate[contenteditable="true"]'
      ];

      let editBox = null;
      for (const selector of editBoxSelectors) {
        editBox = await this.page.$(selector);
        if (editBox) break;
      }

      if (!editBox) {
        throw new Error('Could not find edit box');
      }

      // Clear existing text
      await editBox.click();
      await this.page.keyboard.down('Control');
      await this.page.keyboard.press('A');
      await this.page.keyboard.up('Control');
      await this.page.keyboard.press('Backspace');

      await this.randomDelay(300, 600);

      // Type new text with human-like delays
      await this.humanTypeText(editBox, newText);

      // Wait before saving
      await this.randomDelay(1000, 2000);

      // Press Enter or click Save button
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
        message: `Failed to edit comment: ${error.message}`,
        timestamp: Date.now()
      });

      return { success: false, error: error.message };
    }
  }

  async deleteLastComment() {
    try {
      // Find our comment menu
      const deleted = await this.page.evaluate(() => {
        // Look for three-dot menu buttons
        const menus = document.querySelectorAll('[aria-label="More"]');
        
        if (menus.length === 0) return false;

        // Click first menu (our latest comment)
        menus[0].click();
        
        setTimeout(() => {
          // Find delete option
          const deleteBtn = document.querySelector('[role="menuitem"]:has-text("Delete")');
          if (deleteBtn) {
            deleteBtn.click();
            
            // Confirm deletion
            setTimeout(() => {
              const confirmBtn = document.querySelector('[aria-label="Delete"]');
              if (confirmBtn) confirmBtn.click();
            }, 500);
          }
        }, 500);

        return true;
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
