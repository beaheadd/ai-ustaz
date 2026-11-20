"""Общее для тестов сервера: путь к модулям server/, тестовые данные, подставное хранилище и временная база.

Тесты БД идут только на СВОЕЙ временной базе mugalim_test_<случайно> (CLAUDE.md: прод-данные не трогать). Нужен сервер
PostgreSQL с правом CREATE DATABASE: MUGALIM_TEST_PG='postgresql://postgres@127.0.0.1:55432/postgres'. Без него
тесты БД пропускаются (логика без БД — всегда). База создаётся и удаляется в каждом прогоне.
"""
from __future__ import annotations

import base64
import os
import pathlib
import secrets
import sys

import pytest

ПАПКА = pathlib.Path(__file__).resolve().parent.parent
if str(ПАПКА) not in sys.path:
    sys.path.insert(0, str(ПАПКА))

import push  # noqa: E402

АДРЕС_FCM = 'https://fcm.googleapis.com/fcm/send/abc123:APA91bTEST' + 'x' * 40
P256DH = base64.urlsafe_b64encode(b'\x04' + b'\x01' * 64).decode().rstrip('=')
AUTH = base64.urlsafe_b64encode(b'\x02' * 16).decode().rstrip('=')
# Пятница, 20.11.2026, 09:00 по Алматы (04:00 UTC).
СЕЙЧАС = 1_795_147_200_000
assert push.день_рк(СЕЙЧАС) == '2026-11-20' and push.пятница(СЕЙЧАС) and push.чч_мм(СЕЙЧАС) == '09:00'


def момент(день: str, чч_мм: str) -> int:
    """'2026-11-20', '14:39' (Алматы) → мс UTC."""
    from datetime import datetime, timedelta, timezone

    д = datetime.strptime(день + ' ' + чч_мм, '%Y-%m-%d %H:%M').replace(tzinfo=timezone(timedelta(hours=5)))
    return int(д.timestamp() * 1000)


def пункт(день: str, время: str, ключ: str = 'asr', заранее: int = 0, след: tuple[str, str] | None = ('maghrib', '16:28')) -> dict:
    п = {'at': момент(день, время) - заранее * 60_000, 'key': ключ, 'time': время, 'before': заранее}
    if след:
        п['next'] = {'key': след[0], 'time': след[1]}
    return п


def тело(пункты=None, адрес: str = АДРЕС_FCM, язык: str = 'ru', город: str = 'Алматы') -> dict:
    return {
        'subscription': {'endpoint': адрес, 'keys': {'p256dh': P256DH, 'auth': AUTH}, 'expirationTime': None},
        'lang': язык,
        'city': город,
        'items': пункты if пункты is not None else [пункт('2026-11-20', '14:39')],
    }


class ПодставноеХранилище:
    """То же, что db.Хранилище, но в памяти — для тестов API и цикла отправки без PostgreSQL."""

    def __init__(self) -> None:
        self.подписки: dict[str, dict] = {}
        self.пункты: dict[str, list[dict]] = {}
        self.журнал: list[tuple] = []
        self.лимиты: dict[tuple, int] = {}
        self._ид = 0

    def сохранить(self, запрос: push.Запрос, сейчас: int) -> int:
        старая = self.подписки.get(запрос.хэш)
        self._ид = старая['id'] if старая else self._ид + 1
        self.подписки[запрос.хэш] = {'id': self._ид, 'endpoint': запрос.адрес, 'хэш': запрос.хэш, 'p256dh': запрос.p256dh,
                                    'auth': запрос.auth, 'язык': запрос.язык, 'город': запрос.город,
                                    'конец': запрос.конец or сейчас, 'обновление_отправлено': False}
        взятые = [п for п in self.пункты.get(запрос.хэш, []) if п['взят']]
        ключи = {(п['п'].момент, п['п'].ключ, п['п'].заранее) for п in взятые}
        self.пункты[запрос.хэш] = взятые + [{'п': п, 'взят': False} for п in запрос.пункты if (п.момент, п.ключ, п.заранее) not in ключи]
        self.журнал.append((запрос.хэш, 'subscribe', None))
        return self._ид

    def удалить(self, хэш: str) -> bool:
        self.пункты.pop(хэш, None)
        self.журнал.append((хэш, 'unsubscribe', None))
        return self.подписки.pop(хэш, None) is not None

    def подписка(self, хэш: str):
        return self.подписки.get(хэш)

    def взять_наступившие(self, сейчас: int, предел: int = 500):
        итог = []
        for хэш, список in self.пункты.items():
            for з in список:
                if not з['взят'] and з['п'].момент <= сейчас and len(итог) < предел:
                    з['взят'] = True
                    итог.append((self.подписки[хэш], з['п']))
        return sorted(итог, key=lambda п: (п[1].момент, п[1].заранее))

    def для_обновления(self, сейчас: int, порог_мс: int):
        return [п for п in self.подписки.values() if not п['обновление_отправлено'] and п['конец'] < сейчас + порог_мс]

    def отметить_обновление(self, ид: int) -> None:
        for п in self.подписки.values():
            if п['id'] == ид:
                п['обновление_отправлено'] = True

    def учесть(self, ключ: str, окно_сек: int, предел: int, сейчас: int) -> bool:
        к = (ключ, сейчас - сейчас % (окно_сек * 1000))
        self.лимиты[к] = self.лимиты.get(к, 0) + 1
        return self.лимиты[к] <= предел

    def записать(self, хэш: str, событие: str, статус=None) -> None:
        self.журнал.append((хэш, событие, статус))


@pytest.fixture
def хранилище() -> ПодставноеХранилище:
    return ПодставноеХранилище()


@pytest.fixture
def pg_адрес():
    """Своя временная база mugalim_test_<…> на сервере из MUGALIM_TEST_PG; удаляется после теста."""
    сервер = os.environ.get('MUGALIM_TEST_PG', '').strip()
    if not сервер:
        pytest.skip('нет MUGALIM_TEST_PG — тесты БД пропущены (логика без БД проверена)')
    psycopg = pytest.importorskip('psycopg')
    from psycopg.conninfo import conninfo_to_dict, make_conninfo

    имя = 'mugalim_test_' + secrets.token_hex(4)
    with psycopg.connect(сервер, autocommit=True) as с:
        с.execute(f'CREATE DATABASE {имя}')
    части = conninfo_to_dict(сервер)
    части['dbname'] = имя
    try:
        yield make_conninfo(**части)
    finally:
        with psycopg.connect(сервер, autocommit=True) as с:
            с.execute(f'DROP DATABASE IF EXISTS {имя} WITH (FORCE)')
