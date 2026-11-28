"""Цены золота и серебра за 1 г в тенге для калькулятора закята (#/zakat) — из официальных источников, без участия человека.

Владелец 28.11.2026: «Данные серебра и золота подтягивай сам из официальных источников. Не нужно, чтобы человек это
делал.» Нисаб — 85 г золота / 595 г серебра (app/src/zakat/calc.ts); цены здесь только для подстановки в калькулятор —
человек может изменить их вручную.

Источники (проверены 28.11.2026 разовой выгрузкой через GitHub Actions — образцы в tests/fixtures/metals/):
  золото — Национальный банк РК, «Статистика → Курсы валют и стоимость золота → Стоимость 1 грамма золота в тенге»
    https://nationalbank.kz/ru/gold/zoloto — HTML-таблица «# | | Дата | Стоимость», 30 последних рабочих дней, новые
    сверху: <td>2026-11-27</td> <td>52 553.84</td>. Единица — ТЕНГЕ ЗА 1 ГРАММ (уже за грамм, не за унцию). Формула НБ РК
    (ответы на вопросы по золоту, /ru/news/suraqtar/17844): фиксинг LBMA (утро предыдущего дня, USD за тройскую унцию) ×
    официальный курс USD/KZT на дату ÷ 31,1034768. Стоимость «носит индикативный характер».
  серебро — НБ РК серебро не публикует (страниц /ru/gold/serebro, /silver нет; в RSS курсов XAG нет). Берём ту же формулу
    НБ РК для серебра: учётная цена серебра Банка России (рубли за 1 г, https://www.cbr.ru/scripts/xml_metall.asp,
    Code=2; ЦБ РФ считает её из фиксинга LBMA по своему курсу доллара) ÷ официальный курс доллара Банка России на ту же
    дату (XML_dynamic.asp, R01235) = цена LBMA в долларах за 1 г; × официальный курс USD/KZT НБ РК на дату золота
    (https://nationalbank.kz/rss/get_rates.cfm?fdate=ДД.ММ.ГГГГ). LBMA напрямую не берём: prices.lbma.org.uk отвечает 403
    и требует лицензии. Сверка: тем же путём считаем золото (Code=1) и сравниваем с числом НБ РК — расхождение больше
    MUGALIM_METALS_CHECK_PCT (5 %) значит, что формула или данные сломались: ничего не принимаем. На выгрузке за ноябрь
    2026 расхождение — до 1,9 % (день ЦБ РФ подбираем по тому же фиксингу — см. посчитать).

Проверка перед записью (принять_цены): числа положительные; золото 10 000–1 000 000 ₸/г, серебро 50–20 000 ₸/г,
  золото/серебро 20–200; дата цены не в будущем и не старше 10 дней; изменение к прошлому принятому дню < 30 %
  (MUGALIM_METALS_MAX_JUMP_PCT) — и для золота к прошлой строке той же таблицы НБ РК; две выгрузки подряд дали одно и то
  же (как таблицы ДУМК в prayer.py). Не прошло — в журнал metal_log, принятая раньше цена остаётся.

Расписание (jobs.py, поток metals): раз в MUGALIM_METALS_TICK_SEC (600 с) проверяем, пора ли; пора — если цен нет или
  последняя удачная выгрузка была не сегодня (Алматы) и уже MUGALIM_METALS_HOUR (11:00) или цены старше 2 суток (запуск
  после простоя); после неудачи — не чаще раза в час. MUGALIM_METALS_FETCH=0 — не скачивать.

Контракт API (только чтение из своей БД; наружу ходит только mugalim-jobs):
  GET /api/zakat/prices
    200 {date:'ГГГГ-ММ-ДД' (дата цены НБ РК), gold_per_g: 52553.84, silver_per_g: 597.31, currency:'KZT', unit:'g',
         source:'https://nationalbank.kz/ru/gold/zoloto', silver_source:'https://www.cbr.ru/hd_base/metall/metall_base_new/',
         silver_method:'cbr-usd-nbk', updated:'ГГГГ-ММ-ДДTЧЧ:ММ:СС+05:00' (последняя проверка)}
        Cache-Control: public, max-age=10800 (3 ч); ETag; If-None-Match → 304.
    503 {ошибка:'not_ready'} (no-store) — цен ещё нет; 429 {ошибка:'rate'} — больше 60 в минуту с IP (хэш IP, как prayer).
Сборка: register(app, *, цены, хранилище, ключ_лимита, часы) — маршрут; ХранилищеЦен(хранилище) — таблицы 021;
  шаг(цены, скачать, сейчас_мс, пауза, стоп) — фоновое обновление; разбор и проверка — чистые функции ниже.
"""
from __future__ import annotations

import hashlib
import json
import re
import time
import urllib.error
import urllib.request
from dataclasses import dataclass
from datetime import date, datetime, timedelta, timezone
from decimal import ROUND_HALF_UP, Decimal
from typing import Callable

from fastapi import Request
from fastapi.concurrency import run_in_threadpool
from fastapi.responses import JSONResponse, Response
from psycopg.types.json import Jsonb

from envnum import целое_из_окружения, число_из_окружения

ПОЯС = timezone(timedelta(hours=5))          # сутки — по Алматы (CLAUDE.md)
ЧАС_МС = 3_600_000
ДЕНЬ_МС = 86_400_000
ГРАММОВ_В_УНЦИИ = 31.1034768                 # тройская унция (для справки: НБ РК уже публикует за 1 г)

АДРЕС_ЗОЛОТА_НБК = 'https://nationalbank.kz/ru/gold/zoloto'
АДРЕС_КУРСОВ_НБК = 'https://nationalbank.kz/rss/get_rates.cfm?fdate={дата}'        # ДД.ММ.ГГГГ
АДРЕС_МЕТАЛЛОВ_ЦБ = 'https://www.cbr.ru/scripts/xml_metall.asp?date_req1={с}&date_req2={по}'   # ДД/ММ/ГГГГ
АДРЕС_ДОЛЛАРА_ЦБ = 'https://www.cbr.ru/scripts/XML_dynamic.asp?date_req1={с}&date_req2={по}&VAL_NM_RQ=R01235'
СТРАНИЦА_МЕТАЛЛОВ_ЦБ = 'https://www.cbr.ru/hd_base/metall/metall_base_new/'          # для людей (в ответе API)
СПОСОБ_СЕРЕБРА = 'cbr-usd-nbk'
АГЕНТ = 'aiustaz-server/1.0 (+https://aiustaz.pro)'

ЗОЛОТО_ГРАНИЦЫ = (10_000.0, 1_000_000.0)     # ₸ за 1 г (28.11.2026 — 52 554)
СЕРЕБРО_ГРАНИЦЫ = (50.0, 20_000.0)           # ₸ за 1 г (≈ 600)
ОТНОШЕНИЕ_ГРАНИЦЫ = (20.0, 200.0)            # золото/серебро (≈ 88)
СТАРШЕ_ДНЕЙ = 10

СТРОКА_НБК = re.compile(r'<td>\s*(\d{4}-\d{2}-\d{2})\s*</td>\s*<td>\s*([0-9][0-9   ]*(?:[.,][0-9]{1,4})?)\s*</td>')
ЗАПИСЬ_ЦБ = re.compile(r'<Record\s+Date="(\d{2}\.\d{2}\.\d{4})"\s+Code="(\d)"\s*>\s*<Buy>\s*([0-9]+(?:,[0-9]+)?)\s*</Buy>')
ДОЛЛАР_ЦБ = re.compile(r'<Record\s+Date="(\d{2}\.\d{2}\.\d{4})"\s+Id="R01235"\s*>\s*<Nominal>\s*(\d+)\s*</Nominal>\s*<Value>\s*([0-9]+(?:,[0-9]+)?)\s*</Value>')


class ОшибкаЦены(Exception):
    """Ответ источника не принят (форма, проверка, сеть). код — коротко латиницей, для журнала."""

    def __init__(self, код: str, подробно: str = '') -> None:
        super().__init__(f'{код}: {подробно}' if подробно else код)
        self.код = код
        self.подробно = подробно[:300]


# ───────────── разбор (чистые функции) ─────────────
def _число(строка: str) -> float:
    return float(re.sub(r'[\s  ]', '', строка).replace(',', '.'))


def _дата_рф(строка: str) -> date:
    return datetime.strptime(строка, '%d.%m.%Y').date()


def разобрать_золото_нбк(текст: str) -> list[tuple[date, float]]:
    """Страница НБ РК «Стоимость 1 грамма золота в тенге» → [(дата, ₸ за 1 г)], новые сверху (как на странице)."""
    if 'грамма золота' not in текст and 'gram of gold' not in текст and 'грамм алтын' not in текст:
        raise ОшибкаЦены('nbk_form', 'нет заголовка «Стоимость 1 грамма золота»')
    начало = текст.find('<table')
    конец = текст.find('</table>', начало)
    if начало < 0 or конец < 0:
        raise ОшибкаЦены('nbk_form', 'нет таблицы')
    строки = []
    for д, ч in СТРОКА_НБК.findall(текст[начало:конец]):
        try:
            строки.append((date.fromisoformat(д), _число(ч)))
        except ValueError as е:
            raise ОшибкаЦены('nbk_form', f'строка {д} {ч!r}: {е}') from None
    if len(строки) < 2:
        raise ОшибкаЦены('nbk_form', f'строк {len(строки)}')
    даты = [д for д, _ in строки]
    if даты != sorted(даты, reverse=True) or len(set(даты)) != len(даты):
        raise ОшибкаЦены('nbk_order', 'даты не по убыванию или повторяются')
    return строки


def разобрать_курс_нбк(текст: str, валюта: str = 'USD') -> tuple[date, float]:
    """RSS НБ РК get_rates.cfm → (дата курсов, тенге за 1 единицу валюты с учётом quant)."""
    м = re.search(r'<date>\s*(\d{2}\.\d{2}\.\d{4})\s*</date>', текст)
    if not м:
        raise ОшибкаЦены('nbk_rates_form', 'нет <date>')
    for блок in re.findall(r'<item>(.*?)</item>', текст, re.S):
        if re.search(r'<title>\s*' + re.escape(валюта) + r'\s*</title>', блок):
            знач = re.search(r'<description>\s*([0-9]+(?:[.,][0-9]+)?)\s*</description>', блок)
            кол = re.search(r'<quant>\s*(\d+)\s*</quant>', блок)
            if not знач:
                break
            return _дата_рф(м.group(1)), _число(знач.group(1)) / (int(кол.group(1)) if кол else 1)
    raise ОшибкаЦены('nbk_rates_form', f'нет {валюта}')


def разобрать_металлы_цб(текст: str) -> dict[date, dict[str, float]]:
    """xml_metall.asp Банка России → {дата: {'золото': ₽ за 1 г, 'серебро': ₽ за 1 г}} (Code 1 и 2; Buy = Sell)."""
    итог: dict[date, dict[str, float]] = {}
    for д, код, цена in ЗАПИСЬ_ЦБ.findall(текст):
        if код in ('1', '2'):
            итог.setdefault(_дата_рф(д), {})['золото' if код == '1' else 'серебро'] = _число(цена)
    итог = {д: з for д, з in итог.items() if len(з) == 2}
    if not итог:
        raise ОшибкаЦены('cbr_form', 'нет записей золота и серебра')
    return итог


def разобрать_доллар_цб(текст: str) -> dict[date, float]:
    """XML_dynamic.asp (R01235) → {дата: рублей за 1 доллар}."""
    итог = {_дата_рф(д): _число(в) / int(н) for д, н, в in ДОЛЛАР_ЦБ.findall(текст)}
    if not итог:
        raise ОшибкаЦены('cbr_usd_form', 'нет записей курса доллара')
    return итог


def _последнее_до(данные: dict, день: date):
    ключи = [к for к in данные if к <= день]
    return (max(ключи), данные[max(ключи)]) if ключи else (None, None)


def _округлить(ч: float) -> float:
    return float(Decimal(repr(ч)).quantize(Decimal('0.01'), rounding=ROUND_HALF_UP))


@dataclass(frozen=True)
class Цены:
    день: date
    золото: float          # ₸ за 1 г
    серебро: float         # ₸ за 1 г
    подробно: dict


def посчитать(золото_нбк: list[tuple[date, float]], курс_нбк: tuple[date, float], металлы_цб: dict, доллар_цб: dict,
              сверка_проц: float) -> Цены:
    """Цены дня последней строки НБ РК. Серебро — ЦБ РФ (₽/г) ÷ курс доллара ЦБ РФ × курс доллара НБ РК (дата золота).

    День ЦБ РФ: из двух — последний не позже даты НБ РК и первый после неё (если уже есть) — берём тот, где золото ЦБ РФ
    в пересчёте ближе к золоту НБ РК: значит, у них один и тот же фиксинг LBMA, и серебро этого дня — того же фиксинга.
    На выгрузке за ноябрь 2026 у НБ РК дата D совпадает по фиксингу то с D, то с D+1 у ЦБ РФ (среднее расхождение 0,8 % и
    1,4 %). Дальше 4 дней от даты НБ РК записи ЦБ РФ не берём."""
    день, золото = золото_нбк[0]
    день_курса, доллар_кзт = курс_нбк
    if день_курса != день:
        raise ОшибкаЦены('nbk_rates_date', f'курс на {день_курса}, золото на {день}')
    до = [д for д in металлы_цб if день - timedelta(days=4) <= д <= день]
    после = [д for д in металлы_цб if день < д <= день + timedelta(days=4)]
    кандидаты = ([max(до)] if до else []) + ([min(после)] if после else [])
    if not кандидаты:
        raise ОшибкаЦены('cbr_date', f'нет цены ЦБ РФ рядом с {день}')
    варианты = []
    for день_цб in кандидаты:
        день_доллара, доллар_руб = _последнее_до(доллар_цб, день_цб)
        if день_доллара is None or (день_цб - день_доллара).days > 4:
            continue
        мет = металлы_цб[день_цб]
        сверка = мет['золото'] / доллар_руб * доллар_кзт
        варианты.append((abs(сверка / золото - 1) * 100, день_цб, мет, день_доллара, доллар_руб, сверка))
    if not варианты:
        raise ОшибкаЦены('cbr_usd_date', f'нет курса доллара ЦБ РФ рядом с {день}')
    расхождение, день_цб, мет, день_доллара, доллар_руб, золото_сверка = min(варианты, key=lambda в: (в[0], в[1]))
    if расхождение > сверка_проц:
        raise ОшибкаЦены('cross_check', f'золото по ЦБ РФ {золото_сверка:.2f} против НБ РК {золото:.2f}: {расхождение:.2f} %')
    серебро = мет['серебро'] / доллар_руб * доллар_кзт
    return Цены(день, _округлить(золото), _округлить(серебро), {
        'nbk_usd_kzt': доллар_кзт, 'cbr_date': день_цб.isoformat(), 'cbr_silver_rub_g': мет['серебро'],
        'cbr_gold_rub_g': мет['золото'], 'cbr_usd_rub': доллар_руб, 'cbr_usd_date': день_доллара.isoformat(),
        'gold_check_kzt_g': _округлить(золото_сверка), 'gold_check_pct': round(расхождение, 2),
        'silver_usd_oz': round(мет['серебро'] / доллар_руб * ГРАММОВ_В_УНЦИИ, 3),
    })


def проверить(ц: Цены, золото_нбк: list[tuple[date, float]], прежние: Цены | None, сегодня: date, скачок_проц: float) -> None:
    """Здравый смысл: границы, отношение, дата, скачок к прошлому дню (< скачок_проц). Иначе — ОшибкаЦены."""
    if not (ЗОЛОТО_ГРАНИЦЫ[0] <= ц.золото <= ЗОЛОТО_ГРАНИЦЫ[1]):
        raise ОшибкаЦены('gold_range', f'{ц.золото}')
    if not (СЕРЕБРО_ГРАНИЦЫ[0] <= ц.серебро <= СЕРЕБРО_ГРАНИЦЫ[1]):
        raise ОшибкаЦены('silver_range', f'{ц.серебро}')
    отношение = ц.золото / ц.серебро
    if not (ОТНОШЕНИЕ_ГРАНИЦЫ[0] <= отношение <= ОТНОШЕНИЕ_ГРАНИЦЫ[1]):
        raise ОшибкаЦены('ratio', f'золото/серебро {отношение:.1f}')
    if ц.день > сегодня:
        raise ОшибкаЦены('future', ц.день.isoformat())
    if (сегодня - ц.день).days > СТАРШЕ_ДНЕЙ:
        raise ОшибкаЦены('stale', ц.день.isoformat())

    def скачок(новое: float, старое: float) -> float:
        return abs(новое / старое - 1) * 100

    if len(золото_нбк) > 1 and скачок(ц.золото, золото_нбк[1][1]) >= скачок_проц:
        raise ОшибкаЦены('jump_gold', f'{золото_нбк[1][1]} → {ц.золото}')
    if прежние is not None and прежние.день <= ц.день:
        if скачок(ц.золото, прежние.золото) >= скачок_проц:
            raise ОшибкаЦены('jump_gold', f'{прежние.день}: {прежние.золото} → {ц.золото}')
        if скачок(ц.серебро, прежние.серебро) >= скачок_проц:
            raise ОшибкаЦены('jump_silver', f'{прежние.день}: {прежние.серебро} → {ц.серебро}')


# ───────────── скачивание ─────────────
def скачать_текст(адрес: str, таймаут: float = 30.0, макс_байт: int = 3_000_000) -> str:
    """GET → текст (кодировка из Content-Type или XML-пролога: ЦБ РФ — windows-1251). Ошибка — ОшибкаЦены('net')."""
    запрос = urllib.request.Request(адрес, headers={'User-Agent': АГЕНТ, 'Accept': 'text/html,application/xml,*/*'})
    try:
        with urllib.request.urlopen(запрос, timeout=таймаут) as ответ:  # noqa: S310 — адреса только из констант модуля
            if ответ.status != 200:
                raise ОшибкаЦены('http', f'{ответ.status} {адрес[:80]}')
            сырое = ответ.read(макс_байт + 1)
            кодировка = ответ.headers.get_content_charset()
    except urllib.error.HTTPError as е:
        raise ОшибкаЦены('http', f'{е.code} {адрес[:80]}') from None
    except (urllib.error.URLError, TimeoutError, OSError) as е:
        raise ОшибкаЦены('net', f'{type(е).__name__} {адрес[:80]}') from None
    if len(сырое) > макс_байт:
        raise ОшибкаЦены('size', адрес[:80])
    if not кодировка:
        м = re.match(rb'<\?xml[^>]*encoding="([A-Za-z0-9_-]+)"', сырое)
        кодировка = м.group(1).decode() if м else 'utf-8'
    try:
        return сырое.decode(кодировка, errors='strict')
    except (LookupError, UnicodeDecodeError):
        raise ОшибкаЦены('encoding', f'{кодировка} {адрес[:80]}') from None


def выгрузить(скачать: Callable[[str], str], сегодня: date, сверка_проц: float) -> tuple[Цены, list[tuple[date, float]]]:
    """Одна полная выгрузка: страница золота НБ РК, курс НБ РК на её дату, металлы и доллар ЦБ РФ с D−12 по D+4."""
    золото = разобрать_золото_нбк(скачать(АДРЕС_ЗОЛОТА_НБК))
    день = золото[0][0]
    курс = разобрать_курс_нбк(скачать(АДРЕС_КУРСОВ_НБК.format(дата=день.strftime('%d.%m.%Y'))))
    с, по = (день - timedelta(days=12)).strftime('%d/%m/%Y'), (день + timedelta(days=4)).strftime('%d/%m/%Y')
    металлы = разобрать_металлы_цб(скачать(АДРЕС_МЕТАЛЛОВ_ЦБ.format(с=с, по=по)))
    доллар = разобрать_доллар_цб(скачать(АДРЕС_ДОЛЛАРА_ЦБ.format(с=с, по=по)))
    return посчитать(золото, курс, металлы, доллар, сверка_проц), золото


def принять_цены(скачать: Callable[[str], str], прежние: Цены | None, сегодня: date, *, пауза: Callable[[], None],
                 сверка_проц: float = 5.0, скачок_проц: float = 30.0) -> Цены:
    """Две выгрузки подряд с паузой должны дать одно и то же (до 3 попыток), затем — проверка. Иначе — ОшибкаЦены."""
    принятые: list[Цены] = []
    последняя: ОшибкаЦены | None = None
    for попытка in range(3):
        if попытка:
            пауза()
        try:
            ц, золото = выгрузить(скачать, сегодня, сверка_проц)
            проверить(ц, золото, прежние, сегодня, скачок_проц)
        except ОшибкаЦены as е:
            последняя = е
            if е.код == 'net':
                break
            continue
        if any((п.день, п.золото, п.серебро) == (ц.день, ц.золото, ц.серебро) for п in принятые):
            return ц
        принятые.append(ц)
    if последняя is not None and not принятые:
        raise последняя
    raise ОшибкаЦены('unstable', 'две выгрузки подряд не совпали')


# ───────────── хранилище ─────────────
def _вр(мс: int) -> datetime:
    return datetime.fromtimestamp(мс / 1000, tz=timezone.utc)


class ХранилищеЦен:
    """Таблицы 021 в той же базе mugalim (db.Хранилище даёт соединение со стражем boot.py)."""

    def __init__(self, хранилище) -> None:
        self._х = хранилище

    def последние(self) -> dict | None:
        with self._х.соединение() as с:
            р = с.execute('SELECT day, gold_per_g, silver_per_g, gold_source, silver_source, details, fetched_at, checked_at '
                          'FROM metal_prices ORDER BY day DESC LIMIT 1').fetchone()
        if not р:
            return None
        return {'день': р[0], 'золото': float(р[1]), 'серебро': float(р[2]), 'источник_золота': р[3], 'источник_серебра': р[4],
                'подробно': р[5], 'получено': int(р[6].timestamp() * 1000), 'проверено': int(р[7].timestamp() * 1000)}

    def сохранить(self, ц: Цены, сейчас: int) -> str:
        """'new' | 'changed' | 'same'. same — только отметка проверки."""
        with self._х.соединение() as с:
            было = с.execute('SELECT gold_per_g, silver_per_g FROM metal_prices WHERE day = %s', (ц.день,)).fetchone()
            if было and (float(было[0]), float(было[1])) == (ц.золото, ц.серебро):
                с.execute('UPDATE metal_prices SET checked_at = %s WHERE day = %s', (_вр(сейчас), ц.день))
                return 'same'
            с.execute(
                """INSERT INTO metal_prices (day, gold_per_g, silver_per_g, gold_source, silver_source, details, fetched_at, checked_at)
                   VALUES (%s, %s, %s, %s, %s, %s, %s, %s)
                   ON CONFLICT (day) DO UPDATE SET gold_per_g = EXCLUDED.gold_per_g, silver_per_g = EXCLUDED.silver_per_g,
                     gold_source = EXCLUDED.gold_source, silver_source = EXCLUDED.silver_source, details = EXCLUDED.details,
                     fetched_at = EXCLUDED.fetched_at, checked_at = EXCLUDED.checked_at""",
                (ц.день, ц.золото, ц.серебро, АДРЕС_ЗОЛОТА_НБК, СТРАНИЦА_МЕТАЛЛОВ_ЦБ, Jsonb(ц.подробно), _вр(сейчас), _вр(сейчас)),
            )
        return 'changed' if было else 'new'

    def записать(self, итог: str, подробно: str, сейчас: int) -> None:
        with self._х.соединение() as с:
            с.execute('INSERT INTO metal_log (at, result, detail) VALUES (%s, %s, %s)', (_вр(сейчас), итог[:40], подробно[:300] or None))

    def последняя_попытка(self) -> int | None:
        with self._х.соединение() as с:
            р = с.execute('SELECT max(at) FROM metal_log').fetchone()
        return int(р[0].timestamp() * 1000) if р and р[0] else None

    def убрать_старое(self, сейчас: int) -> int:
        with self._х.соединение() as с:
            return с.execute('DELETE FROM metal_log WHERE at < %s', (_вр(сейчас - 365 * ДЕНЬ_МС),)).rowcount


# ───────────── расписание ─────────────
def день_алматы(мс: int) -> date:
    return datetime.fromtimestamp(мс / 1000, tz=ПОЯС).date()


def пора(последние: dict | None, последняя_попытка: int | None, сейчас: int, час: int) -> bool:
    """Пора ли скачивать: цен нет / цены старше 2 суток (запуск после простоя) / сегодня ещё не проверяли и уже `час`
    по Алматы. Между попытками — не меньше часа (бережно к источникам; неудача не долбит каждые 10 минут)."""
    if последняя_попытка is not None and сейчас - последняя_попытка < ЧАС_МС:
        return False
    if последние is None or сейчас - последние['проверено'] > 2 * ДЕНЬ_МС:
        return True
    местное = datetime.fromtimestamp(сейчас / 1000, tz=ПОЯС)
    return день_алматы(последние['проверено']) < местное.date() and местное.hour >= час


def шаг(цены: ХранилищеЦен, скачать: Callable[[str], str], сейчас: int, *, пауза: Callable[[], None] = lambda: time.sleep(3.0),
        стоп: Callable[[], bool] = lambda: False) -> str | None:
    """Одна проверка расписания; пора — выгрузка, проверка, запись. Итог для журнала службы или None (не пора)."""
    час = целое_из_окружения('MUGALIM_METALS_HOUR', 11, 0, 23)
    последние = цены.последние()
    if стоп() or not пора(последние, цены.последняя_попытка(), сейчас, час):
        return None
    прежние = Цены(последние['день'], последние['золото'], последние['серебро'], последние['подробно']) if последние else None
    try:
        ц = принять_цены(скачать, прежние, день_алматы(сейчас), пауза=пауза,
                         сверка_проц=число_из_окружения('MUGALIM_METALS_CHECK_PCT', 5.0, 0.5, 20.0),
                         скачок_проц=число_из_окружения('MUGALIM_METALS_MAX_JUMP_PCT', 30.0, 5.0, 90.0))
    except ОшибкаЦены as е:
        цены.записать(е.код, е.подробно, сейчас)
        return 'отказ: ' + е.код
    итог = цены.сохранить(ц, сейчас)
    цены.записать(итог, f'{ц.день}: золото {ц.золото}, серебро {ц.серебро}, сверка {ц.подробно["gold_check_pct"]} %', сейчас)
    return f'{итог}: {ц.день} золото {ц.золото} ₸/г, серебро {ц.серебро} ₸/г'


# ───────────── API ─────────────
def ответ(з: dict) -> dict:
    return {
        'date': з['день'].isoformat(),
        'gold_per_g': з['золото'],
        'silver_per_g': з['серебро'],
        'currency': 'KZT',
        'unit': 'g',
        'source': з['источник_золота'],
        'silver_source': з['источник_серебра'],
        'silver_method': СПОСОБ_СЕРЕБРА,
        'updated': datetime.fromtimestamp(з['проверено'] / 1000, tz=ПОЯС).replace(microsecond=0).isoformat(),
    }


def register(app, *, цены: ХранилищеЦен, хранилище, ключ_лимита: Callable, часы: Callable[[], float] = time.time) -> None:
    def ошибка(код: int, что: str) -> JSONResponse:
        return JSONResponse({'ошибка': что}, status_code=код, headers={'Cache-Control': 'no-store'})

    @app.get('/api/zakat/prices')
    async def цены_металлов(запрос: Request):
        сейчас = int(часы() * 1000)
        if not await run_in_threadpool(хранилище.учесть, 'metals:' + ключ_лимита(запрос), 60, 60, сейчас):
            return ошибка(429, 'rate')
        з = await run_in_threadpool(цены.последние)
        if з is None:
            return ошибка(503, 'not_ready')
        тело = ответ(з)
        тег = '"' + hashlib.sha256(json.dumps(тело, sort_keys=True).encode()).hexdigest()[:32] + '"'
        заголовки = {'ETag': тег, 'Cache-Control': 'public, max-age=10800'}
        if тег in [т.strip() for т in запрос.headers.get('if-none-match', '').split(',')]:
            return Response(status_code=304, headers=заголовки)
        return JSONResponse(тело, headers=заголовки)
