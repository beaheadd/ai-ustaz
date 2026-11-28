/**
 * Перевод интерфейса: русский (по умолчанию), казахский, узбекский (латиница), английский — и с 28.11.2026 арабский,
 * турецкий, индонезийский и урду. Все, кроме ru, — ЧЕРНОВИКИ для редактора-носителя языка (CLAUDE.md), не
 * окончательный перевод. Узбекский — решение владельца 20.11.2026 (латиница: «ʻ» U+02BB в oʻ/gʻ, «ʼ» U+02BC).
 * Английский — решение владельца 20.11.2026 («4 языка должно быть для старта»): исламские термины — принятой
 * английской транслитерацией (Fajr, Dhuhr, surah, ayah), апостроф — ASCII '.
 * Владелец 28.11.2026: «Нужно добавить языки наиболее мусульманских стран сначала. Арабский…» → выбрано «Арабский +
 * Турецкий + Индонезийский + Урду». Термины: ar — принятые арабские; tr — как у Диянета (namaz, abdest, ezan, hadis,
 * zikir, dua, kıble, tecvid); id — salat, wudu, azan, hadis, zikir, doa, kiblat, tajwid; ur — نماز، وضو، اذان، حدیث،
 * ذکر، دعا، قبلہ، تجوید. ar и ur — справа налево (<html dir="rtl">, корневой View dir="rtl" — react-native-web
 * зеркалит start/end и ряды).
 *
 * Контракт:
 *   <ПоставщикЯзыка> — внутри <ПоставщикПрогресса> (язык хранится в прогрессе, локально).
 *   useПеревод() → { t, язык, установитьЯзык, языкВыбран, направление }
 *     t('плашка.урок') — строка общего словаря (ru.ts / kk.ts / uz.ts / en.ts; ar/tr/id/ur — locales/lang-*.json);
 *     t('прогресс.задание', { текущий: 3, всего: 10 }) — подстановка {имя}; в ar/ur значение изолируется
 *       (U+2068 … U+2069), чтобы латиница, кириллица и числа внутри арабской строки не меняли порядок соседей.
 *     язык — выбранный человеком; не выбран — язык телефона (navigator.languages: первый из 8), иначе ru;
 *     языкВыбран — false, пока человек сам не выбрал язык; направление — 'rtl' для ar и ur, иначе 'ltr'.
 *   Новые языки (ar, tr, id, ur) — ЛЕНИВЫЕ чанки (locales/lang-<язык>.json: общий словарь и словари экранов по имени):
 *     грузится только выбранный язык; пока чанк не пришёл — показан прежний язык (первый запуск — пустой фон);
 *     нет чанка или ключа — английский (запасная цепочка ar/tr/id/ur → en → ru).
 *   создатьСловарь({ ru, kk, uz, en, ar?, tr?, id?, ur? }, имя?) + useСловарь(словарь) — локальные строки одного
 *     экрана; kk, uz и en обязаны иметь те же ключи (пропуск ломает typecheck). ar/tr/id/ur — НЕОБЯЗАТЕЛЬНЫ в типе
 *     (их кладут в locales/lang-*.json под именем словаря, обычно путь файла от src: 'screens/HomeScreen');
 *     scripts/test-i18n.mjs проверяет все 8 языков: те же ключи, непустые строки, подстановки {имя}.
 *   ЯЗЫК_HTML[язык] — значение <html lang> (uz → 'uz-Latn'); <html dir> — по справаНалево.
 *   ЯЗЫКИ — список для переключателя (родные названия); подставить(строка, параметры, изолировать?) — подстановка;
 *   языкБраузера(тег) → Язык | null; языкУстройства() → Язык | null — первый поддержанный из navigator.languages.
 *   текстЯзыка(текст, язык) — поле данных на языке; нет — en для новых языков, затем ru.
 *   естьПереводДанных(текст, язык) — есть ли своё поле (иначе экран показывает «Перевод на ваш язык готовится»).
 *
 * Не для религиозного контента: тексты уроков, правил и ИИ-предупреждения — в /content.
 */
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { I18nManager, Platform, View } from 'react-native';
import { useПрогресс } from '../engine/progress';
import { этоНовый, справаНалево, type Язык, type ЯзыкНовый } from './languages';
import { kk } from './kk';
import { ru, type КлючСтроки } from './ru';
import { en } from './en';
import { uz } from './uz';

export type { Язык, ЯзыкОсновной, ЯзыкНовый } from './languages';
export { ВСЕ_ЯЗЫКИ, НОВЫЕ_ЯЗЫКИ, ЛОКАЛЬ_INTL, основной, справаНалево, этоНовый } from './languages';
export type { КлючСтроки } from './ru';

export type ПараметрыСтроки = Record<string, string | number>;
export type Направление = 'ltr' | 'rtl';

/** Родные названия языков — в переключателе одинаковы на любом языке интерфейса. */
export const ЯЗЫКИ: readonly { код: Язык; название: string }[] = [
  { код: 'ru', название: 'Русский' },
  { код: 'kk', название: 'Қазақша' },
  { код: 'uz', название: 'Oʻzbekcha' },
  { код: 'en', название: 'English' },
  { код: 'ar', название: 'العربية' },
  { код: 'tr', название: 'Türkçe' },
  { код: 'id', название: 'Bahasa Indonesia' },
  { код: 'ur', название: 'اردو' },
];

/** <html lang>: узбекский — латиница (uz-Latn). */
export const ЯЗЫК_HTML: Record<Язык, string> = { ru: 'ru', kk: 'kk', uz: 'uz-Latn', en: 'en', ar: 'ar', tr: 'tr', id: 'id', ur: 'ur' };

/** Язык браузера → язык интерфейса, если он у нас есть ('uz-UZ' → 'uz', 'ar-SA' → 'ar', 'in' → 'id'); иначе null. */
export function языкБраузера(тег: string | null | undefined): Язык | null {
  const код = (тег ?? '').toLowerCase().split(/[-_]/)[0];
  if (код === 'in') return 'id'; // старый код индонезийского (Android до 2019 отдаёт «in-ID»)
  return код === 'ru' || код === 'kk' || код === 'uz' || код === 'en' || код === 'ar' || код === 'tr' || код === 'id' || код === 'ur' ? код : null;
}

/** Язык телефона (браузера): первый из navigator.languages, который у нас есть; нет — null. */
export function языкУстройства(): Язык | null {
  if (Platform.OS !== 'web' || typeof navigator === 'undefined') return null;
  const теги = navigator.languages?.length ? navigator.languages : [navigator.language];
  for (const тег of теги) {
    const я = языкБраузера(тег);
    if (я) return я;
  }
  return null;
}

const СЛОВАРИ: Record<'ru' | 'kk' | 'uz' | 'en', Record<КлючСтроки, string>> = { ru, kk, uz, en };

/** Ленивый чанк языка: общий словарь и словари экранов по имени (locales/lang-<язык>.json). */
export type Локаль = { общий: Partial<Record<КлючСтроки, string>>; словари: Record<string, Record<string, string> | undefined> };

const ЛОКАЛИ: Partial<Record<ЯзыкНовый, Локаль>> = {};
const ЗАГРУЗЧИКИ: Record<ЯзыкНовый, () => Promise<unknown>> = {
  ar: () => import('./locales/lang-ar.json'),
  tr: () => import('./locales/lang-tr.json'),
  id: () => import('./locales/lang-id.json'),
  ur: () => import('./locales/lang-ur.json'),
};
const ИДЁТ: Partial<Record<ЯзыкНовый, Promise<Локаль>>> = {};

/** Загрузить словари нового языка (один раз; ошибка — можно повторить). Старые языки — сразу. */
export function загрузитьЛокаль(я: Язык): Promise<Локаль | null> {
  if (!этоНовый(я)) return Promise.resolve(null);
  const есть = ЛОКАЛИ[я];
  if (есть) return Promise.resolve(есть);
  ИДЁТ[я] ??= ЗАГРУЗЧИКИ[я]().then(
    (м) => {
      const д = ((м as { default?: unknown }).default ?? м) as Локаль;
      ЛОКАЛИ[я] = { общий: д.общий ?? {}, словари: д.словари ?? {} };
      return ЛОКАЛИ[я]!;
    },
    (е) => {
      delete ИДЁТ[я];
      throw е;
    },
  );
  return ИДЁТ[я]!;
}

/** Готовы ли строки языка (старые — всегда; новые — после загрузки чанка). */
export const локальГотова = (я: Язык) => !этоНовый(я) || ЛОКАЛИ[я] != null;

/** Для тестов в node: положить словари нового языка без import(). */
export function установитьЛокаль(я: ЯзыкНовый, л: Локаль) {
  ЛОКАЛИ[я] = л;
}

/** Строка общего словаря: новый язык → его чанк → en; остальные → свой словарь → ru. */
export function строкаОбщая(ключ: КлючСтроки, я: Язык): string {
  if (этоНовый(я)) return ЛОКАЛИ[я]?.общий[ключ] || en[ключ] || ru[ключ] || ключ;
  return СЛОВАРИ[я][ключ] ?? ru[ключ] ?? ключ;
}

type ПолеДанных = { ru: string; kk?: string | null; uz?: string | null; en?: string | null } & Partial<Record<ЯзыкНовый, string | null>>;

/** Текст из данных на языке интерфейса; нет перевода (пусто) — для ar/tr/id/ur английский, затем русский, не ключ. */
export function текстЯзыка(текст: ПолеДанных, язык: Язык): string {
  return текст[язык] || (этоНовый(язык) ? текст.en : null) || текст.ru || '';
}

/** Есть ли в данных своё поле для языка (нет — экран добавит «Перевод на ваш язык готовится»). */
export function естьПереводДанных(текст: Partial<Record<Язык, unknown>> | null | undefined, язык: Язык): boolean {
  const з = текст?.[язык];
  return typeof з === 'string' ? з.trim() !== '' : з != null;
}

const FSI = '⁨';
const PDI = '⁩';

/** Подстановка {имя}. изолировать — для ar/ur: значение в U+2068…U+2069 (латиница и числа внутри арабской строки). */
export function подставить(строка: string, параметры?: ПараметрыСтроки, изолировать = false): string {
  if (!параметры) return строка;
  return строка.replace(/\{([^{}]+)\}/g, (весь, имя: string) =>
    Object.prototype.hasOwnProperty.call(параметры, имя) ? (изолировать ? FSI + String(параметры[имя]) + PDI : String(параметры[имя])) : весь,
  );
}

type ЗначениеЯзыка = {
  t: (ключ: КлючСтроки, параметры?: ПараметрыСтроки) => string;
  язык: Язык;
  языкВыбран: boolean;
  установитьЯзык: (язык: Язык) => void;
  направление: Направление;
};

const КонтекстЯзыка = createContext<ЗначениеЯзыка | null>(null);

/** Нативно RTL включается только перезапуском (I18nManager); на вебе — атрибутом dir, сразу. */
function направлениеНативно(rtl: boolean) {
  if (Platform.OS === 'web') return;
  try {
    I18nManager.allowRTL(rtl);
    if (I18nManager.isRTL !== rtl) I18nManager.forceRTL(rtl); // применится при следующем запуске приложения
  } catch {
    // нет модуля — оставляем как есть
  }
}

export function ПоставщикЯзыка({ children }: { children: ReactNode }) {
  const { прогресс, изменить } = useПрогресс();
  const нужный: Язык = прогресс.язык ?? языкУстройства() ?? 'ru';
  // Новый язык ждёт свой чанк: пока не пришёл — показываем прежний язык (первый запуск — пустой фон, не мелькание en).
  const [показанный, установитьПоказанный] = useState<Язык | null>(локальГотова(нужный) ? нужный : null);
  useEffect(() => {
    if (локальГотова(нужный)) {
      установитьПоказанный(нужный);
      return;
    }
    let жив = true;
    const показать = () => жив && установитьПоказанный(нужный);
    загрузитьЛокаль(нужный).then(показать, показать); // ошибка (нет сети) — язык с запасным английским
    const таймер = setTimeout(показать, 6000);
    return () => {
      жив = false;
      clearTimeout(таймер);
    };
  }, [нужный]);
  const язык: Язык = локальГотова(нужный) ? нужный : (показанный ?? нужный);
  const направление: Направление = справаНалево(язык) ? 'rtl' : 'ltr';

  useEffect(() => {
    if (Platform.OS === 'web' && typeof document !== 'undefined') {
      document.documentElement.lang = ЯЗЫК_HTML[язык];
      document.documentElement.dir = направление;
    }
    направлениеНативно(направление === 'rtl');
  }, [язык, направление]);

  const установитьЯзык = useCallback((новый: Язык) => {
    void загрузитьЛокаль(новый).catch(() => undefined);
    изменить((п) => ({ ...п, язык: новый }));
  }, [изменить]);

  const значение = useMemo<ЗначениеЯзыка>(() => {
    const rtl = направление === 'rtl';
    return {
      t: (ключ, параметры) => подставить(строкаОбщая(ключ, язык), параметры, rtl),
      язык,
      языкВыбран: прогресс.язык != null,
      установитьЯзык,
      направление,
    };
    // показанный — в зависимостях: после загрузки чанка строки t() другие при том же языке.
  }, [язык, направление, прогресс.язык, установитьЯзык, показанный]);

  if (показанный == null && !локальГотова(нужный)) return null;
  return (
    <КонтекстЯзыка.Provider value={значение}>
      {/* dir на корневом View: react-native-web берёт направление из ближайшего предка с dir (start/end, ряды). */}
      <View style={{ flex: 1 }} {...((Platform.OS === 'web' ? { dir: направление } : {}) as object)}>
        {children}
      </View>
    </КонтекстЯзыка.Provider>
  );
}

export function useПеревод(): ЗначениеЯзыка {
  const з = useContext(КонтекстЯзыка);
  if (!з) throw new Error('useПеревод: нет <ПоставщикЯзыка> выше по дереву');
  return з;
}

/** Язык интерфейса без исключения вне поставщика (Текст: шрифт урду): нет поставщика — ru. */
export function useЯзыкМягко(): Язык {
  return useContext(КонтекстЯзыка)?.язык ?? 'ru';
}

/** Направление интерфейса без исключения вне поставщика (Текст, Значок): нет поставщика — ltr. */
export function useНаправление(): Направление {
  return useContext(КонтекстЯзыка)?.направление ?? 'ltr';
}

type БлокиНовых<K extends string> = Partial<Record<ЯзыкНовый, Partial<Record<K, string>>>>;

export type Словарь<K extends string> = {
  ru: Record<K, string>;
  kk: Record<K, string>;
  uz: Record<K, string>;
  en: Record<K, string>;
  /** Имя в locales/lang-*.json («screens/HomeScreen»); нет — новые языки показывают en. */
  имя?: string;
} & БлокиНовых<K>;

/**
 * Локальный словарь экрана: создатьСловарь({ ru: { 'кнопка': 'Дальше' }, kk: {…}, uz: {…}, en: {…} }, 'screens/Экран').
 * ar/tr/id/ur — необязательно здесь же (иначе — locales/lang-*.json под этим именем; нет нигде — en).
 */
export function создатьСловарь<K extends string>(
  словарь: {
    ru: Record<K, string>;
    kk: Record<NoInfer<K>, string>;
    uz: Record<NoInfer<K>, string>;
    en: Record<NoInfer<K>, string>;
  } & БлокиНовых<NoInfer<K>>,
  имя?: string,
): Словарь<K> {
  return имя ? { ...словарь, имя } : словарь;
}

/** Строка словаря экрана по цепочке: свой блок → (новый язык: чанк языка → en) → ru → ключ. */
export function строкаСловаря<K extends string>(словарь: Словарь<K>, язык: Язык, ключ: K): string {
  const своя = (словарь as Partial<Record<Язык, Partial<Record<K, string>>>>)[язык]?.[ключ];
  if (своя) return своя;
  if (этоНовый(язык)) {
    const изЧанка = словарь.имя ? ЛОКАЛИ[язык]?.словари[словарь.имя]?.[ключ] : undefined;
    return изЧанка || словарь.en?.[ключ] || словарь.ru[ключ] || ключ;
  }
  return словарь.ru[ключ] ?? ключ;
}

export function useСловарь<K extends string>(словарь: Словарь<K>): (ключ: K, параметры?: ПараметрыСтроки) => string {
  const { язык, направление } = useПеревод();
  return useCallback(
    (ключ: K, параметры?: ПараметрыСтроки) => подставить(строкаСловаря(словарь, язык, ключ), параметры, направление === 'rtl'),
    [словарь, язык, направление],
  );
}

/**
 * Ряд арабских букв и слогов (flexDirection: 'row-reverse' — первый справа, как в книге) в арабском интерфейсе:
 * при dir="rtl" у предка row-reverse стал бы слева направо. Вебу — dir="ltr" на самом ряду, тогда порядок прежний
 * при любом языке. <View {...РЯД_АРАБСКИЙ} style={{ flexDirection: 'row-reverse' }}>.
 */
export const РЯД_АРАБСКИЙ = (Platform.OS === 'web' ? { dir: 'ltr' } : {}) as object;
