"""Сборка раздела «Хадисы»: хадисы «Сахиха» аль-Бухари с переводом из HadeethEnc.com → app/public/hadith.

Решение владельца 21.11.2026: «Добавь хадисы Аль-Бухари ещё перевод!». Контракт данных, отбор, условия HadeethEnc и
что скрыто до одобрения устазом — tools/hadith/hadith_common.py; экраны — docs/дизайн/09-хадисы.md.

Запуск (из корня репозитория, без сторонних пакетов):
  python3 -I -B tools/hadith/build_hadith.py --download            скачать выгрузки ar, ru, en, uz (SQLite + CSV) в
                                                                     content/hadith/raw/ (вне git, ≈ 48 МБ) и сверить
                                                                     sha256 с content/sources.json; не совпало — файл
                                                                     не заменяется, код 1 (HadeethEnc обновил выгрузку)
  python3 -I -B tools/hadith/build_hadith.py --download --update   то же, но принять новые выгрузки: записать версии,
                                                                     даты и sha256 в sources.json и напечатать новые
                                                                     ЭТАЛОНЫ для hadith_common.py (вставить руками)
  python3 -I -B tools/hadith/build_hadith.py                       собрать app/public/hadith, манифест и
                                                                     content/hadith/на-проверку-устаза.json
  python3 -I -B tools/hadith/build_hadith.py --check               ничего не пишет: tools/hadith/check_hadith.py с
                                                                     обязательным сырьём (дословность каждого поля
                                                                     посимвольно, скрытые не опубликованы, нет пустых
                                                                     переводов, файлы = свежей сборке); код 1 — ошибки
Сеть — только hadeethenc.com и только с --download.
"""
import json
import pathlib
import sys
import urllib.request

sys.path.insert(0, str(pathlib.Path(__file__).resolve().parent))
import hadith_common as х  # noqa: E402

АДРЕС_ВЫГРУЗКИ = 'https://hadeethenc.com/en/browse/download/{язык}/{вид}'
ТАЙМАУТ = 300


def скачать(адрес):
    запрос = urllib.request.Request(адрес, headers={'User-Agent': 'aiustaz-content-build'})
    with urllib.request.urlopen(запрос, timeout=ТАЙМАУТ) as ответ:
        return ответ.geturl(), ответ.read()


def загрузка(принять):
    источники = х.прочитать_источники()
    запись = х.запись_источника(источники)
    if not запись:
        print('В content/sources.json нет записи «hadeethenc».')
        return 1
    прежние = х.файлы_записи(запись)
    х.ПАПКА_СЫРЫХ.mkdir(parents=True, exist_ok=True)
    новые, расхождения = [], []
    версии = {}
    for язык in х.ЯЗЫКИ:
        for вид in ('csv', 'sqlite'):
            итоговый, байты = скачать(АДРЕС_ВЫГРУЗКИ.format(язык=язык, вид=вид))
            имя = итоговый.rsplit('/', 1)[-1]
            if вид == 'sqlite' and имя != f'{язык}.sqlite.zip':
                raise ValueError(f'{итоговый}: ожидался {язык}.sqlite.zip')
            if вид == 'csv':
                версии[язык] = х.версия_csv(байты)
                if имя != f'HadeethEnc.com_{язык}-v{версии[язык][0]}.csv':
                    raise ValueError(f'{итоговый}: имя не совпадает с версией в шапке {версии[язык][0]}')
            sha = х.sha256_байтов(байты)
            было = прежние.get((язык, вид))
            if not принять and (not было or было['файл'] != имя or было['sha256'] != sha):
                расхождения.append(f'{язык}/{вид}: {имя} {sha} ≠ sources.json {было and было["файл"]} {было and было["sha256"]}')
                continue
            (х.ПАПКА_СЫРЫХ / имя).write_bytes(байты)
            новые.append({'язык': язык, 'вид': вид, 'файл': имя,
                          'адрес': итоговый.split('://', 1)[-1], 'версия': версии[язык][0], 'дата': версии[язык][1],
                          'sha256': sha, 'байт': len(байты)})
            print(f'  {имя}: {len(байты)} байт, sha256 {sha}')
    if расхождения:
        print('HadeethEnc отдаёт не те выгрузки, что записаны (файлы не заменены):')
        for р in расхождения:
            print('  - ' + р)
        print('Принять новые версии: --download --update (затем проверка устазом изменений, правило 11).')
        return 1
    if принять:
        запись['выгрузки'] = новые
        запись['прочитано'] = х.ЗАГРУЖЕНО
        х.ПУТЬ_ИСТОЧНИКОВ.write_text(json.dumps(источники, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
        print('sources.json обновлён. Новые ЭТАЛОНЫ для tools/hadith/hadith_common.py:')
        print('ЭТАЛОНЫ = {')
        for н in новые:
            print(f"    '{н['файл']}': '{н['sha256']}',")
        print('}')
    print(f'Готово: {len(новые)} файлов в {х.ПАПКА_СЫРЫХ.relative_to(х.КОРЕНЬ)}.')
    return 0


def записать(сборка):
    папка = х.ПАПКА_ВЫХОДА
    нужные = {отн.split('/', 1)[1] for отн in сборка.файлы}
    есть = {str(п.relative_to(папка)) for п in папка.rglob('*') if п.is_file()} if папка.exists() else set()
    for отн in sorted(есть - нужные):
        (папка / отн).unlink()
    for отн, байты in сборка.файлы.items():
        цель = папка / отн.split('/', 1)[1]
        цель.parent.mkdir(parents=True, exist_ok=True)
        if not цель.exists() or цель.read_bytes() != байты:
            цель.write_bytes(байты)
    for п in sorted(папка.glob('*'), reverse=True):
        if п.is_dir() and not any(п.iterdir()):
            п.rmdir()
    х.ПУТЬ_МАНИФЕСТА.parent.mkdir(parents=True, exist_ok=True)
    х.ПУТЬ_МАНИФЕСТА.write_text(сборка.манифест, encoding='utf-8')
    х.ПУТЬ_НА_ПРОВЕРКУ.write_bytes(сборка.на_проверку)
    return len(есть - нужные)


def печать_итогов(итоги, сборка):
    for к, в in итоги.items():
        if к == 'исключены':
            for id_, п in sorted(в.items()):
                print(f'    исключён #{id_}: {п}')
        elif isinstance(в, dict):
            print(f'  {к}:')
            for кк, вв in в.items():
                print(f'    {кк}: {вв}')
        else:
            print(f'  {к}: {в}')
    всего = sum(len(б) for б in сборка.файлы.values())
    print(f'  файлов: {len(сборка.файлы)}, {всего} байт ({всего / 1024:.0f} КБ)')


def main():
    if '--download' in sys.argv:
        return загрузка('--update' in sys.argv)
    if '--check' in sys.argv:
        import check_hadith
        ошибки, счёт, предупреждения = check_hadith.проверить(требовать_сырьё=True)
        for к, в in счёт.items():
            print(f'  {к}: {в}')
        for п in предупреждения:
            print('ПРЕДУПРЕЖДЕНИЕ: ' + п)
        if ошибки:
            print(f'ОШИБКИ ({len(ошибки)}):')
            for е in ошибки[:200]:
                print('  - ' + е)
            return 1
        print('Хадисы: дословно, скрытые не опубликованы, файлы = свежей сборке.')
        return 0
    try:
        выгрузки = х.прочитать_выгрузки(х.запись_источника())
    except FileNotFoundError as е:
        print(f'Нет сырой выгрузки {е}. Сначала: python3 -I -B tools/hadith/build_hadith.py --download')
        return 2
    сборка = х.собрать(выгрузки, х.прочитать_одобрено())
    удалено = записать(сборка)
    print('Хадисы аль-Бухари (HadeethEnc.com):')
    печать_итогов(сборка.итоги, сборка)
    print(f'Готово: {х.ПАПКА_ВЫХОДА.relative_to(х.КОРЕНЬ)}, {х.ПУТЬ_МАНИФЕСТА.relative_to(х.КОРЕНЬ)}, '
          f'{х.ПУТЬ_НА_ПРОВЕРКУ.relative_to(х.КОРЕНЬ)}; удалено старых: {удалено}.')
    return 0


if __name__ == '__main__':
    sys.exit(main())
