"""Тестовый сервер для scripts/e2e-account.mjs: настоящие server/account.py и server/admin.py на ВРЕМЕННОЙ базе.

Владелец 28.11.2026: «создай вход… прогресс сохраняется… с другого устройства»; «Google авторизация». Прод-данные не
трогает (CLAUDE.md): база mugalim_test_* создаётся на сервере из MUGALIM_TEST_PG и удаляется при выходе.
Письма не отправляются: код отдаёт GET /__test/code?email= (только здесь). Google — свои тестовые ключи RSA:
GET /__test/google-token?email=&sub= выдаёт подписанный ими ID token (aud — тестовый client ID), а сервер проверяет его
теми же ключами (ключи_провайдера). Отдаёт /api/account/…, /api/admin/…, /admin/ (server/admin_static).
Запуск: MUGALIM_TEST_PG=postgresql://postgres@127.0.0.1:55432/postgres python3 app/scripts/e2e-account-server.py <порт>
"""
from __future__ import annotations

import atexit
import base64
import json
import os
import pathlib
import secrets
import sys
import time

КОРЕНЬ = pathlib.Path(__file__).resolve().parent.parent.parent
sys.path.insert(0, str(КОРЕНЬ / 'server'))

import psycopg  # noqa: E402
import uvicorn  # noqa: E402
from cryptography.hazmat.primitives import hashes  # noqa: E402
from cryptography.hazmat.primitives.asymmetric import padding, rsa  # noqa: E402
from fastapi import FastAPI, Request  # noqa: E402
from fastapi.responses import JSONResponse, PlainTextResponse  # noqa: E402
from fastapi.staticfiles import StaticFiles  # noqa: E402
from psycopg.conninfo import conninfo_to_dict, make_conninfo  # noqa: E402

import account  # noqa: E402
import admin  # noqa: E402
from db import Хранилище  # noqa: E402

ВЛАДЕЛЕЦ = 'owner@example.org'
КЛИЕНТ_GOOGLE = '0000-e2e.apps.googleusercontent.com'


def временная_база() -> str:
    сервер = os.environ.get('MUGALIM_TEST_PG', '').strip()
    if not сервер:
        sys.exit('нужен MUGALIM_TEST_PG (временный PostgreSQL), прод-базу не трогаем')
    имя = 'mugalim_test_' + secrets.token_hex(4)
    with psycopg.connect(сервер, autocommit=True) as с:
        с.execute(f'CREATE DATABASE {имя}')

    def убрать() -> None:
        with psycopg.connect(сервер, autocommit=True) as с:
            с.execute(f'DROP DATABASE IF EXISTS {имя} WITH (FORCE)')

    atexit.register(убрать)
    ч = conninfo_to_dict(сервер)
    ч['dbname'] = имя
    return make_conninfo(**ч)


def _b64(б: bytes) -> str:
    return base64.urlsafe_b64encode(б).rstrip(b'=').decode()


def main() -> None:
    порт = int(sys.argv[1]) if len(sys.argv) > 1 else 8099
    х = Хранилище(временная_база())
    х.применить_миграции()
    ключ_rsa = rsa.generate_private_key(public_exponent=65537, key_size=2048)
    ч = ключ_rsa.public_key().public_numbers()
    jwks = [{'kid': 'e2e', 'kty': 'RSA', 'alg': 'RS256', 'n': _b64(ч.n.to_bytes((ч.n.bit_length() + 7) // 8, 'big')),
             'e': _b64(ч.e.to_bytes(3, 'big'))}]
    письма: list[tuple[str, str]] = []

    def отправить(почта: str, тема: str, текст: str) -> bool:
        письма.append((почта, текст.split('Код входа: ')[1][:4] if 'Код входа: ' in текст else ''))
        return True

    app = FastAPI()
    ключ = lambda запрос: 'ip:e2e:' + (запрос.headers.get('x-e2e-ip') or '-')  # noqa: E731
    источники = 'https://aiustaz.pro'
    админы = admin.ХранилищеАдминов(х)
    админы.обеспечить_владельцев([ВЛАДЕЛЕЦ])
    admin.register(app, админы=админы, хранилище=х, статистика=None, отправить_код=lambda п, к: True, секрет='e2e-секрет',
                   ключ_лимита=ключ, владельцы=frozenset({ВЛАДЕЛЕЦ}), источники=источники)
    account.register(app, аккаунты=account.ХранилищеАккаунтов(х), хранилище=х, отправить_письмо=отправить,
                     секрет='e2e-секрет', ключ_лимита=ключ, google_client_id=КЛИЕНТ_GOOGLE,
                     ключи_провайдера=lambda провайдер: jwks, мост_админки=админы.создать_сеанс_для_почты,
                     роль_по_почте=админы.роль_по_почте, источники=источники)

    @app.get('/__test/code')
    async def код(email: str):
        return PlainTextResponse(next((к for п, к in reversed(письма) if п == email.strip().lower()), ''))

    @app.get('/__test/google-token')
    async def токен(email: str, sub: str = '777000111'):
        сейчас = int(time.time())
        голова = _b64(json.dumps({'alg': 'RS256', 'kid': 'e2e', 'typ': 'JWT'}).encode())
        тело = _b64(json.dumps({'iss': 'https://accounts.google.com', 'aud': КЛИЕНТ_GOOGLE, 'sub': sub, 'email': email,
                                'email_verified': True, 'iat': сейчас, 'exp': сейчас + 600, 'name': 'Тест'}).encode())
        подпись = ключ_rsa.sign(f'{голова}.{тело}'.encode(), padding.PKCS1v15(), hashes.SHA256())
        return PlainTextResponse(f'{голова}.{тело}.{_b64(подпись)}')

    @app.get('/__test/state')
    async def состояние(email: str):
        а = account.ХранилищеАккаунтов(х)
        п = а.по_почте(email.strip().lower())
        return JSONResponse({'есть': bool(п), 'документы': а.документы(п['id']) if п else {}})

    @app.get('/__test/health')
    async def здоровье(запрос: Request):
        return {'ок': True}

    папка = КОРЕНЬ / 'server' / 'admin_static'
    if папка.is_dir():
        app.mount('/admin', StaticFiles(directory=папка, html=True), name='admin')
    print(f'e2e-account: http://127.0.0.1:{порт}', flush=True)
    uvicorn.run(app, host='127.0.0.1', port=порт, log_level='warning')


if __name__ == '__main__':
    main()
