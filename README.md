# МираВкус — интернет‑магазин

## Локальный запуск

```sh
npm i
npm run dev
```

## Сборка

```sh
npm run build
```

## Запуск на сервере

### Вариант 1 — статика + Node backend

1) Собрать фронтенд:
```sh
npm run build
```

2) Раздать папку dist через Nginx/Apache.

3) Поднять backend:
```sh
npm run server
```

### Вариант 2 — всё на Node

Сборка фронтенда и раздача статических файлов любым Node‑сервером или через Nginx.

## Переменные окружения

Создайте файл .env (пример ниже):
```
VITE_SITE_URL=https://your-domain.ru
BACKEND_PORT=8081
BACKEND_ALLOWED_ORIGIN=https://your-domain.ru
```

## Технологии

This project is built with:

- Vite
- TypeScript
- React
- shadcn-ui
- Tailwind CSS

## Рекомендации для продакшена

- Указать правильный домен в VITE_SITE_URL.
- Настроить HTTPS и кеширование статики.
- Прокинуть /api на backend (reverse proxy).
