"""Перевод смыслов Корана и тафсир для AI Ustaz — сборка производных для приложения из выгрузок QuranEnc.com.

Владелец 28.11.2026: «Нам нужно теперь добавить перевод каждого аята!» и «Нужна функция, чтобы можно было включить
перевод и видеть каждый аят сразу с переводом!»; решение владельца 28.11.2026 — только издания из официального списка
QuranEnc (en, tr, id, ur, uz), без тафсира и без ru и kk (ВЫБОР ниже).

Источник — QuranEnc.com (Комплекс короля Фахда, IslamHouse, Центр переводов Rowwad), API
quranenc.com/api/v1/translation/sura/{ключ}/{сура}. Из облачной сессии сайт закрыт сетью: выгрузку делает раннер
GitHub (batr-world: .github/workflows/aiustaz-quran-trans.yml, deploy/aiustaz-quran-trans.py → ветка данных
aiustaz-data/quran-trans): ответы API как есть, по сурам, в gzip. Условия QuranEnc — content/sources.json («quranenc»).

Правила CLAUDE.md:
  1 — текст Корана здесь не используется: поле arabic_text ответов QuranEnc в производные НЕ попадает (Коран — только
      Tanzil, app/public/quran). Перевод смыслов — отдельный слой с подписью «Перевод смыслов (переводчик, источник)»;
  5 — ни машинного, ни ИИ-перевода, ни ИИ-тафсира: только изданные тексты как есть. Единственные изменения формы —
      снять HTML-разметку (теги) и пробелы по краям строки; слова, знаки и сноски не меняются (условие QuranEnc №1).
      Сноски переводчика — отдельным полем (в приложении — свёрнуты);
  11 — пока устаз не посмотрел, у слоя плашка «черновик»: одобрение — content/quran-trans/одобрено.json
      ({"<ключ>": {"кто": …, "когда": "ГГГГ-ММ-ДД"}}), его копирует индекс издания (поле «одобрено»).

Входы (в git): content/quran-trans/raw/<ключ>.json.gz — {"key", "list", "suras": [ответ API суры 1…114 строкой]};
               sha256 — ЭТАЛОНЫ ниже И content/sources.json («quranenc» → «выгрузки»): подмена сырья вместе с одним
               из них не пройдёт.
Пишет:         app/public/quran-trans/<ключ>/NNN.<sha256[:20]>.json — {формат, ключ, сура, аяты: [[текст, сноски|null]]};
               app/public/quran-trans/<ключ>/index.<sha256[:20]>.json — подпись, версия, источник, одобрено, аятов,
                 суры [{файл, sha256}];
               app/src/quran/transManifest.generated.ts — язык → ключ, имя и sha256 индекса (переводы и тафсиры).
Запуск: python3 -I -B tools/quran_trans/build_translations.py [--check]
        python3 -I -B tools/quran_trans/build_translations.py --import ПАПКА — взять raw/<ключ>.json.gz выбранных
          изданий из выгрузки ветки aiustaz-data/quran-trans и напечатать sha256 (вписать в ЭТАЛОНЫ и sources.json).
Проверка — tools/check_content.py (проверить()): сырьё = ЭТАЛОНЫ = sources.json, 114 сур и 6236 аятов, без HTML,
производные = свежей сборке. Тест — tools/quran_trans/test_build_translations.py.
"""
import gzip
import hashlib
import json
import pathlib
import re
import shutil
import sys

КОРЕНЬ = pathlib.Path(__file__).resolve().parents[2]
ПАПКА_СЫРЬЯ = КОРЕНЬ / 'content' / 'quran-trans' / 'raw'
ПУТЬ_ОДОБРЕНО = КОРЕНЬ / 'content' / 'quran-trans' / 'одобрено.json'
ПУТЬ_ИСТОЧНИКОВ = КОРЕНЬ / 'content' / 'sources.json'
ПАПКА_ВЫХОДА = КОРЕНЬ / 'app' / 'public' / 'quran-trans'
ПУТЬ_МАНИФЕСТА = КОРЕНЬ / 'app' / 'src' / 'quran' / 'transManifest.generated.ts'
ПОДПАПКА = 'quran-trans'
ДЛИНА_ХЭША = 20
ИСТОЧНИК = 'QuranEnc.com'
АЯТОВ = [7, 286, 200, 176, 120, 165, 206, 75, 129, 109, 123, 111, 43, 52, 99, 128, 111, 110, 98, 135, 112, 78, 118, 64,
         77, 227, 93, 88, 69, 60, 34, 30, 73, 54, 45, 83, 182, 88, 75, 85, 54, 53, 89, 59, 37, 35, 38, 29, 18, 45, 60, 49,
         62, 55, 78, 96, 29, 22, 24, 13, 14, 11, 11, 18, 12, 12, 30, 52, 52, 44, 28, 28, 20, 56, 40, 31, 50, 40, 46, 42,
         29, 19, 36, 25, 22, 17, 19, 26, 30, 20, 15, 21, 11, 8, 8, 19, 5, 8, 8, 11, 11, 8, 3, 9, 5, 4, 7, 3, 6, 3, 5, 4,
         5, 6]
assert len(АЯТОВ) == 114 and sum(АЯТОВ) == 6236

# Одно издание на язык (выбор и причины — content/sources.json «quranenc», примечание; docs/HANDOFF.md).
# Решение владельца 28.11.2026: выпускать ТОЛЬКО издания из официального списка QuranEnc (/api/v1/translations/list —
# их можно скачать с сайта, у них есть номер версии): en, tr, id, ur, uz. Без тафсира «аль-Мухтасар» (ни на одном
# языке) и без russian_rwwad и kazakh_altai — их нет в официальном списке; ru, kk и ar — без перевода.
# Вид «тафсир» сборщик и приложение понимают (quran/translation.ts), но изданий тафсира сейчас нет.
# автор — переводчик или издатель для подписи «Перевод смыслов: автор · QuranEnc.com»; название — title издания у QuranEnc.
ВЫБОР = [
    {'вид': 'перевод', 'язык': 'uz', 'ключ': 'uzbek_mansour', 'автор': 'Alouddin Mansur'},
    {'вид': 'перевод', 'язык': 'en', 'ключ': 'english_saheeh', 'автор': 'Saheeh International'},
    {'вид': 'перевод', 'язык': 'tr', 'ключ': 'turkish_shahin', 'автор': 'Prof. Dr. Ali Özek ve arkadaşları'},
    {'вид': 'перевод', 'язык': 'id', 'ключ': 'indonesian_affairs', 'автор': 'Kementerian Agama Republik Indonesia'},
    {'вид': 'перевод', 'язык': 'ur', 'ключ': 'urdu_junagarhi', 'автор': 'محمد جوناگڑھی'},
]

# Внешний якорь сырья: sha256 файлов raw/<ключ>.json.gz из выгрузки 28.11.2026 (batr-world, прогон GitHub Actions
# 46127997086, ветка aiustaz-data/quran-trans @ b7f0afe). Менять — только при новой выгрузке (QuranEnc просит
# обновлять до последней версии), вместе с content/sources.json.
ЭТАЛОНЫ = {
    'uzbek_mansour': 'dfa919d9ea098434e516291c13483e2f4470e50f143dacf86f698af703d40d4b',
    'english_saheeh': '2ad71d9642c874d99c2f2800b20e509ec6127796aadf69487be73d45a642aa6a',
    'turkish_shahin': 'efadaf6eba1e26006fa3be4a9c369a505174938cd290039e95eb181bd5eb6110',
    'indonesian_affairs': 'fe8ae6d38b448b5adbd6f6c4831c83c47f76395175ab526edb6f3eb007ef4595',
    'urdu_junagarhi': 'd3e41ff7e7ad80c5d85cb38e60687093b02e934b2369d78aa314843b7905a499',
}

ТЕГ = re.compile(r'<[^>]*>')
ПЕРЕНОС = re.compile(r'<br\s*/?>', re.I)


def sha256(б):
    return hashlib.sha256(б).hexdigest()


def _json(данные):
    return (json.dumps(данные, ensure_ascii=False, separators=(',', ':')) + '\n').encode('utf-8')


def снять_html(текст):
    """Снять теги (<br> → перевод строки) и пробелы по краям. Слова и знаки не меняются. → (текст, были_ли_теги)."""
    if текст is None:
        return None, False
    были = bool(ТЕГ.search(текст))
    т = ТЕГ.sub('', ПЕРЕНОС.sub('\n', текст)) if были else текст
    return т.strip(), были


def запись_источника(путь=ПУТЬ_ИСТОЧНИКОВ):
    источники = json.loads(путь.read_text(encoding='utf-8'))['источники']
    return next((и for и in источники if и.get('id') == 'quranenc'), None)


def прочитать_сырьё(ключ, папка=ПАПКА_СЫРЬЯ, эталоны=None, источник=None):
    """Сырьё издания с проверкой sha256 (ЭТАЛОНЫ и sources.json) и формы ответов. → (обёртка, [ответы сур])."""
    эталоны = ЭТАЛОНЫ if эталоны is None else эталоны
    путь = папка / f'{ключ}.json.gz'
    if not путь.exists():
        raise ValueError(f'{ключ}: нет {путь.relative_to(КОРЕНЬ) if путь.is_relative_to(КОРЕНЬ) else путь}')
    б = путь.read_bytes()
    хэш = sha256(б)
    if эталоны.get(ключ) != хэш:
        raise ValueError(f'{ключ}: sha256 сырья {хэш[:12]}… ≠ ЭТАЛОНЫ')
    if источник is not None:
        запись = next((в for в in источник.get('выгрузки', []) if в.get('ключ') == ключ), None)
        if not запись or запись.get('sha256') != хэш:
            raise ValueError(f'{ключ}: sha256 сырья ≠ content/sources.json («quranenc» → «выгрузки»)')
    обёртка = json.loads(gzip.decompress(б))
    if обёртка.get('key') != ключ or not isinstance(обёртка.get('suras'), list) or len(обёртка['suras']) != 114:
        raise ValueError(f'{ключ}: в сырье не 114 сур')
    суры = []
    for н, тело in enumerate(обёртка['suras'], 1):
        аяты = json.loads(тело).get('result')
        if not isinstance(аяты, list) or len(аяты) != АЯТОВ[н - 1]:
            raise ValueError(f'{ключ} {н}: аятов {len(аяты) if isinstance(аяты, list) else "нет"}, нужно {АЯТОВ[н - 1]}')
        for i, а in enumerate(аяты, 1):
            if str(а.get('sura')) != str(н) or str(а.get('aya')) != str(i):
                raise ValueError(f'{ключ} {н}:{i}: номер в ответе {а.get("sura")}:{а.get("aya")}')
        суры.append(аяты)
    return обёртка, суры


def собрать_издание(выбор, обёртка, суры, одобрено):
    """→ ({'<ключ>/…json': bytes}, запись манифеста, сводка)."""
    ключ = выбор['ключ']
    файлы, записи = {}, []
    сводка = {'аятов': 0, 'сносок': 0, 'с_тегами': 0}
    for н, аяты in enumerate(суры, 1):
        строки = []
        for i, а in enumerate(аяты, 1):
            текст, т1 = снять_html(а.get('translation'))
            сноски, т2 = снять_html(а.get('footnotes'))
            if not текст:
                raise ValueError(f'{ключ} {н}:{i}: пустой текст')
            if ТЕГ.search(текст) or (сноски and ТЕГ.search(сноски)):
                raise ValueError(f'{ключ} {н}:{i}: HTML не снят')
            сводка['аятов'] += 1
            сводка['сносок'] += 1 if сноски else 0
            сводка['с_тегами'] += 1 if (т1 or т2) else 0
            строки.append([текст, сноски or None])
        б = _json({'формат': 1, 'ключ': ключ, 'сура': н, 'аяты': строки})
        имя = f'{ПОДПАПКА}/{ключ}/{н:03d}.{sha256(б)[:ДЛИНА_ХЭША]}.json'
        файлы[имя] = б
        записи.append({'файл': имя, 'sha256': sha256(б)})
    список = обёртка.get('list') or {}
    о = одобрено.get(ключ)
    индекс = {
        'формат': 1,
        'ключ': ключ,
        'вид': выбор['вид'],
        'язык': выбор['язык'],
        'название': список.get('title') or выбор.get('название') or ключ,
        'автор': выбор['автор'],
        'версия': str(список.get('version') or ''),
        'дата': _дата(список.get('last_update')),
        'источник': ИСТОЧНИК,
        'ссылка': f'quranenc.com/{_язык_сайта(выбор["язык"])}/browse/{ключ}',
        'одобрено': {'кто': о['кто'], 'когда': о['когда']} if о else None,
        'аятов': АЯТОВ,
        'суры': записи,
    }
    б = _json(индекс)
    имя = f'{ПОДПАПКА}/{ключ}/index.{sha256(б)[:ДЛИНА_ХЭША]}.json'
    файлы[имя] = б
    return файлы, {'ключ': ключ, 'индекс': имя, 'sha256Индекса': sha256(б)}, сводка


def _дата(метка):
    import datetime
    try:
        return datetime.datetime.fromtimestamp(int(метка), datetime.timezone.utc).strftime('%Y-%m-%d')
    except (TypeError, ValueError):
        return ''


def _язык_сайта(язык):
    return язык if язык in ('ru', 'uz', 'en', 'tr', 'id', 'ur', 'ar', 'kk') else 'en'


def прочитать_одобрено(путь=ПУТЬ_ОДОБРЕНО):
    if not путь.exists():
        return {}
    д = json.loads(путь.read_text(encoding='utf-8'))
    итог = {}
    for к, в in д.items():
        if к.startswith('_'):
            continue
        if not (isinstance(в, dict) and isinstance(в.get('кто'), str) and в['кто'].strip()
                and re.fullmatch(r'\d{4}-\d{2}-\d{2}', str(в.get('когда', '')))):
            raise ValueError(f'одобрено.json: у «{к}» нужны «кто» и «когда» (ГГГГ-ММ-ДД)')
        итог[к] = в
    return итог


def собрать(папка=ПАПКА_СЫРЬЯ, эталоны=None, источник='из-файла', выбор=None):
    """→ (файлы {путь от app/public: bytes}, текст манифеста ts, сводка по ключам)."""
    выбор = ВЫБОР if выбор is None else выбор
    запись = запись_источника() if источник == 'из-файла' else источник
    if источник == 'из-файла' and запись is None:
        raise ValueError('в content/sources.json нет записи «quranenc»')
    одобрено = прочитать_одобрено()
    файлы, манифест, сводка = {}, {'перевод': {}, 'тафсир': {}}, {}
    for в in выбор:
        обёртка, суры = прочитать_сырьё(в['ключ'], папка, эталоны, запись)
        ф, м, с = собрать_издание(в, обёртка, суры, одобрено)
        файлы.update(ф)
        if в['язык'] in манифест[в['вид']]:
            raise ValueError(f'два издания «{в["вид"]}» для языка {в["язык"]}')
        манифест[в['вид']][в['язык']] = м
        сводка[в['ключ']] = dict(с, вид=в['вид'], язык=в['язык'], байт=sum(len(б) for п, б in ф.items()),
                                 одобрено=bool(одобрено.get(в['ключ'])))
    return файлы, текст_манифеста(манифест), сводка


def текст_манифеста(м):
    def блок(т):
        return ''.join(f"    {я}: {{ ключ: '{з['ключ']}', индекс: '{з['индекс']}', sha256Индекса: '{з['sha256Индекса']}' }},\n"
                       for я, з in sorted(т.items()))
    return ('/**\n'
            ' * СГЕНЕРИРОВАНО tools/quran_trans/build_translations.py — руками не править\n'
            ' * (python3 -I -B tools/quran_trans/build_translations.py).\n'
            ' * Перевод смыслов и тафсир по языкам: ключ издания QuranEnc.com, имя индекса (app/public/quran-trans →\n'
            ' * dist/quran-trans) и его sha256. Текста переводов и Корана здесь нет. Переводы — только en, tr, id, ur, uz; тафсира нет.\n'
            ' */\n'
            "import type { МанифестПереводов } from './translation';\n\n"
            'export const МАНИФЕСТ_ПЕРЕВОДОВ: МанифестПереводов = {\n'
            '  формат: 1,\n'
            '  переводы: {\n' + блок(м['перевод']) + '  },\n'
            '  тафсиры: {\n' + блок(м['тафсир']) + '  },\n'
            '};\n')


def записать(файлы, манифест, папка=ПАПКА_ВЫХОДА, путь_манифеста=ПУТЬ_МАНИФЕСТА):
    нужные = {п.split('/', 1)[1] for п in файлы}
    есть = {str(п.relative_to(папка)) for п in папка.rglob('*') if п.is_file()} if папка.exists() else set()
    for лишний in sorted(есть - нужные):
        (папка / лишний).unlink()
    for п, б in файлы.items():
        ц = папка / п.split('/', 1)[1]
        ц.parent.mkdir(parents=True, exist_ok=True)
        if not ц.exists() or ц.read_bytes() != б:
            ц.write_bytes(б)
    for д in sorted((п for п in папка.rglob('*') if п.is_dir()), reverse=True):
        if not any(д.iterdir()):
            д.rmdir()
    путь_манифеста.write_text(манифест, encoding='utf-8')
    return len(есть - нужные)


def сверить(файлы, манифест, папка=ПАПКА_ВЫХОДА, путь_манифеста=ПУТЬ_МАНИФЕСТА):
    """→ список расхождений производных со свежей сборкой."""
    нужные = {п.split('/', 1)[1]: б for п, б in файлы.items()}
    есть = {str(п.relative_to(папка)) for п in папка.rglob('*') if п.is_file()} if папка.exists() else set()
    разные = [п for п, б in нужные.items() if not (папка / п).exists() or (папка / п).read_bytes() != б]
    лишние = sorted(есть - set(нужные))
    старый = путь_манифеста.read_text(encoding='utf-8') if путь_манифеста.exists() else ''
    итог = []
    if разные or лишние:
        итог.append(f'перевод смыслов: производные устарели (разных {len(разные)}, лишних {len(лишние)})')
    if старый != манифест:
        итог.append('перевод смыслов: app/src/quran/transManifest.generated.ts не совпадает со сборкой')
    return итог


def проверить():
    """Для tools/check_content.py: (ошибки, счёт)."""
    try:
        файлы, манифест, сводка = собрать()
    except ValueError as е:
        return [f'перевод смыслов: {е}'], {}
    ошибки = сверить(файлы, манифест)
    if ошибки:
        ошибки[-1] += ' — python3 -I -B tools/quran_trans/build_translations.py'
    счёт = {f'перевод смыслов {с["язык"]} ({к}, {с["вид"]}): аятов': с['аятов'] for к, с in сводка.items()}
    return ошибки, счёт


def импорт(папка):
    папка = pathlib.Path(папка)
    ПАПКА_СЫРЬЯ.mkdir(parents=True, exist_ok=True)
    манифест = json.loads((папка / 'manifest.json').read_text(encoding='utf-8'))
    for в in ВЫБОР:
        к = в['ключ']
        источник = папка / 'raw' / f'{к}.json.gz'
        if not источник.exists():
            raise SystemExit(f'в выгрузке нет raw/{к}.json.gz')
        б = источник.read_bytes()
        if манифест['переводы'].get(к, {}).get('sha256_gz') != sha256(б):
            raise SystemExit(f'{к}: sha256 ≠ manifest.json выгрузки')
        shutil.copyfile(источник, ПАПКА_СЫРЬЯ / f'{к}.json.gz')
        список = манифест['переводы'][к]['список'] or {}
        print(f"    '{к}': '{sha256(б)}',  # {список.get('version')} · {len(б)} байт")


def main():
    if '--import' in sys.argv:
        импорт(sys.argv[sys.argv.index('--import') + 1])
        return 0
    файлы, манифест, сводка = собрать()
    if '--check' in sys.argv:
        ошибки = сверить(файлы, манифест)
        for е in ошибки:
            print(е)
        if ошибки:
            print('Запустите python3 -I -B tools/quran_trans/build_translations.py')
            return 1
        print(f'Перевод смыслов: производные совпадают со свежей сборкой ({len(файлы)} файлов).')
        return 0
    удалено = записать(файлы, манифест)
    всего = sum(len(б) for б in файлы.values())
    for к, с in сводка.items():
        print(f'  {с["язык"]} {с["вид"]:7} {к}: аятов {с["аятов"]}, со сносками {с["сносок"]}, '
              f'с HTML {с["с_тегами"]}, {с["байт"] / 1024:.0f} КБ, одобрено: {"да" if с["одобрено"] else "нет (черновик)"}')
    print(f'Готово: {len(файлы)} файлов, {всего / 1024:.0f} КБ; удалено старых: {удалено}.')
    return 0


if __name__ == '__main__':
    sys.exit(main())
