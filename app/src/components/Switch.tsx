/**
 * СтрокаПереключателя — строка настройки с переключателем «вкл/выкл» (уведомления о времени намаза, 20.11.2026).
 *
 * Контракт:
 *   <СтрокаПереключателя заголовок подпись? значение? включено приСмене(новое) отключена? значок? вид?="карточка|плоская" testID? />
 * - Вся строка — одна цель касания (≥ 56 px): role="switch", aria-checked, подпись для диктора = заголовок (+ подпись).
 * - Дорожка 44×26 с ползунком: включено — акцент, ползунок справа; выключено — поверхностьВторая с рамкой, слева.
 *   Цвет — не единственный носитель смысла: положение ползунка и aria-checked.
 * - значение — короткий текст справа перед переключателем («14:39»), табличные цифры.
 * - отключена — серым, не нажимается (например, последний выбранный намаз нельзя выключить).
 * Без анимации (бриф §9: слабые телефоны; «уменьшить движение»).
 */
import { Pressable, View } from 'react-native';
import { useТема } from '../theme';
import { Значок, этоЗначок } from './Icon';
import { Текст } from './Text';

export type СвойстваСтрокиПереключателя = {
  заголовок: string;
  подпись?: string;
  значение?: string;
  включено: boolean;
  приСмене: (новое: boolean) => void;
  отключена?: boolean;
  значок?: string;
  вид?: 'карточка' | 'плоская';
  testID?: string;
};

export function СтрокаПереключателя({ заголовок, подпись, значение, включено, приСмене, отключена = false, значок, вид = 'плоская', testID }: СвойстваСтрокиПереключателя) {
  const { цвет, отступ, радиус } = useТема();
  const карточка = вид === 'карточка';
  return (
    <Pressable
      role="switch"
      aria-checked={включено}
      aria-disabled={отключена || undefined}
      aria-label={подпись ? `${заголовок}. ${подпись}` : заголовок}
      disabled={отключена}
      onPress={() => приСмене(!включено)}
      testID={testID}
      style={({ pressed }) => ({
        minHeight: 56,
        flexDirection: 'row',
        alignItems: 'center',
        gap: отступ.m,
        paddingVertical: отступ.s,
        paddingHorizontal: карточка ? отступ.l : 0,
        borderRadius: карточка ? радиус.l : 0,
        borderWidth: карточка ? 1 : 0,
        borderBottomWidth: 1,
        borderColor: цвет.граница,
        backgroundColor: карточка ? цвет.поверхность : 'transparent',
        opacity: отключена ? 0.55 : pressed ? 0.85 : 1,
      })}
    >
      {значок ? (
        <View aria-hidden style={{ width: 40, height: 40, borderRadius: радиус.m, alignItems: 'center', justifyContent: 'center', backgroundColor: цвет.поверхностьАкцент }}>
          {этоЗначок(значок) ? <Значок имя={значок} размер={20} цвет={цвет.акцент} /> : <Текст>{значок}</Текст>}
        </View>
      ) : null}
      <View aria-hidden style={{ flex: 1, gap: 2 }}>
        <Текст>{заголовок}</Текст>
        {подпись ? <Текст вид="мелкий">{подпись}</Текст> : null}
      </View>
      {значение ? (
        <Текст aria-hidden табличные цвет={цвет.текстВторой}>
          {значение}
        </Текст>
      ) : null}
      <View
        aria-hidden
        style={{
          width: 44,
          height: 26,
          borderRadius: радиус.круг,
          padding: 2,
          borderWidth: 1,
          borderColor: включено ? цвет.акцент : цвет.границаЭлемента,
          backgroundColor: включено ? цвет.акцент : цвет.поверхностьВторая,
          alignItems: включено ? 'flex-end' : 'flex-start',
          justifyContent: 'center',
        }}
      >
        <View style={{ width: 20, height: 20, borderRadius: 10, backgroundColor: включено ? цвет.акцентТекст : цвет.текстВторой }} />
      </View>
    </Pressable>
  );
}
