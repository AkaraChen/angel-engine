import { contextBridge, ipcRenderer } from 'electron';

contextBridge.exposeInMainWorld('ipcInvoke', ipcRenderer.invoke);
