/**
 * Переключатель языка интерфейса: «Русский / Қазақша».
 *
 * Контракт: <ПереключательЯзыка /> — меняет язык сразу и сохраняет его локально (прогресс).
 * Вид — как <Вкладки> (сегменты на утопленной дорожке), роль — radiogroup/radio; testID язык-ru, язык-kk.
 */
import { Pressable, View } from 'react-native';
import { ЯЗЫКИ, useПеревод } from '../i18n';
import { useТема } from '../theme';
import { Текст } from './Text';

export function ПереключательЯзыка() {
  const { язык, установитьЯзык, t } = useПеревод();
  const { цвет, радиус, тень } = useТема();
  return (
    <View
      accessibilityRole="radiogroup"
      accessibilityLabel={t('язык.заголовок')}
      style={{ flexDirection: 'row', padding: 4, gap: 4, borderRadius: радиус.m + 2, backgroundColor: цвет.поверхностьВторая }}
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
            style={[
              { flex: 1, minHeight: 44, justifyContent: 'center', alignItems: 'center', borderRadius: радиус.m - 2, backgroundColor: выбран ? цвет.выбрано : 'transparent' },
              выбран ? тень(1) : null,
            ]}
          >
            <Текст вид="метка" цвет={выбран ? цвет.акцент : цвет.текстВторой} стиль={{ fontSize: 15, lineHeight: 20 }}>
              {название}
            </Текст>
          </Pressable>
        );
      })}
    </View>
  );
}
