/**
 * Счётчик зикра (#/dhikr/item?n=<номер>) — во весь экран, без нижнего меню (routes.ts ПОЛНОЭКРАННЫЕ).
 *
 * Решение владельца 26.11.2026: «Добавь все эти зикры с переводом и с счётчиком, чтобы можно было нажать и считать как
 * второй скрин»; «Арабский, произношение на нашем языке и перевод также как здесь». Данные и счёт — src/dhikr/data.ts.
 *
 * Контракт: ПропсыЭкрана<'зикр'> ({ номер } — порядковый номер в наборе; такого нет — «Такого зикра нет» и «К списку»).
 * - Шапка: «Назад» (к списку), заголовок «Зикр», справа ⓘ (источник) и ⋯ (меню счёта).
 * - Строка «‹ n / N ›»: соседний зикр — кнопки и стрелки ← → клавиатуры; свайп влево/вправо по карточке. Переход
 *   меняет только параметр адреса (обновитьПараметры), без новой записи в истории: «Назад» ведёт к списку.
 * - Карточка (прокручивается, нажатия не считает): плашка «Черновик» (правило 11), название мелкими прописными,
 *   арабский (Коран — шрифтом Корана, хадис — обычным арабским), произношение на языке интерфейса (жирно), перевод,
 *   примечание. Аудио нет: записей кари для зикров нет, синтез арабского запрещён (правила 3, 7).
 * - Панель счёта (внизу, большая зона): полоса прогресса и цель справа, крупная цифра текущего круга, «всего» под ней.
 *   Нажатие (и пробел/Enter, когда фокус не на кнопке) — +1; короткая вибрация; круг дошёл до цели — вибрация
 *   [40, 60, 40] и отметка «Готово»; следующее нажатие начинает новый круг с 1. Без наград и рейтингов (правило 9).
 * - ⓘ: лист «Источник» — «Коран, 2:255» или «HadeethEnc № …, степень, кто передал»; плашка черновика.
 * - ⋯: лист «Счёт» — «Сбросить круг», «Сбросить всё по этому зикру», цель: 1, 3, 7, 10, 33, 99, 100 и «По умолчанию».
 * - Счёт — только на устройстве (localStorage «aiustaz:dhikr.v1»).
 * kk, uz, en — черновики для редактора-носителя.
 * testID: экран-зикр, зикр-источник-кнопка, зикр-меню-кнопка, зикр-пред, зикр-след, зикр-позиция, зикр-карточка,
 *   зикр-черновик, зикр-название, зикр-арабский, зикр-произношение, зикр-перевод, зикр-примечание, зикр-нажать,
 *   зикр-прогресс, зикр-цель, зикр-текущий, зикр-всего, зикр-готово, зикр-лист, зикр-лист-закрыть, зикр-источник,
 *   зикр-сбросить, зикр-сбросить-всё, зикр-цель-<n>, зикр-цель-по-умолчанию, зикр-нет, зикр-к-списку, зикр-загрузка.
 */
import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { Pressable, ScrollView, View, type GestureResponderEvent } from 'react-native';
import { Кнопка, Плашка, Значок, Текст, Экран } from '../components';
import { добавить, задатьЦель, сбросить, useЗикры, useСчётЗикров, цельЗикра, ЦЕЛИ, type Зикр } from '../dhikr/data';
import { useНавигация } from '../engine/navigation';
import type { ПропсыЭкрана } from '../engine/routes';
import { создатьСловарь, useПеревод, useСловарь } from '../i18n';
import { ШИРИНА_КОЛОНКИ, useТема } from '../theme';
import { АрабскийЗикра, ВЕБ, СЛОВАРЬ_ЗИКРОВ, ЗикрыНедоступны, подписьИсточника } from './dhikr/common';

const СЛОВАРЬ = создатьСловарь({
  ru: {
    источник: 'Источник',
    меню: 'Счёт',
    пред: 'Предыдущий зикр',
    след: 'Следующий зикр',
    позиция: '{n} / {N}',
    нажать: 'Считать: нажмите, чтобы добавить один раз',
    цель: 'Цель: {цель}',
    всего: 'Всего: {всего}',
    готово: 'Готово: {цель} раз',
    закрыть: 'Закрыть',
    сбросить: 'Сбросить круг',
    сброситьВсё: 'Сбросить всё по этому зикру',
    цели: 'Сколько раз',
    поУмолчанию: 'По умолчанию ({раз})',
    нет: 'Такого зикра нет.',
    кСписку: 'К списку зикров',
    примечаниеИсточника: 'Арабский текст — дословно из источника. Произношение и перевод — черновик, их проверяет устаз.',
  },
  kk: {
    источник: 'Дереккөз',
    меню: 'Санақ',
    пред: 'Алдыңғы зікір',
    след: 'Келесі зікір',
    позиция: '{n} / {N}',
    нажать: 'Санау: бір рет қосу үшін басыңыз',
    цель: 'Мақсат: {цель}',
    всего: 'Барлығы: {всего}',
    готово: 'Дайын: {цель} рет',
    закрыть: 'Жабу',
    сбросить: 'Айналымды нөлдеу',
    сброситьВсё: 'Осы зікір бойынша бәрін нөлдеу',
    цели: 'Неше рет',
    поУмолчанию: 'Әдепкі ({раз})',
    нет: 'Мұндай зікір жоқ.',
    кСписку: 'Зікірлер тізіміне',
    примечаниеИсточника: 'Арабша мәтін — дереккөзден сөзбе-сөз. Оқылуы мен аудармасы — жоба, оларды ұстаз тексереді.',
  },
  uz: {
    источник: 'Manba',
    меню: 'Hisob',
    пред: 'Oldingi zikr',
    след: 'Keyingi zikr',
    позиция: '{n} / {N}',
    нажать: 'Sanash: bir marta qoʻshish uchun bosing',
    цель: 'Maqsad: {цель}',
    всего: 'Jami: {всего}',
    готово: 'Tayyor: {цель} marta',
    закрыть: 'Yopish',
    сбросить: 'Aylanani nolga tushirish',
    сброситьВсё: 'Bu zikr boʻyicha hammasini nolga tushirish',
    цели: 'Necha marta',
    поУмолчанию: 'Odatiy ({раз})',
    нет: 'Bunday zikr yoʻq.',
    кСписку: 'Zikrlar roʻyxatiga',
    примечаниеИсточника: 'Arabcha matn — manbadan soʻzma-soʻz. Oʻqilishi va tarjimasi — qoralama, ularni ustoz tekshiradi.',
  },
  en: {
    источник: 'Source',
    меню: 'Count',
    пред: 'Previous dhikr',
    след: 'Next dhikr',
    позиция: '{n} / {N}',
    нажать: 'Count: tap to add one',
    цель: 'Goal: {цель}',
    всего: 'Total: {всего}',
    готово: 'Done: {цель} times',
    закрыть: 'Close',
    сбросить: 'Reset this round',
    сброситьВсё: 'Reset everything for this dhikr',
    цели: 'How many times',
    поУмолчанию: 'Default ({раз})',
    нет: 'There is no such dhikr.',
    кСписку: 'To the dhikr list',
    примечаниеИсточника: 'The Arabic text is word for word from the source. Pronunciation and translation are a draft reviewed by an ustaz.',
  },
});

/** Короткая вибрация, где она есть (телефон с Android в браузере); без неё — тихо. */
function вибрация(узор: number | number[]) {
  try {
    (globalThis.navigator as Navigator | undefined)?.vibrate?.(узор);
  } catch {
    // нет вибрации — ничего
  }
}

/** Круглая кнопка шапки и строки навигации (≥ 48 px). */
function КнопкаЗначок({ значок, подпись, приНажатии, отключена, testID, развёрнута }: { значок: string; подпись: string; приНажатии: () => void; отключена?: boolean; testID: string; развёрнута?: boolean }) {
  const { цвет } = useТема();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={подпись}
      accessibilityState={{ disabled: !!отключена, ...(развёрнута !== undefined ? { expanded: развёрнута } : null) }}
      disabled={отключена}
      onPress={приНажатии}
      testID={testID}
      hitSlop={4}
      style={({ pressed }) => ({ width: 48, height: 48, borderRadius: 24, alignItems: 'center', justifyContent: 'center', opacity: отключена ? 0.35 : 1, backgroundColor: pressed ? цвет.акцентМягкий : 'transparent' })}
    >
      <Значок имя={значок as never} размер={24} цвет={цвет.акцент} />
    </Pressable>
  );
}

/** Лист поверх экрана (источник, меню счёта): затемнение — закрыть; Escape — закрыть. */
function Лист({ заголовок, закрыть, children }: { заголовок: string; закрыть: () => void; children: ReactNode }) {
  const т = useСловарь(СЛОВАРЬ);
  const { цвет, отступ, радиус } = useТема();
  useEffect(() => {
    if (!ВЕБ) return;
    const ф = (е: KeyboardEvent) => {
      if (е.key === 'Escape') закрыть();
    };
    document.addEventListener('keydown', ф);
    return () => document.removeEventListener('keydown', ф);
  }, [закрыть]);
  return (
    <View style={{ position: 'absolute', left: 0, right: 0, top: 0, bottom: 0, justifyContent: 'flex-end', alignItems: 'center' }}>
      <Pressable accessibilityLabel={т('закрыть')} onPress={закрыть} style={{ position: 'absolute', left: 0, right: 0, top: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.45)' }} />
      <View
        testID="зикр-лист"
        {...(ВЕБ ? ({ role: 'dialog', 'aria-modal': true, 'aria-label': заголовок } as object) : null)}
        style={{ width: '100%', maxWidth: ШИРИНА_КОЛОНКИ, maxHeight: '80%', backgroundColor: цвет.поверхность, borderTopLeftRadius: радиус.xl, borderTopRightRadius: радиус.xl, padding: отступ.l, gap: отступ.m }}
      >
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: отступ.s }}>
          <Текст вид="подзаголовок" accessibilityRole="header" уровень={2} стиль={{ flex: 1 }}>
            {заголовок}
          </Текст>
          <КнопкаЗначок значок="закрыть" подпись={т('закрыть')} приНажатии={закрыть} testID="зикр-лист-закрыть" />
        </View>
        <ScrollView contentContainerStyle={{ gap: отступ.s }}>{children}</ScrollView>
      </View>
    </View>
  );
}

function Карточка({ зикр }: { зикр: Зикр }) {
  const { язык } = useПеревод();
  const тз = useСловарь(СЛОВАРЬ_ЗИКРОВ);
  const { цвет, отступ } = useТема();
  return (
    <View style={{ gap: отступ.m, alignItems: 'stretch' }}>
      <View style={{ alignItems: 'center' }}>
        <Плашка вид="черновик" надпись={тз('черновик')} testID="зикр-черновик" />
      </View>
      <Текст вид="метка" цвет={цвет.текстВторой} стиль={{ textAlign: 'center', textTransform: 'uppercase', letterSpacing: 1.5 }} testID="зикр-название">
        {зикр.название[язык]}
      </Текст>
      <АрабскийЗикра зикр={зикр} testID="зикр-арабский" />
      <Текст стиль={{ textAlign: 'center', fontWeight: '700', fontSize: 18, lineHeight: 26 }} testID="зикр-произношение">
        {зикр.произношение[язык]}
      </Текст>
      <Текст вид="второй" стиль={{ textAlign: 'center', fontSize: 17, lineHeight: 26 }} testID="зикр-перевод">
        {зикр.перевод[язык]}
      </Текст>
      {зикр.примечание ? (
        <Текст вид="мелкий" стиль={{ textAlign: 'center' }} testID="зикр-примечание">
          {зикр.примечание[язык]}
        </Текст>
      ) : null}
    </View>
  );
}

export function СчётчикЗикра({ параметры }: ПропсыЭкрана<'зикр'>) {
  const { t, язык } = useПеревод();
  const т = useСловарь(СЛОВАРЬ);
  const тз = useСловарь(СЛОВАРЬ_ЗИКРОВ);
  const { цвет, отступ, радиус } = useТема();
  const { обновитьПараметры, заменить } = useНавигация();
  const набор = useЗикры();
  const счёт = useСчётЗикров();
  const [лист, установитьЛист] = useState<'источник' | 'меню' | null>(null);
  const касание = useRef<{ x: number; y: number } | null>(null);

  const зикры = набор.состояние === 'есть' ? набор.данные.зикры : null;
  const N = зикры?.length ?? 0;
  const номер = параметры.номер;
  const зикр = зикры && номер >= 1 && номер <= N ? зикры[номер - 1] : null;
  const запись = зикр ? счёт.счёт[зикр.id] : undefined;
  const цель = зикр ? цельЗикра(запись, зикр.раз) : 1;
  const текущий = запись?.текущий ?? 0;
  const всего = запись?.всего ?? 0;
  const готово = текущий > 0 && текущий === цель;

  const кСоседу = useCallback(
    (шаг: number) => {
      const н = номер + шаг;
      if (н < 1 || н > N) return;
      установитьЛист(null);
      обновитьПараметры('зикр', { номер: н });
    },
    [номер, N, обновитьПараметры],
  );

  const считать = useCallback(() => {
    if (!зикр) return;
    const завершён = добавить(зикр.id, зикр.раз);
    вибрация(завершён ? [40, 60, 40] : 15);
  }, [зикр]);

  // Пробел/Enter — +1, ← → — соседний зикр (когда фокус не на кнопке/поле и лист закрыт).
  useEffect(() => {
    if (!ВЕБ || !зикр || лист) return;
    const ф = (е: KeyboardEvent) => {
      const цельС = е.target as HTMLElement | null;
      const свободно = !цельС || цельС === document.body || цельС.tagName === 'HTML' || цельС.getAttribute?.('data-focus') === 'heading';
      if (!свободно || е.altKey || е.ctrlKey || е.metaKey) return;
      if (е.key === ' ' || е.key === 'Enter') {
        е.preventDefault();
        считать();
      } else if (е.key === 'ArrowRight') кСоседу(1);
      else if (е.key === 'ArrowLeft') кСоседу(-1);
    };
    document.addEventListener('keydown', ф);
    return () => document.removeEventListener('keydown', ф);
  }, [зикр, лист, считать, кСоседу]);

  const заголовок = t('экран.зикр');
  if (набор.состояние !== 'есть' || !зикр) {
    return (
      <Экран заголовок={заголовок} testID="экран-зикр">
        {набор.состояние === 'загрузка' ? (
          <Текст вид="второй" testID="зикр-загрузка">
            {t('общее.загрузка')}
          </Текст>
        ) : набор.состояние === 'нет' ? (
          <ЗикрыНедоступны состояние={набор} />
        ) : (
          <View style={{ gap: отступ.m }}>
            <Текст testID="зикр-нет">{т('нет')}</Текст>
            <Кнопка вид="вторичная" надпись={т('кСписку')} приНажатии={() => заменить('зикры')} testID="зикр-к-списку" />
          </View>
        )}
      </Экран>
    );
  }

  const начатьКасание = (е: GestureResponderEvent) => {
    const т0 = е.nativeEvent.touches?.[0] ?? е.nativeEvent;
    касание.current = { x: т0.pageX, y: т0.pageY };
  };
  const закончитьКасание = (е: GestureResponderEvent) => {
    const н = касание.current;
    касание.current = null;
    const т1 = е.nativeEvent.changedTouches?.[0] ?? е.nativeEvent;
    if (!н) return;
    const dx = т1.pageX - н.x;
    const dy = т1.pageY - н.y;
    if (Math.abs(dx) > 60 && Math.abs(dx) > 2 * Math.abs(dy)) кСоседу(dx < 0 ? 1 : -1);
  };

  const доля = Math.min(1, цель > 0 ? текущий / цель : 0);

  return (
    <Экран
      заголовок={заголовок}
      прокрутка={false}
      testID="экран-зикр"
      справа={
        <View style={{ flexDirection: 'row' }}>
          <КнопкаЗначок значок="инфо" подпись={т('источник')} приНажатии={() => установитьЛист('источник')} развёрнута={лист === 'источник'} testID="зикр-источник-кнопка" />
          <КнопкаЗначок значок="точкиВертикально" подпись={т('меню')} приНажатии={() => установитьЛист('меню')} развёрнута={лист === 'меню'} testID="зикр-меню-кнопка" />
        </View>
      }
    >
      <View style={{ flex: 1, width: '100%', maxWidth: ШИРИНА_КОЛОНКИ, alignSelf: 'center', paddingHorizontal: отступ.l, paddingBottom: отступ.l, gap: отступ.s }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: отступ.s }}>
          <КнопкаЗначок значок="назад" подпись={т('пред')} приНажатии={() => кСоседу(-1)} отключена={номер <= 1} testID="зикр-пред" />
          <Текст вид="метка" цвет={цвет.текстВторой} табличные testID="зикр-позиция" стиль={{ minWidth: 72, textAlign: 'center' }}>
            {т('позиция', { n: номер, N })}
          </Текст>
          <КнопкаЗначок значок="вперёд" подпись={т('след')} приНажатии={() => кСоседу(1)} отключена={номер >= N} testID="зикр-след" />
        </View>

        <View
          style={{ flex: 1, minHeight: 0, borderRadius: радиус.l, borderWidth: 1, borderColor: цвет.граница, backgroundColor: цвет.поверхность, overflow: 'hidden' }}
          onTouchStart={начатьКасание}
          onTouchEnd={закончитьКасание}
          testID="зикр-карточка"
        >
          <ScrollView contentContainerStyle={{ padding: отступ.l, flexGrow: 1, justifyContent: 'center' }}>
            <Карточка зикр={зикр} />
          </ScrollView>
        </View>

        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`${т('нажать')}. ${тз('счётПодпись', { текущий, цель, всего })}`}
          onPress={считать}
          testID="зикр-нажать"
          style={({ pressed }) => ({
            height: '36%',
            minHeight: 190,
            borderRadius: радиус.l,
            padding: отступ.l,
            backgroundColor: pressed ? цвет.акцентМягкий : цвет.поверхностьАкцент,
            justifyContent: 'space-between',
            ...(ВЕБ ? ({ userSelect: 'none', touchAction: 'manipulation', cursor: 'pointer' } as object) : null),
          })}
        >
          <View style={{ gap: отступ.xs }}>
            <View testID="зикр-прогресс" style={{ height: 6, borderRadius: 3, backgroundColor: цвет.поверхностьВторая, overflow: 'hidden' }}>
              <View style={{ width: `${Math.round(доля * 100)}%`, height: 6, backgroundColor: цвет.акцент }} />
            </View>
            <Текст вид="метка" цвет={цвет.текстВторой} табличные стиль={{ textAlign: 'right' }} testID="зикр-цель">
              {т('цель', { цель })}
            </Текст>
          </View>
          <Текст
            табличные
            цвет={готово ? цвет.акцент : цвет.текст}
            accessibilityLiveRegion="polite"
            testID="зикр-текущий"
            стиль={{ textAlign: 'center', fontSize: 88, lineHeight: 96, fontWeight: '300' }}
          >
            {String(текущий)}
          </Текст>
          <View style={{ alignItems: 'center', gap: 2 }}>
            {готово ? (
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: отступ.xs }} testID="зикр-готово">
                <Значок имя="галочка" размер={18} цвет={цвет.акцент} />
                <Текст вид="метка" цвет={цвет.акцент}>
                  {т('готово', { цель })}
                </Текст>
              </View>
            ) : null}
            <Текст вид="мелкий" табличные testID="зикр-всего">
              {т('всего', { всего })}
            </Текст>
          </View>
        </Pressable>
      </View>

      {лист === 'источник' ? (
        <Лист заголовок={т('источник')} закрыть={() => установитьЛист(null)}>
          <Текст testID="зикр-источник">{подписьИсточника(зикр, язык, тз)}</Текст>
          <Текст вид="мелкий">{т('примечаниеИсточника')}</Текст>
          <Плашка вид="черновик" надпись={тз('черновик')} />
        </Лист>
      ) : лист === 'меню' ? (
        <Лист заголовок={т('меню')} закрыть={() => установитьЛист(null)}>
          <Кнопка вид="вторичная" значок="повтор" надпись={т('сбросить')} приНажатии={() => { сбросить(зикр.id); установитьЛист(null); }} testID="зикр-сбросить" />
          <Кнопка вид="тихая" значок="удалить" надпись={т('сброситьВсё')} приНажатии={() => { сбросить(зикр.id, true); установитьЛист(null); }} testID="зикр-сбросить-всё" />
          <Текст вид="метка" стиль={{ marginTop: отступ.s }}>
            {т('цели')}
          </Текст>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: отступ.s }}>
            {ЦЕЛИ.map((ц) => {
              const выбрана = запись?.цель === ц;
              return (
                <Pressable
                  key={ц}
                  accessibilityRole="button"
                  accessibilityState={{ selected: выбрана }}
                  {...(ВЕБ ? ({ 'aria-pressed': выбрана } as object) : null)}
                  onPress={() => { задатьЦель(зикр.id, ц); установитьЛист(null); }}
                  testID={'зикр-цель-' + ц}
                  style={({ pressed }) => ({ minWidth: 56, minHeight: 48, paddingHorizontal: отступ.m, borderRadius: радиус.m, alignItems: 'center', justifyContent: 'center', borderWidth: выбрана ? 2 : 1, borderColor: выбрана ? цвет.акцент : цвет.границаЭлемента, backgroundColor: pressed ? цвет.акцентМягкий : цвет.поверхность })}
                >
                  <Текст табличные стиль={{ fontWeight: '600' }}>
                    {String(ц)}
                  </Текст>
                </Pressable>
              );
            })}
          </View>
          <Кнопка
            вид="тихая"
            надпись={т('поУмолчанию', { раз: зикр.раз })}
            приНажатии={() => { задатьЦель(зикр.id, null); установитьЛист(null); }}
            testID="зикр-цель-по-умолчанию"
          />
        </Лист>
      ) : null}
    </Экран>
  );
}
