"""Речевое ядро: модель quran-muaalem 0.3.0 как библиотека (пакет не меняем — QML-1.0, CLAUDE.md).

Почему не готовый engine: он отдаёт только строку фонем, дополняет вход до 15 с и слушает на всех адресах
(проверено по пакету 18.11.2026, ПЛАН §7.1, решение D9). Здесь — свой прямой проход модели:
- распознать(волна, эталон) -> Распознано: фонемы с вероятностями, сифаты, покадровые лог-вероятности фонем;
- оценить_гипотезы(распознано, [фонемы_1, фонемы_2, …]) -> лог-правдоподобия CTC каждой гипотезы
  (бинарная проверка «эталон или известная подмена», каталог ошибок §4).
Дополнение — по длине записи (без 15 с). Потоки процессора — MUGALIM_SPEECH_THREADS.
Решение владельца 19.11.2026: на старте сервис живёт на сервере BATR (CPU), с жёстким потолком нагрузки.
"""
from __future__ import annotations

import threading
from dataclasses import dataclass

import numpy as np
import torch
from quran_transcript import chunck_phonemes
from quran_muaalem import Muaalem
from quran_muaalem.decode import multilevel_greedy_decode, phonemes_level_greedy_decode
from quran_muaalem.inference import format_sifat

from .audio import ЧАСТОТА
from .reference import Эталон

ПУСТОЙ_ТОКЕН = 0  # blank CTC в словаре фонем (как в engine/serve.py пакета)


@dataclass
class Распознано:
    фонемы: str
    вероятности: list[float]       # на каждую распознанную фонему
    сифаты: list                    # list[Sifa] пакета
    лог_вероятности: torch.Tensor   # (T, C) фонемного уровня, float32
    длительность_сек: float


class РечевоеЯдро:
    def __init__(self, путь_модели: str, потоков: int = 2):
        torch.set_num_threads(max(1, потоков))
        self._модель = Muaalem(model_name_or_path=путь_модели, device='cpu', dtype=torch.float32)
        self._модель.model.eval()
        self._словарь = self._модель.multi_level_tokenizer.id_to_vocab['phonemes']
        self._номер_фонемы = {знак: int(номер) for номер, знак in self._словарь.items() if int(номер) != ПУСТОЙ_ТОКЕН}
        self._замок = threading.Lock()   # одна запись за раз: потолок нагрузки на общий сервер

    @torch.no_grad()
    def распознать(self, волна: np.ndarray, эталон: Эталон) -> Распознано:
        м = self._модель
        if эталон.исходный is None:
            raise ValueError('эталон без фонетики')
        with self._замок:
            признаки = м.processor([волна], sampling_rate=ЧАСТОТА, return_tensors='pt')
            признаки = {к: з.to('cpu', dtype=torch.float32) for к, з in признаки.items()}
            выходы = м.model(**признаки, return_dict=False)[0]
        вероятности = {уровень: torch.softmax(выходы[уровень], dim=-1).to(torch.float32) for уровень in выходы}
        фон_единицы = phonemes_level_greedy_decode(вероятности['phonemes'], self._словарь)
        куски = [chunck_phonemes(е.text) for е in фон_единицы]
        ид_эталона = м.multi_level_tokenizer.tokenize(
            [эталон.исходный.phonemes], [эталон.исходный.sifat],
            to_dict=True, return_tensors='pt', padding='longest')['input_ids']
        по_уровням = multilevel_greedy_decode(
            level_to_probs=вероятности,
            level_to_id_to_vocab=м.multi_level_tokenizer.id_to_vocab,
            level_to_ref_ids=ид_эталона,
            chunked_phonemes_batch=куски,
            ref_chuncked_phonemes_batch=[[с.phonemes for с in эталон.исходный.sifat]],
            phonemes_units=фон_единицы,
        )
        сифаты = format_sifat(по_уровням, куски, м.multi_level_tokenizer)[0]
        единица = по_уровням['phonemes'][0]
        вер = [float(p) for p in (единица.probs.tolist() if hasattr(единица.probs, 'tolist') else единица.probs)]
        лог = torch.log_softmax(выходы['phonemes'][0].to(torch.float32), dim=-1)
        return Распознано(фонемы=единица.text, вероятности=вер, сифаты=сифаты,
                          лог_вероятности=лог, длительность_сек=len(волна) / ЧАСТОТА)

    def в_номера(self, фонемы: str) -> list[int]:
        неизвестные = [з for з in фонемы if з not in self._номер_фонемы]
        if неизвестные:
            raise ValueError(f'нет в словаре модели: {"".join(sorted(set(неизвестные)))}')
        return [self._номер_фонемы[з] for з in фонемы]

    def оценить_гипотезы(self, распознано: Распознано, гипотезы: list[str]) -> list[float]:
        """Лог-правдоподобие CTC каждой гипотезы на одних и тех же кадрах (больше — вероятнее)."""
        лог = распознано.лог_вероятности.unsqueeze(1)  # (T, 1, C)
        итог = []
        for г in гипотезы:
            цели = torch.tensor([self.в_номера(г)], dtype=torch.long)
            потеря = torch.nn.functional.ctc_loss(
                лог, цели, input_lengths=torch.tensor([лог.shape[0]]), target_lengths=torch.tensor([цели.shape[1]]),
                blank=ПУСТОЙ_ТОКЕН, reduction='sum', zero_infinity=True)
            итог.append(-float(потеря))
        return итог
