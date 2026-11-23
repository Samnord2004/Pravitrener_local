const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('praviloDesktop', {
  isDesktopApp: true,
  getConfig: () => ipcRenderer.invoke('desktop:get-config'),
  setServerUrl: (url) => ipcRenderer.invoke('desktop:set-server-url', url),
});
