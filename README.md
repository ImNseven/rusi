# Telegram Spelling Tests

MVP платформа для проверки правильного написания слов:
- Telegram бот + WebApp
- Роли: админ / ученик
- Публичные тесты (много попыток, хранится лучший результат)
- Приватные тесты по ссылке (единоразовое прохождение)
- Оценка по 10-балльной шкале на основе правил теста
- Статистика прохождений для админа

## Стек

- Backend: Node.js, Express, Prisma, PostgreSQL, JWT
- Frontend: React + Vite
- Deploy: Render (2 web service + Postgres)

## Структура

- `backend` — API, Telegram auth, бизнес-логика, Prisma
- `frontend` — Telegram WebApp интерфейс
- `render.yaml` — шаблон инфраструктуры на Render

## Быстрый старт локально

1. Установить зависимости:
   - `cd backend && npm i`
   - `cd ../frontend && npm i`
2. Подготовить env:
   - скопировать `backend/env.example` в `backend/.env`
   - скопировать `frontend/env.example` в `frontend/.env`
3. Запустить миграции:
   - `cd backend`
   - `npx prisma migrate dev --name init`
4. Запустить backend:
   - `npm run dev`
5. Запустить frontend:
   - `cd ../frontend`
   - `npm run dev`

## Deploy на Render

1. Запушить проект на GitHub.
2. В Render создать blueprint из `render.yaml` (или вручную 3 сервиса).
3. Вставить секреты:
   - `DATABASE_URL` (подставится автоматически из Render Postgres)
   - `JWT_SECRET`
   - `BOT_TOKEN`
   - `ADMIN_TELEGRAM_ID`
   - `WEBAPP_URL` (url фронтенда, напр. `https://spelling-frontend.onrender.com`)
   - `CORS_ORIGIN` (тот же url фронтенда, напр. `https://app.your-domain.by`)
   - `VITE_API_URL` (url backend, напр. `https://spelling-backend.onrender.com`)
4. После первого деплоя backend выполнить:
   - `npx prisma migrate deploy`
5. В BotFather:
   - `/setmenubutton` -> ваш бот -> URL фронтенда
   - `/setdomain` -> домен фронтенда

## Что еще нужно от тебя

- `BOT_TOKEN`
- Telegram ID админа (`ADMIN_TELEGRAM_ID`)
- `JWT_SECRET` (любая длинная случайная строка)
- если хочешь кастомный домен с hoster.by, дам DNS записи под Render

