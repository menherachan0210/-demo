const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('demoApi', {
  getState: () => ipcRenderer.invoke('demo:get-state'),
  refreshState: () => ipcRenderer.invoke('demo:refresh-state'),
  clearScans: () => ipcRenderer.invoke('demo:clear-scans'),
  copyText: (text) => ipcRenderer.invoke('demo:copy-text', text),
  subscribe: (handler) => {
    const listener = (_event, state) => handler(state);
    ipcRenderer.on('demo:state', listener);

    return () => {
      ipcRenderer.removeListener('demo:state', listener);
    };
  }
});
