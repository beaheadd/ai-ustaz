"""Курсы валют мира к тенге для закята (server/rates.py; владелец 28.11.2026: «Должен быть выбор валюты всего мира»).

Образцы — настоящие ответы источников, скачанные 28.11.2026 через GitHub Actions (tests/fixtures/rates/, целиком):
  nbk-rates-28.11.2026.xml  — https://nationalbank.kz/rss/get_rates.cfm?fdate=28.11.2026;
  cbr-daily-28.11.2026.xml  — https://www.cbr.ru/scripts/XML_daily.asp (windows-1251);
  ecb-daily-27.11.2026.xml  — https://www.ecb.europa.eu/stats/eurofxref/eurofxref-daily.xml;
  fx-kzt-2026-11-27.json    — https://cdn.jsdelivr.net/npm/@fawazahmed0/currency-api@latest/v1/currencies/kzt.json.
"""
from __future__ import annotations

import json
import pathlib
import re
from collections import Counter
from datetime import date, datetime, timedelta, timezone

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient

import rates
from metals import ОшибкаЦены

ОБРАЗЦЫ = pathlib.Path(__file__).resolve().parent / 'fixtures' / 'rates'
ПОЯС = timezone(timedelta(hours=5))
СЕГОДНЯ = date(2026, 11, 28)


def образец(имя: str) -> str:
    сырое = (ОБРАЗЦЫ / имя).read_bytes()
    return сырое.decode('cp1251' if b'windows-1251' in сырое[:80] else 'utf-8')


def мс(день: str, чч_мм: str = '12:00') -> int:
    return int(datetime.strptime(день + ' ' + чч_мм, '%Y-%m-%d %H:%M').replace(tzinfo=ПОЯС).timestamp() * 1000)


def адреса() -> dict[str, str]:
    return {
        rates.АДРЕС_НБК.format(дата='28.11.2026'): образец('nbk-rates-28.11.2026.xml'),
        rates.АДРЕС_ЦБ: образец('cbr-daily-28.11.2026.xml'),
        rates.АДРЕС_ЕЦБ: образец('ecb-daily-27.11.2026.xml'),
        rates.АДРЕС_FX: образец('fx-kzt-2026-11-27.json'),
    }


class Скачать:
    def __init__(self, ответы: dict[str, str], подмена=None) -> None:
        self.ответы, self.подмена, self.вызовы = ответы, подмена, []

    def __call__(self, адрес: str) -> str:
        self.вызовы.append(адрес)
        if self.подмена:
            з = self.подмена(адрес, len(self.вызовы))
            if isinstance(з, Exception):
                raise з
            if з is not None:
                return з
        if адрес not in self.ответы:
            raise ОшибкаЦены('http', '404 ' + адрес)
        return self.ответы[адрес]


def таблицы():
    return {
        'nbk': rates.разобрать_нбк(образец('nbk-rates-28.11.2026.xml')),
        'cbr': rates.разобрать_цб(образец('cbr-daily-28.11.2026.xml')),
        'ecb': rates.разобрать_ецб(образец('ecb-daily-27.11.2026.xml')),
        'fx': rates.разобрать_fx(образец('fx-kzt-2026-11-27.json')),
    }


# ───────────── разбор настоящих образцов ─────────────
def test_нбк():
    день, т = rates.разобрать_нбк(образец('nbk-rates-28.11.2026.xml'))
    assert день == СЕГОДНЯ and len(т) == 47 and 'XDR' not in т
    assert т['USD'] == 458.13 and т['RUB'] == 5.58 and т['TRY'] == 9.02
    assert т['IDR'] == pytest.approx(0.02505)       # 2,505 ₸ за 100 рупий (quant 100)
    assert т['UZS'] == pytest.approx(0.0382)        # 3,82 ₸ за 100 сумов


def test_цб_ецб_fx():
    день, ц = rates.разобрать_цб(образец('cbr-daily-28.11.2026.xml'))
    assert день == СЕГОДНЯ and len(ц) == 54 and ц['USD'] > 50 and ц['DZD'] == pytest.approx(0.60032)  # 60,032 ₽ за 100
    день, е = rates.разобрать_ецб(образец('ecb-daily-27.11.2026.xml'))
    assert день == date(2026, 11, 27) and е['USD'] == 1.0957 and е['EUR'] == 1.0 and е['ISK'] == 137.20
    день, ф = rates.разобрать_fx(образец('fx-kzt-2026-11-27.json'))
    assert день == date(2026, 11, 27) and 'BTC' not in ф and 'ADA' not in ф and 'ZWL' not in ф and 'XCG' in ф
    assert set(ф) <= rates.ВАЛЮТЫ and len(ф) > 140
    for разбор, текст in ((rates.разобрать_нбк, '<rss></rss>'), (rates.разобрать_цб, '<ValCurs></ValCurs>'),
                          (rates.разобрать_ецб, '<Cube/>'), (rates.разобрать_fx, '{"date": "x"}')):
        with pytest.raises(ОшибкаЦены):
            разбор(текст)


# ───────────── сборка таблицы ─────────────
def test_все_валюты_мира_по_старшинству():
    курсы, источники, замечания = rates.собрать(таблицы(), None, СЕГОДНЯ)
    assert замечания == []
    assert set(курсы) == rates.ВАЛЮТЫ, sorted(rates.ВАЛЮТЫ - set(курсы))
    по = Counter(в[1] for в in курсы.values())
    assert по == {'nbk': 48, 'cbr': 11, 'ecb': 2, 'fx': 93}   # 47 НБ РК + KZT
    assert курсы['KZT'] == [1.0, 'nbk'] and курсы['USD'] == [458.13, 'nbk'] and курсы['TRY'] == [9.02, 'nbk']
    assert курсы['NZD'][1] == 'cbr' and курсы['DZD'][1] == 'cbr'
    assert курсы['ISK'][1] == 'ecb' and курсы['PHP'][1] == 'ecb'
    assert курсы['LBP'][1] == 'fx' and курсы['XCG'][1] == 'fx'
    # кросс через доллар: ISK = USD за EUR ÷ ISK за EUR × ₸ за USD
    assert курсы['ISK'][0] == pytest.approx(1.0957 / 137.20 * 458.13, rel=1e-5)
    assert set(источники) == {'nbk', 'cbr', 'ecb', 'fx'} and источники['nbk']['date'] == '2026-11-28'


def test_сверка_и_свежесть_источников():
    т = таблицы()
    # fx «сломан»: все курсы вдвое — сверка с НБ РК не проходит, источник пропущен целиком
    день, ф = т['fx']
    т['fx'] = (день, {к: (в if к == 'USD' else в * 2) for к, в in ф.items()})
    курсы, источники, замечания = rates.собрать(т, None, СЕГОДНЯ)
    assert 'fx' not in источники and not any(в[1] == 'fx' for в in курсы.values())
    assert 'LBP' not in курсы and any(з.startswith('fx: сверка') for з in замечания)
    # ЕЦБ старше 6 дней — пропущен
    т = таблицы()
    т['ecb'] = (date(2026, 11, 20), т['ecb'][1])
    курсы, источники, замечания = rates.собрать(т, None, СЕГОДНЯ)
    assert 'ecb' not in источники and any('ecb: дата' in з for з in замечания)
    assert курсы['ISK'][1] == 'fx'   # нет у ЕЦБ — взяли из следующего источника
    # НБ РК старше 4 дней — ничего
    т = таблицы()
    т['nbk'] = (date(2026, 11, 20), т['nbk'][1])
    with pytest.raises(ОшибкаЦены) as е:
        rates.собрать(т, None, СЕГОДНЯ)
    assert е.value.код == 'nbk_stale'


def test_скачок_валюты():
    курсы, _, _ = rates.собрать(таблицы(), None, СЕГОДНЯ)
    прежние = dict(курсы)
    прежние['TRY'] = [6.0, 'nbk']        # 6 → 9,02: +50 %
    прежние['VES'] = [курсы['VES'][0] * 0.95, 'fx']
    новые, _, замечания = rates.собрать(таблицы(), прежние, СЕГОДНЯ)
    assert 'TRY' not in новые and 'VES' in новые
    assert any('TRY скачок' in з for з in замечания)


# ───────────── выгрузка ─────────────
def test_две_одинаковые_выгрузки():
    с = Скачать(адреса())
    курсы, источники, _ = rates.принять_курсы(с, None, СЕГОДНЯ, пауза=lambda: None)
    assert len(курсы) == len(rates.ВАЛЮТЫ) and len(с.вызовы) == 8
    assert с.вызовы[0] == 'https://nationalbank.kz/rss/get_rates.cfm?fdate=28.11.2026'


def test_нбк_вчера_и_без_необязательных():
    ответы = адреса()
    ответы[rates.АДРЕС_НБК.format(дата='29.11.2026')] = '<rates><date>28.11.2026</date></rates>'
    for адрес in (rates.АДРЕС_ЕЦБ, rates.АДРЕС_FX):
        ответы.pop(адрес)
    курсы, источники, _ = rates.принять_курсы(Скачать(ответы), None, date(2026, 11, 29), пауза=lambda: None)
    assert set(источники) == {'nbk', 'cbr'} and 'LBP' not in курсы and len(курсы) == 48 + 11


def test_выгрузки_не_совпали_и_сеть():
    нбк = образец('nbk-rates-28.11.2026.xml')

    def подмена(адрес, n):
        return нбк.replace('458.13', f'458.{10 + n % 7}') if 'nationalbank' in адрес else None

    with pytest.raises(ОшибкаЦены) as е:
        rates.принять_курсы(Скачать(адреса(), подмена), None, СЕГОДНЯ, пауза=lambda: None)
    assert е.value.код == 'unstable'
    с = Скачать(адреса(), lambda адрес, n: ОшибкаЦены('net', 'URLError'))
    with pytest.raises(ОшибкаЦены) as е:
        rates.принять_курсы(с, None, СЕГОДНЯ, пауза=lambda: None)
    assert е.value.код == 'net' and len(с.вызовы) == 1


def test_список_совпадает_с_приложением():
    файл = pathlib.Path(__file__).resolve().parents[2] / 'app' / 'src' / 'zakat' / 'currency.ts'
    if not файл.exists():
        pytest.skip('нет app/ (копия сервера без приложения)')
    м = re.search(r'ВАЛЮТЫ_ISO\s*=\s*`([^`]*)`', файл.read_text(encoding='utf-8'))
    assert м and set(м.group(1).split()) == rates.ВАЛЮТЫ


# ───────────── API ─────────────
class ПодставныеКурсы:
    def __init__(self, з=None) -> None:
        self.з = з

    def последние(self):
        return self.з


def test_api(хранилище):
    app = FastAPI()
    rates.register(app, курсы=ПодставныеКурсы(None), хранилище=хранилище, ключ_лимита=lambda r: 'ip')
    о = TestClient(app).get('/api/zakat/rates')
    assert о.status_code == 503 and о.json() == {'ошибка': 'not_ready'}

    курсы, источники, _ = rates.собрать(таблицы(), None, СЕГОДНЯ)
    з = {'день': СЕГОДНЯ, 'курсы': курсы, 'источники': источники, 'получено': мс('2026-11-28', '11:00'),
         'проверено': мс('2026-11-28', '11:00')}
    app = FastAPI()
    rates.register(app, курсы=ПодставныеКурсы(з), хранилище=хранилище, ключ_лимита=lambda r: 'ip2')
    к = TestClient(app)
    о = к.get('/api/zakat/rates')
    assert о.status_code == 200 and о.headers['cache-control'] == 'public, max-age=10800'
    д = о.json()
    assert д['date'] == '2026-11-28' and д['base'] == 'KZT' and д['count'] == len(rates.ВАЛЮТЫ)
    assert д['rates']['USD'] == [458.13, 'nbk'] and д['sources']['ecb']['date'] == '2026-11-27'
    assert д['updated'] == '2026-11-28T11:00:00+05:00'
    assert len(о.content) < 12_000
    assert к.get('/api/zakat/rates', headers={'If-None-Match': о.headers['etag']}).status_code == 304


# ───────────── БД ─────────────
def test_бд_и_шаг(pg_адрес, monkeypatch):
    from db import Хранилище

    х = Хранилище(pg_адрес)
    х.применить_миграции()
    к = rates.ХранилищеКурсов(х)
    assert к.последние() is None and к.последняя_попытка() is None
    monkeypatch.setenv('MUGALIM_METALS_HOUR', '11')
    сейчас = мс('2026-11-28', '12:00')
    итог = rates.шаг(к, Скачать(адреса()), сейчас, пауза=lambda: None)
    assert итог.startswith('new: 2026-11-28, валют 154'), итог
    з = к.последние()
    assert з['день'] == СЕГОДНЯ and з['курсы']['USD'] == [458.13, 'nbk'] and з['источники']['fx']['date'] == '2026-11-27'
    assert rates.шаг(к, Скачать(адреса()), сейчас + 60_000, пауза=lambda: None) is None
    плохо = Скачать({})
    assert rates.шаг(к, плохо, мс('2026-11-29', '11:30'), пауза=lambda: None) == 'отказ: http'
    assert к.последние()['курсы']['USD'] == [458.13, 'nbk']
    with х.соединение() as с:
        assert [р[0] for р in с.execute('SELECT result FROM zakat_rates_log ORDER BY id').fetchall()] == ['new', 'http']
    assert к.убрать_старое(сейчас) == 0
    app = FastAPI()
    rates.register(app, курсы=к, хранилище=х, ключ_лимита=lambda r: 'ip')
    о = TestClient(app).get('/api/zakat/rates')
    assert о.status_code == 200 and json.loads(о.content)['rates']['NZD'][1] == 'cbr'
