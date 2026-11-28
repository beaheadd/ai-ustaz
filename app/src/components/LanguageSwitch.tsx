/**
 * Переключатель языка интерфейса: «Русский / Қазақша / Oʻzbekcha / English / العربية / Türkçe / Bahasa Indonesia / اردو».
 * Восемь языков (владелец 20.11.2026 — четыре; 28.11.2026 — ещё ar, tr, id, ur): сетка 4 × 2, если каждому сегменту
 * хватает ≥ 84 px; уже — 2 × 4 (на 360 px «Bahasa Indonesia» не помещается в четверть строки). Названия — родные,
 * у каждого свой lang (браузер выбирает шрифт и направление названия).
 *
 * Контракт: <ПереключательЯзыка первым? /> — меняет язык сразу и сохраняет его локально (прогресс).
 * первым — язык, который поставить первым (онбординг: язык браузера); остальные — в порядке ЯЗЫКИ.
 * Вид — как <Вкладки> (сегменты на утопленной дорожке), роль — radiogroup/radio с aria-checked (react-native-web
 * accessibilityState не переносит в DOM — только aria-*); сегмент ≥ 48 px; testID язык-<код> (ru, kk, uz, en, ar, tr, id, ur).
 */
import { useState } from 'react';
import { Platform, Pressable, View } from 'react-native';
import { ЯЗЫКИ, ЯЗЫК_HTML, useПеревод, type Язык } from '../i18n';
import { useТема } from '../theme';
import { Текст } from './Text';

export function ПереключательЯзыка({ первым }: { первым?: Язык } = {}) {
  const { язык, установитьЯзык, t } = useПеревод();
  const { цвет, радиус, тень } = useТема();
  const [ширина, установитьШирину] = useState(0);
  // Четыре в ряд, когда четверти строки (минус отступы) хватает на 84 px; иначе — по два.
  const вРяд = ширина > 0 && (ширина - 8 - 12) / 4 >= 84 ? 4 : 2;
  return (
    <View
      accessibilityRole="radiogroup"
      accessibilityLabel={t('язык.заголовок')}
      onLayout={(е) => установитьШирину(е.nativeEvent.layout.width)}
      style={{ flexDirection: 'row', flexWrap: 'wrap', padding: 4, gap: 4, borderRadius: радиус.m + 2, backgroundColor: цвет.поверхностьВторая }}
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
              { flexGrow: 1, flexShrink: 1, flexBasis: вРяд === 4 ? '22%' : '45%', minHeight: 48, paddingHorizontal: 4, justifyContent: 'center', alignItems: 'center', borderRadius: радиус.m - 2, backgroundColor: выбран ? цвет.выбрано : 'transparent' },
              выбран ? тень(1) : null,
            ]}
          >
            <Текст
              вид="метка"
              цвет={выбран ? цвет.акцент : цвет.текстВторой}
              стиль={{ fontSize: 15, lineHeight: 20, textAlign: 'center' }}
              {...((Platform.OS === 'web' ? { lang: ЯЗЫК_HTML[код] } : {}) as object)}
            >
              {название}
            </Текст>
          </Pressable>
        );
      })}
    </View>
  );
}
