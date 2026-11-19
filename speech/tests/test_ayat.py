"""Тесты проверки ЛЮБОГО аята и части аята — без модели (решение владельца 19.11.2026: «заходишь и читаешь любой аят,
и записываешь голос и проверяешь, где ошибки»).

Что проверяем:
- нумерация слов: слова копии Tanzil ДЛЯ ПОКАЗА (content/quran/quran-uthmani-marks.xml) без знаков-токенов совпадают
  по числу со словами фонетической копии quran-transcript во ВСЕХ 6236 аятах — поэтому номер uthmani-слова с 1
  у клиента (app/src/quran/text.ts) и у сервиса один и тот же;
- uthmani_from / uthmani_words: текст эталона = срез uthmani-слов; совпадает с get_by_imlaey_words пакета для того же
  диапазона (через карту imlaey2uthmani); границы и выход за аят → ValueError (API → 400);
- старые word_from / words (imlaey с 0): «يَـٰٓأَيُّهَا» = два imlaey-слова; резать его пополам нельзя;
- особые аяты: 1:1 (бисмилла — сам аят), 9:1 (без бисмиллы), 2:1 (бисмилла не входит в эталон аята), 2:282 (самый
  длинный: каждая часть между остановками ۘ ۗ ۖ ۚ), аяты со знаком саджды ۩ и с ۞ в начале (в фонетической копии
  этих знаков нет — эталон строится из слов);
- номер слова замечания и фильтр kinds (вид ИЛИ код) — на поддельном «распознавании» без модели;
- API: новые поля, ответ с эталон.слово_с/слов и замечание.слово, 400 на неверный диапазон.
Полный обход всех частей всех аятов (дольше минуты) — MUGALIM_SPEECH_FULL=1.

Запуск: cd speech && python -m pytest tests -q
"""
import io
import os
import sys
import time
import xml.etree.ElementTree as ET

import numpy as np
import pytest
import soundfile as sf

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from aiustaz_speech.reference import (  # noqa: E402
    imlaey_в_uthmani,
    uthmani_диапазон,
    номер_слова,
    эталон_аята,
    _аят,
)

КОРЕНЬ = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
XML_ПОКАЗА = os.path.join(КОРЕНЬ, 'content', 'quran', 'quran-uthmani-marks.xml')
# Знаки-токены копии для показа (как ЗНАКИ в app/src/quran/text.ts) и где можно делить аят на части (черновик политики).
ЗНАКИ = set('ۘۗۖۚۛۙۜ۞۩')
ОСТАНОВКИ_ДЛЯ_ЧАСТЕЙ = set('ۘۗۖۚ')


def _копия_показа() -> dict[tuple[int, int], str]:
    корень = ET.parse(XML_ПОКАЗА).getroot()
    return {(int(с.get('index')), int(а.get('index'))): а.get('text') for с in корень.iter('sura') for а in с.iter('aya')}


ПОКАЗ = _копия_показа() if os.path.exists(XML_ПОКАЗА) else {}


def _слова_показа(текст: str) -> list[str]:
    return [т for т in текст.split(' ') if not (len(т) == 1 and т in ЗНАКИ)]


def _части(текст: str) -> list[tuple[int, int]]:
    """Части между остановками ۘ ۗ ۖ ۚ — как частиПоОстановкам в text.ts: [(словоС, слов)], слова с 1."""
    части, начало, слово = [], 1, 0
    for т in текст.split(' '):
        if len(т) == 1 and т in ЗНАКИ:
            if т in ОСТАНОВКИ_ДЛЯ_ЧАСТЕЙ and слово >= начало:
                части.append((начало, слово - начало + 1))
                начало = слово + 1
            continue
        слово += 1
    if слово >= начало:
        части.append((начало, слово - начало + 1))
    return части


def _срез_пакета(сура, аят, с, слов) -> str:
    """Тот же диапазон через get_by_imlaey_words пакета (как предлагал контракт): uthmani → imlaey → текст."""
    объект = _аят(сура, аят)
    карта = объект._encode_imlaey_to_uthmani().imlaey2uthmani
    imlaey = [и for и in sorted(карта) if с - 1 <= карта[и] <= с + слов - 2]
    return объект.get_by_imlaey_words(imlaey[0], len(imlaey)).uthmani.strip()


# ───────────────────────── нумерация слов ─────────────────────────

@pytest.mark.skipif(not ПОКАЗ, reason='нет content/quran/quran-uthmani-marks.xml')
def test_номера_слов_копии_показа_совпадают_с_фонетической_во_всех_аятах():
    assert len(ПОКАЗ) == 6236
    расхождения = [(с, а) for (с, а), т in ПОКАЗ.items() if len(_слова_показа(т)) != len(_аят(с, а).get().uthmani_words)]
    assert расхождения == []


# ───────────────────────── uthmani-диапазоны ─────────────────────────

def test_диапазон_uthmani_границы():
    assert uthmani_диапазон(1, 1, 1, 4) == (1, 4)
    assert uthmani_диапазон(1, 1, 3) == (3, 2)            # без uthmani_words — до конца аята
    for с, n in ((0, 1), (5, 1), (1, 5), (4, 2), (2, 0), (-1, 1)):
        with pytest.raises(ValueError):
            uthmani_диапазон(1, 1, с, n)
    for сура, аят in ((0, 1), (115, 1), (1, 8), (2, 287), (1, 0), (True, 1)):
        with pytest.raises(ValueError):
            эталон_аята(сура, аят)
    with pytest.raises(ValueError):
        эталон_аята(1, 1, uthmani_слов=2)                  # слов без начала


def test_эталон_1_1_и_1_7():
    целый = эталон_аята(1, 1)
    assert (целый.слово_с, целый.слов) == (1, 4) and целый.текст.startswith('بِسْمِ')   # бисмилла — сам аят 1:1
    часть = эталон_аята(1, 1, uthmani_с=2, uthmani_слов=2)
    assert часть.текст == ' '.join(_аят(1, 1).get().uthmani_words[1:3]) and (часть.слово_с, часть.слов) == (2, 2)
    assert часть.фонемы.startswith('ءَل')                   # начало с хамзат-васля: читается с хамзой
    последнее = эталон_аята(1, 7, uthmani_с=9)              # ٱلضَّآلِّينَ — мадд лязим, 6 счётов
    assert последнее.слов == 1 and 'اااااا' in последнее.фонемы


def test_9_1_без_бисмиллы_и_2_1_без_бисмиллы_в_эталоне():
    девятая = эталон_аята(9, 1)
    assert девятая.текст.split(' ')[0] == _аят(9, 1).get().uthmani_words[0]
    assert not девятая.текст.startswith('بِسْمِ') and _аят(9, 1).get().bismillah_uthmani is None
    вторая = эталон_аята(2, 1)
    assert вторая.текст == _аят(2, 1).get().uthmani and (вторая.слово_с, вторая.слов) == (1, 1)
    assert 'بِسْمِ' not in вторая.текст                     # бисмилла перед сурой — не часть аята 2:1


def test_2_21_يا_أيها_imlaey_и_uthmani():
    слова = _аят(2, 21).get().uthmani_words
    # imlaey: «يَا أَيُّهَا» — два слова на одно uthmani «يَـٰٓأَيُّهَا»
    assert imlaey_в_uthmani(2, 21, 0, 3) == (1, 2)
    assert imlaey_в_uthmani(2, 21, 2, 2) == (2, 2)
    for с0, окно in ((1, 1), (0, 1), (1, 3), (11, 2)):      # режет «يَـٰٓأَيُّهَا» пополам или выходит за аят
        with pytest.raises(ValueError):
            imlaey_в_uthmani(2, 21, с0, окно)
    assert эталон_аята(2, 21, uthmani_с=1, uthmani_слов=2).текст == ' '.join(слова[:2])
    assert эталон_аята(2, 21, 0, 3).текст == эталон_аята(2, 21, uthmani_с=1, uthmani_слов=2).текст


def test_старые_поля_как_раньше_5_109():
    э = эталон_аята(5, 109, 7, 8)                            # word_from=7 (imlaey с 0), words=8
    assert э.текст.startswith('قَالُوا۟') and 'اااا' in э.фонемы and (э.слово_с, э.слов) == (8, 8)
    with pytest.raises(ValueError):
        эталон_аята(5, 109, 7, 9)                            # раньше молча уходило в 5:110


@pytest.mark.skipif(not ПОКАЗ, reason='нет копии для показа')
def test_2_282_каждая_часть_строит_эталон_и_равна_пакету():
    части = _части(ПОКАЗ[(2, 282)])
    assert len(части) > 5 and sum(n for _, n in части) == len(_аят(2, 282).get().uthmani_words) == 128
    for с, n in части:
        э = эталон_аята(2, 282, uthmani_с=с, uthmani_слов=n)
        assert э.фонемы and (э.слово_с, э.слов) == (с, n)
        assert э.текст == _срез_пакета(2, 282, с, n)


@pytest.mark.skipif(not ПОКАЗ, reason='нет копии для показа')
def test_саджда_и_руб_в_начале_аята():
    саджда = [к for к, т in ПОКАЗ.items() if т.split(' ')[-1] == '۩']
    руб = [к for к, т in ПОКАЗ.items() if т.split(' ')[0] == '۞']
    assert len(саджда) == 15 and len(руб) == 199
    for сура, аят in саджда + руб[:20]:
        слова = _слова_показа(ПОКАЗ[(сура, аят)])
        целый = эталон_аята(сура, аят)
        assert '۩' not in целый.текст and '۞' not in целый.текст and целый.слов == len(слова)
        последнее = эталон_аята(сура, аят, uthmani_с=len(слова))          # слово перед ۩ (место поклона)
        assert последнее.текст == _аят(сура, аят).get().uthmani_words[-1] and последнее.фонемы


@pytest.mark.skipif(not ПОКАЗ, reason='нет копии для показа')
def test_части_выборки_аятов_равны_пакету():
    """Части между остановками в аятах, где imlaey ≠ uthmani (يَـٰٓأَيُّهَا, هَـٰٓأَنتُمْ, يَبْنَؤُمَّ…), и в длинных аятах."""
    выборка = [(2, 21), (2, 104), (3, 66), (4, 109), (20, 94), (2, 255), (24, 61), (4, 23), (33, 53), (18, 1), (36, 52)]
    for сура, аят in выборка:
        for с, n in _части(ПОКАЗ[(сура, аят)]):
            assert эталон_аята(сура, аят, uthmani_с=с, uthmani_слов=n).текст == _срез_пакета(сура, аят, с, n), (сура, аят, с, n)


# ───────────────────────── номер слова и kinds ─────────────────────────

def test_номер_слова():
    т = 'ab cd ef'
    assert [номер_слова(т, п, 1) for п in (0, 1, 2, 3, 5, 6, 8, 99, -3)] == [1, 1, 2, 2, 3, 3, 3, 3, 1]
    assert номер_слова(т, 3, 10) == 11


class ЯдроСПодменой:
    """Без модели: «услышано» = эталон с подменой; гипотеза-подмена вероятнее эталона на 10 (уверенно)."""

    def __init__(self, было: str, стало: str):
        self.было, self.стало = было, стало

    def распознать(self, волна, эталон):
        import torch
        from aiustaz_speech.core import Распознано
        фон = эталон.фонемы.replace(self.было, self.стало, 1)
        return Распознано(фонемы=фон, вероятности=[0.9] * len(фон), сифаты=[], лог_вероятности=torch.zeros(10, 5),
                          длительность_сек=len(волна) / 16000)

    def оценить_гипотезы(self, распознано, гипотезы):
        return [10.0 if г == распознано.фонемы else 0.0 for г in гипотезы]


def test_замечание_с_номером_слова_и_kinds_по_коду():
    from aiustaz_speech.explain import разобрать
    # 5:109, слова 8…15 (по фонетической копии): мунфасиль в 11-м слове аята прочитан на 2 счёта вместо 4
    э = эталон_аята(5, 109, uthmani_с=8, uthmani_слов=8)
    assert 'نَاااا' in э.фонемы
    ядро = ЯдроСПодменой('نَاااا', 'نَاا')
    р = ядро.распознать(np.zeros(16000, dtype=np.float32), э)
    все = разобрать(ядро, э, р)
    assert [(з['код'], з['уровень'], з['слово']) for з in все] == [('C1.мунфасиль', 'подсказка', 11)]
    assert _аят(5, 109).get().uthmani_words[10] == э.текст.split(' ')[3]     # слово 11 аята = 4-е слово части
    assert разобрать(ядро, э, р, {'буква', 'огласовка'}) == []              # мадд ещё не проходили — тишина
    assert len(разобрать(ядро, э, р, {'мадд'})) == 1                        # вид
    assert len(разобрать(ядро, э, р, {'буква', 'C1.мунфасиль'})) == 1       # код
    assert разобрать(ядро, э, р, {'C1.табии'}) == []                        # другой код того же вида


def wav(сек=1.0, частота=16000, громкость=0.1):
    t = np.arange(int(сек * частота)) / частота
    буфер = io.BytesIO()
    sf.write(буфер, (громкость * np.sin(2 * np.pi * 220 * t)).astype(np.float32), частота, format='WAV', subtype='PCM_16')
    return буфер.getvalue()


def test_api_uthmani_поля():
    from fastapi.testclient import TestClient
    from aiustaz_speech.app import создать
    with TestClient(создать(ЯдроСПодменой('نَاااا', 'نَاا'))) as клиент:
        def post(**поля):
            return клиент.post('/v1/proverka', files={'audio': ('a.wav', wav(1.0), 'audio/wav')},
                               data={к: str(з) for к, з in поля.items()})
        ответ = post(sura=5, aya=109, uthmani_from=8, uthmani_words=8).json()
        assert ответ['статус'] == 'ок'
        assert (ответ['эталон']['слово_с'], ответ['эталон']['слов']) == (8, 8)
        assert [(з['код'], з['слово']) for з in ответ['замечания']] == [('C1.мунфасиль', 11)]
        assert post(sura=5, aya=109, uthmani_from=8, uthmani_words=8, kinds='буква,огласовка').json()['замечания'] == []
        целый = post(sura=9, aya=1).json()
        assert (целый['эталон']['слово_с'], целый['эталон']['слов']) == (1, len(_аят(9, 1).get().uthmani_words))
        assert post(sura=1, aya=1, uthmani_from=4).json()['эталон']['слов'] == 1
        assert post(text='بَا').json()['эталон'].keys() == {'текст', 'фонемы'}   # учебный текст — без слов
        for плохое in ({'sura': 1, 'aya': 1, 'uthmani_from': 5}, {'sura': 1, 'aya': 1, 'uthmani_from': 2, 'uthmani_words': 4},
                       {'sura': 1, 'aya': 8}, {'sura': 2}, {'sura': 1, 'aya': 1, 'uthmani_from': 0},
                       {'sura': 2, 'aya': 21, 'word_from': 1}, {'sura': 1, 'aya': 1, 'uthmani_from': 'x'}):
            assert post(**плохое).status_code in (400, 422), плохое


# ───────────────────────── полный обход (по желанию) ─────────────────────────

@pytest.mark.skipif(not (ПОКАЗ and os.environ.get('MUGALIM_SPEECH_FULL')), reason='MUGALIM_SPEECH_FULL=1 — полный обход')
def test_все_части_и_все_слова_всех_аятов():
    """Каждый аят целиком, каждая часть между остановками и каждое отдельное слово строят эталон (фонемы не пусты)."""
    начало, всего = time.perf_counter(), 0
    for (сура, аят), текст in sorted(ПОКАЗ.items()):
        слов = len(_слова_показа(текст))
        диапазоны = {(1, слов)} | set(_части(текст)) | {(с, 1) for с in range(1, слов + 1)}
        for с, n in sorted(диапазоны):
            assert эталон_аята(сура, аят, uthmani_с=с, uthmani_слов=n).фонемы, (сура, аят, с, n)
            всего += 1
    print(f'\nэталонов: {всего}, {time.perf_counter() - начало:.0f} с')
