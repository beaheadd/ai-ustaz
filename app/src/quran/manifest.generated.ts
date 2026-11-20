/**
 * СГЕНЕРИРОВАНО tools/quran/build_quran.py — руками не править (python3 -I -B tools/quran/build_quran.py).
 * Где лежит индекс сур Корана для показа (статический файл сборки: app/public/quran → dist/quran).
 * Текста Корана здесь нет: только имя файла индекса и его sha256 (src/quran/data.ts сверяет при загрузке).
 */
export const МАНИФЕСТ_КОРАНА = {
  формат: 1,
  индекс: 'quran/index.bb583ef6b567d31fd3f9.json',
  sha256Индекса: 'bb583ef6b567d31fd3f94dafb201ac813ed24020343eafaabecc86e17f000184',
  сур: 114,
  аятов: 6236,
  источник: 'tanzil-uthmani-1.1',
  файлИсточника: 'quran-uthmani-marks.xml',
  sha256Источника: 'af9311c521b5dadab01ea1ef259c281ffa83cf224bad24ee89469ce1c3c72916',
} as const;
