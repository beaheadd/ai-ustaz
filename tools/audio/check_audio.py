"""Проверка content/audio-sources.json — источники чтения Корана для плеера (решение владельца 19.11.2026).

Запуск:  python3 -I -B tools/audio/check_audio.py [--content ПАПКА]   (её же вызывает tools/check_content.py)
Код возврата: 0 — всё чисто; 1 — есть ошибки.

Контракт для других инструментов: проверить(папка_контента) -> (ошибки: [str], счёт: {что: число}).

Правило 3 CLAUDE.md: Коран звучит только в живых записях кари по договору, без синтеза. Права на записи
аль-Афаси выясняет владелец — до разрешения плеер не играет. Что проверяется (те же образцы — app/src/audio/sources.ts):
  (а) у источника id ([a-z0-9-]), имя кари и атрибуция на ru и kk, «разрешено» — строго true или false;
  (б) «разрешено: true» — только с датой разрешения (ГГГГ-ММ-ДД), непустыми условиями и базой — путём на СВОЁМ домене
      (/aiustaz-audio/…: с «/», без схемы, «..», «//», не внутри /aiustaz/ — это сборка, аудио в ней нет);
      «разрешено: false» — база пустая (файлов нет, плеер ничего не запрашивает);
  (в) шаблон имени файла с {sura3} и {aya3} (.mp3/.m4a/.ogg/.opus), бисмилла — null или имя файла;
  (г) в данных нет внешних адресов (://);
  (д) в репозитории приложения нет аудиофайлов Корана: ни одного аудиофайла в app/public, app/src и content
      (файлы чтения лежат только на сервере своего домена, вне сборки и git).
"""
import json
import pathlib
import re
import sys

КОРЕНЬ = pathlib.Path(__file__).resolve().parent.parent.parent
ИД = re.compile(r'^[a-z0-9-]+$')
БАЗА = re.compile(r'^(?:/[A-Za-z0-9_-]+)+$')
ШАБЛОН = re.compile(r'^(?=.*\{sura3\})(?=.*\{aya3\})[A-Za-z0-9_{}-]+\.(mp3|m4a|ogg|opus)$')
ФАЙЛ_БИСМИЛЛЫ = re.compile(r'^[A-Za-z0-9_-]+\.(mp3|m4a|ogg|opus)$')
ДАТА = re.compile(r'^\d{4}-\d{2}-\d{2}$')
АУДИО = re.compile(r'\.(mp3|m4a|ogg|oga|opus|wav|flac|aac|weba|webm)$', re.I)
ГДЕ_НЕТ_АУДИО = ('app/public', 'app/src', 'content')


def локализованный(з):
    return isinstance(з, dict) and all(isinstance(з.get(я), str) and з[я].strip() for я in ('ru', 'kk'))


def проверить(контент, корень=КОРЕНЬ):
    ошибки, счёт = [], {}

    def ош(где, что):
        ошибки.append(f'audio-sources.json: {где}: {что}')

    файл = pathlib.Path(контент) / 'audio-sources.json'
    if not файл.exists():
        return [f'audio-sources.json: нет файла {файл}'], счёт
    сырой = файл.read_text(encoding='utf-8')
    try:
        данные = json.loads(сырой)
    except json.JSONDecodeError as е:
        return [f'audio-sources.json: JSON не читается: {е}'], счёт
    if '://' in сырой:
        ош('-', 'внешний адрес (://) — база только путь на своём домене, условия — текст без схемы')
    источники = данные.get('источники') if isinstance(данные, dict) else None
    if not isinstance(источники, list) or not источники:
        ош('источники', 'нужен непустой список')
        источники = []
    видел = set()
    for н, и in enumerate(источники):
        где = f'источники[{н}]'
        if not isinstance(и, dict):
            ош(где, 'не объект')
            continue
        ид = и.get('id')
        где = f'источники.{ид}'
        if not (isinstance(ид, str) and ИД.match(ид)):
            ош(где, 'id — латиница в нижнем регистре, цифры, «-»')
        elif ид in видел:
            ош(где, 'id повторяется')
        видел.add(ид)
        if not локализованный(и.get('кари')):
            ош(где, 'нужно имя кари на ru и kk')
        if not локализованный(и.get('атрибуция')):
            ош(где, 'нужна атрибуция на ru и kk')
        if not (isinstance(и.get('шаблон'), str) and ШАБЛОН.match(и['шаблон'])):
            ош(где, f'шаблон — имя файла с {{sura3}} и {{aya3}} (.mp3/.m4a/.ogg/.opus), а не {и.get("шаблон")!r}')
        бисмилла = и.get('бисмилла')
        if бисмилла is not None and not (isinstance(бисмилла, str) and ФАЙЛ_БИСМИЛЛЫ.match(бисмилла)):
            ош(где, f'бисмилла — null или имя файла, а не {бисмилла!r}')
        разрешено = и.get('разрешено')
        база = и.get('база')
        if разрешено not in (True, False):
            ош(где, 'разрешено — true или false')
        if разрешено is True:
            if not (isinstance(и.get('дата_разрешения'), str) and ДАТА.match(и['дата_разрешения'])):
                ош(где, 'разрешено без даты разрешения (ГГГГ-ММ-ДД)')
            if not (isinstance(и.get('условия'), str) and и['условия'].strip()):
                ош(где, 'разрешено без условий договора')
            if not (isinstance(база, str) and БАЗА.match(база)):
                ош(где, f'база — путь на своём домене вида /aiustaz-audio/…, а не {база!r}')
            elif база == '/aiustaz' or база.startswith('/aiustaz/'):
                ош(где, 'база внутри /aiustaz/ — это сборка приложения; аудио — вне её (/aiustaz-audio/…)')
            счёт['источников с разрешением'] = счёт.get('источников с разрешением', 0) + 1
        else:
            if база not in ('', None):
                ош(где, 'без разрешения база пустая — файлов нет и плеер ничего не запрашивает')
            счёт['источников без разрешения (не играют)'] = счёт.get('источников без разрешения (не играют)', 0) + 1

    # (д) аудиофайлов Корана в репозитории нет
    for п in ГДЕ_НЕТ_АУДИО:
        папка = pathlib.Path(корень) / п
        if not папка.exists():
            continue
        for ф in папка.rglob('*'):
            if ф.is_file() and АУДИО.search(ф.name) and 'node_modules' not in ф.parts:
                ошибки.append(f'аудиофайл в репозитории: {ф.relative_to(корень)} — чтение кари только на сервере своего домена')
        счёт['папок без аудиофайлов'] = счёт.get('папок без аудиофайлов', 0) + 1
    return ошибки, счёт


def main():
    контент = КОРЕНЬ / 'content'
    if '--content' in sys.argv:
        контент = pathlib.Path(sys.argv[sys.argv.index('--content') + 1]).resolve()
    ошибки, счёт = проверить(контент)
    print('Проверка источников чтения (content/audio-sources.json)')
    for к, в in счёт.items():
        print(f'  {к}: {в}')
    if ошибки:
        print(f'ОШИБКИ ({len(ошибки)}):')
        for е in ошибки:
            print('  - ' + е)
        return 1
    print('Итог: ошибок нет.')
    return 0


if __name__ == '__main__':
    sys.exit(main())
