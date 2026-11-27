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
# База знаний чата: в копии batr-world она уже в server/kb/; из исходников mugalim — content/kb/*.jsonl.
if [ -d "$SRC/../content/kb" ]; then mkdir -p "$APP/kb" && cp "$SRC"/../content/kb/*.jsonl "$APP/kb/"; fi

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
# Админка (владелец 27.11.2026): секрет для HMAC кодов входа — создаётся один раз здесь, в журнал не печатается.
if ! grep -q '^MUGALIM_ADMIN_SECRET=' "$ENVF"; then
  echo "MUGALIM_ADMIN_SECRET=$("$APP/.venv/bin/python" -I -c 'import secrets; print(secrets.token_urlsafe(48))')" >> "$ENVF"
fi
# Чат AI Ustaz (владелец 27.11.2026: «в нижнем меню посередине … только с нашей базой данных»): включён, режим «поиск»
# (внешнего ИИ нет: MUGALIM_ASK_LLM не ставим). Голос и фото — только если владелец включил их флагом (ниже).
grep -q '^MUGALIM_ASK=' "$ENVF" || echo 'MUGALIM_ASK=1' >> "$ENVF"
# Флаги голоса и фото: из workflow (ASK_VOICE / ASK_PHOTO = on|off), иначе как было.
set_flag() {  # set_flag ИМЯ on|off
  local name="$1" val="$2" v=0
  [ "$val" = on ] && v=1
  if grep -q "^$name=" "$ENVF"; then sed -i "s/^$name=.*/$name=$v/" "$ENVF"; else echo "$name=$v" >> "$ENVF"; fi
}
[ -n "${ASK_VOICE:-}" ] && set_flag MUGALIM_ASK_VOICE "$ASK_VOICE"
[ -n "${ASK_PHOTO:-}" ] && set_flag MUGALIM_ASK_PHOTO "$ASK_PHOTO"
chmod 600 "$ENVF"
flag_on() { grep -q "^$1=1" "$ENVF"; }

echo "--- ресурсы: $(nproc) ядер; $(free -m | awk '/^Mem:/ {print "память " $2 " МБ, свободно " $7 " МБ"}'); диск /opt: $(df -h /opt | awk 'NR==2 {print $4}')"

# Фото (OCR): Tesseract с арабским, русским, казахским и английским — пакеты дистрибутива (Apache-2.0).
if flag_on MUGALIM_ASK_PHOTO; then
  if ! command -v tesseract >/dev/null 2>&1 || ! tesseract --list-langs 2>/dev/null | grep -q '^ara$'; then
    DEBIAN_FRONTEND=noninteractive apt-get install -y -q tesseract-ocr tesseract-ocr-ara tesseract-ocr-rus tesseract-ocr-kaz tesseract-ocr-eng
  fi
  echo "OK: OCR — $(tesseract --version 2>&1 | head -1); языки: $(tesseract --list-langs 2>/dev/null | grep -E '^(ara|rus|kaz|eng)$' | tr '\n' ' ')"
fi

# Голос: отдельное окружение и служба mugalim-asr (faster-whisper на CPU). Модель скачивается ОДИН раз сюда, дальше —
# без сети (HF_HUB_OFFLINE). Нужны ≥ 2 ядра и ≥ 2 ГБ свободной памяти — иначе не включаем.
if flag_on MUGALIM_ASK_VOICE; then
  FREE_MB=$(free -m | awk '/^Mem:/ {print $7}')
  if [ "$(nproc)" -lt 2 ] || [ "${FREE_MB:-0}" -lt 2000 ]; then
    echo "ВНИМАНИЕ: мало ресурсов для распознавания речи ($(nproc) ядер, свободно ${FREE_MB} МБ) — голос выключаю"
    set_flag MUGALIM_ASK_VOICE off
  else
    ASR=/opt/mugalim/asr-venv
    [ -x "$ASR/bin/python" ] || python3 -m venv "$ASR"
    "$ASR/bin/pip" install -q --upgrade pip
    "$ASR/bin/pip" install -q -r "$APP/requirements-asr.txt"
    MODEL=$(grep '^MUGALIM_ASR_MODEL=' "$ENVF" | cut -d= -f2- || true); MODEL=${MODEL:-small}
    mkdir -p /opt/mugalim/asr-models
    "$ASR/bin/python" -c "from faster_whisper import WhisperModel as W; W('$MODEL', device='cpu', compute_type='int8', download_root='/opt/mugalim/asr-models')" \
      && echo "OK: модель распознавания $MODEL на месте"
    chown -R mugalim:mugalim /opt/mugalim
    install -m 644 "$APP/deploy/mugalim-asr.service" /etc/systemd/system/mugalim-asr.service
    systemctl daemon-reload
    systemctl enable mugalim-asr >/dev/null
    systemctl restart mugalim-asr
  fi
fi
if ! flag_on MUGALIM_ASK_VOICE && systemctl list-unit-files mugalim-asr.service >/dev/null 2>&1; then
  systemctl disable --now mugalim-asr >/dev/null 2>&1 || true
fi

for s in mugalim-api mugalim-jobs; do
  install -m 644 "$APP/deploy/$s.service" "/etc/systemd/system/$s.service"
done
systemctl daemon-reload
systemctl enable mugalim-api mugalim-jobs >/dev/null
systemctl restart mugalim-api mugalim-jobs

# База знаний чата ($APP/kb/*.jsonl). Всё или ничего, upsert по id, версии растут (kb_load).
DBURL=$(grep '^MUGALIM_DATABASE_URL=' "$ENVF" | cut -d= -f2- || true)
for f in "$APP"/kb/*.jsonl; do
  [ -f "$f" ] || continue
  ( cd "$APP" && sudo -u mugalim env ${DBURL:+MUGALIM_DATABASE_URL="$DBURL"} .venv/bin/python -m kb_load "$f" ) \
    || { echo "ОШИБКА: база знаний $(basename "$f") не загружена"; exit 1; }
done

for i in $(seq 1 30); do
  if curl -fsS "http://127.0.0.1:$PORT/api/push/health" >/dev/null 2>&1; then
    echo "OK: API отвечает: $(curl -fsS "http://127.0.0.1:$PORT/api/push/health")"
    curl -fsS "http://127.0.0.1:$PORT/api/push/key" >/dev/null && echo "OK: публичный VAPID-ключ отдаётся"
    curl -fsS -o /dev/null "http://127.0.0.1:$PORT/api/content/config" && echo "OK: настройки содержимого отдаются"
    if [ -f "$APP/admin_static/index.html" ]; then echo "OK: админка: $(cat "$APP/admin_static/version.json" 2>/dev/null)"; fi
    if grep -q '^MUGALIM_ADMIN_OWNER_EMAILS=.\+' "$ENVF"; then echo "OK: владелец админки задан"; else echo "ВНИМАНИЕ: владелец админки не задан (workflow «AI Ustaz admin: set owner»)"; fi
    if flag_on MUGALIM_ASK; then
      echo "OK: чат: $(curl -fsS "http://127.0.0.1:$PORT/api/ask/health" || echo 'НЕ отвечает')"
    fi
    if flag_on MUGALIM_ASK_VOICE; then
      for j in $(seq 1 30); do curl -fsS http://127.0.0.1:8033/health >/dev/null 2>&1 && break; sleep 2; done
      echo "голос: $(curl -fsS http://127.0.0.1:8033/health || echo 'служба mugalim-asr не отвечает — journalctl -u mugalim-asr')"
    fi
    if systemctl is-active --quiet mugalim-jobs; then echo "OK: mugalim-jobs работает"; exit 0; fi
    echo "ОШИБКА: mugalim-jobs не запущен — journalctl -u mugalim-jobs -n 50"; exit 1
  fi
  sleep 2
done
echo "ОШИБКА: API не ответил за минуту — journalctl -u mugalim-api -n 50"; exit 1
