"""Официальное время намаза Казахстана (ДУМК) и Узбекистана (УМУз) — годовые таблицы по пунктам наших списков.

Решение владельца 20.11.2026: «Время намаза Казахстан, Узбекистан бери из официальных источников… чтобы с местными один в
один у нас время было. А остальные по такой методологии можно считать» (+ можно через API). Прежняя оговорка
исследования 13 («без письменного разрешения ДУМК не используем») заменена этим решением; письмо в ДУМК — в силе.
Источники, хосты и риски — docs/исследование/13-время-намаза-думк.md и 15-время-намаза-мир.md.

Контракт API (только чтение из своей БД; наружу API не ходит — скачивает mugalim-jobs):
  GET /api/prayer/official?src=dumk|umuz&place=<id места из списка приложения>&year=<год>
    200 {src, place, year, start:'ГГГГ-01-01', offset:300, days:[[фаджр, восход, зухр, аср, магриб, иша] 'ЧЧ:ММ' по
         местному времени × 365/366], point:{id, name}, method:'table'|'rule', updated:'ГГГГ-ММ-ДД', checked, sha}
        ETag = sha, Cache-Control: public, max-age=86400; If-None-Match → 304.
    400 {ошибка:'src'|'place'|'year'} — источник не тот, пункта нет в списке (координат не принимаем), год не из
        [текущий − 1, текущий + 1]; 404 {ошибка:'not_ready'} — таблицы ещё нет (ставим в очередь, jobs скачает за минуту);
    404 {ошибка:'no_official'} — у ведомства таблицы для пункта нет (5 пунктов ДУМК с одинаковыми точками: API — 500);
    429 — больше 60 запросов в минуту с IP (ключ — хэш IP, сам IP нигде не пишем).
  Клиент шлёт только id пункта из списка на устройстве (KZ 168, UZ 176) — не координаты пользователя.

Источники:
  dumk — https://api.muftyat.kz/prayer-times/<год>/<широта>/<долгота> (внутренний API сайта muftyat.kz, без документации):
    отвечает только на точные координаты своих пунктов (server/prayer_places.json, строки как в /cities/). Таблицу
    принимаем, если два скачивания подряд совпали и проверка прошла (бывают разовые несогласованные ответы).
  umuz — официального API у УМУз нет (muslim.uz). Время УМУз — правило, которое публикует сайт islom.uz в своём коде и
    которому равен muslim.uz: adhan, фаджр и иша 15,5°, аср ханафи, шом = закат + 4 мин (сверки третьих сторон 15.08 и
    25–26.09.2026). Точки — официальный список регионов https://new.islom.uz/api/v1/regions (id, name, latitude,
    longitude, differ_minute). Модель MUGALIM_UMUZ_MODEL: 'nuqta' (по умолчанию — расчёт в точке региона, как страница
    islom.uz/taqvim) или 'farq' (Ташкент + differ_minute региона, как печатный Рамазон-тақвим). Пункт → ближайший регион
    (≤ 80 км). method:'rule' в ответе — честно: таблицу посчитал сервер по правилу и точке ведомства.
Проверка таблицы (проверить_таблицу): 365/366 дней подряд, 6 времён «ЧЧ:ММ», порядок фаджр < восход < зухр < аср <
  магриб < иша, сверка со своим расчётом тем же методом: расхождение больше MUGALIM_PRAYER_MAX_DIFF_MIN (10) — не
  принимаем, в журнал. Принятая таблица не меняется, пока новая не пройдёт ту же проверку.

Сборка: register(app, хранилище=, ключ_лимита=, часы=) — маршрут; шаг_обновления(хранилище, скачать, сейчас) — фоновое
обновление (jobs.py, отдельный поток). Своя проверка — adhanpy 1.0.5 (MIT), округление — своё (как adhan-js).
"""
from __future__ import annotations

import hashlib
import json
import logging
import math
import pathlib
import re
import time
import urllib.request
from dataclasses import dataclass
from datetime import date, datetime, timedelta, timezone
from typing import Callable

from fastapi import Request
from fastapi.concurrency import run_in_threadpool
from fastapi.responses import JSONResponse, Response

from envnum import строка_из_окружения, целое_из_окружения

журнал = logging.getLogger('mugalim.prayer')

КЛЮЧИ = ('fajr', 'sunrise', 'dhuhr', 'asr', 'maghrib', 'isha')
ИСТОЧНИКИ = ('dumk', 'umuz')
СТРАНА = {'dumk': 'kz', 'umuz': 'uz'}
СМЕЩЕНИЕ_МИН = 300  # вся РК (с 01.03.2024) и весь Узбекистан — UTC+5 без летнего времени
ПОЯС = timezone(timedelta(minutes=СМЕЩЕНИЕ_МИН))
ДЕНЬ_МС = 86_400_000
ПУНКТЫ_ФАЙЛ = pathlib.Path(__file__).resolve().parent / 'prayer_places.json'
АДРЕС_ДУМК = 'https://api.muftyat.kz/prayer-times/{год}/{широта}/{долгота}'
АДРЕС_РЕГИОНОВ_УМУЗ = 'https://new.islom.uz/api/v1/regions'
ДАЛЬШЕ_РЕГИОНА_КМ = 80
ВРЕМЯ = re.compile(r'^([01][0-9]|2[0-3]):[0-5][0-9]$')
МЕСТО = re.compile(r'^[a-z0-9][a-z0-9-]{0,39}$')
АГЕНТ = 'aiustaz-server/1.0 (+https://aiustaz.pro)'


class ОшибкаИсточника(Exception):
    """Ответ ведомства не принят (форма, проверка, сеть). код — коротко латиницей, для журнала."""

    def __init__(self, код: str, подробно: str = '') -> None:
        super().__init__(f'{код}: {подробно}' if подробно else код)
        self.код = код
        self.подробно = подробно[:300]


# ───────────── пункты ─────────────
_пункты: dict | None = None


def пункты() -> dict:
    """server/prayer_places.json (tools/prayer/build_server_places.py): kz — 168, uz — 176."""
    global _пункты
    if _пункты is None:
        _пункты = json.loads(ПУНКТЫ_ФАЙЛ.read_text(encoding='utf-8'))
    return _пункты


def пункт(src: str, place: str) -> list | None:
    """Пункт из нашего списка или None. dumk → [id ДУМК, 'широта', 'долгота', название]; umuz → [широта, долгота, ru]."""
    if src not in ИСТОЧНИКИ or not isinstance(place, str) or not МЕСТО.match(place):
        return None
    return пункты()[СТРАНА[src]].get(place)


def без_таблицы(src: str, place: str) -> bool:
    """У ДУМК два пункта с этой точкой (Есік, Абай, Щучинск, Жітіқара, Тобыл): API отвечает 500 — таблицы нет."""
    п = пункт(src, place)
    return bool(п) and src == 'dumk' and len(п) > 4 and п[4] == 'дубль'


def все_пункты(src: str) -> list[str]:
    """Пункты, для которых таблицу можно получить (без «дублей» ДУМК)."""
    return sorted(id_ for id_ in пункты()[СТРАНА[src]] if not без_таблицы(src, id_))


# ───────────── дни и время ─────────────
def дней_в_году(год: int) -> int:
    return 366 if (год % 4 == 0 and год % 100 != 0) or год % 400 == 0 else 365


def минуты(чч_мм: str) -> int:
    ч, м = чч_мм.split(':')
    return int(ч) * 60 + int(м)


def чч_мм(мин: int) -> str:
    мин %= 1440
    return f'{мин // 60:02d}:{мин % 60:02d}'


def хэш_дней(дни: list[list[str]]) -> str:
    return hashlib.sha256(json.dumps(дни, separators=(',', ':')).encode('ascii')).hexdigest()


# ───────────── свой расчёт (проверка и правило УМУз) ─────────────
@dataclass(frozen=True)
class Метод:
    фаджр: float
    иша: float
    поправки: tuple[int, int, int, int, int, int]  # мин к fajr..isha
    высокие: str  # 'twilight' | 'middle'


ПРАВИЛО_УМУЗ = Метод(15.5, 15.5, (0, 0, 0, 0, 4, 0), 'middle')


def метод_думк(широта: float) -> Метод:
    п = 5 if широта >= 48 else 3
    return Метод(15.0, 15.0, (0, -п, п, п, п, 0), 'twilight')


def посчитать(широта: float, долгота: float, год: int, метод: Метод) -> list[list[str]]:
    """Годовая таблица по методу (adhanpy = adhan-js: сверено 2190 значений УЗ, 0 расхождений). Местное время UTC+5."""
    from adhanpy.PrayerTimes import PrayerTimes
    import adhanpy.PrayerTimes as _модуль
    from adhanpy.calculation.CalculationParameters import CalculationParameters
    from adhanpy.calculation.HighLatitudeRule import HighLatitudeRule
    from adhanpy.calculation.Madhab import Madhab

    # adhanpy 1.0.5 округляет с ошибками (ровно 30 с — вниз, в 59-ю минуту отбрасывает секунды): отключаем, округляем сами
    # (≥ 30 с — вверх, как adhan-js Rounding.Nearest и praytimes.js ДУМК). tools/prayer/compare_dumk.py — то же.
    _модуль.rounded_minute = lambda момент: момент
    п = CalculationParameters(fajr_angle=метод.фаджр, isha_angle=метод.иша)
    п.madhab = Madhab.HANAFI
    п.high_latitude_rule = HighLatitudeRule.TWILIGHT_ANGLE if метод.высокие == 'twilight' else HighLatitudeRule.MIDDLE_OF_THE_NIGHT
    итог = []
    день = date(год, 1, 1)
    for _ in range(дней_в_году(год)):
        в = PrayerTimes((широта, долгота), день, calculation_parameters=п, time_zone=timezone.utc)
        строка = []
        for i, к in enumerate(КЛЮЧИ):
            м = getattr(в, к)
            мин_utc = int((м + timedelta(seconds=30)).timestamp() // 60)
            местное = datetime.fromtimestamp(мин_utc * 60, tz=ПОЯС) + timedelta(minutes=метод.поправки[i])
            строка.append(местное.strftime('%H:%M'))
        итог.append(строка)
        день += timedelta(days=1)
    return итог


# ───────────── проверка таблицы ─────────────
def проверить_таблицу(дни: object, год: int, свой: list[list[str]] | None, предел_мин: int) -> int:
    """Бросает ОшибкаИсточника или возвращает наибольшее расхождение со своим расчётом (мин)."""
    if not isinstance(дни, list) or len(дни) != дней_в_году(год):
        raise ОшибкаИсточника('days', f'дней {len(дни) if isinstance(дни, list) else "?"}, нужно {дней_в_году(год)}')
    наиб = 0
    for i, строка in enumerate(дни):
        if not isinstance(строка, list) or len(строка) != 6 or not all(isinstance(в, str) and ВРЕМЯ.match(в) for в in строка):
            raise ОшибкаИсточника('shape', f'день {i + 1}: {str(строка)[:80]}')
        м = [минуты(в) for в in строка]
        if м[5] < м[4]:  # иша после полуночи (север летом) — следующие сутки
            м[5] += 1440
        if not all(м[j] < м[j + 1] for j in range(5)):
            raise ОшибкаИсточника('order', f'день {i + 1}: {" ".join(строка)}')
        if свой is not None:
            for j in range(6):
                р = abs(((минуты(строка[j]) - минуты(свой[i][j]) + 720) % 1440) - 720)
                наиб = max(наиб, р)
                if р > предел_мин:
                    raise ОшибкаИсточника('diff', f'день {i + 1}, {КЛЮЧИ[j]}: {строка[j]} против своего {свой[i][j]} ({р} мин)')
    return наиб


# ───────────── ДУМК ─────────────
def разобрать_думк(данные: object, год: int) -> list[list[str]]:
    """Ответ api.muftyat.kz → дни. Даты — подряд с 1 января; лишние поля (imsak, sunset, midnight) не берём."""
    строки = данные.get('result') if isinstance(данные, dict) else None
    if not isinstance(строки, list):
        raise ОшибкаИсточника('form', 'нет result')
    if len(строки) != дней_в_году(год):
        raise ОшибкаИсточника('days', f'дней {len(строки)}, нужно {дней_в_году(год)}')
    итог = []
    ожидаемый = date(год, 1, 1)
    for с in строки:
        if not isinstance(с, dict) or с.get('Date') != ожидаемый.isoformat():
            raise ОшибкаИсточника('date', f'ждали {ожидаемый.isoformat()}, пришло {str(с)[:80]}')
        итог.append([str(с.get(к, '')).strip() for к in КЛЮЧИ])
        ожидаемый += timedelta(days=1)
    return итог


def таблица_думк(place: str, год: int, скачать: Callable[[str], object], пауза: Callable[[], None], предел_мин: int) -> dict:
    п = пункт('dumk', place)
    if п is None:
        raise ОшибкаИсточника('place', place)
    if без_таблицы('dumk', place):
        raise ОшибкаИсточника('dup', 'у ДУМК два пункта с этой точкой — API отвечает 500')
    ид, ш, д, название = п[:4]
    адрес = АДРЕС_ДУМК.format(год=год, широта=ш, долгота=д)
    свой = посчитать(float(ш), float(д), год, метод_думк(float(ш)))
    принятые: list[tuple[str, list, int]] = []
    последняя: ОшибкаИсточника | None = None
    for попытка in range(3):  # два одинаковых принятых ответа подряд — таблица ДУМК (бывают разовые сбои ответа)
        if попытка:
            пауза()
        try:
            дни = разобрать_думк(скачать(адрес), год)
            наиб = проверить_таблицу(дни, год, свой, предел_мин)
        except ОшибкаИсточника as е:
            последняя = е
            continue
        х = хэш_дней(дни)
        if any(х == з[0] for з in принятые):
            return {'дни': дни, 'точка': {'id': str(ид), 'name': название}, 'способ': 'table', 'расхождение': наиб}
        принятые.append((х, дни, наиб))
    if последняя is not None and not принятые:
        raise последняя
    raise ОшибкаИсточника('unstable', 'два ответа подряд не совпали')


# ───────────── УМУз ─────────────
@dataclass(frozen=True)
class Регион:
    id: int
    name: str
    широта: float
    долгота: float
    поправка: int  # differ_minute — к Ташкенту, мин


def разобрать_регионы(данные: object) -> list[Регион]:
    """Ответ new.islom.uz/api/v1/regions (список или {data: [...]}) → регионы. Кривые записи отбрасываем."""
    список = данные.get('data') if isinstance(данные, dict) else данные
    if not isinstance(список, list):
        raise ОшибкаИсточника('form', 'нет списка регионов')
    итог: dict[int, Регион] = {}
    for з in список:
        if not isinstance(з, dict):
            continue
        try:
            р = Регион(int(з['id']), str(з.get('name') or '').strip()[:60], float(з['latitude']), float(з['longitude']),
                       int(float(str(з.get('differ_minute') or '0').strip())))
        except (KeyError, TypeError, ValueError):
            continue
        статус = з.get('status', 1)
        if str(статус) in ('0', 'False', 'false'):
            continue
        if 36.5 <= р.широта <= 46 and 55.5 <= р.долгота <= 74 and abs(р.поправка) <= 90 and р.name and р.id not in итог:
            итог[р.id] = р  # только точки в границах Узбекистана: соседние города (Бишкек, Ош, Туркестан) не берём
    if len(итог) < 10:
        raise ОшибкаИсточника('form', f'регионов {len(итог)}')
    return sorted(итог.values(), key=lambda р: р.id)


def км(ш1: float, д1: float, ш2: float, д2: float) -> float:
    р = math.pi / 180
    х = math.sin((ш2 - ш1) * р / 2) ** 2 + math.cos(ш1 * р) * math.cos(ш2 * р) * math.sin((д2 - д1) * р / 2) ** 2
    return 2 * 6371 * math.asin(min(1.0, math.sqrt(х)))


def ташкент(регионы: list[Регион]) -> Регион:
    for р in регионы:
        if р.id == 27 or р.name in ('Тошкент', 'Toshkent'):
            return р
    raise ОшибкаИсточника('form', 'нет Ташкента в списке регионов')


def регион_для(регионы: list[Регион], широта: float, долгота: float) -> tuple[Регион, float]:
    р = min(регионы, key=lambda р: км(широта, долгота, р.широта, р.долгота))
    return р, км(широта, долгота, р.широта, р.долгота)


def таблица_умуз(place: str, год: int, регионы: list[Регион], модель: str, предел_мин: int) -> dict:
    п = пункт('umuz', place)
    if п is None:
        raise ОшибкаИсточника('place', place)
    ш, д, _ = п
    р, расст = регион_для(регионы, ш, д)
    if расст > ДАЛЬШЕ_РЕГИОНА_КМ:
        raise ОшибкаИсточника('far', f'до региона «{р.name}» {расст:.0f} км')
    if модель == 'farq':
        т = ташкент(регионы)
        основа = посчитать(т.широта, т.долгота, год, ПРАВИЛО_УМУЗ)
        дни = [[чч_мм(минуты(в) + р.поправка) for в in строка] for строка in основа]
    else:
        дни = посчитать(р.широта, р.долгота, год, ПРАВИЛО_УМУЗ)
    свой = посчитать(ш, д, год, ПРАВИЛО_УМУЗ)  # правило в точке нашего места: ловит неверный регион
    наиб = проверить_таблицу(дни, год, свой, предел_мин)
    return {'дни': дни, 'точка': {'id': str(р.id), 'name': р.name}, 'способ': 'rule', 'расхождение': наиб}


# ───────────── сеть (только jobs) ─────────────
def скачать_json(адрес: str, таймаут: float = 30.0, макс_байт: int = 2_000_000) -> object:
    запрос = urllib.request.Request(адрес, headers={'User-Agent': АГЕНТ, 'Accept': 'application/json'})
    try:
        with urllib.request.urlopen(запрос, timeout=таймаут) as о:  # noqa: S310 — адреса только из констант модуля
            if о.status != 200:
                raise ОшибкаИсточника('http', str(о.status))
            сырое = о.read(макс_байт + 1)
    except ОшибкаИсточника:
        raise
    except Exception as е:  # noqa: BLE001 — сеть, TLS, HTTP 5xx: в журнал коротко
        raise ОшибкаИсточника('net', type(е).__name__ + ' ' + str(getattr(е, 'code', ''))) from е
    if len(сырое) > макс_байт:
        raise ОшибкаИсточника('size', str(len(сырое)))
    try:
        return json.loads(сырое)
    except ValueError as е:
        raise ОшибкаИсточника('json', '') from е


# ───────────── фоновое обновление ─────────────
def годы(сейчас_мс: int) -> list[int]:
    """Текущий год; с 1 ноября — и следующий (новый год — заранее)."""
    д = datetime.fromtimestamp(сейчас_мс / 1000, tz=ПОЯС)
    return [д.year, д.year + 1] if д.month >= 11 else [д.year]


def задачи(хранилище, сейчас_мс: int, предел: int, перепроверка_мс: int) -> list[tuple[str, str, int]]:
    """Что скачать: сначала то, что просили клиенты (очередь), потом нет таблицы, потом давно не сверенные. Пункт с
    неудачной попыткой — не чаще раза в час (ведомство не долбим)."""
    итог: list[tuple[str, str, int]] = []
    час_назад = сейчас_мс - 3_600_000
    недавние = хранилище.недавние_попытки_намаза(час_назад)
    допустимые = set(годы(сейчас_мс)) | {годы(сейчас_мс)[0] - 1}
    for з in хранилище.нужные_намаза(предел, час_назад):
        if з[2] in допустимые and пункт(з[0], з[1]) is not None and not без_таблицы(з[0], з[1]) and з not in итог:
            итог.append(з)
    есть = хранилище.какие_таблицы_намаза()
    for год in годы(сейчас_мс):
        for src in ИСТОЧНИКИ:
            for place in все_пункты(src):
                if len(итог) >= предел:
                    return итог
                з = (src, place, год)
                if з not in есть and з not in итог and з not in недавние:
                    итог.append(з)
    for з in хранилище.давно_проверенные_намаза(сейчас_мс - перепроверка_мс, предел):
        if len(итог) >= предел:
            break
        if з not in итог and з not in недавние and пункт(з[0], з[1]) is not None:
            итог.append(з)
    return итог


def регионы_умуз(хранилище, скачать: Callable[[str], object], сейчас_мс: int) -> list[Регион]:
    """Список регионов УМУз — раз в сутки с источника; не скачался — последний принятый из БД."""
    мета = хранилище.мета_намаза('umuz_regions')
    if мета and сейчас_мс - мета['при'] < ДЕНЬ_МС:
        return разобрать_регионы(мета['данные'])
    try:
        данные = скачать(строка_из_окружения('MUGALIM_UMUZ_REGIONS_URL', АДРЕС_РЕГИОНОВ_УМУЗ))
        регионы = разобрать_регионы(данные)
    except ОшибкаИсточника as е:
        хранилище.журнал_намаза('umuz', '-', 0, 'regions_' + е.код, е.подробно)
        if мета:
            return разобрать_регионы(мета['данные'])
        raise
    хранилище.записать_мету_намаза('umuz_regions', данные, сейчас_мс)
    return регионы


def шаг_обновления(хранилище, скачать: Callable[[str], object], сейчас_мс: int, *, предел: int = 12,
                   пауза: Callable[[], None] = lambda: time.sleep(2.0), стоп: Callable[[], bool] = lambda: False) -> dict:
    """Одна порция фонового обновления. Бережно к ведомству: запросы по одному, пауза между ними."""
    счёт = {'принято': 0, 'без_изменений': 0, 'отказ': 0}
    предел_мин = целое_из_окружения('MUGALIM_PRAYER_MAX_DIFF_MIN', 10, 1, 30)
    модель = строка_из_окружения('MUGALIM_UMUZ_MODEL', 'nuqta')
    модель = модель if модель in ('nuqta', 'farq') else 'nuqta'
    перепроверка = целое_из_окружения('MUGALIM_PRAYER_RECHECK_DAYS', 7, 1, 60) * ДЕНЬ_МС
    регионы: list[Регион] | None = None
    for src, place, год in задачи(хранилище, сейчас_мс, предел, перепроверка):
        if стоп():
            break
        try:
            if src == 'dumk':
                т = таблица_думк(place, год, скачать, пауза, предел_мин)
                пауза()
            else:
                if регионы is None:
                    регионы = регионы_умуз(хранилище, скачать, сейчас_мс)
                т = таблица_умуз(place, год, регионы, модель, предел_мин)
        except ОшибкаИсточника as е:
            счёт['отказ'] += 1
            хранилище.журнал_намаза(src, place, год, е.код, е.подробно)
            хранилище.отметить_попытку_намаза(src, place, год, сейчас_мс)  # следующая попытка — не раньше чем через час;
            # принятая раньше таблица остаётся (не меняем на непроверенную)
            if е.код == 'net' and src == 'dumk':
                break  # сеть упала — до следующего шага
            continue
        итог = хранилище.сохранить_таблицу_намаза(src, place, год, т['дни'], т['точка'], т['способ'], хэш_дней(т['дни']),
                                                  т['расхождение'], сейчас_мс)
        счёт['принято' if итог in ('new', 'changed') else 'без_изменений'] += 1
        if итог != 'same':
            хранилище.журнал_намаза(src, place, год, итог, f'точка {т["точка"]["id"]}; со своим расчётом ≤ {т["расхождение"]} мин')
    return счёт


# ───────────── API ─────────────
def ответ_таблицы(з: dict) -> dict:
    return {
        'src': з['src'], 'place': з['place'], 'year': з['year'], 'start': f'{з["year"]}-01-01', 'offset': СМЕЩЕНИЕ_МИН,
        'days': з['дни'], 'point': з['точка'], 'method': з['способ'],
        'updated': datetime.fromtimestamp(з['получено'] / 1000, tz=ПОЯС).date().isoformat(),
        'checked': datetime.fromtimestamp(з['проверено'] / 1000, tz=ПОЯС).date().isoformat(),
        'sha': з['sha'],
    }


def register(app, *, хранилище, ключ_лимита: Callable, часы: Callable[[], float] = time.time) -> None:
    def ошибка(код: int, что: str) -> JSONResponse:
        return JSONResponse({'ошибка': что}, status_code=код, headers={'Cache-Control': 'no-store'})

    @app.get('/api/prayer/official')
    async def официальное(запрос: Request):
        сейчас = int(часы() * 1000)
        if not await run_in_threadpool(хранилище.учесть, 'prayer:' + ключ_лимита(запрос), 60, 60, сейчас):
            return ошибка(429, 'rate')
        q = запрос.query_params
        src, place = q.get('src', ''), q.get('place', '')
        if src not in ИСТОЧНИКИ:
            return ошибка(400, 'src')
        if пункт(src, place) is None:
            return ошибка(400, 'place')
        if без_таблицы(src, place):
            # таблицы у ведомства нет (дубль точки у ДУМК) — клиент считает сам; не спрашивать весь день
            return JSONResponse({'ошибка': 'no_official'}, status_code=404, headers={'Cache-Control': 'public, max-age=86400'})
        год_текущий = datetime.fromtimestamp(сейчас / 1000, tz=ПОЯС).year
        try:
            год = int(q.get('year', ''))
        except ValueError:
            return ошибка(400, 'year')
        if not год_текущий - 1 <= год <= год_текущий + 1:
            return ошибка(400, 'year')
        з = await run_in_threadpool(хранилище.таблица_намаза, src, place, год)
        if з is None:
            await run_in_threadpool(хранилище.попросить_намаз, src, place, год, сейчас)
            return ошибка(404, 'not_ready')
        тег = '"' + з['sha'][:32] + '"'
        заголовки = {'ETag': тег, 'Cache-Control': 'public, max-age=86400'}
        if тег in [т.strip() for т in запрос.headers.get('if-none-match', '').split(',')]:
            return Response(status_code=304, headers=заголовки)
        return JSONResponse(ответ_таблицы(з), headers=заголовки)
