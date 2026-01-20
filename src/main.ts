import { app, BrowserWindow, ipcMain } from 'electron';
import path from 'path';
import started from 'electron-squirrel-startup';
import { ServerManager } from './server-manager';
import { WindowManager } from './window-manager';

// Handle creating/removing shortcuts on Windows when installing/uninstalling.
if (started) {
  app.quit();
}

class VibeKanbanApp {
  private serverManager = new ServerManager();
  private windowManager = new WindowManager();
  private isQuitting = false;

  async initialize(): Promise<void> {
    await app.whenReady();

    // Set dock icon on macOS
    if (process.platform === 'darwin' && app.dock) {
      const iconPath = path.join(app.getAppPath(), 'assets', 'icon.png');
      app.dock.setIcon(iconPath);
    }

    // Create window with config screen
    this.windowManager.createMainWindow();

    // Setup IPC handler for launch-server
    ipcMain.handle('launch-server', async (_event, port?: number) => {
      await this.launchServer(port);
    });

    this.setupEventHandlers();
  }

  private async launchServer(port?: number): Promise<void> {
    try {
      // Start the vibe-kanban server
      console.log('Starting vibe-kanban server...', port ? `on port ${port}` : '(auto port)');
      const serverUrl = await this.serverManager.startServer(port);
      console.log('Server ready at:', serverUrl);

      // Load the server URL in the window
      this.windowManager.loadServerUrl(serverUrl);
    } catch (error) {
      console.error('Failed to start server:', error);
      this.windowManager.showError(
        error instanceof Error ? error.message : 'Unknown error'
      );
    }
  }

  private setupEventHandlers(): void {
    // macOS: re-create window when dock icon clicked
    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) {
        this.windowManager.createMainWindow();
        if (this.serverManager.isRunning()) {
          const url = this.serverManager.getUrl();
          if (url) {
            this.windowManager.loadServerUrl(url);
          }
        }
      }
    });

    // Handle app quit request
    app.on('before-quit', async (event) => {
      if (!this.isQuitting) {
        event.preventDefault();
        this.isQuitting = true;

        console.log('Shutting down server...');
        await this.serverManager.killServer();
        console.log('Server stopped');

        app.quit();
      }
    });

    // Handle all windows closed
    app.on('window-all-closed', () => {
      // On macOS, apps typically stay open until Cmd+Q
      if (process.platform !== 'darwin') {
        app.quit();
      }
    });

    // Handle SIGINT/SIGTERM (Ctrl+C in terminal)
    process.on('SIGINT', () => this.gracefulShutdown());
    process.on('SIGTERM', () => this.gracefulShutdown());
  }

  private async gracefulShutdown(): Promise<void> {
    if (!this.isQuitting) {
      this.isQuitting = true;
      await this.serverManager.killServer();
      app.exit(0);
    }
  }
}

const vibeKanbanApp = new VibeKanbanApp();
vibeKanbanApp.initialize().catch(console.error);
