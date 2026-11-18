/**
 * Экран: шапка (кнопка «назад» + заголовок), плашка прототипа, прокручиваемое содержимое,
 * необязательный закреплённый низ. На десктопе — колонка по центру (ШИРИНА_КОЛОНКИ).
 *
 * Контракт:
 *   <Экран заголовок="Урок 3" плашка="урок|общая|нет" назад? справа? низ? прокрутка? testID?>
 *     …содержимое…
 *   </Экран>
 * - назад: показывать ли «назад» (по умолчанию — если в стеке есть куда); вызывает useНавигация().назад().
 * - плашка: «урок» — ОБЯЗАТЕЛЬНО на каждом экране урока (черновик, проходит проверку устаза).
 * - низ: кнопки, прижатые к низу (например «Далее»).
 * - На вебе ставит document.title = «заголовок — AI Ustaz».
 */
import { useEffect, type ReactNode } from 'react';
import { Platform, Pressable, ScrollView, StatusBar, StyleSheet, Text, View } from 'react-native';
import { useНавигация } from '../engine/navigation';
import { useПеревод } from '../i18n';
import { ШИРИНА_КОЛОНКИ, useТема } from '../theme';
import { ПлашкаПрототипа, type ВидПлашки } from './PrototypeBanner';
import { Текст } from './Text';

export type СвойстваЭкрана = {
  заголовок: string;
  children?: ReactNode;
  плашка?: ВидПлашки | 'нет';
  назад?: boolean;
  справа?: ReactNode;
  низ?: ReactNode;
  прокрутка?: boolean;
  testID?: string;
};

export function Экран({ заголовок, children, плашка = 'нет', назад, справа, низ, прокрутка = true, testID }: СвойстваЭкрана) {
  const { цвет, отступ, шрифт } = useТема();
  const { t } = useПеревод();
  const навигация = useНавигация();
  const показатьНазад = назад ?? навигация.можноНазад;

  useEffect(() => {
    if (Platform.OS === 'web' && typeof document !== 'undefined') {
      document.title = заголовок === 'AI Ustaz' ? заголовок : `${заголовок} — AI Ustaz`;
    }
  }, [заголовок]);

  const содержимое = <View style={{ padding: отступ.l, gap: отступ.l }}>{children}</View>;

  return (
    <View testID={testID} style={[стили.фон, { backgroundColor: цвет.фон }]}>
      <View style={стили.колонка}>
        <View
          style={[
            стили.шапка,
            {
              borderBottomColor: цвет.граница,
              backgroundColor: цвет.фон,
              paddingTop: Platform.OS === 'android' ? (StatusBar.currentHeight ?? 0) : 0,
            },
          ]}
        >
          {показатьНазад ? (
            <View style={стили.слот}>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={t('общее.назад')}
                testID="кнопка-назад"
                onPress={навигация.назад}
                hitSlop={8}
                style={({ pressed }) => [стили.назад, { opacity: pressed ? 0.6 : 1 }]}
              >
                <Text style={{ color: цвет.акцент, fontSize: шрифт.заголовок, lineHeight: 28 }}>‹</Text>
                <Text style={{ color: цвет.акцент, fontSize: шрифт.обычный }}>{t('общее.назад')}</Text>
              </Pressable>
            </View>
          ) : null}
          <Текст вид="подзаголовок" numberOfLines={1} accessibilityRole="header" стиль={стили.заголовок}>
            {заголовок}
          </Текст>
          {справа ? <View style={[стили.слот, { alignItems: 'flex-end' }]}>{справа}</View> : null}
        </View>
        {плашка !== 'нет' ? <ПлашкаПрототипа вид={плашка} /> : null}
        {прокрутка ? (
          <ScrollView style={стили.тело} contentContainerStyle={{ paddingBottom: отступ.xxl }} keyboardShouldPersistTaps="handled">
            {содержимое}
          </ScrollView>
        ) : (
          <View style={стили.тело}>{содержимое}</View>
        )}
        {низ ? (
          <View style={[стили.низ, { borderTopColor: цвет.граница, padding: отступ.l, gap: отступ.s, backgroundColor: цвет.фон }]}>{низ}</View>
        ) : null}
      </View>
    </View>
  );
}

const стили = StyleSheet.create({
  фон: { flex: 1, alignItems: 'center' },
  колонка: { flex: 1, width: '100%', maxWidth: ШИРИНА_КОЛОНКИ },
  шапка: { flexDirection: 'row', alignItems: 'center', minHeight: 56, paddingHorizontal: 8, gap: 4, borderBottomWidth: StyleSheet.hairlineWidth },
  слот: { justifyContent: 'center' },
  назад: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingVertical: 8, paddingHorizontal: 6 },
  заголовок: { flex: 1, paddingHorizontal: 8 },
  тело: { flex: 1 },
  низ: { borderTopWidth: StyleSheet.hairlineWidth },
});
