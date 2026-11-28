/**
 * Загрузка шрифта «Мединский мусхаф» (KFGQPC Hafs 3.0) — веб. Контракт — в quranFontLoader.ts.
 *
 * Файл — WOFF ровно как у Комплекса (app/public/fonts → dist/fonts, без изменений: условия шрифта запрещают менять),
 * лениво: FontFace создаётся при первом показе текста Корана с этим шрифтом, не при запуске. Не через expo-font: каждое
 * новое правило @font-face в его общем <style> пересоздаёт прежние FontFace (Inter и Amiri снова «не загружены» —
 * theme/fonts.ts), поэтому — document.fonts.add. Адрес — свой (CSP font-src 'self'). Без сети файл отдаёт worker из
 * группы «коран» (scripts/after-export.mjs ГРУППЫ_ОФЛАЙН). Неудача (нет связи и нет в кэше) — false: текст рисуется
 * классическим шрифтом без подстройки; следующая попытка — при следующем показе.
 */
import { ШРИФТ_KFGQPC } from '../quran/kfgqpcFont';

let готов = false;
let обещание: Promise<boolean> | null = null;

function базаСборки(): string {
  try {
    const б = process.env.EXPO_BASE_URL;
    if (typeof б === 'string') return б.replace(/\/+$/, '');
  } catch {
    // нет process — ниже значение по умолчанию
  }
  return '/aiustaz';
}

export function шрифтKfgqpcГотов(): boolean {
  return готов;
}

export function загрузитьШрифтKfgqpc(): Promise<boolean> {
  if (обещание) return обещание;
  if (typeof document === 'undefined' || typeof FontFace === 'undefined' || !document.fonts) return Promise.resolve(false);
  const лицо = new FontFace(ШРИФТ_KFGQPC.семейство, `url("${базаСборки()}/${ШРИФТ_KFGQPC.файл}") format("woff")`, { display: 'block' });
  обещание = лицо
    .load()
    .then(() => {
      document.fonts.add(лицо);
      готов = true;
      return true;
    })
    .catch(() => {
      обещание = null;
      return false;
    });
  return обещание;
}
