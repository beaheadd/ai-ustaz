"""Технические производные Корана для сервера чата: server/quran_ref.json — имена сур и «скелет» аятов для поиска.

Владелец 27.11.2026 (чат AI Ustaz): «как читается такой-то аят» — сервер понимает «2:255», «сура Ихлас», «аят аль-Курси»
и фото страницы мусхафа (OCR → совпадение с нашей копией Tanzil). Сам текст Корана сервер НЕ отдаёт и не хранит в базе
знаний: в ответе только ссылка «сура:аят», аят показывает приложение из своей проверенной копии (CLAUDE.md, правило 1).

Что в файле (CLAUDE.md: «Технические производные — отдельно»):
  суры: [{n, аятов, имена: [нормализованные транслитерации ru/uz/en и синонимы]}] — из app/public/quran/index.*.json;
  скелет: {"<сура>:<аят>": "<буквы без огласовок и знаков, через пробел>"} — из app/public/quran/NNN.*.json (копия «показ»
    Tanzil Uthmani v1.1, sha256 источника сверяет tools/check_content.py); только для сопоставления распознанного текста.
Запуск: python3 -I -B tools/kb/build_server_quran.py [--check]
"""
from __future__ import annotations

import glob
import json
import pathlib
import re
import sys

КОРЕНЬ = pathlib.Path(__file__).resolve().parents[2]
ВЫХОД = КОРЕНЬ / 'server' / 'quran_ref.json'

ЗНАКИ = re.compile('[\u0610-\u061a\u064b-\u065f\u06d6-\u06ed\u0640]')
ЗАМЕНЫ = str.maketrans({'ٱ': 'ا', 'أ': 'ا', 'إ': 'ا', 'آ': 'ا', 'ى': 'ي', 'ی': 'ي', 'ة': 'ه', 'ؤ': 'و', 'ئ': 'ي',
                        'ک': 'ك', 'ء': '', '\u0670': 'ا'})


def скелет(текст: str) -> str:
    """Буквы без огласовок, малых букв и знаков; формы алифа и хамзы — к основе. Та же функция — в server/quran_ref.py."""
    т = ЗНАКИ.sub('', текст).translate(ЗАМЕНЫ)
    т = re.sub(r'[^\u0621-\u064a\s]', ' ', т)
    return re.sub(r'\s+', ' ', т).strip()


def имя(т: str) -> str:
    т = т.lower().replace('ё', 'е')
    т = re.sub(r"['’‘ʻʼ`‘]", '', т)
    т = re.sub(r'^(аль|ал|ас|аш|ан|ат|ад|ар|аз|ад|al|an|as|ash|at|ad|ar|az)[\s-]+', '', т)
    return re.sub(r'[\s-]+', ' ', т).strip()


def собрать() -> str:
    индекс = json.loads(pathlib.Path(sorted(glob.glob(str(КОРЕНЬ / 'app' / 'public' / 'quran' / 'index.*.json')))[0])
                        .read_text(encoding='utf-8'))
    суры = []
    for с in индекс['суры']:
        имена = {имя(в) for в in list((с.get('транслит') or {}).values()) + list(с.get('синонимы') or []) if в}
        суры.append({'n': с['сура'], 'аятов': с['аятов'], 'имена': sorted(и for и in имена if len(и) >= 3)})
    скелеты = {}
    for путь in sorted(glob.glob(str(КОРЕНЬ / 'app' / 'public' / 'quran' / '[0-9][0-9][0-9].*.json'))):
        д = json.loads(pathlib.Path(путь).read_text(encoding='utf-8'))
        for а in д['аяты']:
            скелеты[f'{д["сура"]}:{а["аят"]}'] = скелет(а['текст'])
    if len(скелеты) != 6236:
        raise SystemExit(f'ожидали 6236 аятов, нашли {len(скелеты)}')
    данные = {'формат': 1, 'источник': индекс['источник'], 'sha256Источника': индекс['sha256Источника'],
              'примечание': 'Техническая производная для сопоставления; не текст Корана для показа (правило 1).',
              'суры': суры, 'скелет': скелеты}
    return json.dumps(данные, ensure_ascii=False, separators=(',', ':')) + '\n'


def main(argv: list[str]) -> int:
    текст = собрать()
    if '--check' in argv:
        ок = ВЫХОД.exists() and ВЫХОД.read_text(encoding='utf-8') == текст
        print('server/quran_ref.json ' + ('совпадает со сборкой' if ок else 'НЕ совпадает — пересоберите'))
        return 0 if ок else 1
    ВЫХОД.write_text(текст, encoding='utf-8')
    print(f'{ВЫХОД.relative_to(КОРЕНЬ)}: {len(текст.encode()) // 1024} КБ')
    return 0


if __name__ == '__main__':
    sys.exit(main(sys.argv[1:]))
