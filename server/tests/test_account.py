"""Аккаунты приложения (server/account.py, миграция 027) — на своей временной базе, письма и ключи Google — подставные.

Владелец 28.11.2026: «создай вход, чтобы кто хочет, мог заходить входом, и у него прогресс сохраняется. И с другого
устройства он также может зайти»; «Google авторизация»; «Код четырёхзначный сделай». Проверяем: вход по коду (4 цифры,
HMAC, 5 попыток, срок, лимиты), 16+, cookie, сеансы и «выйти везде», синхронизацию с версиями (конфликт → текущая
версия), закят только с выключателем, выгрузку, удаление, Google ID token (подпись, aud, iss, exp, email_verified) на своих
тестовых ключах, один аккаунт на почту, мост в админку и журнал.
"""
from __future__ import annotations

import base64
import json

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient

import account
import admin
from conftest import СЕЙЧАС

СВОЙ = {'origin': 'https://aiustaz.pro', 'x-aiustaz-account': '1'}
АДМИН_СВОЙ = {'origin': 'https://aiustaz.pro', 'x-aiustaz-admin': '1'}
ВЛАДЕЛЕЦ = 'owner@example.org'
КЛИЕНТ_GOOGLE = '1234-test.apps.googleusercontent.com'


# ───────────── тестовые ключи и токены ─────────────
def _b64(б: bytes) -> str:
    return base64.urlsafe_b64encode(б).rstrip(b'=').decode()


class Ключи:
    def __init__(self) -> None:
        from cryptography.hazmat.primitives.asymmetric import rsa

        self.закрытый = rsa.generate_private_key(public_exponent=65537, key_size=2048)
        self.чужой = rsa.generate_private_key(public_exponent=65537, key_size=2048)
        ч = self.закрытый.public_key().public_numbers()
        self.jwks = [{'kid': 'k1', 'kty': 'RSA', 'alg': 'RS256', 'use': 'sig',
                      'n': _b64(ч.n.to_bytes((ч.n.bit_length() + 7) // 8, 'big')), 'e': _b64(ч.e.to_bytes(3, 'big'))}]

    def токен(self, **над) -> str:
        from cryptography.hazmat.primitives import hashes
        from cryptography.hazmat.primitives.asymmetric import padding

        ключ = над.pop('ключ', self.закрытый)
        голова = {'alg': над.pop('alg', 'RS256'), 'kid': над.pop('kid', 'k1'), 'typ': 'JWT'}
        тело = {'iss': 'https://accounts.google.com', 'aud': КЛИЕНТ_GOOGLE, 'sub': '1100220033', 'email': 'Brat@Gmail.com',
                'email_verified': True, 'iat': СЕЙЧАС // 1000 - 10, 'exp': СЕЙЧАС // 1000 + 3600, 'name': 'Имя', 'picture': 'x'}
        тело.update(над)
        тело = {к: з for к, з in тело.items() if з is not None}
        начало = _b64(json.dumps(голова).encode()) + '.' + _b64(json.dumps(тело).encode())
        подпись = ключ.sign(начало.encode(), padding.PKCS1v15(), hashes.SHA256())
        return начало + '.' + _b64(подпись)


@pytest.fixture(scope='module')
def ключи() -> Ключи:
    return Ключи()


# ───────────── без базы: проверка токена ─────────────
def test_id_token(ключи):
    п = dict(издатели=account.ИЗДАТЕЛИ['google'], аудитория=КЛИЕНТ_GOOGLE, сейчас_с=СЕЙЧАС / 1000)
    assert account.проверить_id_token(ключи.токен(), ключи.jwks, **п) == {'sub': '1100220033', 'email': 'brat@gmail.com'}
    # Строка 'true' (как у Apple) — тоже подтверждённая почта; aud списком — можно.
    assert account.проверить_id_token(ключи.токен(email_verified='true', aud=[КЛИЕНТ_GOOGLE, 'x']), ключи.jwks, **п)['sub']
    плохие = {
        'signature': ключи.токен(ключ=ключи.чужой),
        'aud': ключи.токен(aud='другой.apps.googleusercontent.com'),
        'iss': ключи.токен(iss='https://evil.example'),
        'exp': ключи.токен(exp=СЕЙЧАС // 1000 - 120),
        'iat': ключи.токен(iat=СЕЙЧАС // 1000 + 3600),
        'email_verified': ключи.токен(email_verified=False),
        'kid': ключи.токен(kid='нет'),
        'alg': ключи.токен(alg='none'),
        'email': ключи.токен(email=None),
        'sub': ключи.токен(sub=''),
    }
    for код, т in плохие.items():
        with pytest.raises(account.ОшибкаТокена) as е:
            account.проверить_id_token(т, ключи.jwks, **п)
        assert е.value.код == код, (код, е.value.код)
    # Подменили тело при той же подписи.
    голова, тело, подпись = ключи.токен().split('.')
    чужое = _b64(json.dumps({**json.loads(base64.urlsafe_b64decode(тело + '==')), 'email': 'owner@example.org'}).encode())
    with pytest.raises(account.ОшибкаТокена):
        account.проверить_id_token(f'{голова}.{чужое}.{подпись}', ключи.jwks, **п)
    for мусор in (None, 5, '', 'a.b', 'a.b.c', 'x' * 9000):
        with pytest.raises(account.ОшибкаТокена):
            account.проверить_id_token(мусор, ключи.jwks, **п)
    # Пустой client ID — ничего не принимаем.
    with pytest.raises(account.ОшибкаТокена):
        account.проверить_id_token(ключи.токен(), ключи.jwks, издатели=account.ИЗДАТЕЛИ['google'], аудитория='', сейчас_с=СЕЙЧАС / 1000)


def test_адрес_ключей_только_из_списка():
    with pytest.raises(ValueError):
        account.скачать_ключи('https://evil.example/keys')


# ───────────── на базе ─────────────
class Часы:
    def __init__(self, мс: int) -> None:
        self.мс = мс

    def __call__(self) -> float:
        return self.мс / 1000


@pytest.fixture
def среда(pg_адрес, ключи):
    from db import Хранилище

    х = Хранилище(pg_адрес)
    х.применить_миграции()
    часы = Часы(СЕЙЧАС)
    письма: list[tuple[str, str, str]] = []
    скачано: list[str] = []

    def отправить(почта, тема, текст):
        письма.append((почта, тема, текст))
        return True

    def ключи_провайдера(провайдер):
        скачано.append(провайдер)
        return ключи.jwks

    app = FastAPI()
    ключ = lambda запрос: 'ip:тест'  # noqa: E731
    админы = admin.ХранилищеАдминов(х)
    админы.обеспечить_владельцев([ВЛАДЕЛЕЦ])
    admin.register(app, админы=админы, хранилище=х, статистика=None, отправить_код=lambda п, к: True, секрет='с',
                   ключ_лимита=ключ, владельцы=frozenset({ВЛАДЕЛЕЦ}), часы=часы, безопасная_кука=False)
    account.register(app, аккаунты=account.ХранилищеАккаунтов(х), хранилище=х, отправить_письмо=отправить, секрет='с',
                     ключ_лимита=ключ, google_client_id=КЛИЕНТ_GOOGLE, ключи_провайдера=ключи_провайдера,
                     мост_админки=админы.создать_сеанс_для_почты, роль_по_почте=админы.роль_по_почте, часы=часы,
                     безопасная_кука=False)
    return {'app': app, 'х': х, 'часы': часы, 'письма': письма, 'скачано': скачано, 'админы': админы}


def клиент(с) -> TestClient:
    return TestClient(с['app'], base_url='http://aiustaz.pro')


def код_из(письма, почта) -> str:
    текст = [т for п, _, т in письма if п == почта][-1]
    return текст.split('Код входа: ')[1][:4]


def войти(к, с, почта='brat@example.org', возраст=True):
    assert к.post('/api/account/start', json={'email': почта}, headers=СВОЙ).status_code == 200
    р = к.post('/api/account/verify', json={'email': почта, 'code': код_из(с['письма'], почта), 'age16': возраст}, headers=СВОЙ)
    return р


def test_вход_по_коду(среда):
    к = клиент(среда)
    assert к.get('/api/account/me').status_code == 401
    assert к.get('/api/account/config').json() == {'google_client_id': КЛИЕНТ_GOOGLE, 'apple_services_id': None,
                                                     'apple_redirect': None, 'код': 4}
    # Плохая почта, чужой сайт, без заголовка.
    assert к.post('/api/account/start', json={'email': 'нет'}, headers=СВОЙ).json() == {'ошибка': 'email'}
    assert к.post('/api/account/start', json={'email': 'a@b.kz'}, headers={'origin': 'https://evil.example', 'x-aiustaz-account': '1'}).status_code == 403
    assert к.post('/api/account/start', json={'email': 'a@b.kz'}, headers={'origin': 'https://aiustaz.pro'}).status_code == 403
    # Письмо: «Код входа: 1234», 4 цифры; в базе — только HMAC.
    assert к.post('/api/account/start', json={'email': ' Brat@Example.org '}, headers=СВОЙ).json() == {'ок': True}
    почта, тема, текст = среда['письма'][-1]
    код = код_из(среда['письма'], 'brat@example.org')
    assert почта == 'brat@example.org' and 'Код входа: ' + код in текст and код.isdigit() and len(код) == 4
    with среда['х'].соединение() as с:
        assert код not in str(с.execute('SELECT code_hash FROM account_codes').fetchall())
    # Код админки к аккаунту не подходит (своя область HMAC).
    assert account.ХранилищеАккаунтов(среда['х']).проверить_код('brat@example.org', admin.хэш_кода('с', 'brat@example.org', код), СЕЙЧАС) is False
    # Без 16+ новый аккаунт не создаётся (код при этом использован — нужен новый).
    assert к.post('/api/account/verify', json={'email': 'brat@example.org', 'code': код_из(среда['письма'], 'brat@example.org')},
                  headers=СВОЙ).status_code in (400,)
    р = войти(к, среда, возраст=False)
    assert р.json() == {'ошибка': 'age'}
    р = войти(к, среда)
    assert р.status_code == 200, р.text
    кука = р.headers['set-cookie']
    assert 'aiustaz_account=' in кука and 'HttpOnly' in кука and 'Path=/api/account' in кука and 'samesite=lax' in кука.lower()
    assert р.json()['я'] == {'email': 'brat@example.org', 'создан': р.json()['я']['создан'], 'способы': ['email'], 'роль': None, 'закят': False}
    assert к.get('/api/account/me').json()['email'] == 'brat@example.org'
    # Повторный вход того же человека — без 16+ можно (аккаунт уже есть).
    к2 = клиент(среда)
    assert войти(к2, среда, возраст=False).status_code == 200
    with среда['х'].соединение() as с:
        assert с.execute('SELECT count(*) FROM account_users').fetchone()[0] == 1
        токен = к.cookies.get('aiustaz_account')
        assert токен not in str(с.execute('SELECT id FROM account_sessions').fetchall())


def test_попытки_срок_лимиты(среда):
    к = клиент(среда)
    к.post('/api/account/start', json={'email': 'a@example.org'}, headers=СВОЙ)
    код = код_из(среда['письма'], 'a@example.org')
    неверный = '0000' if код != '0000' else '1111'
    for _ in range(5):
        assert к.post('/api/account/verify', json={'email': 'a@example.org', 'code': неверный, 'age16': True}, headers=СВОЙ).status_code == 400
    # После 5 неверных код сгорел.
    assert к.post('/api/account/verify', json={'email': 'a@example.org', 'code': код, 'age16': True}, headers=СВОЙ).status_code == 400
    # Срок — 10 минут.
    к.post('/api/account/start', json={'email': 'a@example.org'}, headers=СВОЙ)
    код = код_из(среда['письма'], 'a@example.org')
    среда['часы'].мс += 11 * 60_000
    assert к.post('/api/account/verify', json={'email': 'a@example.org', 'code': код, 'age16': True}, headers=СВОЙ).status_code == 400
    # Неверный вид кода.
    for плохой in ('123', '12345', 'abcd', 1234, None):
        assert к.post('/api/account/verify', json={'email': 'a@example.org', 'code': плохой, 'age16': True}, headers=СВОЙ).json() == {'ошибка': 'code'}
    # 5 кодов в час на почту (2 уже), потом 429; через час — снова.
    итоги = [к.post('/api/account/start', json={'email': 'a@example.org'}, headers=СВОЙ).status_code for _ in range(4)]
    assert итоги == [200, 200, 200, 429]
    среда['часы'].мс += 61 * 60_000
    assert к.post('/api/account/start', json={'email': 'a@example.org'}, headers=СВОЙ).status_code == 200
    # 20 в час с одного IP (хэш).
    среда['часы'].мс += 61 * 60_000
    итоги = [к.post('/api/account/start', json={'email': f'u{и}@example.org'}, headers=СВОЙ).status_code for и in range(21)]
    assert итоги == [200] * 20 + [429]


def test_сеансы_и_выход(среда):
    а, б = клиент(среда), клиент(среда)
    assert войти(а, среда).status_code == 200
    assert войти(б, среда).status_code == 200
    с = а.get('/api/account/sessions').json()['сеансы']
    assert len(с) == 2 and sum(з['этот'] for з in с) == 1 and all(з['способ'] == 'email' for з in с)
    чужой = next(з for з in с if not з['этот'])
    assert а.post('/api/account/sessions/revoke', json={'id': чужой['id']}, headers=СВОЙ).json() == {'ок': True}
    assert б.get('/api/account/me').status_code == 401
    assert войти(б, среда).status_code == 200
    # «Выйти на всех устройствах».
    assert а.post('/api/account/logout-all', headers=СВОЙ).json() == {'ок': True, 'закрыто': 2}
    assert а.get('/api/account/me').status_code == 401 and б.get('/api/account/me').status_code == 401
    # Обычный выход.
    assert войти(а, среда).status_code == 200
    токен = а.cookies.get('aiustaz_account')
    assert а.post('/api/account/logout', headers=СВОЙ).status_code == 200
    а.cookies.set('aiustaz_account', токен)
    assert а.get('/api/account/me').status_code == 401
    # Без активности 60 дней — сеанс закончился.
    assert войти(б, среда).status_code == 200
    среда['часы'].мс += 61 * 86_400_000
    assert б.get('/api/account/me').status_code == 401


def test_синхронизация(среда):
    а, б = клиент(среда), клиент(среда)
    войти(а, среда)
    войти(б, среда)
    assert а.get('/api/account/sync').json() == {'docs': {}, 'закят': False}
    # Устройство А пишет прогресс (база 0).
    р = а.put('/api/account/sync', json={'docs': {'progress': {'base': 0, 'data': {'уроки': {'1': 1}}}}}, headers=СВОЙ).json()
    assert р['docs']['progress']['v'] == 1 and р['conflicts'] == {}
    # Устройство Б тоже думает, что документа нет, — конфликт и текущая версия.
    р = б.put('/api/account/sync', json={'docs': {'progress': {'base': 0, 'data': {'уроки': {'2': 1}}}}}, headers=СВОЙ).json()
    assert р['docs'] == {} and р['conflicts']['progress']['v'] == 1 and р['conflicts']['progress']['data'] == {'уроки': {'1': 1}}
    # Б слил и пишет поверх версии 1.
    р = б.put('/api/account/sync', json={'docs': {'progress': {'base': 1, 'data': {'уроки': {'1': 1, '2': 1}}}}}, headers=СВОЙ).json()
    assert р['docs']['progress']['v'] == 2
    # А видит версию 2.
    assert а.get('/api/account/sync').json()['docs']['progress']['data'] == {'уроки': {'1': 1, '2': 1}}
    # Старая версия — конфликт.
    assert 'progress' in а.put('/api/account/sync', json={'docs': {'progress': {'base': 1, 'data': {}}}}, headers=СВОЙ).json()['conflicts']
    # Чужие ключи, поля и размеры.
    for плохое in ({'docs': {'chat': {'base': 0, 'data': {}}}}, {'docs': {'progress': {'base': -1, 'data': {}}}},
                   {'docs': {'progress': {'base': 0, 'data': []}}}, {'docs': {'progress': {'base': 0}}}, {'docs': {}},
                   {'docs': {'progress': {'base': True, 'data': {}}}}, {'docs': {'progress': {'base': 0, 'data': {}, 'x': 1}}}):
        assert а.put('/api/account/sync', json=плохое, headers=СВОЙ).status_code == 400, плохое
    assert а.put('/api/account/sync', json={'docs': {'quran': {'base': 0, 'data': {'x': 'я' * 40000}}}}, headers=СВОЙ).status_code == 413
    assert а.put('/api/account/sync', json={'docs': {'quran': {'base': 0, 'data': {}}}}, headers={'origin': 'https://aiustaz.pro'}).status_code == 403
    # Без входа — 401.
    assert клиент(среда).get('/api/account/sync').status_code == 401


def test_закят_только_с_выключателем(среда):
    а = клиент(среда)
    войти(а, среда)
    р = а.put('/api/account/sync', json={'docs': {'zakat': {'base': 0, 'data': {'сумма': 1000}}}}, headers=СВОЙ).json()
    assert р == {'docs': {}, 'conflicts': {'zakat': None}}
    assert а.post('/api/account/settings', json={'zakat': True}, headers=СВОЙ).json() == {'ок': True, 'закят': True}
    assert а.get('/api/account/me').json()['закят'] is True
    assert а.put('/api/account/sync', json={'docs': {'zakat': {'base': 0, 'data': {'сумма': 1000}}}}, headers=СВОЙ).json()['docs']['zakat']['v'] == 1
    # Выключили — суммы закята на сервере удалены сразу.
    а.post('/api/account/settings', json={'zakat': False}, headers=СВОЙ)
    assert 'zakat' not in а.get('/api/account/sync').json()['docs']
    assert а.post('/api/account/settings', json={'zakat': 'да'}, headers=СВОЙ).status_code == 400


def test_выгрузка_и_удаление(среда):
    а, б = клиент(среда), клиент(среда)
    войти(а, среда)
    войти(б, среда)
    а.put('/api/account/sync', json={'docs': {'settings': {'base': 0, 'data': {'тема': ['тёмная', 5]}}}}, headers=СВОЙ)
    assert а.get('/api/account/export').status_code == 403  # только с заголовком (fetch приложения)
    р = а.get('/api/account/export', headers=СВОЙ)
    assert 'attachment' in р.headers['content-disposition']
    д = р.json()
    assert д['аккаунт']['email'] == 'brat@example.org' and д['документы']['settings']['данные'] == {'тема': ['тёмная', 5]}
    assert len(д['сеансы']) == 2 and 'Казахстан' in д['гдеХранится']
    assert а.post('/api/account/delete', json={}, headers=СВОЙ).json() == {'ошибка': 'confirm'}
    assert а.post('/api/account/delete', json={'confirm': True}, headers=СВОЙ).json() == {'ок': True}
    assert б.get('/api/account/me').status_code == 401
    with среда['х'].соединение() as с:
        for т in ('account_users', 'account_sessions', 'account_docs', 'account_codes'):
            assert с.execute(f'SELECT count(*) FROM {т}').fetchone()[0] == 0, т
    # Новый вход той же почтой — новый пустой аккаунт.
    войти(а, среда)
    assert а.get('/api/account/sync').json()['docs'] == {}


def test_google(среда, ключи):
    к = клиент(среда)
    assert к.post('/api/account/google', json={'credential': ключи.токен(), 'age16': False}, headers=СВОЙ).json() == {'ошибка': 'age'}
    р = к.post('/api/account/google', json={'credential': ключи.токен(), 'age16': True}, headers=СВОЙ)
    assert р.status_code == 200, р.text
    assert р.json()['я']['email'] == 'brat@gmail.com' and р.json()['я']['способы'] == ['email', 'google']
    # Имя и фото из Google не хранятся.
    with среда['х'].соединение() as с:
        строка = str(с.execute('SELECT * FROM account_users').fetchall())
    assert 'Имя' not in строка and "'x'" not in строка
    # Ключи скачаны один раз и лежат в кэше.
    к.post('/api/account/google', json={'credential': ключи.токен(), 'age16': True}, headers=СВОЙ)
    assert среда['скачано'] == ['google']
    # Плохие токены — 400 token.
    for плохой in (ключи.токен(aud='x'), ключи.токен(ключ=ключи.чужой), ключи.токен(email_verified=False),
                   ключи.токен(exp=СЕЙЧАС // 1000 - 3600), 'мусор'):
        assert к.post('/api/account/google', json={'credential': плохой, 'age16': True}, headers=СВОЙ).json() == {'ошибка': 'token'}
    # Та же почта по коду — тот же аккаунт.
    к2 = клиент(среда)
    войти(к2, среда, почта='brat@gmail.com', возраст=False)
    assert к2.get('/api/account/me').json()['способы'] == ['email', 'google']
    with среда['х'].соединение() as с:
        assert с.execute('SELECT count(*) FROM account_users').fetchone()[0] == 1
    # Сначала код, потом Google той же почтой — Google привязывается к аккаунту.
    к3 = клиент(среда)
    войти(к3, среда, почта='other@gmail.com')
    р = к3.post('/api/account/google', json={'credential': ключи.токен(sub='999', email='other@gmail.com'), 'age16': False}, headers=СВОЙ)
    assert р.json()['я']['способы'] == ['email', 'google']
    # Apple не настроен — 503.
    assert к.post('/api/account/apple', json={'id_token': 'x', 'age16': True}, headers=СВОЙ).json() == {'ошибка': 'apple'}


def test_google_не_настроен(pg_адрес):
    from db import Хранилище

    х = Хранилище(pg_адрес)
    х.применить_миграции()
    app = FastAPI()
    account.register(app, аккаунты=account.ХранилищеАккаунтов(х), хранилище=х, отправить_письмо=lambda *а: True,
                     секрет='с', ключ_лимита=lambda з: 'ip', безопасная_кука=False)
    к = TestClient(app, base_url='http://aiustaz.pro')
    assert к.get('/api/account/config').json()['google_client_id'] is None
    assert к.post('/api/account/google', json={'credential': 'x', 'age16': True}, headers=СВОЙ).json() == {'ошибка': 'google'}
    assert к.post('/api/account/admin', headers=СВОЙ).status_code == 401


def test_мост_в_админку(среда):
    а = клиент(среда)
    войти(а, среда)
    assert а.post('/api/account/admin', headers=СВОЙ).json() == {'ошибка': 'role'}
    assert а.get('/api/account/me').json()['роль'] is None
    # Владелец входит в аккаунт приложения — роль видна, админка открывается без второго кода.
    в = клиент(среда)
    войти(в, среда, почта=ВЛАДЕЛЕЦ)
    assert в.get('/api/account/me').json()['роль'] == 'owner'
    assert в.post('/api/account/admin', headers={'origin': 'https://aiustaz.pro'}).status_code == 403
    р = в.post('/api/account/admin', headers=СВОЙ)
    assert р.json() == {'ок': True, 'адрес': '/admin/'}
    кука = р.headers['set-cookie']
    assert 'aiustaz_admin=' in кука and 'Path=/api/admin' in кука and 'samesite=strict' in кука.lower() and 'HttpOnly' in кука
    assert в.get('/api/admin/me').json()['роль'] == 'owner'
    assert 'вход через аккаунт приложения' in [з['действие'] for з in среда['админы'].журнал()]
    # Отключённый админ — нельзя.
    ид = среда['админы'].добавить('viewer@example.org', 'viewer', '', None)
    среда['админы'].изменить(ид, None, None, True)
    п = клиент(среда)
    войти(п, среда, почта='viewer@example.org')
    assert п.get('/api/account/me').json()['роль'] is None
    assert п.post('/api/account/admin', headers=СВОЙ).status_code == 403


def test_уборка(среда):
    а = клиент(среда)
    войти(а, среда)
    а.post('/api/account/logout', headers=СВОЙ)
    х = account.ХранилищеАккаунтов(среда['х'])
    итог = х.убрать_старое(СЕЙЧАС + 40 * 86_400_000)
    assert итог == {'коды': 1, 'сеансы': 1}
