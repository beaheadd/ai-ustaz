/**
 * СГЕНЕРИРОВАНО tools/hadith/build_hadith.py — руками не править (python3 -I -B tools/hadith/build_hadith.py).
 * Где лежит индекс хадисов аль-Бухари из HadeethEnc.com (статический файл сборки: app/public/hadith → dist/hadith).
 * Текста хадисов здесь нет: только имя файла индекса и его sha256 (src/hadith/data.ts сверяет при загрузке).
 * Решение владельца 21.11.2026: «Добавь хадисы Аль-Бухари ещё перевод!».
 */
export const МАНИФЕСТ_ХАДИСОВ = {
  формат: 1,
  индекс: 'hadith/index.f8af5746815c66a6d629.json',
  sha256Индекса: 'f8af5746815c66a6d6296e1bc933acfe97f950b255c8cb75b5b9886e716b7476',
  хадисов: 813,
  источник: 'hadeethenc',
} as const;
