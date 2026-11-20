"""Фоновая отправка уведомлений о времени намаза — служба mugalim-jobs.service (фоновые задачи — только здесь, CLAUDE.md).

Владелец 20.11.2026: «правильные, красивые уведомления время намаза приходило к клиенту». docs/дизайн/07-уведомления.md.

Цикл раз в MUGALIM_PUSH_TICK_SEC (20 с; 5–60):
  1. взять наступившие пункты расписания (БД помечает их взятыми — второй процесс их не возьмёт, дважды не шлём);
  2. опоздание больше 10 мин (сервер стоял, сеть) — не отправлять, только запись в журнал «late»;
  3. отправить Web Push (pywebpush 2.5.0, MPL-2.0; VAPID — ключ из /etc/mugalim.env, права 600) с TTL и Urgency из
     push.срок_жизни; 404/410 от push-сервиса — подписка больше не действует: удалить её и расписание сразу;
  4. подписки, у которых до конца расписания меньше 3 дней, — одно тихое «Откройте AI Ustaz, чтобы обновить время намаза»;
  5. раз в час — уборка (db.Хранилище.убрать_старое).
Официальное время намаза КЗ/УЗ (server/prayer.py; владелец 20.11.2026) — в отдельном потоке этой же службы, чтобы
скачивание у ведомства не задерживало уведомления: раз в MUGALIM_PRAYER_TICK_SEC (60 с) порция до 12 таблиц — сначала
те, что попросили клиенты, потом недостающие (с 1 ноября — и на следующий год), потом не сверенные 7 дней.
MUGALIM_PRAYER_FETCH=0 — не скачивать (API отдаёт то, что уже в базе).
Контракт для тестов: шаг(хранилище, отправить, сейчас) -> dict; отправить(подписка, данные, ttl, срочность) -> код HTTP
(0 — нет ответа). Запуск: python jobs.py (WorkingDirectory=/opt/mugalim/server). В журнал — только хэш адреса подписки.
"""
from __future__ import annotations

import json
import logging
import signal
import sys
import threading
import time
from concurrent.futures import ThreadPoolExecutor
from typing import Callable
from urllib.parse import urlsplit

import boot
import push
from envnum import строка_из_окружения, целое_из_окружения, число_из_окружения

журнал = logging.getLogger('mugalim.jobs')

Отправить = Callable[[dict, dict, int, str], int]

УСПЕХ = (200, 201, 202)
НЕДЕЙСТВИТЕЛЬНА = (404, 410)


def _отправить_пару(хранилище, отправить: Отправить, подписка: dict, пункт: push.Пункт, сейчас: int) -> str:
    if push.решение(пункт.момент, сейчас) == 'поздно':
        хранилище.записать(подписка['хэш'], 'late')
        return 'поздно'
    данные = push.уведомление(пункт, подписка['язык'], подписка['город'])
    ttl, срочность = push.срок_жизни(пункт)
    код = отправить(подписка, данные, ttl, срочность)
    return итог_кода(хранилище, подписка, код, 'prayer' if not пункт.заранее else 'soon')


def итог_кода(хранилище, подписка: dict, код: int, событие: str) -> str:
    if код in УСПЕХ:
        хранилище.записать(подписка['хэш'], событие, код)
        return 'отправлено'
    if код in НЕДЕЙСТВИТЕЛЬНА:
        хранилище.удалить(подписка['хэш'])
        хранилище.записать(подписка['хэш'], 'gone', код)
        return 'удалено'
    хранилище.записать(подписка['хэш'], 'fail', код or None)
    return 'ошибка'


def шаг(хранилище, отправить: Отправить, сейчас: int, *, потоков: int = 8) -> dict:
    счёт = {'отправлено': 0, 'поздно': 0, 'удалено': 0, 'ошибка': 0, 'обновить': 0}
    пары = хранилище.взять_наступившие(сейчас)
    удалённые: set[int] = set()
    # Пункты одной подписки — по порядку в одном потоке (после 410 остальные её пункты не шлём).
    по_подпискам: dict[int, list[tuple[dict, push.Пункт]]] = {}
    for подписка, пункт in пары:
        по_подпискам.setdefault(подписка['id'], []).append((подписка, пункт))

    def обработать(список: list[tuple[dict, push.Пункт]]) -> list[str]:
        итоги = []
        for подписка, пункт in список:
            if подписка['id'] in удалённые:
                break
            и = _отправить_пару(хранилище, отправить, подписка, пункт, сейчас)
            if и == 'удалено':
                удалённые.add(подписка['id'])
            итоги.append(и)
        return итоги

    if по_подпискам:
        with ThreadPoolExecutor(max_workers=max(1, min(потоков, len(по_подпискам)))) as пул:
            for итоги in пул.map(обработать, по_подпискам.values()):
                for и in итоги:
                    счёт[и] += 1

    for подписка in хранилище.для_обновления(сейчас, push.ПОРОГ_ОБНОВЛЕНИЯ_МС):
        if подписка['id'] in удалённые or not push.нужно_напомнить_обновить(подписка['конец'], сейчас, подписка['обновление_отправлено']):
            continue
        хранилище.отметить_обновление(подписка['id'])  # один раз, даже если push-сервис не ответил
        код = отправить(подписка, push.уведомление_обновить(подписка['язык'], сейчас), 86_400, 'low')
        if итог_кода(хранилище, подписка, код, 'refresh') == 'отправлено':
            счёт['обновить'] += 1
    return счёт


def создать_отправителя(приватный: str, тема: str, таймаут: float = 10.0) -> Отправить:
    """Web Push через pywebpush (шифрование aes128gcm, подпись VAPID). Ключ не выводится ни в журнал, ни в ответы."""
    import requests
    from py_vapid import Vapid
    from pywebpush import WebPushException, webpush

    vapid = Vapid.from_string(приватный)
    сессии = threading.local()

    def отправить(подписка: dict, данные: dict, ttl: int, срочность: str) -> int:
        хост = urlsplit(подписка['endpoint']).hostname or ''
        if not push.хост_разрешён(хост):  # ещё раз здесь: сервер не ходит по чужим адресам
            return 0
        if not hasattr(сессии, 'сессия'):
            сессии.сессия = requests.Session()
        try:
            ответ = webpush(
                {'endpoint': подписка['endpoint'], 'keys': {'p256dh': подписка['p256dh'], 'auth': подписка['auth']}},
                json.dumps(данные, ensure_ascii=False, separators=(',', ':')),
                vapid_private_key=vapid,
                vapid_claims={'sub': тема},  # новый словарь на каждый вызов: pywebpush дописывает в него aud и exp
                ttl=ttl,
                headers={'Urgency': срочность},
                timeout=таймаут,
                requests_session=сессии.сессия,
            )
            return int(getattr(ответ, 'status_code', 0) or 0)
        except WebPushException as е:
            return int(getattr(е.response, 'status_code', 0) or 0)
        except requests.RequestException:
            return 0

    return отправить


def поток_намаза(хранилище, стоп: threading.Event) -> threading.Thread:
    import prayer

    тик = число_из_окружения('MUGALIM_PRAYER_TICK_SEC', 60.0, 20.0, 3600.0)

    def цикл() -> None:
        while not стоп.is_set():
            try:
                счёт = prayer.шаг_обновления(хранилище, prayer.скачать_json, int(time.time() * 1000),
                                             пауза=lambda: стоп.wait(2.0), стоп=стоп.is_set)
                if any(счёт.values()):
                    журнал.info('время намаза: %s', счёт)
            except boot.ЧужаяБаза as е:
                журнал.critical('СТОП: %s', е)
                стоп.set()
            except Exception as е:  # noqa: BLE001 — поток не должен умирать (сеть, база перезапускается)
                журнал.warning('время намаза: шаг не удался: %s', type(е).__name__)
            стоп.wait(тик)

    поток = threading.Thread(target=цикл, name='prayer-official', daemon=True)
    поток.start()
    return поток


def главный() -> None:
    logging.basicConfig(level=logging.INFO, format='%(asctime)s %(name)s %(levelname)s %(message)s')
    logging.getLogger('urllib3').setLevel(logging.WARNING)  # адреса подписок в журнал не пишем
    from db import Хранилище

    адрес = boot.адрес_базы()
    boot.остановить_если_чужая(адрес)
    try:
        хранилище = Хранилище(адрес)
        хранилище.применить_миграции()
    except boot.ЧужаяБаза as е:
        журнал.critical('СТОП: %s', е)
        sys.exit(boot.КОД_ОСТАНОВА)
    приватный = строка_из_окружения('MUGALIM_VAPID_PRIVATE', '')
    if not приватный:
        журнал.critical('нет MUGALIM_VAPID_PRIVATE в /etc/mugalim.env — ключи создаёт server/deploy/setup-server.sh')
        sys.exit(boot.КОД_ОСТАНОВА)
    отправить = создать_отправителя(приватный, строка_из_окружения('MUGALIM_VAPID_SUBJECT', 'https://aiustaz.pro'))
    тик = число_из_окружения('MUGALIM_PUSH_TICK_SEC', 20.0, 5.0, 60.0)
    потоков = целое_из_окружения('MUGALIM_PUSH_WORKERS', 8, 1, 32)

    стоп = threading.Event()
    signal.signal(signal.SIGTERM, lambda *_: стоп.set())
    signal.signal(signal.SIGINT, lambda *_: стоп.set())
    последняя_уборка = 0.0
    журнал.info('уведомления: цикл раз в %.0f с, потоков %d', тик, потоков)
    if целое_из_окружения('MUGALIM_PRAYER_FETCH', 1, 0, 1):
        поток_намаза(хранилище, стоп)
    while not стоп.is_set():
        сейчас = int(time.time() * 1000)
        try:
            счёт = шаг(хранилище, отправить, сейчас, потоков=потоков)
            if any(счёт.values()):
                журнал.info('шаг: %s', счёт)
            if time.time() - последняя_уборка > 3600:
                журнал.info('уборка: %s', хранилище.убрать_старое(сейчас))
                последняя_уборка = time.time()
        except boot.ЧужаяБаза as е:
            журнал.critical('СТОП: %s', е)
            sys.exit(boot.КОД_ОСТАНОВА)
        except Exception as е:  # noqa: BLE001 — цикл не должен умирать от одной ошибки (сеть, база перезапускается)
            журнал.warning('шаг не удался: %s', type(е).__name__)
        стоп.wait(тик - (time.time() % тик))


if __name__ == '__main__':
    главный()
