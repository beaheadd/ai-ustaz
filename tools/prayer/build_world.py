"""Места мира для времени намаза и киблы — статические файлы сборки app/public/prayer/ и манифест в JS.

Владелец 20.11.2026: «Не должно быть выбора страны. Мы мировое приложение. У нас должно быть все времени намаза
в мире.» Время считает телефон по координатам (prayer/times.ts + prayer/methods.ts); здесь — только список мест
для поиска и «ближайшего города» по геолокации. В JS-бандл данные НЕ кладём: телефон берёт их fetch'ем по запросу.

Что пишет (каталог app/public/prayer пересоздаётся целиком; хэш в имени — начало sha256, как у Корана):
  places-kz.<хэш>.json  — копия app/src/prayer/places-kz.json (168 мест РК, ru/kk, ДУМК);
  places-uz.<хэш>.json  — копия app/src/prayer/places-uz.json (176 мест Узбекистана, ru/uz; build_places_uz.py);
  world.<хэш>.json      — индекс мира: страны (англ. название), пояса IANA, регионы (admin1, англ.), карта шардов и плиток,
                          сетка магнитного склонения 5° (WMM2025, целые градусы);
  w/<пп>.<хэш>.json     — шард поиска: места, у которых свёртка английского названия начинается с «пп»
                          { "м": [[en, ru, ш×100, д×100, страна, пояс, регион, население]],
                            "к": [[ключ, шард, номер]] } — ключи других имён (ru, местные, частые латинские), если
                          они начинаются не с «пп» или не совпадают с en/ru; страна, пояс, регион — номера в индексе;
                          население — round(10·log10) (для порядка выдачи);
  t/<ш>_<д>.<хэш>.json  — плитка 10°×10° (ш = floor(широта/10), д = floor(долгота/10)) для поиска ближайшего:
                          [[ш×100 − 1000·ш, д×100 − 1000·д, «шард»+номер]] (координаты — от угла плитки, сотые градуса);
  app/src/prayer/world.generated.ts — имена файлов (руками не править).
Мир — GeoNames cities15000 (все страны, кроме KZ и UZ), для KG, TJ, TM, AZ — cities5000. KZ и UZ — только свои
списки (без дублей). Регионы — admin1 GeoNames (англ.; npm cities.json@1.1.66, admin1.json). Русские названия —
из альтернативных имён GeoNames (без языковой метки: берём кириллицу только из русских букв, у которой больше всего
близких по написанию вариантов) и таблица ПО_РУССКИ для крупных городов; иначе — английское имя.

Свёртка для поиска — свернуть(); точная копия — app/src/prayer/world.ts (тест сверяет обе: scripts/test-prayer.mjs).

Проверки: координаты в пределах, у каждого места есть en и пояс, нет пустых шардов, общий размер ≤ ПРЕДЕЛ_БАЙТ.
Запуск: python3 -I tools/prayer/build_world.py <каталог data geonamescache 3.0.2> <admin1.json из cities.json 1.1.66>
  (нужен node и GEOMAGNETISM — tools/prayer/declination.mjs).
"""
import hashlib
import json
import math
import os
import re
import shutil
import subprocess
import sys
import unicodedata

КОРЕНЬ = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
ПАПКА = os.path.join(КОРЕНЬ, 'app', 'public', 'prayer')
МАНИФЕСТ = os.path.join(КОРЕНЬ, 'app', 'src', 'prayer', 'world.generated.ts')
МЕСТА_KZ = os.path.join(КОРЕНЬ, 'app', 'src', 'prayer', 'places-kz.json')
МЕСТА_UZ = os.path.join(КОРЕНЬ, 'app', 'src', 'prayer', 'places-uz.json')
СКЛОНЕНИЕ = os.path.join(КОРЕНЬ, 'tools', 'prayer', 'declination.mjs')

СВОИ_СТРАНЫ = {'KZ', 'UZ'}
ПОДРОБНЕЕ = {'KG', 'TJ', 'TM', 'AZ'}  # cities5000: соседи по Центральной Азии и Кавказу
ПРЕДЕЛ_БАЙТ = 3_000_000

# Русские названия крупных городов (страна, имя GeoNames) → ru. Остальные — эвристика по альтернативным именам.
ПО_РУССКИ = {
    ('SA', 'Makkah'): 'Мекка', ('SA', 'Madinah'): 'Медина', ('SA', 'Mecca'): 'Мекка', ('SA', 'Medina'): 'Медина', ('SA', 'Jeddah'): 'Джидда', ('SA', 'Riyadh'): 'Эр-Рияд',
    ('SA', 'Ta’if'): 'Таиф', ('SA', 'Dammam'): 'Даммам',
    ('TR', 'Istanbul'): 'Стамбул', ('TR', 'Ankara'): 'Анкара', ('TR', 'Izmir'): 'Измир', ('TR', 'Bursa'): 'Бурса',
    ('TR', 'Antalya'): 'Анталья', ('TR', 'Konya'): 'Конья',
    ('EG', 'Cairo'): 'Каир', ('EG', 'Alexandria'): 'Александрия', ('AE', 'Dubai'): 'Дубай', ('AE', 'Abu Dhabi'): 'Абу-Даби',
    ('AE', 'Sharjah'): 'Шарджа', ('QA', 'Doha'): 'Доха', ('KW', 'Kuwait City'): 'Эль-Кувейт', ('BH', 'Manama'): 'Манама',
    ('OM', 'Muscat'): 'Маскат', ('IR', 'Tehran'): 'Тегеран', ('IQ', 'Baghdad'): 'Багдад', ('SY', 'Damascus'): 'Дамаск',
    ('JO', 'Amman'): 'Амман', ('LB', 'Beirut'): 'Бейрут', ('IL', 'Jerusalem'): 'Иерусалим', ('AF', 'Kabul'): 'Кабул',
    ('PK', 'Islamabad'): 'Исламабад', ('PK', 'Karachi'): 'Карачи', ('PK', 'Lahore'): 'Лахор', ('IN', 'New Delhi'): 'Нью-Дели',
    ('IN', 'Delhi'): 'Дели', ('IN', 'Mumbai'): 'Мумбаи', ('BD', 'Dhaka'): 'Дакка', ('MY', 'Kuala Lumpur'): 'Куала-Лумпур',
    ('ID', 'Jakarta'): 'Джакарта', ('SG', 'Singapore'): 'Сингапур', ('RU', 'Moscow'): 'Москва',
    ('RU', 'Saint Petersburg'): 'Санкт-Петербург', ('RU', 'Kazan'): 'Казань', ('RU', 'Ufa'): 'Уфа',
    ('RU', 'Grozny'): 'Грозный', ('RU', 'Makhachkala'): 'Махачкала', ('RU', 'Novosibirsk'): 'Новосибирск',
    ('RU', 'Yekaterinburg'): 'Екатеринбург', ('RU', 'Chelyabinsk'): 'Челябинск', ('RU', 'Omsk'): 'Омск',
    ('RU', 'Orenburg'): 'Оренбург', ('RU', 'Astrakhan'): 'Астрахань', ('RU', 'Samara'): 'Самара',
    ('KG', 'Bishkek'): 'Бишкек', ('KG', 'Osh'): 'Ош', ('KG', 'Jalal-Abad'): 'Джалал-Абад', ('KG', 'Karakol'): 'Каракол',
    ('TJ', 'Dushanbe'): 'Душанбе', ('TJ', 'Khujand'): 'Худжанд', ('TJ', 'Kulob'): 'Куляб', ('TM', 'Ashgabat'): 'Ашхабад',
    ('TM', 'Türkmenabat'): 'Туркменабад', ('TM', 'Daşoguz'): 'Дашогуз', ('AZ', 'Baku'): 'Баку', ('AZ', 'Ganja'): 'Гянджа',
    ('GE', 'Tbilisi'): 'Тбилиси', ('AM', 'Yerevan'): 'Ереван', ('UA', 'Kyiv'): 'Киев', ('UA', 'Odesa'): 'Одесса',
    ('UA', 'Kharkiv'): 'Харьков', ('BY', 'Minsk'): 'Минск', ('GB', 'London'): 'Лондон', ('FR', 'Paris'): 'Париж',
    ('DE', 'Berlin'): 'Берлин', ('US', 'New York City'): 'Нью-Йорк', ('KR', 'Seoul'): 'Сеул', ('JP', 'Tokyo'): 'Токио',
    ('CN', 'Beijing'): 'Пекин', ('CN', 'Ürümqi'): 'Урумчи', ('CN', 'Shanghai'): 'Шанхай', ('MA', 'Casablanca'): 'Касабланка',
    ('MA', 'Rabat'): 'Рабат', ('DZ', 'Algiers'): 'Алжир', ('TN', 'Tunis'): 'Тунис', ('LY', 'Tripoli'): 'Триполи',
    ('SD', 'Khartoum'): 'Хартум', ('YE', 'Sanaa'): 'Сана',
}

# ───────────────────────── свёртка для поиска (копия — app/src/prayer/world.ts) ─────────────────────────
КИРИЛЛИЦА = {
    'а': 'a', 'б': 'b', 'в': 'v', 'г': 'g', 'д': 'd', 'е': 'e', 'ж': 'zh', 'з': 'z', 'и': 'i', 'к': 'k', 'л': 'l',
    'м': 'm', 'н': 'n', 'о': 'o', 'п': 'p', 'р': 'r', 'с': 's', 'т': 't', 'у': 'u', 'ф': 'f', 'х': 'kh', 'ц': 'ts',
    'ч': 'ch', 'ш': 'sh', 'щ': 'sh', 'ъ': '', 'ы': 'y', 'ь': '', 'э': 'e', 'ю': 'yu', 'я': 'ya', 'ә': 'a', 'ғ': 'g',
    'қ': 'k', 'ң': 'n', 'ө': 'o', 'ұ': 'u', 'ү': 'u', 'һ': 'h', 'і': 'i', 'ҳ': 'h', 'ҷ': 'j', 'є': 'e', 'ґ': 'g',
    'ј': 'j', 'џ': 'dzh', 'ћ': 'ch', 'ђ': 'dj', 'љ': 'lj', 'њ': 'nj', 'ѓ': 'g', 'ќ': 'k', 'ѕ': 'dz',
}
ЛАТИНИЦА = {'ß': 'ss', 'æ': 'ae', 'œ': 'oe', 'ø': 'o', 'đ': 'd', 'ł': 'l', 'ı': 'i', 'þ': 'th', 'ð': 'd', 'ŋ': 'n'}
ФОНЕТИКА = [(r'dzh', 'j'), (r'zh', 'j'), (r'kh', 'h'), (r'x', 'h'), (r'q', 'k'), (r'ck', 'k'), (r'c(?!h)', 'k'),
            (r'w', 'v'), (r'y', 'i')]


def свернуть(строка):
    с = unicodedata.normalize('NFD', строка.lower())
    с = re.sub('[̀-ͯ]', '', с)
    с = ''.join(КИРИЛЛИЦА.get(б, ЛАТИНИЦА.get(б, б)) for б in с)
    с = re.sub(r'[^a-z0-9]+', ' ', с)
    for было, стало in ФОНЕТИКА:
        с = re.sub(было, стало, с)
    с = re.sub(r'([a-z])\1+', r'\1', с)
    return re.sub(r' +', ' ', с).strip()


def префикс(ключ):
    п = (ключ + '__')[:2]
    return п.replace(' ', '_')


# ───────────────────────── русское имя ─────────────────────────
РУССКОЕ = re.compile(r'^[А-ЯЁ][а-яё]*(?:[ -][А-ЯЁа-яё][а-яё]*)*$')
КИРИЛЛ = re.compile(r'^[Ѐ-ӿ][Ѐ-ӿ \-]*$')


def расстояние(а, б):
    if abs(len(а) - len(б)) > 1:
        return 2
    пред = list(range(len(б) + 1))
    for i, ca in enumerate(а, 1):
        тек = [i]
        for j, cb in enumerate(б, 1):
            тек.append(min(пред[j] + 1, тек[j - 1] + 1, пред[j - 1] + (ca != cb)))
        пред = тек
    return пред[-1]


def русское_имя(запись):
    к = (запись['countrycode'], запись['name'])
    if к in ПО_РУССКИ:
        return ПО_РУССКИ[к]
    кир = [а for а in запись['alternatenames'] if КИРИЛЛ.match(а)]
    кандидаты = [а for а in кир if РУССКОЕ.match(а) and len(а) <= 40]
    if not кандидаты:
        return ''
    def оценка(а):
        соседи = sum(1 for б in кир if б != а and расстояние(а.lower(), б.lower()) <= 1)
        # «ь», «э», «ё» — чаще русская форма; «уы»/«ыу» — казахская или киргизская (Барнауыл); «ьк» — украинская
        # (Хабаровськ, -ський).
        н = а.lower()
        русские = ((1 if 'ь' in н else 0) + (0.5 if re.search('[эё]', н) else 0) - (1 if re.search('уы|ыу', н) else 0)
                   - (2 if 'ьк' in н else 0))
        # В России и соседях с русской латиницей английское имя GeoNames — транслитерация русского: ближе к нему —
        # вернее (Krasnoyarsk → «Красноярск», а не обрезанное «Краснояр»).
        похоже = -левенштейн(свернуть(а), свернуть(запись['name'])) if запись['countrycode'] in РУССКАЯ_ЛАТИНИЦА else 0
        return (похоже, соседи + русские, -len(а))
    return max(кандидаты, key=оценка)


РУССКАЯ_ЛАТИНИЦА = {'RU', 'BY', 'KG', 'TJ', 'TM'}


def левенштейн(а, б):
    пред = list(range(len(б) + 1))
    for i, ca in enumerate(а, 1):
        тек = [i]
        for j, cb in enumerate(б, 1):
            тек.append(min(пред[j] + 1, тек[j - 1] + 1, пред[j - 1] + (ca != cb)))
        пред = тек
    return пред[-1]


def ключи_поиска(запись, en, ru):
    """Свёртки имён, по которым место можно найти (без en и ru — их телефон сворачивает сам)."""
    свои = {свернуть(en), свернуть(ru)} if ru else {свернуть(en)}
    итог = []
    имена = []
    if запись['population'] >= 100_000:
        лат = sorted({а for а in запись['alternatenames'] if re.match(r'^[A-Za-zÀ-ÿĀ-žʻ’\' .-]{3,25}$', а)}, key=len)
        имена += лат[:6]
        кир = sorted({а for а in запись['alternatenames'] if КИРИЛЛ.match(а) and 3 <= len(а) <= 25}, key=len)
        имена += кир[:3]
    for и in имена:
        к = свернуть(и)
        if len(к) >= 2 and к not in свои and к not in итог:
            итог.append(к)
    return итог


# ───────────────────────── сборка ─────────────────────────

def хэш(данные: bytes) -> str:
    return hashlib.sha256(данные).hexdigest()


def записать(отн, объект):
    данные = json.dumps(объект, ensure_ascii=False, separators=(',', ':')).encode('utf-8')
    х = хэш(данные)[:20]
    база, расш = os.path.splitext(отн)
    имя = f'{база}.{х}{расш}'
    путь = os.path.join(ПАПКА, имя)
    os.makedirs(os.path.dirname(путь), exist_ok=True)
    with open(путь, 'wb') as ф:
        ф.write(данные)
    return 'prayer/' + имя, len(данные)


def сетка_склонения():
    вход = json.dumps({'сетка': {'шаг': 5, 'широта': [-60, 75]}})
    р = subprocess.run(['node', СКЛОНЕНИЕ], input=вход, capture_output=True, text=True, check=True)
    return json.loads(р.stdout)


def main():
    if len(sys.argv) < 3:
        raise SystemExit(__doc__)
    данные, путь_admin1 = sys.argv[1], sys.argv[2]
    with open(os.path.join(данные, 'cities15000.json'), encoding='utf-8') as ф:
        c15 = json.load(ф)
    with open(os.path.join(данные, 'cities5000.json'), encoding='utf-8') as ф:
        c5 = json.load(ф)
    with open(os.path.join(данные, 'countries.json'), encoding='utf-8') as ф:
        страны_gn = json.load(ф)
    with open(путь_admin1, encoding='utf-8') as ф:
        admin1 = {з['code']: з['name'] for з in json.load(ф)}

    записи = [в for в in c15.values() if в['countrycode'] not in СВОИ_СТРАНЫ | ПОДРОБНЕЕ]
    записи += [в for в in c5.values() if в['countrycode'] in ПОДРОБНЕЕ]
    записи.sort(key=lambda в: (-в['population'], в['geonameid']))

    ошибки = []
    страны = sorted({в['countrycode'] for в in записи})
    пояса = sorted({в['timezone'] for в in записи if в['timezone']})
    места_по_шардам = {}
    for в in записи:
        en = в['name'].strip()
        ш, д = в['latitude'], в['longitude']
        if not en or not в['timezone'] or abs(ш) > 90 or abs(д) > 180:
            ошибки.append(f'кривая запись {в["geonameid"]}')
            continue
        к = свернуть(en)
        if not к:
            ошибки.append(f'пустая свёртка: {en}')
            continue
        ru = русское_имя(в)
        регион = admin1.get(f'{в["countrycode"]}.{в["admin1code"]}', '')
        нас = round(10 * math.log10(max(в['population'], 1)))
        места_по_шардам.setdefault(префикс(к), []).append({
            'en': en, 'ru': ru if ru != en else '', 'ш': round(ш * 100), 'д': round(д * 100),
            'страна': страны.index(в['countrycode']), 'пояс': пояса.index(в['timezone']), 'регион': регион,
            'нас': нас, 'ключи': ключи_поиска(в, en, ru), 'исх': в,
        })
    if ошибки:
        raise SystemExit('\n'.join(ошибки[:50]))

    # Номера мест в шардах и ключи-указатели.
    указатели = {}
    for п, места in места_по_шардам.items():
        for i, м in enumerate(места):
            ключи = list(м['ключи'])
            if м['ru']:
                кр = свернуть(м['ru'])
                if префикс(кр) != п:
                    ключи.append(кр)
            for к in ключи:
                указатели.setdefault(префикс(к), []).append([к, '' if префикс(к) == п else п, i])

    if os.path.isdir(ПАПКА):
        shutil.rmtree(ПАПКА)
    os.makedirs(ПАПКА)
    всего = 0
    файлы_шардов = {}
    регионы = sorted({м['регион'] for места in места_по_шардам.values() for м in места})
    номер_региона = {р: i for i, р in enumerate(регионы)}
    for п in sorted(set(места_по_шардам) | set(указатели)):
        места = места_по_шардам.get(п, [])
        объект = {
            'м': [[м['en'], м['ru'], м['ш'], м['д'], м['страна'], м['пояс'], номер_региона[м['регион']], м['нас']] for м in места],
            'к': sorted(указатели.get(п, [])),
        }
        имя, размер = записать(f'w/{п}.json', объект)
        файлы_шардов[п] = имя.removeprefix('prayer/')
        всего += размер

    плитки = {}
    for п, места in места_по_шардам.items():
        for i, м in enumerate(места):
            к = f'{math.floor(м["ш"] / 1000)}_{math.floor(м["д"] / 1000)}'
            плитки.setdefault(к, []).append([м['ш'] - 1000 * math.floor(м['ш'] / 1000), м['д'] - 1000 * math.floor(м['д'] / 1000), п + str(i)])
    файлы_плиток = {}
    for к in sorted(плитки):
        имя, размер = записать(f't/{к}.json', sorted(плитки[к]))
        файлы_плиток[к] = имя.removeprefix('prayer/')
        всего += размер

    названия_стран = {к: страны_gn.get(к, {}).get('name', к) for к in страны}
    индекс = {
        'версия': 1,
        'описание': 'Места мира для времени намаза (AI Ustaz): GeoNames cities15000 (KG, TJ, TM, AZ — cities5000), '
                    'без KZ и UZ (свои списки). Собрано tools/prayer/build_world.py — руками не править.',
        'источники': 'GeoNames (geonames.org), CC BY 4.0: города — пакет geonamescache 3.0.2, регионы admin1 — npm cities.json 1.1.66. '
                     'Склонение — WMM2025 (NOAA NCEI / NGA, общественное достояние) на 01.01.2027, целые градусы.',
        'мест': sum(len(м) for м in места_по_шардам.values()),
        'страны': [[к, названия_стран[к]] for к in страны],
        'пояса': пояса,
        'регионы': регионы,
        'шарды': файлы_шардов,
        'плитки': файлы_плиток,
        'склонение': сетка_склонения(),
    }
    имя_индекса, размер = записать('world.json', индекс)
    всего += размер

    копии = {}
    for метка, путь in (('kz', МЕСТА_KZ), ('uz', МЕСТА_UZ)):
        with open(путь, encoding='utf-8') as ф:
            объект = json.load(ф)
        имя, размер = записать(f'places-{метка}.json', объект)
        копии[метка] = имя
        всего += размер

    if всего > ПРЕДЕЛ_БАЙТ:
        raise SystemExit(f'данные мест {всего} байт больше предела {ПРЕДЕЛ_БАЙТ}')

    with open(МАНИФЕСТ, 'w', encoding='utf-8') as ф:
        ф.write('/**\n * СГЕНЕРИРОВАНО tools/prayer/build_world.py — руками не править.\n'
                ' * Где лежат списки мест для времени намаза (статические файлы сборки: app/public/prayer → dist/prayer).\n'
                ' * Данных здесь нет: только имена файлов (хэш содержимого в имени).\n */\n')
        ф.write('export const ФАЙЛЫ_МЕСТ = {\n')
        ф.write(f"  kz: '{копии['kz']}',\n  uz: '{копии['uz']}',\n  мир: '{имя_индекса}',\n")
        ф.write(f"  мест: {индекс['мест']},\n  байт: {всего},\n}} as const;\n")
    print(f'мир: {индекс["мест"]} мест, {len(файлы_шардов)} шардов, {len(файлы_плиток)} плиток; всего {всего} байт '
          f'({всего / 1024:.0f} КБ); с русским именем {sum(1 for м in места_по_шардам.values() for х in м if х["ru"])}')


if __name__ == '__main__':
    main()
