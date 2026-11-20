/**
 * СГЕНЕРИРОВАНО tools/quran/build_quran.py — руками не править (python3 -I -B tools/quran/build_quran.py).
 * Где лежит индекс сур Корана для показа (статический файл сборки: app/public/quran → dist/quran).
 * Текста Корана здесь нет: только имя файла индекса и его sha256 (src/quran/data.ts сверяет при загрузке).
 */
export const МАНИФЕСТ_КОРАНА = {
  формат: 1,
  индекс: 'quran/index.558dab21f2416e3fbcce.json',
  sha256Индекса: '558dab21f2416e3fbcce6501dcf4718092bf0871d4466da716190d88460d32bd',
  сур: 114,
  аятов: 6236,
  источник: 'tanzil-uthmani-1.1',
  файлИсточника: 'quran-uthmani-marks.xml',
  sha256Источника: 'af9311c521b5dadab01ea1ef259c281ffa83cf224bad24ee89469ce1c3c72916',
} as const;
