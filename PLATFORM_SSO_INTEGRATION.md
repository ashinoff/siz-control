# Интеграция СИЗ-контроля в платформу (единый вход + встраивание)

> **Для кого этот файл.** Это контекст для Claude Code, работающего **в репозитории `siz-control`**.
> Здесь: что уже построено и работает, как оно устроено, точные значения для конфигурации и
> пошаговая задача. Цель — чтобы СИЗ-контроль открывался внутри платформы в iframe и сразу
> был залогинен под тем же пользователем (единый вход через Keycloak), не требуя отдельного логина.
>
> **Работать за фиче-флагом `PLATFORM_SSO` (по умолчанию OFF).** Старый вход по логину/паролю
> должен продолжать работать, пока флаг выключен, — чтобы ничего не сломать в проде.

---

## 1. Что уже сделано и работает (не трогать, это фундамент)

### Keycloak — центральная «проходная» (SSO / Identity Provider)
- Развёрнут на Amvera (маркетплейс-сервис Keycloak) с отдельной БД PostgreSQL. Живёт как **отдельный сервис**, не внутри платформы и не внутри СИЗ.
- **URL:** `https://keycloak-ashinoff.amvera.io`
- **Realm:** `platform`
- **Client `web-desktop`:** OpenID Connect, **public** (Client authentication = OFF), Standard flow = ON.
  - Valid redirect URIs: `https://sue-system-ashinoff.amvera.io/*`
  - Web origins: `https://sue-system-ashinoff.amvera.io`
- **Роли realm:** пока заведена только `admin`. Тестовый пользователь `test` (роль `admin`).
- Статус: **вход платформы через Keycloak работает и проверен.**

### Платформа (репозиторий `SUE_system`) — «рабочий стол»
- **URL:** `https://sue-system-ashinoff.amvera.io`
- Стек: React + Vite + `keycloak-js`. При входе редиректит на Keycloak, получает access-токен (JWT).
- Приложения — иконки на рабочем столе; открываются **в iframe**.
- Иконка СИЗ показывается для ролей `siz_user` / `admin`; её URL берётся из `VITE_APP_SIZ_URL`.
- `.env.production` платформы сейчас:
  ```
  VITE_AUTH_DISABLED=false
  VITE_KEYCLOAK_URL=https://keycloak-ashinoff.amvera.io
  VITE_KEYCLOAK_REALM=platform
  VITE_KEYCLOAK_CLIENT=web-desktop
  VITE_APP_SIZ_URL=about:blank      ← заменим на URL СИЗ в самом конце (шаг 6)
  ```

### СИЗ-контроль (репозиторий `siz-control`) — текущее состояние
- **URL (прод, Amvera):** `https://siz-control-ashinoff.amvera.io` (сейчас показывает свой логин `/login`).
- Рабочее приложение: **FastAPI + SQLAlchemy 2 + Alembic** (бэкенд), **React + Vite** (фронт).
- Свой вход: JWT по логину/паролю. Внутренние роли: `admin`, `lab`, `sue`, `res_user`.
  `res_user` ограничен своим подразделением (РЭС).
- Прод на Amvera: один контейнер (node собирает фронт → python отдаёт API и статику), PostgreSQL.
- **Грабли из `CLAUDE.md` (учитывать обязательно):**
  - Схема БД в проде создаётся через `create_all` + **`schema_sync.py`**, а НЕ через `alembic upgrade`. Новые колонки добавлять через `schema_sync`, они должны быть `nullable`/с дефолтом и Postgres-safe.
  - Контейнер эфемерный (диск не переживает пересборку) — ничего важного не хранить на локальном ФС.

---

## 2. Как это должно работать после интеграции

```
[Платформа] --логин--> [Keycloak] --токен--> [Платформа]
[Платформа] --кладёт СИЗ в iframe и постит токен--> [СИЗ (iframe)]
[СИЗ] --проверяет токен по публичным ключам--> [Keycloak (JWKS)] --> пускает под нужной учёткой
```

Keycloak — общий сервис, к которому обращаются оба по отдельности. «Между» платформой и СИЗ передаётся только **токен**, который выдал Keycloak.

---

## 3. Контракт передачи токена (подтверждён по коду платформы)

Платформа при загрузке iframe отправляет приложению сообщение:

```js
// SUE_system/src/components/AppFrame.jsx (onLoad iframe)
iframe.contentWindow.postMessage(
  { type: 'platform-auth', token: '<Keycloak access JWT>' },
  '<origin приложения>'   // targetOrigin = origin из VITE_APP_SIZ_URL
)
```

Что важно знать СИЗ-стороне:
- **Тип сообщения:** `type === 'platform-auth'`, поле `token` — это **Keycloak access-токен (JWT)**.
- Слушать `window.addEventListener('message', ...)` и **обязательно проверять `event.origin`** — принимать только с origin платформы `https://sue-system-ashinoff.amvera.io`. Иначе любой сайт сможет прислать поддельный токен.
- Токен постится **один раз, на `onLoad` iframe** (не при тихом refresh токена в платформе). Keycloak access-токены короткоживущие (~5 мин). Поэтому СИЗ на его основе заводит **свою сессию**, а не гоняет протухающий внешний токен вечно:
  - СИЗ уже работает на Bearer-JWT (axios-интерсептор) — это идеально ложится. Паттерн: получил токен платформы → бэкенд СИЗ его проверил (шаг 1) → выдал **свой** сессионный JWT (короткий, со своим refresh) → фронт СИЗ хранит его в памяти/`localStorage` **внутри iframe** и шлёт как `Authorization: Bearer` на свой же API (фронт и API СИЗ — один origin, CORS не мешает).
  - ⚠️ **Не полагаться на cookie для сессии.** СИЗ открыт в iframe под доменом платформы (`sue-system…`) — для браузера это сторонний контекст, и cookie СИЗ будут «третьей стороной», а их современные браузеры режут. Bearer-токен в JS iframe этой проблемы лишён.
  - Альтернатива на будущее: доработать платформу, чтобы она повторно постила обновлённый токен в iframe. Но своя сессия в СИЗ — проще и надёжнее.
- iframe создаётся с `sandbox="allow-same-origin allow-scripts allow-forms allow-popups allow-downloads"`.

Клеймы в токене (из `realm_access` / стандартные OIDC):
- `sub` — постоянный ID пользователя в Keycloak (→ наш `keycloak_id`)
- `email`, `preferred_username`, `name`
- `realm_access.roles` — массив ролей realm

---

## 4. Готовые значения для конфигурации

| Что | Значение |
|---|---|
| Keycloak base URL | `https://keycloak-ashinoff.amvera.io` |
| Realm | `platform` |
| Issuer (`iss` в токене) | `https://keycloak-ashinoff.amvera.io/realms/platform` |
| JWKS (публичные ключи) | `https://keycloak-ashinoff.amvera.io/realms/platform/protocol/openid-connect/certs` |
| OIDC discovery | `https://keycloak-ashinoff.amvera.io/realms/platform/.well-known/openid-configuration` |
| Client ID | `web-desktop` (public-клиент; в токене `azp = web-desktop`) |
| Origin платформы (postMessage + CSP `frame-ancestors`) | `https://sue-system-ashinoff.amvera.io` |
| URL самого СИЗ | `https://siz-control-ashinoff.amvera.io` |
| Origin СИЗ (для postMessage targetOrigin) | `https://siz-control-ashinoff.amvera.io` |

> **Про проверку `aud`:** у public-клиента через Standard flow в access-токене обычно `azp = web-desktop`, а `aud` часто `account`. Поэтому проверяем **подпись (JWKS) + `iss` + `exp` + `azp === web-desktop`**, и НЕ требуем жёстко `aud === web-desktop` (иначе валидный токен будет отклонён). При желании можно добавить в Keycloak audience-mapper, чтобы `aud` включал `web-desktop`.

---

## 5. Задача для Claude Code (по шагам, репозиторий `siz-control`)

> Первым делом: прочитать `CLAUDE.md` этого репозитория и зафиксировать реальный стек/структуру.
> Всё ниже — **за фиче-флагом `PLATFORM_SSO` (default OFF)**. Реализовывать по шагам, не одним гигантским коммитом.

### Шаг 1 — Бэкенд: проверка токена Keycloak
- Зависимость/middleware, которая берёт `Authorization: Bearer <JWT>` и проверяет токен по **JWKS Keycloak**: подпись, `iss`, `exp`, `azp === web-desktop`. JWKS кэшировать (не дёргать Keycloak на каждый запрос).
- Из валидного токена собирать `current_user`: `keycloak_id = sub`, `email`, `roles = realm_access.roles`.
- Невалидный/просроченный/без токена → **401**.
- Логировать причину 401 (плохая подпись / просрочен / не тот issuer / нет заголовка). **Сам токен НЕ логировать и не хранить.**

### Шаг 2 — БД: привязка пользователя к Keycloak
- Добавить колонку `keycloak_id` (unique, **nullable**, индекс) — **через `schema_sync.py`, НЕ через alembic** (см. грабли в §1).
- Разовая привязка существующих учёток: сматчить по `email` (email из токена ↔ `user.email`), проставить `keycloak_id`.
- Политика первого входа, если пользователь не найден ни по `keycloak_id`, ни по `email`: по умолчанию — **отказ** (не создаём молча). Авто-создание — опция, включать осознанно.

### Шаг 3 — RBAC: маппинг ролей + подразделение (РЭС)
- Маппить роли Keycloak (`realm_access.roles`) → внутренние роли СИЗ (`admin` / `lab` / `sue` / `res_user`).
- ⚠️ **Нестыковка таксономии, нужно решение (см. §7):** в Keycloak сейчас только `admin`; платформа знает `siz_user` / `admin`; СИЗ знает `admin` / `lab` / `sue` / `res_user`.
- **Подразделение (РЭС) для `res_user`:** определить источник — либо claim/attribute в токене Keycloak, либо хранить за пользователем в БД СИЗ (проставлять при первом входе/привязке). В исходном промте это не покрыто — **дорешать**.

### Шаг 4 — Фронт СИЗ: приём токена от платформы
- `window.addEventListener('message', ...)`: принимать только `event.origin === https://sue-system-ashinoff.amvera.io` и `event.data.type === 'platform-auth'`.
- Полученный токен: отправить на бэкенд СИЗ → бэкенд валидирует (шаг 1) и **устанавливает свою сессию** (см. §3). Дальше UI работает на этой сессии.
- Свой логин по паролю оставить как **fallback за флагом** (когда `PLATFORM_SSO` off или сообщения от платформы нет).

### Шаг 5 — Разрешить встраивание в iframe
- Заголовки ответа: `Content-Security-Policy: frame-ancestors 'self' https://sue-system-ashinoff.amvera.io`.
- **Убрать `X-Frame-Options: DENY`/`SAMEORIGIN`**, если он выставляется (иначе браузер не даст платформе встроить СИЗ в iframe).

### Шаг 6 — Конфиг
- Backend env: `PLATFORM_SSO` (флаг), `KEYCLOAK_ISSUER`, `KEYCLOAK_JWKS_URL` (или базовый `KEYCLOAK_URL`+`REALM`), `PLATFORM_ORIGIN`.
- Frontend: origin платформы для проверки `message`.

### Чего НЕ делать
- Не ломать существующий вход по логину/паролю (флаг OFF по умолчанию).
- Не трогать бизнес-логику СИЗ (склад, нормы/ТОН, сроки/поверки, отчёты, охрана труда).
- Не логировать и не хранить сам токен.
- Схему БД менять **только через `schema_sync`**, не через alembic.

---

## 6. После интеграции — включить на платформе
1. В `.env.production` платформы заменить `VITE_APP_SIZ_URL=about:blank` на **`https://siz-control-ashinoff.amvera.io`** — именно **корень**, НЕ `/login` (встроенный СИЗ должен ловить токен от платформы и НЕ показывать свой логин).
2. Пересобрать платформу на Amvera (`VITE_*` вшиваются на этапе сборки).
3. Проверка: вход в платформу → клик по иконке **СИЗ-контроль** → открывается в окне **уже залогиненным** под тем же пользователем.

---

## 7. Открытые решения (нужен ответ от владельца, не от Claude Code)

1. **Таксономия ролей.** Что заводим в realm `platform` и как маппим на роли СИЗ.
   Рекомендация: завести realm-роли 1:1 с СИЗ (`admin`, `lab`, `sue`, `res_user`; при желании `siz_user` как «доступ к иконке») и маппить один-в-один.
2. **Источник подразделения (РЭС)** для `res_user`.
   Рекомендация: хранить РЭС как **атрибут пользователя в Keycloak** и прокинуть его в токен protocol-mapper'ом — тогда СИЗ берёт и роль, и подразделение прямо из токена, без ручной привязки в своей БД.

---

## 8. Дальше — вне этой задачи (следующий этап)
- **Уведомления на рабочий стол.** СИЗ уже считает свои тревоги по срокам (счётчики `alerts` и `otAlerts` в сайдбаре) — отдать их отдельным эндпоинтом, платформа подтянет их и повесит бейдж на иконку + в «колокольчик». Это отдельный этап, в текущую задачу не входит.
- **Косметика формы входа Keycloak** (кастомная тема) — тоже отдельно, на вход не влияет.
