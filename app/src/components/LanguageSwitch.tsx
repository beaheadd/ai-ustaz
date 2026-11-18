/**
 * Переключатель языка интерфейса: «Русский / Қазақша».
 *
 * Контракт: <ПереключательЯзыка /> — меняет язык сразу и сохраняет его локально (прогресс).
 */
import { Pressable, Text, View } from 'react-native';
import { ЯЗЫКИ, useПеревод } from '../i18n';
import { useТема } from '../theme';

export function ПереключательЯзыка() {
  const { язык, установитьЯзык, t } = useПеревод();
  const { цвет, радиус, шрифт } = useТема();
  return (
    <View
      accessibilityRole="radiogroup"
      accessibilityLabel={t('язык.заголовок')}
      style={{ flexDirection: 'row', borderRadius: радиус.m, borderWidth: 1, borderColor: цвет.граница, overflow: 'hidden' }}
    >
      {ЯЗЫКИ.map(({ код, название }) => {
        const выбран = код === язык;
        return (
          <Pressable
            key={код}
            accessibilityRole="radio"
            accessibilityState={{ checked: выбран }}
            onPress={() => установитьЯзык(код)}
            testID={'язык-' + код}
            style={{ flex: 1, minHeight: 44, justifyContent: 'center', alignItems: 'center', backgroundColor: выбран ? цвет.акцент : цвет.поверхность }}
          >
            <Text style={{ color: выбран ? цвет.акцентТекст : цвет.текст, fontSize: шрифт.обычный, fontWeight: выбран ? '600' : '400' }}>{название}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}
