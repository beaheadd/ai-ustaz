/**
 * Официальные таблицы времени намаза на устройстве: загрузка с нашего сервера, хранение на телефоне, подписка экранов.
 *
 * Решение владельца 20.11.2026: «Время намаза Казахстан, Узбекистан бери из официальных источников… один в один».
 * Разбор и проверка — prayer/official.ts; сервер — server/prayer.py (GET /api/prayer/official).
 *
 * Контракт:
 *   таблицаОфициальная(src, id, год) → ТаблицаОфициальная | null — синхронно из памяти (после загрузки из хранилища).
 *   подготовитьОфициальное(место, день) — для места KZ/UZ (prayer/official.ts пунктОфициальный): взять таблицу года из
 *     памяти или localStorage; нет — запросить у сервера ОДИН раз; в декабре — и следующий год. Запрос — только на своём
 *     домене aiustaz.pro (install/platform видХоста): на batr.kz, localhost и без сети — ничего, остаётся свой расчёт.
 *     Через 7 дней — перепроверка с If-None-Match (304 — тело не качается). 404 not_ready (сервер ещё скачивает) —
 *     повтор не раньше чем через 3 мин; 404 no_official (у ведомства нет таблицы пункта) — через сутки; сеть/ошибка —
 *     через 10 мин (в пределах открытой страницы).
 *   useВерсияОфициальных() → число: растёт, когда появилась или сменилась таблица (перерисовка карточки, расписания).
 *   версияОфициальных() — то же без React (ключ кэша prayer/hooks.ts).
 * Хранение: localStorage 'aiustaz:prayer-official.v1' = { версия: 1, таблицы: { 'dumk:almaty:2026': { т, получено } } },
 * не больше 4 таблиц (место сейчас и прошлое, этот и следующий год). Ошибки хранилища (приватный режим) — только память.
 * На сервер уходит только src, id пункта из списка и год — без координат, cookie и Referer (CSP connect-src 'self').
 * Нативно относительного адреса нет — как у Корана: TODO — адрес своего домена.
 */
import { useSyncExternalStore } from 'react';
import { Platform } from 'react-native';
import { видХоста } from '../install/platform';
import { пунктОфициальный, разобратьТаблицу, type ИсточникОфициальный, type ТаблицаОфициальная } from './official';
import type { Место } from './places';

const КЛЮЧ = 'aiustaz:prayer-official.v1';
const НЕДЕЛЯ = 7 * 86_400_000;
const МАКС_ТАБЛИЦ = 4;
const ТАЙМАУТ_МС = 15_000;

type Запись = { т: ТаблицаОфициальная; получено: number };

const таблицы = new Map<string, Запись>();
const идут = new Set<string>();
const нельзяДо = new Map<string, number>();
let прочитано = false;
let версия = 0;
const слушатели = new Set<() => void>();

const ключТаблицы = (src: string, id: string, год: number) => `${src}:${id}:${год}`;

function хранилище(): Storage | null {
  if (Platform.OS !== 'web') return null;
  try {
    return globalThis.localStorage ?? null;
  } catch {
    return null;
  }
}

function прочитатьХранилище() {
  if (прочитано) return;
  прочитано = true;
  try {
    const сырое = хранилище()?.getItem(КЛЮЧ);
    const д = сырое ? (JSON.parse(сырое) as { версия?: number; таблицы?: Record<string, { т?: unknown; получено?: unknown }> }) : null;
    if (!д || д.версия !== 1 || !д.таблицы) return;
    for (const [к, з] of Object.entries(д.таблицы)) {
      const [src, id, г] = к.split(':');
      const т = з?.т as Record<string, unknown> | undefined;
      // В хранилище — та же форма, что ответ сервера: проверяем заново (могли испортить руками или старой версией).
      const таблица = т && (src === 'dumk' || src === 'umuz') ? разобратьТаблицу(т, src, id, Number(г)) : null;
      if (таблица && typeof з.получено === 'number') таблицы.set(к, { т: таблица, получено: з.получено });
    }
  } catch {
    // испорченное хранилище — работаем с памятью
  }
}

/** Форма ответа сервера (её же храним: разобратьТаблицу проверяет одинаково). */
function вОтвет(т: ТаблицаОфициальная) {
  return { src: т.src, place: т.id, year: т.год, offset: т.смещение, days: т.дни, point: т.точка, method: т.метод, updated: т.обновлено, sha: т.sha };
}

function записатьХранилище() {
  const х = хранилище();
  if (!х) return;
  const записи = [...таблицы.entries()].sort((а, б) => б[1].получено - а[1].получено).slice(0, МАКС_ТАБЛИЦ);
  try {
    х.setItem(КЛЮЧ, JSON.stringify({ версия: 1, таблицы: Object.fromEntries(записи.map(([к, з]) => [к, { т: вОтвет(з.т), получено: з.получено }])) }));
  } catch {
    // переполнено или запрещено — остаётся в памяти до закрытия страницы
  }
}

function разослать() {
  версия += 1;
  for (const с of слушатели) с();
}

export function таблицаОфициальная(src: ИсточникОфициальный, id: string, год: number): ТаблицаОфициальная | null {
  прочитатьХранилище();
  return таблицы.get(ключТаблицы(src, id, год))?.т ?? null;
}

function свойДомен(): boolean {
  if (Platform.OS !== 'web' || typeof location === 'undefined') return false;
  return видХоста(location.hostname) === 'свой';
}

async function загрузить(src: ИсточникОфициальный, id: string, год: number) {
  const к = ключТаблицы(src, id, год);
  const было = таблицы.get(к);
  идут.add(к);
  const отмена = new AbortController();
  const таймер = setTimeout(() => отмена.abort(), ТАЙМАУТ_МС);
  try {
    const о = await fetch(`/api/prayer/official?src=${src}&place=${encodeURIComponent(id)}&year=${год}`, {
      headers: было ? { 'If-None-Match': `"${было.т.sha.slice(0, 32)}"`, Accept: 'application/json' } : { Accept: 'application/json' },
      credentials: 'omit',
      referrerPolicy: 'no-referrer',
      cache: 'no-cache',
      signal: отмена.signal,
    });
    if (о.status === 304 && было) {
      таблицы.set(к, { ...было, получено: Date.now() });
      записатьХранилище();
      return;
    }
    if (о.status === 404) {
      // not_ready — сервер ещё скачивает (повтор через 3 мин); no_official — у ведомства таблицы нет (не спрашивать сутки)
      const ответ = (await о.json().catch(() => null)) as { ошибка?: string } | null;
      нельзяДо.set(к, Date.now() + (ответ?.ошибка === 'no_official' ? 86_400_000 : 3 * 60_000));
      return;
    }
    const т = о.ok && (о.headers.get('content-type') ?? '').includes('json') ? разобратьТаблицу(await о.json(), src, id, год) : null;
    if (!т) {
      нельзяДо.set(к, Date.now() + 10 * 60_000);
      return;
    }
    таблицы.set(к, { т, получено: Date.now() });
    записатьХранилище();
    if (!было || было.т.sha !== т.sha) разослать();
  } catch {
    нельзяДо.set(к, Date.now() + 10 * 60_000); // нет сети — свой расчёт, попробуем позже
  } finally {
    clearTimeout(таймер);
    идут.delete(к);
  }
}

function нужна(src: ИсточникОфициальный, id: string, год: number, сейчас: number): boolean {
  const к = ключТаблицы(src, id, год);
  if (идут.has(к) || (нельзяДо.get(к) ?? 0) > сейчас) return false;
  const з = таблицы.get(к);
  return !з || сейчас - з.получено > НЕДЕЛЯ;
}

/** день — 'ГГГГ-ММ-ДД' места (сегодня). */
export function подготовитьОфициальное(место: Pick<Место, 'id' | 'вид' | 'страна' | 'ближайшее'>, день: string): void {
  прочитатьХранилище();
  const п = пунктОфициальный(место);
  if (!п || !свойДомен()) return;
  const год = Number(день.slice(0, 4));
  const годы = день.slice(5, 7) === '12' ? [год, год + 1] : [год];
  const сейчас = Date.now();
  for (const г of годы) if (нужна(п.src, п.id, г, сейчас)) void загрузить(п.src, п.id, г);
}

export function версияОфициальных(): number {
  return версия;
}

function подписаться(с: () => void) {
  слушатели.add(с);
  return () => слушатели.delete(с);
}

export function useВерсияОфициальных(): number {
  return useSyncExternalStore(подписаться, версияОфициальных, версияОфициальных);
}
