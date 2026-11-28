"""Цены золота и серебра для калькулятора закята (server/metals.py; владелец 28.11.2026).

Образцы — настоящие ответы источников, скачанные 28.11.2026 через GitHub Actions (tests/fixtures/metals/):
  nbk-gold-2026-11-28.html      — https://nationalbank.kz/ru/gold/zoloto (вырезка: <head> до </title> и таблица целиком);
  nbk-rates-26/27.11.2026.xml    — https://nationalbank.kz/rss/get_rates.cfm?fdate=ДД.ММ.ГГГГ (целиком);
  cbr-metall-01-28.11.2026.xml   — https://www.cbr.ru/scripts/xml_metall.asp (windows-1251, целиком);
  cbr-usd-01-28.11.2026.xml      — https://www.cbr.ru/scripts/XML_dynamic.asp?…VAL_NM_RQ=R01235 (windows-1251, целиком).
Тесты БД — на своей временной базе (conftest.pg_адрес), прод не трогают.
"""
from __future__ import annotations

import pathlib
from datetime import date, datetime, timedelta, timezone

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient

import metals

ОБРАЗЦЫ = pathlib.Path(__file__).resolve().parent / 'fixtures' / 'metals'
ПОЯС = timezone(timedelta(hours=5))


def образец(имя: str) -> str:
    сырое = (ОБРАЗЦЫ / имя).read_bytes()
    return сырое.decode('cp1251' if b'windows-1251' in сырое[:80] else 'utf-8')


def мс(день: str, чч_мм: str = '12:00') -> int:
    return int(datetime.strptime(день + ' ' + чч_мм, '%Y-%m-%d %H:%M').replace(tzinfo=ПОЯС).timestamp() * 1000)


def адреса(день_курса: str = '27.11.2026', металлы: str = 'cbr-metall-01-28.11.2026.xml') -> dict[str, str]:
    return {
        metals.АДРЕС_ЗОЛОТА_НБК: образец('nbk-gold-2026-11-28.html'),
        metals.АДРЕС_КУРСОВ_НБК.format(дата=день_курса): образец(f'nbk-rates-{день_курса}.xml'),
        metals.АДРЕС_МЕТАЛЛОВ_ЦБ.format(с='15/11/2026', по='01/12/2026'): образец(металлы),
        metals.АДРЕС_ДОЛЛАРА_ЦБ.format(с='15/11/2026', по='01/12/2026'): образец('cbr-usd-01-28.11.2026.xml'),
    }


class Скачать:
    """Подставное скачивание: адрес → текст; можно подменить ответ по счёту вызова."""

    def __init__(self, ответы: dict[str, str], подмена=None) -> None:
        self.ответы, self.подмена, self.вызовы = ответы, подмена, []

    def __call__(self, адрес: str) -> str:
        self.вызовы.append(адрес)
        if self.подмена:
            з = self.подмена(адрес, len(self.вызовы))
            if з is not None:
                if isinstance(з, Exception):
                    raise з
                return з
        if адрес not in self.ответы:
            raise metals.ОшибкаЦены('http', '404 ' + адрес)
        return self.ответы[адрес]


# ───────────── разбор настоящих образцов ─────────────
def test_страница_золота_нбк():
    строки = metals.разобрать_золото_нбк(образец('nbk-gold-2026-11-28.html'))
    assert len(строки) == 30
    assert строки[0] == (date(2026, 11, 27), 52553.84)
    assert строки[1] == (date(2026, 11, 26), 52091.27)
    assert строки[-1] == (date(2026, 10, 16), 60713.63)
    assert all(10_000 < ц < 100_000 for _, ц in строки)  # тенге за 1 г, не за унцию


def test_страница_золота_нбк_сломана():
    with pytest.raises(metals.ОшибкаЦены) as е:
        metals.разобрать_золото_нбк('<html><title>Стоимость 1 грамма золота</title><p>нет таблицы</p></html>')
    assert е.value.код == 'nbk_form'
    with pytest.raises(metals.ОшибкаЦены) as е:
        metals.разобрать_золото_нбк('<html><title>Ошибка 502</title><table></table></html>')
    assert е.value.код == 'nbk_form'
    текст = образец('nbk-gold-2026-11-28.html').replace('<td>2026-11-26</td>', '<td>2026-11-28</td>')
    with pytest.raises(metals.ОшибкаЦены) as е:
        metals.разобрать_золото_нбк(текст)
    assert е.value.код == 'nbk_order'


def test_курс_нбк():
    assert metals.разобрать_курс_нбк(образец('nbk-rates-27.11.2026.xml')) == (date(2026, 11, 27), 458.85)
    assert metals.разобрать_курс_нбк(образец('nbk-rates-27.11.2026.xml'), 'RUB') == (date(2026, 11, 27), 5.59)
    день, вон = metals.разобрать_курс_нбк(образец('nbk-rates-27.11.2026.xml'), 'KRW')  # quant 100
    assert день == date(2026, 11, 27) and вон < 1
    with pytest.raises(metals.ОшибкаЦены):
        metals.разобрать_курс_нбк('<rates><date>27.11.2026</date></rates>')


def test_металлы_и_доллар_цб():
    м = metals.разобрать_металлы_цб(образец('cbr-metall-01-28.11.2026.xml'))
    assert м[date(2026, 11, 27)] == {'золото': 9152.64, 'серебро': 104.03}
    assert м[date(2026, 11, 28)] == {'золото': 9466.7, 'серебро': 109.88}
    д = metals.разобрать_доллар_цб(образец('cbr-usd-01-28.11.2026.xml'))
    assert д[date(2026, 11, 27)] == pytest.approx(82.1265)
    assert date(2026, 11, 23) not in д  # ЦБ РФ не ставит курс по воскресеньям и понедельникам
    with pytest.raises(metals.ОшибкаЦены):
        metals.разобрать_металлы_цб('<Metall></Metall>')


# ───────────── счёт ─────────────
def _посчитать(металлы='cbr-metall-01-28.11.2026.xml', сверка=5.0):
    return metals.посчитать(metals.разобрать_золото_нбк(образец('nbk-gold-2026-11-28.html')),
                            metals.разобрать_курс_нбк(образец('nbk-rates-27.11.2026.xml')),
                            metals.разобрать_металлы_цб(образец(металлы)),
                            metals.разобрать_доллар_цб(образец('cbr-usd-01-28.11.2026.xml')), сверка)


def test_серебро_по_формуле_нбк():
    ц = _посчитать()
    assert ц.день == date(2026, 11, 27) and ц.золото == 52553.84
    # 109,88 ₽/г ÷ 82,2732 ₽/$ × 458,85 ₸/$ = 612,82 ₸/г (ЦБ РФ 28.11 — тот же фиксинг, что у НБ РК 27.11: сверка 0,46 %)
    assert ц.серебро == 612.82
    assert ц.подробно['cbr_date'] == '2026-11-28' and ц.подробно['gold_check_pct'] == 0.46
    assert 30 < ц.подробно['silver_usd_oz'] < 60
    assert 595 * ц.серебро < 85 * ц.золото  # нисаб по серебру меньше


def test_день_цб_по_сверке_золота():
    # Без записи ЦБ РФ за 28.11 остаётся 27.11: сверка 2,7 % — в пределах 5 %, но не в пределах 2 %.
    без_28 = образец('cbr-metall-01-28.11.2026.xml').split('<Record Date="28.11.2026"')[0] + '</Metall>'
    ц = metals.посчитать(metals.разобрать_золото_нбк(образец('nbk-gold-2026-11-28.html')),
                         metals.разобрать_курс_нбк(образец('nbk-rates-27.11.2026.xml')), metals.разобрать_металлы_цб(без_28),
                         metals.разобрать_доллар_цб(образец('cbr-usd-01-28.11.2026.xml')), 5.0)
    assert ц.подробно['cbr_date'] == '2026-11-27' and ц.подробно['gold_check_pct'] == 2.7 and ц.серебро == 581.23
    with pytest.raises(metals.ОшибкаЦены) as е:
        _посчитать(сверка=0.3)
    assert е.value.код == 'cross_check'


def test_курс_не_на_дату_золота():
    with pytest.raises(metals.ОшибкаЦены) as е:
        metals.посчитать(metals.разобрать_золото_нбк(образец('nbk-gold-2026-11-28.html')),
                         metals.разобрать_курс_нбк(образец('nbk-rates-26.11.2026.xml')),
                         metals.разобрать_металлы_цб(образец('cbr-metall-01-28.11.2026.xml')),
                         metals.разобрать_доллар_цб(образец('cbr-usd-01-28.11.2026.xml')), 5.0)
    assert е.value.код == 'nbk_rates_date'


# ───────────── проверка ─────────────
def test_проверка_границ_и_скачков():
    ц = _посчитать()
    строки = metals.разобрать_золото_нбк(образец('nbk-gold-2026-11-28.html'))
    сегодня = date(2026, 11, 28)
    metals.проверить(ц, строки, None, сегодня, 30)
    metals.проверить(ц, строки, metals.Цены(date(2026, 11, 26), 52091.27, 600.0, {}), сегодня, 30)

    def код(**замена) -> str:
        п = dict(день=ц.день, золото=ц.золото, серебро=ц.серебро, подробно={})
        прежние = замена.pop('прежние', None)
        к_сегодня = замена.pop('сегодня', сегодня)
        п.update(замена)
        with pytest.raises(metals.ОшибкаЦены) as е:
            metals.проверить(metals.Цены(**п), строки, прежние, к_сегодня, 30)
        return е.value.код

    assert код(золото=5_253_384.0) == 'gold_range'          # за унцию в копейках / не та единица
    assert код(серебро=0.0) == 'silver_range'
    assert код(серебро=19_000.0) == 'ratio'
    assert код(серебро=60.0) == 'ratio'
    assert код(сегодня=date(2026, 11, 26)) == 'future'
    assert код(сегодня=date(2026, 12, 10)) == 'stale'
    assert код(прежние=metals.Цены(date(2026, 11, 26), 52091.27, 300.0, {})) == 'jump_silver'
    assert код(прежние=metals.Цены(date(2026, 11, 26), 30000.0, 612.0, {})) == 'jump_gold'
    # скачок к прошлой строке той же таблицы НБ РК
    with pytest.raises(metals.ОшибкаЦены) as е:
        metals.проверить(metals.Цены(ц.день, 80000.0, 900.0, {}), строки, None, сегодня, 30)
    assert е.value.код == 'jump_gold'


# ───────────── выгрузка: две подряд ─────────────
def test_две_одинаковые_выгрузки():
    с = Скачать(адреса())
    паузы = []
    ц = metals.принять_цены(с, None, date(2026, 11, 28), пауза=lambda: паузы.append(1))
    assert (ц.день, ц.золото, ц.серебро) == (date(2026, 11, 27), 52553.84, 612.82)
    assert len(с.вызовы) == 8 and паузы == [1]
    assert с.вызовы[0] == 'https://nationalbank.kz/ru/gold/zoloto'
    assert с.вызовы[1] == 'https://nationalbank.kz/rss/get_rates.cfm?fdate=27.11.2026'


def test_выгрузки_не_совпали():
    золото = образец('nbk-gold-2026-11-28.html')

    def подмена(адрес, n):  # каждая выгрузка — другое число на странице НБ РК
        if адрес == metals.АДРЕС_ЗОЛОТА_НБК:
            return золото.replace('52 553.84', f'52 55{n % 10}.00')
        return None

    with pytest.raises(metals.ОшибкаЦены) as е:
        metals.принять_цены(Скачать(адреса(), подмена), None, date(2026, 11, 28), пауза=lambda: None)
    assert е.value.код == 'unstable'


def test_разовый_сбой_и_сеть():
    def сбой(адрес, n):  # вторая выгрузка — пустая страница; третья совпадает с первой
        return '<html>502</html>' if адрес == metals.АДРЕС_ЗОЛОТА_НБК and n == 5 else None

    ц = metals.принять_цены(Скачать(адреса(), сбой), None, date(2026, 11, 28), пауза=lambda: None)
    assert ц.серебро == 612.82

    с = Скачать(адреса(), lambda адрес, n: metals.ОшибкаЦены('net', 'URLError'))
    with pytest.raises(metals.ОшибкаЦены) as е:
        metals.принять_цены(с, None, date(2026, 11, 28), пауза=lambda: None)
    assert е.value.код == 'net' and len(с.вызовы) == 1


# ───────────── расписание ─────────────
def test_пора():
    час = 11
    сейчас = мс('2026-11-28', '12:00')
    assert metals.пора(None, None, сейчас, час)
    assert not metals.пора(None, сейчас - 30 * 60_000, сейчас, час)            # неудача полчаса назад — ждём
    сегодня = {'проверено': мс('2026-11-28', '11:05')}
    вчера = {'проверено': мс('2026-11-27', '11:05')}
    давно = {'проверено': мс('2026-11-25', '11:05')}
    assert not metals.пора(сегодня, мс('2026-11-28', '11:05'), сейчас, час)
    assert metals.пора(вчера, мс('2026-11-27', '11:05'), сейчас, час)
    assert not metals.пора(вчера, мс('2026-11-27', '11:05'), мс('2026-11-28', '09:00'), час)  # ещё рано
    assert metals.пора(давно, мс('2026-11-25', '11:05'), мс('2026-11-28', '03:00'), час)      # после простоя — сразу


# ───────────── API (без БД) ─────────────
class ПодставныеЦены:
    def __init__(self, з=None) -> None:
        self.з = з

    def последние(self):
        return self.з


def клиент(з, хранилище):
    app = FastAPI()
    metals.register(app, цены=ПодставныеЦены(з), хранилище=хранилище, ключ_лимита=lambda r: 'ip',
                    часы=lambda: мс('2026-11-28', '12:00') / 1000)
    return TestClient(app)


ЗАПИСЬ = {'день': date(2026, 11, 27), 'золото': 52553.84, 'серебро': 612.82, 'источник_золота': metals.АДРЕС_ЗОЛОТА_НБК,
          'источник_серебра': metals.СТРАНИЦА_МЕТАЛЛОВ_ЦБ, 'подробно': {}, 'получено': мс('2026-11-28', '11:00'),
          'проверено': мс('2026-11-28', '11:00')}


def test_api_нет_данных(хранилище):
    о = клиент(None, хранилище).get('/api/zakat/prices')
    assert о.status_code == 503 and о.json() == {'ошибка': 'not_ready'} and о.headers['cache-control'] == 'no-store'


def test_api_цены(хранилище):
    к = клиент(ЗАПИСЬ, хранилище)
    о = к.get('/api/zakat/prices')
    assert о.status_code == 200
    assert о.json() == {'date': '2026-11-27', 'gold_per_g': 52553.84, 'silver_per_g': 612.82, 'currency': 'KZT', 'unit': 'g',
                        'source': 'https://nationalbank.kz/ru/gold/zoloto',
                        'silver_source': 'https://www.cbr.ru/hd_base/metall/metall_base_new/', 'silver_method': 'cbr-usd-nbk',
                        'updated': '2026-11-28T11:00:00+05:00'}
    assert о.headers['cache-control'] == 'public, max-age=10800'
    тег = о.headers['etag']
    assert к.get('/api/zakat/prices', headers={'If-None-Match': тег}).status_code == 304


def test_api_лимит(хранилище):
    к = клиент(ЗАПИСЬ, хранилище)
    коды = [к.get('/api/zakat/prices').status_code for _ in range(61)]
    assert коды[:60] == [200] * 60 and коды[60] == 429


# ───────────── БД (временная база) ─────────────
def test_бд_и_шаг(pg_адрес, monkeypatch):
    from db import Хранилище

    х = Хранилище(pg_адрес)
    х.применить_миграции()
    ц = metals.ХранилищеЦен(х)
    assert ц.последние() is None and ц.последняя_попытка() is None
    monkeypatch.setenv('MUGALIM_METALS_HOUR', '11')
    сейчас = мс('2026-11-28', '12:00')

    итог = metals.шаг(ц, Скачать(адреса()), сейчас, пауза=lambda: None)
    assert итог.startswith('new: 2026-11-27')
    з = ц.последние()
    assert (з['день'], з['золото'], з['серебро']) == (date(2026, 11, 27), 52553.84, 612.82)
    assert з['подробно']['cbr_date'] == '2026-11-28' and з['источник_золота'] == metals.АДРЕС_ЗОЛОТА_НБК
    assert metals.шаг(ц, Скачать(адреса()), сейчас + 60_000, пауза=lambda: None) is None   # сегодня уже есть

    # Завтра: та же дата НБ РК (суббота) и те же числа — только отметка проверки.
    завтра = мс('2026-11-29', '11:30')
    assert metals.шаг(ц, Скачать(адреса()), завтра, пауза=lambda: None).startswith('same')
    assert ц.последние()['проверено'] == завтра

    # Источник сломался — цена остаётся прежней, в журнале — отказ; следующая попытка не раньше чем через час.
    послезавтра = мс('2026-11-30', '11:30')
    плохо = Скачать({metals.АДРЕС_ЗОЛОТА_НБК: '<html><title>503</title></html>'})
    assert metals.шаг(ц, плохо, послезавтра, пауза=lambda: None) == 'отказ: nbk_form'
    assert ц.последние()['серебро'] == 612.82
    assert metals.шаг(ц, плохо, послезавтра + 10 * 60_000, пауза=lambda: None) is None
    with х.соединение() as с:
        журнал = с.execute('SELECT result FROM metal_log ORDER BY id').fetchall()
    assert [р[0] for р in журнал] == ['new', 'same', 'nbk_form']
    assert ц.убрать_старое(сейчас) == 0

    # API на настоящей базе
    app = FastAPI()
    metals.register(app, цены=ц, хранилище=х, ключ_лимита=lambda r: 'ip')
    о = TestClient(app).get('/api/zakat/prices')
    assert о.status_code == 200 and о.json()['silver_per_g'] == 612.82 and о.json()['date'] == '2026-11-27'
