/**
 * СГЕНЕРИРОВАНО tools/quran/build_quran.py — руками не править (python3 -I -B tools/quran/build_quran.py).
 * Где лежит индекс сур Корана для показа (статический файл сборки: app/public/quran → dist/quran).
 * Текста Корана здесь нет: только имя файла индекса и его sha256 (src/quran/data.ts сверяет при загрузке).
 */
export const МАНИФЕСТ_КОРАНА = {
  формат: 1,
  индекс: 'quran/index.97a9876faee548540c65.json',
  sha256Индекса: '97a9876faee548540c65a04efefd0bea5e64a9ebb8b37f29ffaa7bb453b3e5b5',
  сур: 114,
  аятов: 6236,
  источник: 'tanzil-uthmani-1.1',
  файлИсточника: 'quran-uthmani-marks.xml',
  sha256Источника: 'af9311c521b5dadab01ea1ef259c281ffa83cf224bad24ee89469ce1c3c72916',
} as const;
