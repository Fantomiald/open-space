const { contextBridge, ipcRenderer } = require('electron');

// A single native action, with no renderer-supplied path or IPC channel.
if (process.platform === 'win32' && process.isMainFrame) {
  contextBridge.exposeInMainWorld('openSpaceDesktop', {
    pickFolder: () => ipcRenderer.invoke('open-space:pick-folder'),
  });
}
