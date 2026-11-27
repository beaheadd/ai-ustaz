/**
 * «Учимся намазу» (ханафитский мазхаб): загрузка раздела — статический файл сборки, текста в JS нет.
 *
 * Решение владельца 27.11.2026: «Учимся намазу нужно собрать по ханафи». Экраны — screens/NamazLearnScreen.tsx
 * (оглавление) и screens/NamazSectionScreen.tsx (раздел; шаги намаза — по одному, ‹ ›).
 * Откуда: content/namaz/namaz.json → tools/namaz/build_namaz.py → app/public/namaz/namaz.<хэш>.json (dist/namaz).
 * Арабский — дословно из HadeethEnc (фрагменты хадисов) и Tanzil (аяты); фикх, произношение и перевод — черновик,
 * проверяет устаз (правило 11; чек-лист — docs/дизайн/11-намаз.md). Загрузка — общим загрузчиком (src/quran/data.ts:
 * sha256, кэш, «нет связи»), ключ кэша «намаз-учимся».
 * Контракт:
 *   проверитьНамаз(сырые) → РазделНамаза-набор | null — строгая проверка формы (4 языка, ссылки шагов на тексты);
 *   загрузитьНамаз(), useНамаз() → { 'загрузка' } | { 'нет', нетСвязи, причина, повторить } | { 'есть', данные }.
 */
import type { Язык } from '../i18n';
import { загрузитьФайл, изКэша, useЗагрузка, type Результат } from '../quran/data';
import { МАНИФЕСТ_НАМАЗА } from './manifest.generated';

export type Тексты = Record<Язык, string>;

export type ТекстНамаза = {
  вид: 'хадис' | 'коран';
  ar: string[];
  название: Тексты;
  произношение: Тексты;
  перевод: Тексты;
  примечание?: Тексты;
  источник: { коран?: string; hadeethenc?: number; степень_ar?: string; степень?: Тексты; передали_ar?: string; передали?: Тексты };
};

export type Группа = { заголовок?: Тексты; пункты: Тексты[]; примечание?: Тексты };
export type Шаг = { заголовок: Тексты; текст: Тексты; тексты?: string[]; раз?: number; примечание?: Тексты };
export type Таблица = { колонки: Тексты[]; строки: { намаз: Тексты; числа: number[] }[] };
export type Раздел = {
  id: string;
  название: Тексты;
  вступление?: Тексты;
  группы?: Группа[];
  таблица?: Таблица;
  шаги?: Шаг[];
  ждёт_устаза?: Тексты;
};
export type Намаз = { версия: string; тексты: Record<string, ТекстНамаза>; разделы: Раздел[]; итог: Тексты };

const ЯЗЫКИ: readonly Язык[] = ['kk', 'ru', 'uz', 'en'];
const КЛЮЧ_КЭША = 'намаз-учимся';

function строка(з: unknown): з is string {
  return typeof з === 'string' && з.trim().length > 0;
}

function тексты(з: unknown): Тексты | null {
  if (!з || typeof з !== 'object') return null;
  const о = з as Record<string, unknown>;
  for (const я of ЯЗЫКИ) if (!строка(о[я])) return null;
  return { kk: о.kk as string, ru: о.ru as string, uz: о.uz as string, en: о.en as string };
}

function необязательные(з: unknown): Тексты | undefined | null {
  return з === undefined ? undefined : тексты(з);
}

/** Строгая проверка формы; null — не показываем ничего (непроверенное не показываем). */
export function проверитьНамаз(сырые: unknown): Намаз | null {
  if (!сырые || typeof сырые !== 'object') return null;
  const н = сырые as Record<string, unknown>;
  if (!строка(н.версия) || !н.тексты || typeof н.тексты !== 'object' || !Array.isArray(н.разделы) || н.разделы.length === 0) return null;
  const итог = тексты(н.итог);
  if (!итог) return null;
  const текстыНамаза: Record<string, ТекстНамаза> = {};
  for (const [id, сырой] of Object.entries(н.тексты as Record<string, unknown>)) {
    const т = сырой as Record<string, unknown> | null;
    if (!т || (т.вид !== 'хадис' && т.вид !== 'коран') || !Array.isArray(т.ar) || !т.ar.length || !т.ar.every(строка)) return null;
    const название = тексты(т.название);
    const произношение = тексты(т.произношение);
    const перевод = тексты(т.перевод);
    const примечание = необязательные(т.примечание);
    const и = т.источник as Record<string, unknown> | null;
    if (!название || !произношение || !перевод || примечание === null || !и) return null;
    if (т.вид === 'коран' ? !строка(и.коран) : typeof и.hadeethenc !== 'number') return null;
    текстыНамаза[id] = {
      вид: т.вид,
      ar: т.ar as string[],
      название,
      произношение,
      перевод,
      ...(примечание ? { примечание } : null),
      источник: и as ТекстНамаза['источник'],
    };
  }
  const разделы: Раздел[] = [];
  for (const сырой of н.разделы as unknown[]) {
    const р = сырой as Record<string, unknown> | null;
    if (!р || !строка(р.id)) return null;
    const название = тексты(р.название);
    const вступление = необязательные(р.вступление);
    const ждёт = необязательные(р.ждёт_устаза);
    if (!название || вступление === null || ждёт === null) return null;
    const раздел: Раздел = { id: р.id, название, ...(вступление ? { вступление } : null), ...(ждёт ? { ждёт_устаза: ждёт } : null) };
    if (р.группы !== undefined) {
      if (!Array.isArray(р.группы)) return null;
      const группы: Группа[] = [];
      for (const г of р.группы as Record<string, unknown>[]) {
        const заголовок = необязательные(г?.заголовок);
        const примечание = необязательные(г?.примечание);
        if (заголовок === null || примечание === null || !Array.isArray(г.пункты) || !г.пункты.length) return null;
        const пункты = (г.пункты as unknown[]).map(тексты);
        if (пункты.some((п) => !п)) return null;
        группы.push({ ...(заголовок ? { заголовок } : null), пункты: пункты as Тексты[], ...(примечание ? { примечание } : null) });
      }
      раздел.группы = группы;
    }
    if (р.таблица !== undefined) {
      const т = р.таблица as Record<string, unknown> | null;
      if (!т || !Array.isArray(т.колонки) || !Array.isArray(т.строки)) return null;
      const колонки = (т.колонки as unknown[]).map(тексты);
      if (колонки.some((к) => !к)) return null;
      const строки = [];
      for (const с of т.строки as Record<string, unknown>[]) {
        const намаз = тексты(с?.намаз);
        const числа = с?.числа;
        if (!намаз || !Array.isArray(числа) || числа.length !== колонки.length - 1 || !числа.every((ч) => Number.isInteger(ч) && ч >= 0 && ч <= 4)) return null;
        строки.push({ намаз, числа: числа as number[] });
      }
      раздел.таблица = { колонки: колонки as Тексты[], строки };
    }
    if (р.шаги !== undefined) {
      if (!Array.isArray(р.шаги) || !р.шаги.length) return null;
      const шаги: Шаг[] = [];
      for (const ш of р.шаги as Record<string, unknown>[]) {
        const заголовок = тексты(ш?.заголовок);
        const текст = тексты(ш?.текст);
        const примечание = необязательные(ш?.примечание);
        if (!заголовок || !текст || примечание === null) return null;
        if (ш.тексты !== undefined && (!Array.isArray(ш.тексты) || !(ш.тексты as unknown[]).every((ид) => строка(ид) && ид in текстыНамаза))) return null;
        if (ш.раз !== undefined && !(Number.isInteger(ш.раз) && (ш.раз as number) >= 1 && (ш.раз as number) <= 33)) return null;
        шаги.push({
          заголовок,
          текст,
          ...(ш.тексты ? { тексты: ш.тексты as string[] } : null),
          ...(ш.раз !== undefined ? { раз: ш.раз as number } : null),
          ...(примечание ? { примечание } : null),
        });
      }
      раздел.шаги = шаги;
    }
    if (!раздел.группы && !раздел.таблица && !раздел.шаги) return null;
    разделы.push(раздел);
  }
  return { версия: н.версия, тексты: текстыНамаза, разделы, итог };
}

export function загрузитьНамаз(): Promise<Результат<Намаз>> {
  return загрузитьФайл(КЛЮЧ_КЭША, МАНИФЕСТ_НАМАЗА.файл, МАНИФЕСТ_НАМАЗА.sha256, проверитьНамаз);
}

export function useНамаз() {
  return useЗагрузка(КЛЮЧ_КЭША, изКэша<Намаз>(КЛЮЧ_КЭША), загрузитьНамаз);
}
