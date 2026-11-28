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
| `push.py` | чистые функции: проверка подписки и расписания (только https-адреса push-сервисов, ≤ 31 дня, ≤ 12 в сутки, время = момент по UTC+5, лишних полей нет), тексты ru/kk/uz/en (uz — латиница; uz и en — черновик; en: Fajr, Dhuhr… пятница — «Jumu'ah prayer»), «пора / поздно», TTL |
| `app.py` | FastAPI: `register(app, хранилище=, публичный_ключ=, отправить=)` и `создать_приложение()` (прод) |
| `jobs.py` | цикл отправки: наступившие → pywebpush; 404/410 — удалить подписку; опоздание > 10 мин — не слать; за 3 дня до конца расписания — одно тихое «обновите время»; раз в час — уборка |
| `db.py` | `Хранилище` на psycopg 3: миграции, подписка, расписание, «взять наступившие» (FOR UPDATE SKIP LOCKED — дважды не шлём), лимиты, журнал |
| `boot.py` | страж: база только `mugalim` / `mugalim_test_*`, нет таблиц BATR, адрес — только `MUGALIM_DATABASE_URL` (DATABASE_URL BATR и `/etc/world.env` не читаем); иначе — выход с кодом 78 |
| `envnum.py` | копия `speech/aiustaz_speech/envnum.py` (docs/источники-кода.md) |
| `vapid.py` | VAPID-ключи — только на сервере, сразу в `/etc/mugalim.env` (600), один раз |
| `prayer.py` | официальное время намаза КЗ/УЗ: `GET /api/prayer/official`, скачивание и проверка таблиц ДУМК, правило УМУз в точке региона, фоновое обновление (раздел ниже) |
| `prayer_places.json` | пункты наших списков (KZ 168 → пункт ДУМК, UZ 176 → координаты); собирает `tools/prayer/build_server_places.py` |
| `migrations/NNN_*.sql` | только добавляющие (тест `test_миграции_только_добавляющие`); 003 — таблицы времени намаза; 004 — база знаний «Спросить AI Ustaz»; 005 — язык uz (столбец `lang_ui`: ограничение `lang` из 001 не меняем, для uz там запасной `ru`); 006 — язык en (столбец `lang_code` ru/kk/uz/en — db.py читает `COALESCE(lang_code, lang_ui, lang)`, в `lang` и `lang_ui` для en пишет запасной `ru`; таблица `kb_texts_en` — английские тексты базы знаний, словарь `english`: в `kb_texts` язык ограничен ru/kk/uz). **Сервер выкатывать раньше клиента:** старый сервер ответит на en-подписку и en-вопрос 400 `lang` |
| `metals.py` | цены золота и серебра за 1 г в тенге для калькулятора закята: `GET /api/zakat/prices`, выгрузка НБ РК + ЦБ РФ раз в сутки (поток `metals` в jobs), проверка; миграция 021 (раздел ниже) |
| `stats.py` | своя анонимная статистика: `POST /api/stats/e` (только aiustaz.pro; без cookie, IP, строки браузера, мест), суточные итоги, сводка для админки; сырые события 90 дней (владелец 27.11.2026) |
| `admin.py` | админка: вход по коду из письма (SMTP 127.0.0.1:25, HMAC кода, `MUGALIM_ADMIN_SECRET`), роли owner/admin/viewer, сеансы (cookie HttpOnly, SameSite=Strict), админы, журнал действий, `GET /api/admin/stats` |
| `content_admin.py` | настройки содержимого: чтецы (включены, по умолчанию), хадисы (скрыть, проверено устазом) — только отметки, без текста; `GET /api/content/config` для приложения; версии с sha256 |
| `admin_static/` | собранная админка (`node admin/build.mjs`, вне git mugalim) — nginx отдаёт на https://aiustaz.pro/admin/ |
| `deploy/` | `mugalim-api.service`, `mugalim-jobs.service`, `setup-server.sh` |

## Админка и статистика (007; владелец 27.11.2026 — docs/дизайн/12-админка-и-статистика.md)

| Метод | Путь | Кто | Что |
|---|---|---|---|
| POST | `/api/stats/e` | приложение (aiustaz.pro) | события `{v:1, sid, sess, lang, dev, os, st, ref, ver, ev:[{t:'o'\|'v'\|'b', s?, n?, d?}]}` → 204; 60/мин с IP, 30/мин на устройство |
| GET | `/api/content/config` | приложение | `{формат, версия, sha256, чтецы:{включены, поУмолчанию}, хадисы:{скрыты, проверены}}`, ETag, 5 мин |
| POST | `/api/admin/login/code`, `/login/verify`, `/logout` | все | вход по коду из письма; ответ «код отправлен» одинаков для любой почты |
| GET | `/api/admin/me`, `/sessions`; POST `/sessions/revoke` | вошедший | кто я, мои входы |
| GET/POST | `/api/admin/users`, `/users/update`, `/users/remove` | владелец | админы; владельца из `MUGALIM_ADMIN_OWNER_EMAILS` не изменить |
| GET | `/api/admin/stats?days=1\|7\|30\|90` | просмотр+ | сводка для первой страницы |
| GET | `/api/admin/audit` | админ+ | журнал действий |
| GET | `/api/admin/content`; POST `/content/reciters`, `/content/hadith`; GET `/content/hadith/approved` | просмотр+ / админ+ | чтецы и отметки хадисов, выгрузка для `content/hadith/одобрено.json` |

Изменения в админке — только POST с `X-Aiustaz-Admin: 1` и своим Origin. Окружение: `MUGALIM_ADMIN_SECRET` (создаёт
setup-server.sh), `MUGALIM_ADMIN_OWNER_EMAILS` (через запятую; ставит workflow batr-world «AI Ustaz admin: set owner» из
секрета `AIUSTAZ_ADMIN_OWNER_EMAIL`, затем перезапуск mugalim-api). Тесты: `server/tests/test_admin.py` (временная база),
`admin/e2e-admin.mjs` (Playwright против `admin/test_server.py` с выдуманными данными).

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

## Цены золота и серебра для закята (`metals.py`, миграция 021)

Владелец 28.11.2026: «Данные серебра и золота подтягивай сам из официальных источников. Не нужно, чтобы человек это
делал.» Калькулятор `#/zakat` подставляет цены сам; поля цены — за «Изменить цену вручную».

| | Откуда | Единица |
|---|---|---|
| Золото | Национальный банк РК, «Стоимость 1 грамма золота в тенге»: `https://nationalbank.kz/ru/gold/zoloto` (HTML-таблица «Дата / Стоимость», 30 рабочих дней). Формула НБ РК: фиксинг LBMA (утро предыдущего дня, $/тр. унция) × курс USD/KZT НБ РК ÷ 31,1034768 | ₸ за 1 г |
| Серебро | НБ РК серебро не публикует. Та же формула НБ РК: учётная цена серебра Банка России (`https://www.cbr.ru/scripts/xml_metall.asp`, Code 2, ₽ за 1 г) ÷ курс доллара ЦБ РФ (`XML_dynamic.asp`, R01235) × курс USD/KZT НБ РК на дату золота (`https://nationalbank.kz/rss/get_rates.cfm?fdate=ДД.ММ.ГГГГ`). LBMA напрямую — 403 и лицензия | ₸ за 1 г |

Проверка: две выгрузки подряд совпали; золото 10 000–1 000 000 ₸/г, серебро 50–20 000 ₸/г, золото/серебро 20–200; дата
не в будущем и не старше 10 дней; скачок к прошлому дню < 30 %; сверка — золото ЦБ РФ тем же пересчётом отличается от
НБ РК не больше 5 % (день ЦБ РФ — тот, где сверка ближе: тот же фиксинг; ноябрь 2026 — 0,03–1,9 %). Не прошло — запись в
`metal_log`, прежняя цена остаётся. Образцы настоящих ответов — `tests/fixtures/metals/`, тесты — `tests/test_metals.py`.

| Запрос | Ответ |
|---|---|
| `GET /api/zakat/prices` | `200 {date, gold_per_g, silver_per_g, currency:'KZT', unit:'g', source, silver_source, silver_method:'cbr-usd-nbk', updated}`, `Cache-Control: public, max-age=10800`, ETag / 304; 60 в минуту с хэша IP |
| цен ещё нет | `503 {ошибка:'not_ready'}` (no-store) — клиент оставляет ручной ввод |

nginx aiustaz.pro (batr-world `deploy/aiustaz-app.nginx.conf`): `location = /api/zakat/prices` → 127.0.0.1:8031, только GET,
без журнала. Серверу нужен выход к `nationalbank.kz` и `www.cbr.ru` (HTTPS) — для `mugalim-jobs`.

## «Спросить AI Ustaz» — чат в центре меню (`ask.py`, `ask_media.py`, `quran_ref.py`, `kb.py`, `kb_load.py`, миграции 004 и 020)

Владелец 20.11.2026: «люди могут задавать свои вопросы и получать ответы … Только с нашей базы данных, в интернете не
будет искать … Сделай эту функцию, но не выкатывай.» Дизайн, границы и вопросы владельцу —
`docs/дизайн/08-спросить-устаза.md`; формат базы — `docs/база-знаний.md`.

| Запрос | Ответ |
|---|---|
| `POST /api/ask/v1` `{q: 3…500 символов, lang: 'ru'\|'kk'\|'uz'\|'en'}` | `200 {вид: 'ответ'\|'нет-в-базе'\|'к-имаму'\|'вне-темы', режим: 'поиск'\|'ии', текст, источники: [{id, вид, заголовок, ссылка, текст, арабский, источник, степень, кто_оценил, черновик, версия}], черновик}` |
| ошибки | `400 question\|lang`, `413 size` (тело > 8 КБ), `429 rate` (10/мин и 100/сутки по Алматы с хэша IP), `403 origin`, `503 kb` (база пуста или недоступна) |
| `GET /api/ask/health` | `{ок: true, записей, режим}` |

**Владелец 27.11.2026: выкатываем (режим «поиск», без внешнего ИИ).** `setup-server.sh` ставит `MUGALIM_ASK=1` и грузит
`kb/*.jsonl` (в копии batr-world — `aiustaz/server/kb/`: `spravka.jsonl`, `site.jsonl`). Дополнительно:

| Запрос | Ответ |
|---|---|
| «как читается аят 2:255», «сура Ихлас», «аят аль-Курси» (ru/kk/uz/en; `quran_ref.ссылка_из_вопроса`) | `200 {вид: 'ответ', намерение: 'аят', источники: [{вид: 'коран', ссылка: '2:255', текст: ''}]}` — текста Корана нет: аят показывает приложение из своей копии Tanzil |
| `POST /api/ask/report` `{ответ, причина: неверно\|непонятно\|другое, комментарий?, источники?}` | `200 {ок}` — в `ask_reports` (180 дней): id ответа, причина, обезличенный комментарий, id записей; текста вопроса нет. 5/мин, 30/сутки |
| `POST /api/ask/voice?lang=` тело — аудио ≤ 1,5 МБ | `200 {текст}` — распознаёт служба `mugalim-asr` (127.0.0.1:8033, faster-whisper на CPU, `asr_service.py`); 404 `off` без `MUGALIM_ASK_VOICE=1`; 422 `empty`; 503 `asr` |
| `POST /api/ask/photo?lang=` тело — JPEG/PNG/WebP ≤ 2 МБ | ответ чата + `распознано` (без арабского); OCR — `tesseract` (ara+rus+kaz+eng, stdin→stdout, nice, 25 с); арабский → `quran_ref.сопоставить` (F1 по триграммам, порог 0,55 и отрыв 0,08) → «аят»; 404 `off` без `MUGALIM_ASK_PHOTO=1` |
| `GET /api/ask/health` | `+ {голос, фото}` — клиент показывает 🎤 и 📷 только по ним |

Аудио и фото живут только в памяти запроса и удаляются сразу; в журнал — длительность и итог. Голос и фото включаются
входами workflow `aiustaz-server.yml` (`ask_voice`, `ask_photo` = on|off): `setup-server.sh` ставит флаги, Tesseract
(пакеты дистрибутива) и окружение `/opt/mugalim/asr-venv` + модель (`MUGALIM_ASR_MODEL`, по умолчанию small) — голос
только при ≥ 2 ядрах и ≥ 2 ГБ свободной памяти (иначе флаг выключается сам).

Путь вопроса: классификатор (словари ru/kk/uz/en в `ask.py`, черновик) → `вне-темы` (политика, течения, экстремизм, споры
мазхабов, не-исламское) / тафсир (только запись базы вида «тафсир» с той же «сура:аят», ИИ-тафсира нет) / `к-имаму`
(личный фикх: шаблон «к имаму, в ДУМК, Imam AI» + общие материалы) / поиск PostgreSQL (`tsv` 'russian'/'simple' +
`tsv_simple` для префиксов; порог — доля совпавших слов `MUGALIM_ASK_MIN_SHARE`). Не нашли — `нет-в-базе` и +1 в
`ask_misses` за день (вопрос не храним). Режим `ии` — только при `MUGALIM_ASK_LLM=1` и ключе: обезличенный вопрос +
найденные записи → Claude (SDK `anthropic`, структурированный JSON) → валидатор → иначе откат в `поиск`.

Загрузка базы (на сервере, из `/opt/mugalim/server`, база — `MUGALIM_DATABASE_URL`):
```bash
python -m kb_load --check ../content/kb/spravka.jsonl   # только проверить
python -m kb_load ../content/kb/spravka.jsonl           # загрузить: всё или ничего, upsert по id, версия и sha256
```
nginx (когда владелец решит выкатывать — по образцу `/api/push/`): `location /api/ask/ { client_max_body_size 8k;
limit_except GET POST { deny all; } proxy_pass http://127.0.0.1:8031; … access_log off; }` — журнал доступа выключен
(IP не пишем), `proxy_read_timeout 20s` (ИИ — до 10 с).

## Что хранится (и сколько)

`push_subscriptions` — адрес push-сервиса браузера, ключи шифрования (p256dh, auth), язык, город строкой, конец
расписания; `push_items` — моменты на 30 дней (ключ намаза, местное время, «за N мин», следующий); `push_limits` —
счётчики по хэшу (час); `push_log` — хэш адреса, событие, код ответа (90 дней). Координат, имени, телефона, IP — нет.
Отписка — удаление сразу (каскад). Подписка, отвергнутая push-сервисом (404/410), — удаляется. Расписание, кончившееся
больше 30 дней назад, — удаляется вместе с подпиской.
«Спросить AI Ustaz»: `kb_entries`, `kb_texts` — база знаний (записи, не люди); `ask_log` — дата, вид ответа, режим,
код причины отката, число источников (90 дней); `ask_misses` — число «не нашли» за день. Текста вопроса и IP нет нигде;
лимиты — хэш IP в `push_limits` (минутные — час, суточные `askd:` — двое суток).

## Запуск локально и тесты

```bash
cd server
python3 -m venv .venv && .venv/bin/pip install -r requirements.txt pytest
.venv/bin/python -m pytest -q tests                      # логика без БД (тесты БД пропускаются)
# с настоящим PostgreSQL — своя временная база mugalim_test_<…> создаётся и удаляется в каждом тесте:
MUGALIM_TEST_PG='postgresql://postgres@127.0.0.1:5432/postgres' .venv/bin/python -m pytest -q tests
python3 -m py_compile app.py push.py jobs.py db.py boot.py envnum.py vapid.py prayer.py metals.py ask.py kb.py kb_load.py ask_media.py quran_ref.py asr_service.py
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
| `MUGALIM_METALS_FETCH` | 1 (0/1) | скачивать цены золота и серебра (0 — API отдаёт то, что уже в базе) |
| `MUGALIM_METALS_HOUR` | 11 (0–23) | с какого часа по Алматы выгружать цены за сутки |
| `MUGALIM_METALS_TICK_SEC` | 600 (60–3600) | как часто проверять, пора ли |
| `MUGALIM_METALS_CHECK_PCT` | 5 (0,5–20) | сверка золота ЦБ РФ с НБ РК, % |
| `MUGALIM_METALS_MAX_JUMP_PCT` | 30 (5–90) | наибольший скачок к прошлому дню, % |
| `MUGALIM_ASK_DRAFTS` | 1 (0/1) | «Спросить»: показывать записи со статусом «черновик» (всегда с пометкой); 1 — на время запуска среди своих |
| `MUGALIM_ASK_MIN_SHARE` | 0,3 (0,05–1) | порог релевантности: доля значимых слов вопроса, найденных в записи |
| `MUGALIM_ASK_ORIGINS` | `https://aiustaz.pro,https://www.aiustaz.pro` | разрешённые Origin для `/api/ask/` |
| `MUGALIM_ASK_LLM` | 0 (0/1) | режим «ии» — только по решению владельца (вопрос свободным текстом уходит во внешний ИИ) |
| `ANTHROPIC_API_KEY` | — | ключ Claude API (секрет; только здесь, не в git и не в журнал); без него — режим «поиск» |
| `MUGALIM_ASK_MODEL` | `claude-opus-5-5` | модель для режима «ии» |

Лицензии: pywebpush и py-vapid — MPL-2.0 (без изменений), psycopg — LGPL-3.0 (библиотека без изменений), adhanpy —
MIT (своя проверка официального времени; округление — своё), остальное — MIT/BSD/Apache (`licenses/README.md`, раздел «Сервер AI Ustaz»; экран «Лицензии»).
