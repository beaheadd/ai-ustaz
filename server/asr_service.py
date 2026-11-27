"""Служба распознавания речи чата AI Ustaz: faster-whisper на CPU, только 127.0.0.1:8033, отдельный процесс (mugalim-asr).

Владелец 27.11.2026: «могут голосом спросить». CLAUDE.md: распознавание речи — только на своих серверах в РК или на
телефоне; аудио во внешние API не отправляем. Поэтому: модель Whisper (веса MIT) через faster-whisper (MIT) на нашем
сервере, загружается один раз при старте службы; сервер общий с BATR — служба с ограничением CPU и памяти (systemd:
CPUQuota, MemoryMax, Nice) и по одному запросу за раз.

Контракт:
  POST /asr  тело — аудио (webm/ogg/mp4/mpeg/wav), заголовок X-Lang: ru|kk|uz|en
       → 200 {текст} | 422 {ошибка:'empty'} | 413 | 400 'lang' | 503 'busy' (уже идёт распознавание дольше 30 с)
  GET /health → {ок, модель}
Аудио — только в памяти (io.BytesIO), ни на диск, ни в журнал; в журнал — длительность и «текст/пусто».
Настройки: MUGALIM_ASR_MODEL (small; medium — точнее, вдвое медленнее), MUGALIM_ASR_THREADS (2),
  MUGALIM_ASR_MODELS_DIR (/opt/mugalim/asr-models; скачивается один раз setup-server.sh при MUGALIM_ASK_VOICE=1).
Запуск: uvicorn --factory asr_service:создать_приложение --host 127.0.0.1 --port 8033 --workers 1
"""
from __future__ import annotations

import io
import logging
import threading
import time

from fastapi import FastAPI, Request
from fastapi.concurrency import run_in_threadpool
from fastapi.responses import JSONResponse

from envnum import строка_из_окружения, целое_из_окружения

журнал = logging.getLogger('mugalim.asr')
ЯЗЫКИ = {'ru': 'ru', 'kk': 'kk', 'uz': 'uz', 'en': 'en'}
МАКС_АУДИО = 1_500_000
# Подсказка модели (initial_prompt): термины, которые человек скажет в вопросе об исламе и чтении Корана.
ПОДСКАЗКА = {
    'ru': 'Вопрос об исламе: аят, сура, таджвид, ихфа, идгам, икляб, гунна, мадд, калькаля, намаз, дуа, зикр, хадис.',
    'kk': 'Ислам туралы сұрақ: аят, сүре, тәжуид, ихфа, идғам, иқлаб, ғұнна, мәд, намаз, дұға, зікір, хадис.',
    'uz': "Islom haqida savol: oyat, sura, tajvid, ixfo, idg'om, iqlob, g'unna, madd, namoz, duo, zikr, hadis.",
    'en': 'A question about Islam: ayah, surah, tajweed, ikhfa, idgham, iqlab, ghunnah, madd, prayer, dua, dhikr, hadith.',
}


def создать_приложение(модель=None) -> FastAPI:
    logging.basicConfig(level=logging.INFO, format='%(asctime)s %(name)s %(levelname)s %(message)s')
    if модель is None:
        from faster_whisper import WhisperModel  # MIT; веса Whisper — MIT

        модель = WhisperModel(строка_из_окружения('MUGALIM_ASR_MODEL', 'small'), device='cpu', compute_type='int8',
                              cpu_threads=целое_из_окружения('MUGALIM_ASR_THREADS', 2, 1, 8),
                              download_root=строка_из_окружения('MUGALIM_ASR_MODELS_DIR', '/opt/mugalim/asr-models'),
                              local_files_only=строка_из_окружения('MUGALIM_ASR_OFFLINE', '1') == '1')
    замок = threading.Lock()
    app = FastAPI(title='AI Ustaz ASR', docs_url=None, redoc_url=None, openapi_url=None)

    def распознать(аудио: bytes, язык: str) -> str:
        if not замок.acquire(timeout=30):
            raise TimeoutError
        try:
            сегменты, _ = модель.transcribe(io.BytesIO(аудио), language=язык, beam_size=1, vad_filter=True,
                                            initial_prompt=ПОДСКАЗКА.get(язык), condition_on_previous_text=False)
            return ' '.join(с.text.strip() for с in сегменты).strip()
        finally:
            замок.release()

    @app.get('/health')
    async def здоровье():
        return {'ок': True, 'модель': строка_из_окружения('MUGALIM_ASR_MODEL', 'small')}

    @app.post('/asr')
    async def asr(запрос: Request):
        язык = ЯЗЫКИ.get(запрос.headers.get('x-lang', ''))
        if not язык:
            return JSONResponse({'ошибка': 'lang'}, status_code=400)
        аудио = await запрос.body()
        if not аудио or len(аудио) > МАКС_АУДИО:
            return JSONResponse({'ошибка': 'size'}, status_code=413)
        начало = time.monotonic()
        try:
            текст = await run_in_threadpool(распознать, аудио, язык)
        except TimeoutError:
            return JSONResponse({'ошибка': 'busy'}, status_code=503)
        except Exception as е:  # noqa: BLE001 — битое аудио и т. п.: только тип ошибки
            журнал.warning('asr: не распознано (%s)', type(е).__name__)
            return JSONResponse({'ошибка': 'empty'}, status_code=422)
        finally:
            del аудио
        журнал.info('asr: %.1f с, %s', time.monotonic() - начало, 'текст' if текст else 'пусто')
        if not текст:
            return JSONResponse({'ошибка': 'empty'}, status_code=422)
        return {'текст': текст[:500]}

    return app
