"""Разбор и проверка звука записи (чистые функции).

Контракт:
- прочитать_запись(байты) -> (волна float32 16 кГц моно, частота_исходная). Понимает WAV/FLAC/OGG (soundfile).
  Клиент шлёт WAV PCM16 16 кГц моно; другую частоту приводим к 16 кГц линейной интерполяцией.
- оценить_звук(волна) -> None, если звук годится, иначе причина («тихо», «перегруз», «коротко», «длинно»).
Правило CLAUDE.md №7: плохой звук — не ошибка чтения, поэтому при плохом звуке замечаний не даём.
Приватность: запись живёт только в памяти процесса, на диск не пишется.
"""
from __future__ import annotations

import io

import numpy as np
import soundfile as sf

ЧАСТОТА = 16000


class ОшибкаЗаписи(ValueError):
    pass


def прочитать_запись(байты: bytes) -> tuple[np.ndarray, int]:
    if not байты:
        raise ОшибкаЗаписи('пустая запись')
    try:
        волна, частота = sf.read(io.BytesIO(байты), dtype='float32', always_2d=True)
    except Exception as е:  # формат, который soundfile не понимает
        raise ОшибкаЗаписи(f'не удалось прочитать звук: {type(е).__name__}') from None
    волна = волна.mean(axis=1)
    if частота != ЧАСТОТА:
        волна = _пересчитать_частоту(волна, частота)
    return волна.astype(np.float32, copy=False), int(частота)


def _пересчитать_частоту(волна: np.ndarray, частота: int) -> np.ndarray:
    if len(волна) == 0:
        return волна
    новая_длина = max(1, int(round(len(волна) * ЧАСТОТА / частота)))
    старые = np.linspace(0.0, 1.0, num=len(волна), endpoint=False)
    новые = np.linspace(0.0, 1.0, num=новая_длина, endpoint=False)
    return np.interp(новые, старые, волна).astype(np.float32)


def оценить_звук(волна: np.ndarray, мин_сек: float = 0.25, макс_сек: float = 20.0) -> str | None:
    длительность = len(волна) / ЧАСТОТА
    if длительность < мин_сек:
        return 'коротко'
    if длительность > макс_сек:
        return 'длинно'
    if not np.isfinite(волна).all():
        return 'испорчено'
    громкость = float(np.sqrt(np.mean(np.square(волна))) + 1e-12)
    if 20 * np.log10(громкость) < -50:
        return 'тихо'
    if float(np.mean(np.abs(волна) > 0.995)) > 0.01:
        return 'перегруз'
    return None


def длительность_сек(волна: np.ndarray) -> float:
    return len(волна) / ЧАСТОТА
