/**
 * Перевод интерфейса: русский (по умолчанию) и казахский (черновик для редактора-носителя).
 *
 * Контракт:
 *   <ПоставщикЯзыка> — внутри <ПоставщикПрогресса> (язык хранится в прогрессе, локально).
 *   useПеревод() → { t, язык, установитьЯзык, языкВыбран }
 *     t('плашка.урок') — строка общего словаря (ru.ts / kk.ts);
 *     t('прогресс.задание', { текущий: 3, всего: 10 }) — подстановка {имя}.
 *     языкВыбран — false, пока человек сам не выбрал язык (онбординг спрашивает).
 *   создатьСловарь({ ru: {...}, kk: {...} }) + useСловарь(словарь) — локальные строки одного
 *     экрана (меньше конфликтов, когда экраны пишут разные люди); kk обязан иметь те же ключи.
 *   ЯЗЫКИ — список для переключателя; подставить(строка, параметры) — подстановка {имя}.
 *
 * Не для религиозного контента: тексты уроков, правил и ИИ-предупреждения — в /content.
 */
import { createContext, useCallback, useContext, useEffect, useMemo, type ReactNode } from 'react';
import { Platform } from 'react-native';
import { useПрогресс, type Язык } from '../engine/progress';
import { kk } from './kk';
import { ru, type КлючСтроки } from './ru';

export type { Язык } from '../engine/progress';
export type { КлючСтроки } from './ru';

export type ПараметрыСтроки = Record<string, string | number>;

export const ЯЗЫКИ: readonly { код: Язык; название: string }[] = [
  { код: 'ru', название: 'Русский' },
  { код: 'kk', название: 'Қазақша' },
];

const СЛОВАРИ: Record<Язык, Record<КлючСтроки, string>> = { ru, kk };

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
  const язык: Язык = прогресс.язык ?? 'ru';

  useEffect(() => {
    if (Platform.OS === 'web' && typeof document !== 'undefined') document.documentElement.lang = язык;
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

export type Словарь<K extends string> = { ru: Record<K, string>; kk: Record<K, string> };

/** Локальный словарь экрана: создатьСловарь({ ru: { 'кнопка': 'Дальше' }, kk: { 'кнопка': 'Әрі қарай' } }). */
export function создатьСловарь<K extends string>(словарь: { ru: Record<K, string>; kk: Record<NoInfer<K>, string> }): Словарь<K> {
  return словарь;
}

export function useСловарь<K extends string>(словарь: Словарь<K>): (ключ: K, параметры?: ПараметрыСтроки) => string {
  const { язык } = useПеревод();
  return useCallback(
    (ключ: K, параметры?: ПараметрыСтроки) => подставить(словарь[язык][ключ] ?? словарь.ru[ключ] ?? ключ, параметры),
    [словарь, язык],
  );
}
