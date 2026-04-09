// Preload script — runs in renderer context with access to Node APIs disabled.
// We only expose what's strictly needed.
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('icloudApp', {
  version: process.env.npm_package_version || '1.0.0',
  saveCredentials: (email, password) => ipcRenderer.invoke('save-credentials', { email, password }),
  loadCredentials: () => ipcRenderer.invoke('load-credentials'),
  clearCredentials: () => ipcRenderer.invoke('clear-credentials')
});
