"""VAPID-ключи для Web Push: создаются ТОЛЬКО на сервере и сразу пишутся в /etc/mugalim.env (права 600).

Владелец 20.11.2026: уведомления о времени намаза. Правило CLAUDE.md: секреты — только в env (/etc/mugalim.env, 600),
не в git, не в журнал и не в ответы. Закрытый ключ этот скрипт никуда не печатает.

Контракт:
  создать_ключи() -> (публичный, закрытый) — P-256; публичный — несжатая точка (65 байт), закрытый — 32 байта; base64url
  дописать_в_файл(путь) -> bool — если в файле уже есть MUGALIM_VAPID_PRIVATE — ничего не делает (False): ключи не
      меняются при каждой выкатке, иначе все подписки браузеров станут недействительны.
Запуск (setup-server.sh, от root): python3 -I vapid.py /etc/mugalim.env
"""
from __future__ import annotations

import base64
import os
import pathlib
import sys


def _b64(б: bytes) -> str:
    return base64.urlsafe_b64encode(б).decode('ascii').rstrip('=')


def создать_ключи() -> tuple[str, str]:
    from cryptography.hazmat.primitives import serialization
    from cryptography.hazmat.primitives.asymmetric import ec

    ключ = ec.generate_private_key(ec.SECP256R1())
    закрытый = ключ.private_numbers().private_value.to_bytes(32, 'big')
    публичный = ключ.public_key().public_bytes(serialization.Encoding.X962, serialization.PublicFormat.UncompressedPoint)
    return _b64(публичный), _b64(закрытый)


def дописать_в_файл(путь: str | os.PathLike) -> bool:
    п = pathlib.Path(путь)
    текст = п.read_text(encoding='utf-8') if п.exists() else ''
    if any(с.startswith('MUGALIM_VAPID_PRIVATE=') for с in текст.splitlines()):
        return False
    публичный, закрытый = создать_ключи()
    старая = os.umask(0o077)
    try:
        with open(п, 'a', encoding='utf-8') as ф:
            if текст and not текст.endswith('\n'):
                ф.write('\n')
            ф.write(f'MUGALIM_VAPID_PUBLIC={публичный}\nMUGALIM_VAPID_PRIVATE={закрытый}\n')
    finally:
        os.umask(старая)
    os.chmod(п, 0o600)
    return True


if __name__ == '__main__':
    if len(sys.argv) != 2:
        sys.exit('запуск: python3 -I vapid.py /etc/mugalim.env')
    print('VAPID: ключи созданы' if дописать_в_файл(sys.argv[1]) else 'VAPID: ключи уже есть — не меняю')
