"""Страж базы (server/boot.py) и миграции «только добавляющие» — без PostgreSQL."""
from __future__ import annotations

import pathlib
import re

import pytest

import boot

pytest.importorskip('psycopg')


@pytest.mark.parametrize('адрес', [
    'dbname=mugalim',
    'postgresql:///mugalim',
    'postgresql://mugalim@/mugalim?host=/var/run/postgresql',
    'host=127.0.0.1 port=55432 user=postgres dbname=mugalim_test_ab12',
])
def test_своя_база(адрес):
    boot.проверить_адрес(адрес)


@pytest.mark.parametrize('адрес', [
    '',
    'dbname=world',
    'postgresql://world@127.0.0.1/world',
    'postgresql://batr@127.0.0.1/mugalim',
    'dbname=mugalim user=world',
    'dbname=postgres',
    'dbname=mugalim_prod',
    'host=batr.kz dbname=mugalim',
    'это не адрес = = =',
])
def test_чужая_база(адрес):
    with pytest.raises(boot.ЧужаяБаза):
        boot.проверить_адрес(адрес)


def test_остановка_процесса(monkeypatch):
    monkeypatch.setenv('MUGALIM_DATABASE_URL', 'dbname=world # BATR')
    with pytest.raises(SystemExit) as е:
        boot.остановить_если_чужая(boot.адрес_базы())
    assert е.value.code == boot.КОД_ОСТАНОВА


def test_переменную_batr_не_читаем(monkeypatch):
    monkeypatch.delenv('MUGALIM_DATABASE_URL', raising=False)
    monkeypatch.setenv('DATABASE_URL', 'postgresql://world@127.0.0.1/world')
    assert boot.адрес_базы() == 'dbname=mugalim'


def test_миграции_только_добавляющие():
    запрет = re.compile(r'\b(DROP|TRUNCATE|RENAME|DELETE\s+FROM|UPDATE\s+\S+\s+SET|ALTER\s+TABLE\s+\S+\s+(DROP|ALTER|RENAME))\b', re.I)
    файлы = sorted((pathlib.Path(boot.__file__).parent / 'migrations').glob('*.sql'))
    assert файлы and [ф.name for ф in файлы][0] == '001_push.sql'
    for ф in файлы:
        текст = re.sub(r'--[^\n]*', '', ф.read_text(encoding='utf-8'))
        assert not запрет.search(текст), ф.name
        assert re.match(r'^\d{3}_[a-z0-9_]+\.sql$', ф.name)
