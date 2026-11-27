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
    assert х.применить_миграции() == ['001_push', '002_push_offset', '003_prayer_official', '004_kb', '005_push_lang_uz', '006_lang_en', '007_admin_stats']
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
    # uz (миграция 004): в lang — запасной 'ru' (ограничение 001), язык текста — lang_ui.
    подписать(база, [пункт('2026-11-21', '15:20')], город='Toshkent', язык='uz')
    п = база.подписка(з.хэш)
    assert п['город'] == 'Toshkent' and п['язык'] == 'uz'
    with psycopg.connect(pg_адрес) as с:
        assert с.execute('SELECT lang, lang_ui, lang_code FROM push_subscriptions').fetchone() == ('ru', 'uz', 'uz')
    # en (миграция 006): в lang и lang_ui — запасной 'ru' (ограничения 001 и 005), язык текста — lang_code.
    подписать(база, [пункт('2026-11-21', '15:20')], город='Istanbul', язык='en')
    п = база.подписка(з.хэш)
    assert п['город'] == 'Istanbul' and п['язык'] == 'en'
    with psycopg.connect(pg_адрес) as с:
        assert с.execute('SELECT lang, lang_ui, lang_code FROM push_subscriptions').fetchone() == ('ru', 'ru', 'en')
        # подписка до 006 (lang_code пуст) читается по-старому: lang_ui, затем lang
        с.execute("UPDATE push_subscriptions SET lang_code = NULL, lang_ui = 'uz'")
    assert база.подписка(з.хэш)['язык'] == 'uz'
    with psycopg.connect(pg_адрес) as с:
        с.execute('UPDATE push_subscriptions SET lang_code = NULL, lang_ui = NULL')
    assert база.подписка(з.хэш)['язык'] == 'ru'
    with psycopg.connect(pg_адрес) as с:
        # ограничения старых столбцов на месте: en в lang и lang_ui не пройдёт
        for столбец in ('lang', 'lang_ui'):
            with pytest.raises(psycopg.errors.CheckViolation):
                с.execute(f"UPDATE push_subscriptions SET {столбец} = 'en'")
            с.rollback()
    подписать(база, [пункт('2026-11-21', '15:20')], город='Астана', язык='kk')
    assert база.подписка(з.хэш)['язык'] == 'kk'
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


def test_официальное_время_намаза(база, pg_адрес):
    """Миграция 003: таблица, ETag-хэш, очередь «попросили», попытки, журнал, мета, уборка (server/prayer.py)."""
    import prayer

    дни = [['05:59', '07:21', '11:59', '14:48', '16:30', '17:53']] * 365
    точка = {'id': '72', 'name': 'Алматы қаласы'}
    assert база.таблица_намаза('dumk', 'almaty', 2026) is None
    база.попросить_намаз('dumk', 'almaty', 2026, СЕЙЧАС)
    база.попросить_намаз('dumk', 'almaty', 2026, СЕЙЧАС + 1)  # дважды — одна запись
    assert база.нужные_намаза(10, СЕЙЧАС) == [('dumk', 'almaty', 2026)]
    assert база.сохранить_таблицу_намаза('dumk', 'almaty', 2026, дни, точка, 'table', prayer.хэш_дней(дни), 1, СЕЙЧАС) == 'new'
    assert база.нужные_намаза(10, СЕЙЧАС) == [], 'принятая таблица снимает просьбу'
    з = база.таблица_намаза('dumk', 'almaty', 2026)
    assert з['дни'] == дни and з['точка'] == точка and з['способ'] == 'table' and з['sha'] == prayer.хэш_дней(дни) and з['получено'] == СЕЙЧАС
    assert база.сохранить_таблицу_намаза('dumk', 'almaty', 2026, дни, точка, 'table', prayer.хэш_дней(дни), 1, СЕЙЧАС + 1000) == 'same'
    з = база.таблица_намаза('dumk', 'almaty', 2026)
    assert з['получено'] == СЕЙЧАС and з['проверено'] == СЕЙЧАС + 1000
    дни2 = [['06:00', '07:21', '11:59', '14:48', '16:30', '17:53']] + дни[1:]
    assert база.сохранить_таблицу_намаза('dumk', 'almaty', 2026, дни2, точка, 'table', prayer.хэш_дней(дни2), 1, СЕЙЧАС + 2000) == 'changed'
    assert база.какие_таблицы_намаза() == {('dumk', 'almaty', 2026)}
    assert база.давно_проверенные_намаза(СЕЙЧАС + 3000, 5) == [('dumk', 'almaty', 2026)]
    assert база.давно_проверенные_намаза(СЕЙЧАС, 5) == []
    база.отметить_попытку_намаза('umuz', 'nukus', 2026, СЕЙЧАС)
    assert база.недавние_попытки_намаза(СЕЙЧАС - 10) == {('umuz', 'nukus', 2026)}
    assert база.нужные_намаза(10, СЕЙЧАС) == [] and база.нужные_намаза(10, СЕЙЧАС + 1) == [('umuz', 'nukus', 2026)]
    база.журнал_намаза('umuz', 'nukus', 2026, 'diff', 'день 145, fajr: 03:59 против своего 03:48 (11 мин)')
    база.записать_мету_намаза('umuz_regions', {'data': [1, 2]}, СЕЙЧАС)
    assert база.мета_намаза('umuz_regions') == {'данные': {'data': [1, 2]}, 'при': СЕЙЧАС}
    with psycopg.connect(pg_адрес) as с:
        assert с.execute("SELECT result, detail FROM prayer_log").fetchall() == [('diff', 'день 145, fajr: 03:59 против своего 03:48 (11 мин)')]
        # в журнале и таблицах нет IP и координат пользователей — только пункты ведомств
        assert с.execute("SELECT count(*) FROM information_schema.columns WHERE table_name LIKE 'prayer_%' AND column_name ~ 'ip|lat|lon|user'").fetchone()[0] == 0
    база.сохранить_таблицу_намаза('dumk', 'astana', 2024, дни2, точка, 'table', 'x', 1, СЕЙЧАС)
    убрано = база.убрать_старое(СЕЙЧАС + 8 * push.ДЕНЬ_МС)
    assert убрано['намаз'] == 2, 'таблица 2024 года и просьба старше недели'
    assert база.таблица_намаза('dumk', 'almaty', 2026) is not None
