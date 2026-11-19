/**
 * Вкладки — переключатель из 2–4 вариантов (сегменты на утопленной дорожке).
 *
 * Контракт:
 *   <Вкладки вкладки={[{ ключ, надпись, значок?, testID? }]} выбрана="ключ" приВыборе={(ключ) => …}
 *            подпись? роль?="вкладки|выбор" testID? />
 * - Выбранная — светлая «таблетка» на дорожке, текст акцентом; остальные — текстВторой.
 * - Доступность: tablist / tab с aria-selected (react-native-web переносит в DOM только aria-*, не accessibilityState);
 *   роль="выбор" — radiogroup / radio с aria-checked (выбор настройки без панелей, например тема); подпись —
 *   название группы для диктора.
 * - Высота сегмента ≥ 48 px (дорожка — 56): цель касания по брифу. Без анимации переключения.
 * - значок — имя значка из набора (18 px) слева от надписи; надпись — до 2 строк по центру (на 320 px и при
 *   увеличенном шрифте не режется многоточием).
 * Пример: «Объяснение · Видео · Аудио» в уроке; «Как в системе · Светлая · Тёмная» в настройках темы.
 */
import { Pressable, View } from 'react-native';
import { useТема } from '../theme';
import { Значок, type ИмяЗначка } from './Icon';
import { Текст } from './Text';

export type Вкладка = { ключ: string; надпись: string; значок?: ИмяЗначка; testID?: string };

export type СвойстваВкладок = {
  вкладки: Вкладка[];
  выбрана: string;
  приВыборе: (ключ: string) => void;
  подпись?: string;
  роль?: 'вкладки' | 'выбор';
  testID?: string;
};

export function Вкладки({ вкладки, выбрана, приВыборе, подпись, роль = 'вкладки', testID }: СвойстваВкладок) {
  const выбор = роль === 'выбор';
  const { цвет, радиус, тень } = useТема();
  return (
    <View
      testID={testID}
      accessibilityRole={выбор ? 'radiogroup' : 'tablist'}
      accessibilityLabel={подпись}
      style={{ flexDirection: 'row', padding: 4, gap: 4, borderRadius: радиус.m + 2, backgroundColor: цвет.поверхностьВторая }}
    >
      {вкладки.map((в) => {
        const активна = в.ключ === выбрана;
        const цветТекста = активна ? цвет.акцент : цвет.текстВторой;
        return (
          <Pressable
            key={в.ключ}
            accessibilityRole={выбор ? 'radio' : 'tab'}
            {...(выбор ? { 'aria-checked': активна } : { 'aria-selected': активна })}
            onPress={() => приВыборе(в.ключ)}
            testID={в.testID}
            style={({ pressed }) => [
              {
                flex: 1,
                minHeight: 48,
                flexDirection: 'row',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 6,
                paddingHorizontal: 8,
                borderRadius: радиус.m - 2,
                backgroundColor: активна ? цвет.выбрано : 'transparent',
                opacity: pressed && !активна ? 0.7 : 1,
              },
              активна ? тень(1) : null,
            ]}
          >
            {в.значок ? <Значок имя={в.значок} размер={18} цвет={цветТекста} /> : null}
            <Текст вид="метка" цвет={цветТекста} стиль={{ fontSize: 15, lineHeight: 20, textAlign: 'center', flexShrink: 1 }} numberOfLines={2}>
              {в.надпись}
            </Текст>
          </Pressable>
        );
      })}
    </View>
  );
}
