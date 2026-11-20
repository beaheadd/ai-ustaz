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
    ошибка(тело(язык='en'), 'lang')
    ошибка(тело(город=''), 'city')
    ошибка(тело(город='Г' * 61), 'city')
    ошибка(тело(город='<script>'), 'city')
    assert push.разобрать_подписку(тело(город='Алматы‮\n'), СЕЙЧАС).город == 'Алматы'
    assert push.разобрать_подписку(тело(город='Усть-Каменогорск', язык='kk'), СЕЙЧАС).язык == 'kk'


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
    assert у['body'] == 'Наступило время намаза · Алматы. Следующий — Магриб в 16:28'
    assert у['tag'] == 'aiustaz-asr-2026-11-20' and у['url'] == '#/prayer' and у['silent'] is False
    assert [к['action'] for к in у['actions']] == ['prayer', 'qibla'] and у['actions'][0]['title'] == 'Время намаза'


def test_текст_kk_и_джума():
    п = push.Пункт(момент('2026-11-20', '13:05'), 'dhuhr', '13:05', 0, 'asr', '15:20')  # пятница
    assert push.уведомление(п, 'ru', 'Алматы')['title'] == 'Джума · 13:05'
    у = push.уведомление(п, 'kk', 'Алматы')
    assert у['title'] == 'Жұма намазы · 13:05'
    assert у['body'] == 'Намаз уақыты кірді · Алматы. Келесі — Екінті, 15:20'
    п2 = push.Пункт(момент('2026-11-21', '13:05'), 'dhuhr', '13:05', 0, 'asr', '15:20')  # суббота
    assert push.уведомление(п2, 'ru', 'Алматы')['title'] == 'Зухр · 13:05'


def test_напоминание_и_восход():
    п = push.Пункт(момент('2026-11-20', '14:29'), 'asr', '14:39', 10, 'maghrib', '16:28')
    у = push.уведомление(п, 'ru', 'Алматы')
    assert у['title'] == 'Через 10 мин — Аср (14:39)' and у['body'] == 'Алматы'
    assert у['tag'] == 'aiustaz-soon-asr-2026-11-20' and у['kind'] == 'soon'
    assert push.уведомление(п, 'kk', 'Алматы')['title'] == '10 минуттан кейін — Екінті (14:39)'
    в = push.уведомление(push.Пункт(момент('2026-11-21', '07:40'), 'sunrise', '07:40', 0, 'dhuhr', '12:45'), 'ru', 'Астана')
    assert в['title'] == 'Восход · 07:40' and в['body'] == 'Восход солнца · Астана. Следующий — Зухр в 12:45'
    # Иша в четверг: следующий — фаджр пятницы (не «Джума»: это не зухр)
    и = push.уведомление(push.Пункт(момент('2026-11-19', '19:00'), 'isha', '19:00', 0, 'fajr', '06:13'), 'ru', 'Алматы')
    assert и['body'].endswith('Следующий — Фаджр в 06:13')


def test_служебные_тексты():
    о = push.уведомление_обновить('ru', СЕЙЧАС)
    assert о['silent'] is True and о['body'] == 'Откройте AI Ustaz, чтобы обновить время намаза' and о['url'] == '#/notifications'
    п = push.уведомление_проверка('kk', 'Алматы', СЕЙЧАС)
    assert п['tag'] == 'aiustaz-test' and 'Алматы' in п['body']


def test_тексты_без_арабского_эмодзи_и_призывов():
    """Правила CLAUDE.md: в уведомлениях нет текста Корана (арабского), хадисов, призывов, наград, эмодзи."""
    все = [с for язык in push.ТЕКСТЫ.values() for с in язык.values()] + [с for я in push.НАЗВАНИЯ.values() for с in я.values()] + list(push.ДЖУМА.values())
    for с in все:
        assert not re.search(r'[؀-ۿݐ-ݿﭐ-﷿ﹰ-﻿]', с), с
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
