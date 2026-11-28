/**
 * Шрифт «Мединский мусхаф»: KFGQPC HAFS Uthmanic Script, версия 3.0 — Комплекс короля Фахда по печати Священного
 * Корана (Медина). Источник — официальная страница qurancomplex.gov.sa/fonts/hafs; условия (EULA в самом шрифте):
 * бесплатно, можно использовать, копировать и распространять; НЕЛЬЗЯ продавать и изменять — поэтому файл лежит ровно
 * таким, каким его раздаёт Комплекс (без перепаковки в woff2 и без урезания), sha256 сверяет check-dist и
 * scripts/test-quran-font.mjs. Текст лицензии — licenses/fonts/KFGQPC-Hafs-EULA.txt, запись — content/sources.json
 * («kfgqpc-hafs»). Решение владельца 28.11.2026: выбор шрифта, мединский — по умолчанию (quran/quranScript.ts).
 *
 * Контракт (только константы — модуль импортируют тесты под node и генератор лицензий находит его в бандле):
 *   ШРИФТ_KFGQPC.семейство — имя семейства для fontFamily (регистрирует theme/quranFontLoader);
 *   .файл — путь от baseUrl сборки (app/public/fonts → dist/fonts), хэш в имени = началу sha256 (п. 2 check-dist);
 *   .sha256 — sha256 WOFF как у Комплекса (qurancomplex.gov.sa/fonts/hafs-3.0.woff, 148 488 байт);
 *   .версия, .источник — для экрана «Лицензии» и «Как показываем Коран».
 * Нативно — тот же шрифт TTF из архива Комплекса hafs-3.0.zip (app/src/assets/fonts/kfgqpc-hafs-3.0.ttf, theme/quranFontLoader.ts).
 */
export const ШРИФТ_KFGQPC = {
  семейство: 'KFGQPCHafs',
  файл: 'fonts/kfgqpc-hafs-3.0.0ad10c288ee500cf25b4.woff',
  sha256: '0ad10c288ee500cf25b4d6542966f2b36807272c6cf836c65218d32818585775',
  байт: 148488,
  версия: '3.0',
  источник: 'qurancomplex.gov.sa/fonts/hafs',
} as const;
