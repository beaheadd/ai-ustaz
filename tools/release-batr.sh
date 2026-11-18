#!/usr/bin/env bash
# Назначение: выпуск новой версии веб-прототипа AI Ustaz на batr.kz/aiustaz.
# Контракт: собирает app/ (export → CSP → check-dist), прогоняет e2e, кладёт сборку
#   в ветку batr-world/claude/aiustaz-<метка> (web/public/aiustaz/ + version.json), коммитит и пушит.
#   PR и слияние — вручную/агентом по правилам batr-world/CLAUDE.md (агент сам сливает свой PR,
#   выкатку делает GitHub Actions). Прямо в main не пушит, deploy.sh не запускает.
# Решение владельца 18.11.2026: прототип временно живёт на batr.kz/aiustaz; исходники — только здесь.
# Запуск: bash tools/release-batr.sh [метка]   (метка по умолчанию — короткий коммит mugalim)
# Имена переменных латиницей: bash не принимает кириллицу в именах.
set -euo pipefail

MUG="$(cd "$(dirname "$0")/.." && pwd)"
BATR="${BATR_DIR:-/home/user/batr-world}"
[ -z "$(git -C "$MUG" status --porcelain)" ] || { echo "ОШИБКА: в mugalim есть незакоммиченные правки — сначала коммит"; exit 1; }
COMMIT="$(git -C "$MUG" rev-parse HEAD)"
TAG="${1:-$(git -C "$MUG" rev-parse --short HEAD)}"
BRANCH="claude/aiustaz-$TAG"

echo "==> Сборка app/ из $COMMIT"
(cd "$MUG/app" && npm run build:web)
echo "==> Сквозной тест"
(cd "$MUG/app" && node scripts/e2e.mjs | tail -5)

echo "==> batr-world: ветка $BRANCH от свежего main"
[ -z "$(git -C "$BATR" status --porcelain --untracked-files=no)" ] || { echo "ОШИБКА: в batr-world незакоммиченные правки (чужая работа?) — не трогаю"; exit 1; }
git -C "$BATR" fetch -q --depth=50 origin main
git -C "$BATR" checkout -q -B "$BRANCH" origin/main
rm -rf "$BATR/web/public/aiustaz"
mkdir -p "$BATR/web/public/aiustaz"
cp -r "$MUG/app/dist/." "$BATR/web/public/aiustaz/"
printf '{"source":"beaheadd/mugalim","branch":"%s","commit":"%s","note":"собранная версия; исходники — в mugalim/app, не править здесь"}\n' \
  "$(git -C "$MUG" rev-parse --abbrev-ref HEAD)" "$COMMIT" > "$BATR/web/public/aiustaz/version.json"
if git -C "$BATR" check-ignore -q $(cd "$BATR" && find web/public/aiustaz -type f); then
  echo "ОШИБКА: часть файлов сборки игнорируется .gitignore batr-world"; exit 1
fi
git -C "$BATR" add -A web/public/aiustaz
if git -C "$BATR" diff --cached --quiet; then echo "Сборка не изменилась — выпускать нечего"; git -C "$BATR" checkout -q main; exit 0; fi
git -C "$BATR" commit -q -m "AI Ustaz: сборка mugalim@${COMMIT:0:7}

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
for i in 1 2 3 4; do git -C "$BATR" -c push.negotiate=true push -u origin "$BRANCH" && break || sleep $((2**i)); done
git -C "$BATR" checkout -q main
echo "==> Готово: ветка $BRANCH запушена. Дальше: PR в main → squash-слияние → GitHub Actions выкатит (проверить job «Выкатка на сервер» и version в логе)."
