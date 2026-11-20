"""Фикстура официальных таблиц для app/scripts/test-prayer.mjs и e2e (scripts/fixtures/prayer-official-tables.json).

Владелец 20.11.2026: «Время намаза Казахстан, Узбекистан бери из официальных источников… один в один». Тест проверяет,
что показываемое время = официальная таблица (0 мин) и сколько расходится свой расчёт.

  kz — 16 городов: таблицы ДУМК 2026, скачанные И ПРИНЯТЫЕ server/prayer.py (prayer.таблица_думк: два одинаковых ответа
       api.muftyat.kz подряд, проверка формы, порядка и сверки ≤ 10 мин). Папка — JSON {дни, точка} на пункт-год.
  uz — 14 центров вилоятов (Ташкент, Нурафшон, …, Нукус): таблица 2026 по правилу УМУз в точке региона —
       prayer.таблица_умуз с server/tests/fixtures/umuz-regions.json (точки 16 городов — снимок списка islom.uz из
       NamazBar; живой список new.islom.uz из сессии закрыт), модель 'nuqta'.
Формат дня — 24 цифры «ЧЧММ» × 6 (фаджр, восход, зухр, аср, магриб, иша), дни через пробел.

Запуск (из корня, нужен adhanpy==1.0.5): python -I tools/prayer/make_official_fixture.py <папка таблиц ДУМК>
"""
from __future__ import annotations

import json
import pathlib
import sys

КОРЕНЬ = pathlib.Path(__file__).resolve().parents[2]
sys.path.insert(0, str(КОРЕНЬ / 'server'))

import prayer  # noqa: E402

KZ = ['almaty', 'astana', 'shymkent', 'karaganda', 'aktobe', 'taraz', 'pavlodar', 'ust-kamenogorsk', 'semey', 'atyrau',
      'kostanay', 'kyzylorda', 'uralsk', 'petropavlovsk', 'aktau', 'turkestan']
UZ = ['toshkent', 'nurafshon', 'andijon', 'buxoro', 'fargona', 'jizzax', 'namangan', 'navoiy', 'qarshi', 'samarqand',
      'guliston', 'termiz', 'urganch', 'nukus']
ВЫХОД = КОРЕНЬ / 'app/scripts/fixtures/prayer-official-tables.json'


def сжать(дни: list[list[str]]) -> str:
    return ' '.join(''.join(в.replace(':', '') for в in с) for с in дни)


def главный() -> None:
    папка = pathlib.Path(sys.argv[1])
    kz = {}
    for п in KZ:
        т = json.loads((папка / f'{п}-2026.json').read_text(encoding='utf-8'))
        prayer.проверить_таблицу(т['дни'], 2026, None, 10)
        kz[п] = {'точка': т['точка'], 'метод': 'table', 'дни': сжать(т['дни'])}
    регионы = prayer.разобрать_регионы(json.loads((КОРЕНЬ / 'server/tests/fixtures/umuz-regions.json').read_text(encoding='utf-8')))
    uz = {}
    for п in UZ:
        т = prayer.таблица_умуз(п, 2026, регионы, 'nuqta', 10)
        uz[п] = {'точка': т['точка'], 'метод': 'rule', 'дни': сжать(т['дни'])}
    данные = {
        'описание': 'Официальные таблицы 2026 для тестов (test-prayer.mjs, e2e-official.mjs). kz — таблицы ДУМК '
        '(api.muftyat.kz), принятые server/prayer.py 20.11.2026; uz — правило УМУз в точке региона (server/prayer.py, '
        'точки — снимок списка islom.uz). Собрано tools/prayer/make_official_fixture.py. День — 24 цифры ЧЧММ × 6.',
        'год': 2026,
        'kz': kz,
        'uz': uz,
    }
    ВЫХОД.write_text(json.dumps(данные, ensure_ascii=False, indent=1) + '\n', encoding='utf-8')
    print(f'{len(kz)} + {len(uz)} таблиц → {ВЫХОД.relative_to(КОРЕНЬ)} ({ВЫХОД.stat().st_size} байт)')


if __name__ == '__main__':
    главный()
