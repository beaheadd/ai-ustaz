/**
 * СГЕНЕРИРОВАНО tools/hadith/build_hadith.py — руками не править (python3 -I -B tools/hadith/build_hadith.py).
 * Где лежит индекс хадисов аль-Бухари из HadeethEnc.com (статический файл сборки: app/public/hadith → dist/hadith).
 * Текста хадисов здесь нет: только имя файла индекса и его sha256 (src/hadith/data.ts сверяет при загрузке).
 * Решение владельца 21.11.2026: «Добавь хадисы Аль-Бухари ещё перевод!».
 */
export const МАНИФЕСТ_ХАДИСОВ = {
  формат: 1,
  индекс: 'hadith/index.f19c4952c8f37685cffa.json',
  sha256Индекса: 'f19c4952c8f37685cffa162d8132a5ec73ba30727ad07cf137b0e267538d2b58',
  хадисов: 813,
  источник: 'hadeethenc',
} as const;
