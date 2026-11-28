#!/usr/bin/env python3
"""
Подмножество шрифта интерфейса AI Ustaz (Inter 400 и 600) — для бандла приложения.

Назначение. Интерфейс (ru/kk/uz/en/tr/id) рисуется шрифтом Inter: одинаковые табличные цифры времени намаза
на всех телефонах и проверенные казахские буквы (Ә Ғ Қ Ң Ө Ұ Ү Һ І). Полный файл Inter — 342 КБ,
нам нужны латиница, кириллица и знаки: подмножество woff2 ≈ 23 КБ на начертание.

Источник (закреплён): npm-пакет @expo-google-fonts/inter@0.4.2 (MIT + SIL OFL-1.1),
  400Regular/Inter_400Regular.ttf   sha256 a414b48aa577ef2c62ebb135341ddeef33ee26a4f5dc9f787f93c1aab08ebb50
  600SemiBold/Inter_600SemiBold.ttf sha256 f30e9d2574c3bec5144347ff965f9841c8f06857f0b7383000f8c9489a161841
Лицензия шрифта — SIL OFL-1.1 без Reserved Font Name: подмножество можно делать без переименования
(текст — licenses/fonts/Inter-OFL.txt).

Контракт:
  python3 -I tools/fonts/subset_ui_font.py --source ПАПКА_ПАКЕТА [--out app/src/assets/fonts]
    ПАПКА_ПАКЕТА — распакованный npm pack @expo-google-fonts/inter@0.4.2 (папка package/).
  Выход: inter-400.woff2, inter-600.woff2 (веб) и inter-400.ttf, inter-600.ttf (нативная сборка).
  Нужен fontTools 4.60+ и brotli (pip install fonttools brotli) — только для разработчика, не в бандл.
  Проверяет sha256 исходников; при несовпадении — ошибка (версию меняет только ведущий, с записью здесь).
Решение: дизайн-система 19.11.2026 (docs/дизайн/03-дизайн-система.md §3).
"""
import argparse
import hashlib
import pathlib
import sys

from fontTools import subset
from fontTools.ttLib import TTFont

ИСТОЧНИКИ = {
    '400': ('400Regular/Inter_400Regular.ttf', 'a414b48aa577ef2c62ebb135341ddeef33ee26a4f5dc9f787f93c1aab08ebb50'),
    '600': ('600SemiBold/Inter_600SemiBold.ttf', 'f30e9d2574c3bec5144347ff965f9841c8f06857f0b7383000f8c9489a161841'),
}

# Латиница (ASCII + Latin-1); кириллица: основной блок (русский и др.) + буквы казахского
# (Ә Ғ Қ Ң Ө Ұ Ү Һ І), узбекского и кыргызского (Ҳ, Ў), татарского (Җ);
# типографские знаки: тире, кавычки, многоточие, №, ₸, стрелки, математика, тонкие пробелы.
ДИАПАЗОНЫ = [
    (0x0020, 0x007E),
    (0x00A0, 0x00FF),
    # Турецкий и узбекский (решение владельца 28.11.2026, дизайн A/C: без них ğ ı ş İ и узбекские ʻ ʼ рисовал системный
    # шрифт — буквы другого рисунка посреди слова): Ğ ğ, İ ı, Ş ş, ʻ ʼ.
    (0x011E, 0x011F),
    (0x0130, 0x0131),
    (0x015E, 0x015F),
    (0x02BB, 0x02BC),
    (0x0400, 0x045F),
    (0x0490, 0x0493),
    (0x0496, 0x0497),
    (0x049A, 0x049B),
    (0x04A2, 0x04A3),
    (0x04AE, 0x04B3),
    (0x04BA, 0x04BB),
    (0x04D8, 0x04D9),
    (0x04E8, 0x04E9),
    (0x2009, 0x200A),
    (0x2010, 0x2027),
    (0x202F, 0x202F),
    (0x2030, 0x203A),
    (0x20B8, 0x20B8),
    (0x2116, 0x2116),
    (0x2190, 0x2193),
    (0x2212, 0x2212),
    (0x2248, 0x2248),
    (0x2264, 0x2265),
]

# OpenType-функции: по умолчанию fontTools оставляет базовые (kern, liga, calt, ccmp, locl, mark…);
# добавляем табличные цифры (время намаза) и «case» (знаки под прописные).
ДОП_ФУНКЦИИ = ['tnum', 'case']


def sha256(путь: pathlib.Path) -> str:
    return hashlib.sha256(путь.read_bytes()).hexdigest()


def сделать(источник: pathlib.Path, выход: pathlib.Path, формат: str) -> int:
    шрифт = TTFont(str(источник))
    опции = subset.Options()
    опции.layout_features = опции.layout_features + ДОП_ФУНКЦИИ
    опции.name_IDs = ['*']  # имена и копирайт сохраняем как есть (OFL)
    опции.name_languages = ['*']
    опции.notdef_outline = True
    опции.hinting = False  # на экранах телефонов не нужно, экономит треть веса
    опции.desubroutinize = True
    if формат == 'woff2':
        опции.flavor = 'woff2'
    подмножество = subset.Subsetter(опции)
    коды = [к for н, в in ДИАПАЗОНЫ for к in range(н, в + 1)]
    подмножество.populate(unicodes=коды)
    подмножество.subset(шрифт)
    шрифт.flavor = 'woff2' if формат == 'woff2' else None
    шрифт.save(str(выход))
    return выход.stat().st_size


def main() -> int:
    п = argparse.ArgumentParser(description=__doc__.split('\n')[1])
    п.add_argument('--source', required=True, help='папка package/ пакета @expo-google-fonts/inter@0.4.2')
    п.add_argument('--out', default=str(pathlib.Path(__file__).resolve().parents[2] / 'app' / 'src' / 'assets' / 'fonts'))
    а = п.parse_args()
    корень = pathlib.Path(а.source)
    выход = pathlib.Path(а.out)
    выход.mkdir(parents=True, exist_ok=True)
    for вес, (путь, хеш) in ИСТОЧНИКИ.items():
        файл = корень / путь
        if not файл.is_file():
            print(f'Нет файла {файл}', file=sys.stderr)
            return 1
        if sha256(файл) != хеш:
            print(f'sha256 не совпадает: {файл} — не та версия Inter', file=sys.stderr)
            return 1
        for формат in ('woff2', 'ttf'):
            имя = выход / f'inter-{вес}.{формат}'
            размер = сделать(файл, имя, формат)
            print(f'{имя.name}: {размер / 1024:.1f} КБ')
    return 0


if __name__ == '__main__':
    sys.exit(main())
