"""Курсы валют мира к тенге для калькулятора закята (#/zakat): цены золота и серебра хранятся в тенге за 1 г
(server/metals.py), человек выбирает свою валюту — приложение пересчитывает по курсу отсюда.

Владелец 28.11.2026 (скриншот экрана «Закят» в тенге): «Должен быть выбор валюты всего мира». Курс не выдумываем:
валюта без надёжного курса в ответе отсутствует — приложение предлагает ввести цену 1 г вручную.

Источники по старшинству (форматы проверены разовой выгрузкой через GitHub Actions 28.11.2026; образцы —
tests/fixtures/rates/; условия — content/sources.json):
  nbk — Национальный банк РК, официальные курсы https://nationalbank.kz/rss/get_rates.cfm?fdate=ДД.ММ.ГГГГ (RSS:
        <date>, <item><title>USD</title><description>458.13</description><quant>1</quant>): тенге за quant единиц.
        47 валют (XDR не берём — не валюта людей). Официальный курс USD/KZT НБ РК — опора всех пересчётов ниже.
  cbr — Банк России, официальные курсы https://www.cbr.ru/scripts/XML_daily.asp (windows-1251: <ValCurs Date>,
        <Valute><CharCode>, <Nominal>, <Value>1,23</Value>): рублей за Nominal. Только валюты, которых нет у НБ РК;
        кросс через доллар: ₽ за X ÷ ₽ за USD (ЦБ РФ) × ₸ за USD (НБ РК).
  ecb — Европейский центральный банк, euro foreign exchange reference rates
        https://www.ecb.europa.eu/stats/eurofxref/eurofxref-daily.xml (<Cube time>, <Cube currency rate>: X за 1 EUR).
        Только то, чего нет у НБ РК и ЦБ РФ; кросс: USD за EUR ÷ X за EUR × ₸ за USD (НБ РК). Условия ЕЦБ: можно
        воспроизводить с указанием ЕЦБ как источника; пересчёт — указываем явно («пересчёт по курсу»).
  fx  — открытый набор курсов fawazahmed0/exchange-api (CC0 1.0, без ограничений; ежедневно):
        https://cdn.jsdelivr.net/npm/@fawazahmed0/currency-api@latest/v1/currencies/kzt.json ({date, kzt: {usd: 0.00218,
        …}} — единиц валюты за 1 ₸). Только валюты, которых нет у трёх официальных; только коды ISO 4217 (ВАЛЮТЫ, без
        криптовалют и выведенных кодов); кросс через доллар: USD за ₸ ÷ X за ₸ × ₸ за USD (НБ РК).

Проверка (принять_курсы): каждое значение — число > 0 в границах 1e-6…1e6 ₸; дата источника не старше СВЕЖЕСТЬ_ДНЕЙ (нет
  — источник не берём, его валюты — «введите вручную»); сверка: на общих с НБ РК валютах медиана расхождения кросс-курса
  источника ≤ MUGALIM_RATES_CHECK_PCT (3 %) — иначе источник не берём целиком; скачок к прошлому принятому курсу той же
  валюты ≥ 30 % — эту валюту не берём (в журнал); две выгрузки подряд дали одну и ту же таблицу. НБ РК недоступен или не
  прошёл — ничего не принимаем (прежняя таблица остаётся).
Расписание — как у metals (тот же поток mugalim-jobs): раз в сутки с MUGALIM_METALS_HOUR (11:00 по Алматы) и при запуске,
  если курсов нет или они старше 2 суток; после неудачи — не чаще раза в час. MUGALIM_METALS_FETCH=0 — не скачивать.

Контракт API (только чтение из своей БД):
  GET /api/zakat/rates
    200 {date:'ГГГГ-ММ-ДД' (дата курсов НБ РК), base:'KZT', updated:'…+05:00', count: N,
         rates: {'USD': [458.13, 'nbk'], 'NZD': [262.5, 'cbr'], …}  — тенге за 1 единицу валюты и источник,
         sources: {nbk: {date, url}, cbr: {date, url}, ecb: {date, url}, fx: {date, url}}}
        Cache-Control: public, max-age=10800; ETag / 304. 503 {ошибка:'not_ready'} — курсов ещё нет; 429 — 60 в минуту.
Сборка: register(app, *, курсы, хранилище, ключ_лимита, часы); ХранилищеКурсов(хранилище) — миграция 026;
  шаг(курсы, скачать, сейчас_мс, пауза, стоп); разбор и проверка — чистые функции.
"""
from __future__ import annotations

import hashlib
import json
import re
import statistics
import time
from datetime import date, datetime, timedelta, timezone
from typing import Callable

from fastapi import Request
from fastapi.concurrency import run_in_threadpool
from fastapi.responses import JSONResponse, Response
from psycopg.types.json import Jsonb

from envnum import целое_из_окружения, число_из_окружения
from metals import ОшибкаЦены, день_алматы, пора, скачать_текст  # noqa: F401 — скачать_текст: jobs.py

ПОЯС = timezone(timedelta(hours=5))
ДЕНЬ_МС = 86_400_000

АДРЕС_НБК = 'https://nationalbank.kz/rss/get_rates.cfm?fdate={дата}'
АДРЕС_ЦБ = 'https://www.cbr.ru/scripts/XML_daily.asp'
АДРЕС_ЕЦБ = 'https://www.ecb.europa.eu/stats/eurofxref/eurofxref-daily.xml'
АДРЕС_FX = 'https://cdn.jsdelivr.net/npm/@fawazahmed0/currency-api@latest/v1/currencies/kzt.json'
ИСТОЧНИКИ = ('nbk', 'cbr', 'ecb', 'fx')
СВЕЖЕСТЬ_ДНЕЙ = {'nbk': 4, 'cbr': 6, 'ecb': 6, 'fx': 6}
ГРАНИЦЫ = (1e-6, 1e6)                      # тенге за 1 единицу (IRR ≈ 0,0002 … KWD ≈ 1 500)

# Действующие коды ISO 4217 (валюты людей; без драгметаллов, XDR, фондовых и выведенных: BGN — евро с 2026, HRK, SLL,
# ZWL, CUC, ANG → XCG). Тот же список — app/src/zakat/currency.ts (тест test_список_совпадает_с_приложением).
ВАЛЮТЫ = frozenset('''
AED AFN ALL AMD AOA ARS AUD AWG AZN BAM BBD BDT BHD BIF BMD BND BOB BRL BSD BTN BWP BYN BZD CAD CDF CHF CLP CNY COP CRC
CUP CVE CZK DJF DKK DOP DZD EGP ERN ETB EUR FJD FKP GBP GEL GHS GIP GMD GNF GTQ GYD HKD HNL HTG HUF IDR ILS INR IQD IRR
ISK JMD JOD JPY KES KGS KHR KMF KPW KRW KWD KYD KZT LAK LBP LKR LRD LSL LYD MAD MDL MGA MKD MMK MNT MOP MRU MUR MVR MWK
MXN MYR MZN NAD NGN NIO NOK NPR NZD OMR PAB PEN PGK PHP PKR PLN PYG QAR RON RSD RUB RWF SAR SBD SCR SDG SEK SGD SHP SLE
SOS SRD SSP STN SVC SYP SZL THB TJS TMT TND TOP TRY TTD TWD TZS UAH UGX USD UYU UZS VES VND VUV WST XAF XCD XCG XOF XPF
YER ZAR ZMW ZWG
'''.split())


def _число(с: str) -> float:
    return float(re.sub(r'[\s ]', '', с).replace(',', '.'))


def _в_границах(ч: float) -> bool:
    return isinstance(ч, float) and ч == ч and ГРАНИЦЫ[0] <= ч <= ГРАНИЦЫ[1]


# ───────────── разбор (чистые функции) ─────────────
def разобрать_нбк(текст: str) -> tuple[date, dict[str, float]]:
    """RSS НБ РК → (дата, {код: тенге за 1 единицу})."""
    м = re.search(r'<date>\s*(\d{2})\.(\d{2})\.(\d{4})\s*</date>', текст)
    if not м:
        raise ОшибкаЦены('nbk_form', 'нет <date>')
    итог: dict[str, float] = {}
    for блок in re.findall(r'<item>(.*?)</item>', текст, re.S):
        код = re.search(r'<title>\s*([A-Z]{3})\s*</title>', блок)
        знач = re.search(r'<description>\s*([0-9]+(?:[.,][0-9]+)?)\s*</description>', блок)
        кол = re.search(r'<quant>\s*(\d+)\s*</quant>', блок)
        if код and знач and код.group(1) in ВАЛЮТЫ:
            итог[код.group(1)] = _число(знач.group(1)) / max(1, int(кол.group(1)) if кол else 1)
    if 'USD' not in итог or len(итог) < 20:
        raise ОшибкаЦены('nbk_form', f'валют {len(итог)}, USD {"есть" if "USD" in итог else "нет"}')
    return date(int(м.group(3)), int(м.group(2)), int(м.group(1))), итог


def разобрать_цб(текст: str) -> tuple[date, dict[str, float]]:
    """XML_daily.asp Банка России → (дата, {код: рублей за 1 единицу})."""
    м = re.search(r'<ValCurs\s+Date="(\d{2})\.(\d{2})\.(\d{4})"', текст)
    if not м:
        raise ОшибкаЦены('cbr_form', 'нет ValCurs Date')
    итог: dict[str, float] = {}
    for блок in re.findall(r'<Valute\b[^>]*>(.*?)</Valute>', текст, re.S):
        код = re.search(r'<CharCode>\s*([A-Z]{3})\s*</CharCode>', блок)
        ном = re.search(r'<Nominal>\s*(\d+)\s*</Nominal>', блок)
        знач = re.search(r'<Value>\s*([0-9]+(?:,[0-9]+)?)\s*</Value>', блок)
        if код and ном and знач and int(ном.group(1)) > 0:
            итог[код.group(1)] = _число(знач.group(1)) / int(ном.group(1))
    if 'USD' not in итог or len(итог) < 20:
        raise ОшибкаЦены('cbr_form', f'валют {len(итог)}')
    return date(int(м.group(3)), int(м.group(2)), int(м.group(1))), итог


def разобрать_ецб(текст: str) -> tuple[date, dict[str, float]]:
    """eurofxref-daily.xml → (дата, {код: единиц за 1 EUR}); EUR = 1."""
    м = re.search(r"<Cube\s+time=['\"](\d{4}-\d{2}-\d{2})['\"]", текст)
    if not м:
        raise ОшибкаЦены('ecb_form', 'нет Cube time')
    итог = {к: _число(в) for к, в in re.findall(r"<Cube\s+currency=['\"]([A-Z]{3})['\"]\s+rate=['\"]([0-9.]+)['\"]", текст)}
    if 'USD' not in итог or len(итог) < 10:
        raise ОшибкаЦены('ecb_form', f'валют {len(итог)}')
    итог['EUR'] = 1.0
    return date.fromisoformat(м.group(1)), итог


def разобрать_fx(текст: str) -> tuple[date, dict[str, float]]:
    """kzt.json fawazahmed0/exchange-api → (дата, {КОД: единиц за 1 ₸}) — только коды из ВАЛЮТЫ."""
    try:
        д = json.loads(текст)
        день = date.fromisoformat(д['date'])
        сырое = д['kzt']
    except (ValueError, KeyError, TypeError):
        raise ОшибкаЦены('fx_form', 'нет date/kzt') from None
    итог = {}
    for к, в in сырое.items():
        код = str(к).upper()
        if код in ВАЛЮТЫ and isinstance(в, (int, float)) and в > 0:
            итог[код] = float(в)
    if 'USD' not in итог or len(итог) < 50:
        raise ОшибкаЦены('fx_form', f'валют {len(итог)}')
    return день, итог


# ───────────── пересчёт в тенге ─────────────
def в_тенге(источник: str, данные: dict[str, float], тенге_за_доллар: float) -> dict[str, float]:
    """Таблица источника → {код: тенге за 1 единицу}; кросс через доллар и официальный курс USD/KZT НБ РК."""
    if источник == 'nbk':
        return dict(данные)
    if источник == 'cbr':  # ₽ за X ÷ ₽ за USD × ₸ за USD
        return {к: в / данные['USD'] * тенге_за_доллар for к, в in данные.items() if в > 0}
    if источник == 'ecb':  # (USD за EUR ÷ X за EUR) × ₸ за USD
        return {к: данные['USD'] / в * тенге_за_доллар for к, в in данные.items() if в > 0}
    if источник == 'fx':   # (USD за ₸ ÷ X за ₸) × ₸ за USD
        return {к: данные['USD'] / в * тенге_за_доллар for к, в in данные.items() if в > 0}
    raise ValueError(источник)


def _округлить(ч: float) -> float:
    """6 значащих цифр: курс пересчёта, не больше точности источников."""
    return float(f'{ч:.6g}')


def собрать(таблицы: dict[str, tuple[date, dict[str, float]]], прежние: dict[str, list] | None, сегодня: date, *,
            сверка_проц: float = 3.0, скачок_проц: float = 30.0) -> tuple[dict, dict, list[str]]:
    """{источник: (дата, сырые данные)} → (rates {код: [₸, источник]}, sources {источник: {date, url}}, замечания).

    НБ РК обязателен; остальные — по старшинству, только недостающие валюты; источник с несвежей датой или не прошедший
    сверку с НБ РК — пропускаем целиком (замечание); валюта со скачком ≥ скачок_проц к прежнему курсу — пропускаем."""
    if 'nbk' not in таблицы:
        raise ОшибкаЦены('nbk_missing', 'нет курсов НБ РК')
    замечания: list[str] = []
    день_нбк, нбк = таблицы['nbk']
    if (сегодня - день_нбк).days > СВЕЖЕСТЬ_ДНЕЙ['nbk'] or день_нбк > сегодня + timedelta(days=1):
        raise ОшибкаЦены('nbk_stale', день_нбк.isoformat())
    доллар = нбк['USD']
    курсы: dict[str, list] = {'KZT': [1.0, 'nbk']}
    источники: dict[str, dict] = {}
    for имя in ИСТОЧНИКИ:
        if имя not in таблицы:
            continue
        день, сырые = таблицы[имя]
        if (сегодня - день).days > СВЕЖЕСТЬ_ДНЕЙ[имя] or день > сегодня + timedelta(days=1):
            замечания.append(f'{имя}: дата {день} — не свежая, пропущен')
            continue
        тенге = {к: в for к, в in в_тенге(имя, сырые, доллар).items() if к in ВАЛЮТЫ and к != 'KZT'}
        if имя != 'nbk':
            общие = [abs(тенге[к] / нбк[к] - 1) * 100 for к in тенге if к in нбк and к != 'USD']
            if len(общие) < 3 or statistics.median(общие) > сверка_проц:
                замечания.append(f'{имя}: сверка с НБ РК не прошла ({len(общие)} общих, медиана '
                                 f'{statistics.median(общие) if общие else 0:.2f} %) — пропущен')
                continue
        взято = 0
        for к, в in тенге.items():
            if к in курсы:
                continue
            if not _в_границах(в):
                замечания.append(f'{имя}: {к} = {в!r} вне границ')
                continue
            старый = (прежние or {}).get(к)
            if старый and abs(в / старый[0] - 1) * 100 >= скачок_проц:
                замечания.append(f'{имя}: {к} скачок {старый[0]} → {в:.6g}')
                continue
            курсы[к] = [_округлить(в), имя]
            взято += 1
        if взято:
            источники[имя] = {'date': день.isoformat(), 'url': адрес_для_людей(имя, день)}
    return курсы, источники, замечания


def адрес_для_людей(имя: str, день: date) -> str:
    return {
        'nbk': АДРЕС_НБК.format(дата=день.strftime('%d.%m.%Y')),
        'cbr': АДРЕС_ЦБ,
        'ecb': АДРЕС_ЕЦБ,
        'fx': 'https://github.com/fawazahmed0/exchange-api',
    }[имя]


def выгрузить(скачать: Callable[[str], str], сегодня: date) -> dict[str, tuple[date, dict[str, float]]]:
    """Все источники. НБ РК — на сегодня по Алматы (нет курсов на сегодня — вчера); остальные — по возможности."""
    таблицы: dict[str, tuple[date, dict[str, float]]] = {}
    последняя: ОшибкаЦены | None = None
    for день in (сегодня, сегодня - timedelta(days=1)):
        try:
            д, т = разобрать_нбк(скачать(АДРЕС_НБК.format(дата=день.strftime('%d.%m.%Y'))))
        except ОшибкаЦены as е:
            последняя = е
            if е.код == 'net':
                raise
            continue
        if д == день:
            таблицы['nbk'] = (д, т)
            break
        последняя = ОшибкаЦены('nbk_date', f'просили {день}, пришло {д}')
    if 'nbk' not in таблицы:
        raise последняя or ОшибкаЦены('nbk_missing')
    for имя, адрес, разбор in (('cbr', АДРЕС_ЦБ, разобрать_цб), ('ecb', АДРЕС_ЕЦБ, разобрать_ецб), ('fx', АДРЕС_FX, разобрать_fx)):
        try:
            таблицы[имя] = разбор(скачать(адрес))
        except ОшибкаЦены:
            continue  # источник недоступен — его валюты «введите вручную»; замечание даст собрать()
    return таблицы


def принять_курсы(скачать: Callable[[str], str], прежние: dict | None, сегодня: date, *, пауза: Callable[[], None],
                  сверка_проц: float = 3.0, скачок_проц: float = 30.0) -> tuple[dict, dict, list[str]]:
    """Две выгрузки подряд с паузой должны дать одну и ту же таблицу (до 3 попыток)."""
    принятые: list[tuple[dict, dict, list[str]]] = []
    последняя: ОшибкаЦены | None = None
    for попытка in range(3):
        if попытка:
            пауза()
        try:
            итог = собрать(выгрузить(скачать, сегодня), прежние, сегодня, сверка_проц=сверка_проц, скачок_проц=скачок_проц)
        except ОшибкаЦены as е:
            последняя = е
            if е.код == 'net':
                break
            continue
        if any(п[0] == итог[0] and п[1] == итог[1] for п in принятые):
            return итог
        принятые.append(итог)
    if последняя is not None and not принятые:
        raise последняя
    raise ОшибкаЦены('unstable', 'две выгрузки подряд не совпали')


# ───────────── хранилище ─────────────
def _вр(мс: int) -> datetime:
    return datetime.fromtimestamp(мс / 1000, tz=timezone.utc)


class ХранилищеКурсов:
    """Таблицы 026 в той же базе mugalim (соединение со стражем boot.py — от db.Хранилище)."""

    def __init__(self, хранилище) -> None:
        self._х = хранилище

    def последние(self) -> dict | None:
        with self._х.соединение() as с:
            р = с.execute('SELECT day, rates, sources, fetched_at, checked_at FROM zakat_rates ORDER BY day DESC LIMIT 1').fetchone()
        if not р:
            return None
        return {'день': р[0], 'курсы': р[1], 'источники': р[2], 'получено': int(р[3].timestamp() * 1000),
                'проверено': int(р[4].timestamp() * 1000)}

    def сохранить(self, день: date, курсы: dict, источники: dict, сейчас: int) -> str:
        sha = hashlib.sha256(json.dumps([курсы, источники], sort_keys=True).encode()).hexdigest()
        with self._х.соединение() as с:
            было = с.execute('SELECT sha FROM zakat_rates WHERE day = %s', (день,)).fetchone()
            if было and было[0] == sha:
                с.execute('UPDATE zakat_rates SET checked_at = %s WHERE day = %s', (_вр(сейчас), день))
                return 'same'
            с.execute(
                """INSERT INTO zakat_rates (day, rates, sources, sha, fetched_at, checked_at) VALUES (%s, %s, %s, %s, %s, %s)
                   ON CONFLICT (day) DO UPDATE SET rates = EXCLUDED.rates, sources = EXCLUDED.sources, sha = EXCLUDED.sha,
                     fetched_at = EXCLUDED.fetched_at, checked_at = EXCLUDED.checked_at""",
                (день, Jsonb(курсы), Jsonb(источники), sha, _вр(сейчас), _вр(сейчас)),
            )
        return 'changed' if было else 'new'

    def записать(self, итог: str, подробно: str, сейчас: int) -> None:
        with self._х.соединение() as с:
            с.execute('INSERT INTO zakat_rates_log (at, result, detail) VALUES (%s, %s, %s)', (_вр(сейчас), итог[:40], подробно[:600] or None))

    def последняя_попытка(self) -> int | None:
        with self._х.соединение() as с:
            р = с.execute('SELECT max(at) FROM zakat_rates_log').fetchone()
        return int(р[0].timestamp() * 1000) if р and р[0] else None

    def убрать_старое(self, сейчас: int) -> int:
        with self._х.соединение() as с:
            журнал = с.execute('DELETE FROM zakat_rates_log WHERE at < %s', (_вр(сейчас - 365 * ДЕНЬ_МС),)).rowcount
            журнал += с.execute('DELETE FROM zakat_rates WHERE day < %s', ((datetime.fromtimestamp(сейчас / 1000, tz=ПОЯС)
                                                                           - timedelta(days=90)).date(),)).rowcount
        return журнал


def шаг(курсы: ХранилищеКурсов, скачать: Callable[[str], str], сейчас: int, *, пауза: Callable[[], None] = lambda: time.sleep(3.0),
        стоп: Callable[[], bool] = lambda: False) -> str | None:
    """Одна проверка расписания; пора — выгрузка, проверка, запись. Итог для журнала службы или None (не пора)."""
    час = целое_из_окружения('MUGALIM_METALS_HOUR', 11, 0, 23)
    последние = курсы.последние()
    if стоп() or not пора(последние, курсы.последняя_попытка(), сейчас, час):
        return None
    try:
        таблица, источники, замечания = принять_курсы(
            скачать, последние['курсы'] if последние else None, день_алматы(сейчас), пауза=пауза,
            сверка_проц=число_из_окружения('MUGALIM_RATES_CHECK_PCT', 3.0, 0.5, 20.0),
            скачок_проц=число_из_окружения('MUGALIM_METALS_MAX_JUMP_PCT', 30.0, 5.0, 90.0))
    except ОшибкаЦены as е:
        курсы.записать(е.код, е.подробно, сейчас)
        return 'отказ: ' + е.код
    день = date.fromisoformat(источники['nbk']['date'])
    итог = курсы.сохранить(день, таблица, источники, сейчас)
    по = {и: sum(1 for в in таблица.values() if в[1] == и) for и in ИСТОЧНИКИ}
    курсы.записать(итог, f'{день}: валют {len(таблица)} {по}' + ('; ' + '; '.join(замечания) if замечания else ''), сейчас)
    return f'{итог}: {день}, валют {len(таблица)} {по}' + (f', замечаний {len(замечания)}' if замечания else '')


# ───────────── API ─────────────
def ответ(з: dict) -> dict:
    return {
        'date': з['день'].isoformat(),
        'base': 'KZT',
        'updated': datetime.fromtimestamp(з['проверено'] / 1000, tz=ПОЯС).replace(microsecond=0).isoformat(),
        'count': len(з['курсы']),
        'rates': з['курсы'],
        'sources': з['источники'],
    }


def register(app, *, курсы: ХранилищеКурсов, хранилище, ключ_лимита: Callable, часы: Callable[[], float] = time.time) -> None:
    def ошибка(код: int, что: str) -> JSONResponse:
        return JSONResponse({'ошибка': что}, status_code=код, headers={'Cache-Control': 'no-store'})

    @app.get('/api/zakat/rates')
    async def курсы_валют(запрос: Request):
        сейчас = int(часы() * 1000)
        if not await run_in_threadpool(хранилище.учесть, 'rates:' + ключ_лимита(запрос), 60, 60, сейчас):
            return ошибка(429, 'rate')
        з = await run_in_threadpool(курсы.последние)
        if з is None:
            return ошибка(503, 'not_ready')
        тело = ответ(з)
        тег = '"' + hashlib.sha256(json.dumps(тело, sort_keys=True).encode()).hexdigest()[:32] + '"'
        заголовки = {'ETag': тег, 'Cache-Control': 'public, max-age=10800'}
        if тег in [т.strip() for т in запрос.headers.get('if-none-match', '').split(',')]:
            return Response(status_code=304, headers=заголовки)
        return JSONResponse(тело, headers=заголовки)
