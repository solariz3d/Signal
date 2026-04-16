const { contextBridge } = require('electron');

// Nothing to expose — audio capture happens entirely in the renderer
contextBridge.exposeInMainWorld('signalAudio', {
  version: '1.0.0'
});
