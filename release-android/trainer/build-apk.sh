#!/usr/bin/env bash
set -euo pipefail
# Сборка ЭТАЛОН ПРАВИЛО — Тренер (ru.etalonpravilo.trainer)
echo "Подготовка Android APK для: ЭТАЛОН ПРАВИЛО — Тренер (ru.etalonpravilo.trainer)"
npx --yes @bubblewrap/cli build --manifest=./twa-manifest.json
