#!/usr/bin/env bash
# Назначение: установить/обновить речевой сервис AI Ustaz на сервере (сейчас — сервер BATR, решение владельца 19.11.2026).
# Запуск НА СЕРВЕРЕ от root, из папки с исходниками mugalim:  sudo bash speech/deploy/setup-speech.sh
# Повторный запуск безопасен: обновляет код и зависимости, модель не перекачивает, если версия та же.
# Не трогает BATR: свой пользователь mugalim, свой каталог /opt/mugalim, своя служба mugalim-speech, порт 127.0.0.1:8032.
# В облачной сессии Claude Code не запускать (там нет ключей сервера — так задумано).
set -euo pipefail

SRC="$(cd "$(dirname "$0")/.." && pwd)"          # .../speech
APP=/opt/mugalim/speech
MODELS=/opt/mugalim/models
MODEL_REPO=obadx/muaalem-model-v3_2
MODEL_REV=01a1ef9fbe40d144ef845101e89ff924aed3fef5   # закреплено (QML: веса не меняем)
TORCH=2.15.0

id mugalim >/dev/null 2>&1 || useradd --system --home /opt/mugalim --shell /usr/sbin/nologin mugalim
mkdir -p "$APP" "$MODELS"
rsync -a --delete --exclude .venv --exclude .hf --exclude __pycache__ --exclude tests "$SRC/" "$APP/"

if [ ! -x "$APP/.venv/bin/python" ]; then python3 -m venv "$APP/.venv"; fi
"$APP/.venv/bin/pip" install -q --upgrade pip
"$APP/.venv/bin/pip" install -q --index-url https://download.pytorch.org/whl/cpu "torch==$TORCH"
"$APP/.venv/bin/pip" install -q -r "$APP/requirements.txt"

MODEL_DIR="$MODELS/muaalem-model-v3_2-${MODEL_REV:0:7}"
if [ ! -f "$MODEL_DIR/model.safetensors" ]; then
  "$APP/.venv/bin/python" -I -c "from huggingface_hub import snapshot_download; snapshot_download('$MODEL_REPO', revision='$MODEL_REV', local_dir='$MODEL_DIR')"
fi
chown -R mugalim:mugalim /opt/mugalim

# Настройки: создаём, только если файла нет (секретов здесь нет, но права 600 — по правилу CLAUDE.md).
if [ ! -f /etc/mugalim.env ]; then
  cat > /etc/mugalim.env <<ENV
MUGALIM_SPEECH_MODEL_DIR=$MODEL_DIR
MUGALIM_SPEECH_THREADS=2
MUGALIM_SPEECH_MAX_SEC=20
MUGALIM_SPEECH_QUEUE=4
ENV
  chmod 600 /etc/mugalim.env
fi

install -m 644 "$APP/deploy/mugalim-speech.service" /etc/systemd/system/mugalim-speech.service
systemctl daemon-reload
systemctl enable mugalim-speech >/dev/null
systemctl restart mugalim-speech

for i in $(seq 1 60); do
  if curl -fsS http://127.0.0.1:8032/v1/zdorovye >/dev/null 2>&1; then
    echo "OK: речевой сервис отвечает:"; curl -fsS http://127.0.0.1:8032/v1/zdorovye; echo; exit 0
  fi
  sleep 2
done
echo "ОШИБКА: сервис не ответил за 2 минуты — journalctl -u mugalim-speech -n 50"; exit 1
