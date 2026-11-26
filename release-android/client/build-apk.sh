#!/usr/bin/env bash
set -euo pipefail
# Сборка ЭТАЛОН ПРАВИЛО — Клиент (ru.etalonpravilo.client)
echo "Подготовка Android APK для: ЭТАЛОН ПРАВИЛО — Клиент (ru.etalonpravilo.client)"
npx --yes @bubblewrap/cli build --manifest=./twa-manifest.json
