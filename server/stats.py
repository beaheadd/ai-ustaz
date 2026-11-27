"""Своя статистика посещений AI Ustaz: приём событий от приложения и итоги для админки.

Владелец 27.11.2026: «На админ панели первая страница должно быть показ статистики. Сколько человек зашло, сколько
человек пользовались, какие страницы смотрели, сколько времени находились на сайте… начнем уже фиксировать людей».
Дизайн и приватность — docs/дизайн/12-админка-и-статистика.md. CLAUDE.md: без рекламы и рекламного трекинга, без
сторонней аналитики, данные пользователей не продаём и не передаём; база — на сервере в РК.

Что приходит (POST /api/stats/e, только с aiustaz.pro; клиент — app/src/stats/stats.ts):
  {v: 1, sid, sess, lang, dev, os, st: 0|1, ref, ver, ev: [{t: 'o'|'v'|'b', s?: 'quran/sura', n?: 2, d?: 30}]}
  sid — случайный анонимный id устройства (localStorage), sess — id сеанса (новый после 30 мин тишины);
  t: 'o' — открытие, 'v' — просмотр экрана s (путь экрана латиницей из routes.ts, n — номер суры/хадиса/урока),
  'b' — пульс раз в 30 с, пока страница видна: d секунд (≤ 60) на экране s.
Чего НЕ храним: IP (только хэш на минуту для лимита — как у push), cookie, строку User-Agent, город, координаты,
содержимое экранов, текст поиска. Ответ — 204 без тела. Лимиты: 60 запросов в минуту с IP, 30 — на устройство.

Контракт:
  разобрать(данные) -> Пакет  (исключение ОшибкаСтатистики(код) — неверный формат)
  день_алматы(мс) -> date
  ХранилищеСтатистики(хранилище) — поверх db.Хранилище (соединение и лимиты):
    .принять(пакет, сейчас_мс) — всё одной транзакцией
    .подвести_день(день) — суточные итоги stats_daily из сырых событий (повторный вызов перезаписывает день)
    .подвести_недостающие(сейчас_мс) -> int — вчера, сегодня и дни с событиями без итогов
    .сводка(дней, сейчас_мс) -> dict — для первой страницы админки (admin.py)
    .убрать_старое(сейчас_мс) -> dict — сырые события старше 90 дней (итоги остаются)
  register(app, *, статистика, хранилище, ключ_лимита, часы, источники) — маршрут POST /api/stats/e
"""
from __future__ import annotations

import json
import re
import time
from dataclasses import dataclass, field
from datetime import date, datetime, timedelta, timezone
from typing import Callable

from fastapi import Request
from fastapi.concurrency import run_in_threadpool
from fastapi.responses import JSONResponse, Response

ПОЯС = timezone(timedelta(hours=5))          # сутки — по Алматы (CLAUDE.md)
ХРАНИТЬ_ДНЕЙ = 90
МАКС_ТЕЛО = 8 * 1024
МАКС_СОБЫТИЙ = 60
МАКС_ПУЛЬС = 60                              # секунд в одном пульсе (клиент шлёт 30)
МАКС_СЕКУНД_ЗА_ЗАПРОС = 90                   # клиент шлёт пачку раз в 30 с; копить больше — не верим
ID = re.compile(r'^[A-Za-z0-9_-]{16,32}$')
ЭКРАН = re.compile(r'^[a-z0-9/-]{0,40}$')
ИСТОЧНИК_ПЕРЕХОДА = re.compile(r'^[a-z0-9.-]{0,40}$')
ВЕРСИЯ = re.compile(r'^[A-Za-z0-9._-]{0,20}$')
ЯЗЫКИ = ('ru', 'kk', 'uz', 'en')
УСТРОЙСТВА = ('phone', 'tablet', 'desktop')
СИСТЕМЫ = ('android', 'ios', 'windows', 'mac', 'linux', 'other')


class ОшибкаСтатистики(ValueError):
    def __init__(self, код: str) -> None:
        super().__init__(код)
        self.код = код


@dataclass(frozen=True)
class Событие:
    вид: str              # 'o' | 'v' | 'b'
    экран: str = ''
    номер: int | None = None
    секунд: int = 0


@dataclass
class Пакет:
    sid: str
    сеанс: str
    язык: str
    устройство: str
    система: str
    установлено: bool
    откуда: str
    версия: str
    события: list[Событие] = field(default_factory=list)

    @property
    def просмотров(self) -> int:
        return sum(1 for с in self.события if с.вид == 'v')

    @property
    def секунд(self) -> int:
        return min(МАКС_СЕКУНД_ЗА_ЗАПРОС, sum(с.секунд for с in self.события if с.вид == 'b'))


def день_алматы(мс: int) -> date:
    return datetime.fromtimestamp(мс / 1000, tz=ПОЯС).date()


def _строка(данные: dict, ключ: str, шаблон: re.Pattern, по_умолчанию: str = '') -> str:
    з = данные.get(ключ, по_умолчанию)
    if not isinstance(з, str) or not шаблон.match(з):
        raise ОшибкаСтатистики(ключ)
    return з


def _откуда(з: object) -> str:
    """Источник перехода — только метка домена (instagram.com → instagram.com, свой домен и пусто → '')."""
    if not isinstance(з, str):
        return ''
    з = з.strip().lower()[:40]
    if з.startswith('www.'):
        з = з[4:]
    if з in ('aiustaz.pro', 'batr.kz') or not ИСТОЧНИК_ПЕРЕХОДА.match(з):
        return ''
    return з


def разобрать(данные: object) -> Пакет:
    if not isinstance(данные, dict) or данные.get('v') != 1:
        raise ОшибкаСтатистики('body')
    лишние = set(данные) - {'v', 'sid', 'sess', 'lang', 'dev', 'os', 'st', 'ref', 'ver', 'ev'}
    if лишние:
        raise ОшибкаСтатистики('extra')
    sid = _строка(данные, 'sid', ID)
    сеанс = _строка(данные, 'sess', ID)
    язык = данные.get('lang')
    язык = язык if язык in ЯЗЫКИ else '-'
    устройство = данные.get('dev')
    устройство = устройство if устройство in УСТРОЙСТВА else '-'
    система = данные.get('os')
    система = система if система in СИСТЕМЫ else 'other'
    версия = _строка(данные, 'ver', ВЕРСИЯ, '')
    события_сырые = данные.get('ev')
    if not isinstance(события_сырые, list) or not 1 <= len(события_сырые) <= МАКС_СОБЫТИЙ:
        raise ОшибкаСтатистики('ev')
    события: list[Событие] = []
    for с in события_сырые:
        if not isinstance(с, dict) or set(с) - {'t', 's', 'n', 'd'}:
            raise ОшибкаСтатистики('ev')
        вид = с.get('t')
        if вид not in ('o', 'v', 'b'):
            raise ОшибкаСтатистики('ev')
        экран = с.get('s', '')
        if not isinstance(экран, str) or not ЭКРАН.match(экран):
            raise ОшибкаСтатистики('screen')
        номер = с.get('n')
        if номер is not None and (not isinstance(номер, int) or isinstance(номер, bool) or not 0 <= номер <= 100000):
            raise ОшибкаСтатистики('n')
        секунд = с.get('d', 0)
        if not isinstance(секунд, int) or isinstance(секунд, bool) or not 0 <= секунд <= МАКС_ПУЛЬС:
            raise ОшибкаСтатистики('d')
        события.append(Событие(вид, экран, номер if вид == 'v' else None, секунд if вид == 'b' else 0))
    return Пакет(sid, сеанс, язык, устройство, система, данные.get('st') in (1, True), _откуда(данные.get('ref')),
                 версия, события)


def _вр(мс: int) -> datetime:
    return datetime.fromtimestamp(мс / 1000, tz=timezone.utc)


def медиана(числа: list[int]) -> int:
    if not числа:
        return 0
    с = sorted(числа)
    п = len(с) // 2
    return с[п] if len(с) % 2 else (с[п - 1] + с[п]) // 2


class ХранилищеСтатистики:
    """Статистика в той же базе mugalim (db.Хранилище даёт соединение со стражем boot.py)."""

    def __init__(self, хранилище) -> None:
        self._х = хранилище

    def _с(self):
        return self._х.соединение()

    # ───────────── приём ─────────────
    def принять(self, п: Пакет, сейчас: int) -> None:
        день = день_алматы(сейчас)
        момент = _вр(сейчас)
        with self._с() as с:
            с.execute(
                """INSERT INTO stats_devices (sid, first_day, last_day) VALUES (%s, %s, %s)
                   ON CONFLICT (sid) DO UPDATE SET last_day = GREATEST(stats_devices.last_day, EXCLUDED.last_day)""",
                (п.sid, день, день),
            )
            с.execute('INSERT INTO stats_active (day, sid) VALUES (%s, %s) ON CONFLICT DO NOTHING', (день, п.sid))
            # Сеанс чужого устройства не трогаем (тот же id сеанса с другим sid — подделка или сбой клиента).
            с.execute(
                """INSERT INTO stats_sessions (id, sid, day, started_at, last_at, seconds, views, lang, device, os, standalone, ref, ver)
                   VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
                   ON CONFLICT (id) DO UPDATE SET
                     last_at = EXCLUDED.last_at,
                     seconds = LEAST(stats_sessions.seconds + EXCLUDED.seconds,
                                     GREATEST(0, EXTRACT(EPOCH FROM (EXCLUDED.last_at - stats_sessions.started_at))::int + 60)),
                     views = stats_sessions.views + EXCLUDED.views,
                     standalone = stats_sessions.standalone OR EXCLUDED.standalone,
                     lang = CASE WHEN EXCLUDED.lang <> '-' THEN EXCLUDED.lang ELSE stats_sessions.lang END
                   WHERE stats_sessions.sid = EXCLUDED.sid""",
                (п.сеанс, п.sid, день, момент, момент, п.секунд, п.просмотров, п.язык, п.устройство, п.система,
                 п.установлено, п.откуда, п.версия),
            )
            просмотры = [(момент, день, п.sid, п.сеанс, с_.экран, с_.номер) for с_ in п.события if с_.вид == 'v']
            if просмотры:
                with с.cursor() as к:
                    к.executemany('INSERT INTO stats_views (at, day, sid, sess, screen, num) VALUES (%s, %s, %s, %s, %s, %s)',
                                  просмотры)
            время: dict[str, int] = {}
            осталось = п.секунд
            for с_ in п.события:
                if с_.вид == 'b' and с_.секунд and осталось > 0:
                    взять = min(с_.секунд, осталось)
                    осталось -= взять
                    время[с_.экран] = время.get(с_.экран, 0) + взять
            for экран, секунд in время.items():
                с.execute(
                    """INSERT INTO stats_screen_time (day, screen, seconds) VALUES (%s, %s, %s)
                       ON CONFLICT (day, screen) DO UPDATE SET seconds = stats_screen_time.seconds + EXCLUDED.seconds""",
                    (день, экран, секунд),
                )

    # ───────────── итоги ─────────────
    def подвести_день(self, день: date) -> int:
        строки: list[tuple[str, str, int]] = []
        with self._с() as с:
            def одно(sql: str, *п) -> int:
                return int(с.execute(sql, п).fetchone()[0] or 0)

            строки.append(('visitors', '', одно('SELECT count(*) FROM stats_active WHERE day = %s', день)))
            строки.append(('new', '', одно('SELECT count(*) FROM stats_devices WHERE first_day = %s', день)))
            строки.append(('sessions', '', одно('SELECT count(*) FROM stats_sessions WHERE day = %s', день)))
            строки.append(('seconds', '', одно('SELECT COALESCE(sum(seconds), 0) FROM stats_sessions WHERE day = %s', день)))
            строки.append(('views', '', одно('SELECT count(*) FROM stats_views WHERE day = %s', день)))
            строки.append(('installed', '', одно('SELECT count(DISTINCT sid) FROM stats_sessions WHERE day = %s AND standalone', день)))
            for экран, раз in с.execute('SELECT screen, count(*) FROM stats_views WHERE day = %s GROUP BY screen', (день,)).fetchall():
                строки.append(('screen_views', экран, int(раз)))
            for экран, сек in с.execute('SELECT screen, seconds FROM stats_screen_time WHERE day = %s', (день,)).fetchall():
                строки.append(('screen_seconds', экран, int(сек)))
            for поле, метрика in (('lang', 'lang'), ('device', 'device'), ('os', 'os'), ('ref', 'ref')):
                for ключ, раз in с.execute(
                    f'SELECT {поле}, count(DISTINCT sid) FROM stats_sessions WHERE day = %s GROUP BY {поле}', (день,)
                ).fetchall():
                    строки.append((метрика, ключ, int(раз)))
            for час, раз in с.execute(
                "SELECT EXTRACT(HOUR FROM started_at AT TIME ZONE 'Asia/Almaty')::int, count(*) FROM stats_sessions WHERE day = %s GROUP BY 1",
                (день,),
            ).fetchall():
                строки.append(('hour', f'{int(час):02d}', int(раз)))
            с.execute('DELETE FROM stats_daily WHERE day = %s', (день,))
            with с.cursor() as к:
                к.executemany('INSERT INTO stats_daily (day, metric, key, value) VALUES (%s, %s, %s, %s)',
                              [(день, м, к_, з) for м, к_, з in строки])
        return len(строки)

    def подвести_недостающие(self, сейчас: int) -> int:
        сегодня = день_алматы(сейчас)
        with self._с() as с:
            дни = {р[0] for р in с.execute(
                """SELECT DISTINCT a.day FROM stats_active a
                   WHERE NOT EXISTS (SELECT 1 FROM stats_daily d WHERE d.day = a.day AND d.metric = 'visitors')"""
            ).fetchall()}
        дни |= {сегодня, сегодня - timedelta(days=1)}
        for д in sorted(дни):
            self.подвести_день(д)
        return len(дни)

    def убрать_старое(self, сейчас: int) -> dict:
        граница = день_алматы(сейчас) - timedelta(days=ХРАНИТЬ_ДНЕЙ)
        self.подвести_недостающие(сейчас)  # итоги — до удаления сырых
        with self._с() as с:
            просмотры = с.execute('DELETE FROM stats_views WHERE day < %s', (граница,)).rowcount
            сеансы = с.execute('DELETE FROM stats_sessions WHERE day < %s', (граница,)).rowcount
            активность = с.execute('DELETE FROM stats_active WHERE day < %s', (граница,)).rowcount
            время = с.execute('DELETE FROM stats_screen_time WHERE day < %s', (граница,)).rowcount
        return {'просмотры': просмотры, 'сеансы': сеансы, 'активность': активность, 'время': время}

    # ───────────── сводка для админки ─────────────
    def сводка(self, дней: int, сейчас: int) -> dict:
        дней = max(1, min(int(дней), ХРАНИТЬ_ДНЕЙ))
        сегодня = день_алматы(сейчас)
        self.подвести_недостающие(сейчас)
        с_дня = сегодня - timedelta(days=дней - 1)
        with self._с() as с:
            def одно(sql: str, *п) -> int:
                return int(с.execute(sql, п).fetchone()[0] or 0)

            def уникальных(от: date) -> int:
                return одно('SELECT count(DISTINCT sid) FROM stats_active WHERE day >= %s AND day <= %s', от, сегодня)

            карточки = {}
            for имя, от in (('сегодня', сегодня), ('7', сегодня - timedelta(days=6)), ('30', сегодня - timedelta(days=29))):
                карточки[имя] = {
                    'посетители': уникальных(от),
                    'новые': одно('SELECT count(*) FROM stats_devices WHERE first_day >= %s AND first_day <= %s', от, сегодня),
                    'сеансы': одно('SELECT count(*) FROM stats_sessions WHERE day >= %s AND day <= %s', от, сегодня),
                    'просмотры': одно('SELECT count(*) FROM stats_views WHERE day >= %s AND day <= %s', от, сегодня),
                }
            секунды = [int(р[0]) for р in с.execute(
                'SELECT seconds FROM stats_sessions WHERE day >= %s AND day <= %s', (с_дня, сегодня)).fetchall()]
            по_устройствам_дням = [int(р[0]) for р in с.execute(
                'SELECT sum(seconds) FROM stats_sessions WHERE day >= %s AND day <= %s GROUP BY sid, day', (с_дня, сегодня)).fetchall()]
            итоги: dict[str, dict[str, int]] = {}
            for день, метрика, ключ, значение in с.execute(
                """SELECT day, metric, key, value FROM stats_daily WHERE day >= %s AND day <= %s
                   AND metric IN ('visitors', 'new', 'sessions', 'seconds', 'views', 'installed') AND key = ''""",
                (с_дня, сегодня),
            ).fetchall():
                итоги.setdefault(день.isoformat(), {})[метрика] = int(значение)
            ряд = []
            for i in range(дней):
                д = (с_дня + timedelta(days=i)).isoformat()
                з = итоги.get(д, {})
                ряд.append({'день': д, 'посетители': з.get('visitors', 0), 'новые': з.get('new', 0),
                            'сеансы': з.get('sessions', 0), 'просмотры': з.get('views', 0),
                            'секунд': з.get('seconds', 0), 'установлено': з.get('installed', 0)})
            экраны = [
                {'экран': р[0], 'просмотры': int(р[1]), 'посетители': int(р[2]), 'секунд': int(р[3] or 0)}
                for р in с.execute(
                    """SELECT v.screen, count(*), count(DISTINCT v.sid),
                              (SELECT sum(t.seconds) FROM stats_screen_time t WHERE t.screen = v.screen AND t.day >= %s AND t.day <= %s)
                       FROM stats_views v WHERE v.day >= %s AND v.day <= %s GROUP BY v.screen ORDER BY count(*) DESC LIMIT 30""",
                    (с_дня, сегодня, с_дня, сегодня),
                ).fetchall()
            ]
            номера = {}
            for экран in ('quran/sura', 'hadith/item', 'lesson', 'dhikr/item', 'namaz/section'):
                номера[экран] = [
                    {'номер': int(р[0]), 'просмотры': int(р[1])}
                    for р in с.execute(
                        """SELECT num, count(*) FROM stats_views WHERE screen = %s AND num IS NOT NULL AND day >= %s AND day <= %s
                           GROUP BY num ORDER BY count(*) DESC, num LIMIT 10""",
                        (экран, с_дня, сегодня),
                    ).fetchall()
                ]

            def разрез(поле: str) -> list[dict]:
                return [{'ключ': р[0], 'посетители': int(р[1])} for р in с.execute(
                    f'SELECT {поле}, count(DISTINCT sid) FROM stats_sessions WHERE day >= %s AND day <= %s GROUP BY {поле} ORDER BY 2 DESC',
                    (с_дня, сегодня)).fetchall()]

            установлено = одно('SELECT count(DISTINCT sid) FROM stats_sessions WHERE standalone AND day >= %s AND day <= %s',
                               с_дня, сегодня)
            часы = {f'{int(р[0]):02d}': int(р[1]) for р in с.execute(
                """SELECT EXTRACT(HOUR FROM started_at AT TIME ZONE 'Asia/Almaty')::int, count(*) FROM stats_sessions
                   WHERE day >= %s AND day <= %s GROUP BY 1""", (с_дня, сегодня)).fetchall()}
            # Удержание: устройства, впервые пришедшие в окне; D1 — вернулись на следующий день; D7 — в течение 7 дней.
            def удержание(через: int) -> dict:
                до = сегодня - timedelta(days=через)
                if до < с_дня:
                    return {'когорта': 0, 'вернулись': 0}
                когорта = одно('SELECT count(*) FROM stats_devices WHERE first_day >= %s AND first_day <= %s', с_дня, до)
                вернулись = одно(
                    """SELECT count(*) FROM stats_devices d WHERE d.first_day >= %s AND d.first_day <= %s AND EXISTS (
                         SELECT 1 FROM stats_active a WHERE a.sid = d.sid AND a.day > d.first_day AND a.day <= d.first_day + %s)""",
                    с_дня, до, через)
                return {'когорта': когорта, 'вернулись': вернулись}

            уведомления = одно('SELECT count(*) FROM push_subscriptions WHERE schedule_end > %s', _вр(сейчас))
            return {
                'дней': дней, 'с': с_дня.isoformat(), 'по': сегодня.isoformat(), 'карточки': карточки,
                'время': {'сеансов': len(секунды), 'среднее': (sum(секунды) // len(секунды)) if секунды else 0,
                          'медиана': медиана(секунды),
                          'наПосетителяВДень': (sum(по_устройствам_дням) // len(по_устройствам_дням)) if по_устройствам_дням else 0},
                'ряд': ряд, 'экраны': экраны, 'номера': номера,
                'языки': разрез('lang'), 'устройства': разрез('device'), 'системы': разрез('os'), 'откуда': разрез('ref'),
                'установлено': установлено, 'часы': часы,
                'удержание': {'d1': удержание(1), 'd7': удержание(7)},
                'уведомления': {'подписок': уведомления},
            }


def register(app, *, статистика: ХранилищеСтатистики | None, хранилище, ключ_лимита: Callable[[Request], str],
             часы: Callable[[], float] = time.time, источники: str = 'https://aiustaz.pro,https://www.aiustaz.pro') -> None:
    разрешённые = {и.strip().rstrip('/') for и in источники.split(',') if и.strip()}

    def ошибка(код: int, что: str) -> JSONResponse:
        return JSONResponse({'ошибка': что}, status_code=код, headers={'Cache-Control': 'no-store'})

    @app.post('/api/stats/e')
    async def событие(запрос: Request):
        сейчас = int(часы() * 1000)
        источник = запрос.headers.get('origin')
        if источник is not None and источник.rstrip('/') not in разрешённые:
            return ошибка(403, 'origin')
        if not await run_in_threadpool(хранилище.учесть, 'stats:' + ключ_лимита(запрос), 60, 60, сейчас):
            return ошибка(429, 'rate')
        длина = запрос.headers.get('content-length')
        if длина is not None and (not длина.isdigit() or int(длина) > МАКС_ТЕЛО):
            return ошибка(413, 'size')
        сырое = await запрос.body()
        if len(сырое) > МАКС_ТЕЛО:
            return ошибка(413, 'size')
        try:
            пакет = разобрать(json.loads(сырое))
        except (ValueError, UnicodeDecodeError) as е:
            return ошибка(400, getattr(е, 'код', 'json'))
        if not await run_in_threadpool(хранилище.учесть, 'statsd:' + пакет.sid, 60, 30, сейчас):
            return ошибка(429, 'rate')
        if статистика is not None:
            await run_in_threadpool(статистика.принять, пакет, сейчас)
        return Response(status_code=204, headers={'Cache-Control': 'no-store'})
