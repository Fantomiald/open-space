const { contextBridge, ipcRenderer } = require('electron');

// A few native actions, with no renderer-supplied IPC channel, and no renderer-supplied path but one: the project's
// folder to open, which the main process checks itself (a real folder among the allowed ones, never a file). The main
// process also checks which window asks.
if (process.isMainFrame) {
  contextBridge.exposeInMainWorld('openSpaceDesktop', {
    ...(process.platform === 'win32' ? { pickFolder: () => ipcRenderer.invoke('open-space:pick-folder') } : {}),
    openFolder: (folder) => ipcRenderer.invoke('open-space:open-folder', typeof folder === 'string' ? folder : ''),
    putBack: () => ipcRenderer.invoke('open-space:out-back'),
    keepOnTop: (on) => ipcRenderer.invoke('open-space:out-top', typeof on === 'boolean' ? on : undefined),
  });
}
