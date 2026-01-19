// Type declaration for the exposed API
declare global {
  interface Window {
    electronAPI: {
      launchServer: (port?: number) => Promise<void>;
    };
  }
}

// DOM elements
const configScreen = document.getElementById('config-screen') as HTMLDivElement;
const loadingScreen = document.getElementById('loading-screen') as HTMLDivElement;
const portInput = document.getElementById('port') as HTMLInputElement;
const launchBtn = document.getElementById('launch-btn') as HTMLButtonElement;

// Handle launch button click
launchBtn.addEventListener('click', async () => {
  const portValue = portInput.value.trim();
  const port = portValue ? parseInt(portValue, 10) : undefined;

  // Validate port if provided
  if (port !== undefined && (isNaN(port) || port < 1024 || port > 65535)) {
    alert('Please enter a valid port number between 1024 and 65535');
    return;
  }

  // Switch to loading screen
  configScreen.classList.add('hidden');
  loadingScreen.classList.add('visible');
  launchBtn.disabled = true;

  // Launch the server
  try {
    await window.electronAPI.launchServer(port);
  } catch (error) {
    // Error will be handled by main process showing error page
    console.error('Failed to launch server:', error);
  }
});

// Allow Enter key to submit
portInput.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') {
    launchBtn.click();
  }
});
