/**
 * Махраджи — места выхода звуков: загрузка лёгкого индекса (статический файл сборки) для экранов «Как произносить
 * буквы» (screens/MakharijScreen.tsx — список, screens/MakharijLetterScreen.tsx — карточка буквы).
 *
 * Решения владельца: 19.11.2026 — «добавить картинку произношения каждой буквы»; 26.11.2026 — «Тот раз ты же рисовал
 * картинки произношения букв. Почему их нету в нашем приложении? Не выкатывал?».
 *
 * Откуда: content/makharij.json + content/letters.json → tools/makharij/build_index.py →
 * app/public/makharij-index/makharij.<хэш>.json (dist/makharij-index); схемы — app/public/makharij/*.svg
 * (tools/makharij/build_makharij.py). Текстов махраджей в JS нет — только манифест (имя файла, sha256, порядок букв).
 * Загрузка — общим загрузчиком Корана (src/quran/data.ts: сверка sha256, кэш, «нет связи»), ключ кэша «махраджи».
 * Тексты — ru и kk (как в makharij.json); uz и en пока нет — показываем русский (текстМахраджа, поРусски).
 * Статус данных — «черновик» (правило 11): экраны показывают плашку.
 *
 * Контракт:
 *   проверитьИндекс(сырые) → ИндексМахраджей | null — строгая проверка формы (имена схем — только *.svg из папки);
 *   загрузитьМахраджи(), useМахраджи() → состояние как у Корана;
 *   номерБуквы(id) → номер для #/makharij/letter?n= (по манифесту, без загрузки) | null;
 *   адресСхемы(файл) → '/aiustaz/makharij/<файл>';
 *   текстМахраджа(т, язык) → kk — казахский, остальные — русский; поРусски(язык) — показан ли русский вместо языка.
 */
import type { Язык } from '../i18n';
import { загрузитьФайл, изКэша, useЗагрузка, type Результат } from '../quran/data';
import { МАНИФЕСТ_МАХРАДЖЕЙ } from './manifest.generated';

export type ТекстыМахраджа = { ru: string; kk: string };

export type Махрадж = {
  id: string;
  номер: number;
  область: string;
  арабский: { название: string; стих?: string };
  лакаб?: string;
  название: ТекстыМахраджа;
  описание: ТекстыМахраджа;
  условие?: ТекстыМахраджа;
  гунна?: ТекстыМахраджа;
  подсветка: { что: ТекстыМахраджа; куда?: ТекстыМахраджа };
  схема: string;
  подпись: ТекстыМахраджа;
  схемаСверху?: string;
  подписьСверху?: ТекстыМахраджа;
  буквы: string[];
};

export type ЗаписьБуквы = { махрадж: string; проба: string; схема: string; схемаСверху?: string; примечание?: ТекстыМахраджа };

export type БукваМахраджа = ЗаписьБуквы & {
  id: string;
  номер: number;
  знак: string;
  название: Record<Язык, string>;
  состав?: string[];
  лин?: ЗаписьБуквы;
  мадд?: ЗаписьБуквы;
  гунна?: ЗаписьБуквы;
};

export type Область = { id: string; арабский: string; название: ТекстыМахраджа; махраджи: string[] };

export type ИндексМахраджей = {
  версия: string;
  статус: string;
  автор: string;
  области: Область[];
  махраджи: Махрадж[];
  буквы: БукваМахраджа[];
};

const КЛЮЧ_КЭША = 'махраджи';
const ФАЙЛ_СХЕМЫ = /^[a-z][a-z0-9-]*\.[0-9a-f]{20}\.svg$/;

function строка(з: unknown): з is string {
  return typeof з === 'string' && з.trim().length > 0;
}

function тексты(з: unknown): ТекстыМахраджа | null {
  if (!з || typeof з !== 'object') return null;
  const о = з as Record<string, unknown>;
  return строка(о.ru) && строка(о.kk) ? { ru: о.ru, kk: о.kk } : null;
}

function схема(з: unknown): з is string {
  return строка(з) && ФАЙЛ_СХЕМЫ.test(з);
}

function запись(з: unknown, махраджи: Set<string>): ЗаписьБуквы | null {
  if (!з || typeof з !== 'object') return null;
  const о = з as Record<string, unknown>;
  if (!строка(о.махрадж) || !махраджи.has(о.махрадж) || !строка(о.проба) || !схема(о.схема)) return null;
  if (о.схемаСверху !== undefined && !схема(о.схемаСверху)) return null;
  const итог: ЗаписьБуквы = { махрадж: о.махрадж, проба: о.проба, схема: о.схема };
  if (о.схемаСверху !== undefined) итог.схемаСверху = о.схемаСверху as string;
  if (о.примечание !== undefined) {
    const п = тексты(о.примечание);
    if (!п) return null;
    итог.примечание = п;
  }
  return итог;
}

/** Строгая проверка формы индекса; null — не показываем ничего (непроверенное не показываем). */
export function проверитьИндекс(сырые: unknown): ИндексМахраджей | null {
  if (!сырые || typeof сырые !== 'object') return null;
  const н = сырые as Record<string, unknown>;
  if (н.формат !== 1 || !строка(н.версия) || !строка(н.статус) || !строка(н.автор)) return null;
  if (!Array.isArray(н.махраджи) || !Array.isArray(н.буквы) || !Array.isArray(н.области)) return null;
  const махраджи: Махрадж[] = [];
  for (let i = 0; i < н.махраджи.length; i++) {
    const м = н.махраджи[i] as Record<string, unknown> | null;
    if (!м || !строка(м.id) || м.номер !== i + 1 || !строка(м.область) || !схема(м.схема)) return null;
    const ар = м.арабский as Record<string, unknown> | null;
    if (!ар || !строка(ар.название) || (ар.стих !== undefined && !строка(ар.стих))) return null;
    const название = тексты(м.название);
    const описание = тексты(м.описание);
    const подпись = тексты(м.подпись);
    const п = м.подсветка as Record<string, unknown> | null;
    const что = п ? тексты(п.что) : null;
    if (!название || !описание || !подпись || !что || !Array.isArray(м.буквы) || !м.буквы.every(строка)) return null;
    const итог: Махрадж = {
      id: м.id,
      номер: i + 1,
      область: м.область,
      арабский: { название: ар.название, ...(ар.стих !== undefined ? { стих: ар.стих as string } : null) },
      название,
      описание,
      подсветка: { что },
      схема: м.схема,
      подпись,
      буквы: м.буквы as string[],
    };
    if (п?.куда !== undefined) {
      const куда = тексты(п.куда);
      if (!куда) return null;
      итог.подсветка.куда = куда;
    }
    if (м.лакаб !== undefined) {
      if (!строка(м.лакаб)) return null;
      итог.лакаб = м.лакаб;
    }
    for (const поле of ['условие', 'гунна', 'подписьСверху'] as const) {
      if (м[поле] === undefined) continue;
      const т = тексты(м[поле]);
      if (!т) return null;
      итог[поле] = т;
    }
    if (м.схемаСверху !== undefined) {
      if (!схема(м.схемаСверху) || !итог.подписьСверху) return null;
      итог.схемаСверху = м.схемаСверху;
    }
    махраджи.push(итог);
  }
  const ids = new Set(махраджи.map((м) => м.id));
  const буквы: БукваМахраджа[] = [];
  for (let i = 0; i < н.буквы.length; i++) {
    const б = н.буквы[i] as Record<string, unknown> | null;
    if (!б || !строка(б.id) || б.номер !== i + 1 || !строка(б.знак) || б.id !== МАНИФЕСТ_МАХРАДЖЕЙ.буквы[i]) return null;
    const имена = б.название as Record<string, unknown> | null;
    if (!имена || !строка(имена.ru) || !строка(имена.kk) || !строка(имена.uz) || !строка(имена.en)) return null;
    const основа = запись(б, ids);
    if (!основа) return null;
    const итог: БукваМахраджа = {
      ...основа,
      id: б.id,
      номер: i + 1,
      знак: б.знак,
      название: { ru: имена.ru, kk: имена.kk, uz: имена.uz, en: имена.en },
    };
    if (б.состав !== undefined) {
      if (!Array.isArray(б.состав) || !б.состав.every(строка)) return null;
      итог.состав = б.состав as string[];
    }
    for (const доп of ['лин', 'мадд', 'гунна'] as const) {
      if (б[доп] === undefined) continue;
      const з = запись(б[доп], ids);
      if (!з) return null;
      итог[доп] = з;
    }
    буквы.push(итог);
  }
  if (буквы.length !== МАНИФЕСТ_МАХРАДЖЕЙ.буквы.length) return null;
  const области: Область[] = [];
  for (const о of н.области as unknown[]) {
    const з = о as Record<string, unknown> | null;
    const название = з ? тексты(з.название) : null;
    if (!з || !строка(з.id) || !строка(з.арабский) || !название || !Array.isArray(з.махраджи) || !з.махраджи.every((м) => строка(м) && ids.has(м))) return null;
    области.push({ id: з.id, арабский: з.арабский, название, махраджи: з.махраджи as string[] });
  }
  return { версия: н.версия, статус: н.статус, автор: н.автор, области, махраджи, буквы };
}

export function загрузитьМахраджи(): Promise<Результат<ИндексМахраджей>> {
  return загрузитьФайл(КЛЮЧ_КЭША, МАНИФЕСТ_МАХРАДЖЕЙ.файл, МАНИФЕСТ_МАХРАДЖЕЙ.sha256, проверитьИндекс);
}

export function useМахраджи() {
  return useЗагрузка(КЛЮЧ_КЭША, изКэша<ИндексМахраджей>(КЛЮЧ_КЭША), загрузитьМахраджи);
}

/** Номер буквы для адреса #/makharij/letter?n= — по манифесту, без загрузки индекса. */
export function номерБуквы(id: string): number | null {
  const i = (МАНИФЕСТ_МАХРАДЖЕЙ.буквы as readonly string[]).indexOf(id);
  return i < 0 ? null : i + 1;
}

/** baseUrl сборки ('/aiustaz'), как в src/quran/data.ts. */
function базаСборки(): string {
  try {
    const б = process.env.EXPO_BASE_URL;
    if (typeof б === 'string') return б;
  } catch {
    // нет process в среде — значение по умолчанию
  }
  return '/aiustaz';
}

/** Адрес схемы — свой сервер (CSP img-src 'self'). */
export function адресСхемы(файл: string): string {
  return `${базаСборки()}/makharij/${файл}`;
}

/** Текст махраджа на языке интерфейса: kk — казахский, ru/uz/en — русский (uz и en в данных пока нет). */
export function текстМахраджа(т: ТекстыМахраджа, язык: Язык): string {
  return язык === 'kk' ? т.kk : т.ru;
}

/** Показан ли русский текст вместо языка интерфейса (uz, en) — экран пишет об этом пометку. */
export function поРусски(язык: Язык): boolean {
  return язык === 'uz' || язык === 'en';
}
