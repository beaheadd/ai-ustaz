/**
 * Циферблат киблы (SVG) и рисунок «восьмёрка» для калибровки — элементы экрана киблы.
 *
 * Контракт:
 *   <ЦиферблатКиблы кибла курс совпало? размер?={280} язык подпись testID? />
 *   - кибла — ° от истинного севера по часовой (направлениеКиблы);
 *   - курс — истинный курс верха экрана (компас) или null — схема «север вверху» с дугой угла от севера;
 *   - совпало — стрелка у отметки (≤ 5°): золотая обводка, отметка и мягкое сияние за нишей. Без звука и вибрации;
 *   - подпись — текст для диктора (циферблат — картинка; смысл дублирует текст под ним).
 *   <ВосьмёркаКалибровки размер?={56} /> — кривая «восьмёрка» со стрелкой (без руки и людей), декоративная.
 * Рисунок: роза ветров с 16 лучами, кольцо с бусинами-нуктами (орнамент), центр — звезда хатам;
 * стрелка киблы заканчивается нишей михраба, в нише — Кааба: простой куб с полосой кисвы,
 * без надписей и без людей (бриф §2.8, §6). Буквы сторон света держатся вертикально при повороте розы.
 * Цвета — только токены темы; SVG — через components/primitives/svg (веб — <svg> браузера).
 * Решение: экран киблы 19.11.2026 (задача владельца «время намаза и выбор киблы»).
 */
import { useId, useMemo } from 'react';
import { View } from 'react-native';
import { Текст } from '../components';
import { Circle, Defs, G, Path, RadialGradient, Stop, Svg } from '../components/primitives/svg';
import { useТема } from '../theme';
import { норм180, норм360 } from './qibla';

const Ц = 100; // центр в координатах viewBox 0 0 200 200
const точка = (r: number, θ: number): [number, number] => {
  const а = (θ * Math.PI) / 180;
  return [Ц + r * Math.sin(а), Ц - r * Math.cos(а)];
};
const ф = (x: number) => Math.round(x * 100) / 100;

/** Деления: стороны света, каждые 30° и каждые 5°. */
function путиДелений() {
  let стороны = '';
  let тридцать = '';
  let пять = '';
  for (let i = 0; i < 72; i++) {
    const θ = i * 5;
    const внутр = i % 18 === 0 ? 70 : i % 6 === 0 ? 75 : 79;
    const [x1, y1] = точка(внутр, θ);
    const [x2, y2] = точка(84, θ);
    const d = `M${ф(x1)} ${ф(y1)}L${ф(x2)} ${ф(y2)}`;
    if (i % 18 === 0) стороны += d;
    else if (i % 6 === 0) тридцать += d;
    else пять += d;
  }
  return { стороны, тридцать, пять };
}

/** Роза ветров: 16 лучей (стороны 40, диагонали 32, промежуточные 23), впадины на 8. */
function путьРозы() {
  let d = '';
  for (let i = 0; i < 16; i++) {
    const θ = i * 22.5;
    const r = i % 4 === 0 ? 40 : i % 2 === 0 ? 32 : 23;
    const [x, y] = точка(r, θ);
    const [вx, вy] = точка(8, θ + 11.25);
    d += `${i === 0 ? 'M' : 'L'}${ф(x)} ${ф(y)}L${ф(вx)} ${ф(вy)}`;
  }
  return d + 'Z';
}

/** Бусины-нукты (ромбы) на кольце орнамента. */
function путьБусин(r: number) {
  let d = '';
  for (let i = 0; i < 16; i++) {
    const θ = i * 22.5 + 11.25;
    const [x, y] = точка(r, θ);
    const [ax, ay] = точка(r + 2.4, θ);
    const [bx, by] = точка(r - 2.4, θ);
    const [лx, лy] = точка(1.5, θ - 90);
    const [пx, пy] = точка(1.5, θ + 90);
    const сдв = (px: number, py: number) => `${ф(px)} ${ф(py)}`;
    d += `M${сдв(ax, ay)}L${сдв(x + лx - Ц, y + лy - Ц)}L${сдв(bx, by)}L${сдв(x + пx - Ц, y + пy - Ц)}Z`;
  }
  return d;
}

/** Дуга от севера по часовой до угла θ на радиусе r. */
function путьДуги(r: number, θ: number) {
  const к = норм360(θ);
  if (к < 0.5) return '';
  const [x0, y0] = точка(r, 0);
  const [x1, y1] = точка(r, к);
  return `M${ф(x0)} ${ф(y0)}A${r} ${r} 0 ${к > 180 ? 1 : 0} 1 ${ф(x1)} ${ф(y1)}`;
}

// Стрелка киблы (нарисована вверх, поворачивается на угол киблы): игла → ниша михраба → Кааба.
const ИГЛА = 'M100 54L103.6 93L100 99L96.4 93Z';
const НИША = 'M90 54V41C90 35.6 94.6 32 100 28C105.4 32 110 35.6 110 41V54Z';
const КААБА_ВЕРХ = 'M100 36.6L106.25 39.8L100 43L93.75 39.8Z';
const КААБА_ЛЕВО = 'M93.75 39.8L100 43V51.5L93.75 48.3Z';
const КААБА_ПРАВО = 'M100 43L106.25 39.8V48.3L100 51.5Z';
const КИСВА = 'M93.75 41.6L100 44.8V46.6L93.75 43.4ZM100 44.8L106.25 41.6V43.4L100 46.6Z';
// Центр — восьмиконечная звезда хатам (два квадрата).
const ХАТАМ = 'M92 92H108V108H92ZM100 88.7L111.3 100L100 111.3L88.7 100Z';
// Неподвижная отметка «верх телефона».
const ОТМЕТКА = 'M100 13L95 4H105Z';

const СТОРОНЫ: Record<'ru' | 'kk', readonly [string, string, string, string]> = {
  ru: ['С', 'В', 'Ю', 'З'],
  kk: ['С', 'Ш', 'О', 'Б'], // солтүстік, шығыс, оңтүстік, батыс — черновик для редактора-носителя
};

export type СвойстваЦиферблата = {
  кибла: number;
  курс: number | null;
  совпало?: boolean;
  размер?: number;
  язык: 'ru' | 'kk';
  подпись: string;
  testID?: string;
};

export function ЦиферблатКиблы({ кибла, курс, совпало = false, размер = 280, язык, подпись, testID }: СвойстваЦиферблата) {
  const { цвет, тёмная } = useТема();
  const ид = useId().replace(/[^a-zA-Z0-9_-]/g, '');
  const деления = useMemo(путиДелений, []);
  const роза = useMemo(путьРозы, []);
  const бусины = useMemo(() => путьБусин(44), []);
  const поворотРозы = курс === null ? 0 : -курс;
  const масштаб = размер / 200;
  const золото = совпало ? цвет.золотоЗначок : цвет.граница;
  // Кааба: тёмный куб (кисва чёрная) в обеих темах; в тёмной теме — с золотым контуром, чтобы читался на тёмном.
  const каабаЛево = тёмная ? цвет.поверхностьВторая : цвет.текст;
  const каабаПраво = тёмная ? цвет.фон : цвет.арабский;
  const каабаВерх = тёмная ? цвет.тихо : цвет.текстВторой;
  const каабаКонтур = тёмная ? цвет.золотоДекор : цвет.текст;

  return (
    <View
      testID={testID}
      accessible
      accessibilityRole="image"
      accessibilityLabel={подпись}
      style={{ width: размер, height: размер, alignSelf: 'center' }}
    >
      <Svg width={размер} height={размер} viewBox="0 0 200 200">
        <Defs>
          <RadialGradient id={`${ид}-сияние`} cx="100" cy="42" r="26" gradientUnits="userSpaceOnUse">
            <Stop offset="0" stopColor={цвет.сияние} stopOpacity={0.6} />
            <Stop offset="1" stopColor={цвет.сияние} stopOpacity={0} />
          </RadialGradient>
        </Defs>
        {/* Пластина и тонкая золотая линия по внутреннему краю */}
        <Circle cx={Ц} cy={Ц} r={88} fill={цвет.поверхность} stroke={золото} strokeWidth={совпало ? 2.5 : 1} />
        <Circle cx={Ц} cy={Ц} r={86} fill="none" stroke={цвет.золотоДекор} strokeWidth={0.6} opacity={0.55} />
        <G transform={`rotate(${ф(поворотРозы)} ${Ц} ${Ц})`}>
          <Path d={деления.пять} stroke={цвет.текстВторой} strokeWidth={0.9} strokeLinecap="round" opacity={0.55} />
          <Path d={деления.тридцать} stroke={цвет.текстВторой} strokeWidth={1.3} strokeLinecap="round" />
          <Path d={деления.стороны} stroke={цвет.текст} strokeWidth={1.9} strokeLinecap="round" />
          <Path d={роза} fill={цвет.поверхностьАкцент} stroke={цвет.граница} strokeWidth={0.7} strokeLinejoin="round" />
          <Circle cx={Ц} cy={Ц} r={44} fill="none" stroke={цвет.граница} strokeWidth={0.8} />
          <Path d={бусины} fill={цвет.золотоДекор} opacity={0.85} />
          {курс === null ? <Path d={путьДуги(44, кибла)} fill="none" stroke={цвет.акцент} strokeWidth={2.4} strokeLinecap="round" opacity={0.8} /> : null}
          <G transform={`rotate(${ф(норм360(кибла))} ${Ц} ${Ц})`}>
            {совпало ? <Circle cx={100} cy={42} r={26} fill={`url(#${ид}-сияние)`} /> : null}
            <Path d={ИГЛА} fill={цвет.акцент} />
            <Path d={НИША} fill={цвет.поверхность} stroke={цвет.акцент} strokeWidth={1.6} strokeLinejoin="round" />
            <Path d={КААБА_ЛЕВО} fill={каабаЛево} stroke={каабаКонтур} strokeWidth={0.5} strokeLinejoin="round" />
            <Path d={КААБА_ПРАВО} fill={каабаПраво} stroke={каабаКонтур} strokeWidth={0.5} strokeLinejoin="round" />
            <Path d={КААБА_ВЕРХ} fill={каабаВерх} stroke={каабаКонтур} strokeWidth={0.5} strokeLinejoin="round" />
            <Path d={КИСВА} fill={цвет.золотоЗначок} />
          </G>
          <Path d={ХАТАМ} fill={цвет.поверхность} stroke={цвет.золотоДекор} strokeWidth={1.1} strokeLinejoin="round" />
          <Circle cx={Ц} cy={Ц} r={2.2} fill={цвет.золотоДекор} />
        </G>
        {курс !== null ? <Path d={ОТМЕТКА} fill={совпало ? цвет.золотоЗначок : цвет.акцент} /> : null}
      </Svg>
      {СТОРОНЫ[язык].map((буква, i) => {
        const азимут = i * 90;
        const [x, y] = точка(58, азимут + поворотРозы);
        // буква в стороне киблы прячется под нишей — делаем её бледной
        const подНишей = Math.abs(норм180(азимут - кибла)) < 14;
        return (
          <View
            key={буква + i}
            style={{ pointerEvents: 'none', position: 'absolute', left: x * масштаб - 12, top: y * масштаб - 10, width: 24, height: 20, alignItems: 'center', justifyContent: 'center', opacity: подНишей ? 0.25 : 1 }}
          >
            <Текст вид="метка" цвет={i === 0 ? цвет.акцент : цвет.текстВторой} стиль={{ textAlign: 'center' }}>
              {буква}
            </Текст>
          </View>
        );
      })}
    </View>
  );
}

/** «Восьмёрка» для калибровки компаса: кривая и стрелка, без руки. */
export function ВосьмёркаКалибровки({ размер = 56 }: { размер?: number }) {
  const { цвет } = useТема();
  return (
    <View accessibilityElementsHidden importantForAccessibility="no-hide-descendants" style={{ width: размер, height: размер / 2 }}>
      <Svg width={размер} height={размер / 2} viewBox="0 0 48 24">
        <Path d="M24 12C24 4.5 6 4.5 6 12C6 19.5 24 19.5 24 12C24 4.5 42 4.5 42 12C42 19.5 24 19.5 24 12Z" fill="none" stroke={цвет.акцент} strokeWidth={1.6} strokeLinejoin="round" />
        <Path d="M3.6 9.4L6 12.4L8.4 9.4" fill="none" stroke={цвет.акцент} strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round" />
      </Svg>
    </View>
  );
}
