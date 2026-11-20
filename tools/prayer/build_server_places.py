"""Список пунктов для официального времени намаза на сервере: server/prayer_places.json.

Владелец 20.11.2026: «Время намаза Казахстан, Узбекистан бери из официальных источников… чтобы с местными один в один».
Сервер отдаёт таблицу только для пунктов из наших списков (клиент шлёт id пункта, не координаты), поэтому ему нужен
тот же список: id → точка ведомства.

  KZ (168): id места приложения → пункт ДУМК {id, title, lat, lng} — СТРОКИ координат как в /cities/ (API ДУМК отвечает
    только на точные координаты своих пунктов). Сопоставление: то же название (kk или ru; «… қаласы», «… ауылы»
    отброшены, казахские буквы свёрнуты), из нескольких — ближайший; нет имени — ближайший пункт ДУМК не дальше 3 км.
  UZ (176): id места → наши координаты и названия. Точка УМУз (регион) выбирается на сервере по официальному списку
    регионов (server/prayer.py, ближайший регион), потому что список регионов сервер берёт у источника сам.

Запуск (из корня репозитория): python -I tools/prayer/build_server_places.py [--cities dump.json]
  --cities — сохранённая выгрузка всех страниц https://api.muftyat.kz/cities/ (JSON-список); без неё скрипт скачает
  57 страниц по одной с паузой 1 с. Пишет server/prayer_places.json; печатает пункты дальше 15 км и без пары.
"""
from __future__ import annotations

import argparse
import json
import math
import pathlib
import time
import urllib.request

КОРЕНЬ = pathlib.Path(__file__).resolve().parents[2]
МЕСТА_KZ = КОРЕНЬ / 'app/src/prayer/places-kz.json'
МЕСТА_UZ = КОРЕНЬ / 'app/src/prayer/places-uz.json'
ВЫХОД = КОРЕНЬ / 'server/prayer_places.json'
ХВОСТЫ = (' қаласы', ' ауылы', ' кенті', ' селосы', ' поселкесі', ' ауылдық округі')
# Названия, которые у ДУМК другие: посёлок Индербор — пункт «Индер» (3 км).
ПСЕВДОНИМЫ = {'inderborskiy': 'Индер'}
БУКВЫ = str.maketrans({'ә': 'а', 'қ': 'к', 'ө': 'о', 'ұ': 'у', 'ү': 'у', 'ғ': 'г', 'ң': 'н', 'һ': 'х', 'і': 'и', 'ё': 'е', 'ы': 'и', 'й': 'и'})


def свернуть(с: str) -> str:
    с = с.strip().lower()
    for х in ХВОСТЫ:
        if с.endswith(х):
            с = с[: -len(х)]
    с = с.split('(')[0].strip()
    return с.translate(БУКВЫ).replace('-', ' ').replace('ь', '').replace('ъ', '')


def км(ш1: float, д1: float, ш2: float, д2: float) -> float:
    р = math.pi / 180
    х = math.sin((ш2 - ш1) * р / 2) ** 2 + math.cos(ш1 * р) * math.cos(ш2 * р) * math.sin((д2 - д1) * р / 2) ** 2
    return 2 * 6371 * math.asin(min(1, math.sqrt(х)))


def скачать_пункты() -> list[dict]:
    итог, адрес = [], 'https://api.muftyat.kz/cities/'
    while адрес:
        запрос = urllib.request.Request(адрес, headers={'User-Agent': 'aiustaz-places/1.0', 'Accept': 'application/json'})
        for попытка in range(4):  # API ДУМК иногда рвёт соединение — повтор с паузой
            try:
                with urllib.request.urlopen(запрос, timeout=40) as о:
                    стр = json.load(о)
                break
            except OSError:
                if попытка == 3:
                    raise
                time.sleep(5)
        итог += стр['results']
        адрес = стр.get('next')
        time.sleep(1)
    return итог


def главный() -> None:
    п = argparse.ArgumentParser()
    п.add_argument('--cities')
    арг = п.parse_args()
    пункты = json.loads(pathlib.Path(арг.cities).read_text(encoding='utf-8')) if арг.cities else скачать_пункты()
    print('пунктов ДУМК:', len(пункты))
    # У ДУМК есть пункты с одинаковыми координатами (Есік қаласы и Есік, Абай қаласы и Дуаншы): на них API отвечает 500
    # (исследование 13). Такие пункты помечаем «дубль» — сервер их не скачивает, клиент считает сам.
    точки: dict[tuple[str, str], int] = {}
    for х in пункты:
        точки[(х['lat'], х['lng'])] = точки.get((х['lat'], х['lng']), 0) + 1
    по_имени: dict[str, list[dict]] = {}
    for х in пункты:
        по_имени.setdefault(свернуть(х['title']), []).append(х)

    kz = json.loads(МЕСТА_KZ.read_text(encoding='utf-8'))
    и = {имя: i for i, имя in enumerate(kz['поля'])}
    пары: dict[str, list] = {}
    for з in kz['места']:
        ид, ш, д = з[и['id']], з[и['широта']], з[и['долгота']]
        имена = {свернуть(з[и['kk']]), свернуть(з[и['ru']]), свернуть(ПСЕВДОНИМЫ.get(ид, ''))} - {''}
        кандидаты = [х for имя in имена for х in по_имени.get(имя, [])]
        # Город и посёлок с одним именем (Жаңатас қаласы и Жаңатас в Сарысуском районе) — берём «… қаласы», если рядом.
        def ключ(х: dict) -> tuple:
            р = км(ш, д, float(х['lat']), float(х['lng']))
            return (0 if х['title'].endswith(' қаласы') and р <= 15 else 1, р)

        лучший = min(кандидаты, key=ключ, default=None)
        как = 'имя'
        if лучший is None or км(ш, д, float(лучший['lat']), float(лучший['lng'])) > 60:
            лучший = min(пункты, key=lambda х: км(ш, д, float(х['lat']), float(х['lng'])))
            как = 'рядом'
            if км(ш, д, float(лучший['lat']), float(лучший['lng'])) > 3:
                print('НЕТ ПАРЫ:', ид, з[и['ru']])
                continue
        расст = км(ш, д, float(лучший['lat']), float(лучший['lng']))
        if расст > 15 or как != 'имя':
            print(f'  {ид}: {лучший["title"]} ({как}, {расст:.1f} км)')
        пары[ид] = [int(лучший['id']), лучший['lat'], лучший['lng'], лучший['title']]
        if точки[(лучший['lat'], лучший['lng'])] > 1:
            пары[ид].append('дубль')
            print(f'  {ид}: у ДУМК два пункта с точкой {лучший["lat"]}, {лучший["lng"]} — API отвечает 500, таблицы не будет')

    uz = json.loads(МЕСТА_UZ.read_text(encoding='utf-8'))
    и = {имя: i for i, имя in enumerate(uz['поля'])}
    места_uz = {з[и['id']]: [з[и['широта']], з[и['долгота']], з[и['ru']]] for з in uz['места']}

    данные = {
        'версия': 1,
        'описание': 'Пункты для официального времени намаза на сервере (server/prayer.py). Собрано '
        'tools/prayer/build_server_places.py — руками не править. kz: id места приложения → [id пункта ДУМК, широта, '
        'долгота (строки, как в api.muftyat.kz/cities/), название ДУМК, ("дубль" — у ДУМК два пункта с этой точкой, '
        'API отвечает 500: таблицы нет, приложение считает само)]. uz: id места → [широта, долгота, название ru] '
        '(GeoNames, как в приложении); регион УМУз сервер выбирает сам по официальному списку регионов.',
        'kz': dict(sorted(пары.items())),
        'uz': dict(sorted(места_uz.items())),
    }
    ВЫХОД.write_text(json.dumps(данные, ensure_ascii=False, separators=(',', ':')).replace('],"', '],\n"') + '\n', encoding='utf-8')
    print(f'KZ: {len(пары)} из {len(kz["места"])}, UZ: {len(места_uz)} → {ВЫХОД.relative_to(КОРЕНЬ)}')


if __name__ == '__main__':
    главный()
