"""Проверка content/media.json — видео и аудио учителей-партнёров (решение владельца 19.11.2026).

Запуск:  python3 -I -B tools/media/check_media.py [--content ПАПКА]   (её же вызывает tools/check_content.py)
Код возврата: 0 — всё чисто; 1 — есть ошибки.

Контракт для других инструментов: проверить(папка_контента) -> (ошибки: [str], счёт: {что: число}).

Что проверяется:
  (а) каждый youtube_id есть в tools/media/youtube-playlists.json — в плейлисте того же источника,
      название совпадает; ссылка — ровно https://www.youtube.com/watch?v=<id> (текст, не встраивание);
  (б) у каждого урока («вид: урок») уровней 1–2 есть хотя бы одно «основное» видео;
  (в) нет видео, помеченного показываемым («показывать: true»), у источника с «разрешено: false»;
      «показывать» = «разрешено» источника (иначе — пересобрать tools/media/build_media.py);
      «разрешено: true» — только с датой разрешения (ГГГГ-ММ-ДД) и непустыми условиями;
  (г) уроки media.json = все пункты course.json (номер и id), без лишних и повторов;
  (д) файлы на своём сервере — только относительные пути media/…: файл_видео (.mp4/.webm),
      аудио.файл (.m4a/.mp3/.ogg/.opus/.webm); у клипа есть текст и известный источник;
      без схем http(s), без «..», без встраивания (embed, youtube-nocookie, iframe);
  (е) у источника есть имя и атрибуция ru + kk; ссылка канала — без схемы.
"""
import json
import pathlib
import re
import sys

КОРЕНЬ = pathlib.Path(__file__).resolve().parent.parent.parent
ПЛЕЙЛИСТЫ = КОРЕНЬ / 'tools' / 'media' / 'youtube-playlists.json'
ССЫЛКА = 'https://www.youtube.com/watch?v='
РОЛИ = {'основное', 'дополнительно'}
ID_ВИДЕО = re.compile(r'^[A-Za-z0-9_-]{11}$')
ФАЙЛ_ВИДЕО = re.compile(r'^media/[A-Za-z0-9_./-]+\.(mp4|webm)$')
ФАЙЛ_АУДИО = re.compile(r'^media/[A-Za-z0-9_./-]+\.(m4a|mp3|ogg|opus|webm)$')
ДАТА = re.compile(r'^\d{4}-\d{2}-\d{2}$')
ЗАПРЕТНОЕ = re.compile(r'youtube\.com/embed|youtube-nocookie|<iframe|ytimg\.com|googlevideo', re.I)


def путь_файла(з, шаблон):
    return isinstance(з, str) and bool(шаблон.match(з)) and '..' not in з and '//' not in з


def локализованный(з):
    return isinstance(з, dict) and all(isinstance(з.get(я), str) and з[я].strip() for я in ('ru', 'kk'))


def проверить(контент):
    ошибки, счёт = [], {}

    def ош(где, что):
        ошибки.append(f'media.json: {где}: {что}')

    def считать(ключ, n=1):
        счёт[ключ] = счёт.get(ключ, 0) + n

    файл = контент / 'media.json'
    if not файл.exists():
        return [f'media.json: нет файла {файл} (собрать: python3 -I -B tools/media/build_media.py)'], счёт
    сырой = файл.read_text(encoding='utf-8')
    данные = json.loads(сырой)
    плейлисты = json.loads(ПЛЕЙЛИСТЫ.read_text(encoding='utf-8'))
    курс = json.loads((контент / 'course.json').read_text(encoding='utf-8'))
    if ЗАПРЕТНОЕ.search(сырой):
        ош('-', 'встраивание YouTube (embed/nocookie/iframe/ytimg) запрещено — только ссылка youtube.com/watch')
    for м in re.finditer(r'https?://[^\s"]+', сырой):
        if not м.group(0).startswith(ССЫЛКА):
            ош('-', f'внешний URL «{м.group(0)}» — в данных можно только ссылки {ССЫЛКА}…')

    # (е) источники
    источники = данные.get('источники') or {}
    if set(источники) != set(плейлисты):
        ош('источники', f'источники {sorted(источники)} ≠ плейлисты {sorted(плейлисты)}')
    for ид, и in источники.items():
        где = f'источники.{ид}'
        if not локализованный(и.get('имя')) or not локализованный(и.get('атрибуция')):
            ош(где, 'нужны имя и атрибуция на ru и kk')
        if not isinstance(и.get('ссылка_канала'), str) or '://' in и['ссылка_канала']:
            ош(где, 'ссылка_канала — текст без схемы (youtube.com/channel/…)')
        if и.get('разрешено') not in (True, False):
            ош(где, 'разрешено — true или false')
        if и.get('разрешено') is True:
            if not (isinstance(и.get('дата_разрешения'), str) and ДАТА.match(и['дата_разрешения'])):
                ош(где, 'разрешено без даты разрешения (ГГГГ-ММ-ДД)')
            if not (isinstance(и.get('условия'), str) and и['условия'].strip()):
                ош(где, 'разрешено без условий договора')
        считать('источников видео и аудио')

    # (г) уроки = пункты курса
    пункты = {п['номер']: п for у in курс['уровни'] for п in у['пункты']}
    уроки = данные.get('уроки') or []
    номера = [у.get('номер') for у in уроки]
    for н in sorted({н for н in номера if номера.count(н) > 1}):
        ош(f'уроки[{н}]', 'номер повторяется')
    for н in sorted(set(пункты) - set(номера)):
        ош(f'уроки[{н}]', f'нет записи для пункта курса {пункты[н]["id"]}')
    for н in sorted(set(номера) - set(пункты)):
        ош(f'уроки[{н}]', 'такого пункта нет в course.json')

    по_id = {ид: {в['id']: в for в in п['видео']} for ид, п in плейлисты.items()}
    for у in уроки:
        н = у.get('номер')
        где = f'уроки[{н}]'
        п = пункты.get(н)
        if п and у.get('id') != п['id']:
            ош(где, f'id {у.get("id")} ≠ {п["id"]} в course.json')
        основных = 0
        for и, в in enumerate(у.get('видео') or []):
            гв = f'{где}.видео[{и}]'
            ист = в.get('источник')
            yid = в.get('youtube_id')
            if ист not in источники:
                ош(гв, f'неизвестный источник {ист}')
                continue
            if not (isinstance(yid, str) and ID_ВИДЕО.match(yid)):
                ош(гв, f'плохой youtube_id {yid!r}')
            elif yid not in по_id.get(ист, {}):
                ош(гв, f'youtube_id {yid} нет в плейлисте {ист}')
            elif по_id[ист][yid]['название'] != в.get('название'):
                ош(гв, 'название не совпадает с плейлистом')
            if в.get('ссылка') != ССЫЛКА + str(yid):
                ош(гв, f'ссылка должна быть {ССЫЛКА}{yid}')
            if в.get('роль') not in РОЛИ:
                ош(гв, f'роль {в.get("роль")!r} — только {sorted(РОЛИ)}')
            if в.get('файл_видео') is not None and not путь_файла(в['файл_видео'], ФАЙЛ_ВИДЕО):
                ош(гв, f'файл_видео — только относительный путь media/….mp4|webm, а не {в["файл_видео"]!r}')
            # (в) показ только с разрешением автора
            if в.get('показывать') is True and источники[ист].get('разрешено') is not True:
                ош(гв, f'видео помечено показываемым, а у источника {ист} разрешено: false')
            if в.get('показывать') is not (источники[ист].get('разрешено') is True):
                ош(гв, '«показывать» не совпадает с «разрешено» источника — пересоберите tools/media/build_media.py')
            if в.get('роль') == 'основное':
                основных += 1
            считать('видео в уроках')
        # (б) основное видео у уроков уровней 1–2
        if п and п['вид'] == 'урок' and п['уровень'] in (1, 2) and основных == 0:
            ош(где, f'у урока {п["id"]} (уровень {п["уровень"]}) нет основного видео')
        for и, а in enumerate(у.get('аудио') or []):
            га = f'{где}.аудио[{и}]'
            if not (isinstance(а.get('текст'), str) and а['текст'].strip()):
                ош(га, 'у клипа нет текста (буква или слог)')
            if not путь_файла(а.get('файл'), ФАЙЛ_АУДИО):
                ош(га, f'файл — только относительный путь media/….m4a|mp3|ogg|opus|webm, а не {а.get("файл")!r}')
            if а.get('источник') not in источники:
                ош(га, f'неизвестный источник {а.get("источник")}')
            считать('аудиоклипов')
        считать('уроков с записью в media.json')
        if у.get('видео'):
            считать('уроков с видео')
    return ошибки, счёт


def main():
    контент = КОРЕНЬ / 'content'
    if '--content' in sys.argv:
        контент = pathlib.Path(sys.argv[sys.argv.index('--content') + 1]).resolve()
    ошибки, счёт = проверить(контент)
    print('Проверка медиа AI Ustaz (content/media.json)')
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
