# Развёртывание на сервере, доменное туннелирование и десктопная версия ЭТАЛОН ПРАВИЛО

## 1. Запуск на собственном сервере (Linux / VPS / локальный ПК студии)
```bash
npm install
npm run build
NODE_ENV=production SESSION_SECRET="$(openssl rand -hex 32)" npm start
```
Сервер работает на порту `3000`, вся база хранится в `data/studio-db.json`.

## 2. Туннелирование через домен (HTTPS + WebSocket + Web Bluetooth)
- **Cloudflare Tunnel (без белого IP):** используйте `deploy/cloudflared-tunnel.yml`.
- **Caddy (автоматический SSL):** установите Caddy и укажите `deploy/Caddyfile`.
- **Nginx + Certbot:** скопируйте `deploy/nginx-domain.conf` и выпустите сертификат `certbot --nginx -d studio.yourdomain.ru`.

## 3. Сборка автономного установщика для ПК (macOS M1+ и Windows .exe)
Установщик включает встроенный сервер и локальную базу данных в папке пользователя (отдельная установка Node.js на компьютер студии не требуется).

Первоначальная установка зависимостей Electron:
```bash
npm run desktop:install
```

- **macOS (Apple Silicon M1 / M2 / M3 / M4, `arm64` — `.dmg` и `.zip`):**
```bash
npm run desktop:mac
# или Universal (M1+ arm64 + Intel x64):
npm run desktop:mac:universal
```
- **Windows 10 / 11 (`x64` — установщик `.exe` NSIS и портативный `.exe`):**
```bash
npm run desktop:win
```
Готовые установщики сохраняются в папку `release-desktop/`:
- `EtalonPravilo-1.2.0-mac-arm64.dmg` (macOS M1 и новее)
- `EtalonPravilo-1.2.0-win-x64.exe` (Windows установщик)

Для запуска десктоп-клиента с подключением к удалённому домену студии:
```bash
STUDIO_SERVER_URL="https://studio.yourdomain.ru" npm --prefix desktop start
```

## 4. Простое обновление
- В интерфейсе владельца (**Настройки → Обновления, Десктоп и Домен**) нажмите **«Скачать резервную копию БД»**, затем **«Проверить обновления»** и **«Установить обновление»**.
- База `data/studio-db.json` при обновлении кода не затрагивается.
