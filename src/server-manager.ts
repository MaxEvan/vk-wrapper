import { spawn, ChildProcess, execSync } from 'child_process';
import path from 'path';
import os from 'os';
import fs from 'fs';
import { ConfigManager } from './config-manager';

export class ServerManager {
  private serverProcess: ChildProcess | null = null;
  private serverUrl: string | null = null;
  private configManager: ConfigManager;
  private cachedShellEnv: NodeJS.ProcessEnv | null = null;
  private readonly URL_REGEX = /https?:\/\/(?:localhost|127\.0\.0\.1|0\.0\.0\.0):\d+/;
  private readonly STARTUP_TIMEOUT = 60000; // 60 seconds (first run may need to download)

  constructor(configManager: ConfigManager) {
    this.configManager = configManager;
  }

  /**
   * Capture the user's shell environment by spawning a login shell.
   * GUI apps on macOS don't inherit the terminal environment, so we need to
   * explicitly load the user's shell configuration to get their PATH, etc.
   */
  private async getShellEnvironment(): Promise<NodeJS.ProcessEnv> {
    // Return cached environment if available
    if (this.cachedShellEnv) {
      return this.cachedShellEnv;
    }

    return new Promise((resolve) => {
      // Use the user's preferred shell, or fall back to common shells
      const shell = process.env.SHELL || '/bin/zsh';

      // -i: interactive (sources .bashrc/.zshrc)
      // -l: login shell (sources .profile, .bash_profile, .zprofile)
      // -c: run command
      const child = spawn(shell, ['-ilc', 'env'], {
        stdio: ['ignore', 'pipe', 'pipe'],
      });

      let stdout = '';
      const timeout = setTimeout(() => {
        child.kill();
        console.log('Shell environment capture timed out, using process.env');
        resolve(process.env);
      }, 5000);

      child.stdout?.on('data', (data: Buffer) => {
        stdout += data.toString();
      });

      child.on('error', (err) => {
        clearTimeout(timeout);
        console.log(`Failed to get shell environment: ${err.message}, using process.env`);
        resolve(process.env);
      });

      child.on('close', (code) => {
        clearTimeout(timeout);

        if (code !== 0) {
          console.log(`Shell exited with code ${code}, using process.env`);
          resolve(process.env);
          return;
        }

        const env: NodeJS.ProcessEnv = {};
        for (const line of stdout.split('\n')) {
          const idx = line.indexOf('=');
          if (idx > 0) {
            const key = line.slice(0, idx);
            const value = line.slice(idx + 1);
            env[key] = value;
          }
        }

        // Cache the result for future calls
        this.cachedShellEnv = env;
        console.log('Successfully captured shell environment');
        resolve(env);
      });
    });
  }

  isRunning(): boolean {
    return this.serverProcess !== null && !this.serverProcess.killed;
  }

  getUrl(): string | null {
    return this.serverUrl;
  }

  private getShellCommand(): { shell: string; args: string[] } {
    if (process.platform === 'win32') {
      return {
        shell: 'cmd.exe',
        args: ['/c'],
      };
    } else {
      // macOS and Linux - use bash as it's more universal than zsh
      return {
        shell: '/bin/bash',
        args: ['-l', '-c'],
      };
    }
  }

  /**
   * Resolve a proto shim path to the actual binary path.
   * Proto shims are wrappers that need the proto runtime, but we can
   * find the actual binaries in ~/.proto/tools/<tool>/<version>/bin/
   */
  private resolveProtoShim(shimPath: string, binaryName: string): string {
    if (!shimPath.includes('.proto/shims')) {
      return shimPath;
    }

    const homeDir = os.homedir();
    // npx comes bundled with node, so look in the node tool directory
    const toolName = binaryName === 'npx' ? 'node' : binaryName;
    const protoToolsDir = path.join(homeDir, '.proto', 'tools', toolName);

    // Check if the tools directory exists
    if (!fs.existsSync(protoToolsDir)) {
      console.log(`Proto tools directory not found: ${protoToolsDir}`);
      return shimPath;
    }

    // List installed versions and find the latest
    const versions = fs.readdirSync(protoToolsDir).filter(dir => {
      const fullPath = path.join(protoToolsDir, dir);
      return fs.statSync(fullPath).isDirectory() && /^\d+\.\d+/.test(dir);
    });

    if (versions.length === 0) {
      console.log(`No ${toolName} versions found in proto tools`);
      return shimPath;
    }

    // Sort versions descending (highest first)
    versions.sort((a, b) => {
      const partsA = a.split('.').map(n => parseInt(n, 10) || 0);
      const partsB = b.split('.').map(n => parseInt(n, 10) || 0);
      for (let i = 0; i < Math.max(partsA.length, partsB.length); i++) {
        const diff = (partsB[i] || 0) - (partsA[i] || 0);
        if (diff !== 0) return diff;
      }
      return 0;
    });

    const latestVersion = versions[0];
    const actualBinaryPath = path.join(protoToolsDir, latestVersion, 'bin', binaryName);

    if (fs.existsSync(actualBinaryPath)) {
      console.log(`Resolved proto shim ${shimPath} to ${actualBinaryPath}`);
      return actualBinaryPath;
    }

    console.log(`Actual binary not found at: ${actualBinaryPath}`);
    return shimPath;
  }

  private getPaths(): { nodePath: string; npxPath: string } {
    let nodePath = this.configManager.getNodePath();
    let npxPath = this.configManager.getNpxPath();

    if (!nodePath || !npxPath) {
      throw new Error('PATHS_NOT_CONFIGURED');
    }

    // Resolve proto shims to actual binaries
    // Both node and npx are in the 'node' tool directory since npx comes with node
    nodePath = this.resolveProtoShim(nodePath, 'node');
    npxPath = this.resolveProtoShim(npxPath, 'npx');

    return { nodePath, npxPath };
  }

  async startServer(port?: number): Promise<string> {
    // Get configured paths
    const { nodePath, npxPath } = this.getPaths();
    const nodeDir = path.dirname(nodePath);
    const homeDir = os.homedir();

    // Get the user's shell environment (includes their PATH, version managers, etc.)
    const shellEnv = await this.getShellEnvironment();

    // Build environment by extending the user's shell environment
    const env: NodeJS.ProcessEnv = {
      ...shellEnv,
      // Prepend node directory to PATH so npx can find the configured node
      PATH: `${nodeDir}:${shellEnv.PATH || '/usr/local/bin:/usr/bin:/bin'}`,
      // Disable auto-opening browser since we're handling that
      BROWSER: 'none',
      // Set port if specified
      ...(port ? { PORT: String(port) } : {}),
    };

    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        this.killServer();
        reject(new Error('Server startup timeout. Please check your internet connection and try again.'));
      }, this.STARTUP_TIMEOUT);

      let stderrOutput = '';

      // Spawn via shell to ensure proper environment setup
      const { shell, args } = this.getShellCommand();
      const command = `"${npxPath}" vibe-kanban@latest`;

      this.serverProcess = spawn(shell, [...args, command], {
        stdio: ['ignore', 'pipe', 'pipe'],
        detached: false,
        env,
        cwd: homeDir,
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

          // Include stderr for debugging
          if (stderrOutput) {
            errorMessage += `\n\nError output:\n${stderrOutput.slice(0, 500)}`;
          }

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
