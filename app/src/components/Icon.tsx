/**
 * Значок — линейная иконка из набора AI Ustaz (design/icons.ts), react-native-svg.
 *
 * Контракт:
 *   <Значок имя="кибла" размер?={24} цвет? толщина?={1.75} подпись? testID? />
 * - имя: ИмяЗначка (время, кибла, компас, кааба, город, геолокация, фаджр, восход, зухр, аср, магриб, иша,
 *   солнце, луна, урок, карта, коран, хатам, нукта, главная, таджвид, хадис, ещё, микрофон, аудио, видео, играть, пауза, стоп, повтор,
 *   удалить, назад, вперёд, вниз, вверх, меню, закрыть, галочка, инфо, настройки, язык, тема, поиск, замок,
 *   внешняя, календарь, поделиться, наЭкранДомой, точкиВертикально, копировать, телефон, установить).
 *   Полный список — ИМЕНА_ЗНАЧКОВ.
 * - цвет: по умолчанию цвет.текст текущей поверхности (на «герое» — светлый).
 * - толщина — в единицах сетки 24 (при размере 24 это пиксели).
 * - подпись: если задана — значок «картинка» с этим названием для экранного диктора;
 *   без подписи значок декоративный и скрыт от диктора (aria-hidden — понимают и react-native-web, и RN ≥ 0.71;
 *   смысл несёт текст рядом).
 * Правила: без лиц и людей; звезда «хатам» — геометрия, не оценка и не награда.
 */
import { View, type StyleProp, type ViewStyle } from 'react-native';
import { Circle, Path, Svg } from './primitives/svg';
import { ЗНАЧКИ, type ИмяЗначка, type ФигураЗначка } from '../design/icons';
import { useТема } from '../theme';

export type { ИмяЗначка } from '../design/icons';
export { ИМЕНА_ЗНАЧКОВ, ЗНАЧКИ_НАМАЗА, этоЗначок } from '../design/icons';

export type СвойстваЗначка = {
  имя: ИмяЗначка;
  размер?: number;
  цвет?: string;
  толщина?: number;
  подпись?: string;
  стиль?: StyleProp<ViewStyle>;
  testID?: string;
};

export function Значок({ имя, размер = 24, цвет, толщина = 1.75, подпись, стиль, testID }: СвойстваЗначка) {
  const тема = useТема();
  const c = цвет ?? тема.цвет.текст;
  const фигуры: readonly ФигураЗначка[] = ЗНАЧКИ[имя] ?? [];
  const доступность = подпись
    ? { accessible: true, accessibilityRole: 'image' as const, accessibilityLabel: подпись }
    : { 'aria-hidden': true as const };
  return (
    <View testID={testID} {...доступность} style={[{ width: размер, height: размер, pointerEvents: 'none' }, стиль]}>
      <Svg width={размер} height={размер} viewBox="0 0 24 24">
        {фигуры.map((ф, i) => {
          const общее = ф.заливка
            ? { fill: c, stroke: c, strokeWidth: толщина * 0.5, strokeLinejoin: 'round' as const }
            : { fill: 'none', stroke: c, strokeWidth: толщина, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const };
          if (ф.круг) {
            const [cx, cy, r] = ф.круг;
            return <Circle key={i} cx={cx} cy={cy} r={r} {...общее} />;
          }
          return <Path key={i} d={ф.d ?? ''} {...общее} />;
        })}
      </Svg>
    </View>
  );
}
