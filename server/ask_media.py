"""Чат AI Ustaz: «Пожаловаться», вопрос голосом и вопрос фото — только своими силами, на своём сервере в РК.

Владелец 27.11.2026: «Так же, как здесь [чат Айалема] … Они могут голосом спросить, текстом спросить, могут прикрепить
картинку, задать вопрос». Жёсткие правила AI Ustaz (CLAUDE.md, «Данные и приватность»): распознавание речи — только на
своих серверах в РК или на телефоне, аудио во внешние API не отправляем; в LLM — только обезличенный текст (здесь LLM
нет вовсе); фото и аудио — только в памяти, удаляются сразу после разбора, нигде не пишутся.

Контракт (ошибки — {ошибка: '<код>'}; Cache-Control: no-store):
  POST /api/ask/report  {ответ: id ответа (клиентский, [a-z0-9-]{8,40}), причина: 'неверно'|'непонятно'|'другое',
                         комментарий?: ≤ 500 символов (обезличиваем), источники?: [id записей базы, ≤ 8]}
       → 200 {ок: true}; 400 'report'; 429 'rate' (5 в минуту, 30 в сутки с хэша IP). Текст вопроса НЕ принимаем.
  POST /api/ask/voice?lang=ru|kk|uz|en  тело — аудио (audio/webm|ogg|mp4|mpeg|wav), ≤ 1,5 МБ (≈ 30 с)
       → 200 {текст: распознанное (≤ 500)} — человек правит его в поле и сам отправляет;
         404 'off' (MUGALIM_ASK_VOICE≠1) | 413 'size' | 415 'type' | 422 'empty' (ничего не расслышали) |
         429 'rate' (6 в минуту, 40 в сутки) | 503 'asr' (служба распознавания недоступна).
       Распознаёт служба mugalim-asr (server/asr_service.py, faster-whisper на CPU, 127.0.0.1:8033): аудио уходит к ней
       по localhost в теле запроса и живёт только в памяти. В журнал — длительность обработки и итог, без текста.
  POST /api/ask/photo?lang=…  тело — картинка (image/jpeg|png|webp), ≤ 2 МБ (телефон сжимает заранее)
       → 200 ответ чата (как /api/ask/v1) + {распознано: текст без арабского (≤ 500) | null};
         OCR — Tesseract (ara+rus+kaz+eng) локально, процессом с nice и таймаутом, через stdin/stdout (файлов нет):
           арабский текст → сопоставление с нашей копией Tanzil (quran_ref.сопоставить) → «Это сура X, аят Y» и аят из
             НАШЕЙ копии; распознанный арабский наружу не отдаём никогда (правило 1);
           иначе русский/казахский/… текст → обычный ответ по базе (ask.ответить);
           ничего — {вид: 'нет-в-базе', текст: «Не удалось распознать…»}.
         404 'off' (MUGALIM_ASK_PHOTO≠1) | 413 | 415 | 429 (5 в минуту, 30 в сутки) | 503 'ocr'.
  возможности() → {'голос': bool, 'фото': bool} — для /api/ask/health (клиент показывает 🎤 и 📷 только по ним).
Сборка: register(app, хранилище=, ключ_лимита=, ответить=, черновые=, порог=, часы=, распознать_речь=, распознать_фото=,
  голос=, фото=) — тесты подставляют свои распознаватели.
"""
from __future__ import annotations

import json
import logging
import re
import subprocess
import time
from typing import Callable

from fastapi import Request
from fastapi.concurrency import run_in_threadpool
from fastapi.responses import JSONResponse

import ask
import quran_ref
from envnum import строка_из_окружения

журнал = logging.getLogger('mugalim.ask.media')

ПРИЧИНЫ = ('неверно', 'непонятно', 'другое')
МАКС_ГОЛОС = 1_500_000
МАКС_ФОТО = 2_000_000
ТИПЫ_ГОЛОСА = ('audio/webm', 'audio/ogg', 'audio/mp4', 'audio/mpeg', 'audio/wav', 'audio/x-wav', 'audio/aac', 'video/webm', 'video/mp4')
ТИПЫ_ФОТО = ('image/jpeg', 'image/png', 'image/webp')
АДРЕС_ASR = 'http://127.0.0.1:8033/asr'
_ИД_ОТВЕТА = re.compile(r'^[a-z0-9-]{8,40}$')
_ИД_ЗАПИСИ = re.compile(r'^[a-z0-9][a-z0-9._-]{1,79}$')
_АРАБСКОЕ = re.compile('[؀-ۿݐ-ݿࢠ-ࣿﭐ-﷿ﹰ-﻿]')

ШАБЛОН_ФОТО_НЕТ = {
    'ru': 'Не удалось распознать текст на фото. Напишите вопрос текстом или сфотографируйте ближе, при хорошем свете.',
    'kk': 'Фотодағы мәтінді тану мүмкін болмады. Сұрақты мәтінмен жазыңыз немесе жақынырақ, жақсы жарықта суретке түсіріңіз.',
    'uz': "Fotodagi matnni aniqlab bo'lmadi. Savolni matn bilan yozing yoki yaqinroqdan, yaxshi yorug'likda suratga oling.",
    'en': 'We could not read the text in the photo. Type your question, or take the photo closer and in good light.',
}


def возможности() -> dict:
    return {'голос': строка_из_окружения('MUGALIM_ASK_VOICE', '0') == '1',
            'фото': строка_из_окружения('MUGALIM_ASK_PHOTO', '0') == '1'}


def разобрать_жалобу(данные: object) -> dict | None:
    """Чистая функция: проверка тела «Пожаловаться». Только id ответа, причина, комментарий, id записей базы."""
    if not isinstance(данные, dict) or set(данные) - {'ответ', 'причина', 'комментарий', 'источники'}:
        return None
    ид, причина = данные.get('ответ'), данные.get('причина')
    if not isinstance(ид, str) or not _ИД_ОТВЕТА.match(ид) or причина not in ПРИЧИНЫ:
        return None
    комментарий = данные.get('комментарий')
    if комментарий is not None:
        if not isinstance(комментарий, str) or len(комментарий) > 500:
            return None
        комментарий = ask.обезличить(комментарий.strip())[:500] or None
    источники = данные.get('источники') or []
    if not isinstance(источники, list) or len(источники) > 8 or not all(isinstance(и, str) and _ИД_ЗАПИСИ.match(и) for и in источники):
        return None
    return {'ответ': ид, 'причина': причина, 'комментарий': комментарий, 'источники': list(dict.fromkeys(источники))}


def разделить_распознанное(текст: str) -> tuple[str, str]:
    """(арабские строки, остальное). Арабское — только для сопоставления с Tanzil; наружу не уходит."""
    арабское, прочее = [], []
    for строка in (текст or '').splitlines():
        строка = строка.strip()
        if not строка:
            continue
        букв_ар = len(_АРАБСКОЕ.findall(строка))
        букв = len(re.findall(r'[^\W\d_]', строка))
        (арабское if букв and букв_ар / букв > 0.5 else прочее).append(строка)
    прочее_текст = re.sub(r'\s+', ' ', _АРАБСКОЕ.sub(' ', ' '.join(прочее))).strip()
    return ' '.join(арабское), прочее_текст


def tesseract(картинка: bytes) -> str:
    """OCR локально: stdin → stdout, без файлов; nice 10, таймаут 25 с."""
    итог = subprocess.run(['nice', '-n', '10', 'tesseract', 'stdin', 'stdout', '-l', 'ara+rus+kaz+eng', '--psm', '6'],
                          input=картинка, capture_output=True, timeout=25, check=False)
    if итог.returncode != 0:
        raise RuntimeError('tesseract')
    return итог.stdout.decode('utf-8', 'replace')


def распознать_речь_службой(аудио: bytes, тип: str, язык: str) -> str:
    import requests  # уже в requirements (pywebpush)

    ответ = requests.post(АДРЕС_ASR, data=аудио, timeout=60,
                          headers={'Content-Type': тип, 'X-Lang': язык})
    if ответ.status_code == 422:
        return ''
    ответ.raise_for_status()
    return str(ответ.json().get('текст') or '')



def _ошибка(код: int, что: str) -> JSONResponse:
    return JSONResponse({'ошибка': что}, status_code=код, headers={'Cache-Control': 'no-store'})


def _ок(данные: dict) -> JSONResponse:
    return JSONResponse(данные, headers={'Cache-Control': 'no-store'})


def register(
    app,
    *,
    хранилище,
    ключ_лимита: Callable[[Request], str],
    черновые: bool = True,
    порог: float = ask.ПОРОГ_ДОЛИ,
    часы: Callable[[], float] = time.time,
    источники: str = ask.СВОИ_ИСТОЧНИКИ,
    распознать_речь: Callable[[bytes, str, str], str] = распознать_речь_службой,
    распознать_фото: Callable[[bytes], str] = tesseract,
    голос: bool | None = None,
    фото: bool | None = None,
) -> None:
    разрешённые = {и.strip().rstrip('/') for и in источники.split(',') if и.strip()}
    флаги = возможности()
    голос_вкл = флаги['голос'] if голос is None else голос
    фото_вкл = флаги['фото'] if фото is None else фото

    async def _предварительно(запрос: Request, префикс: str, в_минуту: int, в_сутки: int, макс: int) -> tuple[bytes | None, JSONResponse | None]:
        ист = запрос.headers.get('origin')
        if ист is not None and ист.rstrip('/') not in разрешённые:
            return None, _ошибка(403, 'origin')
        длина = запрос.headers.get('content-length')
        if длина is not None and (not длина.isdigit() or int(длина) > макс):
            return None, _ошибка(413, 'size')
        сейчас = int(часы() * 1000)
        ключ = ключ_лимита(запрос)
        try:  # суточные ключи — с «askd:»: уборка хранит их двое суток (db.убрать)
            м = await run_in_threadpool(хранилище.учесть, f'{префикс}:' + ключ, 60, в_минуту, сейчас)
            с = await run_in_threadpool(хранилище.учесть, f'askd:{префикс}:' + ключ, 86_400, в_сутки, сейчас, ask.СМЕЩЕНИЕ_АЛМАТЫ_МС)
        except Exception as е:  # noqa: BLE001
            журнал.warning('%s: лимиты недоступны (%s)', префикс, type(е).__name__)
            return None, _ошибка(503, 'kb')
        if not (м and с):
            return None, _ошибка(429, 'rate')
        тело = await запрос.body()
        if len(тело) > макс:
            return None, _ошибка(413, 'size')
        return тело, None

    @app.post('/api/ask/report')
    async def пожаловаться(запрос: Request):
        тело, ошибка = await _предварительно(запрос, 'askr', 5, 30, 4096)
        if ошибка:
            return ошибка
        try:
            данные = разобрать_жалобу(json.loads(тело))
        except (ValueError, UnicodeDecodeError):
            данные = None
        if данные is None:
            return _ошибка(400, 'report')
        try:
            await run_in_threadpool(хранилище.ask_жалоба, данные['ответ'], данные['причина'], данные['комментарий'], данные['источники'])
        except Exception as е:  # noqa: BLE001
            журнал.warning('ask report: не записано (%s)', type(е).__name__)
            return _ошибка(503, 'kb')
        return _ок({'ок': True})

    @app.post('/api/ask/voice')
    async def голосом(запрос: Request):
        if not голос_вкл:
            return _ошибка(404, 'off')
        тип = (запрос.headers.get('content-type') or '').split(';')[0].strip().lower()
        if тип not in ТИПЫ_ГОЛОСА:
            return _ошибка(415, 'type')
        язык = запрос.query_params.get('lang')
        if язык not in ask.ЯЗЫКИ:
            return _ошибка(400, 'lang')
        аудио, ошибка = await _предварительно(запрос, 'askv', 6, 40, МАКС_ГОЛОС)
        if ошибка:
            return ошибка
        начало = time.monotonic()
        try:
            текст = await run_in_threadpool(распознать_речь, аудио, тип, язык)
        except Exception as е:  # noqa: BLE001
            журнал.warning('voice: служба распознавания недоступна (%s)', type(е).__name__)
            return _ошибка(503, 'asr')
        finally:
            del аудио  # только в памяти; ссылок больше нет
        текст = re.sub(r'\s+', ' ', текст or '').strip()[:ask.МАКС_ВОПРОС]
        журнал.info('voice: %.1f с, %s', time.monotonic() - начало, 'текст' if текст else 'пусто')
        if not текст:
            return _ошибка(422, 'empty')
        return _ок({'текст': текст})

    @app.post('/api/ask/photo')
    async def фотографией(запрос: Request):
        if not фото_вкл:
            return _ошибка(404, 'off')
        тип = (запрос.headers.get('content-type') or '').split(';')[0].strip().lower()
        if тип not in ТИПЫ_ФОТО:
            return _ошибка(415, 'type')
        язык = запрос.query_params.get('lang')
        if язык not in ask.ЯЗЫКИ:
            return _ошибка(400, 'lang')
        картинка, ошибка = await _предварительно(запрос, 'askp', 5, 30, МАКС_ФОТО)
        if ошибка:
            return ошибка
        начало = time.monotonic()
        try:
            распознано = await run_in_threadpool(распознать_фото, картинка)
        except Exception as е:  # noqa: BLE001
            журнал.warning('photo: OCR недоступен (%s)', type(е).__name__)
            return _ошибка(503, 'ocr')
        finally:
            del картинка
        арабское, прочее = разделить_распознанное(распознано)
        итог = None
        if арабское:
            совпало = await run_in_threadpool(quran_ref.сопоставить, арабское)
            if совпало:
                итог = ask.ответ_аят(совпало['ссылка'], язык, 'photo')
        if итог is None and len(re.findall(r'[^\W\d_]{2,}', прочее)) >= 2:
            вопрос = прочее[:ask.МАКС_ВОПРОС]
            try:
                итог = await run_in_threadpool(lambda: ask.ответить(вопрос, язык, хранилище=хранилище, ии=None, черновые=черновые,
                                                                    сейчас=int(часы() * 1000), порог=порог))
            except Exception as е:  # noqa: BLE001
                журнал.warning('photo: база недоступна (%s)', type(е).__name__)
                return _ошибка(503, 'kb')
        else:
            прочее = ''
        if итог is None:
            итог = ask._итог('нет-в-базе', 'поиск', ШАБЛОН_ФОТО_НЕТ.get(язык, ШАБЛОН_ФОТО_НЕТ['ru']), [], язык, 'photo_none')
        причина = итог.pop('_причина', None)
        try:
            await run_in_threadpool(хранилище.ask_записать, итог['вид'], 'фото', причина, len(итог['источники']))
        except Exception as е:  # noqa: BLE001
            журнал.warning('photo: журнал не записан (%s)', type(е).__name__)
        журнал.info('photo: %.1f с, %s', time.monotonic() - начало, причина or итог['вид'])
        итог['распознано'] = (ask.обезличить(прочее)[:ask.МАКС_ВОПРОС] or None) if прочее else None
        return _ок(итог)
