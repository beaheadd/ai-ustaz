# Источник: mugalim@3f33efb speech/aiustaz_speech/envnum.py (копия без изменений, кроме этой строки; владелец 20.11.2026: уведомления о времени намаза)
"""Чтение чисел и строк из окружения (правило CLAUDE.md: не голым int/float(os.environ...)).

Контракт: число_из_окружения(имя, по_умолчанию, мин, макс) — терпит пробелы и комментарий после «#»,
при мусоре или выходе за границы возвращает значение по умолчанию.
"""
from __future__ import annotations

import os


def _сырое(имя: str) -> str | None:
    значение = os.environ.get(имя)
    if значение is None:
        return None
    значение = значение.split('#', 1)[0].strip()
    return значение or None


def число_из_окружения(имя: str, по_умолчанию: float, мин: float | None = None, макс: float | None = None) -> float:
    сырое = _сырое(имя)
    if сырое is None:
        return по_умолчанию
    try:
        число = float(сырое.replace(',', '.'))
    except ValueError:
        return по_умолчанию
    if (мин is not None and число < мин) or (макс is not None and число > макс):
        return по_умолчанию
    return число


def целое_из_окружения(имя: str, по_умолчанию: int, мин: int | None = None, макс: int | None = None) -> int:
    return int(число_из_окружения(имя, по_умолчанию, мин, макс))


def строка_из_окружения(имя: str, по_умолчанию: str = '') -> str:
    сырое = _сырое(имя)
    return по_умолчанию if сырое is None else сырое
