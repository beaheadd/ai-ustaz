/**
 * «Размер арабского текста» Корана — ползунок 24…48 px (шаг 2, quran/fontSize.ts). Экран суры (⚙ → лист вида), «Ещё» →
 * «Настройки», «Прочитать и записать» (там — компактные А− / А+). Ревью 19.11.2026: регулятор нужен старшим.
 *
 * Решение владельца 28.11.2026 («Да, делай карточку „Продолжить чтение“ и ползунок шрифта!»; дизайн A + шкала C,
 * ИТОГ §4 «ползунок размера в листе „Вид чтения“»): вместо кнопок А− / А+ — ползунок с подписью значения и живым
 * образцом (аят 1:1 из файла Tanzil — не набран в коде, правило 1). Пока тянут — меняются образец и число; текст суры
 * перерисовывается, когда палец отпущен (событие change), — длинная сура на дешёвом телефоне не дёргается.
 *
 * Контракт: <РазмерАрабского вид?='строка'|'ползунок'|'кнопки' сам? testID? />
 *   сам — режим «Страницами»: кегль подбирает лист под экран, вместо ползунка — пояснение (testID размер-сам);
 *   строка   — подпись «Размер арабского текста», значение «Размер 28», ползунок (для «Ещё»; образца нет: шрифт Корана
 *              грузится только на экранах Корана);
 *   ползунок — то же и образец под ползунком (меню вида суры): образец ниже ползунка, чтобы ползунок не уезжал из-под
 *              пальца, пока растёт текст;
 *   кнопки   — только А− / А+ (шаг 4), ≥ 48×48, на краю шкалы отключены («Прочитать и записать»).
 *   Веб: <input type="range"> (роль slider, aria-valuenow/min/max, aria-valuetext «Размер 28»; клавиши ← → ↑ ↓, Home,
 *   End, PageUp/PageDown; касание и мышь — средствами браузера), высота области касания 44 px, бегунок 28 px, дорожка 4 px
 *   (незаполненная — цвет рамок элементов, ≥ 3:1), стиль —
 *   токены темы через CSS-переменные; в RTL (ar, ur) шкала зеркальна, как и вся строка. Нативно (Android/iOS) пока —
 *   кнопки А− / А+ (своего ползунка в RN нет; TODO при сборке приложений).
 * testID: размер-арабского, размер-ползунок (input), размер-значение, размер-образец, размер-меньше, размер-больше.
 * kk, uz — черновик для редактора-носителя; ar, tr, id, ur — src/i18n/locales/lang-*.json (черновик).
 */
import { createElement, useEffect, useRef, useState } from 'react';
import { Platform, Pressable, View } from 'react-native';
import { создатьСловарь, useНаправление, useСловарь } from '../../i18n';
import { useСура } from '../../quran/data';
import { МАКС_АРАБСКОГО, МИН_АРАБСКОГО, ШАГ_АРАБСКОГО, ступеньАрабского, установитьРазмерАрабского, useРазмерАрабского } from '../../quran/fontSize';
import { ШРИФТ_АРАБСКИЙ, useТема } from '../../theme';
import { Текст } from '../Text';
import { ТекстАята } from './AyahText';

const ВЕБ = Platform.OS === 'web';

const СЛОВАРЬ = создатьСловарь({
  ru: { подпись: 'Размер арабского текста', меньше: 'Мельче арабский текст', больше: 'Крупнее арабский текст', значение: 'Размер {к}', образец: 'Образец: аль-Фатиха, 1:1', сам: '«Страницами» размер подбирается под экран сам.' },
  kk: { подпись: 'Араб мәтінінің өлшемі', меньше: 'Араб мәтінін кішірейту', больше: 'Араб мәтінін үлкейту', значение: 'Өлшемі {к}', образец: 'Үлгі: Әл-Фатиха, 1:1', сам: '«Беттер бойынша» өлшем экранға өзі сай келеді.' },
  uz: { подпись: 'Arabcha matn oʻlchami', меньше: 'Arabcha matnni kichikroq qilish', больше: 'Arabcha matnni kattaroq qilish', значение: 'Oʻlcham {к}', образец: 'Namuna: Al-Fotiha, 1:1', сам: '«Sahifalab» rejimida oʻlcham ekranga oʻzi moslanadi.' },
  en: { подпись: 'Arabic text size', меньше: 'Smaller Arabic text', больше: 'Larger Arabic text', значение: 'Size {к}', образец: 'Sample: Al-Fatiha, 1:1', сам: 'In “Pages” the size fits the screen by itself.' },
}, 'components/quran/ArabicSize');

/** Стиль <input type="range"> под тему: дорожка 6 px (заполненная часть — акцент), бегунок 28 px, кольцо фокуса. */
const КЛАСС = 'aiu-razmer';
const CSS = `
.${КЛАСС}{-webkit-appearance:none;appearance:none;display:block;width:100%;height:44px;margin:0;padding:0;background:transparent;cursor:pointer;touch-action:pan-y}
.${КЛАСС}:focus{outline:none}
.${КЛАСС}::-webkit-slider-runnable-track{height:4px;border-radius:3px;background:linear-gradient(var(--napr),var(--zap) 0,var(--zap) var(--dolya),var(--dor) var(--dolya),var(--dor) 100%)}
.${КЛАСС}::-moz-range-track{height:4px;border-radius:3px;background:linear-gradient(var(--napr),var(--zap) 0,var(--zap) var(--dolya),var(--dor) var(--dolya),var(--dor) 100%)}
.${КЛАСС}::-webkit-slider-thumb{-webkit-appearance:none;appearance:none;width:28px;height:28px;margin-top:-12px;border-radius:50%;background:var(--beg);border:3px solid var(--zap);box-shadow:0 1px 3px rgba(0,0,0,.25)}
.${КЛАСС}::-moz-range-thumb{width:22px;height:22px;border-radius:50%;background:var(--beg);border:3px solid var(--zap);box-shadow:0 1px 3px rgba(0,0,0,.25)}
.${КЛАСС}:focus-visible::-webkit-slider-thumb{outline:3px solid var(--fok);outline-offset:2px}
.${КЛАСС}:focus-visible::-moz-range-thumb{outline:3px solid var(--fok);outline-offset:2px}
`;
let стильВставлен = false;
function вставитьСтиль() {
  if (стильВставлен || typeof document === 'undefined') return;
  стильВставлен = true;
  const э = document.createElement('style');
  э.setAttribute('data-aiu', 'razmer');
  э.textContent = CSS;
  document.head.appendChild(э);
}

export function РазмерАрабского({ вид = 'строка', сам = false, testID = 'размер-арабского' }: { вид?: 'строка' | 'ползунок' | 'кнопки'; сам?: boolean; testID?: string }) {
  const т = useСловарь(СЛОВАРЬ);
  const { цвет, отступ, радиус } = useТема();
  const р = useРазмерАрабского();
  // Значение, пока тянут (образец и число — сразу; сохраняется по отпусканию).
  const [тянут, установитьТянут] = useState<number | null>(null);
  const показ = тянут ?? р.кегль;

  const кнопка = (знак: string, подпись: string, можно: boolean, нажать: () => void, id: string, размерБуквы: number) => (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={подпись}
      accessibilityState={{ disabled: !можно }}
      aria-disabled={!можно}
      disabled={!можно}
      onPress={нажать}
      testID={id}
      style={({ pressed }) => ({
        minWidth: 48,
        height: 48,
        paddingHorizontal: отступ.s,
        borderRadius: радиус.m,
        borderWidth: 1,
        borderColor: цвет.границаЭлемента,
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: pressed ? цвет.акцентМягкий : цвет.поверхность,
        opacity: можно ? 1 : 0.4,
      })}
    >
      <Текст стиль={{ fontSize: размерБуквы, fontWeight: '700', color: цвет.акцент }}>{знак}</Текст>
    </Pressable>
  );
  const кнопки = (
    <View style={{ flexDirection: 'row', gap: отступ.s, alignItems: 'center' }}>
      {кнопка('А−', т('меньше'), р.можноМеньше, р.меньше, 'размер-меньше', 15)}
      {кнопка('А+', т('больше'), р.можноБольше, р.больше, 'размер-больше', 19)}
    </View>
  );
  if (вид === 'кнопки') {
    return (
      <View testID={testID} accessibilityLabel={т('подпись')} {...({ role: 'group' } as object)}>
        {кнопки}
      </View>
    );
  }

  // «Страницами» кегль подбирает сам лист (screens/quran/MushafPages.tsx) — ползунок там ничего бы не менял.
  if (сам) {
    return (
      <View testID={testID} style={{ alignSelf: 'stretch', gap: 2 }}>
        <Текст вид="мелкий">{т('подпись')}</Текст>
        <Текст вид="второй" testID="размер-сам">
          {т('сам')}
        </Текст>
      </View>
    );
  }
  return (
    <View testID={testID} style={{ alignSelf: 'stretch', gap: отступ.xs }}>
      <View style={{ flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between', gap: отступ.s, flexWrap: 'wrap' }}>
        <Текст вид="мелкий">
          {т('подпись')}
        </Текст>
        <Текст вид="метка" цвет={цвет.акцент} табличные testID="размер-значение" aria-hidden>
          {т('значение', { к: показ })}
        </Текст>
      </View>
      {ВЕБ ? <Ползунок значение={показ} приДвижении={установитьТянут} приОтпускании={(к) => { установитьТянут(null); установитьРазмерАрабского(к); }} подпись={т('подпись')} текстЗначения={т('значение', { к: показ })} /> : кнопки}
      {вид === 'ползунок' ? <Образец кегль={показ} подпись={т('образец')} /> : null}
    </View>
  );
}

/** Веб-ползунок: [ب мелко] <input type=range> [ب крупно]; буквы — подсказка направления (aria-hidden). */
function Ползунок({ значение, приДвижении, приОтпускании, подпись, текстЗначения }: { значение: number; приДвижении: (к: number) => void; приОтпускании: (к: number) => void; подпись: string; текстЗначения: string }) {
  const { цвет, отступ } = useТема();
  const rtl = useНаправление() === 'rtl';
  const узел = useRef<HTMLInputElement | null>(null);
  const отпустить = useRef(приОтпускании);
  отпустить.current = приОтпускании;
  useEffect(вставитьСтиль, []);
  // change — когда отпустили палец или мышь (и на каждый шаг клавиш): тогда и сохраняем.
  useEffect(() => {
    const э = узел.current;
    if (!э) return;
    const ф = () => отпустить.current(ступеньАрабского(Number(э.value)));
    э.addEventListener('change', ф);
    return () => э.removeEventListener('change', ф);
  }, []);
  const доля = ((значение - МИН_АРАБСКОГО) / (МАКС_АРАБСКОГО - МИН_АРАБСКОГО)) * 100;
  const буква = (кегль: number) => (
    <Текст aria-hidden стиль={{ fontFamily: ШРИФТ_АРАБСКИЙ, fontSize: кегль, lineHeight: 44, color: цвет.текстВторой, width: 28, textAlign: 'center' }}>
      ب
    </Текст>
  );
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: отступ.s }}>
      {буква(16)}
      <View style={{ flex: 1, minWidth: 0 }}>
        {createElement('input', {
          ref: узел,
          type: 'range',
          className: КЛАСС,
          min: МИН_АРАБСКОГО,
          max: МАКС_АРАБСКОГО,
          step: ШАГ_АРАБСКОГО,
          value: значение,
          dir: rtl ? 'rtl' : 'ltr',
          'aria-label': подпись,
          'aria-valuetext': текстЗначения,
          'data-testid': 'размер-ползунок',
          onChange: (е: { currentTarget: HTMLInputElement }) => приДвижении(ступеньАрабского(Number(е.currentTarget.value))),
          style: {
            '--zap': цвет.акцент,
            // Незаполненная часть дорожки — цвет рамок элементов (≥ 3:1 к фону, WCAG 1.4.11; в тёмной иначе не видна).
            '--dor': цвет.границаЭлемента,
            '--beg': цвет.поверхность,
            '--fok': цвет.фокус,
            '--dolya': доля + '%',
            '--napr': rtl ? 'to left' : 'to right',
          },
        })}
      </View>
      {буква(28)}
    </View>
  );
}

/** Живой образец: аят 1:1 (бисмилла аль-Фатихи) из файла Tanzil, кеглем ползунка. Пока сура не загружена — пусто. */
function Образец({ кегль, подпись }: { кегль: number; подпись: string }) {
  const { цвет, отступ, радиус } = useТема();
  const фатиха = useСура(1);
  const текст = фатиха.состояние === 'есть' ? фатиха.данные.аяты[0]?.текст : null;
  return (
    <View
      testID="размер-образец"
      accessibilityLabel={подпись}
      style={{ paddingHorizontal: отступ.m, paddingVertical: отступ.xs, borderRadius: радиус.m, backgroundColor: цвет.поверхность, borderWidth: 1, borderColor: цвет.граница, minHeight: 56, justifyContent: 'center' }}
    >
      {текст ? <ТекстАята текст={текст} кегль={кегль} выравнивание="center" testID="размер-образец-текст" /> : null}
    </View>
  );
}
