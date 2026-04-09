// Preload script — runs in renderer context with access to Node APIs disabled.
// We only expose what's strictly needed.
const { contextBridge } = require('electron');

contextBridge.exposeInMainWorld('icloudApp', {
  version: process.env.npm_package_version || '1.0.0'
});
