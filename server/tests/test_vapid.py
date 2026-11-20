"""VAPID-ключи (server/vapid.py): создаются один раз, файл 600, ключ подходит pywebpush."""
from __future__ import annotations

import os
import stat

import pytest

import vapid


def test_ключи_один_раз_и_права(tmp_path):
    файл = tmp_path / 'mugalim.env'
    файл.write_text('MUGALIM_SPEECH_THREADS=3', encoding='utf-8')
    assert vapid.дописать_в_файл(файл) is True
    текст = файл.read_text(encoding='utf-8')
    assert текст.startswith('MUGALIM_SPEECH_THREADS=3\nMUGALIM_VAPID_PUBLIC=') and 'MUGALIM_VAPID_PRIVATE=' in текст
    assert stat.S_IMODE(os.stat(файл).st_mode) == 0o600
    assert vapid.дописать_в_файл(файл) is False and файл.read_text(encoding='utf-8') == текст


def test_ключ_подходит_pywebpush():
    py_vapid = pytest.importorskip('py_vapid')
    публичный, закрытый = vapid.создать_ключи()
    assert len(публичный) == 87 and len(закрытый) == 43
    v = py_vapid.Vapid.from_string(закрытый)
    from cryptography.hazmat.primitives import serialization
    import base64
    точка = v.public_key.public_bytes(serialization.Encoding.X962, serialization.PublicFormat.UncompressedPoint)
    assert base64.urlsafe_b64encode(точка).decode().rstrip('=') == публичный
