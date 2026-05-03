import { contextBridge, ipcRenderer } from 'electron';

contextBridge.exposeInMainWorld('desktopEnvironment', {
  platform: process.platform,
});
contextBridge.exposeInMainWorld('ipcInvoke', ipcRenderer.invoke);
