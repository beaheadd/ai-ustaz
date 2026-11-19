/**
 * Шрифты AI Ustaz — нативная сборка (iOS/Android, ttf). Веб — fonts.web.ts (woff2, font-display: swap).
 *
 * Контракт (одинаковый с fonts.web.ts):
 *   ШРИФТ_АРАБСКИЙ — семейство Amiri Quran (OFL-1.1): Коран, учебные буквы и слоги (загружает App.tsx).
 *   СЕМЕЙСТВО_ИНТЕРФЕЙСА — имя семейства Inter (подмножество, OFL-1.1, tools/fonts/subset_ui_font.py).
 *   ШРИФТ_ИНТЕРФЕЙСА — значение fontFamily для текста интерфейса (на вебе — со стеком системных шрифтов).
 *   ШРИФТЫ_ИНТЕРФЕЙСА — описание для useFonts (два начертания: 400 и 600).
 *   ШРИФТЫ_ПРИЛОЖЕНИЯ — все шрифты одним списком для useFonts в App.tsx: Inter, затем Amiri Quran.
 *     Один вызов и Amiri последним — нарочно: на вебе каждое новое правило @font-face в общем
 *     <style> expo-font пересоздаёт прежние FontFace, и шрифт, загруженный раньше, снова «не загружен»
 *     (e2e проверяет, что Amiri Quran загружен до первого арабского текста).
 * Начертание выбирается fontWeight ('400' | '600'), семейство одно.
 */
import { AmiriQuran_400Regular } from '@expo-google-fonts/amiri-quran/400Regular';
import type { FontFamilyDefinition } from 'expo-font';

export const ШРИФТ_АРАБСКИЙ = 'AmiriQuran';
export const СЕМЕЙСТВО_ИНТЕРФЕЙСА = 'AiUstazInter';
export const ШРИФТ_ИНТЕРФЕЙСА = СЕМЕЙСТВО_ИНТЕРФЕЙСА;

export const ШРИФТЫ_ИНТЕРФЕЙСА: FontFamilyDefinition[] = [
  {
    fontFamily: СЕМЕЙСТВО_ИНТЕРФЕЙСА,
    fontDefinitions: [
      { path: require('../assets/fonts/inter-400.ttf'), weight: 400, style: 'normal' },
      { path: require('../assets/fonts/inter-600.ttf'), weight: 600, style: 'normal' },
    ],
  },
];

export const ШРИФТЫ_ПРИЛОЖЕНИЯ: FontFamilyDefinition[] = [
  ...ШРИФТЫ_ИНТЕРФЕЙСА,
  { fontFamily: ШРИФТ_АРАБСКИЙ, fontDefinitions: [{ path: AmiriQuran_400Regular }] },
];
