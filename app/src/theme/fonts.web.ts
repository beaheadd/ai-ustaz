/**
 * Шрифты AI Ustaz — веб. Контракт — в fonts.ts (тот же набор экспортов).
 *
 * Inter 400/600 — подмножество woff2 (≈ 23 КБ каждое, tools/fonts/subset_ui_font.py), лежит в бандле:
 * Metro кладёт файл в dist/assets/inter-400.<md5>.woff2 (запросы только на свой адрес, CSP font-src 'self').
 * font-display: swap — текст не прячется, пока Inter грузится (сначала системный шрифт).
 * ШРИФТЫ_ПРИЛОЖЕНИЯ: Amiri Quran — последним (почему — в fonts.ts).
 * ШРИФТ_ИНТЕРФЕЙСА — стек: Inter, затем системный (react-native-web раскрывает «System»).
 */
import { AmiriQuran_400Regular } from '@expo-google-fonts/amiri-quran/400Regular';
import { FontDisplay, type FontFamilyDefinition } from 'expo-font';

export const ШРИФТ_АРАБСКИЙ = 'AmiriQuran';
export const СЕМЕЙСТВО_ИНТЕРФЕЙСА = 'AiUstazInter';
export const ШРИФТ_ИНТЕРФЕЙСА = `${СЕМЕЙСТВО_ИНТЕРФЕЙСА}, System`;
/** Урду (владелец 28.11.2026): системный насталик, затем насх — своих шрифтов не добавляем (бюджет; Noto Nastaliq Urdu
 * есть в Android 9+ и iOS 11+, Urdu Typesetting — в Windows). Inter первым — латиница и цифры как во всём приложении. */
export const ШРИФТ_УРДУ = `${СЕМЕЙСТВО_ИНТЕРФЕЙСА}, "Noto Nastaliq Urdu", "Jameel Noori Nastaleeq", "Urdu Typesetting", "Noto Naskh Arabic", "Geeza Pro", Tahoma, System`;
/** Насталик выше насха: межстрочный ×1,4 к шкале, чтобы надстрочные и подстрочные знаки не обрезались. */
export const МЕЖСТРОЧНЫЙ_УРДУ = 1.4;

export const ШРИФТЫ_ИНТЕРФЕЙСА: FontFamilyDefinition[] = [
  {
    fontFamily: СЕМЕЙСТВО_ИНТЕРФЕЙСА,
    fontDefinitions: [
      { path: require('../assets/fonts/inter-400.woff2'), weight: 400, style: 'normal', display: FontDisplay.SWAP },
      { path: require('../assets/fonts/inter-600.woff2'), weight: 600, style: 'normal', display: FontDisplay.SWAP },
    ],
  },
];

export const ШРИФТЫ_ПРИЛОЖЕНИЯ: FontFamilyDefinition[] = [
  ...ШРИФТЫ_ИНТЕРФЕЙСА,
  { fontFamily: ШРИФТ_АРАБСКИЙ, fontDefinitions: [{ path: AmiriQuran_400Regular }] },
];
