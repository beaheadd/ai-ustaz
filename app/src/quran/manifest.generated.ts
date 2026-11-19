/**
 * СГЕНЕРИРОВАНО tools/quran/build_quran.py — руками не править (python3 -I -B tools/quran/build_quran.py).
 * Где лежит индекс сур Корана для показа (статический файл сборки: app/public/quran → dist/quran).
 * Текста Корана здесь нет: только имя файла индекса и его sha256 (src/quran/data.ts сверяет при загрузке).
 */
export const МАНИФЕСТ_КОРАНА = {
  формат: 1,
  индекс: 'quran/index.b867ef21b74e7a9ab248.json',
  sha256Индекса: 'b867ef21b74e7a9ab248f046b141690f20e744fdcbb7afe3ffee97e4fab3370b',
  сур: 114,
  аятов: 6236,
  источник: 'tanzil-uthmani-1.1',
  файлИсточника: 'quran-uthmani-marks.xml',
  sha256Источника: 'af9311c521b5dadab01ea1ef259c281ffa83cf224bad24ee89469ce1c3c72916',
} as const;
