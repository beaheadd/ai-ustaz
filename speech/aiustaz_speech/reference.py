"""Эталон: что человек должен был прочитать, в фонетической записи Корана (QPS, quran-transcript).

Контракт:
- эталон_аята(сура, аят, слово_с=None, слов=None, *, uthmani_с=None, uthmani_слов=None) -> Эталон.
  Текст берётся программно из базы quran-transcript (Tanzil Uthmani без знаков остановки) — только для фонетики
  и выравнивания (CLAUDE.md, правило 1), не для показа.
  * uthmani_с / uthmani_слов — НОМЕРА UTHMANI-СЛОВ С 1 (поля формы uthmani_from / uthmani_words). Это нумерация
    клиента: слова копии Tanzil для показа без знаков-токенов (app/src/quran/text.ts) совпадают по числу и порядку
    со словами этой копии во всех 6236 аятах (docs/дизайн/05, §1.2). uthmani_слов не задано — до конца аята.
  * слово_с / слов — СТАРЫЕ поля word_from / words: imlaey-слова С 0 (как Aya.get_by_imlaey_words пакета).
    Оставлены для совместимости; переводятся в uthmani-слова картой Aya._encode_imlaey_to_uthmani().imlaey2uthmani.
  * Диапазон — только внутри одного аята (иначе ValueError → 400): get_by_imlaey_words пакета молча переходит
    в следующий аят, а эталон обязан совпадать с тем, что ученик видит на экране.
  * Текст эталона = uthmani-слова диапазона через пробел (срез слов аята; совпадает с get_by_imlaey_words пакета
    для того же диапазона — проверено тестом). Эталон.слово_с / слов — диапазон в uthmani-словах с 1 по ВСЕМУ аяту:
    по нему explain.py ставит каждому замечанию номер слова.
- uthmani_диапазон(сура, аят, с, слов) -> (с, слов) — проверенный диапазон uthmani-слов с 1.
- imlaey_в_uthmani(сура, аят, с0, окно) -> (с, слов) — старые imlaey-поля в uthmani-диапазон.
- номер_слова(текст, позиция, слово_с) -> номер uthmani-слова (с 1, по всему аяту) символа текста эталона.
- эталон_повтора(текст, раз) -> Эталон учебного текста, прочитанного раз (1–3) подряд (урок 0: «а — и — у» три раза):
  текст = ' '.join([текст] * раз), повторов = раз. Позиции замечаний explain.py/describe.py переводит в ОДНОКРАТНЫЙ
  текст (по модулю длины одного чтения) и ставит номер чтения — 20.11.2026 позиции в утроенном тексте, которого нет
  на экране, давали подсказку «в одном месте».
- эталон_текста(текст) -> Эталон для учебных слогов и слов. Открытый слог в конце («بَ») читается с гласным,
  а фонетизатор применяет правило остановки — поэтому дописываем продолжение и отрезаем его по карте соответствий.
- ПОЛИТИКА_ЧТЕНИЯ: Хафс от ‘Асыма по аш-Шатибийе (решение D2, ПЛАН §15). Эталон строится на 4 счёта для
  муттасиля и мунфасиля; допустимые варианты засчитываются в explain.py, а не здесь.
- Часть аята начинается и кончается там, где ученик начинает и останавливается: фонетизатор сам применяет правила
  начала (хамзат-васль в начале читается: «ٱلْحَىُّ» → «ءَلحَ…») и остановки на последнем слове.
Решение владельца 19.11.2026: «заходишь и читаешь любой аят, и записываешь голос и проверяешь, где ошибки».
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
    слово_с: int | None = None                  # первое uthmani-слово эталона, с 1, по всему аяту (только 'аят')
    слов: int | None = None                     # сколько uthmani-слов в эталоне (только 'аят')
    повторов: int = 1                           # учебный текст, прочитанный K раз подряд: текст = ' '.join([t] * K)


_база: list[Aya] = []  # база quran-transcript читается с диска один раз (≈ 30 мс), дальше — set_new без чтения


def _аят(сура: int, аят: int) -> Aya:
    if isinstance(сура, bool) or not isinstance(сура, int) or not (1 <= сура <= 114):
        raise ValueError('номер суры 1–114')
    if isinstance(аят, bool) or not isinstance(аят, int) or аят < 1:
        raise ValueError('номер аята с 1')
    if not _база:
        _база.append(Aya(1, 1))
    try:
        return _база[0].set_new(сура, аят)
    except AssertionError:
        raise ValueError('нет такого аята') from None


def _целое(x, имя: str) -> int:
    if isinstance(x, bool) or not isinstance(x, int):
        raise ValueError(f'{имя}: нужно целое число')
    return x


def uthmani_диапазон(сура: int, аят: int, с: int, слов: int | None = None) -> tuple[int, int]:
    """Проверенный диапазон uthmani-слов с 1 внутри аята. слов=None — до конца аята."""
    всего = len(_аят(сура, аят).get().uthmani_words)
    с = _целое(с, 'uthmani_from')
    if not (1 <= с <= всего):
        raise ValueError(f'uthmani_from вне аята (слов {всего})')
    if слов is None:
        слов = всего - с + 1
    слов = _целое(слов, 'uthmani_words')
    if слов < 1 or с + слов - 1 > всего:
        raise ValueError(f'uthmani_words выходит за аят (слов {всего})')
    return с, слов


def imlaey_в_uthmani(сура: int, аят: int, с0: int, окно: int | None = None) -> tuple[int, int]:
    """Старые поля word_from (imlaey с 0) и words → uthmani-диапазон с 1. Нельзя резать uthmani-слово пополам."""
    объект = _аят(сура, аят)
    карта = объект._encode_imlaey_to_uthmani().imlaey2uthmani  # imlaey (с 0) → uthmani (с 0)
    всего = len(карта)
    с0 = _целое(с0, 'word_from')
    окно = 1 if окно is None else _целое(окно, 'words')
    if not (0 <= с0 < всего) or окно < 1 or с0 + окно > всего:
        raise ValueError(f'word_from/words вне аята (imlaey-слов {всего})')
    по0 = с0 + окно - 1
    if (с0 > 0 and карта[с0] == карта[с0 - 1]) or (по0 + 1 < всего and карта[по0] == карта[по0 + 1]):
        raise ValueError('диапазон режет uthmani-слово пополам')
    return карта[с0] + 1, карта[по0] - карта[с0] + 1


def номер_слова(текст: str, позиция: int, слово_с: int) -> int:
    """Номер uthmani-слова (с 1, по всему аяту), в которое попадает символ текста эталона (пробел — к следующему)."""
    позиция = max(0, min(int(позиция), len(текст)))
    номер = слово_с + текст.count(' ', 0, позиция)
    if позиция < len(текст) and текст[позиция] == ' ':
        номер += 1
    return min(номер, слово_с + текст.count(' '))


def эталон_аята(
    сура: int,
    аят: int,
    слово_с: int | None = None,
    слов: int | None = None,
    *,
    uthmani_с: int | None = None,
    uthmani_слов: int | None = None,
) -> Эталон:
    объект = _аят(сура, аят)
    слова = объект.get().uthmani_words
    if uthmani_с is not None:
        с, n = uthmani_диапазон(сура, аят, uthmani_с, uthmani_слов)
    elif uthmani_слов is not None:
        raise ValueError('uthmani_words без uthmani_from')
    elif слово_с is not None:
        с, n = imlaey_в_uthmani(сура, аят, слово_с, слов)
    else:
        с, n = 1, len(слова)
    текст = ' '.join(слова[с - 1:с - 1 + n])
    фон = quran_phonetizer(текст, ПОЛИТИКА_ЧТЕНИЯ, remove_spaces=True, sura_idx=сура)
    return Эталон(текст=текст, фонемы=фон.phonemes, сифаты=list(фон.sifat), карта=list(фон.mappings),
                  вид='аят', сура=сура, аят=аят, исходный=фон, слово_с=с, слов=n)


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


def эталон_повтора(текст: str, раз: int) -> Эталон:
    """Учебный текст, прочитанный раз подряд (1–3). Однократный текст — первые len(текст) символов."""
    текст = ' '.join(текст.split())
    if not (1 <= раз <= 3):
        raise ValueError('повторов 1–3')
    if раз == 1:
        return эталон_текста(текст)
    эталон = эталон_текста(' '.join([текст] * раз))
    эталон.повторов = раз
    return эталон
