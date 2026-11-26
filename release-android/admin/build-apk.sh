#!/usr/bin/env bash
set -euo pipefail
# Сборка ЭТАЛОН ПРАВИЛО — Администратор (ru.etalonpravilo.admin)
echo "Подготовка Android APK для: ЭТАЛОН ПРАВИЛО — Администратор (ru.etalonpravilo.admin)"
npx --yes @bubblewrap/cli build --manifest=./twa-manifest.json
