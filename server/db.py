"""Хранилище уведомлений AI Ustaz: своя база PostgreSQL mugalim через psycopg 3 (LGPL-3.0, как библиотека, без изменений).

Контракт (класс Хранилище; все времена — мс UTC, как в push.py):
  Хранилище(адрес)                          — адрес проверяет страж boot.py (чужую базу не открываем)
  .применить_миграции() -> list[str]        — migrations/NNN_*.sql по порядку, один раз (таблица schema_migrations)
  .сохранить(запрос: push.Запрос, сейчас)   — подписка + расписание: невзятые пункты заменяются целиком
  .удалить(хэш) -> bool                     — отписка: подписка и расписание удаляются сразу
  .подписка(хэш) -> dict | None              — для «Проверить уведомление»
  .взять_наступившие(сейчас, предел) -> list[(dict подписки, push.Пункт)] — пункты с at ≤ сейчас помечаются sent_at
        в той же транзакции (FOR UPDATE SKIP LOCKED): второй процесс их не возьмёт — не отправляем дважды
  .для_обновления(сейчас, порог_мс) -> list[dict]; .отметить_обновление(id)
  .учесть(ключ, окно_сек, предел, сейчас) -> bool — лимит запросов (состояние — в БД, не в памяти)
  .записать(хэш, событие, статус=None)      — журнал без адреса целиком
  .убрать_старое(сейчас) -> dict             — взятые пункты старше суток, лимиты старше часа, журнал старше 90 дней,
        подписки, у которых расписание кончилось больше 30 дней назад (человек не открывал приложение месяц);
        официальное время намаза: журнал старше года, очередь старше недели, таблицы прошлых лет (кроме прошлого года)
Официальное время намаза (server/prayer.py, миграция 003; владелец 20.11.2026):
  .таблица_намаза(src, place, год) -> dict | None   {src, place, year, дни, точка, способ, sha, получено, проверено}
  .сохранить_таблицу_намаза(src, place, год, дни, точка, способ, sha, расхождение, сейчас) -> 'new' | 'changed' | 'same'
  .какие_таблицы_намаза() -> set[(src, place, год)];  .давно_проверенные_намаза(до, предел) -> list
  .попросить_намаз(src, place, год, сейчас) — очередь «клиент просил»; .нужные_намаза(предел, попытка_до) -> list
  .отметить_попытку_намаза(src, place, год, сейчас); .недавние_попытки_намаза(после) -> set
  .журнал_намаза(src, place, год, итог, подробно); .мета_намаза(ключ) -> {данные, при} | None; .записать_мету_намаза(…)
«Спросить AI Ustaz» (server/ask.py, kb.py, kb_load.py, миграция 004; владелец 20.11.2026):
  .kb_загрузить(записи: list[kb.Запись]) -> {новых, изменено, статус, без_изменений} — всё или ничего (одна транзакция);
        содержание изменилось (другой sha), а версия не выросла — kb.ОшибкаБазы, ничего не записано
  .kb_число(черновые) -> int;  .kb_найти(термы, язык, черновые, предел) -> list[dict записи + 'совпало', 'всего']
  .kb_по_ссылке(вид, ссылка, язык, черновые, предел) -> list[dict];  .ask_записать(вид, режим, причина, источников)
  .ask_не_нашли(сейчас) — только счётчик по дню Алматы (текст вопроса не храним)
  .учесть(…, смещение_мс=0) — окно, сдвинутое на смещение (сутки по Алматы: 5 ч); ключи «askd:» живут 2 суток
Соединение на операцию (нагрузка маленькая; пула нет — зависимостей меньше). Транзакция на операцию.
"""
from __future__ import annotations

import pathlib
from contextlib import contextmanager
from datetime import datetime, timedelta, timezone

import psycopg
from psycopg.types.json import Jsonb

import boot
import kb
from push import ДЕНЬ_МС, Запрос, Пункт

ПАПКА_МИГРАЦИЙ = pathlib.Path(__file__).resolve().parent / 'migrations'


def _вр(мс: int) -> datetime:
    return datetime.fromtimestamp(мс / 1000, tz=timezone.utc)


def _мс(вр: datetime) -> int:
    return int(вр.timestamp() * 1000)


class Хранилище:
    def __init__(self, адрес: str, *, папка_миграций: pathlib.Path = ПАПКА_МИГРАЦИЙ) -> None:
        boot.проверить_адрес(адрес)
        self._адрес = адрес
        self._папка = папка_миграций
        self._проверено = False

    @contextmanager
    def _соединение(self):
        with psycopg.connect(self._адрес, connect_timeout=5, application_name='mugalim') as с:
            if not self._проверено:
                boot.проверить_соединение(с)
                кодировка = с.execute('SHOW server_encoding').fetchone()[0]
                if str(кодировка).upper() not in ('UTF8', "B'UTF8'"):
                    raise RuntimeError('база mugalim не в UTF8 — названия городов kk/ru не сохранятся (setup-server.sh)')
                self._проверено = True
            yield с

    # ───────────── миграции ─────────────
    def применить_миграции(self) -> list[str]:
        применено: list[str] = []
        with self._соединение() as с:
            с.execute('CREATE TABLE IF NOT EXISTS schema_migrations (version TEXT PRIMARY KEY, applied_at TIMESTAMPTZ NOT NULL DEFAULT now())')
            с.execute('SELECT pg_advisory_xact_lock(724100)')  # два процесса не применяют миграции разом
            уже = {с[0] for с in с.execute('SELECT version FROM schema_migrations').fetchall()}
            for файл in sorted(self._папка.glob('[0-9][0-9][0-9]_*.sql')):
                if файл.stem in уже:
                    continue
                с.execute(файл.read_text(encoding='utf-8'))
                с.execute('INSERT INTO schema_migrations (version) VALUES (%s)', (файл.stem,))
                применено.append(файл.stem)
        return применено

    # ───────────── подписка ─────────────
    def сохранить(self, запрос: Запрос, сейчас: int) -> int:
        with self._соединение() as с:
            ид = с.execute(
                """
                INSERT INTO push_subscriptions (endpoint, endpoint_hash, p256dh, auth, lang, lang_ui, lang_code, city, schedule_end,
                                                refresh_sent, updated_at)
                VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, FALSE, %s)
                ON CONFLICT (endpoint_hash) DO UPDATE SET
                    endpoint = EXCLUDED.endpoint, p256dh = EXCLUDED.p256dh, auth = EXCLUDED.auth, lang = EXCLUDED.lang,
                    lang_ui = EXCLUDED.lang_ui, lang_code = EXCLUDED.lang_code, city = EXCLUDED.city,
                    schedule_end = EXCLUDED.schedule_end, refresh_sent = FALSE, updated_at = EXCLUDED.updated_at
                RETURNING id
                """,
                # Старые столбцы — с запасными значениями в пределах своих ограничений: lang (001) — ru/kk, иначе 'ru';
                # lang_ui (005) — ru/kk/uz, иначе 'ru'. Настоящий язык — lang_code (миграция 006: ru, kk, uz, en).
                (запрос.адрес, запрос.хэш, запрос.p256dh, запрос.auth, запрос.язык if запрос.язык in ('ru', 'kk') else 'ru',
                 запрос.язык if запрос.язык in ('ru', 'kk', 'uz') else 'ru', запрос.язык,
                 запрос.город, _вр(запрос.конец or сейчас), _вр(сейчас)),
            ).fetchone()[0]
            # Невзятые пункты заменяем целиком (новый город, другие намазы, напоминание). Взятые (уже отправленные)
            # остаются до уборки: если новый пункт совпал с отправленным — он не вставится второй раз (PRIMARY KEY).
            с.execute('DELETE FROM push_items WHERE subscription_id = %s AND sent_at IS NULL', (ид,))
            with с.cursor() as к:
                к.executemany(
                    """
                    INSERT INTO push_items (subscription_id, at, prayer, local_time, before_min, next_prayer, next_time, utc_offset_min)
                    VALUES (%s, %s, %s, %s, %s, %s, %s, %s) ON CONFLICT DO NOTHING
                    """,
                    [(ид, _вр(п.момент), п.ключ, п.время, п.заранее, п.след_ключ, п.след_время, п.смещение) for п in запрос.пункты],
                )
            с.execute('INSERT INTO push_log (endpoint_hash, event) VALUES (%s, %s)', (запрос.хэш, 'subscribe'))
            return ид

    def удалить(self, хэш: str) -> bool:
        with self._соединение() as с:
            удалено = с.execute('DELETE FROM push_subscriptions WHERE endpoint_hash = %s', (хэш,)).rowcount
            с.execute('INSERT INTO push_log (endpoint_hash, event) VALUES (%s, %s)', (хэш, 'unsubscribe'))
            return удалено > 0

    def подписка(self, хэш: str) -> dict | None:
        with self._соединение() as с:
            р = с.execute(
                'SELECT id, endpoint, endpoint_hash, p256dh, auth, COALESCE(lang_code, lang_ui, lang), city, schedule_end, refresh_sent FROM push_subscriptions WHERE endpoint_hash = %s',
                (хэш,),
            ).fetchone()
        return self._подписка(р) if р else None

    @staticmethod
    def _подписка(р) -> dict:
        return {'id': р[0], 'endpoint': р[1], 'хэш': р[2], 'p256dh': р[3], 'auth': р[4], 'язык': р[5], 'город': р[6],
                'конец': _мс(р[7]), 'обновление_отправлено': р[8]}

    # ───────────── отправка ─────────────
    def взять_наступившие(self, сейчас: int, предел: int = 500) -> list[tuple[dict, Пункт]]:
        with self._соединение() as с:
            строки = с.execute(
                """
                WITH due AS (
                    SELECT subscription_id, at, prayer, before_min FROM push_items
                    WHERE sent_at IS NULL AND at <= %s ORDER BY at LIMIT %s FOR UPDATE SKIP LOCKED
                )
                UPDATE push_items i SET sent_at = %s FROM due d
                WHERE i.subscription_id = d.subscription_id AND i.at = d.at AND i.prayer = d.prayer AND i.before_min = d.before_min
                RETURNING i.subscription_id, i.at, i.prayer, i.local_time, i.before_min, i.next_prayer, i.next_time, i.utc_offset_min
                """,
                (_вр(сейчас), предел, _вр(сейчас)),
            ).fetchall()
            if not строки:
                return []
            ид = sorted({с[0] for с in строки})
            подписки = {
                р[0]: self._подписка(р)
                for р in с.execute(
                    'SELECT id, endpoint, endpoint_hash, p256dh, auth, COALESCE(lang_code, lang_ui, lang), city, schedule_end, refresh_sent FROM push_subscriptions WHERE id = ANY(%s)',
                    (ид,),
                ).fetchall()
            }
        итог = []
        for сид, at, ключ, время, заранее, сл, св, смещение in sorted(строки, key=lambda с: (с[1], с[4])):
            if сид in подписки:
                итог.append((подписки[сид], Пункт(_мс(at), ключ, время, заранее, сл, св, смещение)))
        return итог

    def для_обновления(self, сейчас: int, порог_мс: int) -> list[dict]:
        with self._соединение() as с:
            строки = с.execute(
                """SELECT id, endpoint, endpoint_hash, p256dh, auth, COALESCE(lang_code, lang_ui, lang), city, schedule_end, refresh_sent FROM push_subscriptions
                   WHERE refresh_sent = FALSE AND schedule_end < %s ORDER BY id LIMIT 500""",
                (_вр(сейчас + порог_мс),),
            ).fetchall()
        return [self._подписка(р) for р in строки]

    def отметить_обновление(self, ид: int) -> None:
        with self._соединение() as с:
            с.execute('UPDATE push_subscriptions SET refresh_sent = TRUE WHERE id = %s', (ид,))

    # ───────────── лимиты, журнал, уборка ─────────────
    def учесть(self, ключ: str, окно_сек: int, предел: int, сейчас: int, смещение_мс: int = 0) -> bool:
        начало = сейчас - (сейчас + смещение_мс) % (окно_сек * 1000)
        with self._соединение() as с:
            раз = с.execute(
                """INSERT INTO push_limits (key, window_start, hits) VALUES (%s, %s, 1)
                   ON CONFLICT (key, window_start) DO UPDATE SET hits = push_limits.hits + 1 RETURNING hits""",
                (ключ, _вр(начало)),
            ).fetchone()[0]
        return раз <= предел

    def записать(self, хэш: str, событие: str, статус: int | None = None) -> None:
        with self._соединение() as с:
            с.execute('INSERT INTO push_log (endpoint_hash, event, status) VALUES (%s, %s, %s)', (хэш, событие[:40], статус))

    def убрать_старое(self, сейчас: int) -> dict:
        with self._соединение() as с:
            пункты = с.execute('DELETE FROM push_items WHERE sent_at IS NOT NULL AND at < %s', (_вр(сейчас - ДЕНЬ_МС),)).rowcount
            лимиты = с.execute("DELETE FROM push_limits WHERE window_start < %s AND key NOT LIKE 'askd:%%'",
                               (_вр(сейчас - 3_600_000),)).rowcount
            лимиты += с.execute("DELETE FROM push_limits WHERE window_start < %s AND key LIKE 'askd:%%'",
                                (_вр(сейчас - 2 * ДЕНЬ_МС),)).rowcount
            журнал = с.execute('DELETE FROM push_log WHERE at < %s', (_вр(сейчас - 90 * ДЕНЬ_МС),)).rowcount
            подписки = с.execute('DELETE FROM push_subscriptions WHERE schedule_end < %s', (_вр(сейчас - 30 * ДЕНЬ_МС),)).rowcount
            год = datetime.fromtimestamp(сейчас / 1000, tz=timezone.utc).year
            намаз = с.execute('DELETE FROM prayer_log WHERE at < %s', (_вр(сейчас - 365 * ДЕНЬ_МС),)).rowcount
            намаз += с.execute('DELETE FROM prayer_wanted WHERE asked_at < %s', (_вр(сейчас - 7 * ДЕНЬ_МС),)).rowcount
            намаз += с.execute('DELETE FROM prayer_official WHERE year < %s', (год - 1,)).rowcount
            вопросы = с.execute('DELETE FROM ask_log WHERE at < %s', (_вр(сейчас - 90 * ДЕНЬ_МС),)).rowcount
        return {'пункты': пункты, 'лимиты': лимиты, 'журнал': журнал, 'подписки': подписки, 'намаз': намаз, 'вопросы': вопросы}

    # ───────────── официальное время намаза ─────────────
    def таблица_намаза(self, src: str, place: str, год: int) -> dict | None:
        with self._соединение() as с:
            р = с.execute(
                'SELECT days, point, method, sha, fetched_at, checked_at FROM prayer_official WHERE src = %s AND place = %s AND year = %s',
                (src, place, год),
            ).fetchone()
        if not р:
            return None
        return {'src': src, 'place': place, 'year': год, 'дни': р[0], 'точка': р[1], 'способ': р[2], 'sha': р[3],
                'получено': _мс(р[4]), 'проверено': _мс(р[5])}

    def сохранить_таблицу_намаза(self, src: str, place: str, год: int, дни: list, точка: dict, способ: str, sha: str,
                                 расхождение: int, сейчас: int) -> str:
        with self._соединение() as с:
            было = с.execute('SELECT sha FROM prayer_official WHERE src = %s AND place = %s AND year = %s FOR UPDATE',
                             (src, place, год)).fetchone()
            if было and было[0] == sha:
                с.execute('UPDATE prayer_official SET checked_at = %s, max_diff = %s WHERE src = %s AND place = %s AND year = %s',
                          (_вр(сейчас), расхождение, src, place, год))
                итог = 'same'
            else:
                с.execute(
                    """INSERT INTO prayer_official (src, place, year, days, point, method, sha, max_diff, fetched_at, checked_at)
                       VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
                       ON CONFLICT (src, place, year) DO UPDATE SET days = EXCLUDED.days, point = EXCLUDED.point,
                           method = EXCLUDED.method, sha = EXCLUDED.sha, max_diff = EXCLUDED.max_diff,
                           fetched_at = EXCLUDED.fetched_at, checked_at = EXCLUDED.checked_at""",
                    (src, place, год, Jsonb(дни), Jsonb(точка), способ, sha, расхождение, _вр(сейчас), _вр(сейчас)),
                )
                итог = 'changed' if было else 'new'
            с.execute('DELETE FROM prayer_wanted WHERE src = %s AND place = %s AND year = %s', (src, place, год))
        return итог

    def какие_таблицы_намаза(self) -> set[tuple[str, str, int]]:
        with self._соединение() as с:
            return {(р[0], р[1], р[2]) for р in с.execute('SELECT src, place, year FROM prayer_official').fetchall()}

    def давно_проверенные_намаза(self, до: int, предел: int) -> list[tuple[str, str, int]]:
        with self._соединение() as с:
            строки = с.execute('SELECT src, place, year FROM prayer_official WHERE checked_at < %s ORDER BY checked_at LIMIT %s',
                               (_вр(до), предел)).fetchall()
        return [(р[0], р[1], р[2]) for р in строки]

    def попросить_намаз(self, src: str, place: str, год: int, сейчас: int) -> None:
        with self._соединение() as с:
            с.execute('INSERT INTO prayer_wanted (src, place, year, asked_at) VALUES (%s, %s, %s, %s) ON CONFLICT DO NOTHING',
                      (src, place, год, _вр(сейчас)))

    def нужные_намаза(self, предел: int, попытка_до: int) -> list[tuple[str, str, int]]:
        with self._соединение() as с:
            строки = с.execute(
                'SELECT src, place, year FROM prayer_wanted WHERE tried_at IS NULL OR tried_at < %s ORDER BY asked_at LIMIT %s',
                (_вр(попытка_до), предел)).fetchall()
        return [(р[0], р[1], р[2]) for р in строки]

    def отметить_попытку_намаза(self, src: str, place: str, год: int, сейчас: int) -> None:
        with self._соединение() as с:
            с.execute("""INSERT INTO prayer_wanted (src, place, year, asked_at, tried_at) VALUES (%s, %s, %s, %s, %s)
                         ON CONFLICT (src, place, year) DO UPDATE SET tried_at = EXCLUDED.tried_at""",
                      (src, place, год, _вр(сейчас), _вр(сейчас)))

    def недавние_попытки_намаза(self, после: int) -> set[tuple[str, str, int]]:
        with self._соединение() as с:
            return {(р[0], р[1], р[2]) for р in с.execute(
                'SELECT src, place, year FROM prayer_wanted WHERE tried_at >= %s', (_вр(после),)).fetchall()}

    def журнал_намаза(self, src: str, place: str, год: int, итог: str, подробно: str = '') -> None:
        with self._соединение() as с:
            с.execute('INSERT INTO prayer_log (src, place, year, result, detail) VALUES (%s, %s, %s, %s, %s)',
                      (src[:8], place[:40], год, итог[:40], (подробно or '')[:300]))

    def мета_намаза(self, ключ: str) -> dict | None:
        with self._соединение() as с:
            р = с.execute('SELECT value, updated_at FROM prayer_meta WHERE key = %s', (ключ,)).fetchone()
        return {'данные': р[0], 'при': _мс(р[1])} if р else None

    def записать_мету_намаза(self, ключ: str, значение: object, сейчас: int) -> None:
        with self._соединение() as с:
            с.execute("""INSERT INTO prayer_meta (key, value, updated_at) VALUES (%s, %s, %s)
                         ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = EXCLUDED.updated_at""",
                      (ключ, Jsonb(значение), _вр(сейчас)))

    # ───────────── база знаний «Спросить AI Ustaz» ─────────────
    def kb_загрузить(self, записи: list) -> dict:
        итог = {'новых': 0, 'изменено': 0, 'статус': 0, 'без_изменений': 0}
        ошибки: list[str] = []
        with self._соединение() as с:
            с.execute('SELECT pg_advisory_xact_lock(724104)')  # два загрузчика разом не пишут
            было = {р[0]: (р[1], р[2], р[3], р[4], р[5]) for р in с.execute(
                'SELECT id, version, sha, status, reviewed_by, reviewed_on FROM kb_entries WHERE id = ANY(%s) FOR UPDATE',
                ([з.id for з in записи],)).fetchall()}
            for з in записи:
                старое = было.get(з.id)
                if старое and старое[1] != з.sha and з.версия <= старое[0]:
                    ошибки.append(f'{з.id}: содержание изменилось — поднимите версию (в базе {старое[0]}, в файле {з.версия})')
                elif старое and з.версия < старое[0]:
                    ошибки.append(f'{з.id}: версия в файле {з.версия} меньше, чем в базе ({старое[0]})')
            if ошибки:
                raise kb.ОшибкаБазы(ошибки)  # выход из with → откат: ничего не записано
            for з in записи:
                старое = было.get(з.id)
                когда = з.когда or None
                if старое and старое[1] == з.sha and старое[0] == з.версия:
                    if (старое[2], старое[3], старое[4] and старое[4].isoformat()) == (з.статус, з.кто_проверил, когда):
                        итог['без_изменений'] += 1
                        continue
                    с.execute('UPDATE kb_entries SET status = %s, reviewed_by = %s, reviewed_on = %s, loaded_at = now() WHERE id = %s',
                              (з.статус, з.кто_проверил, когда, з.id))
                    итог['статус'] += 1
                    continue
                с.execute(
                    """INSERT INTO kb_entries (id, kind, ref, arabic, source, grade, graded_by, status, reviewed_by, reviewed_on, version, sha)
                       VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
                       ON CONFLICT (id) DO UPDATE SET kind = EXCLUDED.kind, ref = EXCLUDED.ref, arabic = EXCLUDED.arabic,
                           source = EXCLUDED.source, grade = EXCLUDED.grade, graded_by = EXCLUDED.graded_by,
                           status = EXCLUDED.status, reviewed_by = EXCLUDED.reviewed_by, reviewed_on = EXCLUDED.reviewed_on,
                           version = EXCLUDED.version, sha = EXCLUDED.sha, loaded_at = now()""",
                    (з.id, з.вид, з.ссылка, з.арабский, з.источник, з.степень, з.кто_оценил, з.статус, з.кто_проверил, когда,
                     з.версия, з.sha))
                с.execute('DELETE FROM kb_texts WHERE entry_id = %s', (з.id,))
                с.execute('DELETE FROM kb_texts_en WHERE entry_id = %s', (з.id,))
                with с.cursor() as к:
                    # en — в kb_texts_en (миграция 006: в kb_texts язык ограничен ru/kk/uz).
                    к.executemany('INSERT INTO kb_texts (entry_id, lang, title, body) VALUES (%s, %s, %s, %s)',
                                  [(з.id, язык, т['заголовок'], т['текст']) for язык, т in sorted(з.тексты.items()) if язык != 'en'])
                    if 'en' in з.тексты:
                        к.execute('INSERT INTO kb_texts_en (entry_id, title, body) VALUES (%s, %s, %s)',
                                  (з.id, з.тексты['en']['заголовок'], з.тексты['en']['текст']))
                итог['изменено' if старое else 'новых'] += 1
        return итог

    def kb_число(self, черновые: bool) -> int:
        with self._соединение() as с:
            return с.execute("SELECT count(*) FROM kb_entries WHERE %s OR status = 'утверждено'", (bool(черновые),)).fetchone()[0]

    _ПОЛЯ_ЗАПИСИ = """e.id, e.kind, e.ref, e.arabic, e.source, e.grade, e.graded_by, e.status, e.version, e.sha,
                      x.lang, x.title, x.body, x.tsv, x.tsv_simple,
                      CASE x.lang WHEN 'ru' THEN 'russian'::regconfig WHEN 'en' THEN 'english'::regconfig
                                  ELSE 'simple'::regconfig END AS cfg"""
    # Тексты всех языков: kb_texts (ru, kk, uz) и kb_texts_en (en, миграция 006).
    _ТЕКСТЫ = """(SELECT entry_id, lang, title, body, tsv, tsv_simple FROM kb_texts
                  UNION ALL SELECT entry_id, lang, title, body, tsv, tsv_simple FROM kb_texts_en)"""

    @staticmethod
    def _запись_kb(р) -> dict:
        return {'id': р[0], 'вид': р[1], 'ссылка': р[2], 'арабский': р[3], 'источник': р[4], 'степень': р[5],
                'кто_оценил': р[6], 'черновик': р[7] != 'утверждено', 'версия': f'{р[8]}.{р[9][:8]}', 'язык': р[10],
                'заголовок': р[11], 'текст': р[12]}

    def kb_найти(self, термы: list[str], язык: str, черновые: bool, предел: int = 5) -> list[dict]:
        """Термы — уже очищенные основы слов запроса (ask.термы: только буквы). Терм найден, если он есть в tsv словаря
        текста (стеммер) или как префикс в tsv_simple. Текст — на языке вопроса, если его нет — ru. Совпало — сколько
        термов нашлось в записи; всего — значимые для словаря языка вопроса (порог доли решает ask.отобрать)."""
        if not термы:
            return []
        with self._соединение() as с:
            строки = с.execute(
                f"""
                WITH t AS (
                    SELECT DISTINCT ON (e.id) {self._ПОЛЯ_ЗАПИСИ}
                    FROM kb_entries e JOIN {self._ТЕКСТЫ} x ON x.entry_id = e.id AND x.lang IN (%(язык)s, 'ru')
                    WHERE %(черновые)s OR e.status = 'утверждено'
                    ORDER BY e.id, (x.lang = %(язык)s) DESC
                ), s AS (
                    SELECT t.*,
                           (SELECT count(*) FROM unnest(%(термы)s::text[]) w
                            WHERE t.tsv @@ to_tsquery(t.cfg, w)
                               OR t.tsv_simple @@ to_tsquery('simple', CASE WHEN length(w) >= 4 THEN w || ':*' ELSE w END)) AS hit,
                           (SELECT count(*) FROM unnest(%(термы)s::text[]) w
                            WHERE numnode(to_tsquery(%(cfg)s::regconfig, w)) > 0) AS total,
                           ts_rank(t.tsv_simple, to_tsquery('simple', %(всё)s)) AS rank
                    FROM t
                )
                SELECT id, kind, ref, arabic, source, grade, graded_by, status, version, sha, lang, title, body, hit, total
                FROM s WHERE hit > 0 ORDER BY hit DESC, rank DESC, id LIMIT %(предел)s
                """,
                {'язык': язык, 'черновые': bool(черновые), 'термы': list(термы), 'предел': предел,
                 'всё': ' | '.join(т + ':*' if len(т) >= 4 else т for т in термы),
                 'cfg': {'ru': 'russian', 'en': 'english'}.get(язык, 'simple')},
            ).fetchall()
        # всего — значимые для словаря языка вопроса термы (стоп-слова PostgreSQL не считаются)
        return [{**self._запись_kb(р), 'совпало': р[13], 'всего': р[14]} for р in строки]

    def kb_по_ссылке(self, вид: str, ссылка: str, язык: str, черновые: bool, предел: int = 3) -> list[dict]:
        with self._соединение() as с:
            строки = с.execute(
                f"""
                SELECT DISTINCT ON (e.id) {self._ПОЛЯ_ЗАПИСИ}
                FROM kb_entries e JOIN {self._ТЕКСТЫ} x ON x.entry_id = e.id AND x.lang IN (%(язык)s, 'ru')
                WHERE e.kind = %(вид)s AND e.ref = %(ссылка)s AND (%(черновые)s OR e.status = 'утверждено')
                ORDER BY e.id, (x.lang = %(язык)s) DESC LIMIT %(предел)s
                """,
                {'язык': язык, 'вид': вид, 'ссылка': ссылка, 'черновые': bool(черновые), 'предел': предел},
            ).fetchall()
        return [self._запись_kb(р) for р in строки]

    def ask_записать(self, вид: str, режим: str, причина: str | None, источников: int) -> None:
        with self._соединение() as с:
            с.execute('INSERT INTO ask_log (kind, mode, reason, sources) VALUES (%s, %s, %s, %s)',
                      (вид[:20], режим[:10], (причина or None) and причина[:40], max(0, min(источников, 99))))

    def ask_не_нашли(self, сейчас: int) -> None:
        день = datetime.fromtimestamp(сейчас / 1000, tz=timezone.utc) + timedelta(hours=5)  # сутки — по Алматы
        with self._соединение() as с:
            с.execute('INSERT INTO ask_misses (day, misses) VALUES (%s, 1) ON CONFLICT (day) DO UPDATE SET misses = ask_misses.misses + 1',
                      (день.date(),))
