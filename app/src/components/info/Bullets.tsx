/**
 * Список с точками (для коротких пунктов «что есть / чего нет»).
 *
 * Контракт: <Пункты пункты={string[]} вид? testID? /> — пункт может содержать арабские вставки.
 */
import { View } from 'react-native';
import { useТема } from '../../theme';
import { Текст, type ВидТекста } from '../Text';
import { СмешанныйТекст } from './MixedText';

export function Пункты({ пункты, вид = 'обычный', значок = '•', testID }: { пункты: string[]; вид?: ВидТекста; значок?: string; testID?: string }) {
  const { отступ } = useТема();
  return (
    <View style={{ gap: отступ.s }} testID={testID}>
      {пункты.map((пункт, i) => (
        <View key={i} style={{ flexDirection: 'row', gap: отступ.s }}>
          <Текст вид={вид} accessibilityElementsHidden importantForAccessibility="no">
            {значок}
          </Текст>
          <СмешанныйТекст вид={вид} стиль={{ flex: 1 }}>
            {пункт}
          </СмешанныйТекст>
        </View>
      ))}
    </View>
  );
}
