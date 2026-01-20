import { contextBridge, ipcRenderer } from 'electron';

// Expose protected methods that allow the renderer process to use
// ipcRenderer without exposing the entire object
contextBridge.exposeInMainWorld('electronAPI', {
  launchServer: (port?: number) => ipcRenderer.invoke('launch-server', port),
  getPaths: () => ipcRenderer.invoke('get-paths'),
  setPaths: (nodePath: string, npxPath: string) => ipcRenderer.invoke('set-paths', nodePath, npxPath),
  browseForNode: () => ipcRenderer.invoke('browse-for-node'),
  browseForNpx: () => ipcRenderer.invoke('browse-for-npx'),
});
