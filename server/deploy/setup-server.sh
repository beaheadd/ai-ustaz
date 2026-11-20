#!/usr/bin/env bash
# Назначение: установить/обновить сервер AI Ustaz (API 127.0.0.1:8031 + фоновые задачи) — уведомления о времени намаза.
# Владелец 20.11.2026: «правильные, красивые уведомления время намаза приходило к клиенту». Сейчас — на сервере BATR в РК
# (как речевой сервис, speech/deploy/setup-speech.sh), но своим пользователем, каталогом, базой и службами.
# Запуск НА СЕРВЕРЕ от root, из папки с исходниками:  sudo bash server/deploy/setup-server.sh
# Повторный запуск безопасен: обновляет код и зависимости; базу, роль и VAPID-ключи не пересоздаёт.
# Не трогает BATR: пользователь mugalim, /opt/mugalim/server, база и роль mugalim в уже работающем PostgreSQL (другие
# базы не читаем и не меняем), службы mugalim-api и mugalim-jobs. /etc/world.env не читаем.
# В облачной сессии Claude Code не запускать (там нет ключей сервера — так задумано).
set -euo pipefail

SRC="$(cd "$(dirname "$0")/.." && pwd)"          # .../server
APP=/opt/mugalim/server
ENVF=/etc/mugalim.env
PORT=8031

id mugalim >/dev/null 2>&1 || useradd --system --home /opt/mugalim --shell /usr/sbin/nologin mugalim
mkdir -p "$APP"
rsync -a --delete --exclude .venv --exclude __pycache__ --exclude tests --exclude .pytest_cache "$SRC/" "$APP/"

# PostgreSQL: используем уже работающий на сервере; если его нет — ставим пакет дистрибутива.
if ! command -v psql >/dev/null 2>&1; then
  echo "PostgreSQL не найден — ставлю пакет postgresql"
  DEBIAN_FRONTEND=noninteractive apt-get install -y -q postgresql
fi
systemctl is-active --quiet postgresql || systemctl start postgresql
# Своя роль и своя база (вход по unix-сокету через peer: пароля нет, секрета нет). UTF8 — названия городов kk/ru.
if ! sudo -u postgres psql -tAc "SELECT 1 FROM pg_roles WHERE rolname='mugalim'" | grep -q 1; then
  sudo -u postgres psql -q -c "CREATE ROLE mugalim LOGIN"
fi
if ! sudo -u postgres psql -tAc "SELECT 1 FROM pg_database WHERE datname='mugalim'" | grep -q 1; then
  sudo -u postgres psql -q -c "CREATE DATABASE mugalim OWNER mugalim ENCODING 'UTF8' LC_COLLATE 'C' LC_CTYPE 'C' TEMPLATE template0"
fi

if [ ! -x "$APP/.venv/bin/python" ]; then python3 -m venv "$APP/.venv"; fi
"$APP/.venv/bin/pip" install -q --upgrade pip
"$APP/.venv/bin/pip" install -q -r "$APP/requirements.txt"
chown -R mugalim:mugalim /opt/mugalim

# Настройки: файл общий с речевым сервисом. Создаём с правами 600, если его нет; VAPID-ключи — только здесь, на
# сервере, и только если их ещё нет (новые ключи сделали бы недействительными все подписки браузеров).
if [ ! -f "$ENVF" ]; then ( umask 077; : > "$ENVF" ); fi
chown root:root "$ENVF"; chmod 600 "$ENVF"
"$APP/.venv/bin/python" -I "$APP/vapid.py" "$ENVF"
grep -q '^MUGALIM_VAPID_SUBJECT=' "$ENVF" || echo 'MUGALIM_VAPID_SUBJECT=https://aiustaz.pro' >> "$ENVF"
grep -q '^MUGALIM_PUSH_TICK_SEC=' "$ENVF" || echo 'MUGALIM_PUSH_TICK_SEC=20' >> "$ENVF"
chmod 600 "$ENVF"

for s in mugalim-api mugalim-jobs; do
  install -m 644 "$APP/deploy/$s.service" "/etc/systemd/system/$s.service"
done
systemctl daemon-reload
systemctl enable mugalim-api mugalim-jobs >/dev/null
systemctl restart mugalim-api mugalim-jobs

for i in $(seq 1 30); do
  if curl -fsS "http://127.0.0.1:$PORT/api/push/health" >/dev/null 2>&1; then
    echo "OK: API отвечает: $(curl -fsS "http://127.0.0.1:$PORT/api/push/health")"
    curl -fsS "http://127.0.0.1:$PORT/api/push/key" >/dev/null && echo "OK: публичный VAPID-ключ отдаётся"
    if systemctl is-active --quiet mugalim-jobs; then echo "OK: mugalim-jobs работает"; exit 0; fi
    echo "ОШИБКА: mugalim-jobs не запущен — journalctl -u mugalim-jobs -n 50"; exit 1
  fi
  sleep 2
done
echo "ОШИБКА: API не ответил за минуту — journalctl -u mugalim-api -n 50"; exit 1
