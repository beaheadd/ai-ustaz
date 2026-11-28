"""Логика уведомлений без сети и БД: проверка запроса, тексты, когда отправлять (server/push.py)."""
from __future__ import annotations

import re

import pytest

import push
from conftest import АДРЕС_FCM, AUTH, P256DH, СЕЙЧАС, момент, пункт, тело


def ошибка(данные, код):
    with pytest.raises(push.ОшибкаЗапроса) as е:
        push.разобрать_подписку(данные, СЕЙЧАС)
    assert е.value.код == код, е.value.код


# ───────────── запрос ─────────────

def test_хороший_запрос():
    з = push.разобрать_подписку(тело(), СЕЙЧАС)
    assert з.адрес == АДРЕС_FCM and з.p256dh == P256DH and з.auth == AUTH
    assert з.язык == 'ru' and з.город == 'Алматы'
    assert з.пункты == (push.Пункт(момент('2026-11-20', '14:39'), 'asr', '14:39', 0, 'maghrib', '16:28'),)
    assert з.конец == момент('2026-11-20', '14:39')
    assert len(з.хэш) == 32 and з.хэш == push.хэш_адреса(АДРЕС_FCM)


@pytest.mark.parametrize('адрес', [
    'https://fcm.googleapis.com/fcm/send/x',
    'https://updates.push.services.mozilla.com/wpush/v2/gAAAA',
    'https://web.push.apple.com/QGuQ',
    'https://wns2-par02p.notify.windows.com/w/?token=AwYAAAB',
    'https://db5p.notify.windows.com/w/?token=1',
])
def test_известные_сервисы(адрес):
    assert push.разобрать_подписку(тело(адрес=адрес), СЕЙЧАС).адрес == адрес


@pytest.mark.parametrize('адрес', [
    'http://fcm.googleapis.com/fcm/send/x',  # не https
    'https://fcm.googleapis.com.evil.kz/fcm/send/x',
    'https://evil.kz/fcm.googleapis.com/x',
    'https://user:pw@fcm.googleapis.com/fcm/send/x',
    'https://fcm.googleapis.com:8443/fcm/send/x',
    'https://127.0.0.1/x',
    'https://localhost/x',
    'https://notify.windows.com.evil.kz/x',
    'https://a.b.notify.windows.com/x',
    'https://fcm.googleapis.com/x y',
    'https://fcm.googleapis.com/fcm/send/x#frag',
    'https://fcm.googleapis.com/' + 'x' * 1100,
    'javascript:alert(1)',
    42,
    None,
])
def test_чужие_адреса(адрес):
    ошибка(тело(адрес=адрес), 'endpoint')


def test_ключи():
    д = тело()
    д['subscription']['keys']['p256dh'] = P256DH[:-4]
    ошибка(д, 'p256dh')
    д = тело()
    д['subscription']['keys']['p256dh'] = 'A' + P256DH[1:]  # не несжатая точка (первый байт не 0x04)
    ошибка(д, 'p256dh')
    д = тело()
    д['subscription']['keys']['auth'] = AUTH + 'AAAA'
    ошибка(д, 'auth')
    д = тело()
    д['subscription']['keys']['auth'] = 'не base64!'
    ошибка(д, 'auth')


def test_лишние_поля_не_принимаем():
    д = тело()
    д['lat'] = 43.25
    ошибка(д, 'fields')
    д = тело()
    д['subscription']['coords'] = [43.2, 76.9]
    ошибка(д, 'subscription')
    д = тело()
    д['items'][0]['lat'] = 43.25
    ошибка(д, 'item')


def test_язык_и_город():
    ошибка(тело(язык='de'), 'lang')
    ошибка(тело(город=''), 'city')
    ошибка(тело(город='Г' * 61), 'city')
    ошибка(тело(город='<script>'), 'city')
    assert push.разобрать_подписку(тело(город='Алматы‮\n'), СЕЙЧАС).город == 'Алматы'
    assert push.разобрать_подписку(тело(город='Усть-Каменогорск', язык='kk'), СЕЙЧАС).язык == 'kk'
    assert push.разобрать_подписку(тело(город='Samarqand', язык='uz'), СЕЙЧАС).язык == 'uz'


def test_пункты_проверка():
    ошибка(тело([dict(пункт('2026-11-20', '14:39'), at=момент('2026-11-20', '14:39') + 1)]), 'item.at')
    ошибка(тело([dict(пункт('2026-11-20', '14:39'), key='jumua')]), 'item.key')
    ошибка(тело([dict(пункт('2026-11-20', '14:39'), before=7)]), 'item.before')
    ошибка(тело([dict(пункт('2026-11-20', '14:39'), time='14:40')]), 'item.time')  # время не совпало с моментом
    ошибка(тело([dict(пункт('2026-11-20', '14:39'), next={'key': 'sunrise', 'time': '07:00'})]), 'item.next')
    ошибка(тело([пункт('2026-12-22', '14:39')]), 'items.range')  # дальше 31 дня
    ошибка(тело('не список'), 'items')
    ошибка(тело([пункт('2026-11-20', '08:00')]), 'items.empty')  # прошедший пункт отброшен — пусто


def test_напоминание_время_намаза():
    з = push.разобрать_подписку(тело([пункт('2026-11-20', '14:39', заранее=10)]), СЕЙЧАС)
    assert з.пункты[0].момент == момент('2026-11-20', '14:29') and з.пункты[0].время == '14:39' and з.пункты[0].заранее == 10


def test_прошедшие_отброшены_повторы_один_раз():
    з = push.разобрать_подписку(тело([пункт('2026-11-20', '06:12', 'fajr'), пункт('2026-11-20', '14:39'), пункт('2026-11-20', '14:39')]), СЕЙЧАС)
    assert [п.ключ for п in з.пункты] == ['asr']


def test_не_больше_12_в_сутки_и_372_всего():
    сутки = [пункт('2026-11-21', f'{ч:02d}:00', 'asr') for ч in range(10, 23)]  # 13 пунктов в один день
    ошибка(тело(сутки), 'items.per_day')
    ошибка(тело([пункт('2026-11-21', '14:39')] * (push.МАКС_ПУНКТОВ + 1)), 'items')


def test_полное_расписание_30_дней():
    from datetime import date, timedelta

    пункты = []
    for д in range(1, 31):
        день = (date(2026, 11, 20) + timedelta(days=д)).isoformat()
        for ключ, время in [('fajr', '06:12'), ('sunrise', '07:40'), ('dhuhr', '12:45'), ('asr', '15:20'), ('maghrib', '17:30'), ('isha', '19:00')]:
            пункты.append(пункт(день, время, ключ, след=None))
            пункты.append(пункт(день, время, ключ, заранее=30, след=None))
    з = push.разобрать_подписку(тело(пункты), СЕЙЧАС)
    assert len(з.пункты) == 360


# ───────────── тексты ─────────────

def test_текст_намаза_ru():
    п = push.Пункт(момент('2026-11-20', '14:39'), 'asr', '14:39', 0, 'maghrib', '16:28')
    у = push.уведомление(п, 'ru', 'Алматы')
    assert у['title'] == 'Аср · 14:39'
    assert у['body'] == 'Алматы'  # владелец 28.11.2026: как Sajda — только место
    assert у['tag'] == 'aiustaz-asr-2026-11-20' and у['url'] == '#/prayer' and у['silent'] is False
    assert [к['action'] for к in у['actions']] == ['prayer', 'qibla'] and у['actions'][0]['title'] == 'Время намаза'


def test_текст_kk_и_джума():
    п = push.Пункт(момент('2026-11-20', '13:05'), 'dhuhr', '13:05', 0, 'asr', '15:20')  # пятница
    assert push.уведомление(п, 'ru', 'Алматы')['title'] == 'Джума · 13:05'
    у = push.уведомление(п, 'kk', 'Алматы')
    assert у['title'] == 'Жұма намазы · 13:05'
    assert у['body'] == 'Алматы'
    п2 = push.Пункт(момент('2026-11-21', '13:05'), 'dhuhr', '13:05', 0, 'asr', '15:20')  # суббота
    assert push.уведомление(п2, 'ru', 'Алматы')['title'] == 'Зухр · 13:05'


def test_текст_uz():
    """uz (латиница, владелец 20.11.2026): Bomdod, Quyosh, Peshin, Asr, Shom, Xufton; пятница — Juma namozi."""
    п = push.Пункт(момент('2026-11-20', '13:05'), 'dhuhr', '13:05', 0, 'asr', '15:20')  # пятница
    у = push.уведомление(п, 'uz', 'Toshkent')
    assert у['title'] == 'Juma namozi · 13:05' and у['lang'] == 'uz'
    assert у['body'] == 'Toshkent'
    assert [к['title'] for к in у['actions']] == ['Namoz vaqti', 'Qibla']
    п2 = push.Пункт(момент('2026-11-21', '05:50'), 'fajr', '06:00', 10, 'sunrise', '07:30')
    assert push.уведомление(п2, 'uz', 'Toshkent')['title'] == '10 daqiqadan keyin — Bomdod (06:00)'
    assert push.уведомление_обновить('uz', СЕЙЧАС)['body'] == 'Namoz vaqtini yangilash uchun AI Ustazni oching'
    assert set(push.НАЗВАНИЯ['uz'].values()) == {'Bomdod', 'Quyosh', 'Peshin', 'Asr', 'Shom', 'Xufton'}
    for с in [*push.ТЕКСТЫ['uz'].values(), *push.НАЗВАНИЯ['uz'].values(), push.ДЖУМА['uz']]:
        assert not re.search(r'[а-яёәіңғүұқөһ]', re.sub(r'\{[^}]+\}', '', с), re.I), с  # латиница (кроме {подстановок})
        assert not re.search(r'(?i)\bsura|oyat|hadis', с), с


def test_текст_en():
    """en (владелец 20.11.2026): Fajr, Sunrise, Dhuhr, Asr, Maghrib, Isha; пятница — Jumu'ah prayer."""
    assert push.разобрать_подписку(тело(город='Istanbul', язык='en'), СЕЙЧАС).язык == 'en'
    п = push.Пункт(момент('2026-11-20', '13:05'), 'dhuhr', '13:05', 0, 'asr', '15:20')  # пятница
    у = push.уведомление(п, 'en', 'Almaty')
    assert у['title'] == "Jumu'ah prayer · 13:05" and у['lang'] == 'en'
    assert у['body'] == 'Almaty'
    assert [к['title'] for к in у['actions']] == ['Prayer times', 'Qibla']
    п2 = push.Пункт(момент('2026-11-21', '05:50'), 'fajr', '06:00', 10, 'sunrise', '07:30')
    assert push.уведомление(п2, 'en', 'Almaty')['title'] == 'In 10 min — Fajr (06:00)'
    assert push.уведомление_обновить('en', СЕЙЧАС)['body'] == 'Open AI Ustaz to update the prayer times'
    assert set(push.НАЗВАНИЯ['en'].values()) == {'Fajr', 'Sunrise', 'Dhuhr', 'Asr', 'Maghrib', 'Isha'}
    for с in [*push.ТЕКСТЫ['en'].values(), *push.НАЗВАНИЯ['en'].values(), push.ДЖУМА['en']]:
        assert not re.search(r'[а-яёәіңғүұқөһ’ʻʼ]', re.sub(r'\{[^}]+\}', '', с), re.I), с  # латиница, апостроф ASCII
        assert not re.search(r'(?i)\bsurah?|ayah|hadith|quran', с), с  # без текста и ссылок Корана (правило 9)


def test_напоминание_и_восход():
    п = push.Пункт(момент('2026-11-20', '14:29'), 'asr', '14:39', 10, 'maghrib', '16:28')
    у = push.уведомление(п, 'ru', 'Алматы')
    assert у['title'] == 'Через 10 мин — Аср (14:39)' and у['body'] == 'Алматы'
    assert у['tag'] == 'aiustaz-soon-asr-2026-11-20' and у['kind'] == 'soon'
    assert push.уведомление(п, 'kk', 'Алматы')['title'] == '10 минуттан кейін — Екінті (14:39)'
    в = push.уведомление(push.Пункт(момент('2026-11-21', '07:40'), 'sunrise', '07:40', 0, 'dhuhr', '12:45'), 'ru', 'Астана')
    assert в['title'] == 'Восход · 07:40' and в['body'] == 'Астана'
    и = push.уведомление(push.Пункт(момент('2026-11-19', '19:00'), 'isha', '19:00', 0, 'fajr', '06:13'), 'ru', 'Алматы')
    assert и['title'] == 'Иша · 19:00' and и['body'] == 'Алматы'


def test_служебные_тексты():
    о = push.уведомление_обновить('ru', СЕЙЧАС)
    assert о['silent'] is True and о['body'] == 'Откройте AI Ustaz, чтобы обновить время намаза' and о['url'] == '#/notifications'
    п = push.уведомление_проверка('kk', 'Алматы', СЕЙЧАС)
    assert п['tag'] == 'aiustaz-test' and 'Алматы' in п['body']


def test_тексты_без_арабского_эмодзи_и_призывов():
    """Правила CLAUDE.md: в уведомлениях нет текста Корана (арабского), хадисов, призывов, наград, эмодзи."""
    # ar и ur (владелец 28.11.2026) пишутся арабским письмом — для них признак текста Корана другой: огласовки
    # (наш Коран всегда Uthmani с харакатами; тексты интерфейса — без них).
    АРАБСКИЕ_ЯЗЫКИ = ('ar', 'ur')
    def тексты(языки):
        return ([с for я in языки for с in push.ТЕКСТЫ[я].values()] + [с for я in языки for с in push.НАЗВАНИЯ[я].values()]
                + [push.ДЖУМА[я] for я in языки])
    for с in тексты([я for я in push.ЯЗЫКИ if я in АРАБСКИЕ_ЯЗЫКИ]):
        assert not re.search(r'[\u064B-\u065F\u0670\u06D6-\u06ED]', с), с
    все = тексты(push.ЯЗЫКИ)
    for с in тексты([я for я in push.ЯЗЫКИ if я not in АРАБСКИЕ_ЯЗЫКИ]):
        assert not re.search(r'[؀-ۿݐ-ݿﭐ-﷿ﹰ-﻿]', с), с
    for с in все:
        assert not re.search(r'[\U0001F000-\U0001FAFF☀-➿]', с), с
        assert not re.search(r'(?i)сур|аят|хадис|прочитайте|награ|серия|рейтинг|хасанат|недействит|сүре|аят|хадис', с), с


# ───────────── когда отправлять ─────────────

def test_решение():
    assert push.решение(СЕЙЧАС + 1, СЕЙЧАС) == 'рано'
    assert push.решение(СЕЙЧАС, СЕЙЧАС) == 'отправить'
    assert push.решение(СЕЙЧАС - 10 * 60_000, СЕЙЧАС) == 'отправить'
    assert push.решение(СЕЙЧАС - 10 * 60_000 - 1, СЕЙЧАС) == 'поздно'


def test_срок_жизни_и_обновление():
    assert push.срок_жизни(push.Пункт(0, 'asr', '14:39')) == (600, 'high')
    assert push.срок_жизни(push.Пункт(0, 'asr', '14:39', 30)) == (1800, 'high')
    assert push.нужно_напомнить_обновить(СЕЙЧАС + 2 * push.ДЕНЬ_МС, СЕЙЧАС, False)
    assert not push.нужно_напомнить_обновить(СЕЙЧАС + 2 * push.ДЕНЬ_МС, СЕЙЧАС, True)
    assert not push.нужно_напомнить_обновить(СЕЙЧАС + 4 * push.ДЕНЬ_МС, СЕЙЧАС, False)


def test_адрес_отписки():
    assert push.разобрать_адрес({'endpoint': АДРЕС_FCM}) == АДРЕС_FCM
    with pytest.raises(push.ОшибкаЗапроса):
        push.разобрать_адрес({'endpoint': 'https://evil.kz/x'})
    with pytest.raises(push.ОшибкаЗапроса):
        push.разобрать_адрес([АДРЕС_FCM])


# ───────────── пояс места (владелец 20.11.2026: время намаза в любой стране) ─────────────

def _пункт_в_поясе(день: str, время: str, смещение: int, ключ: str = 'asr') -> dict:
    from datetime import datetime, timedelta, timezone

    д = datetime.strptime(день + ' ' + время, '%Y-%m-%d %H:%M').replace(tzinfo=timezone(timedelta(minutes=смещение)))
    return {'at': int(д.timestamp() * 1000), 'key': ключ, 'time': время, 'before': 0, 'off': смещение}


def test_пояс_места_стамбул_и_нью_йорк():
    з = push.разобрать_подписку(тело([_пункт_в_поясе('2026-11-20', '15:41', 180), _пункт_в_поясе('2026-11-21', '14:20', -300)]), СЕЙЧАС)
    assert [п.смещение for п in з.пункты] == [180, -300]
    assert [п.время for п in з.пункты] == ['15:41', '14:20']


def test_без_смещения_по_умолчанию_utc5():
    з = push.разобрать_подписку(тело(), СЕЙЧАС)
    assert з.пункты[0].смещение == 300


def test_время_проверяется_по_смещению():
    п = _пункт_в_поясе('2026-11-20', '15:41', 180)
    ошибка(тело([dict(п, off=300)]), 'item.time')  # тот же момент в UTC+5 — другое местное время


@pytest.mark.parametrize('смещение', [301, -721, 845, '180', True, 1.5])
def test_кривое_смещение(смещение):
    ошибка(тело([dict(_пункт_в_поясе('2026-11-20', '15:41', 180), off=смещение)]), 'item.off')


def test_джума_и_тег_по_дню_места():
    # 20.11.2026 — пятница. 23:30 в Нью-Йорке (UTC−5) в четверг 19.11 — уже пятница по UTC+5, но не по месту.
    п = push.разобрать_подписку(тело([_пункт_в_поясе('2026-11-20', '12:05', -300, 'dhuhr')]), СЕЙЧАС).пункты[0]
    у = push.уведомление(п, 'ru', 'New York')
    assert у['title'].startswith('Джума') and у['tag'].endswith('2026-11-20')
    с = push.разобрать_подписку(тело([_пункт_в_поясе('2026-11-21', '01:30', 840, 'dhuhr')]), СЕЙЧАС).пункты[0]
    # 21.11 01:30 в UTC+14 — это 20.11 по UTC+5, но у места — суббота: не «Джума»
    assert not push.уведомление(с, 'ru', 'Kiritimati')['title'].startswith('Джума')
    assert push.уведомление(с, 'ru', 'Kiritimati')['tag'].endswith('2026-11-21')


def test_текст_новые_языки():
    """ar, tr, id, ur (владелец 28.11.2026): названия = app/src/prayer/day.ts; пятница — свой «джума»; текст = примеру экрана."""
    п = push.Пункт(момент('2026-11-20', '13:05'), 'dhuhr', '13:05', 0, 'asr', '15:20')  # пятница
    for язык, джума, тело_ in (
        ('ar', 'صلاة الجمعة', 'Makkah'),
        ('tr', 'Cuma namazı', 'Makkah'),
        ('id', 'Salat Jumat', 'Makkah'),
        ('ur', 'جمعہ کی نماز', 'Makkah'),
    ):
        assert push.разобрать_подписку(тело(город='Makkah', язык=язык), СЕЙЧАС).язык == язык
        у = push.уведомление(п, язык, 'Makkah')
        assert у['title'] == f'{джума} · 13:05' and у['lang'] == язык
        assert у['body'] == тело_
        assert set(push.ТЕКСТЫ[язык]) == set(push.ТЕКСТЫ['ru']) and set(push.НАЗВАНИЯ[язык]) == set(push.НАЗВАНИЯ['ru'])
        for с in [*push.ТЕКСТЫ[язык].values(), *push.НАЗВАНИЯ[язык].values(), push.ДЖУМА[язык]]:
            assert not re.search(r'[а-яёәіңғүұқөһ]', re.sub(r'\{[^}]+\}', '', с), re.I), с  # кроме {подстановок}
            # Правило 9: без текста Корана в уведомлениях — нет слов «сура/аят» и цитат.
            assert not re.search(r'(?i)sure|surah|ayet|ayat|سورة|آية', с), с
    п2 = push.Пункт(момент('2026-11-21', '05:50'), 'fajr', '06:00', 10, 'sunrise', '07:30')
    assert push.уведомление(п2, 'tr', 'İstanbul')['title'] == '10 dk sonra — İmsak (06:00)'
