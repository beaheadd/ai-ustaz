/**
 * «Размер арабского текста»: А− / А+ (5 ступеней 24…40, quran/fontSize.ts). Экран суры (шапка), «Прочитать и
 * записать» и «Ещё» → «Настройки». Выбор хранится только на устройстве. Ревью 19.11.2026.
 *
 * Контракт: <РазмерАрабского вид?='строка'|'кнопки' testID? />
 *   строка — подпись «Размер арабского текста · 28» и кнопки (для «Ещё»); кнопки — только А− / А+ (шапка суры).
 *   Кнопки ≥ 48×48, подписи для диктора «Мельче / Крупнее арабский текст»; на краю ступеней — отключены.
 * testID: размер-арабского, размер-меньше, размер-больше, размер-значение. kk — черновик для редактора-носителя.
 */
import { Pressable, View } from 'react-native';
import { создатьСловарь, useСловарь } from '../../i18n';
import { useРазмерАрабского } from '../../quran/fontSize';
import { useТема } from '../../theme';
import { Текст } from '../Text';

const СЛОВАРЬ = создатьСловарь({
  ru: { подпись: 'Размер арабского текста', меньше: 'Мельче арабский текст', больше: 'Крупнее арабский текст', значение: 'Размер {к}' },
  kk: { подпись: 'Араб мәтінінің өлшемі', меньше: 'Араб мәтінін кішірейту', больше: 'Араб мәтінін үлкейту', значение: 'Өлшемі {к}' },
});

export function РазмерАрабского({ вид = 'строка', testID = 'размер-арабского' }: { вид?: 'строка' | 'кнопки'; testID?: string }) {
  const т = useСловарь(СЛОВАРЬ);
  const { цвет, отступ, радиус } = useТема();
  const р = useРазмерАрабского();
  const кнопка = (знак: string, подпись: string, можно: boolean, нажать: () => void, id: string, размерБуквы: number) => (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={подпись}
      accessibilityState={{ disabled: !можно }}
      aria-disabled={!можно}
      disabled={!можно}
      onPress={нажать}
      testID={id}
      style={({ pressed }) => ({
        minWidth: 48,
        height: 48,
        paddingHorizontal: отступ.s,
        borderRadius: радиус.m,
        borderWidth: 1,
        borderColor: цвет.границаЭлемента,
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: pressed ? цвет.акцентМягкий : цвет.поверхность,
        opacity: можно ? 1 : 0.4,
      })}
    >
      <Текст стиль={{ fontSize: размерБуквы, fontWeight: '700', color: цвет.акцент }}>{знак}</Текст>
    </Pressable>
  );
  const кнопки = (
    <View style={{ flexDirection: 'row', gap: отступ.s, alignItems: 'center' }}>
      {кнопка('А−', т('меньше'), р.можноМеньше, р.меньше, 'размер-меньше', 15)}
      {кнопка('А+', т('больше'), р.можноБольше, р.больше, 'размер-больше', 19)}
    </View>
  );
  if (вид === 'кнопки') {
    return (
      <View testID={testID} accessibilityLabel={т('подпись')} {...({ role: 'group' } as object)}>
        {кнопки}
      </View>
    );
  }
  return (
    <View testID={testID} style={{ flexDirection: 'row', alignItems: 'center', gap: отступ.m, flexWrap: 'wrap' }}>
      <View style={{ flex: 1, minWidth: 160 }}>
        <Текст вид="мелкий">{т('подпись')}</Текст>
        <Текст вид="второй" табличные testID="размер-значение">
          {т('значение', { к: р.кегль })}
        </Текст>
      </View>
      {кнопки}
    </View>
  );
}
