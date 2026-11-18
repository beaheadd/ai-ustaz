/**
 * Карточка — блок контента на поверхности.
 *
 * Контракт:
 *   <Карточка заголовок? приНажатии? акцент? стиль? testID?>…</Карточка>
 * - приНажатии: вся карточка — кнопка (accessibilityRole="button").
 * - акцент: мягкий зелёный фон (для пояснений и важных блоков).
 */
import type { ReactNode } from 'react';
import { Pressable, View, type StyleProp, type ViewStyle } from 'react-native';
import { useТема } from '../theme';
import { Текст } from './Text';

export type СвойстваКарточки = {
  children?: ReactNode;
  заголовок?: string;
  приНажатии?: () => void;
  акцент?: boolean;
  стиль?: StyleProp<ViewStyle>;
  testID?: string;
};

export function Карточка({ children, заголовок, приНажатии, акцент = false, стиль, testID }: СвойстваКарточки) {
  const { цвет, радиус, отступ } = useТема();
  const оформление: ViewStyle = {
    backgroundColor: акцент ? цвет.поверхностьАкцент : цвет.поверхность,
    borderRadius: радиус.l,
    borderWidth: 1,
    borderColor: цвет.граница,
    padding: отступ.l,
    gap: отступ.s,
  };
  const содержимое = (
    <>
      {заголовок ? <Текст вид="подзаголовок">{заголовок}</Текст> : null}
      {children}
    </>
  );
  if (приНажатии) {
    return (
      <Pressable
        accessibilityRole="button"
        onPress={приНажатии}
        testID={testID}
        style={({ pressed }) => [оформление, { opacity: pressed ? 0.85 : 1 }, стиль]}
      >
        {содержимое}
      </Pressable>
    );
  }
  return (
    <View testID={testID} style={[оформление, стиль]}>
      {содержимое}
    </View>
  );
}
