"""API AI Ustaz (FastAPI): уведомления о времени намаза и официальное время намаза КЗ/УЗ. Прод: 127.0.0.1:8031 за nginx
aiustaz.pro (/api/push/, /api/prayer/).

Владелец 20.11.2026: «правильные, красивые уведомления время намаза приходило к клиенту». docs/дизайн/07-уведомления.md.

Контракт API (JSON; ошибки — {ошибка: '<код латиницей>'}; присланное в ответ не возвращаем):
  GET  /api/push/key          -> {key}                — публичный VAPID-ключ (base64url) для PushManager.subscribe
  POST /api/push/subscribe    {subscription:{endpoint, keys:{p256dh, auth}}, lang, city, items:[{at, key, time, before, next?}]}
                              -> {ок: true, пунктов, до}  — подписка и расписание на 30 дней (push.разобрать_подписку);
                              повторный вызов заменяет расписание целиком (смена города, намазов, напоминания)
  POST /api/push/unsubscribe  {endpoint} -> {ок: true}  — удалить подписку и расписание сразу (даже если её не было)
  POST /api/push/test         {endpoint} -> {ок: true}  — «Проверить уведомление»: сервер шлёт тестовое сразу
  GET  /api/push/health       -> {ок, ключ}            — жив ли API и есть ли VAPID-ключ
Лимиты (в БД, не в памяти; ключ — хэш IP из X-Real-IP nginx или хэш адреса): subscribe — 10 в минуту с IP;
unsubscribe — 20 в минуту с IP; test — 3 за 10 минут на подписку и 10 в минуту с IP. Превышение — 429.
Тело — не больше 64 КБ (413). Origin, если есть, — только свой домен (MUGALIM_PUSH_ORIGINS), иначе 403.
Координаты на сервер не приходят: клиент сам считает время намаза (app/src/notify/schedule.ts).
  POST /api/stats/e — события своей статистики (server/stats.py); /api/admin/… — админка (server/admin.py,
                              server/content_admin.py); GET /api/content/config — настройки содержимого для приложения
                              (владелец 27.11.2026: «Создай админ панель… статистика… Коран… хадисы»).
  GET  /api/prayer/official?src=dumk|umuz&place=<id>&year=<год> — годовая таблица ведомства по id пункта из нашего списка
                              (server/prayer.py; владелец 20.11.2026: «Время намаза Казахстан, Узбекистан бери из
                              официальных источников»). Лимит — 60 в минуту с IP (хэш), ETag и Cache-Control.
  POST /api/feedback {cat, text, route, quote?, ref?, contact?, ver?, lang?, theme?, dev?} — «Сообщить об ошибке»
                              (server/feedback.py; владелец 28.11.2026: «клиент мог выделить и нажать на кнопку „Ошибка“»):
                              3/мин, 20/час, 60/сутки с IP (хэш), тело ≤ 8 КБ; /api/admin/feedback… — раздел «Ошибки» админки.
  POST /api/ask/v1 {q, lang}; GET /api/ask/health — «Спросить AI Ustaz» (server/ask.py; владелец 20.11.2026: «Только с нашей
                              базы данных, в интернете не будет искать»). Ответ только из своей базы знаний (миграция 004),
                              лимиты 10/мин и 100/сутки с IP (хэш), тело ≤ 8 КБ; ИИ — только по флагу MUGALIM_ASK_LLM=1.
  GET  /api/zakat/prices -> {date, gold_per_g, silver_per_g, source, updated, …} — цены золота и серебра за 1 г в тенге
                              для калькулятора закята (server/metals.py; владелец 28.11.2026: «Данные серебра и золота
                              подтягивай сам из официальных источников»); 503 — цен ещё нет; кэш 3 ч.

Сборка (модули — через register, зависимости — параметрами):
  register(app, хранилище=, публичный_ключ=, отправить=, часы=)   — тесты подставляют своё хранилище и отправку;
  создать_приложение() -> FastAPI                                  — прод: страж базы, миграции, ключи из /etc/mugalim.env.
Запуск: uvicorn --app-dir /opt/mugalim/server --factory app:создать_приложение --host 127.0.0.1 --port 8031
"""
from __future__ import annotations

import hashlib
import json
import logging
import time
from typing import Callable

from fastapi import FastAPI, Request
from fastapi.concurrency import run_in_threadpool
from fastapi.responses import JSONResponse

import admin
import ask
import boot
import content_admin
import metals
import feedback
import prayer
import push
import stats
from envnum import строка_из_окружения

журнал = logging.getLogger('mugalim.api')

МАКС_ТЕЛО = 64 * 1024
СВОИ_ИСТОЧНИКИ = 'https://aiustaz.pro,https://www.aiustaz.pro'


def _ошибка(код: int, что: str) -> JSONResponse:
    return JSONResponse({'ошибка': что}, status_code=код, headers={'Cache-Control': 'no-store'})


def _ок(данные: dict) -> JSONResponse:
    return JSONResponse(данные, headers={'Cache-Control': 'no-store'})


def хэш_ip(запрос: Request) -> str:
    """IP — только для лимитов и только хэшем (окно — минута, чистится через час)."""
    ip = (запрос.headers.get('x-real-ip') or (запрос.client.host if запрос.client else '') or '-').strip()
    return 'ip:' + hashlib.sha256(ip.encode('utf-8')).hexdigest()[:24]


def register(
    app: FastAPI,
    *,
    хранилище,
    публичный_ключ: str,
    отправить: Callable[[dict, dict, int, str], int],
    часы: Callable[[], float] = time.time,
    источники: str = СВОИ_ИСТОЧНИКИ,
) -> None:
    разрешённые = {и.strip().rstrip('/') for и in источники.split(',') if и.strip()}

    def сейчас() -> int:
        return int(часы() * 1000)

    async def тело(запрос: Request) -> dict | JSONResponse:
        источник = запрос.headers.get('origin')
        if источник is not None and источник.rstrip('/') not in разрешённые:
            return _ошибка(403, 'origin')
        длина = запрос.headers.get('content-length')
        if длина is not None and (not длина.isdigit() or int(длина) > МАКС_ТЕЛО):
            return _ошибка(413, 'size')
        сырое = await запрос.body()
        if len(сырое) > МАКС_ТЕЛО:
            return _ошибка(413, 'size')
        try:
            данные = json.loads(сырое)
        except (ValueError, UnicodeDecodeError):
            return _ошибка(400, 'json')
        return данные if isinstance(данные, dict) else _ошибка(400, 'body')

    async def лимит(ключ: str, окно: int, предел: int) -> bool:
        return await run_in_threadpool(хранилище.учесть, ключ, окно, предел, сейчас())

    @app.get('/api/push/key')
    async def ключ():
        if not публичный_ключ:
            return _ошибка(503, 'no_key')
        return JSONResponse({'key': публичный_ключ}, headers={'Cache-Control': 'public, max-age=3600'})

    @app.get('/api/push/health')
    async def здоровье():
        return _ок({'ок': True, 'ключ': bool(публичный_ключ)})

    @app.post('/api/push/subscribe')
    async def подписаться(запрос: Request):
        if not await лимит(хэш_ip(запрос), 60, 10):
            return _ошибка(429, 'rate')
        данные = await тело(запрос)
        if isinstance(данные, JSONResponse):
            return данные
        try:
            з = push.разобрать_подписку(данные, сейчас())
        except push.ОшибкаЗапроса as е:
            return _ошибка(400, е.код)
        await run_in_threadpool(хранилище.сохранить, з, сейчас())
        return _ок({'ок': True, 'пунктов': len(з.пункты), 'до': з.конец})

    @app.post('/api/push/unsubscribe')
    async def отписаться(запрос: Request):
        if not await лимит(хэш_ip(запрос), 60, 20):
            return _ошибка(429, 'rate')
        данные = await тело(запрос)
        if isinstance(данные, JSONResponse):
            return данные
        try:
            адрес = push.разобрать_адрес(данные)
        except push.ОшибкаЗапроса as е:
            return _ошибка(400, е.код)
        await run_in_threadpool(хранилище.удалить, push.хэш_адреса(адрес))
        return _ок({'ок': True})

    @app.post('/api/push/test')
    async def проверить(запрос: Request):
        if not await лимит(хэш_ip(запрос), 60, 10):
            return _ошибка(429, 'rate')
        данные = await тело(запрос)
        if isinstance(данные, JSONResponse):
            return данные
        try:
            хэш = push.хэш_адреса(push.разобрать_адрес(данные))
        except push.ОшибкаЗапроса as е:
            return _ошибка(400, е.код)
        подписка = await run_in_threadpool(хранилище.подписка, хэш)
        if подписка is None:
            return _ошибка(404, 'not_subscribed')
        if not await лимит('test:' + хэш, 600, 3):
            return _ошибка(429, 'rate')
        код = await run_in_threadpool(отправить, подписка, push.уведомление_проверка(подписка['язык'], подписка['город'], сейчас()), 120, 'high')
        if код in (404, 410):
            await run_in_threadpool(хранилище.удалить, хэш)
            return _ошибка(410, 'gone')
        await run_in_threadpool(хранилище.записать, хэш, 'test', код or None)
        if код not in (200, 201, 202):
            return _ошибка(502, 'push_service')
        return _ок({'ок': True})


def создать_приложение() -> FastAPI:
    logging.basicConfig(level=logging.INFO, format='%(asctime)s %(name)s %(levelname)s %(message)s')
    logging.getLogger('urllib3').setLevel(logging.WARNING)
    logging.getLogger('httpx2').setLevel(logging.WARNING)  # SDK anthropic: строки запросов в журнал не пишем
    from db import Хранилище
    from jobs import создать_отправителя

    адрес = boot.адрес_базы()
    boot.остановить_если_чужая(адрес)
    хранилище = Хранилище(адрес)
    try:
        хранилище.применить_миграции()
    except boot.ЧужаяБаза as е:
        журнал.critical('СТОП: %s', е)
        raise SystemExit(boot.КОД_ОСТАНОВА) from е
    публичный = строка_из_окружения('MUGALIM_VAPID_PUBLIC', '')
    приватный = строка_из_окружения('MUGALIM_VAPID_PRIVATE', '')
    if not (публичный and приватный):
        журнал.warning('нет VAPID-ключей в /etc/mugalim.env — подписка недоступна (503)')
    отправить = создать_отправителя(приватный, строка_из_окружения('MUGALIM_VAPID_SUBJECT', 'https://aiustaz.pro')) if приватный else (lambda *_: 0)
    app = FastAPI(title='AI Ustaz API', docs_url=None, redoc_url=None, openapi_url=None)
    register(
        app,
        хранилище=хранилище,
        публичный_ключ=публичный if приватный else '',
        отправить=отправить,
        источники=строка_из_окружения('MUGALIM_PUSH_ORIGINS', СВОИ_ИСТОЧНИКИ),
    )
    prayer.register(app, хранилище=хранилище, ключ_лимита=хэш_ip)
    # Цены золота и серебра для закята (владелец 28.11.2026): только чтение из БД, скачивает mugalim-jobs (поток metals).
    metals.register(app, цены=metals.ХранилищеЦен(хранилище), хранилище=хранилище, ключ_лимита=хэш_ip)
    # Статистика и админка (владелец 27.11.2026: «Создай админ панель… первая страница — статистика»;
    # docs/дизайн/12-админка-и-статистика.md). Первый владелец — MUGALIM_ADMIN_OWNER_EMAILS (не в git).
    источники = строка_из_окружения('MUGALIM_PUSH_ORIGINS', СВОИ_ИСТОЧНИКИ)
    статистика = stats.ХранилищеСтатистики(хранилище)
    stats.register(app, статистика=статистика, хранилище=хранилище, ключ_лимита=хэш_ip, источники=источники)
    админы = admin.ХранилищеАдминов(хранилище)
    владельцы = frozenset(п for п in (admin.норм_почта(с) for с in строка_из_окружения('MUGALIM_ADMIN_OWNER_EMAILS', '').split(','))
                          if п)
    if владельцы:
        админы.обеспечить_владельцев(sorted(владельцы))
    секрет = строка_из_окружения('MUGALIM_ADMIN_SECRET', '')
    if not секрет:
        журнал.warning('нет MUGALIM_ADMIN_SECRET в /etc/mugalim.env — вход в админку недоступен (503)')
    доступ = admin.register(app, админы=админы, хранилище=хранилище, статистика=статистика,
                            отправить_код=admin.письмо_через_smtp, секрет=секрет, ключ_лимита=хэш_ip, владельцы=владельцы, источники=источники)
    content_admin.register(app, содержимое=content_admin.ХранилищеСодержимого(хранилище), доступ=доступ, админы=админы)
    # «Сообщить об ошибке» (владелец 28.11.2026: «клиент мог выделить и нажать на кнопку „Ошибка“… он попадает к нам»):
    # POST /api/feedback (лимиты с хэша IP, тело ≤ 8 КБ, свой Origin) и раздел «Ошибки» админки — server/feedback.py.
    feedback.register(app, сообщения=feedback.ХранилищеСообщений(хранилище), хранилище=хранилище, доступ=доступ,
                      админы=админы, ключ_лимита=хэш_ip, источники=источники)
    # «Спросить AI Ustaz» — только при MUGALIM_ASK=1 (владелец 20.11.2026: «AI Ustaz пока не будем выкатывать»):
    # без флага маршрутов /api/ask/ нет вовсе (миграция 004 с таблицами базы знаний применяется — она только добавляющая).
    # Владелец 27.11.2026: чат AI Ustaz — в центре нижнего меню, выкатываем (MUGALIM_ASK=1 ставит setup-server.sh);
    # «Пожаловаться», голос и фото — server/ask_media.py (голос и фото — за MUGALIM_ASK_VOICE / MUGALIM_ASK_PHOTO).
    if строка_из_окружения('MUGALIM_ASK', '0') == '1':
        import ask_media

        настройки = ask.настройки_из_окружения()
        ask.register(app, хранилище=хранилище, ключ_лимита=хэш_ip, ии=ask.создать_ии(), черновые=настройки['черновые'],
                     порог=настройки['порог'], источники=настройки['источники'])
        ask_media.register(app, хранилище=хранилище, ключ_лимита=хэш_ip, черновые=настройки['черновые'],
                           порог=настройки['порог'], источники=настройки['источники'])
    return app
