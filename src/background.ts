/* eslint-disable prettier/prettier */
'use strict';

import {
  app,
  protocol,
  BrowserWindow,
  ipcMain,
  globalShortcut,
  shell,
  screen,
  Tray,
  Menu,
} from 'electron';
import { createProtocol } from 'vue-cli-plugin-electron-builder/lib';
import installExtension, { VUEJS_DEVTOOLS } from 'electron-devtools-installer';
import { autoUpdater } from 'electron-updater';
import * as path from 'path';

declare const __static: string;

let overlayWins: BrowserWindow[] = [];
let settingsWin: BrowserWindow | null = null;
let tray: Tray | null = null;

// @ts-ignore
app.isQuitting = false;

const isDevelopment = process.env.NODE_ENV !== 'production';

let oldKeyboardShortcut: string | null = null;
let keyBindDialog: BrowserWindow | null = null;
let currentOpacity = 8;

protocol.registerSchemesAsPrivileged([
  { scheme: 'app', privileges: { secure: true, standard: true } },
]);

const preloadPath = path.join(app.getAppPath(), 'preload.js');

const loadWinUrl = async (win: BrowserWindow, path: string) => {
  const devServer = process.env.WEBPACK_DEV_SERVER_URL;
  const baseScheme = devServer || 'app://./';
  if (!devServer) createProtocol('app');
  await win.loadURL(`${baseScheme}${path}`);
};

const createOverlayWindow = async (display: Electron.Display) => {
  const win = new BrowserWindow({
    x: display.bounds.x,
    y: display.bounds.y,
    width: display.size.width,
    height: display.size.height - 4,
    transparent: true,
    frame: false,
    hasShadow: false,
    skipTaskbar: true,
    resizable: false,
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false,
      preload: preloadPath,
    },
  });

  win.setAlwaysOnTop(true, 'screen-saver', 2);
  win.setIgnoreMouseEvents(true);
  win.setVisibleOnAllWorkspaces(true, 
    { visibleOnFullScreen: true }
  );

  await loadWinUrl(win, 'overlay.html');
  overlayWins.push(win);
  win.on('closed', () => {
    overlayWins = overlayWins.filter(overlay => overlay !== win);
  });
};

const createSettingsWindow = async () => {
  settingsWin = new BrowserWindow({
    width: 602,
    height: 604,
    // @ts-ignore
    icon: path.join(__static, 'icon.png'),
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false,
      preload: preloadPath,
    },
    frame: false,
    transparent: false,
    skipTaskbar: true,
    resizable: false,
    alwaysOnTop : true,
    // --- THIS IS THE FIX (PART 1) ---
    // Start the window hidden. It will be shown later if needed.
    show: false,
  });

  settingsWin.removeMenu();
  await loadWinUrl(settingsWin, 'index.html').catch(e => console.error(e));
 
  settingsWin.on('close', (event) => {
    // @ts-ignore
    if (!app.isQuitting) {
      event.preventDefault();
      if (settingsWin) {
        settingsWin.hide();
      }
    }
  });

  settingsWin.on('closed', () => {
    settingsWin = null;
  });
};

const createTray = () => {
  // @ts-ignore
  tray = new Tray(path.join(__static, 'icon.png'));
  tray.setToolTip('Visual Snow Relief Overlay');

  const contextMenu = Menu.buildFromTemplate([
    {
      label: 'Show Settings',
      click: () => {
        if (settingsWin) {
          settingsWin.show();
        }
      },
    },
    {
      label: 'Quit',
      click: () => {
        // @ts-ignore
        app.isQuitting = true;
        app.quit();
      },
    },
  ]);

  tray.setContextMenu(contextMenu);
  tray.on('click', () => {
    if (settingsWin) {
      settingsWin.show();
    }
  });
};

const createKeybindDialog = async () => {
  if (keyBindDialog || !settingsWin) return;
  keyBindDialog = new BrowserWindow({
    width: 300,
    height: 150,
    modal: true,
    frame: true,
    parent: settingsWin,
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false,
      preload: preloadPath,
    },
  });
  const { width: primaryDisplayWidth } = screen.getPrimaryDisplay().bounds;
  keyBindDialog.setPosition(primaryDisplayWidth - keyBindDialog.getSize()[0] - 100, 100);
  keyBindDialog.setAlwaysOnTop(true, 'screen-saver');
  keyBindDialog.removeMenu();
  keyBindDialog.once('close', () => { keyBindDialog = null; });
  loadWinUrl(keyBindDialog, 'keybind_dialog.html');
};

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

app.on('activate', async () => {
  if (settingsWin === null) {
    await createSettingsWindow();
  } else {
    settingsWin.show();
  }
});

if (isDevelopment) {
  if (process.platform === 'win32') {
    process.on('message', data => {
      if (data === 'graceful-exit') app.quit();
    });
  } else {
    process.on('SIGTERM', () => app.quit());
  }
}

const forwardToOverlays = (channel: string) => {
  ipcMain.handle(channel, (_, ...args) => {
    overlayWins.forEach(w => w.webContents.send(channel, ...args));
    if (settingsWin) {
      settingsWin.webContents.send(channel, ...args);
    }
  });
};

forwardToOverlays('change-overlay-speed');
forwardToOverlays('change-play-status');
forwardToOverlays('change-overlay-image');
forwardToOverlays('change-interval');
forwardToOverlays('change-pause');
forwardToOverlays('setup-timers');

ipcMain.handle('change-overlay-opacity', (_, opacity: number) => {
  currentOpacity = opacity;
  overlayWins.forEach(w => w.webContents.send('change-overlay-opacity', opacity));
});
ipcMain.handle('get-current-opacity', () => {
  return currentOpacity;
});

ipcMain.handle('change-hotkey', (_, keyBinds: ChangeKeyboardShortcut) => {
  const { keyboardShortcutElectron, keyboardShortcutDisplay } = keyBinds;
  if (oldKeyboardShortcut) globalShortcut.unregister(oldKeyboardShortcut);
  globalShortcut.register(keyboardShortcutElectron, () => {
    if (settingsWin) {
      if (settingsWin.isVisible()) {
        settingsWin.hide();
      } else {
        settingsWin.show();
        settingsWin.focus();
      }
    }
  });
  oldKeyboardShortcut = keyboardShortcutElectron;
  if (settingsWin) {
    settingsWin.webContents.send('change-hotkey', { keyboardShortcutElectron, keyboardShortcutDisplay });
  }
});

ipcMain.handle('minimize-settings-window', () => {
    if (settingsWin) {
        settingsWin.minimize();
    }
});
ipcMain.handle('close-app', () => {
    // @ts-ignore
    app.isQuitting = true;
    app.quit();
});
ipcMain.handle('open-keybind-dialog', createKeybindDialog);
ipcMain.handle('close-keybind-dialog', () => {
    if (keyBindDialog) {
        keyBindDialog.close();
    }
});
ipcMain.handle('log', (_, loggable: any) => console.log(JSON.stringify(loggable)));

// --- THIS IS THE FIX (PART 2) ---
// New handler that waits for the signal from the renderer to show the window.
ipcMain.handle('show-settings-window', () => {
  if (settingsWin) {
    settingsWin.show();
  }
});

const gotTheLock = app.requestSingleInstanceLock();
if (!gotTheLock) app.quit();
else {
  app.on('second-instance', () => {
    if (settingsWin) {
      if (settingsWin.isMinimized()) settingsWin.restore();
      settingsWin.show();
      settingsWin.focus();
    }
  });
}

app.on('ready', async () => {
  if (isDevelopment && !process.env.IS_TEST) {
    try {
      await installExtension(VUEJS_DEVTOOLS);
    } catch (e) {
      console.error('Vue Devtools failed to install:', (e as Error).toString());
    }
  }

  for (const display of screen.getAllDisplays()) {
    await createOverlayWindow(display);
  }
  
  await createSettingsWindow();
  
  createTray();

  await autoUpdater.checkForUpdatesAndNotify();

  if (settingsWin) {
    settingsWin.webContents.on('new-window', (e, url) => {
      e.preventDefault();
      shell.openExternal(url);
    });
  }
});

if (process.platform === 'linux') {
  app.commandLine.appendSwitch('enable-transparent-visuals');
  app.commandLine.appendSwitch('disable-gpu');
  setInterval(() => {
    overlayWins.forEach(w => !w.isDestroyed() && w.setAlwaysOnTop(true));
  }, 300);
}