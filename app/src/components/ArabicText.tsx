/**
 * Арабский текст: шрифт Amiri Quran (OFL-1.1), справа налево, крупно.
 *
 * Контракт:
 *   <АрабскийТекст размер="малый|средний|крупный|огромный" выравнивание="center|right"
 *                  встроенный? цвет? выбираемый? testID?>
 *     {строка}
 *   </АрабскийТекст>
 * - Блочный (по умолчанию): отдельный абзац RTL внутри LTR-интерфейса.
 * - встроенный: внутри <Текст> русской/казахской строки (на вебе — <span dir="rtl" lang="ar">,
 *   браузер изолирует направление; нативно — writingDirection).
 * - Строку выводит как есть: ничего не нормализует и не меняет. Текст Корана передавать
 *   только из ФрагментКорана (content/types.ts) — дословно из Tanzil.
 * - Пока Amiri Quran не загружен (useАрабскийШрифтГотов), текст прозрачен и держит место: Коран и буквы не
 *   мелькают системным шрифтом (экраны больше не ждут шрифтов — App.tsx).
 */
import { Platform, Text, type StyleProp, type TextStyle } from 'react-native';
import { ШРИФТ_АРАБСКИЙ, useАрабскийШрифтГотов, useТема } from '../theme';

export type РазмерАрабского = 'малый' | 'средний' | 'крупный' | 'огромный';

const РАЗМЕРЫ: Record<РазмерАрабского, number> = { малый: 24, средний: 32, крупный: 46, огромный: 68 };
/** Amiri Quran высокий: огласовки сверху и снизу — межстрочный интервал щедрый. */
const МЕЖСТРОЧНЫЙ = 1.9;

export type СвойстваАрабского = {
  children: string;
  размер?: РазмерАрабского;
  выравнивание?: 'center' | 'right';
  встроенный?: boolean;
  цвет?: string;
  выбираемый?: boolean;
  testID?: string;
  стиль?: StyleProp<TextStyle>;
};

/** Атрибуты HTML для react-native-web (Text их поддерживает, в типах RN их нет). */
const ВЕБ_АТРИБУТЫ = (Platform.OS === 'web' ? { lang: 'ar', dir: 'rtl' } : {}) as object;

export function АрабскийТекст({
  children,
  размер = 'средний',
  выравнивание = 'center',
  встроенный = false,
  цвет,
  выбираемый = true,
  testID,
  стиль,
}: СвойстваАрабского) {
  const тема = useТема();
  const готов = useАрабскийШрифтГотов();
  const кегль = РАЗМЕРЫ[размер];
  const базовый: TextStyle = {
    fontFamily: ШРИФТ_АРАБСКИЙ,
    fontSize: кегль,
    color: цвет ?? тема.цвет.арабский,
    writingDirection: 'rtl',
  };
  const блочный: TextStyle = встроенный ? {} : { lineHeight: Math.round(кегль * МЕЖСТРОЧНЫЙ), textAlign: выравнивание };
  return (
    <Text
      {...ВЕБ_АТРИБУТЫ}
      accessibilityLanguage="ar"
      selectable={выбираемый}
      testID={testID}
      style={[базовый, блочный, стиль, готов ? null : { opacity: 0 }]}
    >
      {children}
    </Text>
  );
}
