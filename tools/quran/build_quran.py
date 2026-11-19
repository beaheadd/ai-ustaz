"""Сборка производных Корана для показа: по файлу на суру + индекс сур + манифест для бандла.

Запуск:  python3 -I -B tools/quran/build_quran.py [--xml ПУТЬ] [--check]
  (без сети и сторонних пакетов; по умолчанию XML — content/quran/quran-uthmani-marks.xml)
Пишет:   app/public/quran/NNN.<хэш>.json (114), app/public/quran/index.<хэш>.json, app/src/quran/manifest.generated.ts;
         старые файлы app/public/quran/*.json с другим хэшем удаляет (чужих файлов в папке быть не должно).
--check: ничего не пишет; код 1, если файлы на диске не совпадают со свежей сборкой побайтно.
Проверка — tools/check_content.py (через tools/quran/check_quran.py): sha256 XML = sources.json, 114/6236,
каждый аят каждой производной побайтно равен XML.

Контракт и формат файлов — tools/quran/quran_common.py; для приложения — docs/дизайн/05-коран-чтение-и-плеер.md.
Решение владельца 19.11.2026: «Коран полностью, все аяты…» — полный Коран для чтения, плеера и записи.
Правило 1 CLAUDE.md: текст Корана здесь не создаётся и не меняется — только раскладка дословных строк по файлам.
"""
import pathlib
import sys

sys.path.insert(0, str(pathlib.Path(__file__).resolve().parent))
import quran_common as к  # noqa: E402


def main():
    путь = pathlib.Path(sys.argv[sys.argv.index('--xml') + 1]) if '--xml' in sys.argv else к.ПУТЬ_XML
    файлы, манифест = к.собрать(путь)
    папка = к.ПАПКА_ВЫХОДА
    нужные = {отн.split('/', 1)[1] for отн in файлы}
    есть = {п.name for п in папка.glob('*')} if папка.exists() else set()
    чужие = sorted(и for и in есть if not к.ИМЯ_ФАЙЛА.match(и))
    if чужие:
        print(f'В {папка} чужие файлы: {", ".join(чужие)} — уберите их (папка только для производных Корана).')
        return 1
    if '--check' in sys.argv:
        разные = [о for о, б in файлы.items() if not (папка / о.split('/', 1)[1]).exists()
                  or (папка / о.split('/', 1)[1]).read_bytes() != б]
        лишние = sorted(есть - нужные)
        старый_манифест = к.ПУТЬ_МАНИФЕСТА.read_text(encoding='utf-8') if к.ПУТЬ_МАНИФЕСТА.exists() else ''
        if разные or лишние or старый_манифест != манифест:
            print(f'Производные устарели: разных {len(разные)}, лишних {len(лишние)}, '
                  f'манифест {"другой" if старый_манифест != манифест else "тот же"}. '
                  'Запустите python3 -I -B tools/quran/build_quran.py')
            return 1
        print('Производные Корана совпадают со свежей сборкой.')
        return 0
    папка.mkdir(parents=True, exist_ok=True)
    for имя in sorted(есть - нужные):
        (папка / имя).unlink()
    for отн, байты in файлы.items():
        цель = папка / отн.split('/', 1)[1]
        if not цель.exists() or цель.read_bytes() != байты:
            цель.write_bytes(байты)
    к.ПУТЬ_МАНИФЕСТА.parent.mkdir(parents=True, exist_ok=True)
    к.ПУТЬ_МАНИФЕСТА.write_text(манифест, encoding='utf-8')
    всего = sum(len(б) for б in файлы.values())
    print(f'Готово: {len(файлы)} файлов в {папка.relative_to(к.КОРЕНЬ)} ({всего / 1024:.0f} КБ), '
          f'манифест {к.ПУТЬ_МАНИФЕСТА.relative_to(к.КОРЕНЬ)}; удалено старых: {len(есть - нужные)}.')
    return 0


if __name__ == '__main__':
    sys.exit(main())
