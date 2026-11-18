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
 * - Прокручивается вся ширина окна (на десктопе колесо мыши работает и над полями), а содержимое —
 *   колонка ШИРИНА_КОЛОНКИ по центру (contentContainerStyle). Шапка и низ — в той же колонке.
 * - useПрокрутка() → { вКонец() } — прокрутить содержимое экрана вниз (например, к обратной связи
 *   после ответа, чтобы она не пряталась под нижней панелью). Вне <Экран> — пустая функция.
 */
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, type ComponentRef, type ReactNode } from 'react';
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

type Прокрутка = { вКонец: () => void };
const КонтекстПрокрутки = createContext<Прокрутка>({ вКонец: () => {} });

/** Прокрутка содержимого текущего экрана (см. шапку). */
export function useПрокрутка(): Прокрутка {
  return useContext(КонтекстПрокрутки);
}

export function Экран({ заголовок, children, плашка = 'нет', назад, справа, низ, прокрутка: прокрутка_ = true, testID }: СвойстваЭкрана) {
  const { цвет, отступ, шрифт } = useТема();
  const { t } = useПеревод();
  const навигация = useНавигация();
  const показатьНазад = назад ?? навигация.можноНазад;

  useEffect(() => {
    if (Platform.OS === 'web' && typeof document !== 'undefined') {
      document.title = заголовок === 'AI Ustaz' ? заголовок : `${заголовок} — AI Ustaz`;
    }
  }, [заголовок]);

  const свиток = useRef<ComponentRef<typeof ScrollView>>(null);
  const вКонец = useCallback(() => {
    // После отрисовки нового блока (ответ, пояснение): ждём раскладку, потом едем вниз.
    setTimeout(() => свиток.current?.scrollToEnd({ animated: true }), 60);
  }, []);
  const прокрутка = useMemo(() => ({ вКонец }), [вКонец]);

  const содержимое = <View style={{ padding: отступ.l, gap: отступ.l }}>{children}</View>;

  return (
    <View testID={testID} style={[стили.фон, { backgroundColor: цвет.фон }]}>
      <View style={стили.колонкаВерх}>
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
      </View>
      <КонтекстПрокрутки.Provider value={прокрутка}>
        {прокрутка_ ? (
          <ScrollView
            ref={свиток}
            style={стили.тело}
            contentContainerStyle={[стили.колонкаСодержимого, { paddingBottom: отступ.xxl }]}
            keyboardShouldPersistTaps="handled"
          >
            {содержимое}
          </ScrollView>
        ) : (
          <View style={[стили.тело, стили.колонкаСодержимого]}>{содержимое}</View>
        )}
      </КонтекстПрокрутки.Provider>
      {низ ? (
        <View style={стили.колонкаВерх}>
          <View style={[стили.низ, { borderTopColor: цвет.граница, padding: отступ.l, gap: отступ.s, backgroundColor: цвет.фон }]}>{низ}</View>
        </View>
      ) : null}
    </View>
  );
}

const стили = StyleSheet.create({
  фон: { flex: 1, alignItems: 'center' },
  колонкаВерх: { width: '100%', maxWidth: ШИРИНА_КОЛОНКИ },
  колонкаСодержимого: { width: '100%', maxWidth: ШИРИНА_КОЛОНКИ, alignSelf: 'center' },
  шапка: { flexDirection: 'row', alignItems: 'center', minHeight: 56, paddingHorizontal: 8, gap: 4, borderBottomWidth: StyleSheet.hairlineWidth },
  слот: { justifyContent: 'center' },
  назад: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingVertical: 8, paddingHorizontal: 6 },
  заголовок: { flex: 1, paddingHorizontal: 8 },
  тело: { flex: 1, width: '100%' },
  низ: { borderTopWidth: StyleSheet.hairlineWidth },
});
