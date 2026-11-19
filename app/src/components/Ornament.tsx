/**
 * Орнамент — тонкая геометрия фоном (хатам, гирих, решётка машрабии) и полоса-разделитель.
 *
 * Контракт:
 *   <Орнамент вид?="хатам|гирих|решётка" цвет? прозрачность?={ОРНАМЕНТ.фон} масштаб?={1} контур? />
 *     — заполняет родителя (position: absolute, на всю площадь), нажатия пропускает, скрыт от диктора.
 *     Родитель задаёт размер и overflow: 'hidden'. контур — d замкнутого контура (например, арки):
 *     узор рисуется только внутри него (так Карточка «герой» кладёт узор в арку).
 *   <ОрнаментПолоса цвет? прозрачность?={ОРНАМЕНТ.полоса} высота?={12} testID? />
 *     — разделитель: линия, восьмиконечная звезда, ромбы; ширина — по родителю.
 * Правила (бриф §2.2): 4–6 % непрозрачности; только по краям, в шапке и пустых местах —
 * НЕ под временем намаза, мелким текстом и арабским текстом (падает контраст). Без надписей и Корана.
 * Цвет по умолчанию — акцент (на «герое» — светлый), полоса — золотоДекор.
 */
import { useId, useState } from 'react';
import { View, type LayoutChangeEvent } from 'react-native';
import { ClipPath, Defs, Path, Pattern, Rect, Svg } from './primitives/svg';
import { ПЛИТКИ, ПОЛОСА } from '../design/geometry';
import { ОРНАМЕНТ, useТема } from '../theme';

export type ВидОрнамента = keyof typeof ПЛИТКИ;

export type СвойстваОрнамента = {
  вид?: ВидОрнамента;
  цвет?: string;
  прозрачность?: number;
  масштаб?: number;
  /** Толщина линии в px. */
  толщина?: number;
  /** Замкнутый контур (d) в координатах родителя: узор только внутри. */
  контур?: string;
  testID?: string;
};

function чистыйИд(ид: string) {
  return ид.replace(/[^a-zA-Z0-9_-]/g, '');
}

export function Орнамент({ вид = 'хатам', цвет, прозрачность = ОРНАМЕНТ.фон, масштаб = 1, толщина = 1, контур, testID }: СвойстваОрнамента) {
  const тема = useТема();
  const ид = чистыйИд(useId());
  const плитка = ПЛИТКИ[вид];
  const размер = плитка.размер * масштаб;
  return (
    <View
      testID={testID}
      aria-hidden
      style={{ position: 'absolute', left: 0, top: 0, right: 0, bottom: 0, pointerEvents: 'none', opacity: прозрачность }}
    >
      <Svg width="100%" height="100%">
        <Defs>
          <Pattern id={`${ид}-узор`} patternUnits="userSpaceOnUse" width={размер} height={размер}>
            <Path
              d={плитка.d}
              transform={масштаб === 1 ? undefined : `scale(${масштаб})`}
              fill="none"
              stroke={цвет ?? тема.цвет.акцент}
              strokeWidth={толщина / масштаб}
              strokeLinejoin="round"
              strokeLinecap="round"
            />
          </Pattern>
          {контур ? (
            <ClipPath id={`${ид}-контур`}>
              <Path d={контур} />
            </ClipPath>
          ) : null}
        </Defs>
        <Rect x="0" y="0" width="100%" height="100%" fill={`url(#${ид}-узор)`} clipPath={контур ? `url(#${ид}-контур)` : undefined} />
      </Svg>
    </View>
  );
}

export type СвойстваПолосы = { цвет?: string; прозрачность?: number; высота?: number; testID?: string };

export function ОрнаментПолоса({ цвет, прозрачность = ОРНАМЕНТ.полоса, высота = 12, testID }: СвойстваПолосы) {
  const тема = useТема();
  const ид = чистыйИд(useId());
  const [ширина, установитьШирину] = useState(0);
  const м = высота / ПОЛОСА.высота;
  const шагШирины = ПОЛОСА.ширина * м;
  // Целое число плиток по ширине — по центру, чтобы звёзды не обрезались по краям.
  const плиток = Math.max(1, Math.floor(ширина / шагШирины));
  const сдвиг = (ширина - плиток * шагШирины) / 2;
  return (
    <View
      testID={testID}
      aria-hidden
      onLayout={(е: LayoutChangeEvent) => установитьШирину(е.nativeEvent.layout.width)}
      style={{ height: высота, alignSelf: 'stretch', opacity: прозрачность, pointerEvents: 'none' }}
    >
      {ширина > 0 ? (
        <Svg width={ширина} height={высота}>
          <Defs>
            <Pattern id={`${ид}-полоса`} patternUnits="userSpaceOnUse" x={сдвиг} width={шагШирины} height={высота}>
              <Path d={ПОЛОСА.d} transform={`scale(${м})`} fill="none" stroke={цвет ?? тема.цвет.золотоДекор} strokeWidth={1.25 / м} strokeLinejoin="round" strokeLinecap="round" />
            </Pattern>
          </Defs>
          <Rect x={сдвиг} y="0" width={плиток * шагШирины} height={высота} fill={`url(#${ид}-полоса)`} />
        </Svg>
      ) : null}
    </View>
  );
}
