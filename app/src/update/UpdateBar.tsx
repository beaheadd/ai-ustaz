/**
 * ПолосаОбновления — узкая полоса вверху приложения, над любым экраном: «Вышло обновление AI Ustaz» · «Обновить» · «×».
 *
 * Владелец 28.11.2026: «Каждый раз, когда выходит обновление, как на batr.kz выводи кнопку „Обновить“ на приложение,
 * чтобы не приходилось закрывать, заново заходить». Когда показывать и что делает кнопка — update/update.ts.
 * Стоит в App.tsx (Каркас) обычным элементом колонки над экраном — ничего не закрывает, нижнее меню на месте.
 * Оформление — как у баннера установки (components/InstallHint.tsx): поверхность, рамка акцентом, значок, «×».
 * Без анимации и счётчиков. kk, uz, en — черновик для редактора-носителя.
 * testID: обновление, обновление-обновить, обновление-скрыть.
 */
import { useEffect, useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { Значок } from '../components/Icon';
import { Текст, стильТекста } from '../components/Text';
import { создатьСловарь, useСловарь } from '../i18n';
import { useТема } from '../theme';
import { запуститьПроверку, обновитьПриложение, скрытьВерсию } from './update';

const СЛОВАРЬ = создатьСловарь({
  ru: { текст: 'Вышло обновление AI\u00A0Ustaz', обновить: 'Обновить', идёт: 'Обновляем…', подсказка: 'Откроется новая версия, ваши занятия сохранятся', скрыть: 'Скрыть до следующего обновления' },
  kk: { текст: 'AI\u00A0Ustaz жаңартылды', обновить: 'Жаңарту', идёт: 'Жаңартып жатырмыз…', подсказка: 'Жаңа нұсқа ашылады, сабақтарыңыз сақталады', скрыть: 'Келесі жаңартуға дейін жасыру' },
  uz: { текст: 'AI\u00A0Ustaz yangilandi', обновить: 'Yangilash', идёт: 'Yangilanmoqda…', подсказка: 'Yangi versiya ochiladi, darslaringiz saqlanadi', скрыть: 'Keyingi yangilanishgacha yashirish' },
  en: { текст: 'An AI\u00A0Ustaz update is out', обновить: 'Update', идёт: 'Updating…', подсказка: 'The new version opens; your progress is kept', скрыть: 'Hide until the next update' },
});

export function ПолосаОбновления() {
  const т = useСловарь(СЛОВАРЬ);
  const { цвет, отступ, радиус } = useТема();
  const [новая, установитьНовую] = useState<string | null>(null);
  const [идёт, установитьИдёт] = useState(false);
  useEffect(() => запуститьПроверку(установитьНовую), []);
  if (!новая) return null;

  const обновить = () => {
    if (идёт) return;
    установитьИдёт(true);
    void обновитьПриложение();
  };
  const скрыть = () => {
    скрытьВерсию(новая);
    установитьНовую(null);
  };

  return (
    <View
      testID="обновление"
      accessibilityRole="alert"
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        gap: отступ.s,
        marginHorizontal: отступ.s,
        marginTop: отступ.s,
        paddingLeft: отступ.m,
        paddingRight: отступ.xs,
        paddingVertical: 2,
        borderRadius: радиус.l,
        borderWidth: 1,
        borderColor: цвет.акцент,
        backgroundColor: цвет.поверхность,
      }}
    >
      <Значок имя="повтор" размер={20} цвет={цвет.акцент} />
      <Текст вид="метка" стиль={{ flex: 1 }}>
        {т('текст')}
      </Текст>
      {/* Узкая основная кнопка (Кнопка — от 48 px и с широкими полями; полоса должна быть тонкой): 40 px + hitSlop. */}
      <Pressable
        accessibilityRole="button"
        accessibilityHint={т('подсказка')}
        aria-disabled={идёт}
        disabled={идёт}
        onPress={обновить}
        testID="обновление-обновить"
        hitSlop={4}
        style={({ pressed }) => ({
          minHeight: 40,
          paddingHorizontal: отступ.m,
          borderRadius: радиус.m,
          justifyContent: 'center',
          backgroundColor: pressed ? цвет.акцентНажат : цвет.акцент,
          opacity: идёт ? 0.6 : 1,
        })}
      >
        <Text style={[стильТекста('метка'), { color: цвет.акцентТекст, fontSize: 15, lineHeight: 20 }]}>{т(идёт ? 'идёт' : 'обновить')}</Text>
      </Pressable>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={т('скрыть')}
        onPress={скрыть}
        testID="обновление-скрыть"
        hitSlop={4}
        style={({ pressed }) => ({
          width: 40,
          height: 40,
          borderRadius: 20,
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: pressed ? цвет.акцентМягкий : 'transparent',
        })}
      >
        <Значок имя="закрыть" размер={20} цвет={цвет.текстВторой} />
      </Pressable>
    </View>
  );
}
