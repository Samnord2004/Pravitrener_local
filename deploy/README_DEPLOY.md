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

## 3. Сборка десктопного приложения (Windows / macOS / Linux)
В папке `desktop/`:
```bash
cd desktop
npm install --package-lock-only=false
# Запуск подключённого к домену студии десктоп-клиента:
STUDIO_SERVER_URL="https://studio.yourdomain.ru" npx electron .
```
Для сборки установщика `.exe` / `.dmg` / `.AppImage` используйте `desktop/package-desktop.json` с `electron-builder`.

## 4. Простое обновление
- В интерфейсе владельца (**Настройки → Обновления, Десктоп и Домен**) нажмите **«Скачать резервную копию БД»**, затем **«Проверить обновления»** и **«Установить обновление»**.
- База `data/studio-db.json` при обновлении кода не затрагивается.
