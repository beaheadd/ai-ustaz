/**
 * ИллюстрацияРаздела — иллюстрации разделов (плитки главной, шапки «Учимся намазу» и «Закят»).
 *
 * Решение владельца 28.11.2026: дизайн A «Сад и бумага» — 10 иллюстраций одной системы (design/illustrations.ts):
 * дуотон на общей арке-михрабе, предметы без людей и лиц (правило 9); «Дуа» — раскрытые ладони-чаша, «Кибла» — Кааба
 * в компасе (без надписей), «AI Ustaz» — образ Устаза без лица (тот же силуэт, components/UstazFigure.tsx).
 * Прежние рисунки (27.11.2026: тасбих, ладони, книга, свиток, коврик, микрофон, мешочек) заменены: аудит дизайна
 * (P1-5) — разные стили, контур только у ладоней, красный коврик спорил с маддом таджвида.
 *
 * Контракт: <ИллюстрацияРаздела имя размер={48} арка?={true} testID? /> — inline SVG (primitives/svg: веб — <svg> браузера,
 *   натив — react-native-svg), viewBox 64×64, без растров и внешних файлов (check-dist п. 4). Цвета — из темы:
 *   ПАЛИТРА_ИЛЛЮСТРАЦИЙ.светлая / .тёмная (theme/tokens.ts) пропсами fill/stroke, не CSS-переменными.
 *   арка — фон-арка и её тонкая линия (на плитке главной); без арки — только предмет.
 *   Декоративная (aria-hidden): подпись даёт плитка. Рассчитана на 44–112 px; для 24 px — линейные значки (design/icons.ts).
 */
import { View } from 'react-native';
import { ИЛЛЮСТРАЦИИ, РОЛИ_ИЛЛЮСТРАЦИЙ, АРКА_ИЛЛЮСТРАЦИИ, type ИмяИллюстрации, type РольИллюстрации } from '../design/illustrations';
import { ПАЛИТРА_ИЛЛЮСТРАЦИЙ, useТема, type ПалитраИллюстраций } from '../theme';
import { Circle, Ellipse, Path, Rect, Svg } from './primitives/svg';

export type { ИмяИллюстрации } from '../design/illustrations';

const цветРоли = (п: ПалитраИллюстраций, р: РольИллюстрации | undefined) => (р ? п[РОЛИ_ИЛЛЮСТРАЦИЙ[р]] : 'none');

/** Фигуры иллюстрации (без арки) — общие для плиток и образа Устаза. */
export function ФигурыИллюстрации({ имя, п }: { имя: ИмяИллюстрации; п: ПалитраИллюстраций }) {
  return (
    <>
      {ИЛЛЮСТРАЦИИ[имя].map((ф, i) => {
        const общие = {
          fill: ф.об ? 'none' : цветРоли(п, ф.з),
          ...(ф.об ? { stroke: цветРоли(п, ф.об), strokeWidth: ф.ш ?? 1 } : null),
          ...(ф.о !== undefined ? { opacity: ф.о } : null),
          ...(ф.лк ? { strokeLinecap: ф.лк } : null),
          ...(ф.лс ? { strokeLinejoin: ф.лс } : null),
          ...(ф.пн ? { strokeDasharray: ф.пн } : null),
        };
        if (ф.т === 'p') return <Path key={i} d={ф.d} {...общие} />;
        if (ф.т === 'c') return <Circle key={i} cx={ф.cx} cy={ф.cy} r={ф.r} {...общие} />;
        if (ф.т === 'e') return <Ellipse key={i} cx={ф.cx} cy={ф.cy} rx={ф.rx} ry={ф.ry} {...общие} />;
        return <Rect key={i} x={ф.x} y={ф.y} width={ф.w} height={ф.h} rx={ф.rx} {...общие} />;
      })}
    </>
  );
}

export function ИллюстрацияРаздела({ имя, размер = 48, арка = true, testID }: { имя: ИмяИллюстрации; размер?: number; арка?: boolean; testID?: string }) {
  const { тёмная } = useТема();
  const п = тёмная ? ПАЛИТРА_ИЛЛЮСТРАЦИЙ.тёмная : ПАЛИТРА_ИЛЛЮСТРАЦИЙ.светлая;
  return (
    <View testID={testID} {...({ 'aria-hidden': true } as object)} importantForAccessibility="no-hide-descendants" style={{ width: размер, height: размер }}>
      <Svg width={размер} height={размер} viewBox="0 0 64 64">
        {арка ? (
          <>
            <Path d={АРКА_ИЛЛЮСТРАЦИИ.фон} fill={п.арка} />
            <Path d={АРКА_ИЛЛЮСТРАЦИИ.линия} fill="none" stroke={п.основа} strokeWidth={1} opacity={0.18} />
          </>
        ) : null}
        <ФигурыИллюстрации имя={имя} п={п} />
      </Svg>
    </View>
  );
}
