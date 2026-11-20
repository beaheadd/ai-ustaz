"""API уведомлений (server/app.py) на подставном хранилище: подписка, отписка, проверка, лимиты, Origin, размер."""
from __future__ import annotations

import json

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient

import push
from app import register
from conftest import АДРЕС_FCM, СЕЙЧАС, пункт, тело

СВОЙ = {'Origin': 'https://aiustaz.pro'}


@pytest.fixture
def мир(хранилище):
    отправлено = []
    коды = {'код': 201}

    def отправить(подписка, данные, ttl, срочность):
        отправлено.append((подписка['хэш'], данные, ttl, срочность))
        return коды['код']

    app = FastAPI()
    register(app, хранилище=хранилище, публичный_ключ='BPUBLIC', отправить=отправить, часы=lambda: СЕЙЧАС / 1000)
    return TestClient(app), хранилище, отправлено, коды


def test_ключ(мир):
    клиент, *_ = мир
    о = клиент.get('/api/push/key')
    assert о.status_code == 200 and о.json() == {'key': 'BPUBLIC'}
    assert клиент.get('/api/push/health').json() == {'ок': True, 'ключ': True}


def test_подписка_и_замена_расписания(мир):
    клиент, хранилище, *_ = мир
    о = клиент.post('/api/push/subscribe', json=тело(), headers=СВОЙ)
    assert о.status_code == 200, о.text
    assert о.json()['пунктов'] == 1 and о.headers['cache-control'] == 'no-store'
    хэш = push.хэш_адреса(АДРЕС_FCM)
    assert хранилище.подписки[хэш]['город'] == 'Алматы'
    # Смена города и намазов — расписание заменяется целиком
    о = клиент.post('/api/push/subscribe', json=тело([пункт('2026-11-21', '15:20'), пункт('2026-11-21', '17:30', 'maghrib')], город='Астана', язык='kk'), headers=СВОЙ)
    assert о.status_code == 200 and о.json()['пунктов'] == 2
    п = хранилище.подписки[хэш]
    assert п['город'] == 'Астана' and п['язык'] == 'kk' and len(хранилище.пункты[хэш]) == 2
    # В журнале — только хэш адреса, адреса целиком нет
    assert all(АДРЕС_FCM not in json.dumps(з, ensure_ascii=False) for з in хранилище.журнал)


def test_ошибки_проверки(мир):
    клиент, хранилище, *_ = мир
    д = тело()
    д['lat'] = 43.2
    о = клиент.post('/api/push/subscribe', json=д, headers=СВОЙ)
    assert о.status_code == 400 and о.json() == {'ошибка': 'fields'}
    о = клиент.post('/api/push/subscribe', json=тело(адрес='https://evil.kz/x'), headers=СВОЙ)
    assert о.status_code == 400 and о.json() == {'ошибка': 'endpoint'} and 'evil' not in о.text
    о = клиент.post('/api/push/subscribe', content=b'{', headers={**СВОЙ, 'Content-Type': 'application/json'})
    assert о.status_code == 400 and о.json() == {'ошибка': 'json'}
    assert not хранилище.подписки


def test_чужой_origin_и_размер(мир):
    клиент, *_ = мир
    о = клиент.post('/api/push/subscribe', json=тело(), headers={'Origin': 'https://batr.kz'})
    assert о.status_code == 403
    о = клиент.post('/api/push/subscribe', content=b'{"a":"' + b'x' * 70_000 + b'"}', headers={**СВОЙ, 'Content-Type': 'application/json'})
    assert о.status_code == 413
    # Без Origin (не браузер) — можно
    assert клиент.post('/api/push/subscribe', json=тело()).status_code == 200


def test_лимит_подписки(мир):
    клиент, *_ = мир
    коды = [клиент.post('/api/push/subscribe', json=тело(), headers={**СВОЙ, 'X-Real-IP': '10.0.0.1'}).status_code for _ in range(11)]
    assert коды[:10] == [200] * 10 and коды[10] == 429
    # Другой IP — свой лимит
    assert клиент.post('/api/push/subscribe', json=тело(), headers={**СВОЙ, 'X-Real-IP': '10.0.0.2'}).status_code == 200


def test_отписка_удаляет_сразу(мир):
    клиент, хранилище, *_ = мир
    клиент.post('/api/push/subscribe', json=тело(), headers=СВОЙ)
    о = клиент.post('/api/push/unsubscribe', json={'endpoint': АДРЕС_FCM}, headers=СВОЙ)
    assert о.status_code == 200 and not хранилище.подписки and not хранилище.пункты
    # повторная отписка — тоже 200 (данных уже нет)
    assert клиент.post('/api/push/unsubscribe', json={'endpoint': АДРЕС_FCM}, headers=СВОЙ).status_code == 200
    assert клиент.post('/api/push/unsubscribe', json={'endpoint': 'http://x'}, headers=СВОЙ).status_code == 400


def test_проверить_уведомление(мир):
    клиент, хранилище, отправлено, коды = мир
    assert клиент.post('/api/push/test', json={'endpoint': АДРЕС_FCM}, headers=СВОЙ).status_code == 404
    клиент.post('/api/push/subscribe', json=тело(), headers=СВОЙ)
    о = клиент.post('/api/push/test', json={'endpoint': АДРЕС_FCM}, headers=СВОЙ)
    assert о.status_code == 200 and len(отправлено) == 1
    _, данные, ttl, срочность = отправлено[0]
    assert данные['kind'] == 'test' and 'Алматы' in данные['body'] and ttl == 120 and срочность == 'high'
    assert клиент.post('/api/push/test', json={'endpoint': АДРЕС_FCM}, headers=СВОЙ).status_code == 200
    assert клиент.post('/api/push/test', json={'endpoint': АДРЕС_FCM}, headers=СВОЙ).status_code == 200
    assert клиент.post('/api/push/test', json={'endpoint': АДРЕС_FCM}, headers=СВОЙ).status_code == 429  # 3 за 10 минут


def test_проверка_410_удаляет(мир):
    клиент, хранилище, отправлено, коды = мир
    клиент.post('/api/push/subscribe', json=тело(), headers=СВОЙ)
    коды['код'] = 410
    assert клиент.post('/api/push/test', json={'endpoint': АДРЕС_FCM}, headers=СВОЙ).status_code == 410
    assert not хранилище.подписки
    клиент.post('/api/push/subscribe', json=тело(), headers=СВОЙ)
    коды['код'] = 0
    assert клиент.post('/api/push/test', json={'endpoint': АДРЕС_FCM}, headers=СВОЙ).status_code == 502


def test_без_ключа_503(хранилище):
    app = FastAPI()
    register(app, хранилище=хранилище, публичный_ключ='', отправить=lambda *_: 0)
    assert TestClient(app).get('/api/push/key').status_code == 503
