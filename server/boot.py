"""Страж базы: процесс AI Ustaz работает только со своей базой mugalim и останавливается, если видит чужую (BATR).

Правило CLAUDE.md («Чужие зоны»): никогда не подключаться к базе BATR; страж в server/boot.py останавливает процесс.
Адрес базы — только MUGALIM_DATABASE_URL (по умолчанию — своя база mugalim через unix-сокет, вход по peer: пароля нет).
Переменную BATR (DATABASE_URL) и файл /etc/world.env не читаем никогда.

Контракт:
  адрес_базы() -> str                            — из MUGALIM_DATABASE_URL (envnum), по умолчанию 'dbname=mugalim'
  проверить_адрес(адрес) -> None                 — ЧужаяБаза, если имя базы/роль не mugalim* или похоже на BATR
  проверить_соединение(соединение) -> None       — после подключения: current_database() и нет таблиц BATR
  остановить_если_чужая(адрес, соединение?) -> None — пишет причину в журнал и завершает процесс (код 78)
Имена баз: mugalim (прод) и mugalim_test_<…> (тесты на своей временной базе).
"""
from __future__ import annotations

import logging
import re
import sys

from envnum import строка_из_окружения

журнал = logging.getLogger('mugalim.boot')

ИМЯ_БАЗЫ = re.compile(r'^mugalim(_test_[a-z0-9_]{1,40})?$')
ЧУЖИЕ_СЛОВА = ('world', 'batr', 'kaspi', 'analytics', 'ademi')
# Таблицы, по которым видно базу BATR (batr-world/server/*.py): если они есть — это не наша база.
ТАБЛИЦЫ_BATR = frozenset({'cart_items', 'buyer_addresses', 'product_reviews', 'product_favorites', 'webinars', 'xp_events', 'pvp_rooms'})
КОД_ОСТАНОВА = 78  # EX_CONFIG: systemd не перезапускает бесконечно с той же ошибкой (RestartPreventExitStatus)


class ЧужаяБаза(RuntimeError):
    pass


def адрес_базы() -> str:
    return строка_из_окружения('MUGALIM_DATABASE_URL', 'dbname=mugalim')


def _разобрать(адрес: str) -> dict:
    from psycopg.conninfo import conninfo_to_dict  # psycopg — только здесь и в db.py

    try:
        return conninfo_to_dict(адрес)
    except Exception as е:  # noqa: BLE001 — любой мусор в адресе = отказ
        raise ЧужаяБаза('адрес базы не разобран') from е


def проверить_адрес(адрес: str) -> None:
    if not адрес or not адрес.strip():
        raise ЧужаяБаза('MUGALIM_DATABASE_URL пуст')
    части = _разобрать(адрес)
    имя = str(части.get('dbname') or '')
    if not ИМЯ_БАЗЫ.match(имя):
        raise ЧужаяБаза(f'база «{имя or "?"}» — не mugalim')
    роль = str(части.get('user') or '')
    if роль and not роль.startswith('mugalim') and роль != 'postgres':
        raise ЧужаяБаза(f'роль «{роль}» — не mugalim')
    низ = адрес.lower()
    for слово in ЧУЖИЕ_СЛОВА:
        if слово in низ:
            raise ЧужаяБаза(f'в адресе базы есть «{слово}» — похоже на базу BATR')


def проверить_соединение(соединение) -> None:
    with соединение.cursor() as к:
        к.execute('SELECT current_database()::text')
        имя = к.fetchone()[0]
        if isinstance(имя, bytes):  # база не в UTF8 (SQL_ASCII) — не наша: setup-server.sh создаёт UTF8
            имя = имя.decode('utf-8', 'replace')
        if not ИМЯ_БАЗЫ.match(имя or ''):
            raise ЧужаяБаза(f'подключились к базе «{имя}» — не mugalim')
        к.execute(
            "SELECT table_name FROM information_schema.tables WHERE table_schema = 'public' AND table_name = ANY(%s)",
            (sorted(ТАБЛИЦЫ_BATR),),
        )
        чужие = [с[0] for с in к.fetchall()]
    if чужие:
        raise ЧужаяБаза('в базе есть таблицы BATR: ' + ', '.join(sorted(чужие)))


def остановить_если_чужая(адрес: str, соединение=None) -> None:
    try:
        проверить_адрес(адрес)
        if соединение is not None:
            проверить_соединение(соединение)
    except ЧужаяБаза as е:
        журнал.critical('СТОП: %s. AI Ustaz работает только со своей базой mugalim (CLAUDE.md, «Чужие зоны»).', е)
        sys.exit(КОД_ОСТАНОВА)
