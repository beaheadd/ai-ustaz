# Сервер AI Ustaz — уведомления о времени намаза

Владелец 20.11.2026 (скрин уведомлений Muslim Pro): «Нам тоже нужно добавить уведомления, чтобы правильные, красивые
уведомления время намаза приходило к клиенту.» Дизайн, приватность, тексты — `docs/дизайн/07-уведомления.md`.

Это первый «свой» API mugalim (CLAUDE.md: Python FastAPI + PostgreSQL, прод 127.0.0.1:8031). Пока в нём только Web Push.

## Как устроено

```
телефон (aiustaz.pro)                         сервер в РК (/opt/mugalim/server)
  prayer/times.ts считает 30 дней  ──POST /api/push/subscribe──▶  app.py  (mugalim-api, 127.0.0.1:8031)
  ДУМК на устройстве; на сервер:         подписка, язык, город,        │  проверка (push.py), лимиты (БД)
  подписка + язык + город строкой +      расписание — без координат    ▼
  {at, key, time, before, next}                                    PostgreSQL mugalim (своя база, peer)
                                                                       ▲
  push-sw.js показывает уведомление ◀── Web Push (VAPID, aes128gcm) ── jobs.py (mugalim-jobs, раз в 20 с)
```

| Файл | Что |
|---|---|
| `push.py` | чистые функции: проверка подписки и расписания (только https-адреса push-сервисов, ≤ 31 дня, ≤ 12 в сутки, время = момент по UTC+5, лишних полей нет), тексты ru/kk, «пора / поздно», TTL |
| `app.py` | FastAPI: `register(app, хранилище=, публичный_ключ=, отправить=)` и `создать_приложение()` (прод) |
| `jobs.py` | цикл отправки: наступившие → pywebpush; 404/410 — удалить подписку; опоздание > 10 мин — не слать; за 3 дня до конца расписания — одно тихое «обновите время»; раз в час — уборка |
| `db.py` | `Хранилище` на psycopg 3: миграции, подписка, расписание, «взять наступившие» (FOR UPDATE SKIP LOCKED — дважды не шлём), лимиты, журнал |
| `boot.py` | страж: база только `mugalim` / `mugalim_test_*`, нет таблиц BATR, адрес — только `MUGALIM_DATABASE_URL` (DATABASE_URL BATR и `/etc/world.env` не читаем); иначе — выход с кодом 78 |
| `envnum.py` | копия `speech/aiustaz_speech/envnum.py` (docs/источники-кода.md) |
| `vapid.py` | VAPID-ключи — только на сервере, сразу в `/etc/mugalim.env` (600), один раз |
| `migrations/NNN_*.sql` | только добавляющие (тест `test_миграции_только_добавляющие`) |
| `deploy/` | `mugalim-api.service`, `mugalim-jobs.service`, `setup-server.sh` |

## API

Все ответы `Cache-Control: no-store`; ошибки — `{"ошибка": "<код>"}` (присланное не возвращаем).

| Метод | Путь | Тело | Ответ |
|---|---|---|---|
| GET | `/api/push/key` | — | `{"key": "<публичный VAPID, base64url>"}` (503 — ключа нет) |
| POST | `/api/push/subscribe` | `{subscription:{endpoint, keys:{p256dh, auth}, expirationTime?}, lang:'ru'\|'kk', city:'Алматы', items:[{at, key, time, before, next?:{key,time}}]}` | `{ок, пунктов, до}`; повтор заменяет расписание целиком |
| POST | `/api/push/unsubscribe` | `{endpoint}` | `{ок}` — подписка и расписание удалены сразу |
| POST | `/api/push/test` | `{endpoint}` | `{ок}` — тестовое уведомление сразу (404 — нет подписки, 410 — подписка умерла и удалена, 429 — чаще 3 раз за 10 мин) |
| GET | `/api/push/health` | — | `{ок, ключ}` |

Лимиты (в БД): subscribe 10/мин с IP, unsubscribe 20/мин, test 10/мин с IP и 3/10 мин на подписку. IP — только хэш
(из `X-Real-IP` nginx), окно — минута, чистится через час. Тело ≤ 64 КБ. `Origin`, если есть, — только
`https://aiustaz.pro` / `https://www.aiustaz.pro` (`MUGALIM_PUSH_ORIGINS`).

## Что хранится (и сколько)

`push_subscriptions` — адрес push-сервиса браузера, ключи шифрования (p256dh, auth), язык, город строкой, конец
расписания; `push_items` — моменты на 30 дней (ключ намаза, местное время, «за N мин», следующий); `push_limits` —
счётчики по хэшу (час); `push_log` — хэш адреса, событие, код ответа (90 дней). Координат, имени, телефона, IP — нет.
Отписка — удаление сразу (каскад). Подписка, отвергнутая push-сервисом (404/410), — удаляется. Расписание, кончившееся
больше 30 дней назад, — удаляется вместе с подпиской.

## Запуск локально и тесты

```bash
cd server
python3 -m venv .venv && .venv/bin/pip install -r requirements.txt pytest
.venv/bin/python -m pytest -q tests                      # логика без БД (тесты БД пропускаются)
# с настоящим PostgreSQL — своя временная база mugalim_test_<…> создаётся и удаляется в каждом тесте:
MUGALIM_TEST_PG='postgresql://postgres@127.0.0.1:5432/postgres' .venv/bin/python -m pytest -q tests
python3 -m py_compile app.py push.py jobs.py db.py boot.py envnum.py vapid.py
# API вручную (своя база mugalim_dev):
MUGALIM_DATABASE_URL='dbname=mugalim_test_dev' MUGALIM_VAPID_PUBLIC=… MUGALIM_VAPID_PRIVATE=… \
  .venv/bin/python -m uvicorn --app-dir . --factory app:создать_приложение --port 8030
```
Прод-данные и `server/data` тесты не трогают (CLAUDE.md).

## Деплой на сервер BATR (то же, что речевой сервис)

`sudo bash server/deploy/setup-server.sh` (от root, из папки с исходниками) — идемпотентно:
пользователь `mugalim`, код в `/opt/mugalim/server`, venv, роль и база `mugalim` (UTF8) в уже работающем PostgreSQL
через `sudo -u postgres` (нет PostgreSQL — ставит пакет), VAPID-ключи в `/etc/mugalim.env` (600) — только если их нет,
`MUGALIM_VAPID_SUBJECT=https://aiustaz.pro`, службы `mugalim-api` (127.0.0.1:8031) и `mugalim-jobs`, проверка
`/api/push/health` и `/api/push/key` в конце. Миграции применяют сами службы при запуске. Чужие базы не читает.
В облачной сессии не запускать.

### Что ведущему сделать в batr-world (зона другого агента — здесь только инструкция)

1. **Код.** Скопировать `mugalim/server/` → `batr-world/aiustaz/server/` без `tests/`, `.venv/`, `__pycache__/`
   (`rsync -a --delete --exclude tests --exclude .venv --exclude __pycache__ mugalim/server/ batr-world/aiustaz/server/`)
   и положить `aiustaz/server/version.json`: `{"mugalim": "<коммит>", "дата": "…"}`. В `aiustaz/README.md` — строка
   про `aiustaz/server/` (как про `aiustaz/speech/`). Здесь не править — обновлять из mugalim.
2. **Workflow** `.github/workflows/aiustaz-server.yml` — по образцу `aiustaz-speech.yml`: `on: workflow_dispatch` и
   `push` в main по `paths: ['aiustaz/server/**']`, `concurrency: aiustaz-server`; шаги: ключ деплоя (те же секреты
   `DEPLOY_SSH_KEY`, `DEPLOY_KNOWN_HOSTS`, `DEPLOY_HOST`) → `tar czf /tmp/server.tgz -C aiustaz server` → scp →
   на сервере распаковать во временную папку и `sudo timeout 900 bash "$D/server/deploy/setup-server.sh"`, при
   ошибке — `journalctl -u mugalim-api -u mugalim-jobs -n 40`; проверка места на диске ≥ 1 ГБ (torch не нужен);
   последний шаг — `curl -fsS https://aiustaz.pro/api/push/health` (после строки nginx ниже).
3. **nginx aiustaz.pro** — в `deploy/aiustaz-app.nginx.conf` перед `location / { return 404; }`:
   ```nginx
   # Уведомления о времени намаза (mugalim/server, 127.0.0.1:8031) — только на своём домене. Тело — подписка и
   # расписание на 30 дней (≤ 64 КБ), без координат. Журнал доступа выключен: IP и адреса подписок не пишем.
   location /api/push/ {
       client_max_body_size 64k;
       limit_except GET POST { deny all; }
       proxy_pass http://127.0.0.1:8031;
       proxy_set_header Host $host;
       proxy_set_header X-Real-IP $remote_addr;
       proxy_set_header X-Forwarded-Proto $scheme;
       proxy_read_timeout 30s;
       access_log off;
       add_header Cache-Control "no-store" always;
       add_header X-Content-Type-Options "nosniff" always;
       add_header Content-Security-Policy "frame-ancestors 'none'" always;
       add_header Referrer-Policy "strict-origin-when-cross-origin" always;
       add_header Strict-Transport-Security "max-age=31536000" always;
   }
   ```
   (`proxy_pass` без слэша в конце: путь `/api/push/…` уходит как есть.) `/aiustaz/push-sw.js` отдельной строки не
   требует — его уже отдаёт `location /aiustaz/` с `no-cache`. В тест `server/__tests__/test_aiustaz_domain.py` —
   проверку, что в новом location повторены защитные заголовки. **batr.kz** `/api/push/` не отдаёт и не должен.
4. **Сборка приложения** — обычная выкладка `tools/release-batr.sh` (в ней `push-sw.js`; check-dist его пропускает
   по узкому исключению). На batr.kz worker не регистрируется (решает имя хоста).
5. **Проверка после выкатки** (с телефона): aiustaz.pro → «Ещё» → «Уведомления о намазе» → включить → «Проверить
   уведомление». В Actions — `https://aiustaz.pro/api/push/health` → `{"ок":true,"ключ":true}`.

## Настройки (`/etc/mugalim.env`, root, 600)

| Ключ | По умолчанию | Что |
|---|---|---|
| `MUGALIM_DATABASE_URL` | `dbname=mugalim` (unix-сокет, peer) | только своя база |
| `MUGALIM_VAPID_PUBLIC` / `MUGALIM_VAPID_PRIVATE` | создаёт `setup-server.sh` | ключи Web Push (base64url); закрытый — секрет, не менять (подписки станут недействительны) |
| `MUGALIM_VAPID_SUBJECT` | `https://aiustaz.pro` | контакт VAPID (без личной почты) |
| `MUGALIM_PUSH_TICK_SEC` | 20 (5–60) | период цикла отправки |
| `MUGALIM_PUSH_WORKERS` | 8 (1–32) | параллельных отправок |
| `MUGALIM_PUSH_ORIGINS` | `https://aiustaz.pro,https://www.aiustaz.pro` | разрешённые Origin |

Лицензии: pywebpush и py-vapid — MPL-2.0 (без изменений), psycopg — LGPL-3.0 (библиотека без изменений), остальное —
MIT/BSD/Apache (`licenses/README.md`, раздел «Сервер AI Ustaz»; экран «Лицензии»).
