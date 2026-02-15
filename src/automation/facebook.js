class FacebookAutomator {
  constructor(page, db, logger, sendToRenderer) {
    this.page = page;
    this.db = db;
    this.logger = logger;
    this.sendToRenderer = sendToRenderer;
  }

  async verifyLogin() {
    try {
      this.logger.info('Verifying Facebook login...');

      // পরিবর্তন: waitUntil 'domcontentloaded' করা হয়েছে এবং timeout বাড়ানো হয়েছে
      await this.page.goto('https://www.facebook.com/', {
        waitUntil: 'domcontentloaded',
        timeout: 60000
      });

      // একটু অতিরিক্ত সময় দেওয়া যাতে স্ক্রিপ্ট লোড হতে পারে
      await new Promise(resolve => setTimeout(resolve, 5000));

      const isLoggedIn = await this.page.evaluate(() => {
        const navSelectors = [
          '[aria-label="Your profile"]',
          '[aria-label="Account"]',
          'div[role="navigation"]',
          'a[href*="/profile.php"]',
          '[aria-label="Home"]' // অতিরিক্ত একটি সিলেক্টর
        ];

        for (const selector of navSelectors) {
          if (document.querySelector(selector)) return true;
        }

        // লগইন পেজে নেই কিন্তু প্রোফাইল আইকন পাওয়া যাচ্ছে কিনা দেখা
        return !!document.querySelector('div[data-testid="Key-Shortcut-Help-Modal"]');
      });

      if (!isLoggedIn) {
        // যদি লগইন না থাকে, তবে কুকি এক্সপায়ার হয়েছে এটা নিশ্চিত
        throw new Error('Failed to verify Facebook login - cookies may be expired');
      }

      this.logger.info('Facebook login verified successfully');
      return true;

    } catch (error) {
      this.logger.error('Login verification failed:', error.message);
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
      await this.randomDelay(3000, 5000); // Wait for status to stabilize
      return await this.page.evaluate(() => {
        const text = document.body.innerText;
        // চেক করা হচ্ছে নির্দিষ্ট কী-ওয়ার্ডগুলো আছে কি না
        const hasDeclined = text.includes('Declined') && text.includes('See feedback');
        const hasPending = text.includes('Pending') || text.includes('awaiting approval');

        if (hasDeclined) return 'declined';
        if (hasPending) return 'pending';
        return 'success';
      });
    } catch (error) {
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

  async reactToComment() {
    try {
      this.logger.info(`Adding CARE reaction specifically to the comment...`);

      // ১. কমেন্টের 'Like' বাটনটি খুঁজে বের করার আরও শক্তিশালী পদ্ধতি
      const commentLikeButton = await this.page.waitForFunction(() => {
        // সব 'Like' টেক্সট যুক্ত এলিমেন্ট খুঁজুন
        const spans = Array.from(document.querySelectorAll('span, div'));
        const likeSpan = spans.find(el =>
          el.innerText.trim() === 'Like' &&
          el.closest('div[role="article"]') // নিশ্চিত করছে এটি একটি কমেন্ট এরিয়া
        );

        if (likeSpan) {
          // লাইক স্প্যানটির সবচেয়ে কাছের ক্লিকেবল বাটন বা ডিভটি রিটার্ন করবে
          return likeSpan.closest('div[role="button"]') || likeSpan.parentElement;
        }
        return null;
      }, { timeout: 10000 });

      if (commentLikeButton) {
        // ২. মাউস মুভ করে এলিমেন্টের ওপর নেওয়া (যাতে null এরর না আসে)
        const boundingBox = await commentLikeButton.boundingBox();
        if (boundingBox) {
          await this.page.mouse.move(
            boundingBox.x + boundingBox.width / 2,
            boundingBox.y + boundingBox.height / 2
          );

          // হোভার করা Care মেনু খোলার জন্য
          await this.page.mouse.move(
            boundingBox.x + boundingBox.width / 2,
            boundingBox.y + boundingBox.height / 2
          );
        }

        await this.randomDelay(2000, 3000);

        // ৩. "Care" রিঅ্যাকশন বাটনটি খুঁজে ক্লিক করা
        const reacted = await this.page.evaluate(() => {
          const careBtn = document.querySelector('div[role="button"][aria-label="Care"]');
          if (careBtn) {
            careBtn.click();
            return true;
          }
          return false;
        });

        if (reacted) {
          this.logger.info('Care reaction added successfully!');
          return { success: true };
        } else {
          // মেনু না আসলে সরাসরি লাইক ক্লিক করবে
          await commentLikeButton.click();
          this.logger.info('Care menu not found, clicked Like instead');
        }
      } else {
        throw new Error('Could not find the comment Like button');
      }
    } catch (error) {
      this.logger.error('Reaction failed: ' + error.message);
      return { success: false, error: error.message };
    }
  }

  async editLastComment(newText) {
    try {
      this.logger.info(`Editing comment...`);

      // ১. 'Edit or delete this' (থ্রি-ডট) বাটনে ক্লিক করা
      const menuSelector = 'div[role="button"][aria-label="Edit or delete this"]';
      await this.page.waitForSelector(menuSelector, { timeout: 10000 });
      await this.page.click(menuSelector);
      await this.randomDelay(2000, 3000);

      // ২. আপনার দেওয়া স্ক্রিনশট অনুযায়ী 'Edit' ক্লাস ব্যবহার করে ক্লিক করা
      const editOptionSelector = 'span.x193iq5w'; // স্ক্রিনশটে দেখা এডিট অপশনের ক্লাস
      const editClicked = await this.page.evaluate((selector) => {
        const spans = Array.from(document.querySelectorAll(selector));
        const editBtn = spans.find(s => s.innerText.includes('Edit'));
        if (editBtn) {
          editBtn.closest('[role="menuitem"]')?.click() || editBtn.click();
          return true;
        }
        return false;
      }, editOptionSelector);

      if (!editClicked) throw new Error('Could not click Edit option');

      // ৩. এডিট বক্স লোড হওয়া পর্যন্ত অপেক্ষা করা
      const editBoxSelector = 'div[contenteditable="true"][role="textbox"]';
      await this.page.waitForSelector(editBoxSelector, { timeout: 10000 });
      const editBox = await this.page.$(editBoxSelector);

      if (editBox) {
        await editBox.click();

        // সব টেক্সট মুছে ফেলা
        await this.page.keyboard.down('Control');
        await this.page.keyboard.press('A');
        await this.page.keyboard.up('Control');
        await this.page.keyboard.press('Backspace');

        await this.randomDelay(1000, 1500);

        // আপনার চাহিদা অনুযায়ী: টেক্সট টাইপ করা + স্পেস দেওয়া
        await this.humanTypeText(editBox, newText);
        await this.page.keyboard.press('Space'); // টেক্সটের পর স্পেস দেওয়া

        await this.randomDelay(1500, 2000);

        // ৪. এন্টার চেপে সেভ করা
        await this.page.keyboard.press('Enter');
        this.logger.info('Comment edit submitted with space and enter');

        // ৫. সেভ হওয়া নিশ্চিত না হওয়া পর্যন্ত অপেক্ষা (অন্য পোস্টে যাওয়া রোধ করতে)
        await this.randomDelay(4000, 5000);

        // এডিট হওয়ার পর লাইক দেওয়া
        await this.reactToComment();

        return { success: true };
      }
    } catch (error) {
      this.logger.error('Edit failed:', error.message);
      return { success: false, error: error.message };
    }

    // ... এডিট সফল হওয়ার পর
    const status = await this.checkCommentStatus(newText);

    if (status === 'success') {
      await this.reactToComment("Your Name");
    } else {
      this.logger.warn(`Comment status is ${status}. Deleting this specific comment...`);
      // এখানে newText পাঠিয়ে দিচ্ছি যেন সঠিক কমেন্টটি ডিলিট হয়
      await this.deleteLastComment(newText);
    }
  }

  async checkCommentStatus(commentText) {
    try {
      await this.randomDelay(3000, 5000); // Wait for status to stabilize
      return await this.page.evaluate(() => {
        const text = document.body.innerText;
        // চেক করা হচ্ছে নির্দিষ্ট কী-ওয়ার্ডগুলো আছে কি না
        const hasDeclined = text.includes('Declined') && text.includes('See feedback');
        const hasPending = text.includes('Pending') || text.includes('awaiting approval');

        if (hasDeclined) return 'declined';
        if (hasPending) return 'pending';
        return 'success';
      });
    } catch (error) {
      return 'unknown';
    }
  }

  async deleteLastComment(textToFind = "") {
    try {
      this.logger.info(`Starting precision deletion for: "${textToFind}"`);

      const menuClicked = await this.page.evaluate((searchText) => {
        // ১. পেজে থাকা সব কমেন্ট ব্লক (article) খুঁজে বের করা
        const allComments = Array.from(document.querySelectorAll('div[role="article"]'));

        // ২. আপনার নির্দিষ্ট কমেন্টটি খুঁজে বের করা (পেন্ডিং টেক্সট বা আপনার মেসেজ দিয়ে)
        const myComment = allComments.find(el => {
          const content = el.innerText.toLowerCase();
          // যদি আপনার দেওয়া নির্দিষ্ট টেক্সট থাকে অথবা 'pending' লেখা থাকে
          return (searchText && content.includes(searchText.toLowerCase())) ||
            content.includes('pending') ||
            content.includes('declined');
        });

        if (myComment) {
          // ৩. এই নির্দিষ্ট কমেন্ট ব্লকের ভেতর থাকা ৩-ডট বাটনটি খোঁজা
          // এখানে একাধিক সিলেক্টর রাখা হয়েছে যেন ফেসবুক যেকোনো একটি ব্যবহার করলে মিস না হয়
          const menuBtn = myComment.querySelector('div[role="button"][aria-label*="Edit"], div[role="button"][aria-label*="More"], div[aria-label*="Action"]');

          if (menuBtn) {
            menuBtn.scrollIntoView({ block: 'center' });
            menuBtn.click();
            return true;
          }
        }
        return false;
      }, textToFind);

      if (!menuClicked) throw new Error('Targeted comment menu not found');

      this.logger.info('Correct menu clicked. Waiting for Delete option...');
      await this.randomDelay(2000, 3000);

      // ৪. মেনু থেকে 'Delete' অপশন ক্লিক করা (আপনার দেওয়া ক্লাস x193iq5w ব্যবহার করে)
      const deleteOptionClicked = await this.page.evaluate(() => {
        const spans = Array.from(document.querySelectorAll('span.x193iq5w'));
        // সুনির্দিষ্টভাবে 'Delete' লেখাটি খুঁজবে
        const deleteBtn = spans.find(s => s.innerText.trim() === 'Delete');

        if (deleteBtn) {
          const clickableElement = deleteBtn.closest('[role="menuitem"]') || deleteBtn;
          clickableElement.click();
          return true;
        }
        return false;
      });

      if (!deleteOptionClicked) throw new Error('Delete button with class x193iq5w not found');

      // ৫. কনফার্মেশন ডায়ালগ হ্যান্ডেল করা
      await this.randomDelay(2000, 3000);
      const confirmed = await this.page.evaluate(() => {
        const dialogButtons = Array.from(document.querySelectorAll('div[role="dialog"] div[role="button"]'));
        const confirmBtn = dialogButtons.find(btn =>
          btn.innerText.trim() === 'Delete' || btn.innerText.includes('Confirm')
        );
        if (confirmBtn) {
          confirmBtn.click();
          return true;
        }
        return false;
      });

      if (!confirmed) {
        this.logger.warn('Confirmation button not found, pressing Enter...');
        await this.page.keyboard.press('Enter');
      }

      await this.randomDelay(3000, 4000);
      this.logger.info('Pending comment deleted successfully.');
      return { success: true };

    } catch (error) {
      this.logger.error('Failed to delete comment: ' + error.message);
      return { success: false, error: error.message };
    }
  }
  // ... (reactToComment and other utility functions follow)

  async randomDelay(min, max) {
    const delay = Math.floor(Math.random() * (max - min + 1)) + min;
    await this.page.waitForTimeout(delay);
  }

  async humanTypeText(element, text) {
    // Type with random delays to simulate human typing
    // Handle multi-line text (supports \n for line breaks)

    for (const char of text) {
      // Check if character is newline
      if (char === '\n') {
        // Press Shift+Enter for new line (Facebook comment box behavior)
        await this.page.keyboard.down('Shift');
        await this.page.keyboard.press('Enter');
        await this.page.keyboard.up('Shift');
        await this.randomDelay(100, 300);
      } else {
        // Type regular character
        await element.type(char, {
          delay: Math.random() * 100 + 50 // 50-150ms per character
        });

        // Occasional longer pauses (thinking)
        if (Math.random() < 0.1) {
          await this.randomDelay(200, 500);
        }
      }
    }
  }

  async randomDelay(min, max) {
    const delay = Math.floor(Math.random() * (max - min + 1)) + min;
    await this.page.waitForTimeout(delay);
  }
}

module.exports = FacebookAutomator;
