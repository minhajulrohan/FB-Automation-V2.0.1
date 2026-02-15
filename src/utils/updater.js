const { app } = require('electron');
const https = require('https');
const fs = require('fs');
const path = require('path');
const { execFile } = require('child_process');
const { URL } = require('url');

// GitHub repository information
const REPO_OWNER = 'minhajulrohan';
const REPO_NAME = 'FB-Automation-V2.0.1';
const GITHUB_API_URL = `https://api.github.com/repos/${REPO_OWNER}/${REPO_NAME}/releases/latest`;

class Updater {
  constructor() {
    this.currentVersion = app.getVersion();
    this.updateAvailable = false;
    this.latestVersion = null;
    this.downloadUrl = null;
  }

  /**
   * Check for updates from GitHub releases
   */
  async checkForUpdates() {
    return new Promise((resolve, reject) => {
      const options = {
        headers: {
          'User-Agent': 'FB-Automation-Updater'
        }
      };

      https.get(GITHUB_API_URL, options, (res) => {
        let data = '';

        res.on('data', (chunk) => {
          data += chunk;
        });

        res.on('end', () => {
          try {
            const release = JSON.parse(data);

            // Get latest version (remove 'v' prefix if exists)
            this.latestVersion = release.tag_name.replace('v', '');

            // Find Windows installer asset
            const asset = release.assets.find(a =>
              a.name.endsWith('.exe') || a.name.endsWith('.msi')
            );

            if (asset) {
              this.downloadUrl = asset.browser_download_url;
            }

            // Compare versions
            this.updateAvailable = this.compareVersions(
              this.currentVersion,
              this.latestVersion
            ) < 0;

            resolve({
              updateAvailable: this.updateAvailable,
              currentVersion: this.currentVersion,
              latestVersion: this.latestVersion,
              downloadUrl: this.downloadUrl,
              releaseNotes: release.body
            });
          } catch (error) {
            reject(new Error('Failed to parse update information: ' + error.message));
          }
        });
      }).on('error', (error) => {
        reject(new Error('Failed to check for updates: ' + error.message));
      });
    });
  }

  /**
   * Compare two version strings
   * Returns: -1 if v1 < v2, 0 if equal, 1 if v1 > v2
   */
  compareVersions(v1, v2) {
    const parts1 = v1.split('.').map(Number);
    const parts2 = v2.split('.').map(Number);

    for (let i = 0; i < Math.max(parts1.length, parts2.length); i++) {
      const part1 = parts1[i] || 0;
      const part2 = parts2[i] || 0;

      if (part1 < part2) return -1;
      if (part1 > part2) return 1;
    }

    return 0;
  }

  /**
   * Download the update installer
   */
  async downloadUpdate(onProgress) {
    return new Promise((resolve, reject) => {
      if (!this.downloadUrl) {
        reject(new Error('No download URL available'));
        return;
      }

      const fileName = path.basename(new URL(this.downloadUrl).pathname);
      const downloadPath = path.join(app.getPath('temp'), fileName);

      console.log('Download URL:', this.downloadUrl);
      console.log('Download Path:', downloadPath);

      const file = fs.createWriteStream(downloadPath);

      const download = (url, attempt = 1) => {
        const options = {
          headers: {
            'User-Agent': 'FB-Automation-Updater'
          }
        };

        https.get(url, options, (response) => {
          // Handle redirects
          if (response.statusCode === 302 || response.statusCode === 301) {
            const redirectUrl = response.headers.location;
            console.log(`Redirecting to: ${redirectUrl}`);

            if (attempt > 5) {
              reject(new Error('Too many redirects'));
              return;
            }

            download(redirectUrl, attempt + 1);
            return;
          }

          if (response.statusCode !== 200) {
            reject(new Error(`Download failed with status code: ${response.statusCode}`));
            return;
          }

          const totalSize = parseInt(response.headers['content-length'], 10);
          let downloadedSize = 0;

          console.log(`Starting download: ${(totalSize / (1024 * 1024)).toFixed(2)} MB`);

          response.on('data', (chunk) => {
            downloadedSize += chunk.length;
            const progress = (downloadedSize / totalSize) * 100;

            if (onProgress) {
              onProgress(progress, downloadedSize, totalSize);
            }
          });

          response.pipe(file);

          file.on('finish', () => {
            file.close();
            console.log('Download completed:', downloadPath);
            resolve(downloadPath);
          });

          file.on('error', (error) => {
            fs.unlink(downloadPath, () => { });
            reject(new Error('File write error: ' + error.message));
          });
        }).on('error', (error) => {
          fs.unlink(downloadPath, () => { });
          reject(new Error('Download failed: ' + error.message));
        });
      };

      download(this.downloadUrl);
    });
  }

  /**
   * Install the downloaded update
   */
  async installUpdate(installerPath) {
    return new Promise((resolve, reject) => {
      // Check if file exists
      if (!fs.existsSync(installerPath)) {
        reject(new Error('Installer file not found'));
        return;
      }

      console.log('Installing update from:', installerPath);

      // Check file extension
      const ext = path.extname(installerPath).toLowerCase();

      if (ext === '.exe') {
        // For .exe installers, use silent install flags
        const args = ['/S']; // Silent install flag for NSIS installers

        console.log('Launching installer with args:', args);

        execFile(installerPath, args, (error, stdout, stderr) => {
          if (error) {
            console.error('Installer error:', error);
            console.error('Stderr:', stderr);
            // Even if there's an error, we should quit and let installer run
          }

          console.log('Installer launched successfully');
          console.log('Stdout:', stdout);

          // Quit the app to allow installation
          setTimeout(() => {
            console.log('Quitting app for installation...');
            app.quit();
          }, 1000);

          resolve();
        });
      } else if (ext === '.msi') {
        // For .msi installers, use msiexec
        const args = ['/i', installerPath, '/qn', '/norestart'];

        console.log('Launching MSI installer');

        execFile('msiexec', args, (error, stdout, stderr) => {
          if (error) {
            console.error('MSI installer error:', error);
            reject(new Error('Failed to launch MSI installer: ' + error.message));
            return;
          }

          console.log('MSI installer launched successfully');

          // Quit the app to allow installation
          setTimeout(() => {
            app.quit();
          }, 1000);

          resolve();
        });
      } else {
        reject(new Error('Unsupported installer format. Expected .exe or .msi'));
      }
    });
  }
}

module.exports = Updater;
