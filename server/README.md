# Сервер AI Ustaz — уведомления и официальное время намаза

Владелец 20.11.2026 (скрин уведомлений Muslim Pro): «Нам тоже нужно добавить уведомления, чтобы правильные, красивые
уведомления время намаза приходило к клиенту.» Дизайн, приватность, тексты — `docs/дизайн/07-уведомления.md`.
Владелец 20.11.2026: «Время намаза Казахстан, Узбекистан бери из официальных источников… чтобы с местными один в один у
нас время было. А остальные по такой методологии можно считать» — раздел «Официальное время намаза» ниже.

Это первый «свой» API mugalim (CLAUDE.md: Python FastAPI + PostgreSQL, прод 127.0.0.1:8031): Web Push и годовые таблицы
времени намаза ДУМК/УМУз.

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
| `prayer.py` | официальное время намаза КЗ/УЗ: `GET /api/prayer/official`, скачивание и проверка таблиц ДУМК, правило УМУз в точке региона, фоновое обновление (раздел ниже) |
| `prayer_places.json` | пункты наших списков (KZ 168 → пункт ДУМК, UZ 176 → координаты); собирает `tools/prayer/build_server_places.py` |
| `migrations/NNN_*.sql` | только добавляющие (тест `test_миграции_только_добавляющие`); 003 — таблицы времени намаза |
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

## Официальное время намаза КЗ/УЗ (`prayer.py`, миграция 003)

```
телефон (aiustaz.pro)                     сервер                                ведомства
  место КЗ/УЗ из списка (id) ──GET /api/prayer/official?src=dumk&place=almaty&year=2026──▶ app.py (только из БД)
  таблица на год — в localStorage ◀── 200 {days[365×6], point, updated, sha} + ETag / 304          │
                                        jobs.py, поток prayer-official (раз в 60 с, ≤ 12 таблиц) ──▶ api.muftyat.kz
                                          два одинаковых ответа подряд, проверка, сверка ≤ 10 мин ──▶ new.islom.uz/api/v1/regions
```

| | ДУМК (`src=dumk`) | УМУз (`src=umuz`) |
|---|---|---|
| Пункты | 168 мест приложения → пункт ДУМК (`prayer_places.json`, точные строки координат из `/cities/`); 5 пунктов — «дубль» (у ДУМК две записи с одной точкой: Есік, Абай, Щучинск, Жітіқара, Тобыл — API отвечает 500) → `404 no_official`, телефон считает сам | 176 мест → ближайший регион из официального списка (≤ 80 км) |
| Откуда время | `https://api.muftyat.kz/prayer-times/<год>/<широта>/<долгота>` — таблица ДУМК (method `table`) | правило УМУз, как на muslim.uz и islom.uz: adhan 15,5°/15,5°, аср ханафи, шом = закат + 4; точка — регион из `https://new.islom.uz/api/v1/regions` (method `rule`); `MUGALIM_UMUZ_MODEL=farq` — «Ташкент + differ_minute» |
| Проверка | 365/366 дней подряд, «ЧЧ:ММ», порядок 6 времён, сверка со своим расчётом методом ДУМК ≤ 10 мин, два одинаковых ответа подряд | то же; сверка — правило в точке нашего места (ловит неверный регион) |

API (только чтение из БД, 60 запросов в минуту с IP-хэша):

| Запрос | Ответ |
|---|---|
| `GET /api/prayer/official?src=dumk\|umuz&place=<id>&year=<год>` | `200 {src, place, year, start, offset:300, days:[[fajr, sunrise, dhuhr, asr, maghrib, isha] × 365/366], point:{id, name}, method:'table'\|'rule', updated, checked, sha}`, `ETag`, `Cache-Control: public, max-age=86400`; `304` по `If-None-Match` |
| нет таблицы | `404 {ошибка:'not_ready'}` (no-store) — пункт ставится в очередь, jobs скачает за минуту |
| у ведомства нет таблицы | `404 {ошибка:'no_official'}` (кэш сутки) |
| не тот src / пункт не из списка (координаты не принимаем) / год не из [текущий − 1; текущий + 1] | `400 {ошибка:'src'\|'place'\|'year'}` |

Фоном (jobs, поток `prayer-official`, раз в `MUGALIM_PRAYER_TICK_SEC` = 60 с, до 12 таблиц за раз, пауза 2 с между
запросами к ДУМК): сначала то, что просили телефоны, потом недостающие таблицы текущего года (с 1 ноября — и следующего),
потом не сверенные 7 дней (`MUGALIM_PRAYER_RECHECK_DAYS`). Неудача — в журнал (`prayer_log`), следующая попытка пункта —
не раньше чем через час; принятая таблица не меняется на непроверенную. Первое заполнение всех 163 + 176 таблиц —
около часа. Живая проверка 20.11.2026 (этот код против api.muftyat.kz, 2026 год): см. `docs/исследование/13-время-намаза-думк.md`.

Хранится (`prayer_official`, `prayer_wanted`, `prayer_log` — год, `prayer_meta`): таблицы ведомств по пунктам,
очередь, журнал, последний принятый список регионов УМУз. Ни IP, ни координат пользователей.

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
python3 -m py_compile app.py push.py jobs.py db.py boot.py envnum.py vapid.py prayer.py
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
   Официальное время намаза (владелец 20.11.2026) — там же, рядом:
   ```nginx
   # Официальное время намаза КЗ/УЗ (mugalim/server/prayer.py, 127.0.0.1:8031): только GET, в запросе — src, id пункта
   # из списка приложения и год (координат нет). Ответ ≈ 18 КБ (gzip ≈ 4 КБ), кэшируется сутки (ETag).
   location = /api/prayer/official {
       limit_except GET { deny all; }
       proxy_pass http://127.0.0.1:8031;
       proxy_set_header Host $host;
       proxy_set_header X-Real-IP $remote_addr;
       proxy_set_header X-Forwarded-Proto $scheme;
       proxy_read_timeout 15s;
       access_log off;
       gzip on;
       gzip_types application/json;
       add_header X-Content-Type-Options "nosniff" always;
       add_header Content-Security-Policy "frame-ancestors 'none'" always;
       add_header Referrer-Policy "strict-origin-when-cross-origin" always;
       add_header Strict-Transport-Security "max-age=31536000" always;
   }
   ```
   (`Cache-Control` и `ETag` ставит сам API — здесь не перебивать.) В тест `test_aiustaz_domain.py` — те же проверки
   защитных заголовков и что `/api/prayer/` есть только у aiustaz.pro. Серверу BATR нужен выход наружу к
   `api.muftyat.kz` и `new.islom.uz` (HTTPS 443) — для службы `mugalim-jobs`.
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
| `MUGALIM_PRAYER_FETCH` | 1 (0/1) | скачивать официальные таблицы (0 — API отдаёт только то, что уже в базе) |
| `MUGALIM_PRAYER_TICK_SEC` | 60 (20–3600) | период фонового обновления таблиц |
| `MUGALIM_PRAYER_MAX_DIFF_MIN` | 10 (1–30) | наибольшее расхождение таблицы со своим расчётом; больше — не принимаем |
| `MUGALIM_PRAYER_RECHECK_DAYS` | 7 (1–60) | как часто перепроверять принятую таблицу |
| `MUGALIM_UMUZ_MODEL` | `nuqta` | УМУз: `nuqta` — правило в точке региона (как islom.uz/taqvim), `farq` — Ташкент + differ_minute |
| `MUGALIM_UMUZ_REGIONS_URL` | `https://new.islom.uz/api/v1/regions` | список регионов УМУз (точки) |

Лицензии: pywebpush и py-vapid — MPL-2.0 (без изменений), psycopg — LGPL-3.0 (библиотека без изменений), adhanpy —
MIT (своя проверка официального времени; округление — своё), остальное — MIT/BSD/Apache (`licenses/README.md`, раздел «Сервер AI Ustaz»; экран «Лицензии»).
