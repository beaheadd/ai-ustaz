/**
 * СГЕНЕРИРОВАНО tools/quran/build_quran.py — руками не править (python3 -I -B tools/quran/build_quran.py).
 * Где лежит индекс сур Корана для показа (статический файл сборки: app/public/quran → dist/quran).
 * Текста Корана здесь нет: только имя файла индекса и его sha256 (src/quran/data.ts сверяет при загрузке).
 */
export const МАНИФЕСТ_КОРАНА = {
  формат: 1,
  индекс: 'quran/index.47f420faabc318ba6cfc.json',
  sha256Индекса: '47f420faabc318ba6cfce7e031b901b7576a81e018c59f531f4f18a59d15416c',
  сур: 114,
  аятов: 6236,
  источник: 'tanzil-uthmani-1.1',
  файлИсточника: 'quran-uthmani-marks.xml',
  sha256Источника: '33f4113df84c1bab0ee2eb69616139fda619bdd56fc163a72532daaf0431bf57',
} as const;
