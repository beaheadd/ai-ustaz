/**
 * Переключатель языка интерфейса: «Русский / Қазақша / Oʻzbekcha / English».
 * Четыре языка (владелец 20.11.2026): в одну строку, если каждому сегменту хватает ≥ 84 px; уже — сеткой 2 × 2
 * (на 360 px и при крупном тексте «Oʻzbekcha» не помещается в четверть строки).
 *
 * Контракт: <ПереключательЯзыка первым? /> — меняет язык сразу и сохраняет его локально (прогресс).
 * первым — язык, который поставить первым (онбординг: язык браузера); остальные — в порядке ЯЗЫКИ.
 * Вид — как <Вкладки> (сегменты на утопленной дорожке), роль — radiogroup/radio с aria-checked (react-native-web
 * accessibilityState не переносит в DOM — только aria-*); сегмент ≥ 48 px; testID язык-ru, язык-kk, язык-uz, язык-en.
 */
import { useState } from 'react';
import { Pressable, View } from 'react-native';
import { ЯЗЫКИ, useПеревод, type Язык } from '../i18n';
import { useТема } from '../theme';
import { Текст } from './Text';

export function ПереключательЯзыка({ первым }: { первым?: Язык } = {}) {
  const { язык, установитьЯзык, t } = useПеревод();
  const { цвет, радиус, тень } = useТема();
  const [ширина, установитьШирину] = useState(0);
  // Сетка 2 × 2, когда четверти строки (минус отступы) меньше 84 px.
  const сетка = ширина > 0 && (ширина - 8 - 12) / ЯЗЫКИ.length < 84;
  return (
    <View
      accessibilityRole="radiogroup"
      accessibilityLabel={t('язык.заголовок')}
      onLayout={(е) => установитьШирину(е.nativeEvent.layout.width)}
      style={{ flexDirection: 'row', flexWrap: сетка ? 'wrap' : 'nowrap', padding: 4, gap: 4, borderRadius: радиус.m + 2, backgroundColor: цвет.поверхностьВторая }}
    >
      {(первым ? [...ЯЗЫКИ.filter((я) => я.код === первым), ...ЯЗЫКИ.filter((я) => я.код !== первым)] : ЯЗЫКИ).map(({ код, название }) => {
        const выбран = код === язык;
        return (
          <Pressable
            key={код}
            accessibilityRole="radio"
            aria-checked={выбран}
            onPress={() => установитьЯзык(код)}
            testID={'язык-' + код}
            style={[
              { flexGrow: 1, flexShrink: 1, flexBasis: сетка ? '45%' : 0, minHeight: 48, justifyContent: 'center', alignItems: 'center', borderRadius: радиус.m - 2, backgroundColor: выбран ? цвет.выбрано : 'transparent' },
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
