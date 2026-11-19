/**
 * СлойДыхания — слой эмблемы, который «дышит» (только состояние «слушаю»). Нативная версия — Animated.
 * Веб — Breath.web.tsx (CSS-анимация через StyleSheet react-native-web: без модуля Animated, он тяжёлый).
 *
 * Контракт:
 *   <СлойДыхания вид="сияние|мерцание" активен={boolean} покой={{ непрозрачность, масштаб? }} размер>
 *     …svg…
 *   </СлойДыхания>
 * - вид: «сияние» — непрозрачность 0,4 ↔ 1 и масштаб 0,9 ↔ 1,06; «мерцание» — непрозрачность 0,55 ↔ 1;
 *   цикл ДВИЖЕНИЕ.дыхание (2,4 с), ease-in-out, без звука. Ниже порога вспышек WCAG 2.3.1.
 * - активен=false — статично, со значениями покой (при «уменьшить движение» вызывающий передаёт false).
 * - Слой абсолютный, квадрат размер×размер в левом верхнем углу родителя.
 */
import { useEffect, useRef, type ReactNode } from 'react';
import { Animated, Easing } from 'react-native';
import { ДВИЖЕНИЕ } from '../../theme/tokens';

export type СвойстваДыхания = {
  вид: 'сияние' | 'мерцание';
  активен: boolean;
  покой: { непрозрачность: number; масштаб?: number };
  размер: number;
  children?: ReactNode;
};

export function СлойДыхания({ вид, активен, покой, размер, children }: СвойстваДыхания) {
  const фаза = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    if (!активен) {
      фаза.stopAnimation();
      фаза.setValue(0);
      return;
    }
    const половина = ДВИЖЕНИЕ.дыхание / 2;
    const цикл = Animated.loop(
      Animated.sequence([
        Animated.timing(фаза, { toValue: 1, duration: половина, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
        Animated.timing(фаза, { toValue: 0, duration: половина, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
      ]),
    );
    цикл.start();
    return () => цикл.stop();
  }, [активен, фаза]);
  const непрозрачность = активен ? фаза.interpolate({ inputRange: [0, 1], outputRange: вид === 'сияние' ? [0.4, 1] : [0.55, 1] }) : покой.непрозрачность;
  const масштаб = активен && вид === 'сияние' ? фаза.interpolate({ inputRange: [0, 1], outputRange: [0.9, 1.06] }) : (покой.масштаб ?? 1);
  return (
    <Animated.View style={{ position: 'absolute', left: 0, top: 0, width: размер, height: размер, opacity: непрозрачность, transform: [{ scale: масштаб }] }}>
      {children}
    </Animated.View>
  );
}
