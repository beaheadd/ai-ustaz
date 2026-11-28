"""Админка AI Ustaz: вход по коду из письма, роли, сеансы, журнал действий и API для страниц админки.

Владелец 27.11.2026: «Создай админ панель, админку меня назначь админом, чтобы потом я другим давал доступ. На админ
панели первая страница должно быть показ статистики…». Дизайн — docs/дизайн/12-админка-и-статистика.md.
Сама админка — отдельное маленькое веб-приложение admin/ (https://aiustaz.pro/admin/), не в сборке приложения.

Вход: почта → 4-значный код письмом (локальный Postfix по SMTP 127.0.0.1:25; от no-reply@aiustaz.pro) → код → сеанс.
  Владелец 28.11.2026: «Код четырёхзначный сделай, чтобы было проще, 4 знака» (было 6). Чтобы 4 цифры оставались
  безопасными: код храним только как HMAC(секрет, почта, код), сравнение — за постоянное время; живёт 10 минут; 5 попыток,
  потом сгорает; новый код гасит прежние; не больше 5 кодов в час на почту и 20 в час с IP (хэш).
  Тот же вход по коду — у аккаунтов приложения (server/account.py: «Админ-панель» из «Ещё» открывает админку без
  второго кода — создать_сеанс_для_почты()).
  Ответ на «прислать код» одинаков для любой почты (не раскрываем, кто админ); письмо уходит только админам.
  Сеанс — случайный токен в cookie aiustaz_admin (HttpOnly; Secure; SameSite=Strict; Path=/api/admin), в базе — sha256
  токена; 30 дней, без активности 7 дней — заканчивается. Изменения — только с заголовком X-Aiustaz-Admin: 1 и своим
  Origin (вдобавок к SameSite=Strict).
Роли: owner — всё и управление админами; admin — содержимое и статистика; viewer — только смотрит.
  Первый владелец — из окружения MUGALIM_ADMIN_OWNER_EMAILS (/etc/mugalim.env; не в git), ставит workflow
  «AI Ustaz admin: set owner» из секрета GitHub. Владельца из окружения из админки не удалить и не понизить.
Журнал: каждое действие админа (вход, выход, роли, содержимое) — admin_audit: кто, что, когда, над чем.

Контракт API (JSON; ошибки — {ошибка: '<код>'}; все ответы no-store):
  POST /api/admin/login/code   {email}            -> {ок}         (429 — часто)
  POST /api/admin/login/verify {email, code}      -> {ок, я} + cookie   (400 code — неверный или истёк)
  POST /api/admin/logout                          -> {ок}
  GET  /api/admin/me                              -> {email, роль, имя}            (401 — не вошли)
  GET  /api/admin/sessions                        -> {сеансы: [{id, создан, был, устройство, этот}]}
  POST /api/admin/sessions/revoke {id}            -> {ок}
  GET  /api/admin/users                (owner)    -> {админы: [...]}
  POST /api/admin/users {email, role, name}       (owner) -> {ок, id}
  POST /api/admin/users/update {id, role?, name?, disabled?} (owner) -> {ок}
  POST /api/admin/users/remove {id}    (owner)    -> {ок}
  GET  /api/admin/audit?limit=        (admin+)    -> {записи: [...]}
  GET  /api/admin/stats?days=30       (viewer+)   -> сводка stats.ХранилищеСтатистики.сводка
  Содержимое (чтецы, хадисы) — content_admin.py, через доступ() отсюда.

Контракт модуля:
  норм_почта(строка) -> str | None;  новый_код() -> str;  хэш_кода(секрет, почта, код) -> str
  РОЛИ, можно(роль, нужно) -> bool
  ХранилищеАдминов(хранилище) — пользователи, коды, сеансы, журнал (поверх db.Хранилище.соединение)
  письмо_через_smtp(почта, код) -> bool — прод-отправка; отправить_письмо(почта, тема, текст) -> bool — то же для account.py
  ХранилищеАдминов.создать_сеанс_для_почты(почта, устройство, сейчас) -> (токен, админ) | None — мост из аккаунта приложения
  register(app, *, админы, хранилище, статистика, отправить_код, секрет, часы, источники, безопасная_кука) -> доступ
"""
from __future__ import annotations

import hashlib
import hmac
import json
import logging
import re
import secrets
import smtplib
import time
from datetime import datetime, timedelta, timezone
from email.message import EmailMessage
from email.utils import formatdate, make_msgid
from typing import Awaitable, Callable

from fastapi import Request
from fastapi.concurrency import run_in_threadpool
from fastapi.responses import JSONResponse

журнал = logging.getLogger('mugalim.admin')

РОЛИ = ('viewer', 'admin', 'owner')
КУКА = 'aiustaz_admin'
ПУТЬ_КУКИ = '/api/admin'
СРОК_КОДА_С = 600
ПОПЫТОК_КОДА = 5
ЦИФР_КОДА = 4                 # владелец 28.11.2026: «Код четырёхзначный сделай»
КОДОВ_НА_ПОЧТУ_В_ЧАС = 5
КОДОВ_С_IP_В_ЧАС = 20
СРОК_СЕАНСА_С = 30 * 86400
ПРОСТОЙ_СЕАНСА_С = 7 * 86400
МАКС_ТЕЛО = 16 * 1024
ОТПРАВИТЕЛЬ = 'no-reply@aiustaz.pro'
ПОЧТА = re.compile(r'^[a-z0-9._%+-]{1,64}@[a-z0-9-]+(\.[a-z0-9-]+)*\.[a-z]{2,24}$')
ЗАГОЛОВОК_ИЗМЕНЕНИЯ = 'x-aiustaz-admin'


def норм_почта(з: object) -> str | None:
    if not isinstance(з, str):
        return None
    з = з.strip().lower()
    return з if len(з) <= 254 and ПОЧТА.match(з) else None


def новый_код() -> str:
    return f'{secrets.randbelow(10 ** ЦИФР_КОДА):0{ЦИФР_КОДА}d}'


def код_верного_вида(код: object) -> str | None:
    """'1234' (пробелы по краям — убираем) или None."""
    if not isinstance(код, str):
        return None
    к = код.strip()
    return к if re.fullmatch(r'\d{%d}' % ЦИФР_КОДА, к) else None


def хэш_кода(секрет: str, почта: str, код: str) -> str:
    return hmac.new(секрет.encode('utf-8'), f'{почта}\n{код}'.encode('utf-8'), hashlib.sha256).hexdigest()


def хэш_токена(токен: str) -> str:
    return hashlib.sha256(токен.encode('utf-8')).hexdigest()


def можно(роль: str, нужно: str) -> bool:
    return роль in РОЛИ and РОЛИ.index(роль) >= РОЛИ.index(нужно)


def класс_устройства(ua: str) -> str:
    """Для списка сеансов: «Android · телефон» — без строки User-Agent целиком."""
    u = (ua or '').lower()
    система = 'Android' if 'android' in u else 'iPhone' if 'iphone' in u else 'iPad' if 'ipad' in u else \
        'Windows' if 'windows' in u else 'Mac' if 'mac os' in u else 'Linux' if 'linux' in u else 'другое'
    браузер = 'Edge' if 'edg/' in u else 'Chrome' if 'chrome' in u else 'Safari' if 'safari' in u else \
        'Firefox' if 'firefox' in u else ''
    return (система + (' · ' + браузер if браузер else ''))[:40]


def _вр(мс: int) -> datetime:
    return datetime.fromtimestamp(мс / 1000, tz=timezone.utc)


def _мс(в: datetime | None) -> int | None:
    return int(в.timestamp() * 1000) if в else None


def письмо_через_smtp(почта: str, код: str, *, хост: str = '127.0.0.1', порт: int = 25) -> bool:
    """Письмо с кодом входа в админку (владелец 28.11.2026: текст «Код входа: 1234»)."""
    return отправить_письмо(
        почта, 'Код входа в админку AI Ustaz',
        'Ассаляму алейкум!\n\n'
        f'Код входа: {код}\n\n'
        'Код действует 10 минут. Никому его не сообщайте.\n'
        'Если вы не входили в админку — просто удалите это письмо.\n\n'
        'https://aiustaz.pro/admin/\n', хост=хост, порт=порт)


def отправить_письмо(почта: str, тема: str, текст: str, *, хост: str = '127.0.0.1', порт: int = 25) -> bool:
    """Письмо через локальный Postfix по SMTP на 127.0.0.1:25 (он же подписывает DKIM) — как и раньше.

    Не sendmail: служба mugalim-api работает с NoNewPrivileges и ProtectSystem=strict — setgid-postdrop там не работает.
    Код в журнал не пишем."""
    п = EmailMessage()
    п['From'] = f'AI Ustaz <{ОТПРАВИТЕЛЬ}>'
    п['To'] = почта
    п['Subject'] = тема
    п['Date'] = formatdate(localtime=False)
    п['Message-ID'] = make_msgid(domain='aiustaz.pro')
    п['Auto-Submitted'] = 'auto-generated'
    п.set_content(текст)
    try:
        with smtplib.SMTP(хост, порт, timeout=20) as с:
            с.send_message(п, from_addr=ОТПРАВИТЕЛЬ, to_addrs=[почта])
    except (OSError, smtplib.SMTPException) as е:
        журнал.error('письмо с кодом не отправлено: %s', type(е).__name__)
        return False
    return True


class ХранилищеАдминов:
    def __init__(self, хранилище) -> None:
        self._х = хранилище

    def _с(self):
        return self._х.соединение()

    # ───────────── пользователи ─────────────
    @staticmethod
    def _пользователь(р) -> dict:
        return {'id': р[0], 'email': р[1], 'роль': р[2], 'имя': р[3], 'создан': _мс(р[4]), 'отключён': р[5]}

    _ПОЛЯ = 'id, email, role, name, created_at, disabled'

    def обеспечить_владельцев(self, почты: list[str]) -> int:
        n = 0
        with self._с() as с:
            for п in почты:
                с.execute(
                    """INSERT INTO admin_users (email, role) VALUES (%s, 'owner')
                       ON CONFLICT (email) DO UPDATE SET role = 'owner', disabled = FALSE""", (п,))
                n += 1
        return n

    def по_почте(self, почта: str) -> dict | None:
        with self._с() as с:
            р = с.execute(f'SELECT {self._ПОЛЯ} FROM admin_users WHERE email = %s', (почта,)).fetchone()
        return self._пользователь(р) if р else None

    def по_id(self, ид: int) -> dict | None:
        with self._с() as с:
            р = с.execute(f'SELECT {self._ПОЛЯ} FROM admin_users WHERE id = %s', (ид,)).fetchone()
        return self._пользователь(р) if р else None

    def список(self) -> list[dict]:
        with self._с() as с:
            строки = с.execute(f'SELECT {self._ПОЛЯ} FROM admin_users ORDER BY id').fetchall()
            последние = dict(с.execute('SELECT user_id, max(last_at) FROM admin_sessions GROUP BY user_id').fetchall())
        итог = []
        for р in строки:
            п = self._пользователь(р)
            п['последний_вход'] = _мс(последние.get(р[0]))
            итог.append(п)
        return итог

    def добавить(self, почта: str, роль: str, имя: str, кто: int) -> int | None:
        with self._с() as с:
            р = с.execute(
                """INSERT INTO admin_users (email, role, name, created_by) VALUES (%s, %s, %s, %s)
                   ON CONFLICT (email) DO NOTHING RETURNING id""", (почта, роль, имя, кто)).fetchone()
        return р[0] if р else None

    def изменить(self, ид: int, роль: str | None, имя: str | None, отключён: bool | None) -> bool:
        with self._с() as с:
            n = с.execute(
                """UPDATE admin_users SET role = COALESCE(%s, role), name = COALESCE(%s, name), disabled = COALESCE(%s, disabled)
                   WHERE id = %s""", (роль, имя, отключён, ид)).rowcount
            if отключён:
                с.execute('UPDATE admin_sessions SET revoked = TRUE WHERE user_id = %s', (ид,))
        return n > 0

    def удалить(self, ид: int) -> bool:
        with self._с() as с:
            return с.execute('DELETE FROM admin_users WHERE id = %s', (ид,)).rowcount > 0

    # ───────────── коды ─────────────
    def сохранить_код(self, почта: str, хэш: str, сейчас: int) -> None:
        with self._с() as с:
            с.execute('UPDATE admin_codes SET used = TRUE WHERE email = %s AND NOT used', (почта,))
            с.execute('INSERT INTO admin_codes (email, code_hash, created_at, expires_at) VALUES (%s, %s, %s, %s)',
                      (почта, хэш, _вр(сейчас), _вр(сейчас + СРОК_КОДА_С * 1000)))

    def проверить_код(self, почта: str, хэш: str, сейчас: int) -> bool:
        with self._с() as с:
            р = с.execute(
                """SELECT id, code_hash, attempts FROM admin_codes WHERE email = %s AND NOT used AND expires_at > %s
                   ORDER BY created_at DESC LIMIT 1 FOR UPDATE""", (почта, _вр(сейчас))).fetchone()
            if not р:
                return False
            ид, верный, попыток = р
            if попыток >= ПОПЫТОК_КОДА:
                с.execute('UPDATE admin_codes SET used = TRUE WHERE id = %s', (ид,))
                return False
            if hmac.compare_digest(верный, хэш):
                с.execute('UPDATE admin_codes SET used = TRUE WHERE id = %s', (ид,))
                return True
            с.execute('UPDATE admin_codes SET attempts = attempts + 1, used = (attempts + 1 >= %s) WHERE id = %s',
                      (ПОПЫТОК_КОДА, ид))
            return False

    # ───────────── сеансы ─────────────
    def создать_сеанс(self, ид_пользователя: int, хэш: str, устройство: str, сейчас: int) -> None:
        with self._с() as с:
            с.execute(
                """INSERT INTO admin_sessions (id, user_id, created_at, last_at, expires_at, device)
                   VALUES (%s, %s, %s, %s, %s, %s)""",
                (хэш, ид_пользователя, _вр(сейчас), _вр(сейчас), _вр(сейчас + СРОК_СЕАНСА_С * 1000), устройство))

    def создать_сеанс_для_почты(self, почта: str, устройство: str, сейчас: int) -> tuple[str, dict] | None:
        """Мост из аккаунта приложения (account.py): почта аккаунта — админ (не отключён) → новый сеанс админки.

        Почту аккаунт уже подтвердил (код из письма или Google с email_verified). Журнал — «вход через аккаунт»."""
        п = self.по_почте(почта)
        if not п or п['отключён']:
            return None
        токен = secrets.token_urlsafe(32)
        self.создать_сеанс(п['id'], хэш_токена(токен), устройство, сейчас)
        self.записать(п, 'вход через аккаунт приложения')
        return токен, п

    def роль_по_почте(self, почта: str) -> str | None:
        п = self.по_почте(почта)
        return п['роль'] if п and not п['отключён'] else None

    def сеанс(self, хэш: str, сейчас: int) -> dict | None:
        """Живой сеанс и его пользователь (не отключён); отмечает «был» не чаще раза в минуту."""
        with self._с() as с:
            р = с.execute(
                f"""SELECT s.last_at, u.{', u.'.join(self._ПОЛЯ.split(', '))} FROM admin_sessions s
                    JOIN admin_users u ON u.id = s.user_id
                    WHERE s.id = %s AND NOT s.revoked AND s.expires_at > %s AND s.last_at > %s AND NOT u.disabled""",
                (хэш, _вр(сейчас), _вр(сейчас - ПРОСТОЙ_СЕАНСА_С * 1000))).fetchone()
            if not р:
                return None
            if (сейчас - _мс(р[0])) > 60_000:
                с.execute('UPDATE admin_sessions SET last_at = %s WHERE id = %s', (_вр(сейчас), хэш))
        return self._пользователь(р[1:])

    def сеансы(self, ид_пользователя: int, сейчас: int) -> list[dict]:
        with self._с() as с:
            строки = с.execute(
                """SELECT id, created_at, last_at, device FROM admin_sessions
                   WHERE user_id = %s AND NOT revoked AND expires_at > %s AND last_at > %s ORDER BY last_at DESC""",
                (ид_пользователя, _вр(сейчас), _вр(сейчас - ПРОСТОЙ_СЕАНСА_С * 1000))).fetchall()
        return [{'хэш': р[0], 'создан': _мс(р[1]), 'был': _мс(р[2]), 'устройство': р[3]} for р in строки]

    def отозвать(self, ид_пользователя: int, начало_хэша: str) -> bool:
        if not re.fullmatch(r'[0-9a-f]{16}', начало_хэша or ''):
            return False
        with self._с() as с:
            return с.execute('UPDATE admin_sessions SET revoked = TRUE WHERE user_id = %s AND left(id, 16) = %s',
                             (ид_пользователя, начало_хэша)).rowcount > 0

    def отозвать_по_хэшу(self, хэш: str) -> None:
        with self._с() as с:
            с.execute('UPDATE admin_sessions SET revoked = TRUE WHERE id = %s', (хэш,))

    # ───────────── журнал ─────────────
    def записать(self, кто: dict | None, действие: str, над: str = '', подробно: dict | None = None) -> None:
        with self._с() as с:
            с.execute('INSERT INTO admin_audit (user_id, email, action, target, details) VALUES (%s, %s, %s, %s, %s)',
                      (кто['id'] if кто else None, кто['email'] if кто else '', действие[:60], над[:200],
                       json.dumps(подробно or {}, ensure_ascii=False)))

    def журнал(self, предел: int = 100) -> list[dict]:
        with self._с() as с:
            строки = с.execute('SELECT at, email, action, target, details FROM admin_audit ORDER BY id DESC LIMIT %s',
                               (max(1, min(предел, 500)),)).fetchall()
        return [{'когда': _мс(р[0]), 'кто': р[1], 'действие': р[2], 'над': р[3], 'подробно': р[4]} for р in строки]

    def убрать_старое(self, сейчас: int) -> dict:
        with self._с() as с:
            коды = с.execute('DELETE FROM admin_codes WHERE created_at < %s', (_вр(сейчас - 86_400_000),)).rowcount
            сеансы = с.execute('DELETE FROM admin_sessions WHERE expires_at < %s OR (revoked AND last_at < %s)',
                               (_вр(сейчас), _вр(сейчас - 30 * 86_400_000))).rowcount
        return {'коды': коды, 'сеансы': сеансы}


Доступ = Callable[[Request, str, bool], Awaitable[tuple[dict | None, JSONResponse | None]]]


def register(app, *, админы: ХранилищеАдминов, хранилище, статистика, отправить_код: Callable[[str, str], bool],
             секрет: str, ключ_лимита: Callable[[Request], str], владельцы: frozenset[str] = frozenset(),
             часы: Callable[[], float] = time.time, источники: str = 'https://aiustaz.pro,https://www.aiustaz.pro',
             безопасная_кука: bool = True) -> Доступ:
    """Маршруты /api/admin/…; возвращает доступ(запрос, роль, изменение) для других модулей админки."""
    разрешённые = {и.strip().rstrip('/') for и in источники.split(',') if и.strip()}

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

    async def тело(запрос: Request) -> dict | JSONResponse:
        if not свой_источник(запрос):
            return ошибка(403, 'origin')
        if запрос.headers.get(ЗАГОЛОВОК_ИЗМЕНЕНИЯ) != '1':
            return ошибка(403, 'header')
        длина = запрос.headers.get('content-length')
        if длина is not None and (not длина.isdigit() or int(длина) > МАКС_ТЕЛО):
            return ошибка(413, 'size')
        сырое = await запрос.body()
        if len(сырое) > МАКС_ТЕЛО:
            return ошибка(413, 'size')
        try:
            д = json.loads(сырое or b'{}')
        except (ValueError, UnicodeDecodeError):
            return ошибка(400, 'json')
        return д if isinstance(д, dict) else ошибка(400, 'body')

    def токен_из(запрос: Request) -> str | None:
        т = запрос.cookies.get(КУКА)
        return т if т and re.fullmatch(r'[A-Za-z0-9_-]{30,80}', т) else None

    async def доступ(запрос: Request, роль: str = 'viewer', изменение: bool = False) -> tuple[dict | None, JSONResponse | None]:
        if изменение and (not свой_источник(запрос) or запрос.headers.get(ЗАГОЛОВОК_ИЗМЕНЕНИЯ) != '1'):
            return None, ошибка(403, 'header')
        т = токен_из(запрос)
        if not т:
            return None, ошибка(401, 'login')
        я = await run_in_threadpool(админы.сеанс, хэш_токена(т), сейчас())
        if я is None:
            return None, ошибка(401, 'login')
        if not можно(я['роль'], роль):
            return None, ошибка(403, 'role')
        return я, None

    def наружу(п: dict) -> dict:
        return {'id': п['id'], 'email': п['email'], 'роль': п['роль'], 'имя': п['имя'], 'отключён': п['отключён'],
                'создан': п['создан'], 'последний_вход': п.get('последний_вход'), 'изОкружения': п['email'] in владельцы}

    # ───────────── вход ─────────────
    @app.post('/api/admin/login/code')
    async def прислать_код(запрос: Request):
        if not секрет:
            return ошибка(503, 'no_secret')  # нет MUGALIM_ADMIN_SECRET в /etc/mugalim.env (создаёт setup-server.sh)
        if not await лимит('admc:' + ключ_лимита(запрос), 3600, КОДОВ_С_IP_В_ЧАС):
            return ошибка(429, 'rate')
        д = await тело(запрос)
        if isinstance(д, JSONResponse):
            return д
        почта = норм_почта(д.get('email'))
        if not почта:
            return ошибка(400, 'email')
        if not await лимит('admce:' + hashlib.sha256(почта.encode()).hexdigest()[:24], 3600, КОДОВ_НА_ПОЧТУ_В_ЧАС):
            return ошибка(429, 'rate')
        п = await run_in_threadpool(админы.по_почте, почта)
        if п and not п['отключён']:
            код = новый_код()
            await run_in_threadpool(админы.сохранить_код, почта, хэш_кода(секрет, почта, код), сейчас())
            отправлено = await run_in_threadpool(отправить_код, почта, код)
            await run_in_threadpool(админы.записать, п, 'вход: код отправлен' if отправлено else 'вход: письмо не ушло')
            if not отправлено:
                return ошибка(503, 'mail')
        return ок({'ок': True})

    @app.post('/api/admin/login/verify')
    async def проверить_код(запрос: Request):
        if not секрет:
            return ошибка(503, 'no_secret')
        if not await лимит('admv:' + ключ_лимита(запрос), 900, 20):
            return ошибка(429, 'rate')
        д = await тело(запрос)
        if isinstance(д, JSONResponse):
            return д
        почта = норм_почта(д.get('email'))
        код = код_верного_вида(д.get('code'))
        if not почта or not код:
            return ошибка(400, 'code')
        if not await run_in_threadpool(админы.проверить_код, почта, хэш_кода(секрет, почта, код), сейчас()):
            return ошибка(400, 'code')
        п = await run_in_threadpool(админы.по_почте, почта)
        if not п or п['отключён']:
            return ошибка(400, 'code')
        токен = secrets.token_urlsafe(32)
        await run_in_threadpool(админы.создать_сеанс, п['id'], хэш_токена(токен),
                                класс_устройства(запрос.headers.get('user-agent', '')), сейчас())
        await run_in_threadpool(админы.записать, п, 'вход')
        ответ = ок({'ок': True, 'я': {'email': п['email'], 'роль': п['роль'], 'имя': п['имя']}})
        ответ.set_cookie(КУКА, токен, max_age=СРОК_СЕАНСА_С, path=ПУТЬ_КУКИ, httponly=True, secure=безопасная_кука,
                         samesite='strict')
        return ответ

    @app.post('/api/admin/logout')
    async def выйти(запрос: Request):
        я, отказ = await доступ(запрос, 'viewer', True)
        т = токен_из(запрос)
        if т:
            await run_in_threadpool(админы.отозвать_по_хэшу, хэш_токена(т))
        if я:
            await run_in_threadpool(админы.записать, я, 'выход')
        ответ = ок({'ок': True})
        ответ.delete_cookie(КУКА, path=ПУТЬ_КУКИ, secure=безопасная_кука, httponly=True, samesite='strict')
        return ответ if отказ is None or отказ.status_code == 401 else отказ

    @app.get('/api/admin/me')
    async def я_(запрос: Request):
        я, отказ = await доступ(запрос)
        if отказ:
            return отказ
        return ок({'email': я['email'], 'роль': я['роль'], 'имя': я['имя']})

    @app.get('/api/admin/sessions')
    async def мои_сеансы(запрос: Request):
        я, отказ = await доступ(запрос)
        if отказ:
            return отказ
        этот = хэш_токена(токен_из(запрос) or '')
        с = await run_in_threadpool(админы.сеансы, я['id'], сейчас())
        return ок({'сеансы': [{'id': з['хэш'][:16], 'создан': з['создан'], 'был': з['был'], 'устройство': з['устройство'],
                               'этот': з['хэш'] == этот} for з in с]})

    @app.post('/api/admin/sessions/revoke')
    async def отозвать(запрос: Request):
        я, отказ = await доступ(запрос, 'viewer', True)
        if отказ:
            return отказ
        д = await тело(запрос)
        if isinstance(д, JSONResponse):
            return д
        if not await run_in_threadpool(админы.отозвать, я['id'], str(д.get('id', ''))):
            return ошибка(404, 'session')
        await run_in_threadpool(админы.записать, я, 'сеанс завершён', str(д.get('id', ''))[:16])
        return ок({'ок': True})

    # ───────────── админы (только владелец) ─────────────
    @app.get('/api/admin/users')
    async def админы_список(запрос: Request):
        я, отказ = await доступ(запрос, 'owner')
        if отказ:
            return отказ
        return ок({'админы': [наружу(п) for п in await run_in_threadpool(админы.список)]})

    @app.post('/api/admin/users')
    async def админы_добавить(запрос: Request):
        я, отказ = await доступ(запрос, 'owner', True)
        if отказ:
            return отказ
        д = await тело(запрос)
        if isinstance(д, JSONResponse):
            return д
        почта, роль, имя = норм_почта(д.get('email')), д.get('role'), д.get('name', '')
        if not почта:
            return ошибка(400, 'email')
        if роль not in РОЛИ:
            return ошибка(400, 'role')
        if not isinstance(имя, str) or len(имя.strip()) > 80:
            return ошибка(400, 'name')
        ид = await run_in_threadpool(админы.добавить, почта, роль, имя.strip(), я['id'])
        if ид is None:
            return ошибка(409, 'exists')
        await run_in_threadpool(админы.записать, я, 'админ добавлен', почта, {'роль': роль})
        return ок({'ок': True, 'id': ид})

    @app.post('/api/admin/users/update')
    async def админы_изменить(запрос: Request):
        я, отказ = await доступ(запрос, 'owner', True)
        if отказ:
            return отказ
        д = await тело(запрос)
        if isinstance(д, JSONResponse):
            return д
        ид = д.get('id')
        if not isinstance(ид, int) or isinstance(ид, bool):
            return ошибка(400, 'id')
        цель = await run_in_threadpool(админы.по_id, ид)
        if not цель:
            return ошибка(404, 'user')
        роль, имя, отключён = д.get('role'), д.get('name'), д.get('disabled')
        if роль is not None and роль not in РОЛИ:
            return ошибка(400, 'role')
        if имя is not None and (not isinstance(имя, str) or len(имя.strip()) > 80):
            return ошибка(400, 'name')
        if отключён is not None and not isinstance(отключён, bool):
            return ошибка(400, 'disabled')
        if цель['email'] in владельцы and ((роль and роль != 'owner') or отключён):
            return ошибка(409, 'env_owner')
        if цель['id'] == я['id'] and ((роль and роль != 'owner') or отключён):
            return ошибка(409, 'self')
        await run_in_threadpool(админы.изменить, ид, роль, имя.strip() if isinstance(имя, str) else None, отключён)
        await run_in_threadpool(админы.записать, я, 'админ изменён', цель['email'],
                                {к: з for к, з in (('роль', роль), ('имя', имя), ('отключён', отключён)) if з is not None})
        return ок({'ок': True})

    @app.post('/api/admin/users/remove')
    async def админы_удалить(запрос: Request):
        я, отказ = await доступ(запрос, 'owner', True)
        if отказ:
            return отказ
        д = await тело(запрос)
        if isinstance(д, JSONResponse):
            return д
        ид = д.get('id')
        if not isinstance(ид, int) or isinstance(ид, bool):
            return ошибка(400, 'id')
        цель = await run_in_threadpool(админы.по_id, ид)
        if not цель:
            return ошибка(404, 'user')
        if цель['email'] in владельцы:
            return ошибка(409, 'env_owner')
        if цель['id'] == я['id']:
            return ошибка(409, 'self')
        await run_in_threadpool(админы.удалить, ид)
        await run_in_threadpool(админы.записать, я, 'админ удалён', цель['email'])
        return ок({'ок': True})

    @app.get('/api/admin/audit')
    async def журнал_(запрос: Request):
        я, отказ = await доступ(запрос, 'admin')
        if отказ:
            return отказ
        try:
            предел = int(запрос.query_params.get('limit', '100'))
        except ValueError:
            return ошибка(400, 'limit')
        return ок({'записи': await run_in_threadpool(админы.журнал, предел)})

    # ───────────── статистика ─────────────
    @app.get('/api/admin/stats')
    async def сводка(запрос: Request):
        я, отказ = await доступ(запрос, 'viewer')
        if отказ:
            return отказ
        try:
            дней = int(запрос.query_params.get('days', '30'))
        except ValueError:
            return ошибка(400, 'days')
        if дней not in (1, 7, 30, 90):
            return ошибка(400, 'days')
        if статистика is None:
            return ошибка(503, 'stats')
        return ок(await run_in_threadpool(статистика.сводка, дней, сейчас()))

    return доступ
