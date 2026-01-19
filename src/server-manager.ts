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

      // Spawn npx with detached: false to keep it in our process group
      // This ensures child processes are killed when we kill the parent
      this.serverProcess = spawn(npxPath, ['vibe-kanban@latest'], {
        stdio: ['ignore', 'pipe', 'pipe'],
        detached: false,
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

  private killProcessTree(pid: number): void {
    if (process.platform === 'win32') {
      // Windows: use taskkill with /T to kill process tree
      try {
        execSync(`taskkill /pid ${pid} /T /F`, { stdio: 'pipe' });
      } catch {
        // Process may already be dead
      }
    } else {
      // macOS/Linux: kill the process group
      // First try to find and kill child processes
      try {
        // Find all child processes using pgrep
        const children = execSync(`pgrep -P ${pid}`, { stdio: 'pipe', encoding: 'utf-8' })
          .trim()
          .split('\n')
          .filter(Boolean);

        // Kill children first
        for (const childPid of children) {
          try {
            process.kill(parseInt(childPid, 10), 'SIGTERM');
          } catch {
            // Child may already be dead
          }
        }
      } catch {
        // No children or pgrep failed
      }

      // Also try pkill to kill any vibe-kanban processes we spawned
      try {
        execSync('pkill -f "vibe-kanban"', { stdio: 'pipe' });
      } catch {
        // No matching processes
      }
    }
  }

  async killServer(): Promise<void> {
    return new Promise((resolve) => {
      if (!this.serverProcess || this.serverProcess.killed) {
        this.serverProcess = null;
        this.serverUrl = null;
        resolve();
        return;
      }

      const pid = this.serverProcess.pid;

      const forceKillTimeout = setTimeout(() => {
        // Force kill if graceful shutdown fails
        console.log('Force killing server process tree');
        if (pid) {
          this.killProcessTree(pid);
        }
        this.serverProcess = null;
        this.serverUrl = null;
        resolve();
      }, 3000); // 3 second grace period

      this.serverProcess.once('exit', () => {
        clearTimeout(forceKillTimeout);
        // Also clean up any orphaned children
        if (pid) {
          this.killProcessTree(pid);
        }
        this.serverProcess = null;
        this.serverUrl = null;
        resolve();
      });

      // Send graceful shutdown signal to the process tree
      if (pid) {
        console.log('Sending SIGTERM to server process tree...');
        this.killProcessTree(pid);
      }
    });
  }
}
