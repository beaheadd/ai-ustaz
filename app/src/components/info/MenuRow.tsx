/**
 * Строка меню: значок (символ, без лиц), надпись, пояснение и «›». Высота ≥ 48 px.
 *
 * Контракт: <ПунктМеню надпись пояснение? значок? приНажатии раскрыт? testID? />
 *   раскрыт — для пунктов-раскрывашек (вместо «›» рисует «▾/▸», accessibilityState.expanded).
 */
import { Pressable, View } from 'react-native';
import { useТема } from '../../theme';
import { Текст } from '../Text';

export function ПунктМеню({
  надпись,
  пояснение,
  значок,
  приНажатии,
  раскрыт,
  testID,
}: {
  надпись: string;
  пояснение?: string;
  значок?: string;
  приНажатии: () => void;
  раскрыт?: boolean;
  testID?: string;
}) {
  const { цвет, отступ, радиус, шрифт } = useТема();
  const раскрывашка = раскрыт !== undefined;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={раскрывашка ? { expanded: раскрыт } : undefined}
      onPress={приНажатии}
      testID={testID}
      style={({ pressed }) => ({
        flexDirection: 'row',
        alignItems: 'center',
        gap: отступ.m,
        minHeight: 56,
        paddingVertical: отступ.s,
        paddingHorizontal: отступ.l,
        borderRadius: радиус.m,
        borderWidth: 1,
        borderColor: цвет.граница,
        backgroundColor: цвет.поверхность,
        opacity: pressed ? 0.8 : 1,
      })}
    >
      {значок ? (
        <Текст стиль={{ fontSize: шрифт.крупный, width: 26, textAlign: 'center', color: цвет.акцент }} accessibilityElementsHidden importantForAccessibility="no">
          {значок}
        </Текст>
      ) : null}
      <View style={{ flex: 1, gap: 2 }}>
        <Текст стиль={{ fontWeight: '600' }}>{надпись}</Текст>
        {пояснение ? <Текст вид="мелкий">{пояснение}</Текст> : null}
      </View>
      <Текст стиль={{ color: цвет.текстВторой, fontSize: шрифт.заголовок }} accessibilityElementsHidden importantForAccessibility="no">
        {раскрывашка ? (раскрыт ? '▾' : '▸') : '›'}
      </Текст>
    </Pressable>
  );
}
