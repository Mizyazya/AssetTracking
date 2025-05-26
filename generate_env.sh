#!/bin/sh
# generate_env.sh: створює .env якщо його немає, з випадковим SECRET_KEY
if [ ! -f .env ]; then
  # Генеруємо SECRET_KEY (кросплатформено)
  if command -v uuidgen >/dev/null 2>&1; then
    SECRET_KEY=$(uuidgen)
  elif [ -r /proc/sys/kernel/random/uuid ]; then
    SECRET_KEY=$(cat /proc/sys/kernel/random/uuid)
  else
    echo "[generate_env.sh] Помилка: не вдалося згенерувати SECRET_KEY (uuidgen не знайдено)" >&2
    exit 1
  fi
  if [ -z "$SECRET_KEY" ]; then
    echo "[generate_env.sh] Помилка: SECRET_KEY порожній, .env не створено" >&2
    exit 1
  fi
  echo "# Flask settings" > .env
  echo "SECRET_KEY=$SECRET_KEY" >> .env
  echo "FLASK_ENV=production" >> .env
  echo "\n# Database settings (PostgreSQL)" >> .env
  echo "DATABASE_URL=postgresql://assetuser:assetpass@db:5432/assetdb" >> .env
  echo "\n# (Optional) Timezone" >> .env
  echo "TIMEZONE=Europe/Kyiv" >> .env
  echo "\n# Додайте інші змінні за потреби" >> .env
  echo "[generate_env.sh] .env згенеровано автоматично з SECRET_KEY: $SECRET_KEY" >&2
else
  echo "[generate_env.sh] .env вже існує, пропускаємо генерацію." >&2
fi
