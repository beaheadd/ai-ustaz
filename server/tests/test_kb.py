"""База знаний: проверка записей и загрузчик (без БД — всегда), поиск и загрузка на временной БД (MUGALIM_TEST_PG)."""
from __future__ import annotations

import glob
import json
import pathlib

import pytest

import ask
import kb
import kb_load
from conftest import СЕЙЧАС

КОРЕНЬ = pathlib.Path(__file__).resolve().parents[2]
СПРАВКА = КОРЕНЬ / 'content' / 'kb' / 'spravka.jsonl'


def хадис(**поля):
    з = {'id': 'hadith-bukhari-1', 'вид': 'хадис', 'сборник': 'Сахих аль-Бухари', 'номер': '1', 'степень': 'сахих',
         'кто_оценил': 'аль-Бухари', 'источник': 'Сахих аль-Бухари (издание)', 'арабский': 'إنما الأعمال بالنيات',
         'тексты': {'ru': {'заголовок': 'Хадис о намерениях', 'текст': 'Дела оцениваются по намерениям.'}},
         'статус': 'черновик', 'версия': 1}
    з.update(поля)
    return {к: в for к, в in з.items() if в is not ...}


def коран(**поля):
    з = {'id': 'quran-2-255', 'вид': 'коран', 'ссылка': '2:255', 'источник': 'Перевод смыслов (издание, год)',
         'тексты': {'ru': {'заголовок': 'Аят аль-Курси', 'текст': 'Перевод смыслов.'}}, 'статус': 'черновик', 'версия': 1}
    з.update(поля)
    return {к: в for к, в in з.items() if в is not ...}


def статья(ид='zakat-nisab', версия=1, текст='Закят выплачивают с имущества сверх нисаба, прошедшего год.', **поля):
    з = {'id': ид, 'вид': 'статья', 'источник': 'Статья ДУМК (ссылка, дата)',
         'тексты': {'ru': {'заголовок': 'Закят: нисаб и доля', 'текст': текст},
                    'kk': {'заголовок': 'Зекет: нисап және үлес', 'текст': 'Зекет нисаптан асқан мүліктен беріледі.'}},
         'статус': 'черновик', 'версия': версия}
    з.update(поля)
    return з


# ───────────── проверка записей ─────────────
def test_хадис_годный_ссылка_из_сборника_и_номера():
    з = kb.разобрать_запись(хадис())
    assert з.ссылка == 'Сахих аль-Бухари, 1' and з.арабский == 'إنما الأعمال بالنيات' and len(з.sha) == 64


@pytest.mark.parametrize('поля, ошибка', [
    ({'степень': ...}, 'степень'),
    ({'кто_оценил': ...}, 'кто_оценил'),
    ({'сборник': ...}, 'сборник'),
    ({'номер': ...}, 'номер'),
    ({'номер': 'без номера'}, 'номер хадиса'),
    ({'ссылка': 'аль-Бухари'}, 'ссылка хадиса'),
    ({'арабский': 'текст без арабского'}, 'без арабского'),
])
def test_хадис_отказы(поля, ошибка):
    with pytest.raises(kb.ОшибкаЗаписи, match=ошибка):
        kb.разобрать_запись(хадис(**поля))


@pytest.mark.parametrize('ссылка', ['0:1', '115:1', '1:8', '2:287', '1:0', '2:5-3', '2:255-287', '2', 'аль-Бакара 255', None])
def test_коран_плохая_ссылка(ссылка):
    with pytest.raises(kb.ОшибкаЗаписи, match='ссылка'):
        kb.разобрать_запись(коран(ссылка=ссылка if ссылка is not None else ...))


def test_коран_годный_и_без_арабского():
    for ссылка in ('1:1', '2:286', '114:6', '2:255-257'):
        assert kb.разобрать_запись(коран(ссылка=ссылка)).ссылка == ссылка
    with pytest.raises(kb.ОшибкаЗаписи, match='арабский'):
        kb.разобрать_запись(коран(арабский='ٱللَّهُ لَآ إِلَٰهَ إِلَّا هُوَ'))
    with pytest.raises(kb.ОшибкаЗаписи, match='арабское письмо'):
        kb.разобрать_запись(коран(тексты={'ru': {'заголовок': 'Аят', 'текст': 'ٱللَّهُ لَآ إِلَٰهَ'}}))
    # перевода может не быть — только ссылка
    assert kb.разобрать_запись(коран(тексты={'ru': {'заголовок': 'Аят аль-Курси, 2:255'}})).тексты['ru']['текст'] == ''


@pytest.mark.parametrize('поля, ошибка', [
    ({'id': 'Плохой id'}, 'id'),
    ({'вид': 'фетва'}, 'вид'),
    ({'тексты': {'kk': {'заголовок': 'а', 'текст': 'б'}}}, 'ru'),
    ({'тексты': {'ru': {'заголовок': 'а', 'текст': 'б'}, 'de': {'заголовок': 'a', 'текст': 'b'}}}, 'язык'),
    ({'тексты': {'ru': {'заголовок': 'а', 'текст': ''}}}, 'текст'),
    ({'тексты': {'ru': {'заголовок': 'а', 'текст': 'б', 'лишнее': 1}}}, 'только'),
    ({'источник': ''}, 'источник'),
    ({'статус': 'утверждено'}, 'кто_проверил'),
    ({'статус': 'утверждено', 'кто_проверил': 'устаз', 'когда': '2026-13-01'}, 'когда'),
    ({'статус': 'проверено'}, 'статус'),
    ({'версия': 0}, 'версия'),
    ({'версия': '1'}, 'версия'),
    ({'степень': 'сахих'}, 'только у хадиса'),
    ({'арабский': 'بسم'}, 'арабский'),
    ({'лишнее': 1}, 'лишние поля'),
])
def test_статья_отказы(поля, ошибка):
    with pytest.raises(kb.ОшибкаЗаписи, match=ошибка):
        kb.разобрать_запись(статья(**поля))


def test_утверждено_и_хэш():
    з = kb.разобрать_запись(статья(статус='утверждено', кто_проверил='устаз Ахмет', когда='2026-11-20'))
    assert з.статус == 'утверждено' and з.кто_проверил == 'устаз Ахмет'
    # статус и версия в хэш не входят, текст — входит
    assert з.sha == kb.разобрать_запись(статья(версия=5)).sha
    assert з.sha != kb.разобрать_запись(статья(текст='Другой текст.')).sha


def test_тафсир_только_со_ссылкой_на_аят():
    з = статья(ид='tafsir-2-255', вид='тафсир', ссылка='2:255')
    assert kb.разобрать_запись(з).ссылка == '2:255'
    with pytest.raises(kb.ОшибкаЗаписи, match='ссылка'):
        kb.разобрать_запись(статья(ид='tafsir-x', вид='тафсир'))


def test_jsonl_все_ошибки_сразу():
    строки = [json.dumps(статья(), ensure_ascii=False), 'не json', json.dumps(хадис(степень=...), ensure_ascii=False),
              json.dumps(статья(), ensure_ascii=False)]
    with pytest.raises(kb.ОшибкаБазы) as е:
        kb.разобрать_jsonl('\n'.join(строки))
    assert len(е.value.ошибки) == 3 and 'строка 2' in е.value.ошибки[0] and 'повторяется' in е.value.ошибки[2]
    with pytest.raises(kb.ОшибкаБазы, match='пуст'):
        kb.разобрать_jsonl('\n\n')


def test_число_аятов_как_в_приложении():
    файлы = glob.glob(str(КОРЕНЬ / 'app' / 'public' / 'quran' / 'index.*.json'))
    if not файлы:
        pytest.skip('нет индекса Корана приложения')
    индекс = json.loads(pathlib.Path(файлы[0]).read_text(encoding='utf-8'))
    assert tuple(с['аятов'] for с in индекс['суры']) == kb.АЯТЫ_СУР


def test_стартовая_справка():
    записи = kb.разобрать_jsonl(СПРАВКА.read_text(encoding='utf-8'))
    assert 8 <= len(записи) <= 12
    for з in записи:
        assert з.вид == 'справка' and з.статус == 'черновик' and set(з.тексты) == {'ru', 'kk', 'en'}  # en — 20.11.2026
        assert з.арабский is None and з.ссылка is None
        for т in з.тексты.values():
            assert not ask.ФЕТВА.search(ask.нормализовать(т['текст'])), з.id


# ───────────── загрузчик без БД ─────────────
class ПодставнаяЗагрузка:
    def __init__(self, ошибка=None):
        self.вызовы, self.ошибка = [], ошибка

    def kb_загрузить(self, записи):
        self.вызовы.append(записи)
        if self.ошибка:
            raise kb.ОшибкаБазы([self.ошибка])
        return {'новых': len(записи), 'изменено': 0, 'статус': 0, 'без_изменений': 0}


def test_загрузчик_всё_или_ничего(tmp_path):
    вывод: list[str] = []
    плохой = tmp_path / 'bad.jsonl'
    плохой.write_text(json.dumps(статья(), ensure_ascii=False) + '\n' + json.dumps(коран(арабский='بسم'), ensure_ascii=False) + '\n',
                      encoding='utf-8')
    х = ПодставнаяЗагрузка()
    assert kb_load.загрузить(плохой, х, вывод=вывод.append) == 1 and х.вызовы == []   # в базу не ходили
    assert any('ОТКАЗ' in с for с in вывод) and any('арабский' in с for с in вывод)
    assert kb_load.загрузить(tmp_path / 'нет.jsonl', х, вывод=вывод.append) == 2
    assert kb_load.загрузить(СПРАВКА, х, только_проверить=True, вывод=вывод.append) == 0 and х.вызовы == []
    assert kb_load.загрузить(СПРАВКА, х, вывод=вывод.append) == 0 and len(х.вызовы[0]) == len(СПРАВКА.read_text().splitlines())
    assert kb_load.загрузить(СПРАВКА, ПодставнаяЗагрузка('x: поднимите версию'), вывод=вывод.append) == 1


def test_cli_check():
    assert kb_load.main(['--check', str(СПРАВКА)]) == 0


# ───────────── на временной БД ─────────────
@pytest.fixture
def база(pg_адрес):
    pytest.importorskip('psycopg')
    from db import Хранилище

    х = Хранилище(pg_адрес)
    х.применить_миграции()
    return х


def записи(*данные):
    return [kb.разобрать_запись(д) for д in данные]


def test_бд_загрузка_и_поиск_справки(база, pg_адрес):
    import psycopg

    вывод: list[str] = []
    assert kb_load.загрузить(СПРАВКА, база, вывод=вывод.append) == 0
    assert 'новых 11' in вывод[-1]
    assert kb_load.загрузить(СПРАВКА, база, вывод=вывод.append) == 0 and 'без изменений 11' in вывод[-1]
    assert база.kb_число(True) == 11 and база.kb_число(False) == 0

    def первый(вопрос, язык):
        return ask.отобрать(база.kb_найти(ask.термы(вопрос, язык), язык, True, 5))[0]['id']

    assert первый('Откуда берётся время намаза в Узбекистане?', 'ru') == 'spravka-vremya-namaza'
    assert первый('Что происходит с записью моего голоса?', 'ru') == 'spravka-proverka-golosom'
    assert первый('Как включить уведомления о намазе?', 'ru') == 'spravka-uvedomleniya'
    assert первый('Есть ли реклама? Приложение платное?', 'ru') == 'spravka-besplatno'
    assert первый('Какие есть виды чтения Корана?', 'ru') == 'spravka-vidy-chteniya'
    найдено = ask.отобрать(база.kb_найти(ask.термы('Что такое AI Ustaz?', 'ru'), 'ru', True, 5))
    assert 'spravka-chto-takoe' in [з['id'] for з in найдено[:3]]
    assert первый('Намаз уақыты қайдан алынады?', 'kk') == 'spravka-vremya-namaza'
    з = база.kb_найти(ask.термы('Намаз уақыты қайдан алынады?', 'kk'), 'kk', True, 5)[0]
    assert з['язык'] == 'kk' and з['заголовок'].startswith('Намаз уақыты') and з['черновик'] is True
    assert з['версия'].startswith('2.') and len(з['версия']) == 10   # версия 2 — добавлен en (20.11.2026)
    # en (миграция 006: тексты — в kb_texts_en, словарь 'english')
    assert первый('Where do the prayer times come from?', 'en') == 'spravka-vremya-namaza'
    assert первый('Are there ads? Is the app paid?', 'en') == 'spravka-besplatno'
    з = база.kb_найти(ask.термы('How do prayer notifications work?', 'en'), 'en', True, 5)[0]
    assert з['id'] == 'spravka-uvedomleniya' and з['язык'] == 'en' and з['заголовок'] == 'Prayer time notifications'
    with psycopg.connect(pg_адрес) as с:
        assert с.execute('SELECT count(*) FROM kb_texts_en').fetchone()[0] == 11
        assert с.execute("SELECT count(*) FROM kb_texts WHERE lang = 'en'").fetchone()[0] == 0
    assert база.kb_найти(ask.термы('Сколько закята с 1000000 тенге', 'ru'), 'ru', True, 5) == []
    assert база.kb_найти(ask.термы('Как включить уведомления', 'ru'), 'ru', False, 5) == []   # черновики скрыты
    # спецсимволы tsquery в вопросе не ломают поиск
    assert isinstance(база.kb_найти(ask.термы("закят' & | ! :* ( ) <->", 'ru'), 'ru', True, 5), list)

    итог = ask.ответить('Сколько закята с 1000000 тенге?', 'ru', хранилище=база, ии=None, черновые=True, сейчас=СЕЙЧАС)
    assert итог['вид'] == 'нет-в-базе'
    with psycopg.connect(pg_адрес) as с:
        assert с.execute('SELECT day::text, misses FROM ask_misses').fetchall() == [('2026-11-20', 1)]


def test_бд_версии_всё_или_ничего(база, pg_адрес):
    import psycopg

    assert база.kb_загрузить(записи(статья(), коран(), хадис())) == {'новых': 3, 'изменено': 0, 'статус': 0, 'без_изменений': 0}
    # изменили текст, но не версию — отказ всего пакета, даже новой записи
    with pytest.raises(kb.ОшибкаБазы, match='поднимите версию'):
        база.kb_загрузить(записи(статья(текст='Новый текст.'), статья(ид='new-one')))
    with psycopg.connect(pg_адрес) as с:
        assert с.execute("SELECT count(*) FROM kb_entries WHERE id = 'new-one'").fetchone()[0] == 0
    assert база.kb_загрузить(записи(статья(версия=2, текст='Новый текст.'))) == {'новых': 0, 'изменено': 1, 'статус': 0, 'без_изменений': 0}
    утв = статья(версия=2, текст='Новый текст.', статус='утверждено', кто_проверил='устаз', когда='2026-11-20')
    assert база.kb_загрузить(записи(утв)) == {'новых': 0, 'изменено': 0, 'статус': 1, 'без_изменений': 0}
    assert база.kb_загрузить(записи(утв)) == {'новых': 0, 'изменено': 0, 'статус': 0, 'без_изменений': 1}
    assert база.kb_число(False) == 1
    with psycopg.connect(pg_адрес) as с:
        р = с.execute("SELECT version, status, reviewed_by, reviewed_on::text FROM kb_entries WHERE id = 'zakat-nisab'").fetchone()
        assert р == (2, 'утверждено', 'устаз', '2026-11-20')
        assert с.execute("SELECT lang FROM kb_texts WHERE entry_id = 'zakat-nisab' ORDER BY lang").fetchall() == [('kk',), ('ru',)]
    with pytest.raises(kb.ОшибкаБазы, match='меньше'):
        база.kb_загрузить(записи(статья(версия=1, текст='Новый текст.')))
    # хадис и коран в выдаче
    х = база.kb_по_ссылке('коран', '2:255', 'ru', True)
    assert х and х[0]['арабский'] is None
    н = база.kb_найти(ask.термы('хадис о намерениях', 'ru'), 'ru', True, 5)
    assert н[0]['id'] == 'hadith-bukhari-1' and н[0]['арабский'] == 'إنما الأعمال بالنيات' and н[0]['степень'] == 'сахих'


def test_бд_ограничения_правил(база, pg_адрес):
    import psycopg

    with psycopg.connect(pg_адрес) as с:
        for sql in (
            "INSERT INTO kb_entries (id, kind, ref, arabic, source, status, version, sha) VALUES ('q-1', 'коран', '2:255', 'بسم', 's', 'черновик', 1, repeat('a', 64))",
            "INSERT INTO kb_entries (id, kind, ref, source, status, version, sha) VALUES ('h-1', 'хадис', 'Бухари, 1', 's', 'черновик', 1, repeat('a', 64))",
            "INSERT INTO kb_entries (id, kind, ref, source, status, version, sha) VALUES ('q-2', 'коран', 'аль-Бакара', 's', 'черновик', 1, repeat('a', 64))",
            "INSERT INTO kb_entries (id, kind, source, status, version, sha) VALUES ('s-1', 'справка', 's', 'утверждено', 1, repeat('a', 64))",
        ):
            with pytest.raises(psycopg.errors.CheckViolation):
                with с.transaction():
                    с.execute(sql)


def test_бд_журнал_лимиты_уборка(база, pg_адрес):
    import psycopg

    база.ask_записать('ответ', 'поиск', 'arabic', 3)
    база.ask_не_нашли(СЕЙЧАС + 15 * 3_600_000)   # 00:00 Алматы 21.11 = 19:00 UTC 20.11
    база.ask_не_нашли(СЕЙЧАС + 15 * 3_600_000)
    with psycopg.connect(pg_адрес) as с:
        assert с.execute('SELECT kind, mode, reason, sources FROM ask_log').fetchall() == [('ответ', 'поиск', 'arabic', 3)]
        assert с.execute('SELECT day::text, misses FROM ask_misses').fetchall() == [('2026-11-21', 2)]
        # в журнале нет столбцов для текста вопроса и IP
        столбцы = {р[0] for р in с.execute("SELECT column_name FROM information_schema.columns WHERE table_name IN ('ask_log', 'ask_misses')")}
        assert столбцы == {'id', 'at', 'kind', 'mode', 'reason', 'sources', 'day', 'misses'}
    # сутки по Алматы: 23:59 и 00:01 — разные окна
    до = СЕЙЧАС + 15 * 3_600_000 - 60_000
    assert база.учесть('askd:ip:x', 86_400, 1, до, ask.СМЕЩЕНИЕ_АЛМАТЫ_МС)
    assert not база.учесть('askd:ip:x', 86_400, 1, до + 30_000, ask.СМЕЩЕНИЕ_АЛМАТЫ_МС)
    assert база.учесть('askd:ip:x', 86_400, 1, до + 120_000, ask.СМЕЩЕНИЕ_АЛМАТЫ_МС)
    assert база.учесть('ask:ip:x', 60, 1, до)
    итог = база.убрать_старое(до + 2 * 3_600_000)
    assert итог['лимиты'] == 1   # минутное окно убрано, суточные «askd:» живут двое суток
    with psycopg.connect(pg_адрес) as с:
        assert с.execute("SELECT count(*) FROM push_limits WHERE key LIKE 'askd:%'").fetchone()[0] == 2
    assert база.убрать_старое(до + 3 * 86_400_000)['лимиты'] == 2


def test_бд_эндпоинт_целиком(база):
    from fastapi import FastAPI
    from fastapi.testclient import TestClient

    kb_load.загрузить(СПРАВКА, база, вывод=lambda *_: None)
    база.kb_загрузить(записи(статья()))
    app = FastAPI()
    ask.register(app, хранилище=база, ключ_лимита=lambda з: 'ip:t', часы=lambda: СЕЙЧАС / 1000)
    к = TestClient(app)
    assert к.get('/api/ask/health').json() == {'ок': True, 'записей': 12, 'режим': 'поиск', 'голос': False, 'фото': False}
    д = к.post('/api/ask/v1', json={'q': 'Сколько закята с 1000000 тенге?', 'lang': 'ru'}).json()
    assert д['вид'] == 'ответ' and д['источники'][0]['id'] == 'zakat-nisab' and д['черновик'] is True
    д = к.post('/api/ask/v1', json={'q': 'Мен зекетті төлеуім керек пе?', 'lang': 'kk'}).json()
    assert д['вид'] == 'к-имаму' and д['источники'][0]['заголовок'] == 'Зекет: нисап және үлес'
    д = к.post('/api/ask/v1', json={'q': 'Как работает проверка чтения голосом?', 'lang': 'uz'}).json()
    assert д['вид'] == 'ответ' and д['источники'][0]['id'] == 'spravka-proverka-golosom'   # uz-текста нет — ru
    assert д['текст'].startswith("Savolingiz bo'yicha")
    д = к.post('/api/ask/v1', json={'q': 'How does the voice reading check work?', 'lang': 'en'}).json()
    assert д['вид'] == 'ответ' and д['источники'][0]['id'] == 'spravka-proverka-golosom'
    assert д['источники'][0]['заголовок'].startswith('How the voice reading check works') and д['текст'].startswith('Here is what')
    д = к.post('/api/ask/v1', json={'q': 'Is my prayer valid?', 'lang': 'en'}).json()
    assert д['вид'] == 'к-имаму' and 'does not issue fatwas' in д['текст']
