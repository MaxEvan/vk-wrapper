import { BrowserWindow, shell, app } from 'electron';
import path from 'path';

// Vite injects these constants
declare const MAIN_WINDOW_VITE_DEV_SERVER_URL: string | undefined;
declare const MAIN_WINDOW_VITE_NAME: string;

export class WindowManager {
  private mainWindow: BrowserWindow | null = null;

  createMainWindow(): BrowserWindow {
    // Get icon path - extraResource files are in Resources folder when packaged
    const iconPath = app.isPackaged
      ? path.join(process.resourcesPath, 'assets', 'icon.png')
      : path.join(app.getAppPath(), 'assets', 'icon.png');

    this.mainWindow = new BrowserWindow({
      width: 1400,
      height: 900,
      minWidth: 800,
      minHeight: 600,
      title: 'VK Wrapper',
      icon: iconPath,
      show: false,
      webPreferences: {
        preload: path.join(__dirname, 'preload.js'),
        contextIsolation: true,
        nodeIntegration: false,
      },
    });

    // Show loading screen initially
    if (MAIN_WINDOW_VITE_DEV_SERVER_URL) {
      this.mainWindow.loadURL(MAIN_WINDOW_VITE_DEV_SERVER_URL);
    } else {
      this.mainWindow.loadFile(path.join(__dirname, `../renderer/${MAIN_WINDOW_VITE_NAME}/index.html`));
    }

    // Open external links in default browser
    this.mainWindow.webContents.setWindowOpenHandler(({ url }) => {
      shell.openExternal(url);
      return { action: 'deny' };
    });

    // Show window when ready, with fallback timeout
    let shown = false;
    const showWindow = () => {
      if (!shown && this.mainWindow && !this.mainWindow.isDestroyed()) {
        shown = true;
        this.mainWindow.show();
      }
    };

    this.mainWindow.once('ready-to-show', showWindow);

    // Fallback: show window after 3 seconds even if ready-to-show doesn't fire
    setTimeout(showWindow, 3000);

    return this.mainWindow;
  }

  getWindow(): BrowserWindow | null {
    return this.mainWindow;
  }

  loadServerUrl(url: string): void {
    if (this.mainWindow && !this.mainWindow.isDestroyed()) {
      this.mainWindow.loadURL(url);
    }
  }

  showError(message: string): void {
    if (this.mainWindow && !this.mainWindow.isDestroyed()) {
      const errorHtml = `
        <!DOCTYPE html>
        <html>
        <head>
          <meta charset="UTF-8">
          <title>VK Wrapper - Error</title>
          <style>
            body {
              font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, sans-serif;
              background: linear-gradient(135deg, #1a1a2e 0%, #16213e 100%);
              color: #eee;
              display: flex;
              align-items: center;
              justify-content: center;
              height: 100vh;
              margin: 0;
              padding: 20px;
              box-sizing: border-box;
            }
            .error-container {
              text-align: center;
              max-width: 500px;
            }
            h1 {
              color: #ff6b6b;
              margin-bottom: 20px;
            }
            p {
              line-height: 1.6;
              color: #ccc;
            }
            .error-message {
              background: rgba(255, 107, 107, 0.1);
              border: 1px solid rgba(255, 107, 107, 0.3);
              border-radius: 8px;
              padding: 15px;
              margin: 20px 0;
              font-family: monospace;
              font-size: 14px;
              word-break: break-word;
            }
            .hint {
              font-size: 14px;
              color: #888;
            }
          </style>
        </head>
        <body>
          <div class="error-container">
            <h1>Failed to Start</h1>
            <div class="error-message">${message.replace(/\n/g, '<br>')}</div>
            <p class="hint">Please check that Node.js 18+ is installed and try again.</p>
          </div>
        </body>
        </html>
      `;
      this.mainWindow.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(errorHtml)}`);
    }
  }
}
