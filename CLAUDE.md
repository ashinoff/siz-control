# CLAUDE.md — siz-control

Контекст проекта для Claude Code. Этот файл читается автоматически в начале
каждого сеанса — чтобы не пересказывать проект заново. Здесь карта проекта и
уже известные «грабли». Текущее состояние конкретного файла всегда проверяй в
самом коде (этот файл — карта местности, а не снимок последней строки).

## Что это

«СИЗ Контроль» — веб-система учёта и контроля средств индивидуальной защиты
(СИЗ), материалов и оборудования для ПАО «Россети Юг» — «Кубаньэнерго». Ведёт
учёт по складам и сотрудникам, нормы выдачи по должностям (ТОН), контроль
сроков службы и поверок, журнал движений, отчёты, импорт/экспорт, бэкап и
восстановление, библиотеку нормативных актов (PDF).

Интерфейс на русском. Вход администратора: логин `admin`.

## Стек

- **Бэкенд:** Python 3.11, FastAPI, SQLAlchemy 2, Alembic, psycopg 3,
  Pydantic 2 / pydantic-settings, JWT (python-jose), пароли (passlib + bcrypt),
  Excel (openpyxl).
- **Фронтенд:** React 18 + Vite, react-router-dom, axios, recharts. SPA.
- **БД:** PostgreSQL в проде (Amvera), SQLite локально. Код один и тот же —
  поведение местами различается (см. «Грабли»).

## Структура репозитория

```
backend/
  app/
    main.py          точка входа FastAPI: middleware, старт (см. ниже),
                     подключение роутеров, раздача собранного фронта (dist/)
    config.py        настройки из переменных окружения / .env
    database.py      engine, SessionLocal, Base
    enums.py         перечисления (статусы, типы)
    security.py      JWT, хэширование паролей
    dependencies.py  зависимости FastAPI (текущий пользователь, проверка прав)
    schema_sync.py   досоздание недостающих КОЛОНОК в существующих таблицах
    seed.py          первичное наполнение (роли, подразделения, склады, админ) — идемпотентно
    models/          SQLAlchemy-модели: user, organization, catalog, inventory, norms, journal
    routers/         эндпоинты по разделам: auth, users, departments, employees,
                     catalog, inventory, operations, reports, dashboard, journal,
                     export, norms, importdata, import_issued, dbcheck, trash,
                     documents, backup
    schemas/         Pydantic-схемы запросов/ответов
    services/        бизнес-логика: audit, reports, status
  alembic/           миграции (на практике схема создаётся через create_all +
                     schema_sync — см. «Грабли»)
  requirements.txt
  .env.example       образец переменных окружения
frontend/
  src/
    pages/           страницы разделов
    components/       Layout, Sidebar, формы, BrandMark, ui, иконки
    lib/             brandFlash.js (эффект «разряд тока» на логотипе),
                     menuMeta.js (меню и подсказки), format.js, exportExcel.js
    context/         AuthContext.jsx
    api/client.js    axios-клиент
  vite.config.js
docs/                PDF нормативных актов (раздел «Нормативные акты»);
                     запекаются в образ (см. «Грабли»)
Dockerfile           мультистейдж: node собирает фронт → python отдаёт бэк + статику
amvera.yml           конфиг Amvera (docker, порт 8000, persistenceMount /data)
render.yaml          старый конфиг Render (legacy, НЕ используется)
```

## Как собирается и где живёт

- Один Docker-контейнер. **Stage 1** (`node:20-alpine`) собирает фронт
  (`npm run build` → `frontend/dist`). **Stage 2** (`python:3.11-slim`) ставит
  зависимости, копирует бэк, фронт-сборку и `docs/`, запускает
  `uvicorn app.main:app` на порту 8000.
- FastAPI одновременно отдаёт API (`/api/...`) и раздаёт собранный фронт как
  статику (SPA-fallback на `index.html`).
- **Хостинг — Amvera** (перенесли с Render). БД — managed PostgreSQL на Amvera.
- **Деплой НЕ автоматический.** После `git push` в `main` нужно вручную нажать
  «Пересобрать» в панели Amvera и дождаться «Приложение запущено».

## Переменные окружения

Задаются в панели Amvera (и в `.env` локально). Главные:

- `DATABASE_URL` — строка подключения. Postgres:
  `postgresql://user:pass@host:5432/db`; локально SQLite:
  `sqlite:///./siz_control.db`. (В `config.py` `postgres://` / `postgresql://`
  нормализуются в `postgresql+psycopg://`.)
- `SECRET_KEY` — длинная случайная строка (JWT).
- `CORS_ORIGINS` — список разрешённых origin через запятую или `*`.
- `ADMIN_LOGIN` / `ADMIN_PASSWORD` / `ADMIN_FULL_NAME` — первый админ (создаётся при seed).
- `ACCESS_TOKEN_EXPIRE_MINUTES`, `UPLOAD_DIR`.

## Что происходит при старте (main.py → on_startup)

1. `_wait_for_db()` — ждёт готовности БД с повторными попытками (до 15 раз,
   пауза 3 c). Нужно потому, что на Amvera контейнер стартует раньше, чем
   разрешается DNS-имя базы («Temporary failure in name resolution»). **Не
   ломать** — без этого старт падает гонкой.
2. `create_all` — создаёт недостающие таблицы.
3. `schema_sync()` — досоздаёт недостающие КОЛОНКИ в уже существующих таблицах
   (`create_all` этого не делает).
4. `seed_structural()` — наполняет роли, подразделения, склады, админа. Идемпотентно.

## Грабли (уже наступали — НЕ повторять)

- **Контейнер Amvera эфемерный**, переживает перезапуск только том `/data`
  (`persistenceMount`). Файлы, записанные в образ во время работы, теряются при
  пересборке. Поэтому PDF нормативки лежат в `docs/` и **запекаются в образ**
  через `COPY docs/ ./docs/` в Dockerfile; в `.dockerignore` их исключать
  нельзя. Если понадобится загрузка файлов пользователями «на лету» — только в
  `/data`, не в образ.
- **`create_all` не добавляет колонки** в существующие таблицы. При добавлении
  полей в модели полагайся на `schema_sync.py` (ALTER TABLE ADD COLUMN для
  недостающих; новые колонки должны допускать NULL/дефолт). Симптом, если
  забыть: `UndefinedColumn: column ... does not exist`.
- **Пользователь БД на Amvera — не суперпользователь.** Не использовать
  суперюзер-операции (например `SET session_replication_role`) — падают с
  `permission denied`. Восстановление и массовые операции делать в порядке
  зависимостей (родители→дети при вставке, дети→родители при удалении), без
  отключения триггеров.
- **Prod = PostgreSQL, локально = SQLite.** Часть багов видна только на
  Postgres (несовпадение типов, отсутствие колонки и т.п.). Правя что-то
  near-БД, рассуждай про поведение именно PostgreSQL — локальный SQLite-тест
  может проблему не воспроизвести.
- **Альмебик есть, но схема в проде создавалась через `create_all`**, поэтому
  `alembic upgrade head` без подготовки может попытаться выполнить
  initial-миграцию и упасть на существующих таблицах. Для досоздания колонок
  использовать `schema_sync`, а не «слепой» upgrade.
- **Часовой пояс:** в Dockerfile `TZ=Europe/Moscow` (чтобы `date.today()` для
  сроков считался по дню пользователя). Метки времени в БД — в UTC (явно в моделях).
- **Деплой ручной:** после пуша всегда «Пересобрать» в Amvera.

## Локальная разработка

- **Бэк:** создать `backend/.env` (см. `.env.example`; для локали
  `DATABASE_URL=sqlite:///./siz_control.db`, `CORS_ORIGINS=*`), затем из
  `backend/` → `uvicorn app.main:app --reload`.
- **Фронт:** из `frontend/` → `npm install`, `npm run dev` (Vite, обычно
  `http://localhost:5173`). Прод-сборка: `npm run build` → `frontend/dist`.

## Соглашения при изменениях

- Изменения фронта сначала смотреть локально (`npm run dev`), потом пушить —
  экономит пересборки на Amvera.
- Не ломать стартовую цепочку `_wait_for_db → create_all → schema_sync → seed`.
- Любые правки схемы/SQL держать Postgres-safe.
- После пуша напоминать про ручную пересборку на Amvera.
