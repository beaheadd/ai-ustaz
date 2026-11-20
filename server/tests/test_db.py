"""Хранилище на настоящем PostgreSQL — своя временная база mugalim_test_<…> (без MUGALIM_TEST_PG — пропуск)."""
from __future__ import annotations

import threading

import pytest

import boot
import jobs
import push
from conftest import АДРЕС_FCM, СЕЙЧАС, момент, пункт, тело

psycopg = pytest.importorskip('psycopg')


@pytest.fixture
def база(pg_адрес):
    from db import Хранилище

    х = Хранилище(pg_адрес)
    assert х.применить_миграции() == ['001_push', '002_push_offset']
    assert х.применить_миграции() == []  # второй раз — ничего
    return х


def подписать(х, пункты, адрес=АДРЕС_FCM, **к):
    з = push.разобрать_подписку(тело(пункты, адрес=адрес, **к), СЕЙЧАС)
    х.сохранить(з, СЕЙЧАС)
    return з


def test_сохранить_заменить_удалить(база, pg_адрес):
    з = подписать(база, [пункт('2026-11-20', '14:39'), пункт('2026-11-20', '14:39', заранее=10)])
    п = база.подписка(з.хэш)
    assert п['город'] == 'Алматы' and п['язык'] == 'ru' and п['endpoint'] == АДРЕС_FCM and п['конец'] == момент('2026-11-20', '14:39')
    подписать(база, [пункт('2026-11-21', '15:20')], город='Астана', язык='kk')
    п = база.подписка(з.хэш)
    assert п['город'] == 'Астана' and п['язык'] == 'kk'
    with psycopg.connect(pg_адрес) as с:
        assert с.execute('SELECT count(*) FROM push_items').fetchone()[0] == 1
        assert с.execute('SELECT count(*) FROM push_subscriptions').fetchone()[0] == 1
        # журнал — только хэш, адреса целиком нет
        журнал = с.execute('SELECT endpoint_hash, event FROM push_log').fetchall()
        assert журнал and all(х == з.хэш for х, _ in журнал)
        assert с.execute("SELECT count(*) FROM push_log WHERE endpoint_hash LIKE 'https%'").fetchone()[0] == 0
    assert база.удалить(з.хэш) is True
    with psycopg.connect(pg_адрес) as с:
        assert с.execute('SELECT count(*) FROM push_items').fetchone()[0] == 0  # расписание удалено сразу (каскад)
    assert база.подписка(з.хэш) is None and база.удалить(з.хэш) is False


def test_взять_один_раз_даже_из_двух_потоков(база):
    for i in range(30):
        подписать(база, [пункт('2026-11-20', '14:39'), пункт('2026-11-20', '14:39', заранее=5)], адрес=f'https://fcm.googleapis.com/fcm/send/d{i:03d}')
    взяли: list = []
    замок = threading.Lock()

    def взять():
        р = база.взять_наступившие(момент('2026-11-20', '14:40'), предел=25)
        with замок:
            взяли.extend(р)

    потоки = [threading.Thread(target=взять) for _ in range(4)]
    for т in потоки:
        т.start()
    for т in потоки:
        т.join()
    ключи = [(п['id'], пп.момент, пп.заранее) for п, пп in взяли]
    assert len(ключи) == 60 and len(set(ключи)) == 60  # каждый пункт — ровно один раз
    assert база.взять_наступившие(момент('2026-11-20', '14:41')) == []


def test_повторная_подписка_не_шлёт_отправленное_второй_раз(база):
    подписать(база, [пункт('2026-11-20', '14:39'), пункт('2026-11-20', '16:28', 'maghrib', след=('isha', '17:59'))])
    assert len(база.взять_наступившие(момент('2026-11-20', '14:39'))) == 1
    # Клиент прислал то же расписание (часы телефона отстают, 14:39 ещё «в будущем») — отправленный пункт не вернётся
    з = push.разобрать_подписку(тело([пункт('2026-11-20', '14:39'), пункт('2026-11-20', '16:28', 'maghrib', след=('isha', '17:59'))]), момент('2026-11-20', '14:38'))
    база.сохранить(з, момент('2026-11-20', '14:38'))
    assert база.взять_наступившие(момент('2026-11-20', '14:40')) == []
    assert [п.ключ for _, п in база.взять_наступившие(момент('2026-11-20', '16:28'))] == ['maghrib']


def test_цикл_с_базой(база):
    подписать(база, [пункт('2026-11-20', '14:39')])
    подписать(база, [пункт('2026-11-20', '14:39')], адрес='https://web.push.apple.com/gone1')
    отправлено = []

    def отправить(подписка, данные, ttl, срочность):
        отправлено.append(подписка['endpoint'])
        return 410 if 'apple' in подписка['endpoint'] else 201

    счёт = jobs.шаг(база, отправить, момент('2026-11-20', '14:39'), потоков=2)
    assert счёт['отправлено'] == 1 and счёт['удалено'] == 1
    assert база.подписка(push.хэш_адреса('https://web.push.apple.com/gone1')) is None


def test_обновление_и_уборка(база, pg_адрес):
    з = подписать(база, [пункт('2026-11-22', '14:39')])
    assert [п['id'] for п in база.для_обновления(СЕЙЧАС, push.ПОРОГ_ОБНОВЛЕНИЯ_МС)]
    база.отметить_обновление(база.подписка(з.хэш)['id'])
    assert база.для_обновления(СЕЙЧАС, push.ПОРОГ_ОБНОВЛЕНИЯ_МС) == []
    итог = база.убрать_старое(момент('2026-12-23', '15:00'))  # расписание кончилось больше 30 дней назад
    assert итог['подписки'] == 1 and база.подписка(з.хэш) is None


def test_лимиты(база):
    assert all(база.учесть('ip:a', 60, 3, СЕЙЧАС) for _ in range(3))
    assert not база.учесть('ip:a', 60, 3, СЕЙЧАС)
    assert база.учесть('ip:a', 60, 3, СЕЙЧАС + 60_000)  # новое окно


def test_страж_чужой_базы(pg_адрес):
    """Страж: база не mugalim* или с таблицами BATR — отказ."""
    from psycopg.conninfo import conninfo_to_dict, make_conninfo

    from db import Хранилище

    чужой = conninfo_to_dict(pg_адрес)
    чужой['dbname'] = 'postgres'
    with pytest.raises(boot.ЧужаяБаза):
        Хранилище(make_conninfo(**чужой))
    with psycopg.connect(pg_адрес) as с:
        с.execute('CREATE TABLE cart_items (id int)')  # как в базе BATR
    with pytest.raises(boot.ЧужаяБаза):
        Хранилище(pg_адрес).применить_миграции()


def test_смещение_пояса_сохраняется(база):
    """Владелец 20.11.2026 (время намаза в любой стране): у пункта — смещение пояса места; без него — 300 (UTC+5)."""
    from datetime import datetime, timedelta, timezone

    д = datetime(2026, 11, 20, 12, 5, tzinfo=timezone(timedelta(hours=3)))  # пятница, Стамбул
    стамбул = {'at': int(д.timestamp() * 1000), 'key': 'dhuhr', 'time': '12:05', 'before': 0, 'off': 180}
    подписать(база, [стамбул, пункт('2026-11-20', '14:39')])
    взяли = база.взять_наступившие(момент('2026-11-20', '14:40'))
    assert sorted(п.смещение for _, п in взяли) == [180, 300]
    п = next(п for _, п in взяли if п.ключ == 'dhuhr')
    assert push.уведомление(п, 'ru', 'Стамбул')['title'].startswith('Джума')
