"""Тестовый сервер админки: настоящий API (server/app.py-модули) на ВРЕМЕННОЙ базе mugalim_test_* с выдуманными данными.

Для admin/e2e-admin.mjs (снимки и проверки страниц). Прод-данные не трогает (CLAUDE.md): база создаётся на сервере из
MUGALIM_TEST_PG и удаляется при выходе. Письма не отправляются: код входа отдаёт GET /__test/code (только здесь).
Отдаёт: /api/… (stats, admin, content_admin, feedback), /admin/ (server/admin_static), /aiustaz/ (app/dist — файлы Корана и хадисов).
Запуск: MUGALIM_TEST_PG=postgresql://postgres@127.0.0.1:55432/postgres python3 admin/test_server.py <порт>
"""
from __future__ import annotations

import atexit
import os
import pathlib
import random
import secrets
import sys
import time

КОРЕНЬ = pathlib.Path(__file__).resolve().parent.parent
sys.path.insert(0, str(КОРЕНЬ / 'server'))

import psycopg  # noqa: E402
import uvicorn  # noqa: E402
from fastapi import FastAPI  # noqa: E402
from fastapi.responses import JSONResponse  # noqa: E402
from fastapi.staticfiles import StaticFiles  # noqa: E402
from psycopg.conninfo import conninfo_to_dict, make_conninfo  # noqa: E402

import admin  # noqa: E402
import content_admin  # noqa: E402
import feedback  # noqa: E402
import stats  # noqa: E402
from db import Хранилище  # noqa: E402

ВЛАДЕЛЕЦ = 'owner@example.org'
CSP = ("default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data: blob:; font-src 'self'; "
       "media-src 'self' https://cdn.islamic.network; connect-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'self'")


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


def заполнить(х: Хранилище, статистика: stats.ХранилищеСтатистики, сейчас: int) -> None:
    """30 дней выдуманных посещений: рост, вечерние часы, разные экраны, языки и источники."""
    с = random.Random(7)
    экраны = [('', None), ('quran', None), ('quran/sura', 1), ('quran/sura', 36), ('quran/sura', 67), ('quran/sura', 2),
              ('dhikr', None), ('dhikr/item', 3), ('prayer', None), ('hadith', None), ('hadith/item', 1751), ('qibla', None),
              ('namaz', None), ('namaz/section', 2), ('dua', None), ('more', None), ('lesson', 1), ('makharij', None)]
    устройства = [secrets.token_urlsafe(15) for _ in range(140)]
    полночь = сейчас - (сейчас + 5 * 3_600_000) % 86_400_000  # начало сегодняшнего дня по Алматы
    for день in range(29, -1, -1):
        активных = int(6 + (29 - день) * 1.6 + с.randint(0, 6))
        for sid in с.sample(устройства[: min(len(устройства), 20 + (29 - день) * 4)], k=min(активных, 20 + (29 - день) * 4)):
            for _ in range(с.choice([1, 1, 1, 2])):
                час = с.choice([5, 6, 7, 12, 13, 17, 18, 19, 20, 21, 21, 22, 23])
                момент = полночь - день * 86_400_000 + час * 3_600_000 + с.randint(0, 3_000_000)
                if момент > сейчас:
                    continue
                пакет = stats.Пакет(sid, secrets.token_urlsafe(15), с.choice(['kk', 'kk', 'ru', 'ru', 'ru', 'uz', 'en']),
                                    с.choice(['phone'] * 8 + ['desktop', 'tablet']), с.choice(['android'] * 6 + ['ios'] * 3 + ['windows']),
                                    с.random() < 0.3, с.choice(['', '', '', 'instagram.com', 'wa.me', 'l.facebook.com', 'google.com', 't.me']),
                                    'db95110',
                                    [stats.Событие('o')] + [stats.Событие('v', *с.choice(экраны)) for _ in range(с.randint(1, 5))]
                                    + [stats.Событие('b', с.choice(экраны)[0], секунд=30)])
                статистика.принять(пакет, момент)
                for _ in range(с.randint(0, 8)):
                    момент += 30_000
                    статистика.принять(stats.Пакет(sid, пакет.сеанс, пакет.язык, пакет.устройство, пакет.система, пакет.установлено, '',
                                                   'db95110', [stats.Событие('b', с.choice(экраны)[0], секунд=30)]), момент)
    админы = admin.ХранилищеАдминов(х)
    админы.обеспечить_владельцев([ВЛАДЕЛЕЦ])
    админы.добавить('brat@example.org', 'admin', 'Брат Ахмад', 1)
    админы.добавить('ustaz@example.org', 'viewer', 'Устаз Мурат', 1)
    с_ = content_admin.ХранилищеСодержимого(х)
    с_.задать_чтецов(['husary', 'husary-mujawwad', 'abdulbasit', 'ayyub', 'suwayd'], 'husary', ВЛАДЕЛЕЦ)
    с_.отметить_хадис(1751, None, 'Устаз Мурат', '2026-11-27', ВЛАДЕЛЕЦ)
    с_.отметить_хадис(2750, True, None, '2026-11-27', ВЛАДЕЛЕЦ)
    админы.записать({'id': 1, 'email': ВЛАДЕЛЕЦ}, 'чтецы изменены', '', {'версия': 1})
    админы.записать({'id': 1, 'email': ВЛАДЕЛЕЦ}, 'хадис: проверено устазом: Устаз Мурат', '1751')
    # «Сообщить об ошибке» (владелец 28.11.2026): выдуманные сообщения из приложения.
    сообщения = feedback.ХранилищеСообщений(х)
    for минут, д in ((300, {'cat': 'quran', 'quote': 'Мадд таби‘и — 2 счёта', 'route': '#/quran/sura?n=2&a=255', 'ref': '2:255',
                            'text': 'Здесь мадд муттасыль, должно быть 4 счёта, а написано 2 счёта.', 'contact': '@kari_test'}),
                     (120, {'cat': 'translation', 'quote': 'Деяния оцениваются по намерениям', 'route': '#/hadith/item?n=1751',
                            'ref': 'hadith:1751', 'text': 'В казахском переводе пропущено слово «тек».'}),
                     (45, {'cat': 'prayer', 'route': '#/prayer', 'text': 'Аср в Шымкенте на 2 минуты раньше, чем у ДУМК.'}),
                     (5, {'cat': 'ui', 'route': '#/more', 'text': 'Кнопка «Обновить» перекрывает заголовок на iPhone SE.'})):
        з = feedback.разобрать({'ver': 'e3d79e2', 'lang': 'ru', 'theme': 'light', 'dev': 'phone', **д})
        сообщения.добавить(з, сейчас - минут * 60_000)


def main() -> None:
    порт = int(sys.argv[1]) if len(sys.argv) > 1 else 8099
    х = Хранилище(временная_база())
    х.применить_миграции()
    сейчас = int(time.time() * 1000)
    статистика = stats.ХранилищеСтатистики(х)
    заполнить(х, статистика, сейчас)
    коды: list[str] = []
    app = FastAPI()

    @app.middleware('http')
    async def заголовки(запрос, далее):
        ответ = await далее(запрос)
        if запрос.url.path.startswith('/admin'):
            ответ.headers['Content-Security-Policy'] = CSP
            ответ.headers['Cache-Control'] = 'no-cache'
        return ответ

    ключ = lambda запрос: 'ip:тест'  # noqa: E731
    stats.register(app, статистика=статистика, хранилище=х, ключ_лимита=ключ, источники=f'http://127.0.0.1:{порт}')
    админы = admin.ХранилищеАдминов(х)
    доступ = admin.register(app, админы=админы, хранилище=х, статистика=статистика,
                            отправить_код=lambda почта, код: коды.append(код) or True, секрет='тест', ключ_лимита=ключ,
                            владельцы=frozenset({ВЛАДЕЛЕЦ}), источники=f'http://127.0.0.1:{порт}', безопасная_кука=False)
    content_admin.register(app, содержимое=content_admin.ХранилищеСодержимого(х), доступ=доступ, админы=админы)
    feedback.register(app, сообщения=feedback.ХранилищеСообщений(х), хранилище=х, доступ=доступ, админы=админы,
                      ключ_лимита=ключ, источники=f'http://127.0.0.1:{порт}')

    @app.get('/__test/code')
    async def код():
        return JSONResponse({'code': коды[-1] if коды else None})

    app.mount('/admin', StaticFiles(directory=КОРЕНЬ / 'server' / 'admin_static', html=True), name='admin')
    app.mount('/aiustaz', StaticFiles(directory=os.environ.get('DIST', КОРЕНЬ / 'app' / 'dist')), name='aiustaz')
    uvicorn.run(app, host='127.0.0.1', port=порт, log_level='warning')


if __name__ == '__main__':
    main()
