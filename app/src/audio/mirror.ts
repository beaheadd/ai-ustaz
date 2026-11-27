/**
 * Своё зеркало аудио Корана: какие издания AlQuran Cloud уже лежат на нашем сервере (aiustaz.pro/aiustaz-audio/).
 *
 * Владелец 27.11.2026: «Весь Коран нам нужно скачать на наши сервера, из наших серверов отдавать… кнопка „Скачать“ по
 * каждому аяту». Сервер (batr-world: deploy/aiustaz-audio-mirror.py, nginx aiustaz.pro) публикует издание только целиком
 * и пишет список /aiustaz-audio/editions.json: { editions: [{ edition: 'ar.husary', bitrate: 128, count: 6236, … }] }.
 * Издание в списке → плеер играет со своего домена (CSP media-src 'self'), иначе — потоком с cdn.islamic.network.
 *
 * Где спрашиваем список: только на своём домене (aiustaz.pro) или с тестовым флагом localStorage
 * «aiustaz:audio-mirror-test» = «1» (e2e на 127.0.0.1). На batr.kz чтение кари выключено — не спрашиваем.
 * Последний полученный список помним на устройстве (ключ aiustaz:quran-audio-mirror.v1 — только имена изданий), чтобы
 * скачанное играло и без сети. Ничего не отправляем: GET без cookie и referrer.
 *
 * Контракт:
 *   ЗЕРКАЛО = '/aiustaz-audio'; ключИздания(cdn) → '128/ar.husary'
 *   разобратьСписок(сырые) → string[] ключей (кривые записи и count ≠ 6236 отбрасываются) — чистая, тест в node
 *   вЗеркале(cdn) → boolean; сЗеркалом(источник) → тот же объект с полем зеркало (тот же объект при повторных вызовах)
 *   загрузитьЗеркало() — один раз за запуск; подписатьсяНаЗеркало(ф) → отписка
 */
import { видХоста } from '../install/platform';
import type { ИсточникЧтения } from './sources';

export const ЗЕРКАЛО = '/aiustaz-audio';
export const КЛЮЧ_ЗЕРКАЛА = 'aiustaz:quran-audio-mirror.v1';
export const КЛЮЧ_ТЕСТА_ЗЕРКАЛА = 'aiustaz:audio-mirror-test';
const ВСЕГО_АЯТОВ = 6236;
const ЭТО_КЛЮЧ = /^(32|40|48|64|128|192)\/[a-z]{2}\.[a-z0-9-]+$/;

type Cdn = { издание: string; битрейт: number };

export function ключИздания(cdn: Cdn): string {
  return cdn.битрейт + '/' + cdn.издание;
}

export function разобратьСписок(сырые: unknown): string[] {
  const д = сырые && typeof сырые === 'object' ? (сырые as { editions?: unknown }).editions : null;
  if (!Array.isArray(д)) return [];
  const итог: string[] = [];
  for (const з of д) {
    if (!з || typeof з !== 'object') continue;
    const { edition, bitrate, count } = з as { edition?: unknown; bitrate?: unknown; count?: unknown };
    if (typeof edition !== 'string' || typeof bitrate !== 'number' || count !== ВСЕГО_АЯТОВ) continue;
    const к = bitrate + '/' + edition;
    if (ЭТО_КЛЮЧ.test(к) && !итог.includes(к)) итог.push(к);
  }
  return итог;
}

function хранилище(): Storage | null {
  try {
    return typeof localStorage !== 'undefined' ? localStorage : null;
  } catch {
    return null;
  }
}

function прочитатьСохранённое(): Set<string> {
  try {
    const з = хранилище()?.getItem(КЛЮЧ_ЗЕРКАЛА);
    const м = з ? (JSON.parse(з) as unknown) : null;
    return new Set(Array.isArray(м) ? м.filter((к): к is string => typeof к === 'string' && ЭТО_КЛЮЧ.test(к)) : []);
  } catch {
    return new Set();
  }
}

let издания: Set<string> = прочитатьСохранённое();
const слушатели = new Set<() => void>();
const сКопиями = new Map<string, ИсточникЧтения>();

/** Спрашивать ли список здесь: свой домен или тестовый флаг (не batr.kz, не натив). */
export function зеркалоЗдесь(): boolean {
  if (typeof window === 'undefined' || typeof fetch !== 'function') return false;
  const вид = видХоста(window.location?.hostname);
  if (вид === 'свой') return true;
  if (вид === 'batr') return false;
  try {
    return хранилище()?.getItem(КЛЮЧ_ТЕСТА_ЗЕРКАЛА) === '1';
  } catch {
    return false;
  }
}

export function вЗеркале(cdn: Cdn | null | undefined): boolean {
  return !!cdn && зеркалоЗдесь() && издания.has(ключИздания(cdn));
}

/** Источник со своим зеркалом, если издание опубликовано; иначе тот же источник (поток с CDN). */
export function сЗеркалом<И extends ИсточникЧтения | null>(и: И): И {
  if (!и || !и.cdn || !вЗеркале(и.cdn)) return и;
  const ключ = и.id + '|' + ключИздания(и.cdn);
  let к = сКопиями.get(ключ);
  if (!к || к.атрибуция !== и.атрибуция) {
    к = { ...и, зеркало: ЗЕРКАЛО };
    сКопиями.set(ключ, к);
  }
  return к as И;
}

export function подписатьсяНаЗеркало(ф: () => void): () => void {
  слушатели.add(ф);
  return () => {
    слушатели.delete(ф);
  };
}

/** Версия списка для useSyncExternalStore (меняется при каждом обновлении). */
let версия = 0;
export function версияЗеркала(): number {
  return версия;
}

let загружено = false;

/** Спросить список изданий у своего сервера (один раз за запуск; без сети — остаётся сохранённый). */
export function загрузитьЗеркало(): void {
  if (загружено || !зеркалоЗдесь()) return;
  загружено = true;
  void (async () => {
    try {
      const ответ = await fetch(ЗЕРКАЛО + '/editions.json', { cache: 'no-cache', credentials: 'omit', referrerPolicy: 'no-referrer' });
      if (!ответ.ok || !(ответ.headers.get('content-type') ?? '').includes('json')) return;
      const новые = new Set(разобратьСписок(await ответ.json()));
      const прежние = [...издания].sort().join(',');
      if ([...новые].sort().join(',') === прежние) return;
      издания = новые;
      try {
        хранилище()?.setItem(КЛЮЧ_ЗЕРКАЛА, JSON.stringify([...новые]));
      } catch {
        // приватный режим — помним до перезагрузки
      }
      версия += 1;
      for (const ф of [...слушатели]) ф();
    } catch {
      // нет сети — остаётся сохранённый список
    }
  })();
}
