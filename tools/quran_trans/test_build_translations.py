"""Тест сборки перевода смыслов и тафсира (tools/quran_trans/build_translations.py). Без сети.

Проверяет: снятие HTML (только теги и края, слова не меняются), отказ на чужом sha256 (ЭТАЛОНЫ и sources.json), неверное
число сур и аятов, номера в ответе, поле arabic_text (текст Корана QuranEnc) в производные не попадает, детерминизм,
одобрение устазом → индекс; на настоящем сырье (если есть content/quran-trans/raw) — 114 сур, 6236 аятов каждого
издания, без HTML, производные = файлам в app/public/quran-trans; только en, tr, id, ur, uz (решение владельца 28.11.2026).
Запуск: python3 -I -B tools/quran_trans/test_build_translations.py   (или pytest tools/quran_trans/)
"""
import gzip
import json
import pathlib
import sys
import tempfile

sys.path.insert(0, str(pathlib.Path(__file__).resolve().parent))
import build_translations as б  # noqa: E402


def обёртка(ключ, текст=lambda с, а: f'Перевод {с}:{а}', сноски=lambda с, а: None, аятов=None, сур=114):
    суры = []
    for с in range(1, сур + 1):
        n = (аятов or б.АЯТОВ)[с - 1]
        суры.append(json.dumps({'result': [{'id': str(а), 'sura': str(с), 'aya': str(а), 'arabic_text': 'بِسۡمِ ٱللَّهِ',
                                            'translation': текст(с, а), 'footnotes': сноски(с, а)} for а in range(1, n + 1)]},
                               ensure_ascii=False))
    return gzip.compress(json.dumps({'key': ключ, 'list': {'title': 'Test Translation', 'version': '1.2.3', 'last_update': 1750000000},
                                     'suras': суры}, ensure_ascii=False).encode(), mtime=0)


def подготовить(папка, ключ, б_):
    (папка / f'{ключ}.json.gz').write_bytes(б_)
    return {ключ: б.sha256(б_)}


def test_снять_html():
    assert б.снять_html('Аллах[1] — Милостивый') == ('Аллах[1] — Милостивый', False)
    assert б.снять_html('  <b>Аллах</b><br>Милостивый  ') == ('Аллах\nМилостивый', True)
    assert б.снять_html(None) == (None, False)
    assert б.снять_html('\xa0 Allah, O’ndan başka ilâh yoktur ') == ('Allah, O’ndan başka ilâh yoktur', False)


def test_сборка_и_отказы():
    with tempfile.TemporaryDirectory() as т:
        п = pathlib.Path(т)
        выбор = [{'вид': 'перевод', 'язык': 'ru', 'ключ': 'test_ru', 'автор': 'Тест'}]
        э = подготовить(п, 'test_ru', обёртка('test_ru', сноски=lambda с, а: '[1] сноска' if а == 1 else ''))
        файлы, манифест, сводка = б.собрать(п, э, None, выбор)
        assert сводка['test_ru']['аятов'] == 6236 and сводка['test_ru']['сносок'] == 114
        assert len(файлы) == 115 and "ru: { ключ: 'test_ru'" in манифест
        индекс = json.loads(next(в for к, в in файлы.items() if '/index.' in к))
        assert индекс['версия'] == '1.2.3' and индекс['дата'] == '2025-06-15' and индекс['одобрено'] is None
        assert индекс['ссылка'] == 'quranenc.com/ru/browse/test_ru' and sum(индекс['аятов']) == 6236
        сура1 = json.loads(файлы[индекс['суры'][0]['файл']])
        assert сура1['аяты'][0] == ['Перевод 1:1', '[1] сноска'] and сура1['аяты'][1] == ['Перевод 1:2', None]
        assert all('بِسۡمِ' not in в.decode() for в in файлы.values()), 'arabic_text QuranEnc не должен попасть в производные'
        for имя, в in файлы.items():
            assert f'.{б.sha256(в)[:20]}.json' in имя
        assert б.собрать(п, э, None, выбор)[0] == файлы, 'сборка детерминирована'
        # чужой sha256
        for плохо in ({'test_ru': '0' * 64}, {}):
            try:
                б.собрать(п, плохо, None, выбор)
                raise AssertionError('сырьё с чужим sha256 принято')
            except ValueError as е:
                assert 'ЭТАЛОНЫ' in str(е)
        try:
            б.собрать(п, э, {'выгрузки': [{'ключ': 'test_ru', 'sha256': '1' * 64}]}, выбор)
            raise AssertionError('sha256 ≠ sources.json принят')
        except ValueError as е:
            assert 'sources.json' in str(е)
        # неверное число аятов и сур, номер в ответе
        неверные = list(б.АЯТОВ)
        неверные[1] = 285
        for сырьё, что in ((обёртка('test_ru', аятов=неверные), 'аятов'), (обёртка('test_ru', сур=113), '114'),
                           (обёртка('test_ru', текст=lambda с, а: '  '), 'пустой')):
            э2 = подготовить(п, 'test_ru', сырьё)
            try:
                б.собрать(п, э2, None, выбор)
                raise AssertionError('принято: ' + что)
            except ValueError as е:
                assert что in str(е), (что, str(е))


def test_одобрение():
    with tempfile.TemporaryDirectory() as т:
        п = pathlib.Path(т)
        путь = п / 'одобрено.json'
        путь.write_text(json.dumps({'_о': 'пояснение', 'test_ru': {'кто': 'устаз Ахмад', 'когда': '2026-12-01'}}, ensure_ascii=False))
        assert б.прочитать_одобрено(путь) == {'test_ru': {'кто': 'устаз Ахмад', 'когда': '2026-12-01'}}
        путь.write_text(json.dumps({'test_ru': {'кто': '', 'когда': '2026-12-01'}}))
        try:
            б.прочитать_одобрено(путь)
            raise AssertionError('одобрение без «кто» принято')
        except ValueError:
            pass
        выбор = {'вид': 'перевод', 'язык': 'ru', 'ключ': 'test_ru', 'автор': 'Тест'}
        э = подготовить(п, 'test_ru', обёртка('test_ru'))
        обёрт, суры = б.прочитать_сырьё('test_ru', п, э)
        ф, _, _ = б.собрать_издание(выбор, обёрт, суры, {'test_ru': {'кто': 'устаз Ахмад', 'когда': '2026-12-01'}})
        индекс = json.loads(next(в for к, в in ф.items() if '/index.' in к))
        assert индекс['одобрено'] == {'кто': 'устаз Ахмад', 'когда': '2026-12-01'}


def test_настоящее_сырьё():
    if not б.ПАПКА_СЫРЬЯ.exists():
        print('  (сырья нет — пропуск)')
        return
    файлы, манифест, сводка = б.собрать()
    # Решение владельца 28.11.2026: только издания из официального списка QuranEnc, без тафсира, без ru и kk.
    assert set(с['язык'] for с in сводка.values() if с['вид'] == 'перевод') == {'uz', 'en', 'tr', 'id', 'ur'}
    assert not any(с['вид'] == 'тафсир' for с in сводка.values()), 'тафсира нет'
    assert not any(к in сводка for к in ('russian_rwwad', 'kazakh_altai')), 'ru и kk — нет'
    assert sorted(п.name for п in б.ПАПКА_СЫРЬЯ.glob('*.json.gz')) == sorted(f'{к}.json.gz' for к in сводка), 'сырьё — только выбранных изданий'
    for к, с in сводка.items():
        assert с['аятов'] == 6236, к
    for имя, в in файлы.items():
        assert not б.ТЕГ.search(в.decode()), имя
    assert б.сверить(файлы, манифест) == [], 'app/public/quran-trans устарел — пересоберите'


if __name__ == '__main__':
    n = 0
    for имя, ф in list(globals().items()):
        if имя.startswith('test_') and callable(ф):
            ф()
            n += 1
            print('  ✓ ' + имя)
    print(f'Сборка перевода смыслов: {n} тестов, ошибок нет.')
