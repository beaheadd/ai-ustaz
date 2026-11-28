/**
 * Курсы валют мира к тенге для калькулятора закята — с нашего сервера (server/rates.py, GET /api/zakat/rates).
 *
 * Владелец 28.11.2026: «Должен быть выбор валюты всего мира». Цены золота и серебра — в тенге за 1 г (zakat/prices.ts,
 * Нацбанк РК); в другую валюту пересчитываем по курсу отсюда: официальные курсы Нацбанка РК, затем Банка России и
 * Европейского центрального банка (кросс через доллар по курсу НБ РК), остальные — открытый набор курсов (CC0).
 * Курса нет — валюта остаётся, но цену 1 г человек вводит сам («нет курса — цена 1 г вручную»). Курс не выдумываем.
 * Только своё: относительный адрес (CSP connect-src 'self'), без cookie; только aiustaz.pro (или тестовый флаг
 * aiustaz:zakat-prices-test). Последний принятый ответ — aiustaz:zakat-rates.v1 (без сети — он, с той же датой).
 *
 * Контракт (чистые функции — тест scripts/test-zakat.mjs):
 *   проверитьКурсы(сырое) → КурсыВалют | null — {date, rates: {КОД: [₸ за 1 > 0, 'nbk'|'cbr'|'ecb'|'fx']}, sources:
 *     {источник: {date}}}; неизвестные коды и кривые числа — отбрасываются; без USD — null;
 *   курсВалюты(курсы, код) → { тенге, источник, дата } | null — KZT всегда 1 (Нацбанк РК); нет курса — null;
 *   вВалюте(тенге, курс) → сумма в валюте (тенге ÷ ₸ за 1 единицу);
 *   загрузитьКурсы({ получить?, хост?, хранилище? }) → Promise<{ курсы, откуда: 'сеть' | 'память' } | null>;
 *   сохранённыеКурсы(хранилище?) → КурсыВалют | null.
 */
import { видХоста } from '../install/platform.ts';
import { этоВалюта } from './currency.ts';
import { КЛЮЧ_ТЕСТА_ЦЕН } from './prices.ts';

export type ИсточникКурса = 'nbk' | 'cbr' | 'ecb' | 'fx';
export type КурсыВалют = {
  дата: string;
  курсы: Record<string, [number, ИсточникКурса]>;
  источники: Partial<Record<ИсточникКурса, { дата: string }>>;
};
export type ЗагруженныеКурсы = { курсы: КурсыВалют; откуда: 'сеть' | 'память' };

export const АДРЕС_КУРСОВ = '/api/zakat/rates';
export const КЛЮЧ_КУРСОВ = 'aiustaz:zakat-rates.v1';
const ДАТА = /^\d{4}-\d{2}-\d{2}$/;
const ИСТОЧНИКИ: readonly ИсточникКурса[] = ['nbk', 'cbr', 'ecb', 'fx'];
const этоИсточник = (и: unknown): и is ИсточникКурса => typeof и === 'string' && (ИСТОЧНИКИ as readonly string[]).includes(и);

export function проверитьКурсы(сырое: unknown): КурсыВалют | null {
  if (!сырое || typeof сырое !== 'object') return null;
  const с = сырое as Record<string, unknown>;
  if (typeof с.date !== 'string' || !ДАТА.test(с.date)) return null;
  const р = с.rates;
  if (!р || typeof р !== 'object') return null;
  const курсы: Record<string, [number, ИсточникКурса]> = {};
  for (const [к, з] of Object.entries(р as Record<string, unknown>)) {
    if (!этоВалюта(к) || !Array.isArray(з)) continue;
    const [ч, и] = з as [unknown, unknown];
    if (typeof ч === 'number' && Number.isFinite(ч) && ч >= 1e-6 && ч <= 1e6 && этоИсточник(и)) курсы[к] = [ч, и];
  }
  if (!курсы.USD) return null;
  const источники: КурсыВалют['источники'] = {};
  const ист = с.sources;
  if (ист && typeof ист === 'object')
    for (const [и, з] of Object.entries(ист as Record<string, unknown>)) {
      const д = (з as { date?: unknown } | null)?.date;
      if (этоИсточник(и) && typeof д === 'string' && ДАТА.test(д)) источники[и] = { дата: д };
    }
  return { дата: с.date, курсы, источники };
}

export function курсВалюты(курсы: КурсыВалют | null, код: string): { тенге: number; источник: ИсточникКурса; дата: string } | null {
  if (код === 'KZT') return { тенге: 1, источник: 'nbk', дата: курсы?.источники.nbk?.дата ?? курсы?.дата ?? '' };
  const з = курсы?.курсы[код];
  if (!курсы || !з) return null;
  return { тенге: з[0], источник: з[1], дата: курсы.источники[з[1]]?.дата ?? курсы.дата };
}

export function вВалюте(тенге: number, курс: { тенге: number }): number {
  return тенге / курс.тенге;
}

type Хранилище = Pick<Storage, 'getItem' | 'setItem'>;

function хранилищеПоУмолчанию(): Хранилище | null {
  try {
    return typeof window !== 'undefined' ? window.localStorage : null;
  } catch {
    return null;
  }
}

export function сохранённыеКурсы(хранилище: Хранилище | null = хранилищеПоУмолчанию()): КурсыВалют | null {
  try {
    const с = хранилище?.getItem(КЛЮЧ_КУРСОВ);
    const з = с ? (JSON.parse(с) as { версия?: number; курсы?: unknown }) : null;
    return з?.версия === 1 ? проверитьКурсы(з.курсы) : null;
  } catch {
    return null;
  }
}

export async function загрузитьКурсы({
  получить = typeof fetch === 'function' ? fetch : undefined,
  хост = typeof window !== 'undefined' ? window.location?.hostname : undefined,
  хранилище = хранилищеПоУмолчанию(),
}: {
  получить?: (адрес: string, параметры: RequestInit) => Promise<Pick<Response, 'ok' | 'json'>>;
  хост?: string;
  хранилище?: Хранилище | null;
} = {}): Promise<ЗагруженныеКурсы | null> {
  let тест = false;
  try {
    тест = хранилище?.getItem(КЛЮЧ_ТЕСТА_ЦЕН) === '1';
  } catch {
    тест = false;
  }
  if (видХоста(хост) !== 'свой' && !тест) return null;
  const память = (): ЗагруженныеКурсы | null => {
    const к = сохранённыеКурсы(хранилище);
    return к ? { курсы: к, откуда: 'память' } : null;
  };
  if (!получить) return память();
  try {
    const ответ = await получить(АДРЕС_КУРСОВ, { credentials: 'omit', headers: { Accept: 'application/json' } });
    if (!ответ.ok) return память();
    const сырое = await ответ.json();
    const к = проверитьКурсы(сырое);
    if (!к) return память();
    try {
      хранилище?.setItem(КЛЮЧ_КУРСОВ, JSON.stringify({ версия: 1, курсы: { date: к.дата, rates: к.курсы, sources: Object.fromEntries(Object.entries(к.источники).map(([и, з]) => [и, { date: з!.дата }])) } }));
    } catch {
      // хранилище недоступно — курс всё равно применим
    }
    return { курсы: к, откуда: 'сеть' };
  } catch {
    return память();
  }
}
