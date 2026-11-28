"""База знаний чата «AI Ustaz» из того, что уже есть на сайте: content/kb/site.jsonl (формат — docs/база-знаний.md).

Владелец 27.11.2026: «чат … пусть он не лезет в интернет, он может работать только с нашей базой данных, которая прошла
проверку … только с информацией, которая у нас внутри сайта находится». Сервер ищет по этому файлу (server/kb_load.py
грузит его вместе с content/kb/spravka.jsonl); внешнего ИИ нет (MUGALIM_ASK_LLM выключен).

Откуда записи (только то, что уже показывает приложение; ничего не пишем от себя):
  таджвид   — подписи правил из app/src/quran/tajweed.ts (ru/kk/uz/en) + темы уроков из docs/программа-курса.md (ru);
  уроки     — уровень 1 (content/lessons/level1/L*.json): название, цель, подсказки к буквам;
  махраджи  — content/makharij.json (ru/kk): название и описание;
  зикры, дуа — content/dhikr/dhikr.json: название, перевод, примечание, тема; БЕЗ произношения (это транслитерация
              арабского: её не озвучиваем, правило 7) и без арабского — их приложение показывает само;
  намаз     — content/namaz/namaz.json (ханафитский, правило 6): вступления и пункты разделов;
  хадисы    — выгрузки HadeethEnc, которые показывает приложение (app/public/hadith/{ru,en,uz}/*.json): заголовок, текст
              хадиса и такхридж дословно (условия HadeethEnc: без изменений), степень и кто её дал; сборник и номер.
Жёсткие правила (CLAUDE.md): арабского письма в текстах базы нет (правило 1): одиночная буква заменяется её названием
  из content/letters.json («буква „каф“»), арабские слова убираются; Корана в базе нет совсем; хадис — с номером, степенью
  и тем, кто её дал (правило 2); статус «черновик», пока устаз не утвердил (правило 11): хадисы из
  content/hadith/одобрено.json — «утверждено» с именем устаза и датой.
Порядок записей и JSON — детерминированные; sha256 файла — в content/kb/site.sha256.

Запуск (из корня, без сторонних пакетов):
  python3 -I -B tools/kb/build_from_site.py           собрать
  python3 -I -B tools/kb/build_from_site.py --check   ничего не пишет; файл = свежей сборке, иначе код 1
Из tools/check_content.py: build_from_site.проверить() → (ошибки, число записей).
"""
from __future__ import annotations

import glob
import hashlib
import json
import pathlib
import re
import sys

КОРЕНЬ = pathlib.Path(__file__).resolve().parents[2]
ВЫХОД = КОРЕНЬ / 'content' / 'kb' / 'site.jsonl'
ХЭШ = КОРЕНЬ / 'content' / 'kb' / 'site.sha256'
ЯЗЫКИ = ('ru', 'kk', 'uz', 'en')
ВЕРСИЯ = 1  # версия новой записи; у прежней растёт сама при смене содержания (см. собрать())

АРАБСКОЕ = re.compile('[؀-ۿݐ-ݿࢠ-ࣿﭐ-﷿ﹰ-﻿]+')
ОГЛАСОВКИ = re.compile('[ً-ٰٟۖ-ۭـ]')
МАКС_ЗАГОЛОВОК, МАКС_ТЕКСТ = 200, 8000

СЛОВО_БУКВА = {'ru': 'буква', 'kk': 'әрпі', 'uz': 'harfi', 'en': 'letter'}
ПОДПИСЬ_УРОК = {'ru': 'Урок', 'kk': 'Сабақ', 'uz': 'Dars', 'en': 'Lesson'}
ПОДПИСЬ_УРОКИ = {'ru': 'Уроки курса', 'kk': 'Курс сабақтары', 'uz': 'Kurs darslari', 'en': 'Course lessons'}
ПОДПИСЬ_ДУА = {'ru': 'Дуа', 'kk': 'Дұға', 'uz': 'Duo', 'en': 'Dua'}
ПОДПИСЬ_ЗИКР = {'ru': 'Зикр', 'kk': 'Зікір', 'uz': 'Zikr', 'en': 'Dhikr'}
ПОДПИСЬ_РАЗ = {'ru': 'Сколько раз', 'kk': 'Неше рет', 'uz': 'Necha marta', 'en': 'How many times'}
ПОДПИСЬ_МАХРАДЖ = {'ru': 'Махрадж', 'kk': 'Махраж', 'uz': 'Maxraj', 'en': 'Makhraj'}
ПОДПИСЬ_НАМАЗ = {'ru': 'Учимся намазу (ханафитский мазхаб)', 'kk': 'Намаз үйренеміз (ханафи мәзһабы)',
                 'uz': 'Namozni oʻrganamiz (hanafiy mazhabi)', 'en': 'Learning the prayer (Hanafi school)'}
ПОДПИСЬ_ТАДЖВИД = {'ru': 'Правило таджвида', 'kk': 'Тәжуид ережесі', 'uz': 'Tajvid qoidasi', 'en': 'Tajweed rule'}


def _буквы() -> dict[str, dict[str, str]]:
    данные = json.loads((КОРЕНЬ / 'content' / 'letters.json').read_text(encoding='utf-8'))
    итог: dict[str, dict[str, str]] = {}
    for б in данные:
        знак = ОГЛАСОВКИ.sub('', б.get('знак') or '')
        if len(знак) == 1 and isinstance(б.get('название'), dict):
            итог[знак] = б['название']
    # формы алифа и хамзы, та марбута, алиф максура — названия тех же букв
    for знак, как in (('أ', 'ء'), ('إ', 'ء'), ('آ', 'ا'), ('ٱ', 'ا'), ('ؤ', 'ء'), ('ئ', 'ء'), ('ة', 'ت'), ('ى', 'ا')):
        if как in итог and знак not in итог:
            итог[знак] = итог[как]
    return итог


БУКВЫ: dict[str, dict[str, str]] = {}


def без_арабского(текст: str, язык: str) -> str:
    """Арабское письмо → названия букв (одиночная буква) или ничего (слово). Правило 1: Коран в базе не храним."""
    def замена(м: re.Match) -> str:
        кусок = ОГЛАСОВКИ.sub('', м.group(0))
        if len(кусок) == 1 and кусок in БУКВЫ:
            имя = БУКВЫ[кусок].get(язык) or БУКВЫ[кусок].get('ru') or ''
            return f'«{имя}»' if имя else ''
        return ''
    т = АРАБСКОЕ.sub(замена, текст or '')
    т = т.replace('⁨', '').replace('⁩', '').replace('`', '')
    т = re.sub(r'\(\s*[,;·\s]*\)', '', т)            # скобки, от которых остались одни знаки
    т = re.sub(r'«\s*»|“\s*”', '', т)
    т = re.sub(r'\s+([,.;:])', r'\1', т)
    т = re.sub(r'([,;·])\s*(?=[,;·])', '', т)
    т = re.sub(r'[ \t]{2,}', ' ', т)
    return т.strip(' ,;·—-')


def _текст(части: list[str], язык: str) -> str:
    т = '\n'.join(без_арабского(ч, язык) for ч in части if ч and ч.strip())
    т = re.sub(r'\n{2,}', '\n', т).strip()
    return т[:МАКС_ТЕКСТ]


def _заголовок(т: str, язык: str) -> str:
    з = без_арабского(т, язык)
    return з if len(з) <= МАКС_ЗАГОЛОВОК else з[:МАКС_ЗАГОЛОВОК - 1].rstrip() + '…'


def _запись(ид: str, вид: str, тексты: dict, источник: str, *, ссылка: str | None = None, **хадис) -> dict:
    тексты = {я: т for я, т in тексты.items() if т and т.get('заголовок') and (т.get('текст') or вид == 'коран')}
    з = {'id': ид, 'вид': вид, 'тексты': тексты, 'источник': источник[:300], 'статус': 'черновик', 'версия': ВЕРСИЯ}
    if ссылка:
        з['ссылка'] = ссылка
    for ключ, значение in хадис.items():
        if значение is not None:
            з[ключ] = значение
    return з


# ───────────── таджвид ─────────────
_ПРАВИЛО = re.compile(r"^\s*([a-z]):\s*\{\s*ru:\s*'((?:[^'\\]|\\.)*)',\s*kk:\s*'((?:[^'\\]|\\.)*)',\s*uz:\s*'((?:[^'\\]|\\.)*)',"
                      r"\s*en:\s*'((?:[^'\\]|\\.)*)',\s*урок:\s*'[^']*',\s*уроки:\s*\[([\d,\s]*)\]", re.M)


def _темы_уроков() -> dict[int, str]:
    """Темы уроков 17–47 из таблиц docs/программа-курса.md (вторая колонка), ru."""
    итог: dict[int, str] = {}
    for строка in (КОРЕНЬ / 'docs' / 'программа-курса.md').read_text(encoding='utf-8').splitlines():
        м = re.match(r'^\|\s*(\d{1,2})\s*\|\s*(.+?)\s*\|', строка)
        if м and 17 <= int(м.group(1)) <= 47:
            тема = м.group(2).replace('**', '')
            тема = re.sub(r'\[[^\]]*\]', '', тема)
            итог[int(м.group(1))] = тема
    return итог


def записи_таджвида() -> list[dict]:
    исходник = (КОРЕНЬ / 'app' / 'src' / 'quran' / 'tajweed.ts').read_text(encoding='utf-8')
    темы = _темы_уроков()
    итог = []
    for м in _ПРАВИЛО.finditer(исходник):
        код = м.group(1)
        подписи = dict(zip(ЯЗЫКИ, (м.group(2), м.group(3), м.group(4), м.group(5).replace("\\'", "'"))))
        уроки = [int(у) for у in re.findall(r'\d+', м.group(6))]
        тексты = {}
        for я, подпись in подписи.items():
            имя = подпись.split(':')[0].split(' — ')[0].strip()
            части = [f'{ПОДПИСЬ_ТАДЖВИД[я]}. {подпись}', f'{ПОДПИСЬ_УРОКИ[я]}: {", ".join(map(str, уроки))}.']
            if я == 'ru':
                части += [f'{ПОДПИСЬ_УРОК[я]} {у}: {темы[у]}' for у in уроки if у in темы]
            тексты[я] = {'заголовок': _заголовок(имя, я), 'текст': _текст(части, я)}
        итог.append(_запись(f'site.tajweed.{код}', 'статья', тексты,
                            'AI Ustaz: правила таджвида (цвета мусхафа) и программа курса; Хафс от ‘Асыма',
                            ссылка=f'#/lesson/{уроки[0]}' if уроки else None))
    if len(итог) != 11:
        raise SystemExit(f'tajweed.ts: ожидали 11 правил, нашли {len(итог)} — поменялся формат ПРАВИЛА_ТАДЖВИДА')
    return итог


# ───────────── уроки уровня 1 ─────────────
def записи_уроков() -> list[dict]:
    итог = []
    for путь in sorted(glob.glob(str(КОРЕНЬ / 'content' / 'lessons' / 'level1' / 'L*.json'))):
        у = json.loads(pathlib.Path(путь).read_text(encoding='utf-8'))
        тексты = {}
        for я in ЯЗЫКИ:
            название = (у.get('название') or {}).get(я)
            if not название:
                continue
            части = [(у.get('цель') or {}).get(я, '')]
            for з in у.get('задания') or []:
                if з.get('тип') == 'знакомство' and isinstance(з.get('подсказка'), dict):
                    имя = (з.get('название') or {}).get(я, '')
                    части.append(f'{СЛОВО_БУКВА[я].capitalize() if я != "kk" else "Әріп"} «{имя}»: {з["подсказка"].get(я, "")}')
            тексты[я] = {'заголовок': _заголовок(f'{ПОДПИСЬ_УРОК[я]} {у["номер"]}. {название}', я), 'текст': _текст(части, я)}
        итог.append(_запись(f'site.lesson.{у["номер"]:02d}', 'статья', тексты,
                            'AI Ustaz: уроки уровня 1 по методике «Муаллим сани»', ссылка=f'#/lesson/{у["номер"]}'))
    return итог


# ───────────── махраджи ─────────────
def записи_махраджей() -> list[dict]:
    д = json.loads((КОРЕНЬ / 'content' / 'makharij.json').read_text(encoding='utf-8'))
    итог = []
    for м in д['махраджи']:
        тексты = {}
        for я in ЯЗЫКИ:
            название = (м.get('название') or {}).get(я)
            if not название:
                continue
            тексты[я] = {'заголовок': _заголовок(f'{ПОДПИСЬ_МАХРАДЖ[я]} {м["номер"]}. {название}', я),
                         'текст': _текст([(м.get('описание') or {}).get(я, '')], я)}
        итог.append(_запись(f'site.makharij.{м["id"]}', 'статья', тексты, д.get('источник') or 'AI Ustaz: махраджи',
                            ссылка='#/makharij'))
    return итог


# ───────────── зикры и дуа ─────────────
def _подписи_тем() -> dict[str, dict[str, str]]:
    исходник = (КОРЕНЬ / 'app' / 'src' / 'screens' / 'DhikrScreen.tsx').read_text(encoding='utf-8')
    итог: dict[str, dict[str, str]] = {}
    for блок, я in zip(re.split(r'\n\s{2}(?:ru|kk|uz|en):\s*\{', исходник)[1:5], ЯЗЫКИ):
        for м in re.finditer(r"'т\.([а-я-]+)':\s*'([^']*)'", блок):
            итог.setdefault(м.group(1), {})[я] = м.group(2)
    return итог


def записи_зикров() -> list[dict]:
    д = json.loads((КОРЕНЬ / 'content' / 'dhikr' / 'dhikr.json').read_text(encoding='utf-8'))
    темы = _подписи_тем()
    итог = []
    for номер, з in enumerate(д['зикры'], 1):
        дуа = з.get('вид_списка') == 'дуа'
        тема = (темы.get(з.get('тема') or '') or {})
        тексты = {}
        for я in ЯЗЫКИ:
            название = (з.get('название') or {}).get(я)
            перевод = (з.get('перевод') or {}).get(я)
            if not название or not перевод:
                continue
            вид = ПОДПИСЬ_ДУА[я] if дуа else ПОДПИСЬ_ЗИКР[я]
            части = [перевод, (з.get('примечание') or {}).get(я, '')]
            if тема.get(я):
                части.append(f'{вид}: {тема[я]}')
            if з.get('раз'):
                части.append(f'{ПОДПИСЬ_РАЗ[я]}: {з["раз"]}')
            тексты[я] = {'заголовок': _заголовок(f'{вид}: {название}', я), 'текст': _текст(части, я)}
        ист = з.get('источник') or {}
        источник = (f'HadeethEnc.com, хадис {ист["hadeethenc"]}' if 'hadeethenc' in ист
                    else f'Коран {ист.get("коран")} (Tanzil Uthmani v1.1)' if 'коран' in ист else 'AI Ustaz')
        итог.append(_запись(f'site.dhikr.{з["id"]}', 'статья', тексты, источник + '; перевод — черновик AI Ustaz',
                            ссылка=f'#/dhikr/item?n={номер}'))
    return итог


# ───────────── намаз ─────────────
def записи_намаза() -> list[dict]:
    д = json.loads((КОРЕНЬ / 'content' / 'namaz' / 'namaz.json').read_text(encoding='utf-8'))
    итог = []
    for номер, р in enumerate(д['разделы'], 1):
        тексты = {}
        for я in ЯЗЫКИ:
            название = (р.get('название') or {}).get(я)
            if not название:
                continue
            части = [(р.get('вступление') or {}).get(я, '')]
            for г in р.get('группы') or []:
                заг = (г.get('заголовок') or {}).get(я)
                if заг:
                    части.append(заг + ':')
                for п in г.get('пункты') or []:
                    if isinstance(п, dict) and п.get(я):
                        части.append('— ' + п[я])
            тексты[я] = {'заголовок': _заголовок(f'{название}', я), 'текст': _текст(части, я)}
        итог.append(_запись(f'site.namaz.{р["id"]}', 'статья', тексты,
                            f'{ПОДПИСЬ_НАМАЗ["ru"]}; черновик AI Ustaz', ссылка=f'#/namaz/section?n={номер}'))
    return итог


# ───────────── хадисы HadeethEnc ─────────────
def записи_хадисов() -> tuple[list[dict], int]:
    по_языкам: dict[str, dict[int, dict]] = {}
    for я in ('ru', 'en', 'uz'):
        for путь in sorted(glob.glob(str(КОРЕНЬ / 'app' / 'public' / 'hadith' / я / '*.json'))):
            for х in json.loads(pathlib.Path(путь).read_text(encoding='utf-8'))['хадисы']:
                по_языкам.setdefault(я, {})[int(х['id'])] = х
    индекс = json.loads(pathlib.Path(sorted(glob.glob(str(КОРЕНЬ / 'app' / 'public' / 'hadith' / 'index.*.json')))[0])
                        .read_text(encoding='utf-8'))
    одобрено = json.loads((КОРЕНЬ / 'content' / 'hadith' / 'одобрено.json').read_text(encoding='utf-8'))['хадисы']
    итог, пропущено = [], 0
    for ид in sorted(по_языкам.get('ru', {})):
        тексты = {}
        for я in ('ru', 'en', 'uz'):
            х = по_языкам.get(я, {}).get(ид)
            if not х:
                continue
            заголовок, текст = х['title'], f'{х["hadeeth"]}\n{х["attribution"]}'
            if АРАБСКОЕ.search(заголовок) or АРАБСКОЕ.search(текст) or len(текст) > МАКС_ТЕКСТ:
                continue  # дословно и без арабского не помещается — не берём (условия HadeethEnc: без изменений)
            if len(заголовок) > МАКС_ЗАГОЛОВОК:
                заголовок = заголовок[:МАКС_ЗАГОЛОВОК - 1].rstrip() + '…'  # заголовок-подпись; текст хадиса — целиком
            тексты[я] = {'заголовок': заголовок, 'текст': текст}
        if 'ru' not in тексты:
            пропущено += 1
            continue
        ru = по_языкам['ru'][ид]
        з = _запись(f'site.hadith.{ид}', 'хадис', тексты,
                    f'{индекс.get("издатель", "HadeethEnc.com")} — перевод и такхридж без изменений; '
                    f'выгрузка ru {индекс.get("выгрузки", {}).get("ru", {}).get("версия", "?")}',
                    сборник=f'HadeethEnc.com ({индекс.get("сборник", "Сахих аль-Бухари")})', номер=str(ид),
                    степень=ru['grade'][:100], кто_оценил='HadeethEnc.com (степень из выгрузки)')
        о = одобрено.get(str(ид))
        if о:
            з.update({'статус': 'утверждено', 'кто_проверил': о['кто'], 'когда': о['когда']})
        итог.append(з)
    return итог, пропущено


def собрать() -> tuple[str, dict]:
    global БУКВЫ
    БУКВЫ = _буквы()
    хадисы, пропущено = записи_хадисов()
    записи = записи_таджвида() + записи_уроков() + записи_махраджей() + записи_зикров() + записи_намаза() + хадисы
    for з in записи:
        for я, т in з['тексты'].items():
            if АРАБСКОЕ.search(т['заголовок']) or АРАБСКОЕ.search(т['текст']):
                raise SystemExit(f'{з["id"]}.{я}: арабское письмо осталось в тексте базы (правило 1)')
    # Версия записи растёт сама, когда меняется её содержание (server/kb_load.py отказывает, если содержание сменилось
    # без новой версии): сравниваем с прежним файлом.
    прежние: dict[str, dict] = {}
    if ВЫХОД.exists():
        for строка in ВЫХОД.read_text(encoding='utf-8').splitlines():
            if строка.strip():
                п = json.loads(строка)
                прежние[п['id']] = п
    def суть(з: dict) -> str:
        return json.dumps({к: в for к, в in з.items() if к not in ('версия', 'статус', 'кто_проверил', 'когда')},
                          ensure_ascii=False, sort_keys=True)
    for з in записи:
        п = прежние.get(з['id'])
        if п:
            з['версия'] = п['версия'] if суть(п) == суть(з) else п['версия'] + 1
    текст = ''.join(json.dumps(з, ensure_ascii=False, sort_keys=True, separators=(',', ':')) + '\n' for з in записи)
    счёт = {'всего': len(записи), 'хадисов_пропущено': пропущено}
    for з in записи:
        ключ = з['id'].split('.')[1]
        счёт[ключ] = счёт.get(ключ, 0) + 1
    return текст, счёт


def проверить() -> tuple[list[str], int]:
    ошибки: list[str] = []
    текст, счёт = собрать()
    if not ВЫХОД.exists():
        return [f'{ВЫХОД.relative_to(КОРЕНЬ)}: нет файла — python3 -I -B tools/kb/build_from_site.py'], 0
    if ВЫХОД.read_text(encoding='utf-8') != текст:
        ошибки.append(f'{ВЫХОД.relative_to(КОРЕНЬ)} не совпадает со свежей сборкой — пересоберите tools/kb/build_from_site.py')
    sha = hashlib.sha256(текст.encode('utf-8')).hexdigest()
    if not ХЭШ.exists() or ХЭШ.read_text(encoding='utf-8').split()[0] != sha:
        ошибки.append(f'{ХЭШ.relative_to(КОРЕНЬ)}: sha256 не совпадает')
    return ошибки, счёт['всего']


def main(argv: list[str]) -> int:
    if '--check' in argv:
        ошибки, всего = проверить()
        for о in ошибки:
            print('ОШИБКА:', о)
        print(f'база знаний сайта: {всего} записей' + ('' if ошибки else ', совпадает со сборкой'))
        return 1 if ошибки else 0
    текст, счёт = собрать()
    ВЫХОД.write_text(текст, encoding='utf-8')
    sha = hashlib.sha256(текст.encode('utf-8')).hexdigest()
    ХЭШ.write_text(f'{sha}  site.jsonl\n', encoding='utf-8')
    print(f'{ВЫХОД.relative_to(КОРЕНЬ)}: {счёт}; {len(текст.encode()) // 1024} КБ; sha256 {sha}')
    return 0


if __name__ == '__main__':
    sys.exit(main(sys.argv[1:]))
