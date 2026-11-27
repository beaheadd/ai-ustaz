"""Сборка раздела «Зикры»: content/dhikr/dhikr.json → app/public/dhikr/dhikr.<хэш>.json + app/src/dhikr/manifest.generated.ts.

Решение владельца 26.11.2026: «Добавь все эти зикры с переводом и с счётчиком, чтобы можно было нажать и считать»;
«Арабский, произношение на нашем языке и перевод — так же, как здесь».

Правила (CLAUDE.md 1, 2, 11):
  - арабский текст НЕ набирается руками. В content/dhikr/dhikr.json указан источник:
      {"hadeethenc": id, "фрагменты": [текст без огласовок, …]} — сборка находит каждый фрагмент в арабском тексте
        хадиса из выгрузки HadeethEnc (content/hadith/raw/ar.sqlite.zip, sha256 = якорю tools/hadith/hadith_common.py)
        и вырезает исходную строку посимвольно — с огласовками и знаками препинания источника, без изменений;
      {"коран": "с:а" | "с:а-б", "слова": [от, до]?} — аяты или слова аята из Tanzil Uthmani v1.1 со знаками
        (content/quran/quran-uthmani-marks.xml, sha256 = ЭТАЛОН_SHA256_ПОКАЗА), без изменений;
  - степень и такхридж — дословно из той же записи HadeethEnc (grade, attribution); подписи на 4 языках — словарь ниже
    (перевод названий сборников и терминов, не оценка): незнакомый термин — ошибка сборки;
  - произношение и перевод — наш черновик (проверяет устаз; казахский — редактор-носитель), на экране — плашка
    «черновик».

Запуск (из корня, без сторонних пакетов):
  python3 -I -B tools/dhikr/build_dhikr.py           собрать (нужно сырьё HadeethEnc: build_hadith.py --download)
  python3 -I -B tools/dhikr/build_dhikr.py --check   ничего не пишет; файлы = свежей сборке, иначе код 1
Контракт выхода (app/public/dhikr/dhikr.<20 hex>.json):
  {"формат": 1, "версия", "зикры": [{"id", "номер", "раз", "вид": "хадис"|"коран", "ar": [абзацы],
    "название"|"произношение"|"перевод"|"примечание"?: {kk,ru,uz,en}, "дуа"?: true (раздел «Дуа», 27.11.2026),
    "источник": {"коран"?: "с:а", "hadeethenc"?: id, "степень_ar"?, "степень"?: {…}, "передали_ar"?, "передали"?: {…}}}]}
"""
import hashlib
import json
import pathlib
import re
import sqlite3
import sys
import tempfile
import xml.etree.ElementTree as ET
import zipfile

КОРЕНЬ = pathlib.Path(__file__).resolve().parents[2]
sys.path.insert(0, str(КОРЕНЬ / 'tools' / 'hadith'))
sys.path.insert(0, str(КОРЕНЬ / 'tools' / 'quran'))
import hadith_common as х  # noqa: E402
import quran_common as к  # noqa: E402

ВХОД = КОРЕНЬ / 'content' / 'dhikr' / 'dhikr.json'
ПАПКА_ВЫХОДА = КОРЕНЬ / 'app' / 'public' / 'dhikr'
ПУТЬ_МАНИФЕСТА = КОРЕНЬ / 'app' / 'src' / 'dhikr' / 'manifest.generated.ts'
ПУТЬ_TANZIL = КОРЕНЬ / 'content' / 'quran' / 'quran-uthmani-marks.xml'
ЯЗЫКИ = ('kk', 'ru', 'uz', 'en')
ДЛИНА_ХЭША = 20
ИМЯ_ФАЙЛА = re.compile(r'^dhikr\.([0-9a-f]{20})\.json$')

ОГЛАСОВКИ = re.compile('[ؐ-ًؚ-ٰٟۖ-ۭـ‌‍‏‎]')
ПРЕПИНАНИЕ = set('،؛؟.,:;!?«»"\'()[]{}-–—…/ ')
ЗАМЕНЫ = {'أ': 'ا', 'إ': 'ا', 'آ': 'ا', 'ٱ': 'ا', 'ى': 'ي', 'ة': 'ه', 'ؤ': 'ء', 'ئ': 'ء'}

СТЕПЕНИ = {
    'صحيح': {'kk': 'сахих — сенімді', 'ru': 'сахих — достоверный', 'uz': 'sahih — ishonchli', 'en': 'sahih — authentic'},
    'حسن': {'kk': 'хасан — жақсы', 'ru': 'хасан — хороший', 'uz': 'hasan — yaxshi', 'en': 'hasan — good'},
}
# Порядок важен: «النسائي في الكبرى» раньше «النسائي».
СБОРНИКИ = [
    ('متفق عليه', {'kk': 'Бұхари мен Мүслим', 'ru': 'аль-Бухари и Муслим', 'uz': 'Buxoriy va Muslim', 'en': 'al-Bukhari and Muslim'}),
    ('البخاري', {'kk': 'Бұхари', 'ru': 'аль-Бухари', 'uz': 'Buxoriy', 'en': 'al-Bukhari'}),
    ('مسلم', {'kk': 'Мүслим', 'ru': 'Муслим', 'uz': 'Muslim', 'en': 'Muslim'}),
    ('أبو داود', {'kk': 'Әбу Дәуіт', 'ru': 'Абу Дауд', 'uz': 'Abu Dovud', 'en': 'Abu Dawud'}),
    ('الترمذي', {'kk': 'Тирмизи', 'ru': 'ат-Тирмизи', 'uz': 'Termiziy', 'en': 'at-Tirmidhi'}),
    ('النسائي في الكبرى', {'kk': 'Нәсаи («әс-Сунан әл-кубра»)', 'ru': 'ан-Насаи («ас-Сунан аль-кубра»)',
                          'uz': 'Nasoiy («as-Sunan al-kubro»)', 'en': 'an-Nasa’i (al-Sunan al-Kubra)'}),
    ('النسائي', {'kk': 'Нәсаи', 'ru': 'ан-Насаи', 'uz': 'Nasoiy', 'en': 'an-Nasa’i'}),
    ('ابن ماجه', {'kk': 'Ибн Мәжә', 'ru': 'Ибн Маджа', 'uz': 'Ibn Moja', 'en': 'Ibn Majah'}),
    ('أحمد', {'kk': 'Ахмад', 'ru': 'Ахмад', 'uz': 'Ahmad', 'en': 'Ahmad'}),
]


class ОшибкаСборки(Exception):
    pass


def sha256(байты):
    return hashlib.sha256(байты).hexdigest()


def нормализовать(текст):
    """Строка без огласовок и препинания + индекс каждого её знака в исходной строке."""
    знаки, индексы = [], []
    пробел = True
    for i, ч in enumerate(текст):
        if ОГЛАСОВКИ.match(ч):
            continue
        if ч in ПРЕПИНАНИЕ or ч.isspace():
            if not пробел:
                знаки.append(' ')
                индексы.append(i)
                пробел = True
            continue
        знаки.append(ЗАМЕНЫ.get(ч, ч))
        индексы.append(i)
        пробел = False
    return ''.join(знаки), индексы


def вырезать(исходный, фрагмент, начиная=0):
    """Вырезать из исходного текста фрагмент, заданный текстом без огласовок. Возвращает (строка, конец)."""
    н, индексы = нормализовать(исходный)
    искомое, _ = нормализовать(фрагмент)
    искомое = искомое.strip()
    позиция = н.find(искомое, начиная)
    if позиция < 0:
        raise ОшибкаСборки(f'фрагмент не найден: «{фрагмент}»')
    конец_н = позиция + len(искомое)
    # Разрешён только отделённый союз «و» перед фрагментом («وَالْحَمْدُ لِلهِ» → «الْحَمْدُ لِلهِ»): сам зикр не меняется.
    союз = позиция > 0 and н[позиция - 1] == 'و' and (позиция == 1 or н[позиция - 2] == ' ')
    if позиция > 0 and н[позиция - 1] != ' ' and not союз:
        raise ОшибкаСборки(f'фрагмент начинается внутри слова: «{фрагмент}»')
    if конец_н < len(н) and н[конец_н] != ' ':
        raise ОшибкаСборки(f'фрагмент кончается внутри слова: «{фрагмент}»')
    с = индексы[позиция]
    по = индексы[конец_н - 1] + 1
    while по < len(исходный) and ОГЛАСОВКИ.match(исходный[по]):
        по += 1
    строка = исходный[с:по]
    assert строка in исходный
    return строка, конец_н


def арабская_выгрузка():
    путь = х.ПАПКА_СЫРЫХ / 'ar.sqlite.zip'
    if not путь.exists():
        raise ОшибкаСборки(f'нет {путь.relative_to(КОРЕНЬ)}: python3 -I -B tools/hadith/build_hadith.py --download')
    байты = путь.read_bytes()
    if sha256(байты) != х.ЭТАЛОНЫ['ar.sqlite.zip']:
        raise ОшибкаСборки('ar.sqlite.zip: sha256 ≠ якорю ЭТАЛОНЫ (tools/hadith/hadith_common.py)')
    with zipfile.ZipFile(путь) as з, tempfile.TemporaryDirectory() as папка:
        файл = pathlib.Path(папка) / 'ar.sqlite'
        файл.write_bytes(з.read('ar.sqlite'))
        соед = sqlite3.connect(str(файл))
        строки = {r[0]: {'hadeeth': r[1], 'grade': r[2], 'attribution': r[3]} for r in соед.execute(
            'select id, hadeeth, grade, attribution from hadeeths where current = 1')}
        соед.close()
    return строки


def tanzil():
    байты = ПУТЬ_TANZIL.read_bytes()
    if sha256(байты) != к.ЭТАЛОН_SHA256_ПОКАЗА:
        raise ОшибкаСборки('quran-uthmani-marks.xml: sha256 ≠ ЭТАЛОН_SHA256_ПОКАЗА (tools/quran/quran_common.py)')
    корень = ET.fromstring(байты)
    return {(int(с.get('index')), int(а.get('index'))): а.get('text') for с in корень.iter('sura') for а in с.iter('aya')}


def передали(атрибуция):
    текст = атрибуция.strip()
    if текст != 'متفق عليه':
        if not текст.startswith('رواه '):
            raise ОшибкаСборки(f'незнакомый такхридж: «{атрибуция}»')
        текст = текст[len('رواه '):]
    имена = {я: [] for я in ЯЗЫКИ}
    while текст:
        for ар, подписи in СБОРНИКИ:
            if текст.startswith(ар):
                for я in ЯЗЫКИ:
                    имена[я].append(подписи[я])
                текст = текст[len(ар):].strip()
                if текст.startswith('و'):
                    текст = текст[1:].strip()
                break
        else:
            raise ОшибкаСборки(f'незнакомый сборник в такхридже: «{атрибуция}» (остаток «{текст}»)')
    return {я: ', '.join(имена[я]) for я in ЯЗЫКИ}


def тексты(запись, поле, обязательно=True):
    значение = запись.get(поле)
    if значение is None and not обязательно:
        return None
    if not isinstance(значение, dict) or set(значение) != set(ЯЗЫКИ) or not all(
            isinstance(значение[я], str) and значение[я].strip() for я in ЯЗЫКИ):
        raise ОшибкаСборки(f'{запись.get("id")}: поле «{поле}» — нужны непустые kk, ru, uz, en')
    if any(re.search('[؀-ۿ]', значение[я]) for я in ЯЗЫКИ):
        raise ОшибкаСборки(f'{запись.get("id")}: арабские буквы в поле «{поле}» — арабский только из источника')
    return {я: значение[я].strip() for я in ЯЗЫКИ}


def собрать():
    вход = json.loads(ВХОД.read_text(encoding='utf-8'))
    хадисы = арабская_выгрузка()
    аяты = tanzil()
    зикры, виденные = [], set()
    for номер, запись in enumerate(вход['зикры'], 1):
        id_ = запись['id']
        if not re.fullmatch(r'[a-z0-9-]+', id_) or id_ in виденные:
            raise ОшибкаСборки(f'id «{id_}»: латиница, цифры и дефис, без повторов')
        виденные.add(id_)
        раз = запись['раз']
        if not isinstance(раз, int) or not 1 <= раз <= 1000:
            raise ОшибкаСборки(f'{id_}: «раз» — целое 1…1000')
        ист = запись['источник']
        выход_ист = {}
        if 'hadeethenc' in ист:
            hid = ист['hadeethenc']
            хадис = хадисы.get(hid)
            if not хадис:
                raise ОшибкаСборки(f'{id_}: хадиса HadeethEnc №{hid} нет в выгрузке')
            ar, начало = [], 0
            for фрагмент in ист['фрагменты']:
                try:
                    строка, начало = вырезать(хадис['hadeeth'], фрагмент, начало)
                except ОшибкаСборки as е:
                    raise ОшибкаСборки(f'{id_} (HadeethEnc №{hid}): {е}') from None
                ar.append(строка)
            степень = хадис['grade'].strip()
            if степень not in СТЕПЕНИ:
                raise ОшибкаСборки(f'{id_}: незнакомая степень «{степень}» — добавить подпись в СТЕПЕНИ')
            вид = 'хадис'
            выход_ист = {'hadeethenc': hid, 'степень_ar': степень, 'степень': СТЕПЕНИ[степень],
                         'передали_ar': хадис['attribution'].strip(), 'передали': передали(хадис['attribution'])}
        elif 'коран' in ист:
            м = re.fullmatch(r'(\d{1,3}):(\d{1,3})(?:-(\d{1,3}))?', ист['коран'])
            if not м:
                raise ОшибкаСборки(f'{id_}: ссылка «{ист["коран"]}» — «с:а» или «с:а-б»')
            сура, от, до = int(м[1]), int(м[2]), int(м[3] or м[2])
            ar = []
            for аят in range(от, до + 1):
                текст = аяты.get((сура, аят))
                if текст is None:
                    raise ОшибкаСборки(f'{id_}: нет аята {сура}:{аят}')
                ar.append(текст)
            if 'слова' in ист:
                if до != от:
                    raise ОшибкаСборки(f'{id_}: «слова» — только для одного аята')
                а, б = ист['слова']
                слова = ar[0].split(' ')
                if not 1 <= а <= б <= len(слова):
                    raise ОшибкаСборки(f'{id_}: слова {а}–{б} вне аята ({len(слова)} слов)')
                ar = [' '.join(слова[а - 1:б])]
            вид = 'коран'
            выход_ист = {'коран': ист['коран']}
        else:
            raise ОшибкаСборки(f'{id_}: источник — «hadeethenc» или «коран»')
        зикр = {'id': id_, 'номер': номер, 'раз': раз, 'вид': вид, 'ar': ar,
                'название': тексты(запись, 'название'), 'произношение': тексты(запись, 'произношение'),
                'перевод': тексты(запись, 'перевод')}
        вид_списка = запись.get('вид_списка')
        if вид_списка not in (None, 'дуа'):
            raise ОшибкаСборки(f'{id_}: вид_списка — только «дуа»')
        прим = тексты(запись, 'примечание', обязательно=False)
        if прим:
            зикр['примечание'] = прим
        if вид_списка == 'дуа':
            зикр['дуа'] = True  # раздел «Дуа» (владелец 27.11.2026): мольбы из того же набора
        зикр['источник'] = выход_ист
        зикры.append(зикр)
    данные = {'формат': 1, 'версия': вход['версия'], 'зикры': зикры}
    байты = (json.dumps(данные, ensure_ascii=False, separators=(',', ':')) + '\n').encode('utf-8')
    хэш = sha256(байты)
    имя = f'dhikr.{хэш[:ДЛИНА_ХЭША]}.json'
    манифест = ('// Создано tools/dhikr/build_dhikr.py — не править руками.\n'
                '// Зикры (владелец 26.11.2026): арабский — дословно из HadeethEnc и Tanzil, текст — fetch dhikr/.\n'
                f"export const МАНИФЕСТ_ЗИКРОВ = {{ файл: 'dhikr/{имя}', sha256: '{хэш}', количество: {len(зикры)} }} as const;\n")
    return {имя: байты}, манифест.encode('utf-8'), зикры


def проверить():
    """Для tools/check_content.py: (ошибки, счёт, предупреждения). Целостность — всегда: манифест → файл (sha256, хэш
    в имени), лишних файлов нет, у каждого зикра 4 языка и источник, коранический текст = Tanzil (он в git). Если
    сырьё HadeethEnc скачано — файлы = свежей сборке побайтно (дословность хадисных фрагментов); иначе предупреждение."""
    ошибки, предупреждения = [], []
    if not ПУТЬ_МАНИФЕСТА.exists():
        return ['dhikr: нет app/src/dhikr/manifest.generated.ts'], {}, []
    м = re.search(r"файл: 'dhikr/([^']+)', sha256: '([0-9a-f]{64})', количество: (\d+)", ПУТЬ_МАНИФЕСТА.read_text('utf-8'))
    if not м:
        return ['dhikr: манифест не разобран'], {}, []
    имя, хэш, количество = м[1], м[2], int(м[3])
    путь = ПАПКА_ВЫХОДА / имя
    есть = sorted(п.name for п in ПАПКА_ВЫХОДА.glob('*'))
    if есть != [имя]:
        ошибки.append(f'dhikr: в app/public/dhikr {есть}, нужен ровно {имя}')
    if not путь.exists():
        return ошибки + [f'dhikr: нет {имя}'], {}, []
    байты = путь.read_bytes()
    if sha256(байты) != хэш or not ИМЯ_ФАЙЛА.match(имя) or ИМЯ_ФАЙЛА.match(имя)[1] != хэш[:ДЛИНА_ХЭША]:
        ошибки.append(f'dhikr: sha256 {имя} ≠ манифесту')
    данные = json.loads(байты)
    зикры = данные.get('зикры', [])
    if len(зикры) != количество:
        ошибки.append(f'dhikr: зикров {len(зикры)} ≠ манифесту {количество}')
    аяты = tanzil()
    for н, з in enumerate(зикры, 1):
        if з.get('номер') != н:
            ошибки.append(f'dhikr: номер {з.get("номер")} ≠ {н}')
        for поле in ('название', 'произношение', 'перевод'):
            if set(з.get(поле, {})) != set(ЯЗЫКИ):
                ошибки.append(f'dhikr {з.get("id")}: «{поле}» — не 4 языка')
        if з.get('вид') == 'коран':
            м2 = re.fullmatch(r'(\d+):(\d+)(?:-(\d+))?', з['источник']['коран'])
            целые = [аяты[(int(м2[1]), а)] for а in range(int(м2[2]), int(м2[3] or м2[2]) + 1)]
            if not all(any(абзац in т for т in целые) for абзац in з['ar']):
                ошибки.append(f'dhikr {з["id"]}: текст ≠ Tanzil {з["источник"]["коран"]}')
        elif з.get('вид') == 'хадис':
            if not з['источник'].get('hadeethenc'):
                ошибки.append(f'dhikr {з["id"]}: нет номера HadeethEnc')
        else:
            ошибки.append(f'dhikr {з.get("id")}: вид «{з.get("вид")}»')
    if (х.ПАПКА_СЫРЫХ / 'ar.sqlite.zip').exists():
        try:
            файлы, манифест, _ = собрать()
            if файлы != {имя: байты} or манифест != ПУТЬ_МАНИФЕСТА.read_bytes():
                ошибки.append('dhikr: файлы ≠ свежей сборке (python3 -I -B tools/dhikr/build_dhikr.py)')
        except ОшибкаСборки as е:
            ошибки.append(f'dhikr: {е}')
    else:
        предупреждения.append('зикры: сырьё HadeethEnc не скачано — дословность хадисных фрагментов не сверена '
                              '(python3 -I -B tools/hadith/build_hadith.py --download; tools/dhikr/build_dhikr.py --check)')
    return ошибки, {'зикры': len(зикры)}, предупреждения


def main():
    проверка = '--check' in sys.argv[1:]
    try:
        файлы, манифест, зикры = собрать()
    except ОшибкаСборки as е:
        print(f'Ошибка сборки зикров: {е}')
        return 1
    if проверка:
        ошибки = []
        есть = {п.name for п in ПАПКА_ВЫХОДА.glob('*')} if ПАПКА_ВЫХОДА.exists() else set()
        if есть != set(файлы):
            ошибки.append(f'app/public/dhikr: {sorted(есть)} ≠ свежей сборке {sorted(файлы)}')
        for имя, байты in файлы.items():
            путь = ПАПКА_ВЫХОДА / имя
            if путь.exists() and путь.read_bytes() != байты:
                ошибки.append(f'{имя} ≠ свежей сборке')
        if not ПУТЬ_МАНИФЕСТА.exists() or ПУТЬ_МАНИФЕСТА.read_bytes() != манифест:
            ошибки.append('app/src/dhikr/manifest.generated.ts ≠ свежей сборке')
        for о in ошибки:
            print('Ошибка:', о)
        print(f'Зикры: {len(зикры)}, проверка {"не пройдена" if ошибки else "пройдена"}.')
        return 1 if ошибки else 0
    ПАПКА_ВЫХОДА.mkdir(parents=True, exist_ok=True)
    for п in ПАПКА_ВЫХОДА.glob('*'):
        if п.name not in файлы:
            п.unlink()
    for имя, байты in файлы.items():
        (ПАПКА_ВЫХОДА / имя).write_bytes(байты)
    ПУТЬ_МАНИФЕСТА.parent.mkdir(parents=True, exist_ok=True)
    ПУТЬ_МАНИФЕСТА.write_bytes(манифест)
    print(f'Зикры: {len(зикры)} → app/public/dhikr/{next(iter(файлы))}')
    return 0


if __name__ == '__main__':
    sys.exit(main())
