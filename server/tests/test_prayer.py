"""Официальное время намаза КЗ/УЗ (server/prayer.py): разбор и проверка ответов ведомств, правило УМУз, API, фоновое
обновление — без сети (фикстуры: настоящий ответ api.muftyat.kz для Алматы 2026 и форма списка регионов islom.uz).
Владелец 20.11.2026: «Время намаза Казахстан, Узбекистан бери из официальных источников… один в один».
"""
from __future__ import annotations

import copy
import json
import pathlib

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient

import prayer
from conftest import СЕЙЧАС

pytest.importorskip('adhanpy')

ФИКСТУРЫ = pathlib.Path(__file__).resolve().parent / 'fixtures'
ДУМК_АЛМАТЫ = json.loads((ФИКСТУРЫ / 'dumk-almaty-2026.json').read_text(encoding='utf-8'))
РЕГИОНЫ = json.loads((ФИКСТУРЫ / 'umuz-regions.json').read_text(encoding='utf-8'))


class ХранилищеНамаза:
    """То же, что методы намаза db.Хранилище (+ учесть), но в памяти."""

    def __init__(self) -> None:
        self.таблицы: dict[tuple, dict] = {}
        self.очередь: dict[tuple, dict] = {}
        self.журнал: list[tuple] = []
        self.мета: dict[str, dict] = {}
        self.лимиты: dict[tuple, int] = {}

    def учесть(self, ключ, окно, предел, сейчас):
        к = (ключ, сейчас - сейчас % (окно * 1000))
        self.лимиты[к] = self.лимиты.get(к, 0) + 1
        return self.лимиты[к] <= предел

    def таблица_намаза(self, src, place, год):
        з = self.таблицы.get((src, place, год))
        return dict(з, src=src, place=place, year=год) if з else None

    def сохранить_таблицу_намаза(self, src, place, год, дни, точка, способ, sha, расхождение, сейчас):
        к = (src, place, год)
        было = self.таблицы.get(к)
        self.очередь.pop(к, None)
        if было and было['sha'] == sha:
            было['проверено'] = сейчас
            return 'same'
        self.таблицы[к] = {'дни': дни, 'точка': точка, 'способ': способ, 'sha': sha, 'получено': сейчас, 'проверено': сейчас}
        return 'changed' if было else 'new'

    def какие_таблицы_намаза(self):
        return set(self.таблицы)

    def давно_проверенные_намаза(self, до, предел):
        return sorted((к for к, з in self.таблицы.items() if з['проверено'] < до), key=lambda к: self.таблицы[к]['проверено'])[:предел]

    def попросить_намаз(self, src, place, год, сейчас):
        self.очередь.setdefault((src, place, год), {'просили': сейчас, 'попытка': None})

    def нужные_намаза(self, предел, попытка_до):
        return [к for к, з in sorted(self.очередь.items(), key=lambda х: х[1]['просили']) if з['попытка'] is None or з['попытка'] < попытка_до][:предел]

    def отметить_попытку_намаза(self, src, place, год, сейчас):
        self.очередь.setdefault((src, place, год), {'просили': сейчас, 'попытка': None})['попытка'] = сейчас

    def недавние_попытки_намаза(self, после):
        return {к for к, з in self.очередь.items() if з['попытка'] is not None and з['попытка'] >= после}

    def журнал_намаза(self, src, place, год, итог, подробно=''):
        self.журнал.append((src, place, год, итог, подробно))

    def мета_намаза(self, ключ):
        return self.мета.get(ключ)

    def записать_мету_намаза(self, ключ, значение, сейчас):
        self.мета[ключ] = {'данные': значение, 'при': сейчас}


# ───────────── пункты ─────────────
def test_пункты_наших_списков():
    п = prayer.пункты()
    assert len(п['kz']) == 168 and len(п['uz']) == 176
    assert п['kz']['almaty'] == [72, '43.238293', '76.945465', 'Алматы қаласы']
    assert all(isinstance(з[1], str) and isinstance(з[2], str) for з in п['kz'].values()), 'координаты ДУМК — строками, как в /cities/'
    assert prayer.пункт('dumk', 'almaty') and prayer.пункт('umuz', 'toshkent')
    for плохое in ('43.25,76.91', '../etc', 'ALMATY', '', 'almaty;drop', 'x' * 41):
        assert prayer.пункт('dumk', плохое) is None
    assert prayer.пункт('umuz', 'almaty') is None and prayer.пункт('dumk', 'toshkent') is None
    assert prayer.пункт('aladhan', 'almaty') is None


# ───────────── ДУМК ─────────────
def test_думк_разбор_и_сверка_со_своим_расчётом():
    дни = prayer.разобрать_думк(ДУМК_АЛМАТЫ, 2026)
    assert len(дни) == 365 and дни[0] == ['05:59', '07:21', '11:59', '14:48', '16:30', '17:53']
    свой = prayer.посчитать(43.238293, 76.945465, 2026, prayer.метод_думк(43.238293))
    наиб = prayer.проверить_таблицу(дни, 2026, свой, 10)
    assert наиб <= 1, f'метод ДУМК восстановлен ≤ 1 мин (исследование 13), здесь {наиб}'


@pytest.mark.parametrize('порча, код', [
    (lambda д: д['result'].pop(), 'days'),
    (lambda д: д['result'][10].update(Date='2026-01-12'), 'date'),
    (lambda д: д['result'][5].update(asr='3:48'), 'shape'),
    (lambda д: д['result'][5].update(asr='25:00'), 'shape'),
    (lambda д: д['result'][5].update(sunrise='05:00'), 'order'),
    (lambda д: д['result'][100].update(maghrib=prayer.чч_мм(prayer.минуты(д['result'][100]['maghrib']) + 11)), 'diff'),
    (lambda д: д.pop('result'), 'form'),
])
def test_думк_порченый_ответ_не_принимаем(порча, код):
    д = copy.deepcopy(ДУМК_АЛМАТЫ)
    порча(д)
    свой = prayer.посчитать(43.238293, 76.945465, 2026, prayer.метод_думк(43.238293))
    with pytest.raises(prayer.ОшибкаИсточника) as е:
        prayer.проверить_таблицу(prayer.разобрать_думк(д, 2026), 2026, свой, 10)
    assert е.value.код == код


def test_думк_два_одинаковых_ответа_подряд():
    адреса = []

    def скачать(адрес):
        адреса.append(адрес)
        return ДУМК_АЛМАТЫ

    т = prayer.таблица_думк('almaty', 2026, скачать, lambda: None, 10)
    assert адреса == ['https://api.muftyat.kz/prayer-times/2026/43.238293/76.945465'] * 2, 'точные координаты пункта ДУМК'
    assert т['точка'] == {'id': '72', 'name': 'Алматы қаласы'} and т['способ'] == 'table' and т['расхождение'] <= 1

    # разовый сбой (как Жезказган 09.11.2026): первый ответ сдвинут, потом два правильных — принимаем правильный
    сбой = copy.deepcopy(ДУМК_АЛМАТЫ)
    for с in сбой['result'][200:]:
        с['fajr'] = prayer.чч_мм(prayer.минуты(с['fajr']) + 1)
    ответы = iter([сбой, ДУМК_АЛМАТЫ, ДУМК_АЛМАТЫ])
    т = prayer.таблица_думк('almaty', 2026, lambda _: next(ответы), lambda: None, 10)
    assert т['дни'] == prayer.разобрать_думк(ДУМК_АЛМАТЫ, 2026)

    # ответы всё время разные — не принимаем
    ответы = iter([сбой, ДУМК_АЛМАТЫ, {'result': []}])
    with pytest.raises(prayer.ОшибкаИсточника) as е:
        prayer.таблица_думк('almaty', 2026, lambda _: next(ответы), lambda: None, 10)
    assert е.value.код == 'unstable'


# ───────────── УМУз ─────────────
def test_регионы_умуз_только_узбекистан():
    р = prayer.разобрать_регионы(РЕГИОНЫ)
    имена = {х.name for х in р}
    assert len(р) == 16 and 'Бишкек' not in имена and 'Без координат' not in имена and 'Выключен' not in имена
    assert prayer.ташкент(р).id == 27
    assert prayer.разобрать_регионы(РЕГИОНЫ['data']) == р, 'и список, и {data: [...]}'
    with pytest.raises(prayer.ОшибкаИсточника):
        prayer.разобрать_регионы({'data': РЕГИОНЫ['data'][:5]})
    with pytest.raises(prayer.ОшибкаИсточника):
        prayer.разобрать_регионы('<html>')


def test_правило_умуз_равно_странице_islom_uz():
    # Сверка третьей стороны (AvazbekNurmatov/omarchy-prayer-times, README): islom.uz/taqvim, Тошкент, 15.08.2026 —
    # бомдод 04:04, қуёш 05:32, пешин 12:28, аср 17:20, шом 19:27, хуфтон 20:50.
    р = prayer.ташкент(prayer.разобрать_регионы(РЕГИОНЫ))
    дни = prayer.посчитать(р.широта, р.долгота, 2026, prayer.ПРАВИЛО_УМУЗ)
    assert дни[226] == ['04:04', '05:32', '12:28', '17:20', '19:27', '20:50']  # 226 = 15 августа


def test_умуз_точка_региона_и_ташкент_плюс_поправка():
    р = prayer.разобрать_регионы(РЕГИОНЫ)
    т = prayer.таблица_умуз('toshkent', 2026, р, 'nuqta', 10)
    assert т['точка'] == {'id': '27', 'name': 'Тошкент'} and т['способ'] == 'rule'
    н = prayer.таблица_умуз('nukus', 2026, р, 'nuqta', 10)
    assert н['точка']['id'] == '16'
    нф = prayer.таблица_умуз('nukus', 2026, р, 'farq', 30)
    for день in (0, 100, 226, 300):
        assert [prayer.минуты(в) for в in нф['дни'][день]] == [prayer.минуты(в) + 42 for в in т['дни'][день]], 'Нукус = Ташкент + 42'
    # «Ташкент + 42» в Нукусе в конце мая расходится с правилом в самом Нукусе на 11 мин (фаджр) — при пределе 10 мин
    # такую таблицу не принимаем: клиент покажет свой расчёт, в журнале — diff (вопрос модели — исследование 15)
    with pytest.raises(prayer.ОшибкаИсточника) as е:
        prayer.таблица_умуз('nukus', 2026, р, 'farq', 10)
    assert е.value.код == 'diff' and 'fajr' in е.value.подробно
    # Самарканд «Ташкент + 9» (так в таблицах namoz-vaqti.uz) в июне — фаджр на 11 мин позже правила в Самарканде: тоже
    # отказ; близкий к Ташкенту Гулистан (+2) проходит
    with pytest.raises(prayer.ОшибкаИсточника):
        prayer.таблица_умуз('samarqand', 2026, р, 'farq', 10)
    assert prayer.таблица_умуз('guliston', 2026, р, 'farq', 10)['точка']['id'] == '5'


def test_умуз_далёкий_пункт_и_неверный_регион():
    р = [х for х in prayer.разобрать_регионы(РЕГИОНЫ) if х.name in ('Тошкент', 'Андижон', 'Бухоро', 'Гулистон', 'Самарқанд', 'Наманган', 'Навоий', 'Жиззах', 'Қарши', 'Қўқон')]
    with pytest.raises(prayer.ОшибкаИсточника) as е:
        prayer.таблица_умуз('nukus', 2026, р, 'nuqta', 10)  # без Нукуса и Хорезма ближайший регион — за сотни км
    assert е.value.код == 'far'
    # «Ташкент + поправка» с явно неверной поправкой (+60 мин) — сверка со своим расчётом не пропускает
    плохие = [prayer.Регион(х.id, х.name, х.широта, х.долгота, 60 if х.id == 18 else х.поправка) for х in prayer.разобрать_регионы(РЕГИОНЫ)]
    with pytest.raises(prayer.ОшибкаИсточника) as е:
        prayer.таблица_умуз('guliston', 2026, [prayer.Регион(х.id, х.name, х.широта, х.долгота, 60 if х.id == 5 else х.поправка) for х in плохие], 'farq', 10)
    assert е.value.код == 'diff'


# ───────────── API ─────────────
@pytest.fixture
def api():
    х = ХранилищеНамаза()
    app = FastAPI()
    prayer.register(app, хранилище=х, ключ_лимита=lambda з: 'ip:test', часы=lambda: СЕЙЧАС / 1000)
    return TestClient(app), х


def положить(х, src='dumk', place='almaty', год=2026):
    дни = prayer.разобрать_думк(ДУМК_АЛМАТЫ, 2026)
    х.сохранить_таблицу_намаза(src, place, год, дни, {'id': '72', 'name': 'Алматы қаласы'}, 'table', prayer.хэш_дней(дни), 1, СЕЙЧАС)


def test_api_таблица_etag_и_304(api):
    клиент, х = api
    положить(х)
    о = клиент.get('/api/prayer/official', params={'src': 'dumk', 'place': 'almaty', 'year': 2026})
    assert о.status_code == 200, о.text
    д = о.json()
    assert д['src'] == 'dumk' and д['place'] == 'almaty' and д['year'] == 2026 and д['start'] == '2026-01-01' and д['offset'] == 300
    assert len(д['days']) == 365 and д['days'][0] == ['05:59', '07:21', '11:59', '14:48', '16:30', '17:53']
    assert д['point'] == {'id': '72', 'name': 'Алматы қаласы'} and д['method'] == 'table' and д['updated'] == '2026-11-20'
    assert о.headers['etag'] == '"' + д['sha'][:32] + '"' and о.headers['cache-control'] == 'public, max-age=86400'
    о2 = клиент.get('/api/prayer/official', params={'src': 'dumk', 'place': 'almaty', 'year': 2026}, headers={'If-None-Match': о.headers['etag']})
    assert о2.status_code == 304 and not о2.content


def test_api_дубль_думк_без_таблицы(api):
    клиент, х = api
    assert prayer.без_таблицы('dumk', 'esik') and 'esik' not in prayer.все_пункты('dumk') and len(prayer.все_пункты('dumk')) == 163
    о = клиент.get('/api/prayer/official', params={'src': 'dumk', 'place': 'esik', 'year': 2026})
    assert о.status_code == 404 and о.json() == {'ошибка': 'no_official'} and not х.очередь
    with pytest.raises(prayer.ОшибкаИсточника) as е:
        prayer.таблица_думк('esik', 2026, lambda _: ДУМК_АЛМАТЫ, lambda: None, 10)
    assert е.value.код == 'dup'


def test_api_нет_таблицы_ставим_в_очередь(api):
    клиент, х = api
    о = клиент.get('/api/prayer/official', params={'src': 'umuz', 'place': 'samarqand', 'year': 2026})
    assert о.status_code == 404 and о.json() == {'ошибка': 'not_ready'} and о.headers['cache-control'] == 'no-store'
    assert ('umuz', 'samarqand', 2026) in х.очередь


@pytest.mark.parametrize('параметры, ошибка', [
    ({'src': 'aladhan', 'place': 'almaty', 'year': 2026}, 'src'),
    ({'src': 'dumk', 'place': '43.25,76.91', 'year': 2026}, 'place'),
    ({'src': 'dumk', 'place': 'toshkent', 'year': 2026}, 'place'),
    ({'src': 'umuz', 'place': 'almaty', 'year': 2026}, 'place'),
    ({'src': 'dumk', 'place': 'almaty', 'year': 2030}, 'year'),
    ({'src': 'dumk', 'place': 'almaty', 'year': 'x'}, 'year'),
    ({'src': 'dumk', 'place': 'almaty'}, 'year'),
    ({'src': 'dumk', 'lat': '43.25', 'lng': '76.91', 'year': 2026}, 'place'),
])
def test_api_только_пункты_списка(api, параметры, ошибка):
    клиент, х = api
    о = клиент.get('/api/prayer/official', params=параметры)
    assert о.status_code == 400 and о.json() == {'ошибка': ошибка}
    assert not х.очередь, 'по неверному запросу ничего не ставим в очередь'


def test_api_лимит(api):
    клиент, _ = api
    коды = [клиент.get('/api/prayer/official', params={'src': 'dumk', 'place': 'almaty', 'year': 2026}).status_code for _ in range(62)]
    assert коды[:60] == [404] * 60 and коды[60:] == [429, 429]


# ───────────── фоновое обновление ─────────────
def test_шаг_обновления_очередь_сверка_и_отказ(monkeypatch):
    х = ХранилищеНамаза()
    х.попросить_намаз('umuz', 'toshkent', 2026, СЕЙЧАС - 5000)
    х.попросить_намаз('dumk', 'almaty', 2026, СЕЙЧАС - 4000)
    адреса = []

    def скачать(адрес):
        адреса.append(адрес)
        if 'islom.uz' in адрес:
            return РЕГИОНЫ
        if '/43.238293/76.945465' in адрес:
            return ДУМК_АЛМАТЫ
        return {'result': []}  # остальные пункты ДУМК в тесте «ломаются»

    счёт = prayer.шаг_обновления(х, скачать, СЕЙЧАС, предел=4, пауза=lambda: None)
    assert ('umuz', 'toshkent', 2026) in х.таблицы and ('dumk', 'almaty', 2026) in х.таблицы, 'сначала — то, что просили'
    assert х.таблицы[('umuz', 'toshkent', 2026)]['точка']['id'] == '27'
    assert адреса[0] == prayer.АДРЕС_РЕГИОНОВ_УМУЗ and х.мета['umuz_regions']['данные'] == РЕГИОНЫ
    assert счёт['принято'] >= 2 and счёт['отказ'] >= 1
    assert any(з[3] == 'days' for з in х.журнал), 'отказ — в журнал'
    отказанные = {(з[0], з[1], з[2]) for з in х.журнал if з[3] == 'days'}
    # повторный шаг сразу: отказанные не скачиваем снова (раз в час), принятые не трогаем
    адреса.clear()
    prayer.шаг_обновления(х, скачать, СЕЙЧАС + 60_000, предел=4, пауза=lambda: None)
    assert not any(з[0] == 'dumk' and f'/{prayer.пункт("dumk", з[1])[1]}/' in а for з in отказанные for а in адреса)

    # перепроверка через неделю: тот же ответ — 'same', таблица не меняется
    дни_до = х.таблицы[('dumk', 'almaty', 2026)]['дни']
    for к in list(х.таблицы):
        х.таблицы[к]['проверено'] = СЕЙЧАС - 8 * prayer.ДЕНЬ_МС
    monkeypatch.setattr(prayer, 'все_пункты', lambda src: [])  # только перепроверка
    х.очередь.clear()
    prayer.шаг_обновления(х, скачать, СЕЙЧАС + 3_700_000, предел=4, пауза=lambda: None)
    assert х.таблицы[('dumk', 'almaty', 2026)]['дни'] == дни_до and х.таблицы[('dumk', 'almaty', 2026)]['проверено'] == СЕЙЧАС + 3_700_000


def test_шаг_обновления_испорченная_новая_версия_не_заменяет_принятую(monkeypatch):
    х = ХранилищеНамаза()
    положить(х)
    х.таблицы[('dumk', 'almaty', 2026)]['проверено'] = СЕЙЧАС - 8 * prayer.ДЕНЬ_МС
    monkeypatch.setattr(prayer, 'все_пункты', lambda src: [])
    плохо = copy.deepcopy(ДУМК_АЛМАТЫ)
    плохо['result'][50]['isha'] = '23:59'
    prayer.шаг_обновления(х, lambda _: плохо, СЕЙЧАС, предел=2, пауза=lambda: None)
    assert х.таблицы[('dumk', 'almaty', 2026)]['дни'] == prayer.разобрать_думк(ДУМК_АЛМАТЫ, 2026)
    assert х.журнал[-1][3] == 'diff'


def test_новый_год_заранее():
    assert prayer.годы(СЕЙЧАС) == [2026, 2027], 'с 1 ноября — и следующий год'
    assert prayer.годы(СЕЙЧАС - 30 * prayer.ДЕНЬ_МС) == [2026]
