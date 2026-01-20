// avoid linting errors
export { };

// Type declaration for the exposed API
declare global {
  interface Window {
    electronAPI: {
      launchServer: (port?: number) => Promise<void>;
      getPaths: () => Promise<{ nodePath: string | null; npxPath: string | null }>;
      setPaths: (nodePath: string, npxPath: string) => Promise<void>;
      browseForNode: () => Promise<string | null>;
      browseForNpx: () => Promise<string | null>;
    };
  }
}

// DOM elements
const setupScreen = document.getElementById('setup-screen') as HTMLDivElement;
const configScreen = document.getElementById('config-screen') as HTMLDivElement;
const loadingScreen = document.getElementById('loading-screen') as HTMLDivElement;

const nodePathInput = document.getElementById('node-path') as HTMLInputElement;
const npxPathInput = document.getElementById('npx-path') as HTMLInputElement;
const browseNodeBtn = document.getElementById('browse-node-btn') as HTMLButtonElement;
const browseNpxBtn = document.getElementById('browse-npx-btn') as HTMLButtonElement;
const savePathsBtn = document.getElementById('save-paths-btn') as HTMLButtonElement;
const setupStatus = document.getElementById('setup-status') as HTMLParagraphElement;

const portInput = document.getElementById('port') as HTMLInputElement;
const launchBtn = document.getElementById('launch-btn') as HTMLButtonElement;

// Check if paths are configured on startup
async function checkConfig() {
  const paths = await window.electronAPI.getPaths();

  if (paths.nodePath && paths.npxPath) {
    // Already configured, show main config screen
    setupScreen.classList.remove('visible');
    configScreen.classList.add('visible');
  } else {
    // Need user to configure
    setupScreen.classList.add('visible');
    configScreen.classList.remove('visible');
  }
}

// Browse for node
browseNodeBtn.addEventListener('click', async () => {
  const selected = await window.electronAPI.browseForNode();
  if (selected) {
    nodePathInput.value = selected;
    setupStatus.textContent = '';
  }
});

// Browse for npx
browseNpxBtn.addEventListener('click', async () => {
  const selected = await window.electronAPI.browseForNpx();
  if (selected) {
    npxPathInput.value = selected;
    setupStatus.textContent = '';
  }
});

// Save paths
savePathsBtn.addEventListener('click', async () => {
  const nodePath = nodePathInput.value.trim();
  const npxPath = npxPathInput.value.trim();

  if (!nodePath || !npxPath) {
    setupStatus.textContent = 'Please provide both node and npx paths.';
    setupStatus.className = 'status error';
    return;
  }

  await window.electronAPI.setPaths(nodePath, npxPath);
  setupScreen.classList.remove('visible');
  configScreen.classList.add('visible');
});

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
  configScreen.classList.remove('visible');
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

npxPathInput.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') {
    savePathsBtn.click();
  }
});

// Initialize
checkConfig();
