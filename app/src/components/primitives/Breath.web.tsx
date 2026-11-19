/**
 * СлойДыхания — веб: CSS-анимация (@keyframes через StyleSheet react-native-web), без модуля Animated.
 * Контракт — в Breath.tsx. Анимацию ведёт браузер (компоновщик), JS не будится каждый кадр.
 */
import type { ReactNode } from 'react';
import { StyleSheet, View, type ViewStyle } from 'react-native';
import { ДВИЖЕНИЕ } from '../../theme/tokens';

export type СвойстваДыхания = {
  вид: 'сияние' | 'мерцание';
  активен: boolean;
  покой: { непрозрачность: number; масштаб?: number };
  размер: number;
  children?: ReactNode;
};

const общее = {
  animationDuration: `${ДВИЖЕНИЕ.дыхание}ms`,
  animationIterationCount: 'infinite',
  animationTimingFunction: 'ease-in-out',
};

// animationKeyframes есть только в StyleSheet.create react-native-web (в типах RN его нет).
const стили = StyleSheet.create({
  сияние: {
    ...общее,
    animationKeyframes: [{ '0%': { opacity: 0.4, transform: 'scale(0.9)' }, '50%': { opacity: 1, transform: 'scale(1.06)' }, '100%': { opacity: 0.4, transform: 'scale(0.9)' } }],
  },
  мерцание: {
    ...общее,
    animationKeyframes: [{ '0%': { opacity: 0.55 }, '50%': { opacity: 1 }, '100%': { opacity: 0.55 } }],
  },
} as unknown as Record<'сияние' | 'мерцание', ViewStyle>);

export function СлойДыхания({ вид, активен, покой, размер, children }: СвойстваДыхания) {
  const основа: ViewStyle = { position: 'absolute', left: 0, top: 0, width: размер, height: размер };
  return (
    <View style={[основа, активен ? стили[вид] : { opacity: покой.непрозрачность, transform: [{ scale: покой.масштаб ?? 1 }] }]}>{children}</View>
  );
}
