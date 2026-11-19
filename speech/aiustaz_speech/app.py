"""HTTP-сервис проверки чтения (порт 8032, только 127.0.0.1 — снаружи через nginx своего домена).

Контракт API (v1):
- GET  /v1/zdorovye -> {ок, модель, версия_пакета, потоков}
- POST /v1/proverka (multipart, имена полей латиницей): audio — WAV 16 кГц моно (клиент пересчитывает сам),
    до MUGALIM_SPEECH_MAX_SEC с; эталон: text=<учебный слог/слово> ИЛИ sura=<1..114>&aya=<n>[&word_from=&words=];
    kinds=мадд,буква,… (необязательно: что урок уже прошёл — правило 7 «не ругать за непройденное»).
  -> {статус: 'ок'|'плохой_звук', причина? ('коротко'|'длинно'|'тихо'|'перегруз'|'испорчено'|'не_то' — прочитано другое), эталон:{текст, фонемы}, услышано:{фонемы, уверенность_ср},
      замечания:[…explain.разобрать…], длительность_сек, время_мс}
Приватность (CLAUDE.md «Данные и приватность»): запись не пишется на диск и в журнал, удаляется сразу после разбора;
в журнал — только длительность и время ответа. Аудио во внешние сервисы не уходит.
Нагрузка: одна запись за раз (замок в ядре) + очередь не длиннее MUGALIM_SPEECH_QUEUE — иначе 503.
"""
from __future__ import annotations

import logging
import os
import time
from contextlib import asynccontextmanager

from fastapi import FastAPI, File, Form, HTTPException, UploadFile
from fastapi.concurrency import run_in_threadpool

from . import audio
from .core import РечевоеЯдро
from .envnum import строка_из_окружения, число_из_окружения, целое_из_окружения
from .explain import не_то_прочитано, отобрать, разобрать
from .reference import эталон_аята, эталон_текста

журнал = logging.getLogger('mugalim.speech')

ПУТЬ_МОДЕЛИ = строка_из_окружения('MUGALIM_SPEECH_MODEL_DIR', '')
ПОТОКОВ = целое_из_окружения('MUGALIM_SPEECH_THREADS', 2, 1, 64)
МАКС_СЕК = число_из_окружения('MUGALIM_SPEECH_MAX_SEC', 20.0, 1.0, 120.0)
МАКС_ОЧЕРЕДЬ = целое_из_окружения('MUGALIM_SPEECH_QUEUE', 4, 1, 100)
МАКС_БАЙТ = целое_из_окружения('MUGALIM_SPEECH_MAX_BYTES', 2_000_000, 10_000, 50_000_000)
МАКС_ЗАМЕЧАНИЙ = целое_из_окружения('MUGALIM_SPEECH_MAX_HINTS', 3, 1, 50)

_состояние: dict = {'ядро': None, 'очередь': 0}


def создать(ядро: РечевоеЯдро | None = None) -> FastAPI:
    @asynccontextmanager
    async def жизнь(приложение: FastAPI):
        if ядро is not None:
            _состояние['ядро'] = ядро
        elif _состояние['ядро'] is None:
            if not ПУТЬ_МОДЕЛИ or not os.path.isdir(ПУТЬ_МОДЕЛИ):
                raise RuntimeError('MUGALIM_SPEECH_MODEL_DIR не задан или нет папки модели')
            _состояние['ядро'] = РечевоеЯдро(ПУТЬ_МОДЕЛИ, ПОТОКОВ)
        yield

    приложение = FastAPI(title='AI Ustaz — речевой сервис', docs_url=None, redoc_url=None, lifespan=жизнь)

    @приложение.get('/v1/zdorovye')
    def здоровье():
        from importlib.metadata import version
        return {'ок': _состояние['ядро'] is not None, 'модель': os.path.basename(ПУТЬ_МОДЕЛИ.rstrip('/')) or 'внешнее',
                'версия_пакета': version('quran-muaalem'), 'потоков': ПОТОКОВ}

    @приложение.post('/v1/proverka')
    async def проверка(
        запись: UploadFile = File(..., alias='audio'),
        текст: str | None = Form(None, alias='text'),
        сура: int | None = Form(None, alias='sura'),
        аят: int | None = Form(None, alias='aya'),
        слово_с: int | None = Form(None, alias='word_from'),
        слов: int | None = Form(None, alias='words'),
        виды: str | None = Form(None, alias='kinds'),
    ):
        начало = time.perf_counter()
        байты = await запись.read(МАКС_БАЙТ + 1)
        if len(байты) > МАКС_БАЙТ:
            raise HTTPException(413, 'запись слишком большая')
        try:
            эталон = эталон_аята(сура, аят, слово_с, слов) if сура and аят else эталон_текста(текст or '')
        except Exception as е:
            raise HTTPException(400, f'неверный эталон: {type(е).__name__}') from None
        try:
            волна, _ = audio.прочитать_запись(байты)
        except audio.ОшибкаЗаписи as е:
            raise HTTPException(400, str(е)) from None
        finally:
            del байты
        причина = audio.оценить_звук(волна, макс_сек=МАКС_СЕК)
        if причина:
            return {'статус': 'плохой_звук', 'причина': причина, 'длительность_сек': round(audio.длительность_сек(волна), 2)}
        if _состояние['очередь'] >= МАКС_ОЧЕРЕДЬ:
            raise HTTPException(503, 'сервис занят, повторите через несколько секунд')
        _состояние['очередь'] += 1
        try:
            ядро = _состояние['ядро']
            распознано = await run_in_threadpool(ядро.распознать, волна, эталон)
            набор_видов = {в.strip() for в in виды.split(',') if в.strip()} if виды else None
            if не_то_прочитано(эталон.фонемы, распознано.фонемы):
                return {'статус': 'плохой_звук', 'причина': 'не_то', 'длительность_сек': round(распознано.длительность_сек, 2)}
            замечания = await run_in_threadpool(разобрать, ядро, эталон, распознано, набор_видов)
            замечания = отобрать(замечания, МАКС_ЗАМЕЧАНИЙ)
        finally:
            _состояние['очередь'] -= 1
            del волна
        вер = распознано.вероятности
        ответ = {
            'статус': 'ок',
            'эталон': {'текст': эталон.текст, 'фонемы': эталон.фонемы},
            'услышано': {'фонемы': распознано.фонемы, 'уверенность_ср': round(sum(вер) / len(вер), 3) if вер else 0.0},
            'замечания': замечания,
            'длительность_сек': round(распознано.длительность_сек, 2),
            'время_мс': int((time.perf_counter() - начало) * 1000),
        }
        журнал.info('проверка: %.1f с, %d мс, замечаний %d', распознано.длительность_сек, ответ['время_мс'], len(замечания))
        return ответ

    return приложение


app = создать()
