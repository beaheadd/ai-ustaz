"""Фикстура для юнит-теста времени намаза приложения (app/scripts/test-prayer.mjs).

Назначение: сверить две реализации одного метода ДУМК между собой — JS в приложении
(app/src/prayer/times.ts, adhan-js 4.4.6) и Python-эталон ours() из tools/prayer/compare_dumk.py
(adhanpy 1.0.5), который сам сверен с официальными таблицами ДУМК (исследование 13).
В фикстуре — только СВОИ расчёты, не таблицы ДУМК (их в репозиторий не кладём: разрешения нет).

Контракт: python -I tools/prayer/make_fixture.py [выход.json]
  по умолчанию пишет app/scripts/fixtures/prayer-reference.json:
  { "описание", "эталон", "места": { id: [широта, долгота] }, "дни": [...],
    "времена": { id: { день: { fajr|sunrise|dhuhr|asr|maghrib|isha: "ЧЧ:ММ" по UTC+5 } } } }
Координаты мест — как в app/src/prayer/places-kz.json (те же точки, что видит пользователь).
Нужен pip install adhanpy==1.0.5 (сети не нужно).
"""
import datetime as dt
import json
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from compare_dumk import TZ, ours  # noqa: E402  (main() сверки с сетью не запускается)

КОРЕНЬ = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
ВЫХОД = os.path.join(КОРЕНЬ, 'app', 'scripts', 'fixtures', 'prayer-reference.json')
МЕСТА_ФАЙЛ = os.path.join(КОРЕНЬ, 'app', 'src', 'prayer', 'places-kz.json')

# Юг (±3), север (±5), крайний север (летом работает правило высоких широт), запад и Кызылорда.
МЕСТА = ['almaty', 'astana', 'petropavlovsk', 'kyzylorda', 'aktau']
# По дате в месяц, среди них солнцестояния и равноденствия.
ДНИ = ['2026-01-01', '2026-02-14', '2026-03-20', '2026-04-15', '2026-05-28', '2026-06-21',
       '2026-07-15', '2026-08-30', '2026-09-23', '2026-10-31', '2026-11-19', '2026-12-21']


def координаты():
    with open(МЕСТА_ФАЙЛ, encoding='utf-8') as ф:
        данные = json.load(ф)
    поля = данные['поля']
    итог = {}
    for запись in данные['места']:
        м = dict(zip(поля, запись))
        if м['id'] in МЕСТА:
            итог[м['id']] = [м['широта'], м['долгота']]
    нет = [и for и in МЕСТА if и not in итог]
    if нет:
        raise SystemExit('нет мест в places-kz.json: ' + ', '.join(нет))
    return {и: итог[и] for и in МЕСТА}


def main():
    выход = sys.argv[1] if len(sys.argv) > 1 else ВЫХОД
    места = координаты()
    времена = {}
    for и, (ш, д) in места.items():
        времена[и] = {}
        for день in ДНИ:
            о = ours(ш, д, dt.date.fromisoformat(день))
            времена[и][день] = {к: в.astimezone(TZ).strftime('%H:%M') for к, в in о.items()}
    данные = {
        'описание': 'Свои расчёты Python-эталона (tools/prayer/compare_dumk.py: ours, adhanpy 1.0.5) по методу ДУМК; '
                    'НЕ таблицы ДУМК. Создано tools/prayer/make_fixture.py — руками не править.',
        'эталон': 'adhanpy 1.0.5',
        'места': места,
        'дни': ДНИ,
        'времена': времена,
    }
    os.makedirs(os.path.dirname(выход), exist_ok=True)
    with open(выход, 'w', encoding='utf-8') as ф:
        json.dump(данные, ф, ensure_ascii=False, indent=1)
        ф.write('\n')
    print(f'{выход}: {len(места)} мест × {len(ДНИ)} дней × 6 времён')


if __name__ == '__main__':
    main()
