"""Пословные тайминги чтения (подсветка слова, которое читает кари) — сборка производных для приложения.

Владелец 27.11.2026: «когда выйдет вот этот жёлтый, который вместе двигается с чтецом, выделение именно слов, которые
читают». Источник — данные cpfair/quran-align (Collin Fair, CC BY 4.0), отобранные и проверенные на раннере GitHub
(batr-world: deploy/aiustaz-word-timings.py → ветка aiustaz-data/word-timings): приняты только записи, у которых
длительности наших файлов (cdn.islamic.network) и файлов EveryAyah, к которым относятся тайминги, совпали.

Входы (в git):  content/quran-words/raw/<издание>.json.gz — данные quran-align как есть (сжатые);
                content/quran-words/report.json — отчёт проверки (принятые издания, разницы первых аятов сур);
                content/quran/quran-uthmani-marks.xml — наша копия Корана (только чтобы СЧИТАТЬ слова; текст не пишется).
Пишет:          app/public/quran-words/<издание>/NNN.<sha256[:20]>.json — сура: тайминги слов каждого аята;
                app/public/quran-words/<издание>/index.<sha256[:20]>.json — суры издания: файл и sha256;
                app/src/quran/wordsManifest.generated.ts — издания: имя индекса и его sha256 (текста Корана нет).
Запуск: python3 -I -B tools/quran_words/build_words.py [--check]   (без сети и сторонних пакетов)
        python3 -I -B tools/quran_words/build_words.py --import ПАПКА — взять raw/*.json.gz и report.json из выгрузки
        ветки aiustaz-data/word-timings (batr-world) и записать content/quran-words/manifest.json (sha256 файлов).
Проверка — tools/check_content.py (проверить()): sha256 входов = manifest.json, производные = свежей сборке.

Слова. quran-align считает словом кусок Tanzil quran-uthmani по пробелам. У нас слово — кусок нашей копии по пробелам,
кроме знаков-токенов из одного символа (остановки, ۞, ۩ — как app/src/quran/text.ts, ЗНАКИ). Какой счёт у данных —
определяется по всем аятам (конец последнего сегмента = число слов без знаков или со знаками); при счёте со знаками
номера переводятся в наши, знаки пропускаются. Аят, где счёт не сошёлся, — без таймингов (null): «не уверен — не
подсвечиваем».

Аяты из «плохие_аяты» отчёта (полная проверка: конец последнего слова против длительности нашего файла) — null.

Формат суры: {"формат":1,"издание":"ar.husary","сура":N,"аяты":[A1,…]}, Ai — null или плоский массив целых в
сантисекундах: [начало1, длит1, пауза2, длит2, …] (пауза — от конца предыдущего слова). Слова, которые quran-align не
разделил (один сегмент на несколько слов), делят его поровну; пропущенные слова — между соседями. Первые аяты сур:
если наш файл длиннее файла EveryAyah на величину бисмиллы (report.json), тайминги сдвигаются на эту разницу; разница
неизвестна — аят без таймингов.
"""
import gzip
import hashlib
import json
import pathlib
import sys
import xml.etree.ElementTree as ET

КОРЕНЬ = pathlib.Path(__file__).resolve().parents[2]
ПАПКА_ДАННЫХ = КОРЕНЬ / 'content' / 'quran-words'
ПУТЬ_XML = КОРЕНЬ / 'content' / 'quran' / 'quran-uthmani-marks.xml'
ПАПКА_ВЫХОДА = КОРЕНЬ / 'app' / 'public' / 'quran-words'
ПУТЬ_МАНИФЕСТА = КОРЕНЬ / 'app' / 'src' / 'quran' / 'wordsManifest.generated.ts'
ДЛИНА_ХЭША = 20
# Знаки-токены копии для показа — те же, что ЗНАКИ в app/src/quran/text.ts.
ЗНАКИ = set('ۘۗۖۚۛۙۜ۞۩')
ДОПУСК_НАЧАЛА_МС = 150


def sha256(б):
    return hashlib.sha256(б).hexdigest()


def _json(данные):
    return (json.dumps(данные, ensure_ascii=False, separators=(',', ':')) + '\n').encode('utf-8')


def токены_аята(текст):
    """['слово'|'знак', …] — по пробелам, как разборАята в app/src/quran/text.ts."""
    return ['знак' if len(к) == 1 and к in ЗНАКИ else 'слово' for к in текст.split(' ')]


def прочитать_копию(путь=ПУТЬ_XML):
    """{(сура, аят): ['слово'|'знак', …]} — только виды токенов; текст дальше не идёт."""
    корень = ET.parse(путь).getroot()
    итог = {}
    for с in корень.iter('sura'):
        for а in с.iter('aya'):
            итог[(int(с.get('index')), int(а.get('index')))] = токены_аята(а.get('text'))
    return итог


def глобальные(копия):
    порядок = sorted(копия)
    return {к: i + 1 for i, к in enumerate(порядок)}


def счёт_данных(записи, копия):
    """'без-знаков' | 'со-знаками' — какой счёт слов у quran-align (по аятам, где он различим)."""
    голоса = {'без-знаков': 0, 'со-знаками': 0}
    for з in записи:
        т = копия.get((з['surah'], з['ayah']))
        if not т or not з.get('segments'):
            continue
        слов, всего = т.count('слово'), len(т)
        if слов == всего:
            continue
        конец = max(с[1] for с in з['segments'])
        if конец == слов:
            голоса['без-знаков'] += 1
        elif конец == всего:
            голоса['со-знаками'] += 1
    return ('со-знаками' if голоса['со-знаками'] > голоса['без-знаков'] else 'без-знаков'), голоса


def слова_аята(сегменты, токены, счёт):
    """Сегменты quran-align → [(начало_мс, конец_мс) | None по каждому нашему слову] или None, если счёт не сошёлся.
    Второй результат — число слов, оценённых (поровну или между соседями)."""
    слов = токены.count('слово')
    if счёт == 'со-знаками':
        # Номер токена (со знаками) → номер нашего слова; знак → None.
        перевод, н = [], 0
        for т in токены:
            if т == 'слово':
                перевод.append(н)
                н += 1
            else:
                перевод.append(None)
        предел = len(токены)
    else:
        перевод, предел = list(range(слов)), слов
    if not сегменты or max(с[1] for с in сегменты) > предел or min(с[0] for с in сегменты) < 0:
        return None, 0
    итог = [None] * слов
    оценено = 0
    for (с, по, нач, кон) in сегменты:
        наши = [перевод[i] for i in range(с, по) if перевод[i] is not None]
        if not наши or кон <= нач:
            continue
        шаг = (кон - нач) / len(наши)
        for k, w in enumerate(наши):
            итог[w] = (round(нач + k * шаг), round(нач + (k + 1) * шаг))
        if len(наши) > 1:
            оценено += len(наши)
    # Пропущенные слова — между соседями (поровну на промежуток); с краю без соседа — аят без таймингов.
    i = 0
    while i < слов:
        if итог[i] is not None:
            i += 1
            continue
        j = i
        while j < слов and итог[j] is None:
            j += 1
        if i == 0 or j == слов:
            return None, 0
        нач, кон = итог[i - 1][1], итог[j][0]
        if кон <= нач:
            return None, 0
        шаг = (кон - нач) / (j - i)
        for k in range(i, j):
            итог[k] = (round(нач + (k - i) * шаг), round(нач + (k - i + 1) * шаг))
            оценено += 1
        i = j
    # Монотонность: начала не убывают, слово не короче 0.
    пред = 0
    for (н, к) in итог:
        if н < пред or к < н:
            return None, 0
        пред = н
    return итог, оценено


def сжать(слова, сдвиг_мс=0):
    """[(начало, конец)] мс → [начало, длит, пауза, длит, …] в сантисекундах (целые ≥ 0)."""
    плоский, конец_пред = [], 0
    for i, (н, к) in enumerate(слова):
        н_цс, к_цс = round((н + сдвиг_мс) / 10), round((к + сдвиг_мс) / 10)
        начало = н_цс if i == 0 else max(н_цс, конец_пред)
        длит = max(к_цс, начало) - начало
        плоский += [начало if i == 0 else начало - конец_пред, длит]
        конец_пред = начало + длит
    return плоский


def развернуть(плоский):
    """Обратное сжать() (для проверки и тестов): → [(начало_цс, конец_цс)]."""
    итог, конец = [], 0
    for i in range(0, len(плоский), 2):
        н = плоский[i] if i == 0 else конец + плоский[i]
        к = н + плоский[i + 1]
        итог.append((н, к))
        конец = к
    return итог


def собрать(папка_данных=ПАПКА_ДАННЫХ, путь_xml=ПУТЬ_XML):
    отчёт = json.loads((папка_данных / 'report.json').read_text(encoding='utf-8'))
    копия = прочитать_копию(путь_xml)
    номер = глобальные(копия)
    файлы, издания, сводка = {}, {}, {}
    for издание, р in sorted(отчёт['издания'].items()):
        if not р.get('принят'):
            continue
        сырые = папка_данных / 'raw' / f'{издание}.json.gz'
        записи = json.loads(gzip.decompress(сырые.read_bytes()))
        счёт, голоса = счёт_данных(записи, копия)
        по_аяту = {(з['surah'], з['ayah']): з for з in записи}
        разницы = {int(к): в for к, в in (р.get('разницы_начал_сур_мс') or {}).items()}
        # Аяты, не прошедшие полную проверку на раннере (конец слова не сходится с длительностью нашего файла).
        плохие = {tuple(int(х) for х in а.split(':')) for а in (р.get('плохие_аяты') or [])}
        суры = {}
        с_таймингом = без = оценено_слов = всего_слов = 0
        for (сура, аят) in sorted(копия):
            т = копия[(сура, аят)]
            всего_слов += т.count('слово')
            з = по_аяту.get((сура, аят))
            слова, оц = слова_аята(з.get('segments') if з else None, т, счёт)
            if (сура, аят) in плохие:
                слова = None
            сдвиг = 0
            if слова and аят == 1 and сура not in (1, 9):
                р_мс = разницы.get(номер[(сура, аят)])
                if р_мс is None:
                    слова = None
                elif abs(р_мс) > ДОПУСК_НАЧАЛА_МС:
                    сдвиг = р_мс if р_мс > 0 else None
                    if сдвиг is None:
                        слова = None
            if слова:
                с_таймингом += 1
                оценено_слов += оц
                суры.setdefault(сура, []).append(сжать(слова, сдвиг))
            else:
                без += 1
                суры.setdefault(сура, []).append(None)
        индекс = {'формат': 1, 'издание': издание, 'источник': 'quran-align (Collin Fair), CC BY 4.0',
                  'запись': р['принят'], 'суры': {}}
        for сура, аяты in sorted(суры.items()):
            байты = _json({'формат': 1, 'издание': издание, 'сура': сура, 'аяты': аяты})
            имя = f'{сура:03d}.{sha256(байты)[:ДЛИНА_ХЭША]}.json'
            файлы[f'{издание}/{имя}'] = байты
            индекс['суры'][str(сура)] = {'файл': f'quran-words/{издание}/{имя}', 'sha256': sha256(байты)}
        байты = _json(индекс)
        имя = f'index.{sha256(байты)[:ДЛИНА_ХЭША]}.json'
        файлы[f'{издание}/{имя}'] = байты
        издания[издание] = {'индекс': f'quran-words/{издание}/{имя}', 'sha256Индекса': sha256(байты)}
        сводка[издание] = {'аятов_с_таймингом': с_таймингом, 'без': без, 'счёт': счёт, 'голоса': голоса,
                           'слов_оценено': оценено_слов, 'слов': всего_слов,
                           'байт': sum(len(б) for о, б in файлы.items() if о.startswith(издание + '/'))}
    строки = [
        '/**',
        ' * СГЕНЕРИРОВАНО tools/quran_words/build_words.py — руками не править (python3 -I -B tools/quran_words/build_words.py).',
        ' * Пословные тайминги чтения по изданиям: имя индекса (app/public/quran-words → dist/quran-words) и его sha256.',
        ' * Источник — quran-align (Collin Fair), CC BY 4.0; принятые записи — content/quran-words/report.json.',
        ' * Текста Корана здесь нет.',
        ' */',
        'export const МАНИФЕСТ_СЛОВ: { формат: 1; издания: Readonly<Record<string, { индекс: string; sha256Индекса: string }>> } = {',
        '  формат: 1,',
        '  издания: {',
    ]
    for издание, з in sorted(издания.items()):
        строки.append(f"    '{издание}': {{ индекс: '{з['индекс']}', sha256Индекса: '{з['sha256Индекса']}' }},")
    строки += ['  },', '};', '']
    return файлы, '\n'.join(строки), сводка


def импорт(откуда):
    import shutil
    откуда = pathlib.Path(откуда)
    (ПАПКА_ДАННЫХ / 'raw').mkdir(parents=True, exist_ok=True)
    отчёт = json.loads((откуда / 'report.json').read_text(encoding='utf-8'))
    принятые = sorted(и for и, р in отчёт['издания'].items() if р.get('принят'))
    for п in (ПАПКА_ДАННЫХ / 'raw').glob('*.json.gz'):
        if п.name[: -len('.json.gz')] not in принятые:
            п.unlink()
    for и in принятые:
        shutil.copyfile(откуда / 'raw' / f'{и}.json.gz', ПАПКА_ДАННЫХ / 'raw' / f'{и}.json.gz')
    shutil.copyfile(откуда / 'report.json', ПАПКА_ДАННЫХ / 'report.json')
    манифест = {'report.json': sha256((ПАПКА_ДАННЫХ / 'report.json').read_bytes())}
    for и in принятые:
        манифест[f'raw/{и}.json.gz'] = sha256((ПАПКА_ДАННЫХ / 'raw' / f'{и}.json.gz').read_bytes())
    (ПАПКА_ДАННЫХ / 'manifest.json').write_text(json.dumps(манифест, ensure_ascii=False, indent=1) + '\n', encoding='utf-8')
    print(f'Импортировано: {", ".join(принятые) or "ничего"}')


def проверить():
    """Для tools/check_content.py: (ошибки, счёт)."""
    ошибки, счёт = [], {}
    if not (ПАПКА_ДАННЫХ / 'manifest.json').exists():
        return ошибки, {}
    манифест = json.loads((ПАПКА_ДАННЫХ / 'manifest.json').read_text(encoding='utf-8'))
    for отн, ожидаемый in манифест.items():
        п = ПАПКА_ДАННЫХ / отн
        if not п.exists() or sha256(п.read_bytes()) != ожидаемый:
            ошибки.append(f'тайминги слов: {отн} не совпадает с content/quran-words/manifest.json')
    if ошибки:
        return ошибки, счёт
    файлы, манифест_ts, сводка = собрать()
    разные = [о for о, б in файлы.items() if not (ПАПКА_ВЫХОДА / о).exists() or (ПАПКА_ВЫХОДА / о).read_bytes() != б]
    есть = {str(п.relative_to(ПАПКА_ВЫХОДА)) for п in ПАПКА_ВЫХОДА.rglob('*.json')} if ПАПКА_ВЫХОДА.exists() else set()
    лишние = sorted(есть - set(файлы))
    старый = ПУТЬ_МАНИФЕСТА.read_text(encoding='utf-8') if ПУТЬ_МАНИФЕСТА.exists() else ''
    if разные or лишние or старый != манифест_ts:
        ошибки.append(f'тайминги слов устарели (разных {len(разные)}, лишних {len(лишние)}) — '
                      'python3 -I -B tools/quran_words/build_words.py')
    for и, с in сводка.items():
        счёт[f'тайминги слов {и} (аятов с таймингом из 6236)'] = с['аятов_с_таймингом']
    return ошибки, счёт


def main():
    if '--import' in sys.argv:
        импорт(sys.argv[sys.argv.index('--import') + 1])
    файлы, манифест, сводка = собрать()
    if '--check' in sys.argv:
        есть = {str(п.relative_to(ПАПКА_ВЫХОДА)) for п in ПАПКА_ВЫХОДА.rglob('*.json')} if ПАПКА_ВЫХОДА.exists() else set()
        разные = [о for о, б in файлы.items() if not (ПАПКА_ВЫХОДА / о).exists() or (ПАПКА_ВЫХОДА / о).read_bytes() != б]
        лишние = sorted(есть - set(файлы))
        старый = ПУТЬ_МАНИФЕСТА.read_text(encoding='utf-8') if ПУТЬ_МАНИФЕСТА.exists() else ''
        if разные or лишние or старый != манифест:
            print(f'Тайминги слов устарели: разных {len(разные)}, лишних {len(лишние)}, манифест '
                  f'{"другой" if старый != манифест else "тот же"}. Запустите python3 -I -B tools/quran_words/build_words.py')
            return 1
        print(f'Тайминги слов совпадают со свежей сборкой: {len(сводка)} изданий, {len(файлы)} файлов.')
        return 0
    есть = {п for п in ПАПКА_ВЫХОДА.rglob('*.json')} if ПАПКА_ВЫХОДА.exists() else set()
    нужные = {ПАПКА_ВЫХОДА / о for о in файлы}
    for п in sorted(есть - нужные):
        п.unlink()
    for о, б in файлы.items():
        ц = ПАПКА_ВЫХОДА / о
        ц.parent.mkdir(parents=True, exist_ok=True)
        if not ц.exists() or ц.read_bytes() != б:
            ц.write_bytes(б)
    for п in sorted(ПАПКА_ВЫХОДА.glob('*'), reverse=True):
        if п.is_dir() and not any(п.iterdir()):
            п.rmdir()
    ПУТЬ_МАНИФЕСТА.write_text(манифест, encoding='utf-8')
    for и, с in сводка.items():
        print(f'{и}: аятов с таймингом {с["аятов_с_таймингом"]}, без {с["без"]}, счёт {с["счёт"]} {с["голоса"]}, '
              f'слов оценено {с["слов_оценено"]}/{с["слов"]}, {с["байт"] / 1024:.0f} КБ')
    print(f'Готово: {len(файлы)} файлов в {ПАПКА_ВЫХОДА.relative_to(КОРЕНЬ)}, манифест {ПУТЬ_МАНИФЕСТА.relative_to(КОРЕНЬ)}.')
    return 0


if __name__ == '__main__':
    sys.exit(main())
