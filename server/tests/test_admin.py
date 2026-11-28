"""Админка и статистика (server/admin.py, stats.py, content_admin.py; миграция 007) — на своей временной базе.

Владелец 27.11.2026: «Создай админ панель, админку меня назначь админом, чтобы потом я другим давал доступ… статистика…
Коран… хадисы… добавляли, убирали, отключали». docs/дизайн/12-админка-и-статистика.md.
Разбор событий и чистые функции — без базы; вход, роли, сеансы, журнал, статистика и настройки — на mugalim_test_*.
"""
from __future__ import annotations

from datetime import date, timedelta

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient

import admin
import content_admin
import stats
from conftest import СЕЙЧАС

ВЛАДЕЛЕЦ = 'owner@example.org'
СВОЙ = {'origin': 'https://aiustaz.pro', 'x-aiustaz-admin': '1'}
SID = 'A' * 22
SID2 = 'B' * 22


# ───────────── без базы ─────────────
def test_почта_и_роли():
    assert admin.норм_почта('  Owner@Example.ORG ') == 'owner@example.org'
    for плохая in ('', 'нет', 'a@b', 'a b@c.kz', None, 5, 'x' * 250 + '@a.kz'):
        assert admin.норм_почта(плохая) is None
    assert admin.можно('owner', 'admin') and admin.можно('admin', 'viewer') and not admin.можно('viewer', 'admin')
    assert not admin.можно('кто-то', 'viewer')
    к = admin.новый_код()
    assert len(к) == 4 and к.isdigit()  # владелец 28.11.2026: «Код четырёхзначный сделай»
    assert admin.хэш_кода('с', 'a@b.kz', '1234') != admin.хэш_кода('с', 'a@b.kz', '1235')
    assert admin.код_верного_вида(' 0042 ') == '0042' and admin.код_верного_вида('123456') is None
    assert admin.код_верного_вида('12a4') is None and admin.код_верного_вида(1234) is None
    assert admin.класс_устройства('Mozilla/5.0 (Linux; Android 14) Chrome/130') == 'Android · Chrome'


def пакет(**над) -> dict:
    д = {'v': 1, 'sid': SID, 'sess': 'S' * 20, 'lang': 'kk', 'dev': 'phone', 'os': 'android', 'st': 1,
         'ref': 'www.instagram.com', 'ver': 'db95110',
         'ev': [{'t': 'o'}, {'t': 'v', 's': 'quran/sura', 'n': 2}, {'t': 'b', 's': 'quran/sura', 'd': 30}]}
    д.update(над)
    return д


def test_разбор_событий():
    п = stats.разобрать(пакет())
    assert п.sid == SID and п.язык == 'kk' and п.установлено and п.откуда == 'instagram.com'
    assert п.просмотров == 1 and п.секунд == 30
    assert stats.разобрать(пакет(ref='aiustaz.pro')).откуда == ''
    assert stats.разобрать(пакет(lang='fr', dev='tv', os='beos')).язык == '-'
    for плохой in (пакет(v=2), пакет(sid='коротко'), пакет(ev=[]), пакет(ev=[{'t': 'x'}]),
                   пакет(ev=[{'t': 'v', 's': 'Экран'}]), пакет(ev=[{'t': 'b', 'd': 999}]), пакет(ua='Mozilla'),
                   пакет(ev=[{'t': 'v', 's': 'quran', 'n': -1}]), пакет(ev=[{'t': 'v', 'ip': '1.2.3.4'}])):
        with pytest.raises(stats.ОшибкаСтатистики):
            stats.разобрать(плохой)
    # Секунды за запрос ограничены: копить больше 90 с клиенту не верим.
    п = stats.разобрать(пакет(ev=[{'t': 'b', 's': '', 'd': 60}] * 5))
    assert п.секунд == stats.МАКС_СЕКУНД_ЗА_ЗАПРОС
    assert stats.медиана([5, 1, 3]) == 3 and stats.медиана([1, 2, 3, 4]) == 2 and stats.медиана([]) == 0


def test_настройки_чистые():
    н = content_admin.собрать_настройки({'включены': ['husary'], 'поУмолчанию': 'husary'},
                                        [(5, True, '', None), (2, False, 'Устаз Ахмад', '2026-11-27')])
    assert н['хадисы'] == {'скрыты': [5], 'проверены': {'2': ['Устаз Ахмад', '2026-11-27']}}
    assert content_admin.sha256_настроек(н) == content_admin.sha256_настроек(dict(н))


# ───────────── на базе ─────────────
class Часы:
    def __init__(self, мс: int) -> None:
        self.мс = мс

    def __call__(self) -> float:
        return self.мс / 1000


@pytest.fixture
def среда(pg_адрес):
    from db import Хранилище

    х = Хранилище(pg_адрес)
    х.применить_миграции()
    часы = Часы(СЕЙЧАС)
    письма: list[tuple[str, str]] = []

    def отправить(почта, код):
        письма.append((почта, код))
        return True

    app = FastAPI()
    ключ = lambda запрос: 'ip:тест'  # noqa: E731
    статистика = stats.ХранилищеСтатистики(х)
    stats.register(app, статистика=статистика, хранилище=х, ключ_лимита=ключ, часы=часы)
    админы = admin.ХранилищеАдминов(х)
    админы.обеспечить_владельцев([ВЛАДЕЛЕЦ])
    доступ = admin.register(app, админы=админы, хранилище=х, статистика=статистика, отправить_код=отправить,
                            секрет='тестовый-секрет', ключ_лимита=ключ, владельцы=frozenset({ВЛАДЕЛЕЦ}), часы=часы,
                            безопасная_кука=False)
    content_admin.register(app, содержимое=content_admin.ХранилищеСодержимого(х), доступ=доступ, админы=админы, часы=часы)
    return TestClient(app, base_url='http://aiustaz.pro'), х, часы, письма


def войти(клиент, письма, почта=ВЛАДЕЛЕЦ) -> None:
    assert клиент.post('/api/admin/login/code', json={'email': почта}, headers=СВОЙ).status_code == 200
    код = [к for п, к in письма if п == почта][-1]
    р = клиент.post('/api/admin/login/verify', json={'email': почта, 'code': код}, headers=СВОЙ)
    assert р.status_code == 200, р.text
    assert 'aiustaz_admin' in р.headers['set-cookie'] and 'HttpOnly' in р.headers['set-cookie']
    assert 'samesite=strict' in р.headers['set-cookie'].lower() and 'Path=/api/admin' in р.headers['set-cookie']


def test_вход_по_коду(среда):
    клиент, х, часы, письма = среда
    assert клиент.get('/api/admin/me').status_code == 401
    # Чужая почта: ответ тот же, письма нет.
    assert клиент.post('/api/admin/login/code', json={'email': 'chuzhoy@example.org'}, headers=СВОЙ).json() == {'ок': True}
    assert письма == []
    # Без заголовка и с чужого сайта — нельзя.
    assert клиент.post('/api/admin/login/code', json={'email': ВЛАДЕЛЕЦ}, headers={'origin': 'https://aiustaz.pro'}).status_code == 403
    assert клиент.post('/api/admin/login/code', json={'email': ВЛАДЕЛЕЦ},
                       headers={'origin': 'https://evil.example', 'x-aiustaz-admin': '1'}).status_code == 403
    клиент.post('/api/admin/login/code', json={'email': ВЛАДЕЛЕЦ}, headers=СВОЙ)
    код = письма[-1][1]
    # Код в базе — только хэш.
    with х.соединение() as с:
        assert код not in str(с.execute('SELECT code_hash FROM admin_codes').fetchall())
    # Неверный код 5 раз — код сгорает, даже верный больше не подходит.
    неверный = '0000' if код != '0000' else '1111'
    for _ in range(5):
        assert клиент.post('/api/admin/login/verify', json={'email': ВЛАДЕЛЕЦ, 'code': неверный}, headers=СВОЙ).status_code == 400
    assert клиент.post('/api/admin/login/verify', json={'email': ВЛАДЕЛЕЦ, 'code': код}, headers=СВОЙ).status_code == 400
    # Истёкший код не подходит.
    клиент.post('/api/admin/login/code', json={'email': ВЛАДЕЛЕЦ}, headers=СВОЙ)
    код = письма[-1][1]
    часы.мс += 11 * 60_000
    assert клиент.post('/api/admin/login/verify', json={'email': ВЛАДЕЛЕЦ, 'code': код}, headers=СВОЙ).status_code == 400
    # Новый код через час (лимит — 5 кодов в час на почту).
    часы.мс += 61 * 60_000
    войти(клиент, письма)
    assert клиент.get('/api/admin/me').json() == {'email': ВЛАДЕЛЕЦ, 'роль': 'owner', 'имя': ''}
    # Код одноразовый.
    assert клиент.post('/api/admin/login/verify', json={'email': ВЛАДЕЛЕЦ, 'code': письма[-1][1]}, headers=СВОЙ).status_code == 400
    # Сеанс в базе — хэш токена, не сам токен.
    токен = клиент.cookies.get('aiustaz_admin')
    with х.соединение() as с:
        assert токен not in str(с.execute('SELECT id FROM admin_sessions').fetchall())
    сеансы = клиент.get('/api/admin/sessions').json()['сеансы']
    assert len(сеансы) == 1 and сеансы[0]['этот']
    # Выход — сеанс закрыт.
    assert клиент.post('/api/admin/logout', headers=СВОЙ).status_code == 200
    клиент.cookies.set('aiustaz_admin', токен)
    assert клиент.get('/api/admin/me').status_code == 401
    действия = [з['действие'] for з in admin.ХранилищеАдминов(х).журнал()]
    assert 'вход' in действия and 'выход' in действия


def test_лимит_кодов(среда):
    клиент, _, часы, письма = среда
    # Не больше 5 кодов в час на почту (4 цифры — владелец 28.11.2026), через час — снова можно.
    коды = [клиент.post('/api/admin/login/code', json={'email': ВЛАДЕЛЕЦ}, headers=СВОЙ).status_code for _ in range(6)]
    assert коды == [200] * 5 + [429] and len(письма) == 5
    assert all(len(к) == 4 and к.isdigit() for _, к in письма)
    часы.мс += 61 * 60_000
    assert клиент.post('/api/admin/login/code', json={'email': ВЛАДЕЛЕЦ}, headers=СВОЙ).status_code == 200


def test_лимит_кодов_с_ip(среда):
    клиент, _, _, письма = среда
    # 20 кодов в час с одного IP (хэш) на разные почты, 21-й — 429.
    итоги = [клиент.post('/api/admin/login/code', json={'email': f'n{и}@example.org'}, headers=СВОЙ).status_code for и in range(21)]
    assert итоги == [200] * 20 + [429]


def test_роли_и_админы(среда):
    клиент, х, часы, письма = среда
    войти(клиент, письма)
    р = клиент.post('/api/admin/users', json={'email': 'Brat@Example.org', 'role': 'viewer', 'name': 'Брат'}, headers=СВОЙ)
    assert р.status_code == 200
    ид = р.json()['id']
    assert клиент.post('/api/admin/users', json={'email': 'brat@example.org', 'role': 'admin'}, headers=СВОЙ).status_code == 409
    assert клиент.post('/api/admin/users', json={'email': 'x@example.org', 'role': 'бог'}, headers=СВОЙ).status_code == 400
    админы = клиент.get('/api/admin/users').json()['админы']
    assert {а['email'] for а in админы} == {ВЛАДЕЛЕЦ, 'brat@example.org'}
    assert [а for а in админы if а['email'] == ВЛАДЕЛЕЦ][0]['изОкружения']
    владелец_id = [а for а in админы if а['email'] == ВЛАДЕЛЕЦ][0]['id']
    # Владельца из окружения и себя — не понизить и не удалить.
    assert клиент.post('/api/admin/users/update', json={'id': владелец_id, 'role': 'viewer'}, headers=СВОЙ).status_code == 409
    assert клиент.post('/api/admin/users/remove', json={'id': владелец_id}, headers=СВОЙ).status_code == 409
    # Зритель: статистику видит, содержимое не меняет, админов не видит.
    второй = TestClient(клиент.app, base_url='http://aiustaz.pro')
    войти(второй, письма, 'brat@example.org')
    assert второй.get('/api/admin/stats?days=7').status_code == 200
    assert второй.get('/api/admin/users').status_code == 403
    assert второй.post('/api/admin/content/hadith', json={'id': 5, 'скрыт': True}, headers=СВОЙ).status_code == 403
    assert второй.get('/api/admin/audit').status_code == 403
    # Повышение до admin — может менять содержимое.
    assert клиент.post('/api/admin/users/update', json={'id': ид, 'role': 'admin'}, headers=СВОЙ).status_code == 200
    assert второй.post('/api/admin/content/hadith', json={'id': 5, 'скрыт': True}, headers=СВОЙ).status_code == 200
    # Отключение — сеансы закрываются сразу.
    assert клиент.post('/api/admin/users/update', json={'id': ид, 'disabled': True}, headers=СВОЙ).status_code == 200
    assert второй.get('/api/admin/me').status_code == 401
    assert клиент.post('/api/admin/users/remove', json={'id': ид}, headers=СВОЙ).status_code == 200
    журнал = клиент.get('/api/admin/audit').json()['записи']
    assert {'админ добавлен', 'админ изменён', 'админ удалён', 'хадис: скрыт'} <= {з['действие'] for з in журнал}
    assert any(з['кто'] == 'brat@example.org' and з['над'] == '5' for з in журнал)


def test_сеанс_простаивает(среда):
    клиент, _, часы, письма = среда
    войти(клиент, письма)
    часы.мс += 8 * 86_400_000
    assert клиент.get('/api/admin/me').status_code == 401


def test_содержимое_и_версии(среда):
    клиент, _, часы, письма = среда
    assert клиент.get('/api/content/config').json()['версия'] == 0
    войти(клиент, письма)
    assert клиент.post('/api/admin/content/reciters', json={'включены': ['husary', 'ayyub'], 'поУмолчанию': 'husary'},
                       headers=СВОЙ).json() == {'ок': True, 'версия': 1}
    assert клиент.post('/api/admin/content/reciters', json={'включены': ['husary'], 'поУмолчанию': 'ayyub'},
                       headers=СВОЙ).status_code == 400
    assert клиент.post('/api/admin/content/reciters', json={'включены': ['Хусари']}, headers=СВОЙ).status_code == 400
    assert клиент.post('/api/admin/content/reciters', json={'включены': []}, headers=СВОЙ).status_code == 400
    assert клиент.post('/api/admin/content/hadith', json={'id': 1751, 'скрыт': True}, headers=СВОЙ).json()['версия'] == 2
    assert клиент.post('/api/admin/content/hadith', json={'id': 3062, 'проверил': 'Устаз Ахмад'}, headers=СВОЙ).json()['версия'] == 3
    # Текст хадиса передать нельзя — только отметки.
    assert клиент.post('/api/admin/content/hadith', json={'id': 3062, 'текст': 'х'}, headers=СВОЙ).status_code == 400
    # То же самое ещё раз — версия не растёт.
    assert клиент.post('/api/admin/content/hadith', json={'id': 1751, 'скрыт': True}, headers=СВОЙ).json()['версия'] == 3
    р = клиент.get('/api/content/config')
    н = р.json()
    assert н['чтецы'] == {'включены': ['husary', 'ayyub'], 'поУмолчанию': 'husary'}
    assert н['хадисы'] == {'скрыты': [1751], 'проверены': {'3062': ['Устаз Ахмад', '2026-11-20']}}
    assert len(н['sha256']) == 64 and 'max-age=300' in р.headers['cache-control']
    assert клиент.get('/api/content/config', headers={'if-none-match': р.headers['etag']}).status_code == 304
    assert клиент.get('/api/admin/content/hadith/approved').json() == {'3062': {'кто': 'Устаз Ахмад', 'когда': '2026-11-20'}}
    # Снять отметку устаза и показать снова.
    клиент.post('/api/admin/content/hadith', json={'id': 3062, 'проверил': ''}, headers=СВОЙ)
    клиент.post('/api/admin/content/hadith', json={'id': 1751, 'скрыт': False}, headers=СВОЙ)
    н = клиент.get('/api/content/config').json()
    assert н['хадисы'] == {'скрыты': [], 'проверены': {}}
    версии = клиент.get('/api/admin/content').json()['версии']
    assert версии[0]['версия'] == н['версия'] and версии[0]['sha256'] == н['sha256']


def test_статистика(среда):
    клиент, х, часы, письма = среда
    З = {'origin': 'https://aiustaz.pro'}
    # Чужой сайт — нельзя; неверный формат — 400; верный — 204 без тела.
    assert клиент.post('/api/stats/e', json=пакет(), headers={'origin': 'https://batr.kz'}).status_code == 403
    assert клиент.post('/api/stats/e', json=пакет(sid='x'), headers=З).status_code == 400
    р = клиент.post('/api/stats/e', json=пакет(), headers=З)
    assert р.status_code == 204 and р.content == b''
    часы.мс += 30_000
    клиент.post('/api/stats/e', json=пакет(ev=[{'t': 'b', 's': 'quran/sura', 'd': 30}, {'t': 'v', 's': 'hadith/item', 'n': 1751}]), headers=З)
    # Второе устройство, на следующий день — и первое возвращается.
    часы.мс += 86_400_000
    клиент.post('/api/stats/e', json=пакет(sid=SID2, sess='T' * 20, lang='ru', st=0, ref='',
                                           ev=[{'t': 'o'}, {'t': 'v', 's': '', 'n': None}]), headers=З)
    клиент.post('/api/stats/e', json=пакет(sess='U' * 20, ev=[{'t': 'v', 's': 'dhikr'}]), headers=З)
    # Подделка сеанса другим устройством не меняет чужой сеанс.
    клиент.post('/api/stats/e', json=пакет(sid=SID2, sess='S' * 20, ev=[{'t': 'v', 's': 'x'}]), headers=З)
    with х.соединение() as с:
        assert с.execute("SELECT sid, views, seconds FROM stats_sessions WHERE id = %s", ('S' * 20,)).fetchone() == (SID, 2, 60)
        # Ничего лишнего в базе: ни IP, ни строки браузера.
        колонки = {р[0] for р in с.execute(
            "SELECT column_name FROM information_schema.columns WHERE table_name LIKE 'stats_%'").fetchall()}
        assert not колонки & {'ip', 'user_agent', 'ua', 'city', 'lat', 'lon'}
    войти(клиент, письма)
    с_ = клиент.get('/api/admin/stats?days=7').json()
    assert с_['карточки']['сегодня']['посетители'] == 2 and с_['карточки']['7']['посетители'] == 2
    assert с_['карточки']['7']['новые'] == 2
    вчера = [д for д in с_['ряд'] if д['посетители'] == 1]
    assert len(вчера) == 1
    экраны = {э['экран']: э for э in с_['экраны']}
    assert экраны['quran/sura']['просмотры'] == 1 and экраны['quran/sura']['секунд'] == 60
    assert с_['номера']['quran/sura'] == [{'номер': 2, 'просмотры': 1}]
    assert {з['ключ'] for з in с_['языки']} == {'kk', 'ru'}
    assert с_['установлено'] == 1
    assert {з['ключ'] for з in с_['откуда']} == {'instagram.com', ''}
    assert с_['удержание']['d1'] == {'когорта': 1, 'вернулись': 1}
    assert с_['время']['медиана'] >= 0 and с_['уведомления']['подписок'] == 0
    assert клиент.get('/api/admin/stats?days=5').status_code == 400
    # Через 91 день сырые события удаляются, итоги остаются.
    часы.мс += 92 * 86_400_000
    итог = stats.ХранилищеСтатистики(х).убрать_старое(часы.мс)
    assert итог['просмотры'] >= 4
    with х.соединение() as с:
        assert с.execute('SELECT count(*) FROM stats_views').fetchone()[0] == 0
        assert с.execute("SELECT sum(value) FROM stats_daily WHERE metric = 'visitors'").fetchone()[0] == 3


def test_лимит_статистики(среда):
    клиент, _, _, _ = среда
    коды = [клиент.post('/api/stats/e', json=пакет(), headers={'origin': 'https://aiustaz.pro'}).status_code for _ in range(32)]
    assert коды.count(204) == 30 and коды[-1] == 429


def test_день_алматы():
    assert stats.день_алматы(СЕЙЧАС) == date(2026, 11, 20)
    assert stats.день_алматы(СЕЙЧАС + 15 * 3_600_000) == date(2026, 11, 21)  # 00:00 по Алматы
    assert date(2026, 11, 21) - timedelta(days=1) == date(2026, 11, 20)
