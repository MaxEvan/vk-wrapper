import { app, BrowserWindow } from 'electron';
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

    // Create window with loading screen
    this.windowManager.createMainWindow();

    try {
      // Start the vibe-kanban server
      console.log('Starting vibe-kanban server...');
      const serverUrl = await this.serverManager.startServer();
      console.log('Server ready at:', serverUrl);

      // Load the server URL in the window
      this.windowManager.loadServerUrl(serverUrl);
    } catch (error) {
      console.error('Failed to start server:', error);
      this.windowManager.showError(
        error instanceof Error ? error.message : 'Unknown error'
      );
    }

    this.setupEventHandlers();
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
