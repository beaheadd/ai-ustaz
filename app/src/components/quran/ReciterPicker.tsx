/**
 * Выбор чтеца Корана (кари) для плеера и кнопки «Слушать» у аята — с прослушиванием аль-Фатихи.
 *
 * Решение владельца 27.11.2026: «Найди аудио Корана и поставь на сайт. Мы используем для некоммерческого
 * использования». Записи — AlQuran Cloud (своё зеркало на aiustaz.pro, иначе поток с cdn.islamic.network), по их условиям
 * (личное и учебное использование); список и порядок — content/audio-sources.json, по умолчанию — первый играющий
 * (аль-Хусари). Выбор хранится только на устройстве (audio/player.ts, ключ aiustaz:quran-reciter.v1), без личных данных.
 * Владелец 27.11.2026: «Когда человек только заходит на Коран, нужно поставить выбор чтеца. Рядом должно быть
 * воспроизведение. Аль-Фатиху можешь поставить, пусть они слушают голос и выбирают того чтеца, который ему понравился» —
 * у каждой строки ▶ (audio/preview.ts: 1:1–1:7 этого чтеца; повторно — пауза; звучит один) и лист <ПервыйВыборЧтеца />.
 * Правило 3: только живые записи кари, без синтеза. Правило 9: имена кари — словами, без лиц и портретов.
 *
 * Контракт:
 *   <ВыборЧтеца вид?='строка'|'шапка' />
 *     строка — подпись «Чтец Корана» и список чтецов (для «Ещё» → «Настройки»);
 *     шапка  — кнопка «Чтец: …» (aria-expanded) в меню вида суры; раскрывает тот же список.
 *     Слушать здесь нечего (batr.kz, нативная сборка, нет разрешения) — ничего не рисует: причину показывает плеер.
 *     Под списком — атрибуция выбранной записи (условие AlQuran Cloud: права на запись — у чтеца).
 *   <ПервыйВыборЧтеца /> — лист «Выберите чтеца» поверх экрана «Коран», один раз: пока чтец не выбран и лист не закрывали
 *     (ключ aiustaz:quran-reciter-asked.v1 = '1'); «Выбрать» — выбранный, «Пропустить» — по умолчанию (аль-Хусари).
 * testID: чтец (кнопка шапки), ещё-чтец, чтец-выбор, чтец-<id>, чтец-<id>-слушать, чтец-атрибуция,
 *   чтец-первый, чтец-первый-выбрать, чтец-первый-пропустить.
 * kk, uz, en — черновик для редактора-носителя.
 */
import { useEffect, useState } from 'react';
import { Platform, Pressable, ScrollView, View } from 'react-native';
import { КЛЮЧ_ЧТЕЦА, выбратьЧтеца, чтецы, useЧтец, type ИсточникЧтения } from '../../audio/player';
import { остановитьПрослушивание, прослушать, useПрослушивание } from '../../audio/preview';
import { языкПлеера } from '../../audio/texts';
import { создатьСловарь, useПеревод, useСловарь } from '../../i18n';
import { ШИРИНА_КОЛОНКИ, useТема } from '../../theme';
import { Кнопка } from '../Button';
import { Значок } from '../Icon';
import { СтрокаСписка } from '../ListRow';
import { Текст } from '../Text';

const ВЕБ = Platform.OS === 'web';
export const КЛЮЧ_СПРОШЕНО = 'aiustaz:quran-reciter-asked.v1';

const СЛОВАРЬ = создатьСловарь({
  ru: {
    подпись: 'Чтец Корана',
    кнопка: 'Чтец: {кари}',
    пояснение: 'Живые записи кари. ▶ — послушать аль-Фатиху. Выбор хранится только на этом устройстве.',
    слушать: 'Послушать аль-Фатиху: {кари}',
    пауза: 'Пауза: {кари}',
    муратталь: 'муратталь — размеренное чтение',
    муджаввад: 'муджаввад — напевное чтение',
    первыйЗаголовок: 'Выберите чтеца',
    первыйТекст: 'Послушайте аль-Фатиху (▶) и выберите голос, который вам нравится. Сменить можно в любое время в «Ещё».',
    выбрать: 'Выбрать',
    пропустить: 'Пропустить',
  },
  kk: {
    подпись: 'Құран қариы',
    кнопка: 'Қари: {кари}',
    пояснение: 'Қарилердің тірі жазбалары. ▶ — әл-Фатиханы тыңдау. Таңдау тек осы құрылғыда сақталады.',
    слушать: 'Әл-Фатиханы тыңдау: {кари}',
    пауза: 'Кідірту: {кари}',
    муратталь: 'мураттал — салмақты оқу',
    муджаввад: 'мүжәууад — әуенді оқу',
    первыйЗаголовок: 'Қариды таңдаңыз',
    первыйТекст: 'Әл-Фатиханы тыңдап (▶), өзіңізге ұнаған дауысты таңдаңыз. Кейін «Тағы» бөлімінде ауыстыруға болады.',
    выбрать: 'Таңдау',
    пропустить: 'Өткізіп жіберу',
  },
  uz: {
    подпись: 'Qurʼon qorisi',
    кнопка: 'Qori: {кари}',
    пояснение: 'Qorilarning jonli yozuvlari. ▶ — al-Fotihani tinglash. Tanlov faqat shu qurilmada saqlanadi.',
    слушать: 'Al-Fotihani tinglash: {кари}',
    пауза: 'Pauza: {кари}',
    муратталь: 'murattal — vazmin qiroat',
    муджаввад: 'mujavvad — ohangdor qiroat',
    первыйЗаголовок: 'Qorini tanlang',
    первыйТекст: 'Al-Fotihani tinglang (▶) va yoqqan ovozni tanlang. Keyin «Yana» boʻlimida almashtirish mumkin.',
    выбрать: 'Tanlash',
    пропустить: 'Oʻtkazib yuborish',
  },
  en: {
    подпись: 'Quran reciter',
    кнопка: 'Reciter: {кари}',
    пояснение: 'Live recordings of qaris. ▶ plays al-Fatiha. Your choice is kept only on this device.',
    слушать: 'Listen to al-Fatiha: {кари}',
    пауза: 'Pause: {кари}',
    муратталь: 'murattal — measured recitation',
    муджаввад: 'mujawwad — melodic recitation',
    первыйЗаголовок: 'Choose a reciter',
    первыйТекст: 'Listen to al-Fatiha (▶) and choose the voice you like. You can change it any time in “More”.',
    выбрать: 'Choose',
    пропустить: 'Skip',
  },
});

/** Стиль чтения по изданию AlQuran Cloud (только то, что известно точно; иначе без подписи). */
const СТИЛЬ_ИЗДАНИЯ: Readonly<Record<string, 'муратталь' | 'муджаввад'>> = {
  'ar.husary': 'муратталь',
  'ar.husarymujawwad': 'муджаввад',
  'ar.muhammadayyoub': 'муратталь',
  'ar.aymanswoaid': 'муратталь',
  'ar.alafasy': 'муратталь',
};

function СтрокаЧтеца({ и, выбрана, приВыборе }: { и: ИсточникЧтения; выбрана: boolean; приВыборе: () => void }) {
  const т = useСловарь(СЛОВАРЬ);
  const { цвет, отступ, радиус } = useТема();
  const язык = языкПлеера(useПеревод().язык);
  const слушание = useПрослушивание();
  const звучит = слушание?.id === и.id && слушание.состояние !== 'пауза';
  const стиль = и.cdn ? СТИЛЬ_ИЗДАНИЯ[и.cdn.издание] : undefined;
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: отступ.s, borderBottomWidth: 1, borderBottomColor: цвет.граница }}>
      <Pressable
        accessibilityRole="button"
        {...({ 'aria-pressed': выбрана } as object)}
        onPress={приВыборе}
        testID={'чтец-' + и.id}
        style={({ pressed }) => ({ flex: 1, flexDirection: 'row', alignItems: 'center', gap: отступ.s, minHeight: 56, paddingVertical: отступ.s, borderRadius: радиус.m, backgroundColor: pressed ? цвет.акцентМягкий : 'transparent' })}
      >
        <View style={{ flex: 1, gap: 2 }}>
          <Текст стиль={{ fontWeight: '600' }}>{и.кари[язык]}</Текст>
          {стиль ? <Текст вид="мелкий">{т(стиль)}</Текст> : null}
        </View>
        {выбрана ? <Значок имя="галочка" размер={22} цвет={цвет.акцент} /> : null}
      </Pressable>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={т(звучит ? 'пауза' : 'слушать', { кари: и.кари[язык] })}
        {...({ 'aria-pressed': звучит } as object)}
        onPress={() => прослушать(и)}
        testID={'чтец-' + и.id + '-слушать'}
        hitSlop={4}
        style={({ pressed }) => ({
          width: 44,
          height: 44,
          borderRadius: 22,
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: звучит || pressed ? цвет.акцент : цвет.акцентМягкий,
        })}
      >
        <Значок имя={звучит ? 'пауза' : 'играть'} размер={20} цвет={звучит ? цвет.акцентТекст : цвет.акцент} толщина={2} />
      </Pressable>
    </View>
  );
}

function Список({ выбранный, приВыборе }: { выбранный?: string | null; приВыборе?: (id: string) => void }) {
  const т = useСловарь(СЛОВАРЬ);
  const { цвет, отступ } = useТема();
  const язык = языкПлеера(useПеревод().язык);
  const текущий = useЧтец();
  const отмечен = выбранный === undefined ? текущий : выбранный;
  const список = чтецы();
  const выбранныйИсточник = список.find((и) => и.id === отмечен) ?? null;
  // Ушли со списка — прослушивание замолкает.
  useEffect(() => () => остановитьПрослушивание(), []);
  return (
    <View style={{ gap: отступ.xs }} testID="чтец-выбор" {...({ role: 'group', 'aria-label': т('подпись') } as object)}>
      {список.map((и) => (
        <СтрокаЧтеца key={и.id} и={и} выбрана={и.id === отмечен} приВыборе={() => (приВыборе ? приВыборе(и.id) : выбратьЧтеца(и.id))} />
      ))}
      <Текст вид="мелкий" цвет={цвет.текстВторой}>
        {т('пояснение')}
      </Текст>
      {выбранныйИсточник ? (
        <Текст вид="мелкий" цвет={цвет.текстВторой} testID="чтец-атрибуция">
          {выбранныйИсточник.атрибуция[язык]}
        </Текст>
      ) : null}
    </View>
  );
}

export function ВыборЧтеца({ вид = 'строка' }: { вид?: 'строка' | 'шапка' }) {
  const т = useСловарь(СЛОВАРЬ);
  const { отступ } = useТема();
  const язык = языкПлеера(useПеревод().язык);
  const текущий = useЧтец();
  const [открыт, установитьОткрыт] = useState(false);
  const список = чтецы();
  if (!список.length) return null;
  if (вид === 'строка') {
    return (
      <View style={{ gap: отступ.xs }} testID="ещё-чтец">
        <Текст вид="мелкий">{т('подпись')}</Текст>
        <Список />
      </View>
    );
  }
  const имя = список.find((и) => и.id === текущий)?.кари[язык] ?? '';
  return (
    <View style={{ alignSelf: 'stretch', gap: отступ.s }}>
      <СтрокаСписка заголовок={т('кнопка', { кари: имя })} значок="аудио" раскрыт={открыт} приНажатии={() => установитьОткрыт((о) => !о)} testID="чтец" />
      {открыт ? <Список /> : null}
    </View>
  );
}

function прочитать(ключ: string): string | null {
  try {
    return typeof localStorage !== 'undefined' ? localStorage.getItem(ключ) : null;
  } catch {
    return null;
  }
}

function отметитьСпрошено() {
  try {
    localStorage.setItem(КЛЮЧ_СПРОШЕНО, '1');
  } catch {
    // приватный режим — спросим ещё раз в следующий заход
  }
}

/** Нужно ли показать лист первого выбора: есть кого слушать, чтец не выбран и лист не закрывали. */
export function нуженПервыйВыбор(): boolean {
  return чтецы().length > 0 && !прочитать(КЛЮЧ_ЧТЕЦА) && прочитать(КЛЮЧ_СПРОШЕНО) !== '1';
}

/** Лист «Выберите чтеца» при первом заходе на «Коран» (один раз). */
export function ПервыйВыборЧтеца() {
  const т = useСловарь(СЛОВАРЬ);
  const { цвет, отступ, радиус } = useТема();
  const текущий = useЧтец();
  const [открыт, установитьОткрыт] = useState(нуженПервыйВыбор);
  const [выбор, установитьВыбор] = useState<string | null>(текущий);
  if (!открыт) return null;
  const закрыть = (id: string | null) => {
    остановитьПрослушивание();
    if (id) выбратьЧтеца(id);
    отметитьСпрошено();
    установитьОткрыт(false);
  };
  // Поверх всего окна (на вебе — fixed: экран «Коран» прокручивается, нижнее меню — под листом).
  return (
    <View style={{ position: (ВЕБ ? 'fixed' : 'absolute') as 'absolute', top: 0, left: 0, right: 0, bottom: 0, zIndex: 1000 }}>
      <View style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.35)' }} />
      <View
        testID="чтец-первый"
        {...((ВЕБ ? { role: 'dialog', 'aria-modal': true, 'aria-label': т('первыйЗаголовок') } : {}) as object)}
        pointerEvents="box-none"
        style={{ position: 'absolute', left: 0, right: 0, bottom: 0, top: '6%', justifyContent: 'flex-end', alignItems: 'center' }}
      >
        <View style={{ width: '100%', maxWidth: ШИРИНА_КОЛОНКИ, maxHeight: '100%', backgroundColor: цвет.фон, borderTopLeftRadius: радиус.l, borderTopRightRadius: радиус.l, borderWidth: 1, borderBottomWidth: 0, borderColor: цвет.граница }}>
          <ScrollView style={{ flexShrink: 1 }} contentContainerStyle={{ padding: отступ.l, gap: отступ.s }}>
            <Текст вид="заголовок" accessibilityRole="header">
              {т('первыйЗаголовок')}
            </Текст>
            <Текст вид="второй">{т('первыйТекст')}</Текст>
            <Список выбранный={выбор} приВыборе={установитьВыбор} />
          </ScrollView>
          <View style={{ padding: отступ.l, paddingTop: отступ.s, gap: отступ.s, borderTopWidth: 1, borderTopColor: цвет.граница, paddingBottom: ВЕБ ? ('calc(16px + env(safe-area-inset-bottom))' as unknown as number) : 16 }}>
            <Кнопка надпись={т('выбрать')} крупная приНажатии={() => закрыть(выбор)} testID="чтец-первый-выбрать" />
            <Кнопка вид="вторичная" надпись={т('пропустить')} приНажатии={() => закрыть(null)} testID="чтец-первый-пропустить" />
          </View>
        </View>
      </View>
    </View>
  );
}
