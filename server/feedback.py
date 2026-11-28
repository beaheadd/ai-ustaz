"""«Сообщить об ошибке»: человек выделил текст в приложении (или нажал строку в «Ещё» / в меню суры и хадиса), написал,
что не так, — сообщение попадает к нам в админку, мы проверяем и исправляем.

Владелец 28.11.2026: «Нужно разработать функцию, чтобы клиент мог выделить и нажать на кнопку „Ошибка“. И написать,
какая там ошибка. Все эти данные нам нужно будет для улучшения. Любой человек увидел ошибку, нажал, он попадает к нам и
обрабатывает. Если это реальная ошибка, то мы улучшаем.» (Как с кари 27.11.2026: «2 счёта» вместо «4 счёта» в таджвиде.)
Клиент — app/src/feedback/; админка — admin/src/pages/feedback.ts; дизайн — docs/дизайн/12-админка-и-статистика.md.

Что храним (миграция 022, таблица feedback): категорию, выделенный текст (≤ 500), экран (hash-адрес латиницей:
'#/hadith/item?n=1751'), место ('2:255', 'hadith:1751'), что не так (5–1000), версию сборки (коммит), язык, тему, класс
устройства (phone/tablet/desktop). Контакт — только если человек сам его оставил, только для ответа; удаляется через
90 дней после того, как сообщение закрыто (jobs.py → убрать_старое). НЕ храним: IP (только хэш на час — для лимитов,
в push_limits), строку браузера, анонимный id статистики, координаты. Почта и телефон в тексте и цитате заменяются
метками [почта], [номер] (место для контакта — отдельное поле).

Контракт API (JSON; ошибки — {ошибка: '<код>'}; Cache-Control: no-store; присланное в ответ не возвращаем):
  POST /api/feedback {cat, text, route, quote?, ref?, contact?, ver?, lang?, theme?, dev?}
       cat: 'quran'|'hadith'|'translation'|'dhikr'|'prayer'|'ui'|'other'
       -> 200 {ок: true}; 400 'json'|'body'|'cat'|'text'|'route'|'quote'|'ref'|'contact'|'ver'|'lang'|'theme'|'dev';
          403 'origin' (Origin не свой); 413 'size' (тело > 8 КБ); 429 'rate' (3 в минуту, 20 в час, 60 в сутки по
          Алматы с хэша IP); 503 'db'.
  Админка (через admin.доступ: cookie сеанса; изменения — POST с X-Aiustaz-Admin: 1 и своим Origin):
  GET  /api/admin/feedback?status=&cat=&before=<id>&limit=50   (viewer+) -> {сообщения: [кратко], дальше: id|null}
  GET  /api/admin/feedback/item?id=                             (viewer+) -> {сообщение: полностью} — контакт видят
       только admin+ (у просмотра — null и естьКонтакт)
  GET  /api/admin/feedback/count                                (viewer+) -> {новых, заНеделю, новыхЗаНеделю}
  POST /api/admin/feedback/update {id, status?, note?}          (admin+)  -> {ок, сообщение}; каждое изменение — в
       журнал admin_audit («ошибка: статус», «ошибка: заметка»: кто, когда, над «#id», было → стало)
Статусы: новое → в работе → исправлено | не ошибка | дубль (три последних — «закрыто»: closed_at, отсчёт 90 дней).
Письмо админам (по желанию, MUGALIM_FEEDBACK_DIGEST=1 — по умолчанию): раз в сутки после 9:00 по Алматы, если есть
новые сообщения, — число по категориям и ссылка в админку, через локальный Postfix (SMTP 127.0.0.1:25, как код входа).
Ни текста, ни контакта в письме нет. Отметка «письмо за день отправлено» — в БД (feedback_digest), не в памяти.

Контракт модуля: разобрать(данные) -> dict (чистая; ОшибкаСообщения(код)); ХранилищеСообщений(хранилище);
  register(app, *, сообщения, хранилище, доступ, админы, ключ_лимита, часы, источники);
  дайджест(сообщения, админы, сейчас, отправить) -> dict; письмо_дайджеста(почта, итог) -> bool.
"""
from __future__ import annotations

import json
import logging
import re
import smtplib
import time
from datetime import datetime, timedelta, timezone
from email.message import EmailMessage
from email.utils import formatdate, make_msgid
from typing import Callable

from fastapi import Request
from fastapi.concurrency import run_in_threadpool
from fastapi.responses import JSONResponse

журнал = logging.getLogger('mugalim.feedback')

КАТЕГОРИИ = ('quran', 'hadith', 'translation', 'dhikr', 'prayer', 'ui', 'other')
НАЗВАНИЯ_КАТЕГОРИЙ = {'quran': 'Коран / таджвид', 'hadith': 'Хадис', 'translation': 'Перевод', 'dhikr': 'Зикр / дуа',
                      'prayer': 'Время намаза', 'ui': 'Интерфейс', 'other': 'Другое'}
СТАТУСЫ = ('новое', 'в работе', 'исправлено', 'не ошибка', 'дубль')
ЗАКРЫТЫЕ = ('исправлено', 'не ошибка', 'дубль')
# Языки интерфейса: ru/kk/uz/en и те, что добавляются (ar/tr/id/ur — необязательные словари с запасным en).
ЯЗЫКИ = ('ru', 'kk', 'uz', 'en', 'ar', 'tr', 'id', 'ur')
ТЕМЫ = ('light', 'dark')
УСТРОЙСТВА = ('phone', 'tablet', 'desktop')
ПОЛЯ = frozenset({'cat', 'text', 'route', 'quote', 'ref', 'contact', 'ver', 'lang', 'theme', 'dev'})
МИН_ТЕКСТ, МАКС_ТЕКСТ, МАКС_ЦИТАТА, МАКС_КОНТАКТ, МАКС_ЗАМЕТКА = 5, 1000, 500, 200, 2000
МАКС_ТЕЛО = 8 * 1024
ХРАНИТЬ_КОНТАКТ_ДНЕЙ = 90
ДЕНЬ_МС = 86_400_000
СМЕЩЕНИЕ_АЛМАТЫ_МС = 5 * 3_600_000
ПОЯС = timezone(timedelta(hours=5))
ЧАС_ПИСЬМА = 9
АДРЕС_АДМИНКИ = 'https://aiustaz.pro/admin/#/feedback'
ОТПРАВИТЕЛЬ = 'no-reply@aiustaz.pro'
СВОИ_ИСТОЧНИКИ = 'https://aiustaz.pro,https://www.aiustaz.pro'

# Экран: hash-адрес приложения (engine/routes.ts вХэш) — латиница, номера — только цифрами.
_ЭКРАН = re.compile(r'^#/[a-z0-9/-]{0,60}(\?[anp]=\d{1,6}(&[anp]=\d{1,6}){0,2})?$')
_МЕСТО = re.compile(r'^[a-z0-9:._-]{1,40}$')
_ВЕРСИЯ = re.compile(r'^([0-9a-f]{7,40}|local)$')
_УПРАВЛЯЮЩИЕ = re.compile('[\x00-\x08\x0b\x0c\x0e-\x1f\x7f​-‍  ﻿]')
_ПОЧТА = re.compile(r'[\w.+-]+@[\w-]+(?:\.[\w-]+)+')
_ЦИФРЫ = re.compile(r'\+?\d[\d\s().\-]{5,}\d')


class ОшибкаСообщения(ValueError):
    def __init__(self, код: str) -> None:
        super().__init__(код)
        self.код = код


def _чисто(з: str) -> str:
    """Без управляющих символов; переводы строк — как есть, лишние пробелы по краям — прочь."""
    return _УПРАВЛЯЮЩИЕ.sub('', з.replace('\r\n', '\n').replace('\r', '\n')).strip()


def обезличить(текст: str) -> str:
    """Почта и телефоны/ИИН/номера карт (≥ 9 цифр с разделителями) → метки: для контакта есть своё поле."""
    т = _ПОЧТА.sub('[почта]', текст)
    return _ЦИФРЫ.sub(lambda м: '[номер]' if sum(с.isdigit() for с in м.group(0)) >= 9 else м.group(0), т)


def _строка(д: dict, ключ: str, макс: int, код: str, *, нужна: bool = False) -> str | None:
    з = д.get(ключ)
    if з is None or з == '':
        if нужна:
            raise ОшибкаСообщения(код)
        return None
    if not isinstance(з, str):
        raise ОшибкаСообщения(код)
    з = _чисто(з)
    if len(з) > макс:
        raise ОшибкаСообщения(код)
    return з or None


def разобрать(данные: object) -> dict:
    """Чистая функция: проверка тела POST /api/feedback → поля для базы. Лишнее поле — ошибка (ничего лишнего не берём)."""
    if not isinstance(данные, dict) or not данные or set(данные) - ПОЛЯ:
        raise ОшибкаСообщения('body')
    категория = данные.get('cat')
    if категория not in КАТЕГОРИИ:
        raise ОшибкаСообщения('cat')
    текст = _строка(данные, 'text', МАКС_ТЕКСТ, 'text', нужна=True)
    if текст is None or len(текст) < МИН_ТЕКСТ:
        raise ОшибкаСообщения('text')
    экран = данные.get('route')
    if not isinstance(экран, str) or len(экран) > 120 or not _ЭКРАН.match(экран):
        raise ОшибкаСообщения('route')
    цитата = _строка(данные, 'quote', МАКС_ЦИТАТА, 'quote')
    место = данные.get('ref')
    if место is not None and (not isinstance(место, str) or not _МЕСТО.match(место)):
        raise ОшибкаСообщения('ref')
    контакт = _строка(данные, 'contact', МАКС_КОНТАКТ, 'contact')
    версия = данные.get('ver')
    if версия not in (None, '') and (not isinstance(версия, str) or not _ВЕРСИЯ.match(версия)):
        raise ОшибкаСообщения('ver')
    for ключ, можно, код in (('lang', ЯЗЫКИ, 'lang'), ('theme', ТЕМЫ, 'theme'), ('dev', УСТРОЙСТВА, 'dev')):
        if данные.get(ключ) is not None and данные.get(ключ) not in можно:
            raise ОшибкаСообщения(код)
    return {
        'категория': категория,
        'текст': обезличить(текст)[:МАКС_ТЕКСТ],
        'экран': экран,
        'цитата': обезличить(цитата)[:МАКС_ЦИТАТА] if цитата else None,
        'место': место,
        'контакт': контакт,
        'версия': версия or '',
        'язык': данные.get('lang') or '-',
        'тема': данные.get('theme') or '-',
        'устройство': данные.get('dev') or '-',
    }


def _вр(мс: int) -> datetime:
    return datetime.fromtimestamp(мс / 1000, tz=timezone.utc)


def _мс(в: datetime | None) -> int | None:
    return int(в.timestamp() * 1000) if в else None


def _кратко(т: str | None, n: int = 160) -> str | None:
    if т is None:
        return None
    return т if len(т) <= n else т[: n - 1].rstrip() + '…'


class ХранилищеСообщений:
    """Поверх db.Хранилище.соединение (страж базы, транзакция на операцию)."""

    _ПОЛЯ = ('id, created, status, category, quote, route, ref, text, contact, app_version, lang, theme, device, '
             'admin_note, handled_by, handled_at, closed_at')

    def __init__(self, хранилище) -> None:
        self._х = хранилище

    def _с(self):
        return self._х.соединение()

    @staticmethod
    def _запись(р) -> dict:
        return {'id': р[0], 'создано': _мс(р[1]), 'статус': р[2], 'категория': р[3], 'цитата': р[4], 'экран': р[5],
                'место': р[6], 'текст': р[7], 'контакт': р[8], 'версия': р[9], 'язык': р[10], 'тема': р[11],
                'устройство': р[12], 'заметка': р[13], 'кто': р[14], 'когда': _мс(р[15]), 'закрыто': _мс(р[16])}

    def добавить(self, з: dict, сейчас: int) -> int:
        with self._с() as с:
            return с.execute(
                """INSERT INTO feedback (created, category, quote, route, ref, text, contact, app_version, lang, theme, device)
                   VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s) RETURNING id""",
                (_вр(сейчас), з['категория'], з['цитата'], з['экран'], з['место'], з['текст'], з['контакт'], з['версия'],
                 з['язык'], з['тема'], з['устройство'])).fetchone()[0]

    def одно(self, ид: int) -> dict | None:
        with self._с() as с:
            р = с.execute(f'SELECT {self._ПОЛЯ} FROM feedback WHERE id = %s', (ид,)).fetchone()
        return self._запись(р) if р else None

    def список(self, статус: str | None, категория: str | None, до: int | None, предел: int) -> list[dict]:
        условия, параметры = [], []
        if статус:
            условия.append('status = %s')
            параметры.append(статус)
        if категория:
            условия.append('category = %s')
            параметры.append(категория)
        if до:
            условия.append('id < %s')
            параметры.append(до)
        где = ('WHERE ' + ' AND '.join(условия)) if условия else ''
        with self._с() as с:
            строки = с.execute(f'SELECT {self._ПОЛЯ} FROM feedback {где} ORDER BY id DESC LIMIT %s',
                               (*параметры, max(1, min(предел, 200)))).fetchall()
        return [self._запись(р) for р in строки]

    def счёт(self, сейчас: int) -> dict:
        неделя = _вр(сейчас - 7 * ДЕНЬ_МС)
        with self._с() as с:
            р = с.execute(
                """SELECT count(*) FILTER (WHERE status = 'новое'),
                          count(*) FILTER (WHERE created >= %s),
                          count(*) FILTER (WHERE created >= %s AND status = 'новое'),
                          count(*)
                   FROM feedback""", (неделя, неделя)).fetchone()
        return {'новых': int(р[0]), 'заНеделю': int(р[1]), 'новыхЗаНеделю': int(р[2]), 'всего': int(р[3])}

    def изменить(self, ид: int, статус: str | None, заметка: str | None, кто: str, сейчас: int) -> tuple[dict, dict] | None:
        """(было, стало) или None — нет такого. closed_at — когда статус стал «закрытым» (отсчёт 90 дней для контакта)."""
        with self._с() as с:
            р = с.execute(f'SELECT {self._ПОЛЯ} FROM feedback WHERE id = %s FOR UPDATE', (ид,)).fetchone()
            if not р:
                return None
            было = self._запись(р)
            новый = статус or было['статус']
            закрыто = было['закрыто'] if (было['статус'] in ЗАКРЫТЫЕ and новый in ЗАКРЫТЫЕ) else (сейчас if новый in ЗАКРЫТЫЕ else None)
            р = с.execute(
                f"""UPDATE feedback SET status = %s, admin_note = %s, handled_by = %s, handled_at = %s, closed_at = %s
                    WHERE id = %s RETURNING {self._ПОЛЯ}""",
                (новый, было['заметка'] if заметка is None else заметка, кто, _вр(сейчас),
                 _вр(закрыто) if закрыто else None, ид)).fetchone()
        return было, self._запись(р)

    def убрать_старое(self, сейчас: int) -> dict:
        """Контакт — через 90 дней после закрытия (само сообщение без контакта остаётся: из него мы учимся)."""
        with self._с() as с:
            контакты = с.execute(
                'UPDATE feedback SET contact = NULL WHERE contact IS NOT NULL AND closed_at IS NOT NULL AND closed_at < %s',
                (_вр(сейчас - ХРАНИТЬ_КОНТАКТ_ДНЕЙ * ДЕНЬ_МС),)).rowcount
            письма = с.execute('DELETE FROM feedback_digest WHERE day < %s',
                               ((_вр(сейчас).astimezone(ПОЯС).date() - timedelta(days=400)),)).rowcount
        return {'контакты': контакты, 'письма': письма}

    # ───────────── письмо админам ─────────────
    def отметить_письмо(self, день, сейчас: int) -> datetime | None:
        """Одна отметка на день (по Алматы): вставили — вернуть время прошлого письма (или сутки назад); уже было — None."""
        with self._с() as с:
            р = с.execute('INSERT INTO feedback_digest (day, sent_at) VALUES (%s, %s) ON CONFLICT (day) DO NOTHING RETURNING day',
                          (день, _вр(сейчас))).fetchone()
            if not р:
                return None
            прошлое = с.execute('SELECT max(sent_at) FROM feedback_digest WHERE day < %s', (день,)).fetchone()[0]
        return прошлое or _вр(сейчас - ДЕНЬ_МС)

    def новые_с(self, после: datetime) -> dict[str, int]:
        with self._с() as с:
            строки = с.execute("SELECT category, count(*) FROM feedback WHERE status = 'новое' AND created >= %s GROUP BY category",
                               (после,)).fetchall()
        return {к: int(n) for к, n in строки}

    def записать_итог_письма(self, день, сообщений: int) -> None:
        with self._с() as с:
            с.execute('UPDATE feedback_digest SET reports = %s WHERE day = %s', (сообщений, день))

    def почты_админов(self) -> list[str]:
        with self._с() as с:
            return [р[0] for р in с.execute(
                "SELECT email FROM admin_users WHERE NOT disabled AND role IN ('owner', 'admin') ORDER BY id").fetchall()]


def письмо_дайджеста(почта: str, итог: dict, *, хост: str = '127.0.0.1', порт: int = 25) -> bool:
    """Письмо админу: сколько новых сообщений об ошибках по категориям и ссылка в админку. Ни текста, ни контакта."""
    п = EmailMessage()
    п['From'] = f'AI Ustaz <{ОТПРАВИТЕЛЬ}>'
    п['To'] = почта
    п['Subject'] = f'AI Ustaz: новых сообщений об ошибках — {итог["всего"]}'
    п['Date'] = formatdate(localtime=False)
    п['Message-ID'] = make_msgid(domain='aiustaz.pro')
    п['Auto-Submitted'] = 'auto-generated'
    строки = '\n'.join(f'  {НАЗВАНИЯ_КАТЕГОРИЙ.get(к, к)}: {n}' for к, n in sorted(итог['по'].items(), key=lambda п: -п[1]))
    п.set_content('Ассаляму алейкум!\n\n'
                  f'За сутки пришло новых сообщений об ошибках: {итог["всего"]}.\n{строки}\n\n'
                  f'Открыть и разобрать: {АДРЕС_АДМИНКИ}\n\n'
                  'Письмо приходит раз в день, только когда есть новые сообщения.\n')
    try:
        with smtplib.SMTP(хост, порт, timeout=20) as с:
            с.send_message(п, from_addr=ОТПРАВИТЕЛЬ, to_addrs=[почта])
    except (OSError, smtplib.SMTPException) as е:
        журнал.error('письмо о сообщениях не отправлено: %s', type(е).__name__)
        return False
    return True


def дайджест(сообщения: ХранилищеСообщений, сейчас: int, отправить: Callable[[str, dict], bool] = письмо_дайджеста) -> dict:
    """Раз в сутки после 9:00 по Алматы (зовёт jobs.py раз в час): есть новые с прошлого письма — письмо каждому админу."""
    местное = _вр(сейчас).astimezone(ПОЯС)
    if местное.hour < ЧАС_ПИСЬМА:
        return {'писем': 0}
    после = сообщения.отметить_письмо(местное.date(), сейчас)
    if после is None:
        return {'писем': 0}
    по = сообщения.новые_с(после)
    всего = sum(по.values())
    сообщения.записать_итог_письма(местное.date(), всего)
    if not всего:
        return {'писем': 0, 'новых': 0}
    ушло = sum(1 for почта in сообщения.почты_админов() if отправить(почта, {'всего': всего, 'по': по}))
    return {'писем': ушло, 'новых': всего}


def наружу(з: dict, *, полностью: bool, контакт: bool) -> dict:
    """Для админки: кратко (список) или полностью (карточка); контакт — только admin+."""
    д = dict(з)
    д['естьКонтакт'] = з['контакт'] is not None
    if not контакт:
        д['контакт'] = None
    if not полностью:
        д['цитата'] = _кратко(з['цитата'])
        д['текст'] = _кратко(з['текст'])
        д.pop('контакт', None)
        д.pop('заметка', None)
    return д


def register(app, *, сообщения: ХранилищеСообщений, хранилище, доступ, админы, ключ_лимита: Callable[[Request], str],
             часы: Callable[[], float] = time.time, источники: str = СВОИ_ИСТОЧНИКИ) -> None:
    разрешённые = {и.strip().rstrip('/') for и in источники.split(',') if и.strip()}

    def сейчас() -> int:
        return int(часы() * 1000)

    def ошибка(код: int, что: str) -> JSONResponse:
        return JSONResponse({'ошибка': что}, status_code=код, headers={'Cache-Control': 'no-store'})

    def ок(д: dict) -> JSONResponse:
        return JSONResponse(д, headers={'Cache-Control': 'no-store'})

    async def json_тела(запрос: Request) -> dict | JSONResponse:
        длина = запрос.headers.get('content-length')
        if длина is not None and (not длина.isdigit() or int(длина) > МАКС_ТЕЛО):
            return ошибка(413, 'size')
        сырое = await запрос.body()
        if len(сырое) > МАКС_ТЕЛО:
            return ошибка(413, 'size')
        try:
            д = json.loads(сырое or b'')
        except (ValueError, UnicodeDecodeError):
            return ошибка(400, 'json')
        return д if isinstance(д, dict) else ошибка(400, 'body')

    @app.post('/api/feedback')
    async def сообщить(запрос: Request):
        источник = запрос.headers.get('origin')
        if источник is not None and источник.rstrip('/') not in разрешённые:
            return ошибка(403, 'origin')
        длина = запрос.headers.get('content-length')
        if длина is not None and (not длина.isdigit() or int(длина) > МАКС_ТЕЛО):
            return ошибка(413, 'size')
        ключ, т = ключ_лимита(запрос), сейчас()
        try:  # минута и час — уборка через час; сутки — ключ «askd:» (db.убрать_старое хранит их двое суток)
            можно = (await run_in_threadpool(хранилище.учесть, 'fb:' + ключ, 60, 3, т)
                     and await run_in_threadpool(хранилище.учесть, 'fbh:' + ключ, 3600, 20, т)
                     and await run_in_threadpool(хранилище.учесть, 'askd:fb:' + ключ, 86_400, 60, т, СМЕЩЕНИЕ_АЛМАТЫ_МС))
        except Exception as е:  # noqa: BLE001
            журнал.warning('feedback: лимиты недоступны (%s)', type(е).__name__)
            return ошибка(503, 'db')
        if not можно:
            return ошибка(429, 'rate')
        д = await json_тела(запрос)
        if isinstance(д, JSONResponse):
            return д
        try:
            з = разобрать(д)
        except ОшибкаСообщения as е:
            return ошибка(400, е.код)
        try:
            ид = await run_in_threadpool(сообщения.добавить, з, т)
        except Exception as е:  # noqa: BLE001
            журнал.warning('feedback: не записано (%s)', type(е).__name__)
            return ошибка(503, 'db')
        журнал.info('feedback: #%s %s', ид, з['категория'])  # без текста и контакта
        return ок({'ок': True})

    # ───────────── админка ─────────────
    def целое(з: str | None, мин: int, макс: int) -> int | None:
        if з is None or not з.isdigit():
            return None
        n = int(з)
        return n if мин <= n <= макс else None

    @app.get('/api/admin/feedback')
    async def список(запрос: Request):
        я, отказ = await доступ(запрос, 'viewer')
        if отказ:
            return отказ
        п = запрос.query_params
        статус, категория = п.get('status') or None, п.get('cat') or None
        if статус is not None and статус not in СТАТУСЫ:
            return ошибка(400, 'status')
        if категория is not None and категория not in КАТЕГОРИИ:
            return ошибка(400, 'cat')
        до = целое(п.get('before'), 1, 2**62) if п.get('before') else None
        предел = целое(п.get('limit', '50'), 1, 200)
        if предел is None or (п.get('before') and до is None):
            return ошибка(400, 'limit')
        строки = await run_in_threadpool(сообщения.список, статус, категория, до, предел + 1)
        дальше = строки[предел - 1]['id'] if len(строки) > предел else None
        return ок({'сообщения': [наружу(з, полностью=False, контакт=False) for з in строки[:предел]], 'дальше': дальше})

    @app.get('/api/admin/feedback/count')
    async def счёт(запрос: Request):
        я, отказ = await доступ(запрос, 'viewer')
        if отказ:
            return отказ
        return ок(await run_in_threadpool(сообщения.счёт, сейчас()))

    @app.get('/api/admin/feedback/item')
    async def одно(запрос: Request):
        я, отказ = await доступ(запрос, 'viewer')
        if отказ:
            return отказ
        ид = целое(запрос.query_params.get('id'), 1, 2**62)
        if ид is None:
            return ошибка(400, 'id')
        з = await run_in_threadpool(сообщения.одно, ид)
        if not з:
            return ошибка(404, 'feedback')
        return ок({'сообщение': наружу(з, полностью=True, контакт=я['роль'] in ('admin', 'owner'))})

    @app.post('/api/admin/feedback/update')
    async def изменить(запрос: Request):
        я, отказ = await доступ(запрос, 'admin', True)
        if отказ:
            return отказ
        д = await json_тела(запрос)
        if isinstance(д, JSONResponse):
            return д
        ид, статус, заметка = д.get('id'), д.get('status'), д.get('note')
        if not isinstance(ид, int) or isinstance(ид, bool) or ид < 1:
            return ошибка(400, 'id')
        if статус is not None and статус not in СТАТУСЫ:
            return ошибка(400, 'status')
        if заметка is not None:
            if not isinstance(заметка, str) or len(заметка) > МАКС_ЗАМЕТКА:
                return ошибка(400, 'note')
            заметка = _чисто(заметка)
        if статус is None and заметка is None:
            return ошибка(400, 'body')
        итог = await run_in_threadpool(сообщения.изменить, ид, статус, заметка, я['email'], сейчас())
        if итог is None:
            return ошибка(404, 'feedback')
        было, стало = итог
        if было['статус'] != стало['статус']:
            await run_in_threadpool(админы.записать, я, 'ошибка: статус', f'#{ид}', {'было': было['статус'], 'стало': стало['статус']})
        if было['заметка'] != стало['заметка']:
            await run_in_threadpool(админы.записать, я, 'ошибка: заметка', f'#{ид}', {'заметка': _кратко(стало['заметка'], 200)})
        return ок({'ок': True, 'сообщение': наружу(стало, полностью=True, контакт=True)})
