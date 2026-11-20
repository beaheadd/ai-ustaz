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
        подписки, у которых расписание кончилось больше 30 дней назад (человек не открывал приложение месяц)
Соединение на операцию (нагрузка маленькая; пула нет — зависимостей меньше). Транзакция на операцию.
"""
from __future__ import annotations

import pathlib
from contextlib import contextmanager
from datetime import datetime, timezone

import psycopg

import boot
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
                INSERT INTO push_subscriptions (endpoint, endpoint_hash, p256dh, auth, lang, city, schedule_end, refresh_sent, updated_at)
                VALUES (%s, %s, %s, %s, %s, %s, %s, FALSE, %s)
                ON CONFLICT (endpoint_hash) DO UPDATE SET
                    endpoint = EXCLUDED.endpoint, p256dh = EXCLUDED.p256dh, auth = EXCLUDED.auth, lang = EXCLUDED.lang,
                    city = EXCLUDED.city, schedule_end = EXCLUDED.schedule_end, refresh_sent = FALSE, updated_at = EXCLUDED.updated_at
                RETURNING id
                """,
                (запрос.адрес, запрос.хэш, запрос.p256dh, запрос.auth, запрос.язык, запрос.город,
                 _вр(запрос.конец or сейчас), _вр(сейчас)),
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
                'SELECT id, endpoint, endpoint_hash, p256dh, auth, lang, city, schedule_end, refresh_sent FROM push_subscriptions WHERE endpoint_hash = %s',
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
                    'SELECT id, endpoint, endpoint_hash, p256dh, auth, lang, city, schedule_end, refresh_sent FROM push_subscriptions WHERE id = ANY(%s)',
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
                """SELECT id, endpoint, endpoint_hash, p256dh, auth, lang, city, schedule_end, refresh_sent FROM push_subscriptions
                   WHERE refresh_sent = FALSE AND schedule_end < %s ORDER BY id LIMIT 500""",
                (_вр(сейчас + порог_мс),),
            ).fetchall()
        return [self._подписка(р) for р in строки]

    def отметить_обновление(self, ид: int) -> None:
        with self._соединение() as с:
            с.execute('UPDATE push_subscriptions SET refresh_sent = TRUE WHERE id = %s', (ид,))

    # ───────────── лимиты, журнал, уборка ─────────────
    def учесть(self, ключ: str, окно_сек: int, предел: int, сейчас: int) -> bool:
        начало = сейчас - сейчас % (окно_сек * 1000)
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
            лимиты = с.execute('DELETE FROM push_limits WHERE window_start < %s', (_вр(сейчас - 3_600_000),)).rowcount
            журнал = с.execute('DELETE FROM push_log WHERE at < %s', (_вр(сейчас - 90 * ДЕНЬ_МС),)).rowcount
            подписки = с.execute('DELETE FROM push_subscriptions WHERE schedule_end < %s', (_вр(сейчас - 30 * ДЕНЬ_МС),)).rowcount
        return {'пункты': пункты, 'лимиты': лимиты, 'журнал': журнал, 'подписки': подписки}
