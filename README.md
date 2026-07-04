# Asset Tracking — v2 (у розробці)

Внутрішній інструмент обліку майна: активи й компоненти, за ким закріплені, локації, задачі, історія всіх дій.

**Статус:** триває переписування з Flask (v1) на Next.js. Стабільна робоча версія v1 — у гілці [`v1`](../../tree/v1), вона й далі використовується у продакшні до готовності v2. Специфікація паритету — [PORTING.md](PORTING.md).

## Стек v2

Next.js (App Router, TypeScript) · Drizzle ORM · SQLite (better-sqlite3) · Tailwind

## Розробка

```sh
npm install
npm run db:migrate   # створює data/assets.db
npm run dev          # http://localhost:3000
```

Перенесення даних зі старої v1-бази:

```sh
npm run db:import -- шлях/до/assets.db
```

Налаштування — `.env` (див. [.env.example](.env.example)): `SECRET_KEY` і, за бажанням, `TIMEZONE` (типово Europe/Kyiv).

## Ліцензія

[MIT](./LICENSE)
