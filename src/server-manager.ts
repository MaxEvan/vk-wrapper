import { spawn, ChildProcess, execSync } from 'child_process';

export class ServerManager {
  private serverProcess: ChildProcess | null = null;
  private serverUrl: string | null = null;
  private readonly URL_REGEX = /https?:\/\/(?:localhost|127\.0\.0\.1|0\.0\.0\.0):\d+/;
  private readonly STARTUP_TIMEOUT = 60000; // 60 seconds (first run may need to download)

  isRunning(): boolean {
    return this.serverProcess !== null && !this.serverProcess.killed;
  }

  getUrl(): string | null {
    return this.serverUrl;
  }

  private getNpxPath(): string {
    // Find npx in PATH
    try {
      if (process.platform === 'win32') {
        return execSync('where npx', { stdio: 'pipe', encoding: 'utf-8' }).trim().split('\n')[0];
      } else {
        return execSync('which npx', { stdio: 'pipe', encoding: 'utf-8' }).trim();
      }
    } catch {
      throw new Error(
        'Node.js/npx is not installed or not in PATH.\n\n' +
        'Please install Node.js 18+ from https://nodejs.org'
      );
    }
  }

  async startServer(): Promise<string> {
    return new Promise((resolve, reject) => {
      // Get npx path first (also validates Node.js is available)
      let npxPath: string;
      try {
        npxPath = this.getNpxPath();
      } catch (error) {
        reject(error);
        return;
      }

      const timeout = setTimeout(() => {
        this.killServer();
        reject(new Error('Server startup timeout. Please check your internet connection and try again.'));
      }, this.STARTUP_TIMEOUT);

      let stderrOutput = '';

      // Spawn npx without shell: true to avoid deprecation warning
      // Use the full path to npx and pass args as array
      this.serverProcess = spawn(npxPath, ['vibe-kanban@latest'], {
        stdio: ['ignore', 'pipe', 'pipe'],
        env: {
          ...process.env,
          // Disable auto-opening browser since we're handling that
          BROWSER: 'none',
        },
      });

      this.serverProcess.stdout?.on('data', (data: Buffer) => {
        const output = data.toString();
        console.log('[vibe-kanban]', output);

        // Look for URL in output
        const match = output.match(this.URL_REGEX);
        if (match && !this.serverUrl) {
          this.serverUrl = match[0];
          // Replace 0.0.0.0 with localhost for the browser
          if (this.serverUrl.includes('0.0.0.0')) {
            this.serverUrl = this.serverUrl.replace('0.0.0.0', 'localhost');
          }
          clearTimeout(timeout);
          resolve(this.serverUrl);
        }
      });

      this.serverProcess.stderr?.on('data', (data: Buffer) => {
        const output = data.toString();
        stderrOutput += output;
        console.error('[vibe-kanban error]', output);

        // Also check stderr for URL (some tools output there)
        const match = output.match(this.URL_REGEX);
        if (match && !this.serverUrl) {
          this.serverUrl = match[0];
          if (this.serverUrl.includes('0.0.0.0')) {
            this.serverUrl = this.serverUrl.replace('0.0.0.0', 'localhost');
          }
          clearTimeout(timeout);
          resolve(this.serverUrl);
        }
      });

      this.serverProcess.on('error', (err) => {
        clearTimeout(timeout);
        reject(new Error(`Failed to start server: ${err.message}`));
      });

      this.serverProcess.on('exit', (code) => {
        if (!this.serverUrl) {
          clearTimeout(timeout);

          // Provide better error messages for common issues
          let errorMessage = `Server exited with code ${code} before becoming ready`;

          if (stderrOutput.includes('AddrInUse') || stderrOutput.includes('Address already in use')) {
            errorMessage = 'Port is already in use.\n\nAnother instance of vibe-kanban may be running.\nPlease close it and try again.';
          } else if (stderrOutput.includes('ENOENT') || stderrOutput.includes('not found')) {
            errorMessage = 'Failed to find vibe-kanban.\n\nPlease ensure you have internet access.';
          }

          reject(new Error(errorMessage));
        }
        this.serverProcess = null;
      });
    });
  }

  async killServer(): Promise<void> {
    return new Promise((resolve) => {
      if (!this.serverProcess || this.serverProcess.killed) {
        this.serverProcess = null;
        this.serverUrl = null;
        resolve();
        return;
      }

      const forceKillTimeout = setTimeout(() => {
        // Force kill if graceful shutdown fails
        if (this.serverProcess && !this.serverProcess.killed) {
          console.log('Force killing server process');
          if (process.platform === 'win32') {
            try {
              execSync(`taskkill /pid ${this.serverProcess.pid} /f /t`, { stdio: 'pipe' });
            } catch {
              // Process may already be dead
            }
          } else {
            this.serverProcess.kill('SIGKILL');
          }
        }
        this.serverProcess = null;
        this.serverUrl = null;
        resolve();
      }, 5000); // 5 second grace period

      this.serverProcess.once('exit', () => {
        clearTimeout(forceKillTimeout);
        this.serverProcess = null;
        this.serverUrl = null;
        resolve();
      });

      // Send graceful shutdown signal
      if (process.platform === 'win32') {
        try {
          execSync(`taskkill /pid ${this.serverProcess.pid} /t`, { stdio: 'pipe' });
        } catch {
          // Process may already be dead
        }
      } else {
        this.serverProcess.kill('SIGTERM');
      }
    });
  }
}
