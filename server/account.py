"""Аккаунты приложения AI Ustaz: вход по желанию (код из письма или Google), прогресс на всех устройствах.

Владелец 28.11.2026: «Ты лучше создай вход, чтобы кто хочет, мог заходить входом, и у него прогресс сохраняется. И с
другого устройства он также может зайти с сохраненным прогрессом. И тогда ты смело можешь сделать мне вход на мой
аккаунт»; «Создай кнопку входа и привяжи вход через почту, отправляем код. Google авторизация, Apple авторизация»;
«Код четырёхзначный сделай, чтобы было проще, 4 знака». Дизайн — docs/дизайн/13-аккаунт-и-синхронизация.md.

Вход НЕ обязателен: без него приложение работает как раньше (всё — на устройстве). Аккаунт — только для 16+ (CLAUDE.md:
v1 — 16+): создать его можно лишь с отметкой «Мне 16 лет или больше».
Способы входа:
  • почта → 4-значный код письмом (тот же механизм, что у админки, admin.py: HMAC кода, 10 минут, 5 попыток, сравнение
    за постоянное время; не больше 5 кодов в час на почту и 20 в час с IP по хэшу; SMTP 127.0.0.1:25);
  • Google (Google Identity Services): приложение присылает ID token; проверяем подпись RS256 по открытым ключам Google
    (кэш в account_jwks), aud = MUGALIM_GOOGLE_CLIENT_ID, iss, exp, email_verified. Берём только email и sub;
  • Apple (Sign in with Apple JS) — только при MUGALIM_APPLE_SERVICES_ID (у владельца пока нет Apple Developer —
    владелец 28.11.2026: «пока без него»): та же проверка по ключам Apple, aud = Services ID.
  Аккаунт с той же почтой — один: код по почте и Google ведут в один аккаунт (sub привязывается к почте).
Сеанс: случайный токен в cookie aiustaz_account (HttpOnly; Secure; SameSite=Lax; Path=/api/account), в базе — sha256
  токена; 180 дней, без активности 60 дней — заканчивается. Изменения — только с заголовком X-Aiustaz-Account: 1 и своим
  Origin. «Выйти на всех устройствах» — отзывает все сеансы.
Синхронизация: документы по ключу (progress, dhikr, quran, settings, zakat) с версией. Сервер не сливает — он хранит и
  сравнивает версию (запись только поверх той версии, которую видел клиент); сливает приложение (app/src/account/merge.ts,
  чистые функции с тестами) и повторяет запись. Суммы закята (zakat) — только если включено «Сохранять суммы закята в
  аккаунте» (выкл. по умолчанию; выключили — документ удаляется сразу).
Админка: если почта аккаунта — админ (admin_users, не отключён), /me отдаёт роль, а POST /api/account/admin открывает
  сеанс админки без второго кода (cookie aiustaz_admin, Path=/api/admin, как при обычном входе; журнал admin_audit —
  «вход через аккаунт приложения»).
Не храним: имя и фото из Google, IP (только хэш для лимитов), строку браузера (только класс устройства), историю чата,
  голос, фото, id статистики. «Удалить аккаунт» удаляет пользователя, сеансы и документы сразу; «Скачать мои данные» — JSON.

Контракт API (JSON; ошибки — {ошибка: '<код>'}; все ответы no-store):
  GET  /api/account/config                         -> {google_client_id | null, apple_services_id | null, apple_redirect | null, код: 4}
  POST /api/account/start   {email}                -> {ок}             (400 email, 429 rate, 503 mail/no_secret)
  POST /api/account/verify  {email, code, age16}   -> {ок, я} + cookie (400 code; 400 age — новый аккаунт без 16+)
  POST /api/account/google  {credential, age16}    -> {ок, я} + cookie (400 token, 400 age, 503 google — не настроен)
  POST /api/account/apple   {id_token, age16}      -> {ок, я} + cookie (только при MUGALIM_APPLE_SERVICES_ID)
  GET  /api/account/me                             -> я: {email, создан, способы, роль, закят}   (401 login)
  POST /api/account/logout                         -> {ок}
  POST /api/account/logout-all                     -> {ок, закрыто}
  GET  /api/account/sessions                       -> {сеансы: [{id, создан, был, устройство, способ, этот}]}
  POST /api/account/sessions/revoke {id}           -> {ок}
  POST /api/account/settings {zakat: bool}         -> {ок, закят}
  GET  /api/account/sync                           -> {docs: {ключ: {v, at, data}}, закят}
  PUT  /api/account/sync    {docs: {ключ: {base, data}}} -> {docs: {ключ: {v, at}}, conflicts: {ключ: {v, at, data} | null}}
  GET  /api/account/export                         -> JSON-файл «мои данные» (Content-Disposition: attachment)
  POST /api/account/delete  {confirm: true}        -> {ок}  — аккаунт и все данные удалены сразу, cookie снята
  POST /api/account/admin                          -> {ок, адрес: '/admin/'} + cookie aiustaz_admin (403 role)

Контракт модуля:
  проверить_id_token(токен, ключи, *, издатели, аудитория, сейчас_с) -> {sub, email}  (ОшибкаТокена(код))
  скачать_ключи(адрес) -> list[dict]  — JWKS провайдера (прод; тесты подставляют свои ключи)
  ХранилищеАккаунтов(хранилище) — пользователи, коды, сеансы, документы, кэш ключей (поверх db.Хранилище.соединение)
  register(app, *, аккаунты, хранилище, отправить_письмо, секрет, ключ_лимита, google_client_id, apple_services_id,
           apple_redirect, ключи_провайдера, мост_админки, роль_по_почте, часы, источники, безопасная_кука) -> None
"""
from __future__ import annotations

import base64
import hashlib
import hmac
import json
import logging
import re
import secrets
import time
import urllib.request
from datetime import datetime, timezone
from typing import Callable

from fastapi import Request
from fastapi.concurrency import run_in_threadpool
from fastapi.responses import JSONResponse, Response

import admin

журнал = logging.getLogger('mugalim.account')

КУКА = 'aiustaz_account'
ПУТЬ_КУКИ = '/api/account'
СРОК_СЕАНСА_С = 180 * 86400
ПРОСТОЙ_СЕАНСА_С = 60 * 86400
СРОК_КОДА_С = admin.СРОК_КОДА_С
ПОПЫТОК_КОДА = admin.ПОПЫТОК_КОДА
КОДОВ_НА_ПОЧТУ_В_ЧАС = admin.КОДОВ_НА_ПОЧТУ_В_ЧАС
КОДОВ_С_IP_В_ЧАС = admin.КОДОВ_С_IP_В_ЧАС
МАКС_ТЕЛО = 256 * 1024
МАКС_ДОКУМЕНТ = 64 * 1024
КЛЮЧИ = ('progress', 'dhikr', 'quran', 'settings', 'zakat')
СОГЛАСИЕ = 'account-1'          # версия текста согласия (app/src/account/texts — «Что хранится»)
ЗАГОЛОВОК = 'x-aiustaz-account'
СПОСОБЫ = ('email', 'google', 'apple')

АДРЕСА_КЛЮЧЕЙ = {
    'google': 'https://www.googleapis.com/oauth2/v3/certs',
    'apple': 'https://appleid.apple.com/auth/keys',
}
ИЗДАТЕЛИ = {
    'google': frozenset({'accounts.google.com', 'https://accounts.google.com'}),
    'apple': frozenset({'https://appleid.apple.com'}),
}
СРОК_КЛЮЧЕЙ_С = 6 * 3600
ПОВТОР_КЛЮЧЕЙ_С = 300           # неизвестный kid — перекачать ключи не чаще раза в 5 минут


def _вр(мс: int) -> datetime:
    return datetime.fromtimestamp(мс / 1000, tz=timezone.utc)


def _мс(в: datetime | None) -> int | None:
    return int(в.timestamp() * 1000) if в else None


# ───────────────────────── ID token (Google, Apple) ─────────────────────────
class ОшибкаТокена(Exception):
    def __init__(self, код: str) -> None:
        super().__init__(код)
        self.код = код


def _b64(часть: str) -> bytes:
    if not re.fullmatch(r'[A-Za-z0-9_-]*', часть):
        raise ОшибкаТокена('format')
    return base64.urlsafe_b64decode(часть + '=' * (-len(часть) % 4))


def _число(з: str) -> int:
    return int.from_bytes(_b64(з), 'big')


def проверить_id_token(токен: object, ключи: list[dict], *, издатели: frozenset[str], аудитория: str,
                       сейчас_с: float, допуск_с: int = 60) -> dict:
    """Проверка ID token (JWT RS256) без сторонних JWT-библиотек: подпись по открытому ключу (kid), iss, aud, exp, iat,
    email_verified. Возвращает {sub, email} (почта — в нижнем регистре). Ошибка — ОшибкаТокена(код)."""
    from cryptography.exceptions import InvalidSignature
    from cryptography.hazmat.primitives import hashes
    from cryptography.hazmat.primitives.asymmetric import padding, rsa

    if not isinstance(токен, str) or len(токен) > 8192 or токен.count('.') != 2:
        raise ОшибкаТокена('format')
    голова_с, тело_с, подпись_с = токен.split('.')
    try:
        голова = json.loads(_b64(голова_с))
        тело = json.loads(_b64(тело_с))
        подпись = _b64(подпись_с)
    except (ValueError, UnicodeDecodeError) as е:
        raise ОшибкаТокена('format') from е
    if not isinstance(голова, dict) or not isinstance(тело, dict):
        raise ОшибкаТокена('format')
    if голова.get('alg') != 'RS256':
        raise ОшибкаТокена('alg')
    kid = голова.get('kid')
    ключ = next((к for к in ключи if isinstance(к, dict) and к.get('kid') == kid and к.get('kty') == 'RSA'), None)
    if ключ is None:
        raise ОшибкаТокена('kid')
    try:
        открытый = rsa.RSAPublicNumbers(_число(ключ['e']), _число(ключ['n'])).public_key()
        открытый.verify(подпись, f'{голова_с}.{тело_с}'.encode('ascii'), padding.PKCS1v15(), hashes.SHA256())
    except (InvalidSignature, KeyError, ValueError, TypeError) as е:
        raise ОшибкаТокена('signature') from е
    if тело.get('iss') not in издатели:
        raise ОшибкаТокена('iss')
    aud = тело.get('aud')
    if not аудитория or not (aud == аудитория or (isinstance(aud, list) and аудитория in aud)):
        raise ОшибкаТокена('aud')
    exp, iat = тело.get('exp'), тело.get('iat')
    if not isinstance(exp, (int, float)) or isinstance(exp, bool) or exp < сейчас_с - допуск_с:
        raise ОшибкаТокена('exp')
    if isinstance(iat, (int, float)) and not isinstance(iat, bool) and iat > сейчас_с + 300:
        raise ОшибкаТокена('iat')
    # Google — bool; Apple — строка 'true' (или bool).
    if тело.get('email_verified') not in (True, 'true'):
        raise ОшибкаТокена('email_verified')
    почта = admin.норм_почта(тело.get('email'))
    sub = тело.get('sub')
    if not почта:
        raise ОшибкаТокена('email')
    if not isinstance(sub, str) or not 1 <= len(sub) <= 255:
        raise ОшибкаТокена('sub')
    return {'sub': sub, 'email': почта}


def скачать_ключи(адрес: str) -> list[dict]:
    """JWKS провайдера (только https-адреса из АДРЕСА_КЛЮЧЕЙ), ≤ 100 КБ, 10 с."""
    if адрес not in АДРЕСА_КЛЮЧЕЙ.values():
        raise ValueError('адрес ключей не из списка')
    запрос = urllib.request.Request(адрес, headers={'User-Agent': 'aiustaz-server', 'Accept': 'application/json'})
    with urllib.request.urlopen(запрос, timeout=10) as ответ:  # noqa: S310 — адрес из постоянного списка
        сырое = ответ.read(100_001)
    if len(сырое) > 100_000:
        raise ValueError('ключи больше 100 КБ')
    ключи = json.loads(сырое).get('keys')
    if not isinstance(ключи, list) or not ключи:
        raise ValueError('нет ключей')
    return [{к: з for к, з in и.items() if к in ('kid', 'kty', 'alg', 'n', 'e', 'use')} for и in ключи if isinstance(и, dict)]


# ───────────────────────── хранилище ─────────────────────────
class ХранилищеАккаунтов:
    def __init__(self, хранилище) -> None:
        self._х = хранилище

    def _с(self):
        return self._х.соединение()

    _ПОЛЯ = 'id, email, google_sub, apple_sub, created_at, zakat_sync'

    @staticmethod
    def _пользователь(р) -> dict:
        способы = ['email'] + (['google'] if р[2] else []) + (['apple'] if р[3] else [])
        return {'id': р[0], 'email': р[1], 'google': bool(р[2]), 'apple': bool(р[3]), 'создан': _мс(р[4]), 'закят': р[5],
                'способы': способы}

    def по_почте(self, почта: str) -> dict | None:
        with self._с() as с:
            р = с.execute(f'SELECT {self._ПОЛЯ} FROM account_users WHERE email = %s', (почта,)).fetchone()
        return self._пользователь(р) if р else None

    def по_id(self, ид: int) -> dict | None:
        with self._с() as с:
            р = с.execute(f'SELECT {self._ПОЛЯ} FROM account_users WHERE id = %s', (ид,)).fetchone()
        return self._пользователь(р) if р else None

    def войти_или_создать(self, почта: str, *, способ: str, sub: str | None, возраст16: bool) -> dict | None:
        """Найти аккаунт (по sub провайдера, затем по почте; sub привязывается к почте) или создать — только с 16+.
        None — аккаунта нет, а отметки 16+ нет."""
        столбец = {'google': 'google_sub', 'apple': 'apple_sub'}.get(способ)
        with self._с() as с:
            р = None
            if столбец and sub:
                р = с.execute(f'SELECT {self._ПОЛЯ} FROM account_users WHERE {столбец} = %s', (sub,)).fetchone()
            if р is None:
                р = с.execute(f'SELECT {self._ПОЛЯ} FROM account_users WHERE email = %s FOR UPDATE', (почта,)).fetchone()
                if р is not None and столбец and sub:
                    с.execute(f'UPDATE account_users SET {столбец} = %s WHERE id = %s AND {столбец} IS NULL', (sub, р[0]))
                    р = с.execute(f'SELECT {self._ПОЛЯ} FROM account_users WHERE id = %s', (р[0],)).fetchone()
            if р is None:
                if not возраст16:
                    return None
                р = с.execute(
                    f"""INSERT INTO account_users (email, {столбец + ', ' if столбец else ''}age16, consent)
                        VALUES (%s, {'%s, ' if столбец else ''}TRUE, %s)
                        ON CONFLICT (email) DO NOTHING RETURNING {self._ПОЛЯ}""",
                    (почта, sub, СОГЛАСИЕ) if столбец else (почта, СОГЛАСИЕ)).fetchone()
                if р is None:  # одновременно создал другой запрос
                    р = с.execute(f'SELECT {self._ПОЛЯ} FROM account_users WHERE email = %s', (почта,)).fetchone()
            с.execute('UPDATE account_users SET last_at = now() WHERE id = %s', (р[0],))
        return self._пользователь(р)

    def задать_закят(self, ид: int, вкл: bool) -> None:
        with self._с() as с:
            с.execute('UPDATE account_users SET zakat_sync = %s WHERE id = %s', (вкл, ид))
            if not вкл:
                с.execute("DELETE FROM account_docs WHERE user_id = %s AND key = 'zakat'", (ид,))

    def удалить(self, ид: int) -> bool:
        with self._с() as с:
            р = с.execute('DELETE FROM account_users WHERE id = %s RETURNING email', (ид,)).fetchone()
            if р:
                с.execute('DELETE FROM account_codes WHERE email = %s', (р[0],))
        return bool(р)

    # ───────────── коды ─────────────
    def сохранить_код(self, почта: str, хэш: str, сейчас: int) -> None:
        with self._с() as с:
            с.execute('UPDATE account_codes SET used = TRUE WHERE email = %s AND NOT used', (почта,))
            с.execute('INSERT INTO account_codes (email, code_hash, created_at, expires_at) VALUES (%s, %s, %s, %s)',
                      (почта, хэш, _вр(сейчас), _вр(сейчас + СРОК_КОДА_С * 1000)))

    def проверить_код(self, почта: str, хэш: str, сейчас: int) -> bool:
        with self._с() as с:
            р = с.execute(
                """SELECT id, code_hash, attempts FROM account_codes WHERE email = %s AND NOT used AND expires_at > %s
                   ORDER BY created_at DESC LIMIT 1 FOR UPDATE""", (почта, _вр(сейчас))).fetchone()
            if not р:
                return False
            ид, верный, попыток = р
            if попыток >= ПОПЫТОК_КОДА:
                с.execute('UPDATE account_codes SET used = TRUE WHERE id = %s', (ид,))
                return False
            if hmac.compare_digest(верный, хэш):
                с.execute('UPDATE account_codes SET used = TRUE WHERE id = %s', (ид,))
                return True
            с.execute('UPDATE account_codes SET attempts = attempts + 1, used = (attempts + 1 >= %s) WHERE id = %s',
                      (ПОПЫТОК_КОДА, ид))
            return False

    # ───────────── сеансы ─────────────
    def создать_сеанс(self, ид: int, хэш: str, устройство: str, способ: str, сейчас: int) -> None:
        with self._с() as с:
            с.execute(
                """INSERT INTO account_sessions (id, user_id, created_at, last_at, expires_at, device, method)
                   VALUES (%s, %s, %s, %s, %s, %s, %s)""",
                (хэш, ид, _вр(сейчас), _вр(сейчас), _вр(сейчас + СРОК_СЕАНСА_С * 1000), устройство[:40], способ))

    def сеанс(self, хэш: str, сейчас: int) -> dict | None:
        with self._с() as с:
            р = с.execute(
                f"""SELECT s.last_at, u.{', u.'.join(self._ПОЛЯ.split(', '))} FROM account_sessions s
                    JOIN account_users u ON u.id = s.user_id
                    WHERE s.id = %s AND NOT s.revoked AND s.expires_at > %s AND s.last_at > %s""",
                (хэш, _вр(сейчас), _вр(сейчас - ПРОСТОЙ_СЕАНСА_С * 1000))).fetchone()
            if not р:
                return None
            if (сейчас - _мс(р[0])) > 60_000:
                с.execute('UPDATE account_sessions SET last_at = %s WHERE id = %s', (_вр(сейчас), хэш))
        return self._пользователь(р[1:])

    def сеансы(self, ид: int, сейчас: int) -> list[dict]:
        with self._с() as с:
            строки = с.execute(
                """SELECT id, created_at, last_at, device, method FROM account_sessions
                   WHERE user_id = %s AND NOT revoked AND expires_at > %s AND last_at > %s ORDER BY last_at DESC""",
                (ид, _вр(сейчас), _вр(сейчас - ПРОСТОЙ_СЕАНСА_С * 1000))).fetchall()
        return [{'хэш': р[0], 'создан': _мс(р[1]), 'был': _мс(р[2]), 'устройство': р[3], 'способ': р[4]} for р in строки]

    def отозвать(self, ид: int, начало_хэша: str) -> bool:
        if not re.fullmatch(r'[0-9a-f]{16}', начало_хэша or ''):
            return False
        with self._с() as с:
            return с.execute('UPDATE account_sessions SET revoked = TRUE WHERE user_id = %s AND left(id, 16) = %s AND NOT revoked',
                             (ид, начало_хэша)).rowcount > 0

    def отозвать_по_хэшу(self, хэш: str) -> None:
        with self._с() as с:
            с.execute('UPDATE account_sessions SET revoked = TRUE WHERE id = %s', (хэш,))

    def отозвать_все(self, ид: int) -> int:
        with self._с() as с:
            return с.execute('UPDATE account_sessions SET revoked = TRUE WHERE user_id = %s AND NOT revoked', (ид,)).rowcount

    # ───────────── документы ─────────────
    def документы(self, ид: int) -> dict[str, dict]:
        with self._с() as с:
            строки = с.execute('SELECT key, version, updated_at, data FROM account_docs WHERE user_id = %s', (ид,)).fetchall()
        return {р[0]: {'v': р[1], 'at': _мс(р[2]), 'data': р[3]} for р in строки}

    def записать_документ(self, ид: int, ключ: str, база: int, данные: dict, сейчас: int) -> dict | None:
        """Запись только поверх версии база (0 — документа ещё нет). Успех — {v, at}; конфликт — None."""
        сырое = json.dumps(данные, ensure_ascii=False, separators=(',', ':'))
        with self._с() as с:
            if база == 0:
                р = с.execute(
                    """INSERT INTO account_docs (user_id, key, version, updated_at, data) VALUES (%s, %s, 1, %s, %s::jsonb)
                       ON CONFLICT (user_id, key) DO NOTHING RETURNING version""", (ид, ключ, _вр(сейчас), сырое)).fetchone()
            else:
                р = с.execute(
                    """UPDATE account_docs SET version = version + 1, updated_at = %s, data = %s::jsonb
                       WHERE user_id = %s AND key = %s AND version = %s RETURNING version""",
                    (_вр(сейчас), сырое, ид, ключ, база)).fetchone()
        return {'v': р[0], 'at': сейчас} if р else None

    def документ(self, ид: int, ключ: str) -> dict | None:
        return self.документы(ид).get(ключ)

    def выгрузка(self, ид: int, сейчас: int) -> dict:
        п = self.по_id(ид)
        return {
            'формат': 'aiustaz-account-export-1',
            'выгружено': datetime.fromtimestamp(сейчас / 1000, tz=timezone.utc).isoformat(),
            'аккаунт': {'email': п['email'], 'создан': п['создан'], 'способыВхода': п['способы'], 'суммыЗакята': п['закят'],
                        'возраст16': True, 'согласие': СОГЛАСИЕ},
            'документы': {к: {'версия': з['v'], 'изменён': з['at'], 'данные': з['data']} for к, з in self.документы(ид).items()},
            'сеансы': [{'создан': з['создан'], 'был': з['был'], 'устройство': з['устройство'], 'способ': з['способ']}
                       for з in self.сеансы(ид, сейчас)],
            'гдеХранится': 'сервер AI Ustaz в Казахстане',
        }

    # ───────────── ключи провайдеров (кэш) ─────────────
    def ключи_из_кэша(self, провайдер: str) -> tuple[list[dict], int] | None:
        with self._с() as с:
            р = с.execute('SELECT keys, fetched_at FROM account_jwks WHERE provider = %s', (провайдер,)).fetchone()
        return (р[0], _мс(р[1])) if р else None

    def сохранить_ключи(self, провайдер: str, ключи: list[dict], сейчас: int) -> None:
        with self._с() as с:
            с.execute("""INSERT INTO account_jwks (provider, keys, fetched_at) VALUES (%s, %s::jsonb, %s)
                         ON CONFLICT (provider) DO UPDATE SET keys = EXCLUDED.keys, fetched_at = EXCLUDED.fetched_at""",
                      (провайдер, json.dumps(ключи), _вр(сейчас)))

    def убрать_старое(self, сейчас: int) -> dict:
        with self._с() as с:
            коды = с.execute('DELETE FROM account_codes WHERE created_at < %s', (_вр(сейчас - 86_400_000),)).rowcount
            сеансы = с.execute('DELETE FROM account_sessions WHERE expires_at < %s OR last_at < %s OR (revoked AND last_at < %s)',
                               (_вр(сейчас), _вр(сейчас - ПРОСТОЙ_СЕАНСА_С * 1000), _вр(сейчас - 30 * 86_400_000))).rowcount
        return {'коды': коды, 'сеансы': сеансы}


def письмо_с_кодом(отправить: Callable[[str, str, str], bool], почта: str, код: str) -> bool:
    """Владелец 28.11.2026: текст письма «Код входа: 1234». Отправка — как у админки (admin.отправить_письмо)."""
    return отправить(
        почта, 'Код входа в AI Ustaz',
        'Ассаляму алейкум!\n\n'
        f'Код входа: {код}\n\n'
        'Код действует 10 минут. Никому его не сообщайте.\n'
        'Если вы не входили в AI Ustaz — просто удалите это письмо.\n\n'
        'https://aiustaz.pro/\n')


# ───────────────────────── маршруты ─────────────────────────
def register(app, *, аккаунты: ХранилищеАккаунтов, хранилище, отправить_письмо: Callable[[str, str, str], bool],
             секрет: str, ключ_лимита: Callable[[Request], str], google_client_id: str = '', apple_services_id: str = '',
             apple_redirect: str = '', ключи_провайдера: Callable[[str], list[dict]] | None = None,
             мост_админки: Callable[[str, str, int], tuple[str, dict] | None] | None = None,
             роль_по_почте: Callable[[str], str | None] | None = None, часы: Callable[[], float] = time.time,
             источники: str = 'https://aiustaz.pro,https://www.aiustaz.pro', безопасная_кука: bool = True) -> None:
    разрешённые = {и.strip().rstrip('/') for и in источники.split(',') if и.strip()}
    скачать = ключи_провайдера or (lambda провайдер: скачать_ключи(АДРЕСА_КЛЮЧЕЙ[провайдер]))
    последняя_перекачка: dict[str, int] = {}  # только защита от частых запросов к Google/Apple, не состояние

    def сейчас() -> int:
        return int(часы() * 1000)

    def ошибка(код: int, что: str) -> JSONResponse:
        return JSONResponse({'ошибка': что}, status_code=код, headers={'Cache-Control': 'no-store'})

    def ок(данные: dict) -> JSONResponse:
        return JSONResponse(данные, headers={'Cache-Control': 'no-store'})

    async def лимит(ключ: str, окно: int, предел: int) -> bool:
        return await run_in_threadpool(хранилище.учесть, ключ, окно, предел, сейчас())

    def свой_источник(запрос: Request) -> bool:
        источник = запрос.headers.get('origin')
        return источник is None or источник.rstrip('/') in разрешённые

    async def тело(запрос: Request, предел: int = 16 * 1024) -> dict | JSONResponse:
        if not свой_источник(запрос):
            return ошибка(403, 'origin')
        if запрос.headers.get(ЗАГОЛОВОК) != '1':
            return ошибка(403, 'header')
        длина = запрос.headers.get('content-length')
        if длина is not None and (not длина.isdigit() or int(длина) > предел):
            return ошибка(413, 'size')
        сырое = await запрос.body()
        if len(сырое) > предел:
            return ошибка(413, 'size')
        try:
            д = json.loads(сырое or b'{}')
        except (ValueError, UnicodeDecodeError):
            return ошибка(400, 'json')
        return д if isinstance(д, dict) else ошибка(400, 'body')

    def токен_из(запрос: Request) -> str | None:
        т = запрос.cookies.get(КУКА)
        return т if т and re.fullmatch(r'[A-Za-z0-9_-]{30,80}', т) else None

    async def кто(запрос: Request, изменение: bool = False) -> tuple[dict | None, JSONResponse | None]:
        if изменение and (not свой_источник(запрос) or запрос.headers.get(ЗАГОЛОВОК) != '1'):
            return None, ошибка(403, 'header')
        т = токен_из(запрос)
        if not т:
            return None, ошибка(401, 'login')
        я = await run_in_threadpool(аккаунты.сеанс, admin.хэш_токена(т), сейчас())
        if я is None:
            return None, ошибка(401, 'login')
        return я, None

    async def наружу(я: dict) -> dict:
        роль = await run_in_threadpool(роль_по_почте, я['email']) if роль_по_почте else None
        return {'email': я['email'], 'создан': я['создан'], 'способы': я['способы'], 'роль': роль, 'закят': я['закят']}

    async def открыть_сеанс(запрос: Request, я: dict, способ: str) -> JSONResponse:
        токен = secrets.token_urlsafe(32)
        await run_in_threadpool(аккаунты.создать_сеанс, я['id'], admin.хэш_токена(токен),
                                admin.класс_устройства(запрос.headers.get('user-agent', '')), способ, сейчас())
        ответ = ок({'ок': True, 'я': await наружу(я)})
        ответ.set_cookie(КУКА, токен, max_age=СРОК_СЕАНСА_С, path=ПУТЬ_КУКИ, httponly=True, secure=безопасная_кука,
                         samesite='lax')
        return ответ

    def снять_куку(ответ: Response) -> Response:
        ответ.delete_cookie(КУКА, path=ПУТЬ_КУКИ, secure=безопасная_кука, httponly=True, samesite='lax')
        return ответ

    def хэш_кода(почта: str, код: str) -> str:
        # Тот же секрет, что у админки, но своя «область» — код аккаунта не подходит к админке и наоборот.
        return admin.хэш_кода(секрет, 'account:' + почта, код)

    # ───────────── настройка ─────────────
    @app.get('/api/account/config')
    async def настройка():
        return ок({'google_client_id': google_client_id or None, 'apple_services_id': apple_services_id or None,
                   'apple_redirect': (apple_redirect or None) if apple_services_id else None, 'код': admin.ЦИФР_КОДА})

    # ───────────── вход по коду ─────────────
    @app.post('/api/account/start')
    async def прислать_код(запрос: Request):
        if not секрет:
            return ошибка(503, 'no_secret')
        д = await тело(запрос)
        if isinstance(д, JSONResponse):
            return д
        почта = admin.норм_почта(д.get('email'))
        if not почта:
            return ошибка(400, 'email')
        if not await лимит('accc:' + ключ_лимита(запрос), 3600, КОДОВ_С_IP_В_ЧАС):
            return ошибка(429, 'rate')
        if not await лимит('acce:' + hashlib.sha256(почта.encode()).hexdigest()[:24], 3600, КОДОВ_НА_ПОЧТУ_В_ЧАС):
            return ошибка(429, 'rate')
        код = admin.новый_код()
        await run_in_threadpool(аккаунты.сохранить_код, почта, хэш_кода(почта, код), сейчас())
        if not await run_in_threadpool(письмо_с_кодом, отправить_письмо, почта, код):
            return ошибка(503, 'mail')
        return ок({'ок': True})

    @app.post('/api/account/verify')
    async def проверить_код(запрос: Request):
        if not секрет:
            return ошибка(503, 'no_secret')
        if not await лимит('accv:' + ключ_лимита(запрос), 900, 20):
            return ошибка(429, 'rate')
        д = await тело(запрос)
        if isinstance(д, JSONResponse):
            return д
        почта = admin.норм_почта(д.get('email'))
        код = admin.код_верного_вида(д.get('code'))
        if not почта or not код:
            return ошибка(400, 'code')
        возраст16 = д.get('age16') is True
        # Сначала код, потом возраст: ответ не выдаёт, есть ли аккаунт у этой почты.
        if not await run_in_threadpool(аккаунты.проверить_код, почта, хэш_кода(почта, код), сейчас()):
            return ошибка(400, 'code')
        я = await run_in_threadpool(lambda: аккаунты.войти_или_создать(почта, способ='email', sub=None, возраст16=возраст16))
        if я is None:
            return ошибка(400, 'age')
        return await открыть_сеанс(запрос, я, 'email')

    # ───────────── Google / Apple ─────────────
    def ключи(провайдер: str, kid: str | None) -> list[dict]:
        т = сейчас()
        кэш = аккаунты.ключи_из_кэша(провайдер)
        свежие = кэш is not None and т - кэш[1] < СРОК_КЛЮЧЕЙ_С * 1000
        есть_kid = кэш is not None and any(к.get('kid') == kid for к in кэш[0])
        if свежие and (есть_kid or т - последняя_перекачка.get(провайдер, 0) < ПОВТОР_КЛЮЧЕЙ_С * 1000):
            return кэш[0]
        последняя_перекачка[провайдер] = т
        try:
            новые = скачать(провайдер)
        except Exception as е:  # noqa: BLE001 — нет сети до Google/Apple: работаем с кэшем, если он есть
            журнал.warning('ключи %s не скачаны: %s', провайдер, type(е).__name__)
            if кэш:
                return кэш[0]
            raise ОшибкаТокена('keys') from е
        аккаунты.сохранить_ключи(провайдер, новые, т)
        return новые

    def kid_токена(токен: object) -> str | None:
        try:
            return json.loads(_b64(str(токен).split('.')[0])).get('kid')
        except Exception:  # noqa: BLE001
            return None

    async def вход_провайдера(запрос: Request, провайдер: str, аудитория: str, поле: str):
        if not аудитория:
            return ошибка(503, провайдер)
        if not await лимит(f'acc{провайдер[0]}:' + ключ_лимита(запрос), 900, 20):
            return ошибка(429, 'rate')
        д = await тело(запрос)
        if isinstance(д, JSONResponse):
            return д
        токен = д.get(поле)
        try:
            набор = await run_in_threadpool(ключи, провайдер, kid_токена(токен))
            данные = проверить_id_token(токен, набор, издатели=ИЗДАТЕЛИ[провайдер], аудитория=аудитория, сейчас_с=сейчас() / 1000)
        except ОшибкаТокена as е:
            журнал.info('вход %s отклонён: %s', провайдер, е.код)
            return ошибка(503 if е.код == 'keys' else 400, 'keys' if е.код == 'keys' else 'token')
        я = await run_in_threadpool(lambda: аккаунты.войти_или_создать(данные['email'], способ=провайдер, sub=данные['sub'],
                                                                         возраст16=д.get('age16') is True))
        if я is None:
            return ошибка(400, 'age')
        return await открыть_сеанс(запрос, я, провайдер)

    @app.post('/api/account/google')
    async def вход_google(запрос: Request):
        return await вход_провайдера(запрос, 'google', google_client_id, 'credential')

    @app.post('/api/account/apple')
    async def вход_apple(запрос: Request):
        return await вход_провайдера(запрос, 'apple', apple_services_id, 'id_token')

    # ───────────── я, выход, сеансы ─────────────
    @app.get('/api/account/me')
    async def я_(запрос: Request):
        я, отказ = await кто(запрос)
        return отказ or ок(await наружу(я))

    @app.post('/api/account/logout')
    async def выйти(запрос: Request):
        if not свой_источник(запрос) or запрос.headers.get(ЗАГОЛОВОК) != '1':
            return ошибка(403, 'header')
        т = токен_из(запрос)
        if т:
            await run_in_threadpool(аккаунты.отозвать_по_хэшу, admin.хэш_токена(т))
        return снять_куку(ок({'ок': True}))

    @app.post('/api/account/logout-all')
    async def выйти_везде(запрос: Request):
        я, отказ = await кто(запрос, True)
        if отказ:
            return отказ
        n = await run_in_threadpool(аккаунты.отозвать_все, я['id'])
        return снять_куку(ок({'ок': True, 'закрыто': n}))

    @app.get('/api/account/sessions')
    async def сеансы(запрос: Request):
        я, отказ = await кто(запрос)
        if отказ:
            return отказ
        этот = admin.хэш_токена(токен_из(запрос) or '')
        с = await run_in_threadpool(аккаунты.сеансы, я['id'], сейчас())
        return ок({'сеансы': [{'id': з['хэш'][:16], 'создан': з['создан'], 'был': з['был'], 'устройство': з['устройство'],
                               'способ': з['способ'], 'этот': з['хэш'] == этот} for з in с]})

    @app.post('/api/account/sessions/revoke')
    async def отозвать(запрос: Request):
        я, отказ = await кто(запрос, True)
        if отказ:
            return отказ
        д = await тело(запрос)
        if isinstance(д, JSONResponse):
            return д
        if not await run_in_threadpool(аккаунты.отозвать, я['id'], str(д.get('id', ''))):
            return ошибка(404, 'session')
        return ок({'ок': True})

    @app.post('/api/account/settings')
    async def настройки(запрос: Request):
        я, отказ = await кто(запрос, True)
        if отказ:
            return отказ
        д = await тело(запрос)
        if isinstance(д, JSONResponse):
            return д
        if set(д) - {'zakat'} or not isinstance(д.get('zakat'), bool):
            return ошибка(400, 'body')
        await run_in_threadpool(аккаунты.задать_закят, я['id'], д['zakat'])
        return ок({'ок': True, 'закят': д['zakat']})

    # ───────────── синхронизация ─────────────
    @app.get('/api/account/sync')
    async def документы(запрос: Request):
        я, отказ = await кто(запрос)
        if отказ:
            return отказ
        д = await run_in_threadpool(аккаунты.документы, я['id'])
        return ок({'docs': д, 'закят': я['закят']})

    @app.put('/api/account/sync')
    async def записать(запрос: Request):
        я, отказ = await кто(запрос, True)
        if отказ:
            return отказ
        if not await лимит('accs:' + str(я['id']), 60, 30):
            return ошибка(429, 'rate')
        д = await тело(запрос, МАКС_ТЕЛО)
        if isinstance(д, JSONResponse):
            return д
        доки = д.get('docs')
        if set(д) - {'docs'} or not isinstance(доки, dict) or not доки:
            return ошибка(400, 'body')
        for ключ, з in доки.items():
            if ключ not in КЛЮЧИ or not isinstance(з, dict) or set(з) != {'base', 'data'}:
                return ошибка(400, 'doc')
            база, данные = з['base'], з['data']
            if not isinstance(база, int) or isinstance(база, bool) or база < 0 or not isinstance(данные, dict):
                return ошибка(400, 'doc')
            if len(json.dumps(данные, ensure_ascii=False, separators=(',', ':')).encode('utf-8')) > МАКС_ДОКУМЕНТ:
                return ошибка(413, 'doc_size')
        записано: dict[str, dict] = {}
        конфликты: dict[str, dict | None] = {}
        for ключ, з in доки.items():
            if ключ == 'zakat' and not я['закят']:
                конфликты[ключ] = None  # суммы закята не храним: выключатель «Сохранять суммы закята в аккаунте» выключен
                continue
            р = await run_in_threadpool(аккаунты.записать_документ, я['id'], ключ, з['base'], з['data'], сейчас())
            if р:
                записано[ключ] = р
            else:
                конфликты[ключ] = await run_in_threadpool(аккаунты.документ, я['id'], ключ)
        return ок({'docs': записано, 'conflicts': конфликты})

    # ───────────── мои данные, удаление ─────────────
    @app.get('/api/account/export')
    async def выгрузить(запрос: Request):
        я, отказ = await кто(запрос, True)
        if отказ:
            return отказ
        данные = await run_in_threadpool(аккаунты.выгрузка, я['id'], сейчас())
        return Response(json.dumps(данные, ensure_ascii=False, indent=1), media_type='application/json; charset=utf-8',
                        headers={'Cache-Control': 'no-store', 'Content-Disposition': 'attachment; filename="aiustaz-my-data.json"'})

    @app.post('/api/account/delete')
    async def удалить(запрос: Request):
        я, отказ = await кто(запрос, True)
        if отказ:
            return отказ
        д = await тело(запрос)
        if isinstance(д, JSONResponse):
            return д
        if д.get('confirm') is not True:
            return ошибка(400, 'confirm')
        await run_in_threadpool(аккаунты.удалить, я['id'])
        журнал.info('аккаунт удалён по просьбе владельца аккаунта')
        return снять_куку(ок({'ок': True}))

    # ───────────── мост в админку ─────────────
    @app.post('/api/account/admin')
    async def в_админку(запрос: Request):
        я, отказ = await кто(запрос, True)
        if отказ:
            return отказ
        if мост_админки is None:
            return ошибка(403, 'role')
        итог = await run_in_threadpool(мост_админки, я['email'], admin.класс_устройства(запрос.headers.get('user-agent', '')), сейчас())
        if итог is None:
            return ошибка(403, 'role')
        токен, _ = итог
        ответ = ок({'ок': True, 'адрес': '/admin/'})
        ответ.set_cookie(admin.КУКА, токен, max_age=admin.СРОК_СЕАНСА_С, path=admin.ПУТЬ_КУКИ, httponly=True,
                         secure=безопасная_кука, samesite='strict')
        return ответ
