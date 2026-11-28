/**
 * Загрузка шрифта «Мединский мусхаф» (KFGQPC Hafs 3.0) — нативно (iOS/Android): TTF из архива Комплекса через
 * expo-font, лениво — при первом показе текста Корана с этим шрифтом. Веб — quranFontLoader.web.ts (WOFF Комплекса,
 * FontFace). Контракт одинаковый:
 *   загрузитьШрифтKfgqpc() → Promise<boolean> — один раз на запуск (повтор после неудачи — заново);
 *   шрифтKfgqpcГотов() → boolean — уже загружен (без ожидания).
 */
import { loadAsync } from 'expo-font';
import { ШРИФТ_KFGQPC } from '../quran/kfgqpcFont';

let готов = false;
let обещание: Promise<boolean> | null = null;

export function шрифтKfgqpcГотов(): boolean {
  return готов;
}

export function загрузитьШрифтKfgqpc(): Promise<boolean> {
  if (!обещание) {
    обещание = loadAsync({ [ШРИФТ_KFGQPC.семейство]: require('../assets/fonts/kfgqpc-hafs-3.0.ttf') })
      .then(() => (готов = true))
      .catch(() => {
        обещание = null;
        return false;
      });
  }
  return обещание;
}
