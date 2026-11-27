import fs from 'fs';
import path from 'path';

const ROOT_DIR = process.cwd();
const SPEC_FILE = path.join(ROOT_DIR, 'android', 'twa-apps.json');
const OUT_DIR = path.join(ROOT_DIR, 'release-android');
const PUBLIC_DIR = path.join(ROOT_DIR, 'public');

const urlArg = process.argv.find((a) => a.startsWith('--url='));
const serverUrl = (urlArg ? urlArg.slice('--url='.length) : process.env.STUDIO_PUBLIC_URL || 'https://studio.yourdomain.ru').replace(/\/$/, '');

const spec = JSON.parse(fs.readFileSync(SPEC_FILE, 'utf-8'));

fs.mkdirSync(OUT_DIR, { recursive: true });

for (const app of spec.apps) {
  const appDir = path.join(OUT_DIR, app.flavor);
  const assetsDir = path.join(appDir, 'icons');
  fs.mkdirSync(assetsDir, { recursive: true });

  // Copy role icons
  for (const iconPath of [app.icon192, app.icon512, app.maskableIcon512]) {
    const fileName = path.basename(iconPath);
    const src = path.join(PUBLIC_DIR, fileName);
    if (fs.existsSync(src)) {
      fs.copyFileSync(src, path.join(assetsDir, fileName));
    }
  }

  // Capacitor configuration for standalone APK / Android Studio project
  const capacitorConfig = {
    appId: app.packageId,
    appName: app.name,
    webDir: '../../dist',
    server: {
      url: `${serverUrl}${app.startUrl}`,
      cleartext: serverUrl.startsWith('http://'),
      androidScheme: 'https',
    },
    android: {
      allowMixedContent: false,
      backgroundColor: app.backgroundColor,
    },
  };
  fs.writeFileSync(
    path.join(appDir, 'capacitor.config.json'),
    JSON.stringify(capacitorConfig, null, 2),
    'utf-8'
  );

  // Bubblewrap TWA manifest for Play Store / direct APK signing
  const host = new URL(serverUrl).host;
  const twaManifest = {
    packageId: app.packageId,
    host,
    name: app.name,
    launcherName: app.shortName,
    display: 'standalone',
    themeColor: app.themeColor,
    navigationColor: app.themeColor,
    backgroundColor: app.backgroundColor,
    enableNotifications: true,
    startUrl: app.startUrl,
    iconUrl: `${serverUrl}${app.icon512}`,
    maskableIconUrl: `${serverUrl}${app.maskableIcon512}`,
    webManifestUrl: `${serverUrl}${app.manifestPath}`,
    appVersionName: '1.2.0',
    appVersionCode: 120,
    shortcuts: [],
    fallbackType: 'customtabs',
    features: {},
    alphaDependencies: { enabled: false },
    enableSiteSettingsShortcut: true,
    isChromeOSOnly: false,
    orientation: 'default',
  };
  fs.writeFileSync(
    path.join(appDir, 'twa-manifest.json'),
    JSON.stringify(twaManifest, null, 2),
    'utf-8'
  );

  // Copy Android Native Bluetooth Bridge (BLE GATT + Classic SPP for WebView / Capacitor)
  const nativeBtSrc = path.join(ROOT_DIR, 'android', 'native-bluetooth');
  const nativeBtDest = path.join(appDir, 'native-bluetooth');
  if (fs.existsSync(nativeBtSrc)) {
    fs.mkdirSync(nativeBtDest, { recursive: true });
    for (const file of fs.readdirSync(nativeBtSrc)) {
      let content = fs.readFileSync(path.join(nativeBtSrc, file), 'utf-8');
      if (file.endsWith('.java')) {
        content = content.replace('package ru.etalonpravilo.app;', `package ${app.packageId};`);
      }
      fs.writeFileSync(path.join(nativeBtDest, file), content, 'utf-8');
    }
  }

  // Helper build script for this flavor
  const buildSh = `#!/usr/bin/env bash
set -euo pipefail
# Сборка ${app.name} (${app.packageId})
echo "Подготовка Android APK для: ${app.name} (${app.packageId})"
npx --yes @bubblewrap/cli build --manifest=./twa-manifest.json
`;
  fs.writeFileSync(path.join(appDir, 'build-apk.sh'), buildSh, { mode: 0o755 });
}

console.log(`Prepared 3 Android app packages in ${OUT_DIR} for server URL: ${serverUrl}`);
