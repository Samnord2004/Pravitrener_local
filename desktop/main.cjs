const { app, BrowserWindow, Menu, ipcMain, shell, dialog } = require('electron');
const path = require('path');
const fs = require('fs');
const http = require('http');
const https = require('https');
const { spawn } = require('child_process');
const nativeBt = require('./nativeBluetoothDesktop.cjs');

const GITHUB_REPO_RE = /^[A-Za-z0-9_.-]{1,60}\/[A-Za-z0-9_.-]{1,100}$/;
const ALLOWED_GITHUB_HOSTS = new Set([
  'api.github.com',
  'github.com',
  'codeload.github.com',
  'objects.githubusercontent.com',
  'release-assets.githubusercontent.com',
]);

function compareSemver(a, b) {
  const pa = String(a || '').replace(/^v/i, '').split('.').map((n) => parseInt(n, 10) || 0);
  const pb = String(b || '').replace(/^v/i, '').split('.').map((n) => parseInt(n, 10) || 0);
  for (let i = 0; i < Math.max(pa.length, pb.length, 3); i++) {
    const da = pa[i] || 0;
    const db = pb[i] || 0;
    if (da > db) return 1;
    if (da < db) return -1;
  }
  return 0;
}

function httpsGetJsonAllowlisted(rawUrl) {
  return new Promise((resolve, reject) => {
    let parsed;
    try {
      parsed = new URL(rawUrl);
    } catch {
      return reject(new Error('Некорректный URL GitHub API'));
    }
    if (parsed.protocol !== 'https:' || !ALLOWED_GITHUB_HOSTS.has(parsed.hostname)) {
      return reject(new Error('Неразрешённый домен для запроса обновлений'));
    }
    const req = https.get(
      parsed.toString(),
      {
        headers: {
          'User-Agent': `EtalonPraviloDesktop/${app.getVersion()}`,
          Accept: 'application/vnd.github+json',
        },
        timeout: 10000,
      },
      (res) => {
        if (res.statusCode && res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
          res.resume();
          return httpsGetJsonAllowlisted(res.headers.location).then(resolve, reject);
        }
        const chunks = [];
        res.on('data', (c) => chunks.push(c));
        res.on('end', () => {
          const text = Buffer.concat(chunks).toString('utf-8');
          if (!res.statusCode || res.statusCode < 200 || res.statusCode >= 300) {
            return reject(new Error(`GitHub API HTTP ${res.statusCode || 0}`));
          }
          try {
            resolve(JSON.parse(text));
          } catch {
            reject(new Error('Некорректный JSON-ответ GitHub API'));
          }
        });
      }
    );
    req.on('error', reject);
    req.on('timeout', () => req.destroy(new Error('Таймаут запроса к GitHub')));
  });
}

function downloadInstallerFile(rawUrl, destPath, hops = 0) {
  return new Promise((resolve, reject) => {
    if (hops > 5) return reject(new Error('Слишком много перенаправлений при скачивании'));
    let parsed;
    try {
      parsed = new URL(rawUrl);
    } catch {
      return reject(new Error('Некорректный URL файла установки'));
    }
    if (parsed.protocol !== 'https:' || !ALLOWED_GITHUB_HOSTS.has(parsed.hostname)) {
      return reject(new Error('Разрешено скачивание только с официальных серверов GitHub'));
    }
    const req = https.get(
      parsed.toString(),
      {
        headers: { 'User-Agent': `EtalonPraviloDesktop/${app.getVersion()}` },
        timeout: 60000,
      },
      (res) => {
        if (res.statusCode && res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
          res.resume();
          return downloadInstallerFile(res.headers.location, destPath, hops + 1).then(resolve, reject);
        }
        if (!res.statusCode || res.statusCode < 200 || res.statusCode >= 300) {
          res.resume();
          return reject(new Error(`Ошибка скачивания установщика: HTTP ${res.statusCode || 0}`));
        }
        const tmpPath = `${destPath}.part`;
        const out = fs.createWriteStream(tmpPath);
        res.pipe(out);
        out.on('finish', () => {
          out.close(() => {
            fs.renameSync(tmpPath, destPath);
            resolve(destPath);
          });
        });
        out.on('error', (err) => {
          try { fs.rmSync(tmpPath, { force: true }); } catch { /* ignore */ }
          reject(err);
        });
      }
    );
    req.on('error', reject);
    req.on('timeout', () => req.destroy(new Error('Таймаут загрузки установщика')));
  });
}

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

  // Bluetooth device selection handler for Desktop (interactive list + auto-match)
  let btScanTimer = null;
  let pendingBtCallback = null;
  let lastBtDeviceList = [];

  mainWindow.webContents.on('select-bluetooth-device', (event, deviceList, callback) => {
    event.preventDefault();
    pendingBtCallback = callback;
    lastBtDeviceList = deviceList || [];

    try {
      mainWindow.webContents.send('desktop:webble-devices', lastBtDeviceList);
    } catch {
      // ignore closed webContents
    }

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

  ipcMain.handle('desktop:webble-pick', (_ev, deviceId) => {
    if (btScanTimer) {
      clearTimeout(btScanTimer);
      btScanTimer = null;
    }
    if (pendingBtCallback) {
      const cb = pendingBtCallback;
      pendingBtCallback = null;
      try {
        cb(String(deviceId || ''));
        return true;
      } catch {
        return false;
      }
    }
    return false;
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
    try {
      const parsed = new URL(url);
      if (parsed.protocol === 'https:' || parsed.protocol === 'http:') {
        shell.openExternal(parsed.toString());
      }
    } catch {
      // ignore invalid URLs
    }
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
          label: `Версия приложения (${app.getVersion()})`,
          click: () => {
            dialog.showMessageBox(mainWindow, {
              type: 'info',
              title: 'ЭТАЛОН ПРАВИЛО',
              message: `ЭТАЛОН ПРАВИЛО — v${app.getVersion()}`,
              detail: `Платформа: ${process.platform} (${process.arch}).\nДля проверки обновлений с GitHub откройте Настройки -> Сервер и обновления.`,
            }).catch(() => undefined);
          },
        },
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
ipcMain.handle('desktop:get-app-info', () => ({
  version: app.getVersion(),
  platform: process.platform,
  arch: process.arch,
  isPackaged: app.isPackaged,
}));

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

ipcMain.handle('desktop:check-github-release', async (_ev, rawRepo) => {
  const repo = String(rawRepo || '').trim();
  if (!GITHUB_REPO_RE.test(repo)) {
    throw new Error('Укажите репозиторий в формате owner/repo');
  }
  const currentVersion = app.getVersion();
  const rel = await httpsGetJsonAllowlisted(`https://api.github.com/repos/${repo}/releases/latest`);
  const assets = Array.isArray(rel?.assets) ? rel.assets : [];
  const dmgAsset =
    assets.find((a) => /\.dmg$/i.test(a.name || '') && /arm64|mac/i.test(a.name || '')) ||
    assets.find((a) => /\.dmg$/i.test(a.name || ''));
  const exeAsset =
    assets.find((a) => /\.exe$/i.test(a.name || '') && !/portable/i.test(a.name || '')) ||
    assets.find((a) => /\.exe$/i.test(a.name || ''));

  const latestTag = String(rel?.tag_name || '').trim();
  const latestVersion = latestTag.replace(/^v/i, '');
  const updateAvailable = latestVersion ? compareSemver(latestVersion, currentVersion) > 0 : false;
  const preferredAsset = process.platform === 'darwin' ? dmgAsset : process.platform === 'win32' ? exeAsset : null;

  return {
    currentVersion,
    latestTag,
    latestVersion,
    updateAvailable,
    releasePageUrl: typeof rel?.html_url === 'string' ? rel.html_url : '',
    publishedAt: typeof rel?.published_at === 'string' ? rel.published_at : '',
    dmgUrl: dmgAsset?.browser_download_url || '',
    dmgName: dmgAsset?.name || '',
    exeUrl: exeAsset?.browser_download_url || '',
    exeName: exeAsset?.name || '',
    preferredAssetUrl: preferredAsset?.browser_download_url || '',
    preferredAssetName: preferredAsset?.name || '',
  };
});

ipcMain.handle('desktop:download-installer', async (_ev, payload) => {
  const rawUrl = String(payload?.url || '').trim();
  const requestedName = path.basename(String(payload?.fileName || '').trim() || 'EtalonPraviloInstaller');
  if (!/\.(dmg|exe|zip)$/i.test(requestedName)) {
    throw new Error('Недопустимое расширение файла установщика');
  }
  const safeName = requestedName.replace(/[^A-Za-z0-9._-]/g, '_');
  const downloadsDir = app.getPath('downloads');
  fs.mkdirSync(downloadsDir, { recursive: true });
  const destPath = path.resolve(downloadsDir, safeName);
  if (!destPath.startsWith(path.resolve(downloadsDir) + path.sep)) {
    throw new Error('Некорректный путь сохранения установщика');
  }
  await downloadInstallerFile(rawUrl, destPath);
  await shell.openPath(destPath);
  return { ok: true, savedPath: destPath, fileName: safeName };
});

ipcMain.handle('desktop:open-github-url', async (_ev, rawUrl) => {
  const parsed = new URL(String(rawUrl || '').trim());
  if (parsed.protocol !== 'https:' || !ALLOWED_GITHUB_HOSTS.has(parsed.hostname)) {
    throw new Error('Разрешены только официальные ссылки GitHub HTTPS');
  }
  await shell.openExternal(parsed.toString());
  return true;
});

ipcMain.handle('desktop:bt-list', async () => nativeBt.listDevices());
ipcMain.handle('desktop:bt-connect', async (_ev, params) =>
  nativeBt.connectDevice(params || {}, (payload) => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('desktop:bt-event', payload);
    }
  })
);
ipcMain.handle('desktop:bt-disconnect', async (_ev, type) => nativeBt.disconnectDevice(type));
ipcMain.handle('desktop:bt-write', async (_ev, type, cmd) => nativeBt.writeCommand(type, cmd));

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
