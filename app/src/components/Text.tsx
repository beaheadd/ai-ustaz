/**
 * Текст интерфейса (не арабский — для него АрабскийТекст).
 *
 * Контракт: <Текст вид="обычный|второй|заголовок|подзаголовок|мелкий" стиль={...}>…</Текст>
 * Остальные свойства — как у Text из react-native (accessibilityRole, testID, numberOfLines…).
 */
import type { ReactNode } from 'react';
import { Text, type StyleProp, type TextProps, type TextStyle } from 'react-native';
import { useТема } from '../theme';

export type ВидТекста = 'обычный' | 'второй' | 'заголовок' | 'подзаголовок' | 'мелкий';

export type СвойстваТекста = Omit<TextProps, 'style'> & {
  вид?: ВидТекста;
  стиль?: StyleProp<TextStyle>;
  children?: ReactNode;
};

export function Текст({ вид = 'обычный', стиль, children, ...остальное }: СвойстваТекста) {
  const { цвет, шрифт } = useТема();
  const вид_: TextStyle =
    вид === 'заголовок'
      ? { fontSize: шрифт.большой, lineHeight: 36, fontWeight: '700', color: цвет.текст }
      : вид === 'подзаголовок'
        ? { fontSize: шрифт.крупный, lineHeight: 26, fontWeight: '600', color: цвет.текст }
        : вид === 'второй'
          ? { fontSize: шрифт.обычный, lineHeight: 23, color: цвет.текстВторой }
          : вид === 'мелкий'
            ? { fontSize: шрифт.мелкий, lineHeight: 19, color: цвет.текстВторой }
            : { fontSize: шрифт.обычный, lineHeight: 24, color: цвет.текст };
  return (
    <Text
      {...остальное}
      accessibilityRole={остальное.accessibilityRole ?? (вид === 'заголовок' ? 'header' : undefined)}
      style={[вид_, стиль]}
    >
      {children}
    </Text>
  );
}

