const { app, BrowserWindow, Menu, ipcMain, shell } = require('electron');
const path = require('path');
const fs = require('fs');
const http = require('http');
const { spawn } = require('child_process');

// Enable Web Bluetooth and Web Serial inside Electron Desktop
app.commandLine.appendSwitch('enable-experimental-web-platform-features');

const CONFIG_PATH = path.join(app.getPath('userData'), 'desktop-config.json');

function loadConfig() {
  try {
    if (fs.existsSync(CONFIG_PATH)) {
      return JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf-8'));
    }
  } catch {
    // ignore malformed config
  }
  return {
    mode: process.env.STUDIO_SERVER_URL ? 'remote' : 'local',
    serverUrl: process.env.STUDIO_SERVER_URL || 'http://127.0.0.1:3000',
  };
}

function saveConfig(cfg) {
  fs.mkdirSync(path.dirname(CONFIG_PATH), { recursive: true });
  fs.writeFileSync(CONFIG_PATH, JSON.stringify(cfg, null, 2), 'utf-8');
}

let mainWindow = null;
let localServerProcess = null;

function resolveStandaloneBundle() {
  const candidates = [
    process.resourcesPath ? path.join(process.resourcesPath, 'bundle') : '',
    path.join(__dirname, 'bundle'),
  ].filter(Boolean);

  for (const dir of candidates) {
    const serverCjs = path.join(dir, 'server.cjs');
    const distDir = path.join(dir, 'dist');
    if (fs.existsSync(serverCjs) && fs.existsSync(path.join(distDir, 'index.html'))) {
      return { bundleDir: dir, serverCjs, distDir };
    }
  }
  return null;
}

function startLocalServerIfNeeded(cfg) {
  if (cfg.mode !== 'local') return;

  const userDataDir = path.join(app.getPath('userData'), 'data');
  fs.mkdirSync(userDataDir, { recursive: true });

  const standalone = resolveStandaloneBundle();
  if (standalone) {
    // Packaged or prepared bundle: run using Electron's embedded Node runtime (no external Node required)
    localServerProcess = spawn(process.execPath, [standalone.serverCjs], {
      cwd: standalone.bundleDir,
      windowsHide: true,
      env: {
        ...process.env,
        ELECTRON_RUN_AS_NODE: '1',
        NODE_ENV: 'production',
        STUDIO_DATA_DIR: userDataDir,
        STUDIO_DIST_DIR: standalone.distDir,
      },
      stdio: 'ignore',
    });
    return;
  }

  // Dev fallback when launching Electron directly inside source repository
  const projectRoot = path.resolve(__dirname, '..');
  const serverEntry = path.join(projectRoot, 'server.ts');
  if (!fs.existsSync(serverEntry)) return;

  localServerProcess = spawn(
    process.platform === 'win32' ? 'npx.cmd' : 'npx',
    ['tsx', serverEntry],
    {
      cwd: projectRoot,
      windowsHide: true,
      env: { ...process.env, NODE_ENV: 'development' },
      stdio: 'ignore',
    }
  );
}

function waitForHealthAndLoad(win, targetUrl, isLocal) {
  if (!isLocal) {
    win.loadURL(targetUrl).catch(() => undefined);
    return;
  }

  let attempts = 0;
  const maxAttempts = 50; // ~12.5 seconds max

  const tryPing = () => {
    if (!win || win.isDestroyed()) return;
    attempts += 1;

    const req = http.get('http://127.0.0.1:3000/api/health', (res) => {
      res.resume();
      if (win && !win.isDestroyed()) {
        win.loadURL(targetUrl).catch(() => {
          win.loadURL('http://127.0.0.1:3000');
        });
      }
    });

    req.on('error', () => {
      if (attempts < maxAttempts) {
        setTimeout(tryPing, 250);
      } else if (win && !win.isDestroyed()) {
        win.loadURL(targetUrl).catch(() => {
          win.loadURL('http://127.0.0.1:3000');
        });
      }
    });

    req.setTimeout(1000, () => {
      req.destroy();
    });
  };

  tryPing();
}

function createWindow() {
  const cfg = loadConfig();
  startLocalServerIfNeeded(cfg);

  mainWindow = new BrowserWindow({
    width: 1420,
    height: 900,
    minWidth: 1024,
    minHeight: 700,
    title: 'ЭТАЛОН ПРАВИЛО — Десктопная версия студии',
    backgroundColor: '#0f172a',
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  // Web Bluetooth device selection handler for Mi Scale 2, ESP32, Wahoo, MYOblue, B05
  let btScanTimer = null;
  let pendingBtCallback = null;
  let lastBtDeviceList = [];

  mainWindow.webContents.on('select-bluetooth-device', (event, deviceList, callback) => {
    event.preventDefault();
    pendingBtCallback = callback;
    lastBtDeviceList = deviceList || [];

    const preferred = lastBtDeviceList.find((d) =>
      /tickr|wahoo|mibfs|mi scale|miscale|esp32|pravilo|myoblue|b05|bpm|heart|blemodule|yk-|yonker|ibpa|yuwell|omron|beurer|contec|sinocare|medisana|blesmart|blood/i.test(
        d.deviceName || ''
      )
    );
    if (preferred) {
      if (btScanTimer) {
        clearTimeout(btScanTimer);
        btScanTimer = null;
      }
      const cb = pendingBtCallback;
      pendingBtCallback = null;
      try {
        cb(preferred.deviceId);
      } catch {
        // ignore stale callback
      }
      return;
    }

    if (!btScanTimer) {
      btScanTimer = setTimeout(() => {
        btScanTimer = null;
        if (pendingBtCallback) {
          const cb = pendingBtCallback;
          pendingBtCallback = null;
          try {
            cb(lastBtDeviceList[0]?.deviceId || '');
          } catch {
            // ignore stale callback
          }
        }
      }, 6500);
    }
  });

  mainWindow.on('closed', () => {
    if (btScanTimer) {
      clearTimeout(btScanTimer);
      btScanTimer = null;
    }
    pendingBtCallback = null;
  });

  mainWindow.webContents.session.setPermissionRequestHandler((_wc, permission, callback) => {
    const allowed = ['notifications', 'bluetooth', 'serial', 'media'];
    callback(allowed.includes(permission));
  });

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: 'deny' };
  });

  const targetUrl = cfg.serverUrl || 'http://127.0.0.1:3000';
  waitForHealthAndLoad(mainWindow, targetUrl, cfg.mode === 'local');

  const menu = Menu.buildFromTemplate([
    {
      label: 'Студия',
      submenu: [
        { label: 'Обновить окно', accelerator: 'CmdOrCtrl+R', click: () => mainWindow?.reload() },
        {
          label: 'Подключить локальный сервер (127.0.0.1:3000)',
          click: () => {
            const next = { mode: 'local', serverUrl: 'http://127.0.0.1:3000' };
            saveConfig(next);
            if (!localServerProcess) startLocalServerIfNeeded(next);
            waitForHealthAndLoad(mainWindow, next.serverUrl, true);
          },
        },
        {
          label: 'Открыть папку с данными студии',
          click: () => {
            const dataDir = path.join(app.getPath('userData'), 'data');
            fs.mkdirSync(dataDir, { recursive: true });
            shell.openPath(dataDir);
          },
        },
        { type: 'separator' },
        { label: 'Выход', role: 'quit' },
      ],
    },
    {
      label: 'Вид',
      submenu: [
        { role: 'togglefullscreen', label: 'Полный экран' },
        { role: 'zoomIn', label: 'Крупнее' },
        { role: 'zoomOut', label: 'Мельче' },
        { role: 'resetZoom', label: 'Сбросить масштаб' },
      ],
    },
  ]);
  Menu.setApplicationMenu(menu);
}

ipcMain.handle('desktop:get-config', () => loadConfig());
ipcMain.handle('desktop:set-server-url', (_ev, url) => {
  const cleanUrl = String(url || '').trim() || 'http://127.0.0.1:3000';
  const next = {
    mode: cleanUrl.includes('127.0.0.1') || cleanUrl.includes('localhost') ? 'local' : 'remote',
    serverUrl: cleanUrl,
  };
  saveConfig(next);
  if (next.mode === 'local' && !localServerProcess) {
    startLocalServerIfNeeded(next);
    waitForHealthAndLoad(mainWindow, cleanUrl, true);
  } else {
    mainWindow?.loadURL(cleanUrl);
  }
  return next;
});

app.whenReady().then(() => {
  createWindow();
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on('before-quit', () => {
  if (localServerProcess) {
    try {
      localServerProcess.kill();
    } catch {
      // ignore
    }
    localServerProcess = null;
  }
});

app.on('window-all-closed', () => {
  if (localServerProcess) {
    try {
      localServerProcess.kill();
    } catch {
      // ignore
    }
    localServerProcess = null;
  }
  if (process.platform !== 'darwin') app.quit();
});
