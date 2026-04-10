const { contextBridge, ipcRenderer, webUtils } = require('electron');

contextBridge.exposeInMainWorld('api', {
  // Get real filesystem path from a dropped File object
  getFilePath: (file) => webUtils.getPathForFile(file),

  // File info via ffprobe
  getFileInfo: (filePath) => ipcRenderer.invoke('file:info', filePath),

  // Open Finder at file location
  openInFinder: (filePath) => ipcRenderer.invoke('file:open-folder', filePath),

  // Open file picker dialog (returns array of paths)
  openFiles: () => ipcRenderer.invoke('dialog:open-files'),

  // Select output folder
  selectOutputFolder: () => ipcRenderer.invoke('dialog:select-output-folder'),

  // Start compression queue
  startCompression: (files, options) => ipcRenderer.send('compress:start', { files, options }),

  // Cancel current compression
  cancelCompression: () => ipcRenderer.send('compress:cancel'),

  // Listen for progress updates
  onProgress: (callback) => {
    ipcRenderer.on('compress:progress', (_, data) => callback(data));
  },

  // Listen for completion
  onDone: (callback) => {
    ipcRenderer.on('compress:done', (_, data) => callback(data));
  },

  // Listen for errors
  onError: (callback) => {
    ipcRenderer.on('compress:error', (_, data) => callback(data));
  },

  // Remove all listeners (cleanup)
  removeAllListeners: () => {
    ipcRenderer.removeAllListeners('compress:progress');
    ipcRenderer.removeAllListeners('compress:done');
    ipcRenderer.removeAllListeners('compress:error');
  },
});
