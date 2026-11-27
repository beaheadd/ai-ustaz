"""Содержимое AI Ustaz из админки: какие чтецы включены, какие хадисы скрыты и какие проверены устазом.

Владелец 27.11.2026: «Потом дальше блок должен быть Коран… записи всех чтецов… Раздел хадисы… чтобы мы там добавляли,
убирали, отключали». docs/дизайн/12-админка-и-статистика.md.

Жёсткие правила CLAUDE.md, которые здесь соблюдаются устройством данных:
  1. Текст Корана в админке только показывается (из проверенной копии Tanzil в сборке приложения) — здесь его нет вовсе.
  2. Хадисы — только записи проверенной базы HadeethEnc по их id: здесь хранятся лишь отметки «скрыть» и «проверено
     устазом (кто, когда)». Текста хадиса, перевода и степени здесь нет — их нельзя ни написать, ни изменить.
     «Добавить» хадис из списка «ждут устаза» = отметка устаза; в приложение он попадает следующей сборкой
     (tools/hadith/build_hadith.py: content/hadith/одобрено.json — выгрузка GET /api/admin/content/hadith/approved).
  11. Каждая публикация настроек — с версией и sha256 (content_versions); пока устаз не посмотрел — в приложении
     плашка «черновик», как и раньше.

Контракт API:
  GET  /api/content/config  (публично; ETag, 5 мин кэша) -> {формат: 1, версия, sha256, чтецы: {включены: [id] | null,
        поУмолчанию: id | null}, хадисы: {скрыты: [id], проверены: {id: [кто, 'ГГГГ-ММ-ДД']}}}
        Приложение берёт отсюда только то, что умеет: неизвестные id чтецов и хадисов не замечает.
  GET  /api/admin/content            (viewer+) -> {config, хадисы: [{id, скрыт, кто, когда, изменён, кем}], версии: [...]}
  POST /api/admin/content/reciters   (admin+) {включены: [id] | null, поУмолчанию: id | null} -> {ок, версия}
  POST /api/admin/content/hadith     (admin+) {id, скрыт?: bool, проверил?: 'имя' | ''} -> {ок, версия}
        проверил '' — снять отметку устаза
  GET  /api/admin/content/hadith/approved (admin+) -> {id: {кто, когда}} — формат content/hadith/одобрено.json
Контракт модуля: ХранилищеСодержимого(хранилище); собрать_настройки(чтецы, хадисы) -> dict (чистая);
  register(app, *, содержимое, доступ, админы, часы)
"""
from __future__ import annotations

import hashlib
import json
import re
import time
from datetime import datetime, timedelta, timezone
from typing import Callable

from fastapi import Request
from fastapi.concurrency import run_in_threadpool
from fastapi.responses import JSONResponse, Response

ID_ЧТЕЦА = re.compile(r'^[a-z0-9][a-z0-9-]{0,39}$')
ПОЯС = timezone(timedelta(hours=5))
МАКС_ЧТЕЦОВ = 40


def собрать_настройки(чтецы: dict | None, хадисы: list[tuple[int, bool, str, str | None]]) -> dict:
    """Публичные настройки без версии; хадисы — (id, скрыт, кто проверил, когда)."""
    ч = чтецы or {}
    return {
        'формат': 1,
        'чтецы': {'включены': ч.get('включены'), 'поУмолчанию': ч.get('поУмолчанию')},
        'хадисы': {
            'скрыты': sorted(ид for ид, скрыт, _, _ in хадисы if скрыт),
            'проверены': {str(ид): [кто, когда] for ид, _, кто, когда in sorted(хадисы) if кто and когда},
        },
    }


def sha256_настроек(н: dict) -> str:
    return hashlib.sha256(json.dumps(н, ensure_ascii=False, sort_keys=True, separators=(',', ':')).encode('utf-8')).hexdigest()


def _мс(в: datetime | None) -> int | None:
    return int(в.timestamp() * 1000) if в else None


class ХранилищеСодержимого:
    def __init__(self, хранилище) -> None:
        self._х = хранилище

    def _с(self):
        return self._х.соединение()

    def _настройки(self, с) -> dict:
        р = с.execute("SELECT value FROM content_settings WHERE key = 'reciters'").fetchone()
        хадисы = [(р_[0], р_[1], р_[2], р_[3].isoformat() if р_[3] else None)
                  for р_ in с.execute('SELECT id, hidden, approved_by, approved_at FROM content_hadith').fetchall()]
        return собрать_настройки(р[0] if р else None, хадисы)

    def _опубликовать(self, с, кто: str, что: str) -> int:
        н = self._настройки(с)
        sha = sha256_настроек(н)
        последняя = с.execute('SELECT version, sha256 FROM content_versions ORDER BY version DESC LIMIT 1').fetchone()
        if последняя and последняя[1] == sha:
            return последняя[0]
        return с.execute('INSERT INTO content_versions (sha256, by_email, what) VALUES (%s, %s, %s) RETURNING version',
                         (sha, кто, что[:200])).fetchone()[0]

    def настройки(self) -> dict:
        with self._с() as с:
            н = self._настройки(с)
            р = с.execute('SELECT version FROM content_versions ORDER BY version DESC LIMIT 1').fetchone()
        sha = sha256_настроек(н)
        return {**н, 'версия': р[0] if р else 0, 'sha256': sha}

    def задать_чтецов(self, включены: list[str] | None, по_умолчанию: str | None, кто: str) -> int:
        with self._с() as с:
            с.execute(
                """INSERT INTO content_settings (key, value, updated_at, updated_by) VALUES ('reciters', %s, now(), %s)
                   ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = now(), updated_by = EXCLUDED.updated_by""",
                (json.dumps({'включены': включены, 'поУмолчанию': по_умолчанию}, ensure_ascii=False), кто))
            return self._опубликовать(с, кто, 'чтецы')

    def отметить_хадис(self, ид: int, скрыт: bool | None, проверил: str | None, день: str, кто: str) -> int:
        with self._с() as с:
            с.execute('INSERT INTO content_hadith (id, updated_by) VALUES (%s, %s) ON CONFLICT (id) DO NOTHING', (ид, кто))
            if скрыт is not None:
                с.execute('UPDATE content_hadith SET hidden = %s, updated_at = now(), updated_by = %s WHERE id = %s',
                          (скрыт, кто, ид))
            if проверил is not None:
                с.execute(
                    'UPDATE content_hadith SET approved_by = %s, approved_at = %s, updated_at = now(), updated_by = %s WHERE id = %s',
                    (проверил, день if проверил else None, кто, ид))
            return self._опубликовать(с, кто, f'хадис {ид}')

    def хадисы(self) -> list[dict]:
        with self._с() as с:
            строки = с.execute(
                'SELECT id, hidden, approved_by, approved_at, updated_at, updated_by FROM content_hadith ORDER BY id').fetchall()
        return [{'id': р[0], 'скрыт': р[1], 'кто': р[2], 'когда': р[3].isoformat() if р[3] else None,
                 'изменён': _мс(р[4]), 'кем': р[5]} for р in строки]

    def версии(self, предел: int = 20) -> list[dict]:
        with self._с() as с:
            строки = с.execute('SELECT version, at, sha256, by_email, what FROM content_versions ORDER BY version DESC LIMIT %s',
                               (предел,)).fetchall()
        return [{'версия': р[0], 'когда': _мс(р[1]), 'sha256': р[2], 'кто': р[3], 'что': р[4]} for р in строки]


def register(app, *, содержимое: ХранилищеСодержимого, доступ, админы, часы: Callable[[], float] = time.time) -> None:
    def ошибка(код: int, что: str) -> JSONResponse:
        return JSONResponse({'ошибка': что}, status_code=код, headers={'Cache-Control': 'no-store'})

    def ок(д: dict) -> JSONResponse:
        return JSONResponse(д, headers={'Cache-Control': 'no-store'})

    async def тело(запрос: Request) -> dict | JSONResponse:
        сырое = await запрос.body()
        if len(сырое) > 16 * 1024:
            return ошибка(413, 'size')
        try:
            д = json.loads(сырое or b'{}')
        except (ValueError, UnicodeDecodeError):
            return ошибка(400, 'json')
        return д if isinstance(д, dict) else ошибка(400, 'body')

    @app.get('/api/content/config')
    async def настройки(запрос: Request):
        н = await run_in_threadpool(содержимое.настройки)
        тег = '"' + н['sha256'][:32] + '"'
        заголовки = {'ETag': тег, 'Cache-Control': 'public, max-age=300'}
        if запрос.headers.get('if-none-match') == тег:
            return Response(status_code=304, headers=заголовки)
        return JSONResponse(н, headers=заголовки)

    @app.get('/api/admin/content')
    async def содержимое_(запрос: Request):
        я, отказ = await доступ(запрос, 'viewer')
        if отказ:
            return отказ
        return ок({'config': await run_in_threadpool(содержимое.настройки),
                   'хадисы': await run_in_threadpool(содержимое.хадисы),
                   'версии': await run_in_threadpool(содержимое.версии)})

    @app.post('/api/admin/content/reciters')
    async def чтецы(запрос: Request):
        я, отказ = await доступ(запрос, 'admin', True)
        if отказ:
            return отказ
        д = await тело(запрос)
        if isinstance(д, JSONResponse):
            return д
        включены, по_умолчанию = д.get('включены'), д.get('поУмолчанию')
        if включены is not None and (not isinstance(включены, list) or len(включены) > МАКС_ЧТЕЦОВ
                                     or not all(isinstance(и, str) and ID_ЧТЕЦА.match(и) for и in включены)
                                     or len(set(включены)) != len(включены)):
            return ошибка(400, 'reciters')
        if по_умолчанию is not None and (not isinstance(по_умолчанию, str) or not ID_ЧТЕЦА.match(по_умолчанию)):
            return ошибка(400, 'default')
        if по_умолчанию is not None and включены is not None and по_умолчанию not in включены:
            return ошибка(400, 'default_off')
        if включены is not None and not включены:
            return ошибка(400, 'none_on')
        версия = await run_in_threadpool(содержимое.задать_чтецов, включены, по_умолчанию, я['email'])
        await run_in_threadpool(админы.записать, я, 'чтецы изменены', '', {'включены': включены, 'поУмолчанию': по_умолчанию,
                                                                           'версия': версия})
        return ок({'ок': True, 'версия': версия})

    @app.post('/api/admin/content/hadith')
    async def хадис(запрос: Request):
        я, отказ = await доступ(запрос, 'admin', True)
        if отказ:
            return отказ
        д = await тело(запрос)
        if isinstance(д, JSONResponse):
            return д
        ид, скрыт, проверил = д.get('id'), д.get('скрыт'), д.get('проверил')
        if not isinstance(ид, int) or isinstance(ид, bool) or not 1 <= ид <= 10_000_000:
            return ошибка(400, 'id')
        if скрыт is not None and not isinstance(скрыт, bool):
            return ошибка(400, 'hidden')
        if проверил is not None and (not isinstance(проверил, str) or len(проверил.strip()) > 80):
            return ошибка(400, 'reviewer')
        if скрыт is None and проверил is None:
            return ошибка(400, 'nothing')
        день = datetime.fromtimestamp(часы(), tz=ПОЯС).date().isoformat()
        версия = await run_in_threadpool(содержимое.отметить_хадис, ид, скрыт,
                                         проверил.strip() if isinstance(проверил, str) else None, день, я['email'])
        что = []
        if скрыт is not None:
            что.append('скрыт' if скрыт else 'показан')
        if проверил is not None:
            что.append(f'проверено устазом: {проверил.strip()}' if проверил.strip() else 'отметка устаза снята')
        await run_in_threadpool(админы.записать, я, 'хадис: ' + ', '.join(что), str(ид), {'версия': версия})
        return ок({'ок': True, 'версия': версия})

    @app.get('/api/admin/content/hadith/approved')
    async def одобренные(запрос: Request):
        я, отказ = await доступ(запрос, 'admin')
        if отказ:
            return отказ
        х = await run_in_threadpool(содержимое.хадисы)
        return ок({str(з['id']): {'кто': з['кто'], 'когда': з['когда']} for з in х if з['кто'] and з['когда']})
