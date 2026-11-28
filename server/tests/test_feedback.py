"""«Сообщить об ошибке» (server/feedback.py, миграция 022) — разбор без базы; приём, лимиты, админка, журнал, уборка
контакта и письмо админам — на своей временной базе mugalim_test_*.

Владелец 28.11.2026: «клиент мог выделить и нажать на кнопку „Ошибка“. И написать, какая там ошибка… он попадает к нам
и обрабатывает. Если это реальная ошибка, то мы улучшаем».
"""
from __future__ import annotations

import json

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient

import admin
import feedback
from conftest import СЕЙЧАС

ВЛАДЕЛЕЦ = 'owner@example.org'
СВОЙ = {'origin': 'https://aiustaz.pro', 'x-aiustaz-admin': '1'}
ДЕНЬ = 86_400_000


def тело(**над) -> dict:
    д = {'cat': 'quran', 'text': 'Здесь мадд 4 счёта, а написано 2 счёта', 'route': '#/quran/sura?n=2&a=255',
         'quote': 'мадд: 2 счёта', 'ref': '2:255', 'ver': 'e3d79e2', 'lang': 'ru', 'theme': 'light', 'dev': 'phone'}
    д.update(над)
    return {к: з for к, з in д.items() if з is not ...}


# ───────────── без базы ─────────────
def test_разбор():
    з = feedback.разобрать(тело())
    assert з['категория'] == 'quran' and з['место'] == '2:255' and з['экран'] == '#/quran/sura?n=2&a=255'
    assert з['контакт'] is None and з['версия'] == 'e3d79e2' and з['устройство'] == 'phone'
    # Только обязательное.
    з = feedback.разобрать({'cat': 'ui', 'text': 'кнопка не нажимается', 'route': '#/'})
    assert з['цитата'] is None and з['язык'] == '-' and з['тема'] == '-'
    # Почта и телефон в тексте — метки; контакт — своё поле, как есть.
    з = feedback.разобрать(тело(text='пишите a.b@mail.kz или +7 701 123 45 67, аят 2:255', contact='  @brat_kz  '))
    assert '[почта]' in з['текст'] and '[номер]' in з['текст'] and 'mail.kz' not in з['текст'] and '2:255' in з['текст']
    assert з['контакт'] == '@brat_kz'
    # Арабская цитата (Коран) не меняется.
    з = feedback.разобрать(тело(quote='بِسْمِ ٱللَّهِ ٱلرَّحْمَٰنِ ٱلرَّحِيمِ'))
    assert з['цитата'] == 'بِسْمِ ٱللَّهِ ٱلرَّحْمَٰنِ ٱلرَّحِيمِ'
    # Будущие языки интерфейса принимаются.
    assert feedback.разобрать(тело(lang='ar'))['язык'] == 'ar'
    плохие = [
        ({}, 'body'), ([], 'body'), (тело(ua='Mozilla/5.0'), 'body'), (тело(sid='A' * 22), 'body'),
        (тело(cat='коран'), 'cat'), (тело(cat=None), 'cat'),
        (тело(text='а'), 'text'), (тело(text='    '), 'text'), (тело(text='я' * 1001), 'text'), (тело(text=5), 'text'),
        (тело(route='https://evil.example/'), 'route'), (тело(route='#/quran/sura?n=2&q=<script>'), 'route'),
        (тело(route='#/' + 'a' * 61), 'route'), (тело(route=...), 'route'),
        (тело(quote='ц' * 501), 'quote'), (тело(ref='2:255; DROP'), 'ref'), (тело(contact='к' * 201), 'contact'),
        (тело(ver='<b>'), 'ver'), (тело(lang='fr'), 'lang'), (тело(theme='blue'), 'theme'), (тело(dev='tv'), 'dev'),
    ]
    for д, код in плохие:
        with pytest.raises(feedback.ОшибкаСообщения) as е:
            feedback.разобрать(д)
        assert е.value.код == код, (д, е.value.код)
    # Управляющие символы — прочь.
    assert feedback.разобрать(тело(text='ош\x00ибка​ тут'))['текст'] == 'ошибка тут'


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
    app = FastAPI()
    ip = {'ключ': 'ip:тест'}
    ключ = lambda запрос: ip['ключ']  # noqa: E731
    админы = admin.ХранилищеАдминов(х)
    админы.обеспечить_владельцев([ВЛАДЕЛЕЦ])
    доступ = admin.register(app, админы=админы, хранилище=х, статистика=None, отправить_код=lambda п, к: письма.append((п, к)) or True,
                            секрет='тест', ключ_лимита=ключ, владельцы=frozenset({ВЛАДЕЛЕЦ}), часы=часы, безопасная_кука=False)
    сообщения = feedback.ХранилищеСообщений(х)
    feedback.register(app, сообщения=сообщения, хранилище=х, доступ=доступ, админы=админы, ключ_лимита=ключ, часы=часы)
    return TestClient(app, base_url='http://aiustaz.pro'), х, часы, письма, ip, сообщения, админы


def войти(клиент, письма, почта=ВЛАДЕЛЕЦ) -> None:
    клиент.cookies.clear()
    assert клиент.post('/api/admin/login/code', json={'email': почта}, headers=СВОЙ).status_code == 200
    код = [к for п, к in письма if п == почта][-1]
    assert клиент.post('/api/admin/login/verify', json={'email': почта, 'code': код}, headers=СВОЙ).status_code == 200


def test_приём_и_лимиты(среда):
    клиент, х, часы, _, ip, сообщения, _ = среда
    свой = {'origin': 'https://aiustaz.pro'}
    р = клиент.post('/api/feedback', json=тело(contact='+7 701 000 00 00'), headers=свой)
    assert р.status_code == 200 and р.json() == {'ок': True} and р.headers['cache-control'] == 'no-store'
    with х.соединение() as с:
        строка = с.execute('SELECT category, quote, route, ref, text, contact, app_version, lang, theme, device, status FROM feedback').fetchone()
        столбцы = {р[0] for р in с.execute("SELECT column_name FROM information_schema.columns WHERE table_name = 'feedback'").fetchall()}
    assert строка == ('quran', 'мадд: 2 счёта', '#/quran/sura?n=2&a=255', '2:255', 'Здесь мадд 4 счёта, а написано 2 счёта',
                      '+7 701 000 00 00', 'e3d79e2', 'ru', 'light', 'phone', 'новое')
    # Ни IP, ни строки браузера, ни id статистики — даже столбцов таких нет.
    assert not столбцы & {'ip', 'ip_hash', 'user_agent', 'ua', 'sid'}
    # Чужой сайт, большое тело, плохой JSON, плохое поле.
    assert клиент.post('/api/feedback', json=тело(), headers={'origin': 'https://evil.example'}).json() == {'ошибка': 'origin'}
    ip['ключ'] = 'ip:2'
    assert клиент.post('/api/feedback', content=b'{' + b' ' * 9000 + b'}', headers={'content-type': 'application/json'}).status_code == 413
    assert клиент.post('/api/feedback', content=b'{oops', headers={'content-type': 'application/json'}).json() == {'ошибка': 'json'}
    р = клиент.post('/api/feedback', json=тело(text='а'))
    assert р.status_code == 400 and р.json() == {'ошибка': 'text'}  # присланное не возвращаем
    # Лимит: 3 в минуту с одного IP (по хэшу).
    ip['ключ'] = 'ip:3'
    коды = [клиент.post('/api/feedback', json=тело()).status_code for _ in range(4)]
    assert коды == [200, 200, 200, 429]
    часы.мс += 61_000
    assert клиент.post('/api/feedback', json=тело()).status_code == 200
    # 20 в час.
    ip['ключ'] = 'ip:4'
    коды = []
    for i in range(21):
        if i and i % 3 == 0:
            часы.мс += 61_000
        коды.append(клиент.post('/api/feedback', json=тело()).status_code)
    assert коды.count(200) == 20 and коды[-1] == 429
    assert сообщения.счёт(часы.мс)['новых'] == 1 + 4 + 20


def test_админка_роли_журнал(среда):
    клиент, х, часы, письма, ip, сообщения, админы = среда
    for i, кат in enumerate(['quran', 'hadith', 'hadith', 'ui']):
        ip['ключ'] = f'ip:{i}'
        assert клиент.post('/api/feedback', json=тело(cat=кат, contact='brat@example.org' if кат == 'hadith' else None, ref=None if кат == 'ui' else '2:255')).status_code == 200
    assert клиент.get('/api/admin/feedback').status_code == 401
    войти(клиент, письма)
    с = клиент.get('/api/admin/feedback').json()
    ид = [з['id'] for з in с['сообщения']]
    assert ид == sorted(ид, reverse=True) and len(ид) == 4 and с['дальше'] is None  # новые сверху
    assert all('контакт' not in з for з in с['сообщения']) and sum(з['естьКонтакт'] for з in с['сообщения']) == 2
    assert [з['категория'] for з in клиент.get('/api/admin/feedback?cat=hadith').json()['сообщения']] == ['hadith', 'hadith']
    assert клиент.get('/api/admin/feedback?status=чужое').status_code == 400
    assert клиент.get('/api/admin/feedback?cat=x').status_code == 400
    # Листание.
    п1 = клиент.get('/api/admin/feedback?limit=3').json()
    assert len(п1['сообщения']) == 3 and п1['дальше'] == п1['сообщения'][-1]['id']
    п2 = клиент.get(f'/api/admin/feedback?limit=3&before={п1["дальше"]}').json()
    assert len(п2['сообщения']) == 1 and п2['дальше'] is None
    assert клиент.get('/api/admin/feedback/count').json() == {'новых': 4, 'заНеделю': 4, 'новыхЗаНеделю': 4, 'всего': 4}
    # Карточка: владелец видит контакт.
    хадис = [з for з in с['сообщения'] if з['категория'] == 'hadith'][0]['id']
    к = клиент.get(f'/api/admin/feedback/item?id={хадис}').json()['сообщение']
    assert к['контакт'] == 'brat@example.org' and к['экран'] == '#/quran/sura?n=2&a=255' and к['версия'] == 'e3d79e2'
    assert клиент.get('/api/admin/feedback/item?id=999999').status_code == 404
    assert клиент.get('/api/admin/feedback/item?id=abc').status_code == 400
    # Изменение: без заголовка — нельзя; статус и заметка — в журнал.
    assert клиент.post('/api/admin/feedback/update', json={'id': хадис, 'status': 'в работе'}, headers={'origin': 'https://aiustaz.pro'}).status_code == 403
    assert клиент.post('/api/admin/feedback/update', json={'id': хадис, 'status': 'готово'}, headers=СВОЙ).json() == {'ошибка': 'status'}
    assert клиент.post('/api/admin/feedback/update', json={'id': хадис}, headers=СВОЙ).json() == {'ошибка': 'body'}
    р = клиент.post('/api/admin/feedback/update', json={'id': хадис, 'status': 'в работе', 'note': 'проверяем с устазом'}, headers=СВОЙ)
    assert р.status_code == 200 and р.json()['сообщение']['статус'] == 'в работе' and р.json()['сообщение']['закрыто'] is None
    р = клиент.post('/api/admin/feedback/update', json={'id': хадис, 'status': 'исправлено'}, headers=СВОЙ).json()['сообщение']
    assert р['закрыто'] == часы.мс and р['кто'] == ВЛАДЕЛЕЦ and р['заметка'] == 'проверяем с устазом'
    журнал = [(з['действие'], з['над'], з['подробно']) for з in админы.журнал()]
    assert ('ошибка: статус', f'#{хадис}', {'было': 'в работе', 'стало': 'исправлено'}) in журнал
    assert ('ошибка: статус', f'#{хадис}', {'было': 'новое', 'стало': 'в работе'}) in журнал
    assert ('ошибка: заметка', f'#{хадис}', {'заметка': 'проверяем с устазом'}) in журнал
    assert клиент.get('/api/admin/feedback/count').json()['новых'] == 3
    # Просмотр: читает, контакта не видит, менять не может.
    assert клиент.post('/api/admin/users', json={'email': 'ustaz@example.org', 'role': 'viewer'}, headers=СВОЙ).status_code == 200
    войти(клиент, письма, 'ustaz@example.org')
    к = клиент.get(f'/api/admin/feedback/item?id={хадис}').json()['сообщение']
    assert к['контакт'] is None and к['естьКонтакт'] and к['статус'] == 'исправлено'
    assert клиент.post('/api/admin/feedback/update', json={'id': хадис, 'status': 'новое'}, headers=СВОЙ).json() == {'ошибка': 'role'}


def test_контакт_через_90_дней_после_закрытия(среда):
    клиент, х, часы, письма, ip, сообщения, _ = среда
    клиент.post('/api/feedback', json=тело(contact='brat@example.org'))
    ip['ключ'] = 'ip:2'
    клиент.post('/api/feedback', json=тело(contact='+7 777 000 00 00'))
    войти(клиент, письма)
    первое, второе = sorted(з['id'] for з in клиент.get('/api/admin/feedback').json()['сообщения'])
    клиент.post('/api/admin/feedback/update', json={'id': первое, 'status': 'не ошибка'}, headers=СВОЙ)
    # Открытое (второе) хранит контакт сколько угодно; закрытое — 90 дней от закрытия.
    часы.мс += 89 * ДЕНЬ
    assert сообщения.убрать_старое(часы.мс)['контакты'] == 0
    # Перезакрытие (заметка) не продлевает срок.
    клиент.post('/api/admin/feedback/update', json={'id': первое, 'status': 'дубль'}, headers=СВОЙ)
    часы.мс += 2 * ДЕНЬ
    assert сообщения.убрать_старое(часы.мс)['контакты'] == 1
    assert сообщения.одно(первое)['контакт'] is None and сообщения.одно(первое)['текст']  # само сообщение остаётся
    assert сообщения.одно(второе)['контакт'] == '+7 777 000 00 00'
    # Открыли снова — срок сначала.
    клиент.post('/api/admin/feedback/update', json={'id': второе, 'status': 'исправлено'}, headers=СВОЙ)
    клиент.post('/api/admin/feedback/update', json={'id': второе, 'status': 'в работе'}, headers=СВОЙ)
    assert сообщения.одно(второе)['закрыто'] is None
    часы.мс += 100 * ДЕНЬ
    assert сообщения.убрать_старое(часы.мс)['контакты'] == 0


def test_письмо_админам(среда):
    клиент, х, часы, письма, ip, сообщения, админы = среда
    админы.добавить('brat@example.org', 'admin', 'Брат', 1)
    админы.добавить('ustaz@example.org', 'viewer', 'Устаз', 1)
    отправлено: list[tuple[str, dict]] = []
    отправить = lambda почта, итог: отправлено.append((почта, итог)) or True  # noqa: E731
    # СЕЙЧАС — 09:00 по Алматы. До 9 — не шлём; новых нет — отметка дня есть, писем нет.
    assert feedback.дайджест(сообщения, СЕЙЧАС - 3_600_000, отправить) == {'писем': 0}
    assert feedback.дайджест(сообщения, СЕЙЧАС, отправить) == {'писем': 0, 'новых': 0}
    часы.мс = СЕЙЧАС + ДЕНЬ - 2 * 3_600_000
    for i, кат in enumerate(['quran', 'quran', 'prayer']):
        ip['ключ'] = f'ip:{i}'
        assert клиент.post('/api/feedback', json=тело(cat=кат, contact='секрет@example.org')).status_code == 200
    итог = feedback.дайджест(сообщения, СЕЙЧАС + ДЕНЬ, отправить)
    assert итог == {'писем': 2, 'новых': 3}
    assert {п for п, _ in отправлено} == {ВЛАДЕЛЕЦ, 'brat@example.org'}  # просмотру — нет
    assert отправлено[0][1] == {'всего': 3, 'по': {'quran': 2, 'prayer': 1}}
    assert 'секрет' not in json.dumps(отправлено, ensure_ascii=False)
    # Второй раз за день — нет.
    assert feedback.дайджест(сообщения, СЕЙЧАС + ДЕНЬ + 3_600_000, отправить) == {'писем': 0}
    # Текст письма: без текста сообщений и контактов (SMTP подменён).
    import smtplib

    ушло = []

    class SMTP:
        def __init__(self, *а, **к):
            pass

        def __enter__(self):
            return self

        def __exit__(self, *а):
            return False

        def send_message(self, п, from_addr, to_addrs):
            ушло.append(п)

    старый = smtplib.SMTP
    smtplib.SMTP = SMTP
    try:
        assert feedback.письмо_дайджеста('owner@example.org', {'всего': 3, 'по': {'quran': 2, 'prayer': 1}})
    finally:
        smtplib.SMTP = старый
    текст = ушло[0].get_content()
    assert 'Коран / таджвид: 2' in текст and 'Время намаза: 1' in текст and 'https://aiustaz.pro/admin/#/feedback' in текст
    assert ушло[0]['From'] == 'AI Ustaz <no-reply@aiustaz.pro>'
