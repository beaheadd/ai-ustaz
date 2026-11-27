/**
 * «Спросить AI Ustaz» — клиент API и разбор ответа (чистые функции; node снимает типы сам — scripts/test-ask.mjs).
 *
 * Владелец 20.11.2026: «AI Ustaz — значок посередине нижнего меню, там люди могут задавать свои вопросы и получать
 * ответы. Мы загрузим базу знаний, хадисы, Коран, тафсиры … Только с нашей базы данных … чтобы достоверная информация
 * была. Сделай эту функцию, но не выкатывай.» Сервер — server/ask.py (POST /api/ask/v1, docs/дизайн/08-спросить-устаза.md).
 *
 * Контракт:
 *   спроситьВключено() → boolean — свой домен aiustaz.pro (всегда) или сборка с EXPO_PUBLIC_ASK=1; на batr.kz — никогда
 *     (тот же принцип, что у проверки голосом: speech/flag.ts).
 *   спроситьРазрешеноДля(хост, флаг) → boolean — чистая функция для теста.
 *   async спросить(вопрос, язык, { fetch?, signal? }) → ИтогВопроса:
 *     { ок: true, ответ: ОтветУстаза } | { ок: false, причина: 'вопрос' | 'лимит' | 'нет-базы' | 'нет-связи' | 'сбой' }.
 *     В запросе — только { q, lang }: без истории, без идентификаторов, без координат.
 *   разобратьОтвет(данные) → ОтветУстаза | null — строгая проверка формы. Защита второй линии (сервер проверяет сам):
 *     в тексте ответа и в полях источников, кроме «арабский» у хадиса, НЕТ арабского письма (правило 1: арабский текст,
 *     похожий на Коран, в выходе ИИ — блокировать; аят приложение показывает само из копии Tanzil по ссылке «сура:аят»);
 *     у хадиса обязательны источник и степень с тем, кто её дал (правило 2), иначе источник отбрасывается; текст ответа
 *     с арабским письмом заменяется шаблоном (ответ остаётся, источники — тоже).
 *   ссылкаАята(строка) → { сура, аят } | null — «2:255» (1…114, аят ≥ 1).
 *   МИН_ВОПРОС = 3, МАКС_ВОПРОС = 500 (символов после обрезки).
 * Без импортов кода (проверяется в node).
 */

export type ВидОтвета = 'ответ' | 'нет-в-базе' | 'к-имаму' | 'вне-темы';
export type ВидИсточника = 'коран' | 'хадис' | 'тафсир' | 'статья' | 'справка';
export type ЯзыкВопроса = 'ru' | 'kk' | 'uz' | 'en';

export type ИсточникОтвета = {
  id: string;
  вид: ВидИсточника;
  заголовок: string;
  ссылка: string | null;
  текст: string;
  /** Только у хадиса — дословно из базы. */
  арабский: string | null;
  источник: string;
  степень: string | null;
  кто_оценил: string | null;
  черновик: boolean;
  версия: string;
};

export type ОтветУстаза = {
  вид: ВидОтвета;
  режим: 'поиск' | 'ии' | 'фото';
  /** 'аят' — «как читается аят 2:255»: приложение показывает аят из своей копии Tanzil, правила таджвида и чтеца. */
  намерение: 'аят' | null;
  /** Только у ответа на фото: распознанный текст без арабского (что сервер понял на фото). */
  распознано: string | null;
  /** null — текст не прошёл проверку (показываем шаблон экрана). */
  текст: string | null;
  источники: ИсточникОтвета[];
  черновик: boolean;
};

export type ПричинаОтказа = 'вопрос' | 'лимит' | 'нет-базы' | 'нет-связи' | 'сбой';
export type ИтогВопроса = { ок: true; ответ: ОтветУстаза } | { ок: false; причина: ПричинаОтказа };

export const МИН_ВОПРОС = 3;
export const МАКС_ВОПРОС = 500;
export const АДРЕС_API = '/api/ask/v1';
const ТАЙМАУТ_МС = 25_000;
const МАКС_ИСТОЧНИКОВ = 8;

const ВИДЫ: readonly ВидОтвета[] = ['ответ', 'нет-в-базе', 'к-имаму', 'вне-темы'];
const ВИДЫ_ИСТОЧНИКОВ: readonly ВидИсточника[] = ['коран', 'хадис', 'тафсир', 'статья', 'справка'];
/** Арабское письмо: основной блок, дополнение, расширенный-А, формы представления А и Б. */
const АРАБСКОЕ = /[؀-ۿݐ-ݿࢠ-ࣿﭐ-﷿ﹰ-﻿]/;

export const СВОИ_ДОМЕНЫ_СПРОСИТЬ = ['aiustaz.pro', 'www.aiustaz.pro'];

export function спроситьРазрешеноДля(хост: string, флаг: string | undefined): boolean {
  const х = String(хост ?? '').trim().toLowerCase().replace(/\.+$/, '');
  if (!х) return false;
  if (х === 'batr.kz' || х.endsWith('.batr.kz')) return false;
  if (СВОИ_ДОМЕНЫ_СПРОСИТЬ.includes(х)) return true;
  return флаг === '1';
}

/** Флаг сборки. Обращение — строго `process.env.EXPO_PUBLIC_ASK`: Expo заменяет именно это выражение. */
function флагСборки(): string | undefined {
  try {
    return process.env.EXPO_PUBLIC_ASK;
  } catch {
    return undefined;
  }
}

export function спроситьВключено(): boolean {
  if (typeof window === 'undefined' || typeof window.location?.hostname !== 'string') return false;
  return спроситьРазрешеноДля(window.location.hostname, флагСборки());
}

export function ссылкаАята(строка: string | null | undefined): { сура: number; аят: number; до: number } | null {
  const м = /^(\d{1,3}):(\d{1,3})(?:-(\d{1,3}))?$/.exec(String(строка ?? '').trim());
  if (!м) return null;
  const сура = Number(м[1]);
  const аят = Number(м[2]);
  const до = м[3] ? Number(м[3]) : аят;
  return сура >= 1 && сура <= 114 && аят >= 1 && аят <= 286 && до >= аят && до - аят <= 20 ? { сура, аят, до } : null;
}

const строка = (з: unknown, макс: number): string | null => (typeof з === 'string' && з.trim() ? з.trim().slice(0, макс) : null);
const строкаИлиNull = (з: unknown, макс: number): string | null | undefined => (з === null || з === undefined ? null : typeof з === 'string' ? з.trim().slice(0, макс) || null : undefined);

function разобратьИсточник(с: unknown): ИсточникОтвета | null {
  const д = с as Record<string, unknown> | null;
  if (!д || typeof д !== 'object') return null;
  const id = строка(д.id, 80);
  const вид = д.вид as ВидИсточника;
  const заголовок = строка(д.заголовок, 200);
  const текст = typeof д.текст === 'string' ? д.текст.trim().slice(0, 4000) : null;
  const источник = строка(д.источник, 300);
  const ссылка = строкаИлиNull(д.ссылка, 120);
  const арабский = строкаИлиNull(д.арабский, 4000);
  const степень = строкаИлиNull(д.степень, 120);
  const кто = строкаИлиNull(д.кто_оценил, 200);
  const версия = typeof д.версия === 'string' ? д.версия.slice(0, 40) : typeof д.версия === 'number' ? String(д.версия) : '';
  if (!id || !ВИДЫ_ИСТОЧНИКОВ.includes(вид) || !заголовок || текст === null || !источник) return null;
  if (ссылка === undefined || арабский === undefined || степень === undefined || кто === undefined) return null;
  if (typeof д.черновик !== 'boolean') return null;
  // Правило 1: арабское письмо — только у хадиса и только в поле «арабский» (дословно из базы). Коран — по ссылке.
  if ([заголовок, текст, источник, ссылка ?? '', степень ?? '', кто ?? ''].some((т) => АРАБСКОЕ.test(т))) return null;
  if (арабский && вид !== 'хадис') return null;
  if (вид === 'коран' && !ссылкаАята(ссылка)) return null;
  // Правило 2: хадис — со сборником/номером (ссылка), степенью и тем, кто её дал.
  if (вид === 'хадис' && (!ссылка || !степень || !кто)) return null;
  return { id, вид, заголовок, ссылка, текст, арабский, источник, степень, кто_оценил: кто, черновик: д.черновик, версия };
}

export function разобратьОтвет(данные: unknown): ОтветУстаза | null {
  const д = данные as Record<string, unknown> | null;
  if (!д || typeof д !== 'object') return null;
  if (!ВИДЫ.includes(д.вид as ВидОтвета)) return null;
  if (д.режим !== 'поиск' && д.режим !== 'ии' && д.режим !== 'фото') return null;
  if (typeof д.текст !== 'string' || !Array.isArray(д.источники)) return null;
  const сырой = д.текст.trim().slice(0, 2000);
  const текст = сырой && !АРАБСКОЕ.test(сырой) ? сырой : null;
  const источники = д.источники
    .slice(0, МАКС_ИСТОЧНИКОВ)
    .map(разобратьИсточник)
    .filter((и): и is ИсточникОтвета => и !== null);
  const намерение = д.намерение === 'аят' && источники.some((и) => и.вид === 'коран') ? 'аят' : null;
  const распознаноСырое = typeof д.распознано === 'string' ? д.распознано.trim().slice(0, МАКС_ВОПРОС) : '';
  const распознано = распознаноСырое && !АРАБСКОЕ.test(распознаноСырое) ? распознаноСырое : null;
  return {
    вид: д.вид as ВидОтвета,
    режим: д.режим,
    намерение,
    распознано,
    текст,
    источники,
    черновик: д.черновик === true || источники.some((и) => и.черновик),
  };
}

type Fetch = (адрес: string, параметры: { method: string; headers: Record<string, string>; body: string; signal?: AbortSignal }) => Promise<{ status: number; json(): Promise<unknown> }>;

export async function спросить(вопрос: string, язык: ЯзыкВопроса, о: { fetch?: Fetch; signal?: AbortSignal } = {}): Promise<ИтогВопроса> {
  const q = вопрос.trim();
  if (q.length < МИН_ВОПРОС || q.length > МАКС_ВОПРОС) return { ок: false, причина: 'вопрос' };
  const получить = о.fetch ?? (globalThis.fetch as unknown as Fetch | undefined);
  if (!получить) return { ок: false, причина: 'нет-связи' };
  const таймаут = typeof AbortController === 'function' ? new AbortController() : null;
  const таймер = таймаут ? setTimeout(() => таймаут.abort(), ТАЙМАУТ_МС) : null;
  о.signal?.addEventListener?.('abort', () => таймаут?.abort());
  try {
    const ответ = await получить(АДРЕС_API, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ q, lang: язык }),
      signal: таймаут?.signal,
    });
    if (ответ.status === 429) return { ок: false, причина: 'лимит' };
    if (ответ.status === 400) return { ок: false, причина: 'вопрос' };
    if (ответ.status === 503) return { ок: false, причина: 'нет-базы' };
    if (ответ.status !== 200) return { ок: false, причина: 'сбой' };
    const р = разобратьОтвет(await ответ.json());
    return р ? { ок: true, ответ: р } : { ок: false, причина: 'сбой' };
  } catch {
    return { ок: false, причина: 'нет-связи' };
  } finally {
    if (таймер) clearTimeout(таймер);
  }
}

// ───────────── возможности, «Пожаловаться», голос, фото (владелец 27.11.2026: чат «как у Айалема») ─────────────

export type ВозможностиЧата = { голос: boolean; фото: boolean };
type FetchЛюбой = (адрес: string, параметры?: { method?: string; headers?: Record<string, string>; body?: unknown; signal?: AbortSignal }) => Promise<{ status: number; json(): Promise<unknown> }>;

function получатель(f?: FetchЛюбой): FetchЛюбой | null {
  return f ?? ((globalThis.fetch as unknown as FetchЛюбой | undefined) || null);
}

/** GET /api/ask/health → { голос, фото }: 🎤 и 📷 показываем, только если сервер их объявил. Ошибка — всё выключено. */
export async function возможностиЧата(о: { fetch?: FetchЛюбой } = {}): Promise<ВозможностиЧата> {
  const f = получатель(о.fetch);
  if (!f) return { голос: false, фото: false };
  try {
    const р = await f('/api/ask/health', { method: 'GET' });
    if (р.status !== 200) return { голос: false, фото: false };
    const д = (await р.json()) as Record<string, unknown>;
    return { голос: д?.голос === true, фото: д?.фото === true };
  } catch {
    return { голос: false, фото: false };
  }
}

export type ПричинаЖалобы = 'неверно' | 'непонятно' | 'другое';

/** POST /api/ask/report: только id ответа, причина, комментарий и id записей базы — без текста вопроса. */
export async function пожаловаться(
  ответ: string,
  причина: ПричинаЖалобы,
  комментарий: string,
  источники: readonly string[],
  о: { fetch?: FetchЛюбой } = {},
): Promise<boolean> {
  const f = получатель(о.fetch);
  if (!f) return false;
  const тело: Record<string, unknown> = { ответ, причина, источники: источники.filter((и) => /^[a-z0-9][a-z0-9._-]{1,79}$/.test(и)).slice(0, 8) };
  const к = комментарий.trim().slice(0, 500);
  if (к) тело.комментарий = к;
  try {
    const р = await f('/api/ask/report', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(тело) });
    return р.status === 200;
  } catch {
    return false;
  }
}

export type ИтогГолоса = { ок: true; текст: string } | { ок: false; причина: 'пусто' | 'лимит' | 'выключено' | 'большой' | 'нет-связи' | 'сбой' };

/** POST /api/ask/voice?lang=… (тело — запись): распознаёт НАШ сервер в РК; текст — в поле ввода, человек правит. */
export async function голосом(запись: Blob, язык: ЯзыкВопроса, о: { fetch?: FetchЛюбой } = {}): Promise<ИтогГолоса> {
  const f = получатель(о.fetch);
  if (!f) return { ок: false, причина: 'нет-связи' };
  const тип = (запись.type || 'audio/webm').split(';')[0].replace(/^video\//, 'audio/');
  try {
    const р = await f('/api/ask/voice?lang=' + язык, { method: 'POST', headers: { 'Content-Type': тип }, body: запись });
    if (р.status === 200) {
      const д = (await р.json()) as Record<string, unknown>;
      const т = typeof д?.текст === 'string' ? д.текст.trim().slice(0, МАКС_ВОПРОС) : '';
      return т ? { ок: true, текст: т } : { ок: false, причина: 'пусто' };
    }
    if (р.status === 422) return { ок: false, причина: 'пусто' };
    if (р.status === 429) return { ок: false, причина: 'лимит' };
    if (р.status === 404) return { ок: false, причина: 'выключено' };
    if (р.status === 413) return { ок: false, причина: 'большой' };
    return { ок: false, причина: 'сбой' };
  } catch {
    return { ок: false, причина: 'нет-связи' };
  }
}

/** POST /api/ask/photo?lang=… (тело — сжатое на телефоне JPEG ≤ 2 МБ): OCR на нашем сервере; ответ — как у вопроса. */
export async function фотографией(картинка: Blob, язык: ЯзыкВопроса, о: { fetch?: FetchЛюбой } = {}): Promise<ИтогВопроса> {
  const f = получатель(о.fetch);
  if (!f) return { ок: false, причина: 'нет-связи' };
  try {
    const р = await f('/api/ask/photo?lang=' + язык, { method: 'POST', headers: { 'Content-Type': картинка.type || 'image/jpeg' }, body: картинка });
    if (р.status === 429) return { ок: false, причина: 'лимит' };
    if (р.status === 503) return { ок: false, причина: 'нет-базы' };
    if (р.status !== 200) return { ок: false, причина: 'сбой' };
    const ответ = разобратьОтвет(await р.json());
    return ответ ? { ок: true, ответ } : { ок: false, причина: 'сбой' };
  } catch {
    return { ок: false, причина: 'нет-связи' };
  }
}
