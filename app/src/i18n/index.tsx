/**
 * Перевод интерфейса: русский (по умолчанию), казахский, узбекский (латиница) и английский. kk, uz и en — ЧЕРНОВИКИ
 * для редактора-носителя языка (CLAUDE.md), не окончательный перевод. Узбекский — решение владельца 20.11.2026
 * («Потом нужно добавить узбекский язык», выбрана латиница): «ʻ» (U+02BB) в oʻ/gʻ, «ʼ» (U+02BC) — тутук белгиси.
 * Английский — решение владельца 20.11.2026 («Казахский, русский, узбекский, английский. 4 языка должно быть для
 * старта»): исламские термины — принятой английской транслитерацией (Fajr, Dhuhr, surah, ayah), апостроф — ASCII '.
 *
 * Контракт:
 *   <ПоставщикЯзыка> — внутри <ПоставщикПрогресса> (язык хранится в прогрессе, локально).
 *   useПеревод() → { t, язык, установитьЯзык, языкВыбран }
 *     t('плашка.урок') — строка общего словаря (ru.ts / kk.ts / uz.ts / en.ts);
 *     t('прогресс.задание', { текущий: 3, всего: 10 }) — подстановка {имя}.
 *     язык — выбранный человеком; не выбран — язык телефона (navigator.languages: первый из ru/kk/uz/en), иначе ru
 *     (владелец 28.11.2026: «массовое предложение» — шага выбора языка в онбординге нет, язык меняют в шапке главной);
 *     языкВыбран — false, пока человек сам не выбрал язык.
 *   создатьСловарь({ ru: {...}, kk: {...}, uz: {...}, en: {...} }) + useСловарь(словарь) — локальные строки одного
 *     экрана (меньше конфликтов, когда экраны пишут разные люди); kk, uz и en обязаны иметь те же ключи
 *     (пропуск ломает typecheck; scripts/test-i18n.mjs проверяет ещё и непустые строки и подстановки {имя}).
 *   ЯЗЫК_HTML[язык] — значение <html lang> (uz → 'uz-Latn').
 *   ЯЗЫКИ — список для переключателя; подставить(строка, параметры) — подстановка {имя};
 *   языкБраузера(тег) → Язык | null; языкУстройства() → Язык | null — первый поддержанный из navigator.languages.
 *
 * Не для религиозного контента: тексты уроков, правил и ИИ-предупреждения — в /content.
 */
import { createContext, useCallback, useContext, useEffect, useMemo, type ReactNode } from 'react';
import { Platform } from 'react-native';
import { useПрогресс, type Язык } from '../engine/progress';
import { kk } from './kk';
import { ru, type КлючСтроки } from './ru';
import { en } from './en';
import { uz } from './uz';

export type { Язык } from '../engine/progress';
export type { КлючСтроки } from './ru';

export type ПараметрыСтроки = Record<string, string | number>;

export const ЯЗЫКИ: readonly { код: Язык; название: string }[] = [
  { код: 'ru', название: 'Русский' },
  { код: 'kk', название: 'Қазақша' },
  { код: 'uz', название: 'Oʻzbekcha' },
  { код: 'en', название: 'English' },
];

/** <html lang>: узбекский — латиница (uz-Latn). */
export const ЯЗЫК_HTML: Record<Язык, string> = { ru: 'ru', kk: 'kk', uz: 'uz-Latn', en: 'en' };

/** Язык браузера → язык интерфейса, если он у нас есть ('uz-UZ' → 'uz', 'en-US' → 'en', 'kk' → 'kk'); иначе null. */
export function языкБраузера(тег: string | null | undefined): Язык | null {
  const код = (тег ?? '').toLowerCase().split(/[-_]/)[0];
  return код === 'ru' || код === 'kk' || код === 'uz' || код === 'en' ? код : null;
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

const СЛОВАРИ: Record<Язык, Record<КлючСтроки, string>> = { ru, kk, uz, en };

/** Текст из данных на языке интерфейса; нет перевода (пусто) — русский, не ключ. { ru, kk, uz?, en? } → строка. */
export function текстЯзыка(текст: { ru: string; kk?: string | null; uz?: string | null; en?: string | null }, язык: Язык): string {
  return текст[язык] || текст.ru || '';
}

export function подставить(строка: string, параметры?: ПараметрыСтроки): string {
  if (!параметры) return строка;
  return строка.replace(/\{([^{}]+)\}/g, (весь, имя: string) =>
    Object.prototype.hasOwnProperty.call(параметры, имя) ? String(параметры[имя]) : весь,
  );
}

type ЗначениеЯзыка = {
  t: (ключ: КлючСтроки, параметры?: ПараметрыСтроки) => string;
  язык: Язык;
  языкВыбран: boolean;
  установитьЯзык: (язык: Язык) => void;
};

const КонтекстЯзыка = createContext<ЗначениеЯзыка | null>(null);

export function ПоставщикЯзыка({ children }: { children: ReactNode }) {
  const { прогресс, изменить } = useПрогресс();
  const язык: Язык = прогресс.язык ?? языкУстройства() ?? 'ru';

  useEffect(() => {
    if (Platform.OS === 'web' && typeof document !== 'undefined') document.documentElement.lang = ЯЗЫК_HTML[язык];
  }, [язык]);

  const установитьЯзык = useCallback((новый: Язык) => изменить((п) => ({ ...п, язык: новый })), [изменить]);

  const значение = useMemo<ЗначениеЯзыка>(() => {
    const словарь = СЛОВАРИ[язык];
    return {
      t: (ключ, параметры) => подставить(словарь[ключ] ?? ru[ключ] ?? ключ, параметры),
      язык,
      языкВыбран: прогресс.язык != null,
      установитьЯзык,
    };
  }, [язык, прогресс.язык, установитьЯзык]);

  return <КонтекстЯзыка.Provider value={значение}>{children}</КонтекстЯзыка.Provider>;
}

export function useПеревод(): ЗначениеЯзыка {
  const з = useContext(КонтекстЯзыка);
  if (!з) throw new Error('useПеревод: нет <ПоставщикЯзыка> выше по дереву');
  return з;
}

export type Словарь<K extends string> = { ru: Record<K, string>; kk: Record<K, string>; uz: Record<K, string>; en: Record<K, string> };

/** Локальный словарь экрана: создатьСловарь({ ru: { 'кнопка': 'Дальше' }, kk: { 'кнопка': 'Әрі қарай' }, uz: { 'кнопка': 'Keyingi' }, en: { 'кнопка': 'Next' } }). */
export function создатьСловарь<K extends string>(словарь: {
  ru: Record<K, string>;
  kk: Record<NoInfer<K>, string>;
  uz: Record<NoInfer<K>, string>;
  en: Record<NoInfer<K>, string>;
}): Словарь<K> {
  return словарь;
}

export function useСловарь<K extends string>(словарь: Словарь<K>): (ключ: K, параметры?: ПараметрыСтроки) => string {
  const { язык } = useПеревод();
  return useCallback(
    // Нет блока языка (словарь собран до нового языка) — русский, а не падение экрана.
    (ключ: K, параметры?: ПараметрыСтроки) => подставить(словарь[язык]?.[ключ] ?? словарь.ru[ключ] ?? ключ, параметры),
    [словарь, язык],
  );
}
