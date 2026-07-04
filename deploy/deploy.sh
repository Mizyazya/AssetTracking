#!/usr/bin/env bash
# deploy.sh — оновлення Assets 2.0 на сервері
# Запуск: sudo bash deploy/deploy.sh
set -euo pipefail

APP_DIR="/opt/assets"
SERVICE="assets"
NODE_VERSION="22"

cd "$APP_DIR"

echo "→ Отримую зміни…"
git pull --ff-only

echo "→ Встановлюю залежності…"
NODE_ENV=production npm ci --omit=dev

echo "→ Збираю застосунок…"
npm run build

echo "→ Копіюю статику для standalone…"
cp -r .next/static .next/standalone/.next/static
cp -r public        .next/standalone/public 2>/dev/null || true

echo "→ Перезапускаю сервіс…"
systemctl restart "$SERVICE"
systemctl is-active --quiet "$SERVICE" && echo "✓ Сервіс запущено." || { echo "✗ Сервіс не запустився!" >&2; journalctl -u "$SERVICE" -n 20; exit 1; }
