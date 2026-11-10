const { contextBridge, ipcRenderer } = require('electron');

// A few native actions, with no renderer-supplied path or IPC channel. The main process checks which window asks.
if (process.isMainFrame) {
  contextBridge.exposeInMainWorld('openSpaceDesktop', {
    ...(process.platform === 'win32' ? { pickFolder: () => ipcRenderer.invoke('open-space:pick-folder') } : {}),
    putBack: () => ipcRenderer.invoke('open-space:out-back'),
    keepOnTop: (on) => ipcRenderer.invoke('open-space:out-top', typeof on === 'boolean' ? on : undefined),
  });
}
