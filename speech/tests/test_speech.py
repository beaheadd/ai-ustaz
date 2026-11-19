"""Тесты речевого сервиса: чистые функции без модели + API с подставным ядром; с моделью — если задан путь.

Запуск: python -I -m pytest speech/tests -q   (из корня репозитория, в venv сервиса)
С моделью: MUGALIM_SPEECH_MODEL_DIR=<папка снимка модели> — тогда прогоняется и настоящий проход.
"""
import io
import os
import sys

import numpy as np
import pytest
import soundfile as sf

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from aiustaz_speech import audio, envnum  # noqa: E402
from aiustaz_speech.reference import эталон_аята, эталон_текста  # noqa: E402


def wav(сек=1.0, частота=16000, громкость=0.1):
    t = np.arange(int(сек * частота)) / частота
    буфер = io.BytesIO()
    sf.write(буфер, (громкость * np.sin(2 * np.pi * 220 * t)).astype(np.float32), частота, format='WAV', subtype='PCM_16')
    return буфер.getvalue()


def test_envnum(monkeypatch):
    monkeypatch.setenv('X_NUM', ' 3 # комментарий')
    assert envnum.целое_из_окружения('X_NUM', 1) == 3
    monkeypatch.setenv('X_NUM', 'мусор')
    assert envnum.целое_из_окружения('X_NUM', 7) == 7
    monkeypatch.setenv('X_NUM', '500')
    assert envnum.целое_из_окружения('X_NUM', 7, 1, 100) == 7


def test_запись_и_частота():
    волна, частота = audio.прочитать_запись(wav(1.0, 44100))
    assert частота == 44100 and abs(len(волна) - 16000) <= 1
    assert audio.оценить_звук(волна) is None
    assert audio.оценить_звук(audio.прочитать_запись(wav(0.1))[0]) == 'коротко'
    assert audio.оценить_звук(audio.прочитать_запись(wav(1.0, громкость=0.0001))[0]) == 'тихо'
    with pytest.raises(audio.ОшибкаЗаписи):
        audio.прочитать_запись(b'not audio')


def test_эталоны():
    assert эталон_текста('بَ').фонемы == 'بَ'          # открытый слог — с гласным, без правила остановки
    assert эталон_текста('بَا').фонемы == 'بَاا'       # мадд табии — 2 счёта
    assert эталон_текста('أَبْ').фонемы == 'ءَبڇ'      # ب с сукуном — калькаля
    э = эталон_аята(5, 109, 7, 8)
    assert э.текст.startswith('قَالُوا۟') and 'اااا' in э.фонемы  # мунфасиль لَنَآ إِنَّكَ — 4 счёта


class ПодставноеЯдро:
    def распознать(self, волна, эталон):
        from aiustaz_speech.core import Распознано
        import torch
        return Распознано(фонемы=эталон.фонемы, вероятности=[0.9] * len(эталон.фонемы), сифаты=[],
                          лог_вероятности=torch.zeros(10, 5), длительность_сек=len(волна) / 16000)

    def оценить_гипотезы(self, распознано, гипотезы):
        return [0.0 for _ in гипотезы]


def test_api_подставное_ядро():
    from fastapi.testclient import TestClient
    from aiustaz_speech.app import создать
    with TestClient(создать(ПодставноеЯдро())) as клиент:
        assert клиент.get('/v1/zdorovye').json()['ок'] is True
        ответ = клиент.post('/v1/proverka', files={'audio': ('a.wav', wav(1.0), 'audio/wav')}, data={'text': 'بَا'}).json()
        assert ответ['статус'] == 'ок' and ответ['замечания'] == [] and ответ['эталон']['фонемы'] == 'بَاا'
        тихо = клиент.post('/v1/proverka', files={'audio': ('a.wav', wav(1.0, громкость=0.0001), 'audio/wav')}, data={'text': 'بَ'}).json()
        assert тихо == {'статус': 'плохой_звук', 'причина': 'тихо', 'длительность_сек': 1.0}
        assert клиент.post('/v1/proverka', files={'audio': ('a.wav', b'xx', 'audio/wav')}, data={'text': 'بَ'}).status_code == 400
        assert клиент.post('/v1/proverka', files={'audio': ('a.wav', wav(1.0), 'audio/wav')}, data={'text': ''}).status_code == 400


@pytest.mark.skipif(not os.environ.get('MUGALIM_SPEECH_MODEL_DIR'), reason='нет модели')
def test_настоящая_модель_на_синусе_молчит():
    """Синус вместо голоса: сервис не должен «находить ошибки» с уверенностью — либо тишина, либо мало."""
    from aiustaz_speech.core import РечевоеЯдро
    from aiustaz_speech.explain import разобрать
    ядро = РечевоеЯдро(os.environ['MUGALIM_SPEECH_MODEL_DIR'], 2)
    э = эталон_текста('بَا')
    р = ядро.распознать(audio.прочитать_запись(wav(1.0))[0], э)
    замечания = разобрать(ядро, э, р)
    assert all(з['уровень'] in ('проверьте', 'подсказка') for з in замечания)
