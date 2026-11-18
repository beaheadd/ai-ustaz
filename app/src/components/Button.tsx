/**
 * Кнопка.
 *
 * Контракт:
 *   <Кнопка надпись="Начать" приНажатии={() => …}
 *           вид="основная|вторичная|тихая" отключена? крупная? значок? растянуть? подсказка? testID? />
 * - значок — короткий текст/символ (●, ▶, ■) или эмодзи без лиц; растровых картинок нет.
 * - растянуть (по умолчанию true) — на всю ширину колонки.
 * - Высота ≥ 48 px (удобно пальцем).
 */
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useТема } from '../theme';

export type ВидКнопки = 'основная' | 'вторичная' | 'тихая';

export type СвойстваКнопки = {
  надпись: string;
  приНажатии: () => void;
  вид?: ВидКнопки;
  отключена?: boolean;
  крупная?: boolean;
  значок?: string;
  растянуть?: boolean;
  /** accessibilityHint: что произойдёт после нажатия. */
  подсказка?: string;
  testID?: string;
};

export function Кнопка({
  надпись,
  приНажатии,
  вид = 'основная',
  отключена = false,
  крупная = false,
  значок,
  растянуть = true,
  подсказка,
  testID,
}: СвойстваКнопки) {
  const { цвет, радиус, шрифт, отступ } = useТема();
  const фон = вид === 'основная' ? цвет.акцент : вид === 'вторичная' ? цвет.акцентМягкий : 'transparent';
  const цветТекста = вид === 'основная' ? цвет.акцентТекст : цвет.акцент;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled: отключена }}
      accessibilityHint={подсказка}
      disabled={отключена}
      onPress={приНажатии}
      testID={testID}
      style={({ pressed }) => [
        стили.кнопка,
        {
          backgroundColor: фон,
          borderRadius: радиус.m,
          minHeight: крупная ? 60 : 48,
          paddingHorizontal: отступ.l,
          alignSelf: растянуть ? 'stretch' : 'flex-start',
          borderWidth: вид === 'тихая' ? 0 : 1,
          borderColor: вид === 'основная' ? цвет.акцент : цвет.граница,
          opacity: отключена ? 0.45 : pressed ? 0.8 : 1,
        },
      ]}
    >
      <View style={стили.ряд}>
        {значок ? (
          <Text style={[стили.значок, { color: цветТекста, fontSize: крупная ? шрифт.заголовок : шрифт.крупный }]}>{значок}</Text>
        ) : null}
        <Text
          style={{
            color: цветТекста,
            fontSize: крупная ? шрифт.крупный : шрифт.обычный,
            fontWeight: вид === 'тихая' ? '500' : '600',
            textAlign: 'center',
          }}
        >
          {надпись}
        </Text>
      </View>
    </Pressable>
  );
}

const стили = StyleSheet.create({
  кнопка: { justifyContent: 'center', alignItems: 'center', paddingVertical: 10 },
  ряд: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 },
  значок: { lineHeight: 26 },
});
