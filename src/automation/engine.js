const AutomationWorker = require('./worker');
const GroupAutomationWorker = require('./group-worker');
const cron = require('node-cron');

class AutomationEngine {
  constructor(db, logger, sendToRenderer) {
    this.db = db;
    this.logger = logger;
    this.sendToRenderer = sendToRenderer;
    this.workers = new Map();
    this.isRunning = false;
    this.taskQueue = [];
    this.currentWorker = null;

    // Reset daily comments at midnight
    cron.schedule('0 0 * * *', () => {
      this.db.resetDailyComments();
      this.logger.info('Daily comment counts reset');
    });
  }

  async start() {
    if (this.isRunning) {
      throw new Error('Automation is already running');
    }

    this.logger.info('Starting automation engine...');
    this.isRunning = true;

    this.sendToRenderer('automation-status', {
      status: 'running',
      message: 'Automation started'
    });

    // Start the main automation loop
    this.runAutomationLoop();
  }

  async stop() {
    this.logger.info('Stopping automation engine...');
    this.isRunning = false;

    // Stop all active workers
    for (const [accountId, worker] of this.workers.entries()) {
      await worker.stop();
      this.workers.delete(accountId);
    }

    this.sendToRenderer('automation-status', {
      status: 'stopped',
      message: 'Automation stopped'
    });
  }

  async runAutomationLoop() {
    while (this.isRunning) {
      try {
        const settings = this.db.getSettings();
        const allAccounts = this.db.getAccounts();

        // Check if ALL accounts are disabled
        const anyEnabledAccount = allAccounts.some(acc => acc.enabled);

        if (!anyEnabledAccount && allAccounts.length > 0) {
          this.logger.info('========================================');
          this.logger.info('ALL ACCOUNTS DISABLED - STOPPING AUTOMATION');
          this.logger.info('========================================');

          this.sendToRenderer('log', {
            level: 'warning',
            message: 'All accounts have been disabled. Stopping automation automatically.',
            timestamp: Date.now()
          });

          await this.stop();
          return;
        }

        // Filter active accounts
        const accounts = allAccounts.filter(acc =>
          acc.enabled &&
          !acc.checkpointDetected &&
          acc.commentsToday < settings.maxCommentsPerAccount
        );

        if (accounts.length === 0) {
          await this.sleep(60000);
          continue;
        }

        // Determine automation mode
        const automationMode = settings.automationMode || 'posts';
        this.logger.info(`Running in ${automationMode.toUpperCase()} mode`);

        this.sendToRenderer('log', {
          level: 'info',
          message: `🚀 Automation Mode: ${automationMode === 'groups' ? '📂 Facebook Groups' : '📌 Post Links'}`,
          timestamp: Date.now()
        });

        // Process all accounts in parallel
        const workerPromises = accounts.map(async (account) => {
          if (this.workers.has(account.id)) return;

          try {
            let worker;

            if (automationMode === 'groups') {
              // Group mode: process Facebook groups
              const groups = this.db.getGroupsByAccount(account.id).filter(g => g.enabled);
              if (groups.length === 0) {
                this.logger.info(`Account ${account.name} has no groups assigned, skipping`);
                return;
              }

              worker = new GroupAutomationWorker(
                account, groups, settings, this.db, this.logger, this.sendToRenderer
              );
            } else {
              // Post mode: process post URLs (default)
              const posts = this.db.getPostsByAccount(account.id).filter(p => p.enabled);
              if (posts.length === 0) {
                this.logger.info(`Account ${account.name} has no posts assigned, skipping`);
                return;
              }

              worker = new AutomationWorker(
                account, posts, settings, this.db, this.logger, this.sendToRenderer
              );
            }

            this.workers.set(account.id, worker);
            await worker.run();
            this.workers.delete(account.id);
            this.logger.info(`Account ${account.name} finished all tasks.`);
          } catch (error) {
            this.logger.error(`Error in parallel worker for ${account.name}:`, error);
            this.workers.delete(account.id);
          }
        });

        await Promise.all(workerPromises);

        this.logger.info('All account cycles completed, waiting before next global cycle...');
        await this.sleep(30000);

      } catch (error) {
        this.logger.error('Automation loop error:', error);
        await this.sleep(10000);
      }
    }
  }

  sendLog(level, message) {
    this.db.addLog(level, message);
    this.sendToRenderer('log', {
      level,
      message,
      timestamp: Date.now()
    });
  }

  getStatus() {
    return {
      isRunning: this.isRunning,
      activeWorkers: this.workers.size,
      workers: Array.from(this.workers.keys())
    };
  }

  sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

module.exports = AutomationEngine;
