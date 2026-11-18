/**
 * Аят крупно (Amiri Quran, справа налево) с подсветкой слов по индексу.
 *
 * Контракт:
 *   <АятСоСловами фрагмент={ФрагментКорана} подсвеченные={Map<номерСлова, idПримера>}
 *                 выбран={idПримера | null} приВыборе={(id) => …} подпись? testID? />
 * - Текст — ТОЛЬКО ФрагментКорана, уже проверенный по sha256 (data.ts). Он делится по пробелам
 *   (разбиение Tanzil), и куски выводятся подряд с теми же пробелами: склейка равна исходной
 *   строке, ничего не меняется и не нормализуется.
 * - Номер аята — отдельно от текста Корана (кружок справа), в сам текст ничего не вставляется.
 * - Подсвеченное слово — нажимаемое (на вебе — span с role="button"); выбор дублирует список
 *   примеров на экране, чтобы всё было доступно с клавиатуры.
 */
import { Platform, Text, View } from 'react-native';
import type { ФрагментКорана } from '../../content/types';
import { ШРИФТ_АРАБСКИЙ, useТема } from '../../theme';
import { Текст } from '../Text';
import { словаАята } from './data';

const ВЕБ_АТРИБУТЫ = (Platform.OS === 'web' ? { lang: 'ar', dir: 'rtl' } : {}) as object;
const КЕГЛЬ = 30;

export function АятСоСловами({
  фрагмент,
  подсвеченные,
  выбран,
  приВыборе,
  подпись,
  testID,
}: {
  фрагмент: ФрагментКорана;
  подсвеченные: Map<number, string>;
  выбран: string | null;
  приВыборе: (id: string) => void;
  подпись: (номерСлова: number) => string;
  testID?: string;
}) {
  const { цвет, отступ, радиус } = useТема();
  const слова = словаАята(фрагмент.текст);
  return (
    <View style={{ flexDirection: 'row-reverse', alignItems: 'flex-start', gap: отступ.s }} testID={testID}>
      <View
        accessibilityLabel={`${фрагмент.сура}:${фрагмент.аят}`}
        style={{
          minWidth: 34,
          height: 34,
          marginTop: 12,
          borderRadius: радиус.круг,
          borderWidth: 1,
          borderColor: цвет.граница,
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: цвет.поверхность,
        }}
      >
        <Текст вид="мелкий" стиль={{ color: цвет.текст }}>
          {String(фрагмент.аят)}
        </Текст>
      </View>
      <Text
        {...ВЕБ_АТРИБУТЫ}
        accessibilityLanguage="ar"
        selectable
        testID={testID ? testID + '-текст' : undefined}
        style={{
          flex: 1,
          fontFamily: ШРИФТ_АРАБСКИЙ,
          fontSize: КЕГЛЬ,
          lineHeight: Math.round(КЕГЛЬ * 2),
          color: цвет.арабский,
          textAlign: 'right',
          writingDirection: 'rtl',
        }}
      >
        {слова.map((слово, i) => {
          const номер = i + 1;
          const пробел = i < слова.length - 1 ? ' ' : '';
          const id = подсвеченные.get(номер);
          if (!id) return слово + пробел;
          const выбрано = id === выбран;
          return [
            <Text
              key={номер}
              accessibilityRole="button"
              accessibilityLabel={подпись(номер)}
              accessibilityState={{ selected: выбрано }}
              onPress={() => приВыборе(id)}
              testID={`слово-${фрагмент.сура}-${фрагмент.аят}-${номер}`}
              style={{
                backgroundColor: выбрано ? цвет.акцент : цвет.плашкаФон,
                color: выбрано ? цвет.акцентТекст : цвет.арабский,
                borderRadius: радиус.s,
                paddingHorizontal: 3,
                ...(Platform.OS === 'web' ? ({ cursor: 'pointer' } as object) : {}),
              }}
            >
              {слово}
            </Text>,
            пробел,
          ];
        })}
      </Text>
    </View>
  );
}
