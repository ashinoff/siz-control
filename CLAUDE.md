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
    models/          SQLAlchemy-модели: user, organization (Department,
                     Warehouse, Employee, EmployeeAuthorization), catalog,
                     inventory, norms, journal
    routers/         эндпоинты по разделам: auth, users, departments, employees,
                     catalog, inventory, operations, reports, dashboard, journal,
                     export, norms, importdata, import_issued, dbcheck, trash,
                     documents, ot, backup
    schemas/         Pydantic-схемы запросов/ответов
    services/        бизнес-логика: audit, reports, status, ot (охрана труда),
                     keycloak (проверка токена платформенного SSO)
  alembic/           миграции (на практике схема создаётся через create_all +
                     schema_sync — см. «Грабли»)
  requirements.txt
  .env.example       образец переменных окружения
frontend/
  src/
    pages/           страницы разделов
    components/       Layout, Sidebar, формы, BrandMark, ui, иконки
    lib/             brandFlash.js (эффект «разряд тока» на логотипе),
                     menuMeta.js (меню и подсказки), format.js, exportExcel.js,
                     otRights.js (список видов допусков ОТ — дополнять тут)
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

## Заметки Claude (рабочие, дополняются по ходу)

Личные пометки, чтобы не переоткрывать одно и то же. Обновлено 2026-06-29.

### Git / доставка
- В URL origin зашит GitHub PAT (открытым текстом — это осознанный выбор
  пользователя, не трогать). Вывод `git push`/`pull` фильтровать
  `| grep -v "github_pat"`, чтобы токен не светился в логе.
- Пользователь иногда добавляет файлы через веб-GitHub (коммиты «Add files via
  upload»: PDF в `docs/`, `rosseti.svg`, сам `CLAUDE.md`). Перед пушем почти
  всегда сначала `git pull --rebase origin main`, иначе non-fast-forward.
- Коммит-сообщения — на английском, с трейлером Co-Authored-By. Перенос строки
  CRLF-варнинги от git безвредны.

### Рецепт локальной проверки фронта (без браузера в этой среде)
1. `cd frontend && npm run build` — ловит ошибки JSX/импортов.
2. dev на нестандартном порту, чтобы не конфликтовать:
   `npm run dev -- --port 5174 > /tmp/vite_dev.log 2>&1 &` + `sleep 4`.
3. Проверить отдачу: `curl -s -o /dev/null -w "%{http_code}" http://localhost:5174/`
   и нужные модули (`/src/...`), `grep -i error /tmp/vite_dev.log`.
4. Погасить: PowerShell `Get-NetTCPConnection -LocalPort 5174 -State Listen` →
   `Stop-Process -Id <OwningProcess> -Force`.
- Бэкенд-логику можно гонять изолированно: `DATABASE_URL='sqlite:///./_tmp.db'
  CORS_ORIGINS='*' python -c "from app.routers import ..."` (engine ленивый,
  подключения к БД при импорте нет). Временные файлы за собой подчищать.

### Соглашения, которые мы ввели (держать единообразно)
- **Проверка базы (`dbcheck`).** Модель `Issue` поддерживает основное действие
  (`fix_action`/`fix_label`), запасное (`alt_action`/`alt_label`) и ссылку
  (`link`/`link_label`); фронт `DbCheck.jsx` рисует всё это. Принцип: **сначала
  чинить/вести в карточку, удаление — последний вариант.**
- **Deep-link в карточку:** `/{ppe|materials|equipment}?edit=<id>` (InventoryList)
  и `/employees?edit=<id>` (Employees) авто-открывают форму редактирования.
  Тип→маршрут: ppe→/ppe, material→/materials, equipment→/equipment.
- **«Удалённое» (`trash`)** — корзина мягко-удалённых по 8 типам. Удаление
  навсегда (`purge`) блокируется при наличии ссылок; с `force` разрывает связи
  (обнуляет nullable-FK, удаляет историю выдач/поверок/норм), но структурные
  NOT-NULL дети (инвентарь→каталог/отдел, подкатегория→категория и т.п.) всё
  равно блокируют — родитель не сносит детей молча.
- **Списание окончательное → мягкое удаление** (`is_active=False`): позиция
  уезжает в «Удалённое». Старые списанные подбираются пунктом проверки базы.
- **Счётчики дашборда — в ШТУКАХ** (сумма `quantity`), не в строках. Карточка
  «Всего единиц» ведёт в общий раздел **«Всё»** (`/all`) — InventoryList со
  `scope="all"` (все типы + фильтр по типу).
- **Форма позиции учёта** жёстко режет номенклатуру по типу раздела
  (СИЗ→ppe, материалы→material, оборудование→equipment); в разделе «Всё»
  ограничения нет. Есть фильтр по категории.
- **PDF нормативки:** `GET /api/documents` — список (с авторизацией),
  `GET /api/documents/{file}` — отдача inline и **БЕЗ авторизации** (открытие в
  новой вкладке не может передать Bearer-токен). Защита от path-traversal на месте.
- **Комплаенс ТОН** считается ещё и в разрезе типа (СИЗ/СИ/материалы) — поле
  `categories` в ответах employees/departments.
- **Эффект «разряд» на логотипе** — хук `lib/brandFlash.js` + классы
  `brand-flash`/`brand-spark`/`brand-spark-box`, цвета через CSS-переменные
  `--brand-core`/`--brand-arc` (бело-голубые на тёмном сайдбаре, насыщённо-синие
  на светлой карточке логина). Эмблема — `assets/rosseti.svg`, перекрашена в
  белый через `filter: brightness(0) invert(1)`. Уважает `prefers-reduced-motion`.
- **Охрана труда (ОТ)** — ОТДЕЛЬНЫЙ блок, не смешивать с СИЗ-контролем/отчётами.
  Свой порог `OT_WARNING_DAYS = 7` (СИЗ — 30, не путать). Эндпоинты под
  `/api/ot/*` (`services/ot.py`, `routers/ot.py`): `deadlines` (срок ЭБ
  `eb_next_exam_date` + `expiry_date` допусков, только expiring/expired) и
  `report` (+ `/export`, переиспользует `to_xlsx`/`to_csv` из reports). Поля ЭБ
  у `Employee` (`eb_group`, `eb_exam_date`, `eb_next_exam_date`) — nullable,
  досоздаются `schema_sync`. Допуски — таблица `employee_authorizations`
  (один-ко-многим, `name` свободный), CRUD вложен в
  `/api/employees/{id}/authorizations`. Меню — секция «Охрана труда»; счётчик ОТ
  в сайдбаре отдельный (`otAlerts` в Layout/Sidebar, не путать с СИЗ `alerts`).
  Список видов допусков для выпадашки — `frontend/src/lib/otRights.js`
  (дополнять там; в карточке есть «Другое (вписать)» для отсутствующих).
- **Платформенный SSO (Keycloak)** — за флагом `PLATFORM_SSO` (env, default OFF;
  при OFF ничего не меняется, старый логин/пароль работает). Сделаны шаги 1–3 из
  `PLATFORM_SSO_INTEGRATION.md`: `services/keycloak.py` (проверка Keycloak JWT по
  JWKS: подпись, `iss`, `exp`, `azp==web-desktop`; aud НЕ проверяем; JWKS
  кэшируется; токен не логируем) и зависимость
  `get_platform_user` в `dependencies.py`.
  - **Модель прав (2026-07-08, как в Учёте ПУ):** Keycloak определяет ТОЛЬКО
    личность (email) и право входа — **единственная realm-роль `siz-user`**.
    Функциональная роль (`admin/lab/sue/res_user`) и подразделение (РЭС) берутся
    из УЧЁТКИ СИЗ, а не из токена. Никакого маппинга `siz-admin/...` и claim
    `res` больше нет (удалены `KEYCLOAK_ROLE_MAP`, `internal_role`, `res`,
    `_department_id_for_res`, `RES_CODE_ALIASES`, `_NO_DEPARTMENT_SENTINEL`).
  - Привязка (шаг 2): к локальному `User` по `keycloak_id`, затем разово по
    `email` (регистронезависимо); нет учётки → 401; авто-создания нет. Колонки
    `User.email` и `User.keycloak_id` — nullable, доезжают через `schema_sync`;
    уникальный индекс `ix_users_keycloak_id` создаётся в `on_startup` только при ON.
  - Доступ + права (шаг 3): нет роли `siz-user` в токене → **403** (не 401).
    Роль и `department_id` читаются из строки БД (`user.role.code`,
    `user.department_id`). Возвращается duck-typed `PlatformUser` (`.id`,
    `.role.code`, `.department_id`, …), совместимый с существующими проверками прав.
    Управлять ролью/РЭС/email пользователя — экран «Пользователи» (форма уже с
    полями email/роль/подразделение; для `res_user` подразделение обязательно).
  - Обмен на свою сессию (шаг 4): `POST /api/auth/platform` — принимает
    Keycloak-токен в `Authorization: Bearer`, прогоняет через `get_platform_user`
    (шаги 1–3) и выдаёт ОБЫЧНЫЙ сессионный JWT СИЗ с claim'ами
    `platform/role/dept` (роль/dept уже из БД). `get_current_user` при
    `platform=True` отдаёт `PlatformUser` с этими значениями. Обычный логин (без
    `platform`) не изменён. При `PLATFORM_SSO=OFF` эндпоинт отдаёт 401 (выключен).
  - Фронт (шаг 4): `AuthContext` слушает `window 'message'`, принимает ТОЛЬКО с
    `VITE_PLATFORM_ORIGIN` (default `https://sue-system-ashinoff.amvera.io`) и
    `type==='platform-auth'`, меняет токен на свою сессию (`skipAuthRedirect`,
    чтобы не редиректить на /login при неуспехе), хранит `siz_token` как обычно.
    В iframe показывается «Вход через платформу…» (`ssoPending`), при неуспехе/
    таймауте 5с — в iframe экран «Нет доступа» (`AccessDenied`, обратиться к
    администратору), вне iframe — обычная форма входа. Cookie не используются.
  - Встраивание в iframe (шаг 5): HTTP-middleware в `main.py` ставит на КАЖДЫЙ
    ответ (в т.ч. index.html/статику, не только /api) заголовок
    `Content-Security-Policy: frame-ancestors 'self' <PLATFORM_ORIGIN>` и снимает
    `X-Frame-Options`, если он вдруг есть. `PLATFORM_ORIGIN` — в `config.py`
    (default `https://sue-system-ashinoff.amvera.io`). Только директива
    frame-ancestors (не ломать скрипты/стили). Не за флагом (это лишь заголовок,
    авторизацию не трогает). Раздача — один контейнер (uvicorn отдаёт API+фронт),
    nginx нет. NB: у starlette `MutableHeaders` нет `.pop()` — удалять через `del`.
  - Осталось (шаг 6): конфиг платформы `VITE_APP_SIZ_URL` — на стороне SUE_system.
  - **Бейдж уведомлений (2026-07-09):** `GET /api/platform/badge` (новый
    `routers/platform.py`). Проверка Keycloak-токена как в `/auth/platform`, но
    БЕЗ создания сессии и без записи (только чтение): 401 при выкл. SSO/невалидном
    токене; учётка по `keycloak_id`→`email`; не найден/неактивен → `{"count":0}`.
    `count` = позиции СИЗ с истекающим/просроченным сроком службы ИЛИ поверки
    (та же логика, что `alert_items` в `/api/dashboard`, в qty) + сроки ОТ
    (`ot_service.deadlines` → `expiring`+`expired`), scope по подразделению как у
    роли (res_user — своё, admin/lab/sue — все). CORS: `PLATFORM_ORIGIN` добавлен
    в `allow_origins` (list из env, не `*`). Коммит `d8e1563`.

## Журнал изменений (Claude Code ведёт сам)
- **2026-07-20** — Фикс формы «Редактирование позиции» (`InventoryForm`): фильтры
  категории/подкатегории были локальными и открывались ПУСТЫМИ, а их `onChange`
  ВСЕГДА делал `set("catalog_item_id","")` → при редактировании поле «Категория»
  пустое, и любое его изменение сбрасывало выбранное наименование. Теперь: при
  открытии `categoryId/subcategoryId` предзаполняются из `editItem.catalog_item`
  (category_id/subcategory_id); смена фильтра сбрасывает наименование ТОЛЬКО если
  выбранная позиция реально не подходит под новый фильтр (`changeCategory/
  changeSubcategory` сверяют `selectedCatalog.category_id/subcategory_id`). Ранее
  внесённые данные больше не «слетают» при правке. Только фронт.
- **2026-07-20** — Метрология и во ВТОРОМ импорте — «Импорт позиций»
  (`importdata.py`, создаёт единицы на складе). В `TEMPLATE_COLUMNS` вставлены те же
  6 метрологических колонок перед «Комментарий» (индексы 12–17, комментарий сдвинут
  на 18); парсинг через хелперы `_row_str/_row_int`, поля пишутся в `InventoryItem`.
  В шаблоне теперь ДВА примера-строки: СИЗ (метрология пустая) и СИ (метрология
  заполнена) — «чтобы понимание было что заполнять». Проверено end-to-end: импорт
  позиции-СИ сохраняет все метрологические поля. Так метрология полноценно во обоих
  импортах (позиции + выданное) и их шаблонах.
- **2026-07-20** — Метрология СИ: новые поля по всей цепочке. В `InventoryItem`
  (model) добавлены `manufacture_year`, `accuracy_class`, `measurement_range`,
  `metrology_type` (вид КМХ), `metrology_interval_months`, `verification_certificate`
  (№ свидетельства о поверке) — nullable, `schema_sync` сам добавит колонки на
  Amvera. Проброшены в `InventoryItemBase/Update/Out` (роутер работает через
  model_dump/setattr — авто). Импорт выданного: в `TEMPLATE_COLUMNS` добавлены
  «Год выпуска», «Класс точности», «Предел (диапазон) измерений», «Вид КМХ»,
  «Периодичность КМХ (мес.)», «№ свидетельства о поверке»; парсинг переиндексирован
  (хелперы `cell/cell_str/cell_int`), новые поля пишутся в `InventoryItem`. Фронт:
  `InventoryForm` переструктурирована в **цветные секции** (нежные тона: `tone-si`
  зелёный — СИ/характеристики, `tone-place` голубой — размещение, `tone-verify`
  оранжевый — поверка/осмотр, `tone-neutral` — прочее; компонент `Section`, стили
  `.form-section*` в index.css); класс точности и диапазон — через `<datalist>`
  (можно выбрать из списка или ввести своё), вид КМХ — select. `InventoryDetail`
  показывает новые поля (условно, чтобы не засорять карточки СИЗ). Опции —
  `ACCURACY_CLASS_OPTIONS/MEASUREMENT_RANGE_OPTIONS/METROLOGY_TYPE_OPTIONS` в
  `format.js`. Проверено end-to-end: create/update, шаблон, импорт по новому шаблону.
- **2026-07-20** — В форме «Редактирование позиции» (`InventoryForm`, правка/создание
  карточки учёта из «Наличие») рядом с фильтром «Категория» добавлен фильтр
  **«Подкатегория»** для сужения списка «Позиция справочника». Состояние
  `subcategoryId`, `subcategoryOptions` (подкатегории среди позиций выбранной
  категории), `catalogFiltered` дополнительно фильтрует по `subcategory_id`; сброс
  при смене категории и открытии. Селект недоступен, пока не выбрана категория или
  у неё нет подкатегорий. (Форма позиции в Справочниках `CatalogItemModal` и так
  редактирует категорию И подкатегорию — там менять было нечего.) Только фронт.
- **2026-07-16** — Импорт: авто-определение подкатегории по названию. В
  `importdata.py` (импорт позиций) перед циклом строится карта
  `subcat_by_name = {(item_type, name.lower): (category_id, subcategory_id)}` из
  активных позиций с заданной подкатегорией; после find/create позиции, если у
  неё нет `subcategory_id` и совпадает категория — подкатегория наследуется (в
  шаблоне столбца подкатегории нет). В `import_issued.py` среди одноимённых
  позиций теперь предпочитается та, где подкатегория задана. Плюс UI: в модалке
  «Персонал → что выдано» заголовки категорий (`.issued-group-head`) и шапки
  таблиц залипают с z-index (контент больше не налезает сверху), а каждый
  div-группы — sticky-контейнер, поэтому следующий заголовок выталкивает
  предыдущий; глобально `table.data thead th` получил `z-index:3`.
- **2026-07-16** — Три правки: (1) «Персонал» — после кнопок в строке бейдж
  `issued_count` (сколько выдано сотруднику) со свечением как у логотипа
  (`.issued-count`, `.issued-count--zero` для 0). Бэкенд: `EmployeeOut.issued_count`
  + в `list_employees` один групповой запрос count по `current_employee_id`
  (status=issued, active). (2) «Наличие» — новый фильтр-селект по наименованию
  позиции (`/api/catalog/items`, реагирует на тип/категорию/подкатегорию),
  передаёт `catalog_item_id` в `/api/analytics/holdings`. (3) Скроллбар сайдбара
  (`.sidebar-nav`) сделан почти незаметным в тон navy (прозрачный трек, бледный
  thumb, ярче на hover). Подкатегория у позиции правится в Справочники
  (`CatalogItemModal` уже имеет поле) — код не менялся.
- **2026-07-15** — Меню «Наличие»: убраны все графики (по подразделениям/
  категориям/топ позиций/типам) — оставлены реестр + фильтры. Добавлен переход
  в карточку позиции: клик по **названию** открывает `InventoryDetail`, а кнопка
  «Корректировать карточку» (`IconEdit`) в конце строки открывает `InventoryForm`
  на правку — **только для admin/lab** (`canEdit = isAdmin || roleCode==='lab'`).
  Бэкенд `analytics.py`: в строки `/api/analytics/holdings` добавлен `id` (для
  перехода/правки); правку сохраняет `PUT /api/inventory/{id}` (require_privileged),
  после сохранения таблица перезагружается.
- **2026-07-14** — Новое меню **«Наличие»** (Аналитика) — «что у кого фактически
  есть», обратное укомплектованности ТОН (та показывает, чего НЕ хватает; ТОН не
  тронут). Бэкенд: `routers/analytics.py` → `GET /api/analytics/holdings` (фильтры
  item_type/department_id/category_id/subcategory_id/catalog_item_id/state/search,
  скоуп через `scoped_department_id`, агрегаты by_category/by_department/by_item/
  by_type + строки; `state`=issued|in_stock|all). Зарегистрирован в `main.py`.
  Фронт: `pages/Holdings.jsx` (фильтры + recharts: подразделения/категории/топ
  позиций/типы + таблица + экспорт Excel), маршрут `/holdings` в `App.jsx`, пункт
  меню в `Sidebar.jsx` (секция «Аналитика», `IconChartBar`). Пример: фильтр по
  ноутбукам → видно, у кого они. Проверено TestClient'ом (эндпоинт 200, структура).
- **2026-07-11** — Админ может менять `login` учётки. Схема `UserUpdate` получила
  `login: Optional[str]` (3–120); `update_user` (`routers/users.py`) меняет
  `login` с проверкой уникальности (`User.id != user_id` → 400 «Логин уже занят»).
  Фронт (`pages/Users.jsx`): у поля «Логин» снят `disabled={isEdit}`, `login`
  добавлен в edit-payload, `valid` теперь требует логин всегда (пароль — только
  при создании). Удаления пользователя в СИЗ НЕТ (только `block`/`unblock`), поэтому
  FK-чистки не требуется. Цель — унификация логинов между приложениями (доступ/роль
  платформа определяет по email). Коммит `6b7e82c`.
