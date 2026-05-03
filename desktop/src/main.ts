import { app, BrowserWindow } from 'electron';
import path from 'node:path';
import started from 'electron-squirrel-startup';
import { registerIpcMain } from '@egoist/tipc/main';

import { closeChatSession } from './main/chat/angel-client';
import { registerChatStreamIpc } from './main/chat/stream-ipc';
import { closeProjectsDatabase } from './main/projects/repository';
import { appRouter } from './main/router';

const isMacOS = process.platform === 'darwin';

// Handle creating/removing shortcuts on Windows when installing/uninstalling.
if (started) {
  app.quit();
}

const createWindow = () => {
  // Create the browser window.
  const mainWindow = new BrowserWindow({
    ...(isMacOS
      ? {
          backgroundColor: '#00000000',
          titleBarStyle: 'hidden' as const,
          trafficLightPosition: { x: 16, y: 18 },
          transparent: true,
          vibrancy: 'under-window' as const,
          visualEffectState: 'active' as const,
        }
      : {}),
    height: 820,
    minHeight: 640,
    minWidth: 960,
    width: 1200,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
    },
  });

  if (isMacOS) {
    mainWindow.setBackgroundColor('#00000000');
    mainWindow.setVibrancy('under-window', { animationDuration: 0 });
    mainWindow.setWindowButtonPosition({ x: 16, y: 18 });
  }

  // and load the index.html of the app.
  if (MAIN_WINDOW_VITE_DEV_SERVER_URL) {
    mainWindow.loadURL(MAIN_WINDOW_VITE_DEV_SERVER_URL);
  } else {
    mainWindow.loadFile(
      path.join(__dirname, `../renderer/${MAIN_WINDOW_VITE_NAME}/index.html`),
    );
  }

  // Open the DevTools.
  mainWindow.webContents.openDevTools();
};

// This method will be called when Electron has finished
// initialization and is ready to create browser windows.
// Some APIs can only be used after this event occurs.
app.whenReady().then(() => {
  registerIpcMain(appRouter);
  registerChatStreamIpc();
  createWindow();
});

app.on('before-quit', () => {
  closeChatSession();
  closeProjectsDatabase();
});

// Quit when all windows are closed, except on macOS. There, it's common
// for applications and their menu bar to stay active until the user quits
// explicitly with Cmd + Q.
app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('activate', () => {
  // On OS X it's common to re-create a window in the app when the
  // dock icon is clicked and there are no other windows open.
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow();
  }
});

// In this file you can include the rest of your app's specific main process
// code. You can also put them in separate files and import them here.
