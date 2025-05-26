#!/bin/sh
# generate_env.sh: створює .env якщо його немає, з випадковим SECRET_KEY
if [ ! -f .env ]; then
  SECRET_KEY=$(cat /proc/sys/kernel/random/uuid)
  echo "# Flask settings" > .env
  echo "SECRET_KEY=$SECRET_KEY" >> .env
  echo "FLASK_ENV=production" >> .env
  echo "\n# Database settings (PostgreSQL)" >> .env
  echo "DATABASE_URL=postgresql://assetuser:assetpass@db:5432/assetdb" >> .env
  echo "\n# (Optional) Timezone" >> .env
  echo "TIMEZONE=Europe/Kyiv" >> .env
  echo "\n# Додайте інші змінні за потреби" >> .env
  echo "[Docker build] .env згенеровано автоматично з SECRET_KEY: $SECRET_KEY" >&2
else
  echo "[Docker build] .env вже існує, пропускаємо генерацію." >&2
fi
