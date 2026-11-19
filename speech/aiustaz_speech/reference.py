"""Эталон: что человек должен был прочитать, в фонетической записи Корана (QPS, quran-transcript).

Контракт:
- эталон_аята(сура, аят, слово_с=None, слов=None) -> Эталон. Текст берётся программно из базы quran-transcript
  (Tanzil Uthmani без знаков остановки) — только для фонетики и выравнивания (CLAUDE.md, правило 1), не для показа.
- эталон_текста(текст) -> Эталон для учебных слогов и слов. Открытый слог в конце («بَ») читается с гласным,
  а фонетизатор применяет правило остановки — поэтому дописываем продолжение и отрезаем его по карте соответствий.
- ПОЛИТИКА_ЧТЕНИЯ: Хафс от ‘Асыма по аш-Шатибийе (решение D2, ПЛАН §15). Эталон строится на 4 счёта для
  муттасиля и мунфасиля; допустимые варианты засчитываются в explain.py, а не здесь.
"""
from __future__ import annotations

from dataclasses import dataclass, field

from quran_transcript import Aya, MoshafAttributes, quran_phonetizer

ПОЛИТИКА_ЧТЕНИЯ = MoshafAttributes(
    rewaya='hafs',
    madd_monfasel_len=4,
    madd_mottasel_len=4,
    madd_mottasel_waqf=4,
    madd_aared_len=2,
)

КРАТКИЕ_ГЛАСНЫЕ = ('َ', 'ِ', 'ُ')  # фатха, кясра, дамма
_ПРОДОЛЖЕНИЕ = ' بِ'


@dataclass
class Эталон:
    текст: str              # уthmani-текст, по которому строилась фонетика
    фонемы: str             # QPS без пробелов
    сифаты: list = field(default_factory=list)
    карта: list = field(default_factory=list)   # MappingPos на каждый символ текста
    вид: str = 'текст'      # 'аят' | 'текст'
    сура: int | None = None
    аят: int | None = None
    исходный: object | None = None              # QuranPhoneticScriptOutput — для модели


def эталон_аята(сура: int, аят: int, слово_с: int | None = None, слов: int | None = None) -> Эталон:
    if not (1 <= сура <= 114):
        raise ValueError('номер суры 1–114')
    объект = Aya(сура, аят)
    if слово_с is None:
        текст = объект.get().uthmani
    else:
        текст = объект.get_by_imlaey_words(слово_с, слов or 1).uthmani
    фон = quran_phonetizer(текст, ПОЛИТИКА_ЧТЕНИЯ, remove_spaces=True, sura_idx=сура)
    return Эталон(текст=текст, фонемы=фон.phonemes, сифаты=list(фон.sifat), карта=list(фон.mappings),
                  вид='аят', сура=сура, аят=аят, исходный=фон)


def эталон_текста(текст: str) -> Эталон:
    текст = ' '.join(текст.split())
    if not текст:
        raise ValueError('пустой текст')
    открытый = текст[-1] in КРАТКИЕ_ГЛАСНЫЕ
    if not открытый:
        фон = quran_phonetizer(текст, ПОЛИТИКА_ЧТЕНИЯ, remove_spaces=True)
        return Эталон(текст=текст, фонемы=фон.phonemes, сифаты=list(фон.sifat), карта=list(фон.mappings), исходный=фон)
    полный = quran_phonetizer(текст + _ПРОДОЛЖЕНИЕ, ПОЛИТИКА_ЧТЕНИЯ, remove_spaces=True)
    карта = list(полный.mappings[:len(текст)])
    конец = max(мп.pos[1] for мп in карта)
    фонемы = полный.phonemes[:конец]
    # Сифаты продолжения отбрасываем: оставляем группы, целиком лежащие в отрезанной части.
    сифаты, длина = [], 0
    for с in полный.sifat:
        длина += len(с.phonemes)
        if длина > конец:
            break
        сифаты.append(с)
    исходный = type(полный)(phonemes=фонемы, sifat=сифаты, mappings=карта) if _можно_собрать(полный) else None
    return Эталон(текст=текст, фонемы=фонемы, сифаты=сифаты, карта=карта, исходный=исходный)


def _можно_собрать(объект) -> bool:
    try:
        type(объект)(phonemes=объект.phonemes, sifat=объект.sifat, mappings=объект.mappings)
        return True
    except Exception:
        return False
