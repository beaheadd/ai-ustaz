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
  GET  /api/prayer/official?src=dumk|umuz&place=<id>&year=<год> — годовая таблица ведомства по id пункта из нашего списка
                              (server/prayer.py; владелец 20.11.2026: «Время намаза Казахстан, Узбекистан бери из
                              официальных источников»). Лимит — 60 в минуту с IP (хэш), ETag и Cache-Control.

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

import boot
import prayer
import push
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
    return app
