/**
 * ПодсказкаУстановки — одна узкая строка на главной: «Поставить AI Ustaz на телефон» → #/install и «Скрыть» (×).
 *
 * Контракт: <ПодсказкаУстановки /> — сама решает, показываться ли (useПодсказкаУстановки, install/useInstall.ts):
 * только на aiustaz.pro, только на телефоне, пока приложение не установлено и строку не скрыли и не открыли экран
 * установки (одноразово, ключ aiustaz:install-hint.v1). На batr.kz, на компьютере и в тестах на 127.0.0.1 её нет.
 * Высота ≥ 48 px (цель касания), без анимации, без счётчиков и «наград». kk — черновик для редактора-носителя.
 * testID: главная-установка, главная-установка-открыть, главная-установка-скрыть.
 * Решение владельца 19.11.2026: установка на экран «Домой»; главная компактная — не больше одной узкой строки.
 */
import { Pressable, View } from 'react-native';
import { useНавигация } from '../engine/navigation';
import { создатьСловарь, useСловарь } from '../i18n';
import { useПодсказкаУстановки } from '../install/useInstall';
import { useТема } from '../theme';
import { Значок } from './Icon';
import { Текст } from './Text';

const СЛОВАРЬ = создатьСловарь({
  ru: { строка: 'Поставить AI Ustaz на телефон', скрыть: 'Скрыть подсказку об установке' },
  kk: { строка: 'AI Ustaz-ты телефонға орнату', скрыть: 'Орнату туралы кеңесті жасыру' },
});

export function ПодсказкаУстановки() {
  const т = useСловарь(СЛОВАРЬ);
  const { цвет, отступ, радиус } = useТема();
  const { перейти } = useНавигация();
  const { показать, скрыть } = useПодсказкаУстановки();
  if (!показать) return null;
  return (
    <View
      testID="главная-установка"
      style={{ flexDirection: 'row', alignItems: 'center', borderRadius: радиус.m, borderWidth: 1, borderColor: цвет.граница, backgroundColor: цвет.поверхность }}
    >
      <Pressable
        accessibilityRole="link"
        onPress={() => перейти('установка')}
        testID="главная-установка-открыть"
        style={({ pressed }) => ({
          flex: 1,
          minHeight: 48,
          flexDirection: 'row',
          alignItems: 'center',
          gap: отступ.s,
          paddingHorizontal: отступ.m,
          borderTopLeftRadius: радиус.m,
          borderBottomLeftRadius: радиус.m,
          backgroundColor: pressed ? цвет.акцентМягкий : 'transparent',
        })}
      >
        <Значок имя="телефон" размер={20} цвет={цвет.акцент} />
        <Текст вид="метка" цвет={цвет.акцент} стиль={{ flex: 1 }} numberOfLines={1}>
          {т('строка')}
        </Текст>
        <Значок имя="вперёд" размер={18} цвет={цвет.акцент} />
      </Pressable>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={т('скрыть')}
        onPress={скрыть}
        testID="главная-установка-скрыть"
        style={({ pressed }) => ({
          width: 48,
          minHeight: 48,
          alignItems: 'center',
          justifyContent: 'center',
          borderTopRightRadius: радиус.m,
          borderBottomRightRadius: радиус.m,
          backgroundColor: pressed ? цвет.акцентМягкий : 'transparent',
        })}
      >
        <Значок имя="закрыть" размер={18} цвет={цвет.текстВторой} />
      </Pressable>
    </View>
  );
}
