const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('praviloDesktop', {
  isDesktopApp: true,
  platform: process.platform,
  getConfig: () => ipcRenderer.invoke('desktop:get-config'),
  getAppInfo: () => ipcRenderer.invoke('desktop:get-app-info'),
  setServerUrl: (url) => ipcRenderer.invoke('desktop:set-server-url', url),
  checkGithubRelease: (githubRepo) => ipcRenderer.invoke('desktop:check-github-release', githubRepo),
  downloadInstaller: (payload) => ipcRenderer.invoke('desktop:download-installer', payload),
  openGithubUrl: (url) => ipcRenderer.invoke('desktop:open-github-url', url),
  bluetooth: {
    listDevices: () => ipcRenderer.invoke('desktop:bt-list'),
    connect: (params) => ipcRenderer.invoke('desktop:bt-connect', params),
    disconnect: (type) => ipcRenderer.invoke('desktop:bt-disconnect', type),
    write: (type, command) => ipcRenderer.invoke('desktop:bt-write', type, command),
    onEvent: (callback) => {
      const handler = (_ev, payload) => callback(payload);
      ipcRenderer.on('desktop:bt-event', handler);
      return () => ipcRenderer.removeListener('desktop:bt-event', handler);
    },
    pickWebBleDevice: (deviceId) => ipcRenderer.invoke('desktop:webble-pick', deviceId),
    onWebBleDevices: (callback) => {
      const handler = (_ev, list) => callback(list);
      ipcRenderer.on('desktop:webble-devices', handler);
      return () => ipcRenderer.removeListener('desktop:webble-devices', handler);
    },
  },
});
