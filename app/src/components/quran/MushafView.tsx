/**
 * Текст суры «как в мусхафе» — сплошным потоком, для видов «Страница мусхафа», «Мусхаф + цвета таджвида», «Ночной».
 *
 * Владелец 20.11.2026 (2-я правка, со снимками myQuran): «Сразу должен открываться Коран и дальше читаться … Мы не
 * должны даже показать, как делится страница … длинные — чтобы он листал вниз, а не следующая страница … Без никаких
 * лишних букв, просто сам Коран». Поэтому: НЕТ листания, рамки страницы, колонтитула «Джуз · хизб», номера страницы и
 * кнопок «Следующая/Предыдущая» — вся сура одной прокруткой (экран суры, SuraScreen, рисует окно аятов [с…по] и
 * дорисовывает порции сверху и снизу). Остался вид бумаги: кремовый (ночью — тёмный) фон, картуш с именем суры,
 * бисмилла по центру, текст с выключкой по ширине, конец аята — знак ۝ с арабским номером.
 *
 * Контракт:
 *   <ПотокМусхафа сура с по цвета ночь выбран играет выбрать />
 *     сура — СураКорана (useСура); с…по — окно аятов; при с === 1 — картуш и бисмилла (атрибут Tanzil).
 *     цвета — ЦветаСуры | null (useЦветаСуры); ночь — палитра НОЧЬ; выбран/играет — «с:а»; выбрать(«с:а» | null).
 *   useЦветаСуры(сура, нужно) → { цвета, безЦветов } — разметка quran/tajweed/NNN, сверенная с sha256 файла суры и
 *     длинами аятов; не совпало — безЦветов (текст без цветов, строку об этом показывает меню вида).
 *   ПАЛИТРЫ_МУСХАФА.{бумага,ночь} — фон, чернила, знак, выделение.
 * Правило 1 CLAUDE.md: каждый аят — <span data-ayah="с:а">, его текст без data-end побайтно = строке Tanzil
 *   (e2e-quran сверяет); номер конца аята — ОТДЕЛЬНЫЙ элемент data-end (user-select none, не часть строки Корана).
 *   Знак остановки не отрывается от слова (группы nowrap, как в <ТекстАята>). Кусок цвета — целая буква со знаками.
 * testID: мусхаф, мусхаф-сура-<н>, мусхаф-бисмилла-<н>, мусхаф-текст-<н>. Атрибуты: data-ayah, data-end, data-t (код).
 */
import { createElement, useEffect, useState, type ReactNode } from 'react';
import { Platform, Text, View, type TextStyle } from 'react-native';
import { создатьСловарь, useСловарь } from '../../i18n';
import { useИндексСур, type СураКорана } from '../../quran/data';
import { useРазмерАрабского } from '../../quran/fontSize';
import type { РазметкаСуры } from '../../quran/mushaf';
import { загрузитьРазметкуСуры } from '../../quran/mushafData';
import { кускиТекста, отрезкиВерны, разобратьРазметку, ЦВЕТА_ТАДЖВИДА, ФОН_НОЧИ, ФОН_СТРАНИЦЫ, ЧЕРНИЛА_НОЧИ, ЧЕРНИЛА_СТРАНИЦЫ, type Отрезок } from '../../quran/tajweed';
import { диапазоныГрупп } from '../../quran/text';
import { ШРИФТ_АРАБСКИЙ, useАрабскийШрифтГотов } from '../../theme';
import { Path, Svg } from '../primitives/svg';

const СЛОВАРЬ = создатьСловарь({
  ru: { конец: 'конец аята {а}' },
  kk: { конец: '{а}-аяттың соңы' },
  uz: { конец: '{а}-oyat oxiri' },
});

const ВЕБ = Platform.OS === 'web';
const ЦИФРЫ = '٠١٢٣٤٥٦٧٨٩';
export const арабскиеЦифры = (н: number) => String(н).replace(/\d/g, (ц) => ЦИФРЫ[Number(ц)]);

/** Палитры. Контраст чернил и цветов таджвида проверяет test-quran (≥ 3:1 для кегля ≥ 24). */
export const ПАЛИТРЫ_МУСХАФА = {
  бумага: { фон: ФОН_СТРАНИЦЫ, чернила: ЧЕРНИЛА_СТРАНИЦЫ, рамка: '#B8893B', рамка2: '#0F4C45', поле: '#F2E8CF', второй: '#5E5446', знак: '#8A6420', выделение: 'rgba(15, 76, 69, 0.13)' },
  ночь: { фон: ФОН_НОЧИ, чернила: ЧЕРНИЛА_НОЧИ, рамка: '#7A6438', рамка2: '#3E5E57', поле: '#211C15', второй: '#A89C84', знак: '#C9A86A', выделение: 'rgba(216, 201, 168, 0.14)' },
} as const;
export type ПалитраМусхафа = (typeof ПАЛИТРЫ_МУСХАФА)['бумага'] | (typeof ПАЛИТРЫ_МУСХАФА)['ночь'];

export type ЦветаСуры = { аяты: Отрезок[][]; бисмилла: Отрезок[] | null };
const проверенные = new Map<string, ЦветаСуры | null>();

/** Разметка годится к этому тексту: sha256 файла суры, длины, формат и границы букв. Иначе null — без цветов. */
function цветаСуры(с: СураКорана, р: РазметкаСуры, shaТекста: string): ЦветаСуры | null {
  const ключ = с.сура + ':' + р.sha256Текста + ':' + shaТекста;
  if (проверенные.has(ключ)) return проверенные.get(ключ) ?? null;
  let итог: ЦветаСуры | null = null;
  if (р.sha256Текста === shaТекста && р.длины.length === с.аяты.length) {
    const аяты: Отрезок[][] = [];
    for (let i = 0; i < с.аяты.length; i++) {
      const т = с.аяты[i].текст;
      const о = р.длины[i] === т.length ? разобратьРазметку(р.аяты[i]) : null;
      if (!о || !отрезкиВерны(т, о)) break;
      аяты.push(о);
    }
    const б = с.бисмилла && р.бисмилла !== null && р.длинаБисмиллы === с.бисмилла.length ? разобратьРазметку(р.бисмилла) : null;
    if (аяты.length === с.аяты.length) итог = { аяты, бисмилла: б && с.бисмилла && отрезкиВерны(с.бисмилла, б) ? б : null };
  }
  проверенные.set(ключ, итог);
  return итог;
}

/** Цвета таджвида суры (только когда нужно): { цвета, безЦветов }. Пока грузится — без цветов и без строки. */
export function useЦветаСуры(сура: СураКорана, нужно: boolean): { цвета: ЦветаСуры | null; безЦветов: boolean } {
  const индекс = useИндексСур();
  const sha = индекс.состояние === 'есть' ? (индекс.данные.суры[сура.сура - 1]?.sha256 ?? null) : null;
  const [итог, установитьИтог] = useState<{ ключ: string; цвета: ЦветаСуры | null } | null>(null);
  const ключ = нужно && sha ? сура.сура + ':' + sha : null;
  useEffect(() => {
    if (!ключ || !sha) return;
    let живой = true;
    void загрузитьРазметкуСуры(сура.сура).then((м) => {
      if (живой) установитьИтог({ ключ, цвета: м.ок ? цветаСуры(сура, м.данные, sha) : null });
    });
    return () => {
      живой = false;
    };
  }, [ключ]); // eslint-disable-line react-hooks/exhaustive-deps
  if (!ключ || итог?.ключ !== ключ) return { цвета: null, безЦветов: false };
  return { цвета: итог.цвета, безЦветов: итог.цвета === null };
}

/** Узел строки: на вебе — <span> (data-атрибуты, стиль), нативно — вложенный <Text>. */
function узел(ключ: string | number, свойства: Record<string, unknown>, стиль: Record<string, unknown> | null, дети: ReactNode[]): ReactNode {
  if (ВЕБ) return createElement('span', { key: ключ, ...свойства, style: стиль ?? undefined }, ...дети);
  return (
    <Text key={ключ} style={(стиль ?? undefined) as TextStyle}>
      {дети}
    </Text>
  );
}

/** Текст аята (или бисмиллы) — группы «слово + знаки остановки» nowrap, внутри — куски цвета таджвида. */
function детиАята(текст: string, отрезки: readonly Отрезок[] | null, цвета: Readonly<Record<string, string>> | null, конец: ReactNode | null): ReactNode[] {
  const группы = диапазоныГрупп(текст);
  const р: ReactNode[] = [];
  группы.forEach(([а, б], г) => {
    const куски = отрезки && цвета ? кускиТекста(текст, отрезки, а, б) : [{ текст: текст.slice(а, б), код: null }];
    const дети: ReactNode[] = куски.map((к, i) => (к.код && цвета ? узел(i, { 'data-t': к.код }, { color: цвета[к.код] }, [к.текст]) : к.текст));
    if (конец && г === группы.length - 1) дети.push(конец);
    р.push(узел('г' + г, { 'data-group': '' }, ВЕБ ? { whiteSpace: 'nowrap' } : null, дети));
    if (г < группы.length - 1) р.push(' ');
  });
  return р;
}

/** Заголовок суры в картуше: полоса с двойной линией и заострённые концы (своё SVG); имя — из атрибута XML Tanzil. */
export function КартушСуры({ имя, н, п }: { имя: string; н: number; п: ПалитраМусхафа }) {
  const конец = (зеркало: boolean) => (
    <Svg width={18} height={44} viewBox="0 0 18 44">
      <Path d={зеркало ? 'M18 2L4 22L18 42' : 'M0 2L14 22L0 42'} fill={п.поле} stroke={п.рамка} strokeWidth={1.5} />
      <Path d={зеркало ? 'M12 22L16 18L16 26Z' : 'M6 22L2 18L2 26Z'} fill={п.рамка2} />
    </Svg>
  );
  return (
    <View testID={'мусхаф-сура-' + н} style={{ flexDirection: 'row', alignItems: 'center', marginTop: 4 }}>
      {конец(true)}
      <View style={{ flex: 1, height: 44, borderTopWidth: 1.5, borderBottomWidth: 1.5, borderColor: п.рамка, backgroundColor: п.поле, alignItems: 'center', justifyContent: 'center' }}>
        <Text {...((ВЕБ ? { lang: 'ar', dir: 'rtl' } : {}) as object)} style={{ fontFamily: ШРИФТ_АРАБСКИЙ, fontSize: 24, lineHeight: 40, color: п === ПАЛИТРЫ_МУСХАФА.ночь ? п.чернила : п.рамка2 }}>
          {имя}
        </Text>
      </View>
      {конец(false)}
    </View>
  );
}

type СвойстваПотока = {
  сура: СураКорана;
  с: number;
  по: number;
  цвета: ЦветаСуры | null;
  ночь: boolean;
  выбран: string | null;
  играет: string | null;
  выбрать: (ключ: string | null) => void;
};

/** Аяты [с…по] одной суры: картуш и бисмилла (если с === 1) и текст сплошным потоком. */
export function ПотокМусхафа({ сура, с, по, цвета, ночь, выбран, играет, выбрать }: СвойстваПотока) {
  const т = useСловарь(СЛОВАРЬ);
  const { кегль } = useРазмерАрабского();
  const шрифтГотов = useАрабскийШрифтГотов();
  const п = ночь ? ПАЛИТРЫ_МУСХАФА.ночь : ПАЛИТРЫ_МУСХАФА.бумага;
  const палитра = цвета ? (ночь ? ЦВЕТА_ТАДЖВИДА.ночь : ЦВЕТА_ТАДЖВИДА.страница) : null;
  const межстрочный = Math.round(кегль * 1.9);
  // Сура 1 и начало 2-й — по центру, как в мусхафе; остальное — с выключкой по ширине (последняя строка — справа).
  const центр = сура.сура === 1;
  const абзац = (выравнивание: 'justify' | 'center') => ({
    margin: 0,
    fontFamily: ШРИФТ_АРАБСКИЙ,
    fontSize: кегль,
    lineHeight: межстрочный + 'px',
    color: п.чернила,
    textAlign: выравнивание,
    textAlignLast: выравнивание === 'center' ? 'center' : 'right',
    direction: 'rtl',
    opacity: шрифтГотов ? 1 : 0,
    overflowWrap: 'normal',
  });

  const аяты: ReactNode[] = [];
  for (let а = с; а <= по; а++) {
    const ключ = сура.сура + ':' + а;
    const конец = узел('к', { 'data-end': '', role: 'img', 'aria-label': т('конец', { а }) }, { color: п.знак, userSelect: 'none', WebkitUserSelect: 'none', marginInlineStart: '0.2em' }, ['۝' + арабскиеЦифры(а)]);
    const фон = ключ === выбран || ключ === играет ? п.выделение : undefined;
    аяты.push(
      узел(
        ключ,
        { 'data-ayah': ключ, ...(ключ === играет ? { 'aria-current': 'true' } : {}) },
        { backgroundColor: фон, borderRadius: 6, cursor: 'pointer', boxDecorationBreak: 'clone', WebkitBoxDecorationBreak: 'clone' },
        детиАята(сура.аяты[а - 1].текст, цвета?.аяты[а - 1] ?? null, палитра, конец),
      ),
    );
    if (а < по) аяты.push(' ');
  }

  const нажатие = (е: { target: unknown }) => {
    const э = (е.target as HTMLElement | null)?.closest?.('[data-ayah]');
    const к = э?.getAttribute('data-ayah') ?? null;
    if (к && String(globalThis.getSelection?.() ?? '').length === 0) выбрать(к === выбран ? null : к);
  };

  return (
    <View testID="мусхаф" style={{ gap: 4 }}>
      {с === 1 ? <КартушСуры имя={сура.имя} н={сура.сура} п={п} /> : null}
      {с === 1 && сура.бисмилла && ВЕБ
        ? createElement('p', { lang: 'ar', dir: 'rtl', 'data-testid': 'мусхаф-бисмилла-' + сура.сура, style: абзац('center') }, ...детиАята(сура.бисмилла, цвета?.бисмилла ?? null, палитра, null))
        : null}
      {ВЕБ ? (
        createElement('p', { lang: 'ar', dir: 'rtl', 'data-testid': 'мусхаф-текст-' + сура.сура, onClick: нажатие, style: абзац(центр ? 'center' : 'justify') }, ...аяты)
      ) : (
        <Text style={{ fontFamily: ШРИФТ_АРАБСКИЙ, fontSize: кегль, lineHeight: межстрочный, color: п.чернила, textAlign: центр ? 'center' : 'justify', writingDirection: 'rtl' }}>{аяты}</Text>
      )}
    </View>
  );
}
